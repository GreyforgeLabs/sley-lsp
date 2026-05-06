#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const VERSION = "0.0.0-private";
const sleyBin = process.env.SLEY_BIN ?? "sley";

const documents = new Map();

function runSley(args, options = {}) {
  const result = spawnSync(sleyBin, args, { encoding: "utf8", ...options });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function normalizeUri(uri) {
  if (uri.startsWith("file://")) {
    return new URL(uri).pathname;
  }
  return uri;
}

function readText(uri) {
  const path = normalizeUri(uri);
  if (documents.has(uri)) return documents.get(uri).text;
  return readFileSync(path, "utf8");
}

function parsePosition(text, offset) {
  const lines = text.slice(0, offset).split(/\r?\n/);
  const line = lines.length - 1;
  const char = lines[lines.length - 1].length;
  return { line, character: char };
}

function diagnosticsFromCheck(uri) {
  const doc = documents.get(uri);
  const text = doc?.text ?? "";
  const tmpDir = mkdtempSync(join(tmpdir(), "sley-lsp-"));
  const filePath = join(tmpDir, "document.sley");
  writeFileSync(filePath, text);
  const result = runSley(["check", "--json", filePath]);
  rmSync(tmpDir, { recursive: true, force: true });

  const diagnostics = [];
  if (!result.ok) {
    try {
      const report = JSON.parse(result.stdout);
      const findings = report.findings ?? [];
      for (const finding of findings) {
        const start = parseInt(finding.start?.offset ?? 0, 10);
        const end = parseInt(finding.end?.offset ?? start, 10);
        diagnostics.push({
          range: {
            start: parsePosition(text, Number.isFinite(start) ? start : 0),
            end: parsePosition(text, Number.isFinite(end) ? end : start),
          },
          severity: 1,
          message: finding.message ?? "diagnostic",
          source: "sley",
        });
      }
    } catch {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        severity: 1,
        message: "Sley check failed",
        source: "sley",
      });
    }
  }
  return {
    ok: result.ok,
    diagnostics,
    raw: result,
  };
}

function regexSymbols(text) {
  const patterns = [
    { kind: 5, pattern: /\bexport\s+task\s+([A-Za-z_][A-Za-z0-9_]*)/g, type: "Task" },
    { kind: 5, pattern: /\bexport\s+type\s+([A-Za-z_][A-Za-z0-9_]*)/g, type: "Type" },
    { kind: 5, pattern: /\bexport\s+effect\s+([A-Za-z_][A-Za-z0-9_]*)/g, type: "Interface" },
    { kind: 7, pattern: /\b(type|effect|task)\s+([A-Za-z_][A-Za-z0-9_]*)/g, type: "Item" },
  ];
  const symbols = [];
  for (const spec of patterns) {
    for (const match of text.matchAll(spec.pattern)) {
      const name = spec.kind === 5 ? match[1] : match[2];
      const offset = match.index + 0;
      const start = parsePosition(text, offset);
      symbols.push({
        name,
        kind: spec.kind,
        location: {
          uri: "",
          range: {
            start,
            end: { line: start.line, character: start.character + name.length },
          },
        },
      });
    }
  }
  return symbols;
}

function publishDiagnostics(uri) {
  return {
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics: diagnosticsFromCheck(uri).diagnostics,
    },
  };
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
      serverInfo: { name: "sley-lsp", version: VERSION },
    },
  };
}

export function handleJsonRpc(message) {
  if (!message || !message.method) {
    if (message?.id) {
      return { jsonrpc: "2.0", id: message.id, result: null };
    }
    return null;
  }

  if (message.method === "initialize") {
    return initializeResponse(message.id);
  }

  if (message.method === "shutdown") {
    return { jsonrpc: "2.0", id: message.id, result: null };
  }

  if (message.method === "exit") {
    process.exit(0);
  }

  if (message.method === "initialized") {
    return null;
  }

  if (message.method === "textDocument/didOpen") {
    const uri = message.params?.textDocument?.uri;
    const text = message.params?.textDocument?.text ?? "";
    if (uri) {
      documents.set(uri, { text });
      return publishDiagnostics(uri);
    }
    return null;
  }

  if (message.method === "textDocument/didChange") {
    const uri = message.params?.textDocument?.uri;
    const changes = message.params?.contentChanges ?? [];
    if (!uri || !changes.length) return null;
    const base = documents.get(uri)?.text ?? readFileSync(normalizeUri(uri), "utf8");
    const text = (changes.at(-1)?.text ?? changes[0]?.text ?? base);
    documents.set(uri, { text });
    return publishDiagnostics(uri);
  }

  if (message.method === "textDocument/didClose") {
    const uri = message.params?.textDocument?.uri;
    if (uri) documents.delete(uri);
    return null;
  }

  if (message.method === "textDocument/documentSymbol") {
    const uri = message.params?.textDocument?.uri;
    if (!uri) return null;
    const text = readText(uri);
    const symbols = regexSymbols(text).map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      location: {
        uri,
        range: {
          start: symbol.location.range.start,
          end: symbol.location.range.end,
        },
      },
    }));
    return { jsonrpc: "2.0", id: message.id, result: symbols };
  }

  if (message.method === "textDocument/hover") {
    const uri = message.params?.textDocument?.uri;
    const pos = message.params?.position;
    if (!uri || !pos) return { jsonrpc: "2.0", id: message.id, result: { contents: [] } };
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        contents: [
          {
            language: "sley",
            value: "Line " + pos.line + ", character " + pos.character,
          },
        ],
      },
    };
  }

  if (message.method === "sley/checkDocument") {
    const uri = message.params?.textDocument?.uri;
    if (!uri) {
      return { jsonrpc: "2.0", id: message.id, result: { ok: false, error: "missing textDocument.uri" } };
    }
    return { jsonrpc: "2.0", id: message.id, result: diagnosticsFromCheck(uri) };
  }

  if (message.method === "sley/checkTarget") {
    const target = message.params?.target ?? ".";
    const result = runSley(["check", "--json", target]);
    return { jsonrpc: "2.0", id: message.id, result };
  }

  if (message.method === "sley/plan") {
    const target = message.params?.target ?? ".";
    const result = runSley(["plan", "--json", "--graft-templates", target]);
    return { jsonrpc: "2.0", id: message.id, result };
  }

  if (message.method === "textDocument/formatting") {
    const uri = message.params?.textDocument?.uri;
    const text = uri ? readText(uri) : "";
    const result = runSley(["format", "--stdin"], { input: text });
    return { jsonrpc: "2.0", id: message.id, result: result.ok ? [] : [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "" }] };
  }

  return { jsonrpc: "2.0", id: message.id ?? null, result: null };
}

function send(message) {
  if (!message) return;
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

let inputBuffer = "";

function parseMessages() {
  while (true) {
    let headerEnd = inputBuffer.indexOf("\r\n\r\n");
    let header = "";
    let sepLen = 0;
    if (headerEnd >= 0) {
      header = inputBuffer.slice(0, headerEnd);
      sepLen = 4;
    } else {
      headerEnd = inputBuffer.indexOf("\n\n");
      if (headerEnd < 0) return;
      header = inputBuffer.slice(0, headerEnd);
      sepLen = 2;
    }

    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return;

    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + sepLen;
    if (inputBuffer.length - bodyStart < length) return;

    const bodyText = inputBuffer.slice(bodyStart, bodyStart + length);
    inputBuffer = inputBuffer.slice(bodyStart + length);

    let message = null;
    try {
      message = JSON.parse(bodyText);
    } catch {
      continue;
    }

    try {
      const response = handleJsonRpc(message);
      if (response) send(response);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: { code: -32603, message: error instanceof Error ? error.message : "internal error" },
      });
    }
  }
}

process.stdout.on("error", () => process.exit(0));
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  parseMessages();
});

if (process.argv.includes("--help")) {
  console.log("usage: sley-lsp --stdio");
}
