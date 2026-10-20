# Architecture

```
            ┌────────────── Android app (Capacitor) ──────────────┐
            │  CercleNative (Java): contacts, call log, SMS,      │
            │  calendar, WhatsApp notifications → dates only      │
            │  LocalNotifications: reminders                      │
            └───────────────┬─────────────────────────────────────┘
                            │ same web code
  ┌──────────── www/ (PWA: iPhone, desktop, Android browser) ───────────┐
  │ app.js  UI · localStorage · Sync · imports · assistant UI           │
  │ core.js pure rules (health, picks, parsers, AI context)  ◄──┐       │
  │ ai.js   Claude SDK · OpenAI-compatible · Chrome built-in AI │       │
  └──────────────┬──────────────────────────────────────────────┼───────┘
                 │ HTTPS  cercle_sync(key, since, changes)       │ shared
  ┌──────────────▼───────────────┐                     ┌─────────┴────────┐
  │ Supabase (Paris)             │  ◄── HTTPS ──────── │ MCP servers      │
  │ cercle_people (closed table) │                     │ mcp/server.mjs   │ ← Claude Desktop, LM Studio…
  │ cercle_sync() security def.  │                     │ Edge Function    │ ← claude.ai, ChatGPT
  └──────────────────────────────┘                     └──────────────────┘
```

## Sync

- No accounts. A random 32-character pairing key links devices; the database only sees its SHA-256.
- Each person is one row `(space, id, data, updated_at, server_at, deleted)`.
- `cercle_sync` upserts the changes it receives (only if `updated_at` is newer) and returns rows changed since `p_since` (server time).
- Clients keep a dirty list and tombstones, push on change (debounced), on focus, on reconnect and every 5 minutes.

## Relationship health

`ratio = days since last exchange / wanted rhythm`. Bloom ≤ 0.5 < ok ≤ 1 < thirsty ≤ 1.5 < wilted.
"This week" = not snoozed, no meeting planned within 21 days, ratio ≥ 0.85 or birthday within 7 days,
sorted by ratio × circle weight (+ birthday boost), 4 at most. See `core.js`.

## AI

- **In-app assistant** (`ai.js`): message ideas, call prep, note tidying (summary, next questions, facts, birthday), free questions on the circle.
  Context = `personBrief` / `circleDigest` (no phones, no e-mails).
- **MCP** (`mcp/tools.js`): 8 tools (`get_overview`, `get_person`, `search`, `log_contact`, `add_person`, `update_person`, `add_question`, `snooze_person`).
  Writes go through `cercle_sync`, so the apps pick them up on their next sync.
