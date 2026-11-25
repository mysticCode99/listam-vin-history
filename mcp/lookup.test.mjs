import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { readNativeMessages, sendNativeMessage } from "./bridge.mjs";

const vin = "JM1GL1VM3L1522160";
const popup = "chrome-extension://fixture/popup.html";
const otherSender = "https://www.list.am/item/123";

function event() {
  let listener;
  return { addListener: (fn) => { listener = fn; }, emit: (...args) => listener?.(...args) };
}

function worker(port, record) {
  const onMessage = event();
  const cacheReads = [];
  let connections = 0;
  const context = createContext({
    importScripts: (...files) => files.forEach(run),
    chrome: {
      runtime: {
        onMessage,
        getURL: () => popup,
        connectNative: () => { connections++; return port; },
        sendMessage: async () => {},
      },
      tabs: { onRemoved: event() },
      storage: { local: { get: async (key) => {
        cacheReads.push(key);
        return { [key]: record };
      } } },
    },
  });
  function run(file) {
    runInContext(readFileSync(new URL(`../extension/${file}`, import.meta.url), "utf8"), context);
  }
  run("background.js");
  return {
    send(type, sender = popup) {
      let result;
      onMessage.emit({ type }, { url: sender }, (value) => { result = value; });
      return result;
    },
    cacheReads,
    get connections() { return connections; },
  };
}

test("only the popup connects Codex, and a VIN lookup uses the extension's cache", { timeout: 3000 }, async () => {
  const onMessage = event();
  const onDisconnect = event();
  const posted = Promise.withResolvers();
  const browser = worker({ onMessage, onDisconnect, postMessage: posted.resolve }, {
    status: "found", vin, checkedAt: Date.now(), lot: { vin },
  });

  browser.send("mcpConnect", otherSender);
  assert.equal(browser.connections, 0);
  assert.equal(browser.send("mcpConnect"), "connecting");
  assert.equal(browser.connections, 1);
  onMessage.emit({ type: "ready" });
  assert.equal(browser.send("mcpStatus"), "connected");
  await onMessage.emit({ type: "lookup", id: "bad", vin: "https://example.com/" });
  assert.deepEqual(browser.cacheReads, []);
  await onMessage.emit({ type: "lookup", id: "first", vin });
  const response = await posted.promise;
  assert.equal(response.id, "first");
  assert.equal(response.result.fromCache, true);
  assert.deepEqual(browser.cacheReads, [`vin:${vin}`]);
  onDisconnect.emit();
  assert.notEqual(browser.send("mcpStatus"), "connected");
});

test("the stdio tool exchanges VIN requests with the native browser host", { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "listam-"));
  const children = [];
  t.after(async () => {
    await Promise.all(children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }));
    await rm(directory, { recursive: true, force: true });
  });
  function start(file) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], {
      env: { ...process.env, LISTAM_MCP_STATE_DIR: join(directory, "state") },
      stdio: ["pipe", "pipe", "inherit"],
    });
    children.push(child);
    return child;
  }

  const mcp = start("server.mjs");
  const lines = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]();
  let nextId = 0;
  async function call(method, params) {
    const id = ++nextId;
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    while (true) {
      const line = await lines.next();
      assert.equal(line.done, false, "the MCP server must reply on stdout");
      const message = JSON.parse(line.value);
      if (message.id !== id) continue;
      assert.equal(message.error, undefined, JSON.stringify(message.error));
      return message.result;
    }
  }
  const lookup = (vin) => call("tools/call", { name: "lookup_vin", arguments: { vin } });
  await call("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "listam-test", version: "1.0.0" },
  });
  mcp.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  assert.deepEqual((await call("tools/list", {})).tools.map((tool) => tool.name), ["lookup_vin"]);
  assert.equal((await lookup(vin)).structuredContent.status, "disconnected");
  assert.equal((await lookup("IIIIIIIIIIIIIIIII")).isError, true);

  const host = start("native-host.mjs");
  const fromHost = readNativeMessages(host.stdout);
  const onMessage = event();
  const photo = "https://mercury.bid.cars/1-61989692/photo.jpg";
  const lot = {
    vin, id: "1-61989692", url: "https://bid.cars/en/lot/1-61989692/fixture", odometerMi: 35000,
    primaryDamage: "Front end", saleDocument: "Salvage", images: [photo, "https://images.bid.cars.example/original.jpg"],
  };
  const browser = worker({
    onMessage, onDisconnect: event(), postMessage: (message) => sendNativeMessage(host.stdin, message),
  }, { status: "found", vin, checkedAt: Date.now(), lot });
  browser.send("mcpConnect");
  await onMessage.emit((await fromHost.next()).value);
  assert.equal(browser.send("mcpStatus"), "connected");

  const found = lookup(` ${vin.slice(0, 3).toLowerCase()} ${vin.slice(3).toLowerCase()} `);
  const request = (await fromHost.next()).value;
  assert.equal(request.vin, vin);
  await onMessage.emit(request);
  const { structuredContent } = await found;
  assert.equal(structuredContent.status, "found");
  assert.equal(structuredContent.fromCache, true);
  assert.equal(structuredContent.lot.odometerMi, 35000);
  assert.equal(structuredContent.lot.saleDocument, "Salvage");
  assert.deepEqual(structuredContent.lot.images, [photo]);

  for (const [status, record] of [
    ["not_found", { status: "not_found", vin }],
    ["blocked", { status: "blocked", vin }],
    ["error", { status: "found", vin, lot: { ...lot, vin: "1HGCM82633A000000" } }],
  ]) {
    const waiting = lookup(vin);
    const { id } = (await fromHost.next()).value;
    sendNativeMessage(host.stdin, { type: "lookupResult", id, result: record });
    const data = (await waiting).structuredContent;
    assert.equal(data.status, status);
    if (status === "blocked") assert.equal(data.verificationUrl, "https://bid.cars/");
  }

  const interrupted = lookup(vin);
  await fromHost.next();
  host.stdin.end();
  assert.equal((await interrupted).structuredContent.status, "disconnected");
});
