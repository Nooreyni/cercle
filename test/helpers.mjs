// Test helpers: dates relative to today, and an in-memory stand-in for the cercle_sync SQL function.
import { iso, today0 } from "../www/core.js";

export const ago = n => { const d = today0(); d.setDate(d.getDate() - n); return iso(d); };
export const inDaysDate = n => { const d = today0(); d.setDate(d.getDate() + n); return d; };

// Same rules as supabase/schema.sql: rows per key hash, last writer wins on updated_at, since filters on server time.
export function fakeSyncServer() {
  const spaces = new Map();
  let clock = Date.now();
  async function fetchImpl(url, init) {
    const { p_key, p_since, p_changes = [] } = JSON.parse(init.body);
    if (!p_key || p_key.length < 24) return { ok: false, status: 400, json: async () => ({}) };
    const rows = spaces.get(p_key) || new Map(); spaces.set(p_key, rows);
    const now = new Date(++clock).toISOString();
    for (const c of p_changes) {
      const prev = rows.get(c.id);
      if (!prev || Date.parse(prev.updated_at) < Date.parse(c.updated_at)) rows.set(c.id, { id: c.id, data: c.data, updated_at: c.updated_at, deleted: !!c.deleted, server_at: now });
    }
    const out = [...rows.values()].filter(r => !p_since || r.server_at > p_since).map(({ server_at, ...r }) => r);
    return { ok: true, status: 200, json: async () => ({ now, rows: out }) };
  }
  return { fetchImpl, spaces };
}
