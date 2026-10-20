import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../www/core.js";
import { createServer, rpcStore } from "../mcp/tools.js";
import { fakeSyncServer, ago } from "./helpers.mjs";

const KEY = "test-key-0123456789abcdefghij";
function setup() {
  const srv = fakeSyncServer();
  const store = rpcStore({ url: "https://example.test", apiKey: "k", key: KEY, fetchImpl: srv.fetchImpl });
  const mcp = createServer({ core, getStore: async () => store });
  let id = 0;
  const call = async (name, args) => (await mcp.handle({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })).result;
  return { srv, store, mcp, call };
}

test("handshake and tool list follow MCP", async () => {
  const { mcp } = setup();
  const init = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.ok(init.result.capabilities.tools);
  assert.equal(await mcp.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await mcp.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = list.result.tools.map(t => t.name);
  assert.deepEqual(names, ["get_overview", "get_person", "search", "log_contact", "add_person", "update_person", "add_question", "snooze_person"]);
  assert.ok(list.result.tools.every(t => t.inputSchema && t.description && !t.handler));
  const unknown = await mcp.handle({ jsonrpc: "2.0", id: 3, method: "nope" });
  assert.equal(unknown.error.code, -32601);
});

test("an AI can add someone, log a call and see the circle change", async () => {
  const { call, store } = setup();
  let r = await call("add_person", { name: "Karim Benali", circle: "proches", birthday: "14/02/1990", notes: "Fan de trail" });
  assert.ok(!r.isError, r.content[0].text);
  r = await call("add_question", { name: "karim", question: "Comment s'est passé le déménagement ?" });
  assert.deepEqual(r.structuredContent.toAsk, ["Comment s'est passé le déménagement ?"]);
  r = await call("log_contact", { name: "Karim", type: "appel", note: "Installé à Lyon", questions_covered: ["déménagement"], questions_next: ["Photos de l'appart ?"] });
  assert.ok(!r.isError, r.content[0].text);
  assert.deepEqual(r.structuredContent.removedQuestions, ["Comment s'est passé le déménagement ?"]);
  const people = await store.load();
  assert.equal(people.length, 1);
  assert.equal(people[0].log[0].n, "Installé à Lyon");
  assert.equal(people[0].bdMonth, 2);
  const overview = (await call("get_overview", {})).structuredContent;
  assert.equal(overview.people[0].status, "En pleine forme");
});

test("tool errors come back as readable results, not crashes", async () => {
  const { call } = setup();
  await call("add_person", { name: "Léa Martin" });
  await call("add_person", { name: "Léa Dubois" });
  const r = await call("get_person", { name: "Léa" });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /Candidats : Léa Martin, Léa Dubois/);
  const dup = await call("add_person", { name: "léa martin" });
  assert.equal(dup.isError, true);
  const bad = await call("log_contact", { name: "Léa Martin", type: "appel", date: "20/10/2026" });
  assert.equal(bad.isError, true);
});

test("changes made by the AI reach the app through sync, and app edits reach the AI", async () => {
  const { srv, store, call } = setup();
  // the app pushes a person the way www/app.js does
  const appPerson = { id: "p1", name: "Maman", circle: "famille", freq: 7, log: [{ d: ago(10), t: "appel" }], updatedAt: new Date(Date.now() - 1000).toISOString() };
  await srv.fetchImpl("", { body: JSON.stringify({ p_key: KEY, p_since: null, p_changes: [{ id: "p1", data: appPerson, updated_at: appPerson.updatedAt }] }) });
  const r = await call("search", { query: "maman" });
  assert.equal(r.structuredContent.results[0].name, "Maman");
  await call("log_contact", { name: "Maman", type: "vu", note: "Déjeuner" });
  const pulled = await (await srv.fetchImpl("", { body: JSON.stringify({ p_key: KEY, p_since: null, p_changes: [] }) })).json();
  assert.equal(pulled.rows[0].data.log[0].n, "Déjeuner");
  assert.equal((await store.load())[0].log.length, 2);
});

test("quick successive writes are never lost", async () => {
  const { call, store } = setup();
  await call("add_person", { name: "Rapide" });
  for (let i = 0; i < 20; i++) await call("add_question", { name: "Rapide", question: "Q" + i });
  assert.equal((await store.load())[0].asks.length, 20);
});
