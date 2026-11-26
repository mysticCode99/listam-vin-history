import { readdir } from "node:fs/promises";
import { get } from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { LOOKUP_TIMEOUT_MS, MAX_MESSAGE_BYTES, VIN_PATTERN, privateDirectory } from "./bridge.mjs";

function lookupOnSocket(socketPath, vin, signal) {
  return new Promise((resolve, reject) => {
    const request = get({ socketPath, path: `/vin/${vin}`, agent: false, signal }, (response) => {
      (async () => {
        if (response.statusCode !== 200) throw new Error("Invalid bridge response.");
        let size = 0;
        const chunks = [];
        for await (const chunk of response) {
          size += chunk.length;
          if (size > MAX_MESSAGE_BYTES) throw new Error("Bridge response too large.");
          chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      })().then(resolve, reject);
    });
    request.on("error", reject);
  });
}

async function lookupInBrowser(vin, signal) {
  try {
    const directory = await privateDirectory();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^b-[a-z0-9]{6}$/i.test(entry.name)) continue;
      try {
        return await lookupOnSocket(join(directory, entry.name, "lookup.sock"), vin, signal);
      } catch (error) {
        if (!["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes(error.code)) throw error;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { status: "disconnected", vin };
}

function safeUrl(value, hosts) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password && !url.port) {
      return url.href;
    }
  } catch (_) {}
}

function auctionRecord(value, fields) {
  if (typeof value?.id !== "string" || !/^[01]-\d+$/.test(value.id)) return;
  const url = safeUrl(value.url, ["bid.cars"]);
  if (!url || !new RegExp(`^(?:/[a-z]{2})?/lot/${value.id}(?:/|$)`).test(new URL(url).pathname)) return;
  const record = { id: value.id, url };
  for (const key of fields) {
    if (typeof value[key] === "string") record[key] = value[key].slice(0, 500);
    if (Number.isFinite(value[key])) record[key] = value[key];
  }
  return record;
}

function result(vin, status, message, details = {}) {
  const data = { status, vin, message, ...details };
  return { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] };
}

function report(vin, data) {
  if (data?.vin !== vin) return result(vin, "error", "The browser returned an unverifiable result.");
  const freshness = {
    ...(Number.isFinite(data.checkedAt) ? { checkedAt: data.checkedAt } : {}),
    fromCache: data.fromCache === true,
  };
  switch (data.status) {
    case "found": {
      const lot = auctionRecord(data.lot, ["title", "auction", "saleDate", "location", "saleDocument",
        "odometerMi", "primaryDamage", "secondaryDamage"]);
      if (!lot || data.lot.vin !== vin) return result(vin, "error", "The auction lot did not confirm this VIN.");
      lot.images = (Array.isArray(data.lot.images) ? data.lot.images : []).slice(0, 30)
        .map((image) => safeUrl(image, ["mercury.bid.cars", "images.bid.cars"])).filter(Boolean);
      const otherLots = (Array.isArray(data.otherLots) ? data.otherLots : []).slice(0, 20)
        .map((row) => auctionRecord(row, ["auction", "saleDate", "odometer", "status"])).filter(Boolean);
      return result(vin, "found", "Auction history found on Bid.Cars.", { ...freshness, lot, otherLots });
    }
    case "not_found":
      return result(vin, "not_found", "No matching auction record was found on Bid.Cars.", freshness);
    case "blocked":
      return result(vin, "blocked", "Open Bid.Cars in the connected browser, complete its human check, then retry.", {
        verificationUrl: "https://bid.cars/",
      });
    case "disconnected":
      return result(vin, "disconnected", "Open the List.am VIN History extension and select Connect Codex.");
    case "busy":
      return result(vin, "busy", "The browser is checking another VIN. Try again when it finishes.");
    default:
      return result(vin, "error", "The browser could not complete the auction lookup. Try again.");
  }
}

function createServer() {
  const server = new McpServer({ name: "listam-vin-history", version: "1.0.0" });
  server.registerTool("lookup_vin", {
    title: "Look up a VIN’s auction history",
    description: "Check Bid.Cars auction history by VIN through the connected List.am VIN History extension. " +
      "Returns damage, title type, mileage, sale details, source lots, and photo links when available. " +
      "Use for a single VIN. Report a no-match as limited to Bid.Cars and ask the user to complete any human check.",
    inputSchema: z.object({ vin: z.string().min(17).max(40).describe("17-character vehicle identification number") }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ vin: input }, ctx) => {
    const vin = input.replace(/\s+/g, "").toUpperCase();
    if (!VIN_PATTERN.test(vin)) {
      return { isError: true, content: [{ type: "text", text: "Enter a 17-character VIN without I, O, or Q." }] };
    }
    const timeout = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
    const signal = ctx?.signal ? AbortSignal.any([timeout, ctx.signal]) : timeout;
    try {
      return report(vin, await lookupInBrowser(vin, signal));
    } catch (error) {
      if (ctx?.signal?.aborted) throw error;
      return timeout.aborted
        ? result(vin, "timeout", "The browser lookup timed out. Try again or check Bid.Cars in the browser.")
        : result(vin, "error", "The local bridge could not complete the VIN lookup. Reconnect the extension and retry.");
    }
  });
  return server;
}

serveStdio(createServer, { onerror: (error) => console.error(error.message) });
