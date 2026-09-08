import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";

const SERVER_PATH = fileURLToPath(new URL("../src/server.ts", import.meta.url));

interface Server {
  send(message: Record<string, unknown>): void;
  sendRaw(line: string): void;
  nextLine(): Promise<string>;
  close(): void;
}

function startServer(): Server {
  const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
    process.execPath,
    [SERVER_PATH],
    { stdio: ["pipe", "pipe", "inherit"] },
  );

  let buffer = "";
  const pendingLines: string[] = [];
  const waiters: ((line: string) => void)[] = [];

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else pendingLines.push(line);
    }
  });

  return {
    send(message) {
      child.stdin.write(JSON.stringify(message) + "\n");
    },
    sendRaw(line) {
      child.stdin.write(line + "\n");
    },
    nextLine() {
      const pending = pendingLines.shift();
      if (pending !== undefined) return Promise.resolve(pending);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

test("initialize returns protocol info", async () => {
  const server = startServer();
  server.send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, "2024-11-05");
  assert.deepEqual(response.result.capabilities, { tools: {} });
  server.close();
});

test("tools/list returns the convert tool", async () => {
  const server = startServer();
  server.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.result.tools.length, 1);
  assert.equal(response.result.tools[0].name, "convert");
  server.close();
});

test("tools/call converts successfully", async () => {
  const server = startServer();
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "convert", arguments: { value: 1, from: "km", to: "m" } },
  });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.result.content[0].text, "1000");
  assert.equal(response.result.isError, undefined);
  server.close();
});

test("tools/call reports a conversion failure as a tool error, not a protocol error", async () => {
  const server = startServer();
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "convert", arguments: { value: 1, from: "km", to: "kg" } },
  });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.error, undefined);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /dimension mismatch/);
  server.close();
});

test("tools/call rejects an unknown tool name", async () => {
  const server = startServer();
  server.send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "bogus" },
  });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.error.code, -32602);
  server.close();
});

test("tools/call rejects malformed arguments", async () => {
  const server = startServer();
  server.send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "convert", arguments: { value: "1", from: "km", to: "m" } },
  });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.error.code, -32602);
  server.close();
});

test("unrecognized method with an id gets a method-not-found error", async () => {
  const server = startServer();
  server.send({ jsonrpc: "2.0", id: 7, method: "nope" });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.error.code, -32601);
  server.close();
});

test("unrecognized notification (no id) produces no response", async () => {
  const server = startServer();
  server.send({ jsonrpc: "2.0", method: "notifications/whatever" });
  // Follow with a request that does get a response, so its arrival proves
  // the notification above didn't produce a queued line of its own.
  server.send({ jsonrpc: "2.0", id: 8, method: "ping" });
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.id, 8);
  assert.deepEqual(response.result, {});
  server.close();
});

test("malformed JSON produces a parse error", async () => {
  const server = startServer();
  server.sendRaw("not json");
  const response = JSON.parse(await server.nextLine());
  assert.equal(response.error.code, -32700);
  assert.equal(response.id, null);
  server.close();
});
