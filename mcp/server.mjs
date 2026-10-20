#!/usr/bin/env node
// Cercle MCP server over stdio, for local AI clients (Claude Desktop, Claude Code, LM Studio, Cursor…).
// Usage: CERCLE_KEY=<code de synchronisation> node mcp/server.mjs
import * as core from "../www/core.js";
import { createServer, rpcStore, SUPABASE } from "./tools.js";

const key = (process.env.CERCLE_KEY || "").trim();
if (!/^[A-Za-z0-9_-]{24,128}$/.test(key)) {
  console.error("CERCLE_KEY manquant ou invalide. Copie ton code depuis Cercle › Synchronisation.");
  process.exit(1);
}
const store = rpcStore({
  url: process.env.CERCLE_SUPABASE_URL || SUPABASE.url,
  apiKey: process.env.CERCLE_SUPABASE_KEY || SUPABASE.key,
  key
});
const server = createServer({ core, getStore: async () => store });

const write = o => process.stdout.write(JSON.stringify(o) + "\n");
let buffer = "", queue = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
    if (!line) continue;
    // answer in arrival order
    queue = queue.then(async () => {
      let msg;
      try { msg = JSON.parse(line); } catch (e) { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
      const batch = Array.isArray(msg) ? msg : [msg];
      const out = (await Promise.all(batch.map(m => server.handle(m)))).filter(Boolean);
      if (out.length) write(Array.isArray(msg) ? out : out[0]);
    });
  }
});
process.stdin.on("end", () => queue.then(() => process.exit(0)));
