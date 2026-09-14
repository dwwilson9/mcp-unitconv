#!/usr/bin/env node
import { createInterface } from "node:readline";
import {
  convert,
  BelowAbsoluteZeroError,
  DimensionMismatchError,
  UnknownUnitError,
} from "./units.ts";

// MCP stdio transport: one JSON-RPC message per line, no Content-Length
// framing (that's LSP, not MCP).
const PROTOCOL_VERSION = "2024-11-05";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

const CONVERT_TOOL = {
  name: "convert",
  description:
    "Convert a numeric value between units of length, mass, time or temperature.",
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "number", description: "The value to convert." },
      from: { type: "string", description: "Unit to convert from, e.g. km." },
      to: { type: "string", description: "Unit to convert to, e.g. mi." },
    },
    required: ["value", "from", "to"],
  },
};

function send(message: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function sendResult(id: JsonRpcId, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handleToolsCall(
  id: JsonRpcId,
  params: Record<string, unknown> | undefined,
): void {
  if (params?.name !== "convert") {
    sendError(id, -32602, `unknown tool: ${String(params?.name)}`);
    return;
  }

  const args = params.arguments as Record<string, unknown> | undefined;
  const value = args?.value;
  const from = args?.from;
  const to = args?.to;
  if (
    typeof value !== "number" ||
    typeof from !== "string" ||
    typeof to !== "string"
  ) {
    sendError(
      id,
      -32602,
      "convert requires { value: number, from: string, to: string }",
    );
    return;
  }
  if (!Number.isFinite(value)) {
    sendError(id, -32602, "value must be a finite number");
    return;
  }
  if (from.trim() === "" || to.trim() === "") {
    sendError(id, -32602, "from and to must be non-empty unit strings");
    return;
  }

  try {
    const result = convert(value, from, to);
    sendResult(id, { content: [{ type: "text", text: String(result) }] });
  } catch (err) {
    if (
      err instanceof DimensionMismatchError ||
      err instanceof UnknownUnitError ||
      err instanceof BelowAbsoluteZeroError
    ) {
      // A tool-level failure, not a protocol failure - report it as a
      // successful call whose result is an error, per the MCP tools spec.
      sendResult(id, {
        content: [{ type: "text", text: err.message }],
        isError: true,
      });
      return;
    }
    throw err;
  }
}

function handleRequest(request: JsonRpcRequest): void {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      sendResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "mcp-unitconv", version: "0.1.0" },
      });
      return;
    case "notifications/initialized":
      return;
    case "ping":
      sendResult(id, {});
      return;
    case "tools/list":
      sendResult(id, { tools: [CONVERT_TOOL] });
      return;
    case "tools/call":
      handleToolsCall(id, request.params);
      return;
    default:
      // Notifications (no id) get no response, even when unrecognized.
      if (request.id !== undefined) {
        sendError(id, -32601, `method not found: ${request.method}`);
      }
      return;
  }
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, "parse error");
    return;
  }

  try {
    handleRequest(request);
  } catch (err) {
    sendError(
      request.id ?? null,
      -32603,
      err instanceof Error ? err.message : "internal error",
    );
  }
});
