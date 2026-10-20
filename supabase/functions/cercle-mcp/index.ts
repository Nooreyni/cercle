// Cercle MCP server over Streamable HTTP (stateless JSON responses), hosted as a Supabase Edge Function.
// Connect an AI client to: https://<project>.supabase.co/functions/v1/cercle-mcp?key=<code de synchronisation>
// core.js and tools.js are copies of www/core.js and mcp/tools.js, made by scripts/deploy-mcp.mjs.
import * as core from "./core.js";
import { createServer, rpcStore } from "./tools.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const server = createServer({ core, getStore: async (ctx: { key: string }) => rpcStore({ url: SB_URL, apiKey: SB_KEY, key: ctx.key }) });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, x-cercle-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ name: "cercle", message: "Serveur MCP de Cercle : envoie tes requêtes en POST (MCP Streamable HTTP)." }, 405);
  const url = new URL(req.url);
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = url.searchParams.get("key") || req.headers.get("x-cercle-key") || bearer;
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(key)) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Code Cercle manquant ou invalide : ajoute ?key=TON_CODE à l'adresse du serveur." } }, 401);
  }
  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const batch = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(batch.map((m) => server.handle(m, { key })))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: cors });
  return json(Array.isArray(body) ? out : out[0]);
});
