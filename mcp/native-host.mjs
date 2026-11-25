import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { VIN_PATTERN, privateDirectory, readNativeMessages, sendNativeMessage } from "./bridge.mjs";

let pending;
const server = createServer((request, response) => {
  const vin = request.url?.startsWith("/vin/") ? request.url.slice(5) : "";
  if (request.method !== "GET" || !VIN_PATTERN.test(vin)) {
    response.writeHead(400).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (pending) {
    response.end(JSON.stringify({ status: "busy", vin }));
    return;
  }
  const id = randomUUID();
  pending = { id, response };
  response.on("close", () => {
    if (pending?.id === id) pending = undefined;
  });
  sendNativeMessage(process.stdout, { type: "lookup", id, vin });
});

let session;
try {
  session = await mkdtemp(join(await privateDirectory(true), "b-"));
  await once(server.listen(join(session, "lookup.sock")), "listening");
  process.stdout.on("error", () => process.stdin.destroy());
  sendNativeMessage(process.stdout, { type: "ready" });

  for await (const message of readNativeMessages(process.stdin)) {
    if (!pending || message?.type !== "lookupResult" || message.id !== pending.id) continue;
    pending.response.end(JSON.stringify(message.result ?? null));
    pending = undefined;
  }
} catch (error) {
  console.error(`List.am native host: ${error.message}`);
  process.exitCode = 1;
} finally {
  server.close();
  server.closeAllConnections();
  if (session) await rm(session, { recursive: true, force: true });
}
