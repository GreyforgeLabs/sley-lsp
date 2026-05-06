#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sleyBin = process.env.SLEY_BIN ?? "sley";

export function runSley(args, options = {}) {
  const result = spawnSync(sleyBin, args, { encoding: "utf8", ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function checkTarget(target) {
  const result = runSley(["check", "--json", target]);
  try {
    return { ...result, report: JSON.parse(result.stdout) };
  } catch {
    return result;
  }
}

export function initializeResponse(id) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      capabilities: {
        textDocumentSync: 1,
        documentFormattingProvider: true,
        documentSymbolProvider: true,
        codeActionProvider: true,
        hoverProvider: true,
      },
      serverInfo: { name: "sley-lsp", version: "0.0.0-private" },
    },
  };
}

function respond(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

export function handleJsonRpc(message) {
  if (message.method === "initialize") return initializeResponse(message.id);
  if (message.method === "shutdown") return { jsonrpc: "2.0", id: message.id, result: null };
  if (message.method === "sley/checkTarget") return { jsonrpc: "2.0", id: message.id, result: checkTarget(message.params?.target ?? ".") };
  return { jsonrpc: "2.0", id: message.id ?? null, result: null };
}

if (process.argv.includes("--help")) {
  console.log("usage: sley-lsp --stdio");
} else if (process.argv.includes("--stdio")) {
  const input = readFileSync(0, "utf8");
  const match = input.match(/\r?\n\r?\n([\s\S]*)$/);
  if (match?.[1]) respond(handleJsonRpc(JSON.parse(match[1])));
}
