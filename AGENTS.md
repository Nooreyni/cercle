# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Cursor…) working on Cercle. Humans: see README.md.

## What Cercle is

A personal app that helps one person keep in touch with the people who matter. Each person has a wanted
contact rhythm; Cercle shows who is drifting away, upcoming birthdays and what to ask next time.
UI language is **French**; code, comments and identifiers are English.

## Map

| Path | Role |
|---|---|
| `www/core.js` | **Pure logic** (ES module, no DOM/storage/network): relationship health, weekly picks, parsers (vCard, Google CSV, WhatsApp exports), calendar matching, AI context. Start here. |
| `www/app.js` | UI, local storage, device sync, Android integrations, assistant UI. Imports `core.js` and `ai.js`. One IIFE, sections marked `// ---------- name ----------`. |
| `www/ai.js` | Assistant engines: Claude (official SDK, user's key), OpenAI-compatible (Ollama, LM Studio, OpenRouter…), Chrome built-in AI. |
| `www/index.html` | Markup + CSS (design tokens at the top of `<style>`). No framework, no build step. |
| `www/sw.js`, `www/manifest.webmanifest` | PWA offline shell. Add new files to `SHELL` in `sw.js`. |
| `mcp/tools.js` | MCP tools + JSON-RPC handler, transport-agnostic, takes `core` as a dependency. |
| `mcp/server.mjs` | Local MCP server over stdio. |
| `supabase/functions/cercle-mcp/index.ts` | Hosted MCP server (Streamable HTTP, stateless JSON). `core.js`/`tools.js` there are generated copies. |
| `supabase/schema.sql` | Sync table + `cercle_sync` function (the only data access path). |
| `android/app/src/main/java/app/cercle/perso/` | Capacitor plugin `CercleNative` (contacts, call log, SMS, calendar, WhatsApp notifications). |
| `test/` | `node:test` suites for core and MCP. `test/helpers.mjs` has an in-memory `cercle_sync`. |
| `scripts/` | `vendor.mjs` (fonts, libs, SDK bundle), `icons.py`, `deploy-mcp.mjs`. |

## Commands

```bash
npm ci
npm test                 # must pass before any commit
npm run vendor           # after changing dependencies
npx cap sync android     # after changing www/
npm run deploy:mcp       # copies core/tools next to the Edge Function, deploys with the Supabase CLI
CERCLE_KEY=<code> npm run mcp   # local MCP server
```

There is no bundler: the browser loads `app.js` as an ES module. Keep it that way.

## Rules of the house

- **Put logic in `core.js`, keep it pure, and test it.** If the app and the MCP server both need a rule, it lives in core.
- **Privacy:** only dates and counts of exchanges are stored from WhatsApp/calls/SMS, never message content.
  `personBrief`/`circleDigest` deliberately omit phones and e-mails; keep it so for anything sent to an AI.
- **Data model** (one JSON object per person, synced as a whole):
  `{ id, name, circle, freq, bdDay, bdMonth, bdYear, phones[], emails[], notes, asks[], log[{d,t,n}], sync{whatsapp|phone|agenda|gmail:{last,days[],n,next?}}, lastSeed, snoozeUntil, demo, createdAt, updatedAt }`.
  Dates are local `YYYY-MM-DD`; `updatedAt` is ISO and decides last-writer-wins.
- **Sync:** every write goes through `save()` in `app.js` (sets `updatedAt`, marks dirty). Never write `localStorage` for people directly.
- **Demo rows** (`demo: true`) never sync and are purged when sync is enabled.
- **Android native code** compiles in CI only (no Android SDK locally). Keep Java changes small, and match Capacitor's
  `@CapacitorPlugin` / `@PermissionCallback` patterns already in `CercleNativePlugin.java`.
- **Claude API:** default model `claude-opus-5-5`, called through the official `@anthropic-ai/sdk` bundled into `www/vendor/anthropic.js`.
  Keep `fallbacks: "default"` and the refusal check.
- UI copy: plain French, tutoiement, short sentences, no emoji as decoration.

## Verifying a change

1. `npm test`
2. Serve `www/` (`npx http-server www` or any static server) and open it; check the browser console.
3. For MCP changes, run `test/mcp.test.mjs` and try `mcp/server.mjs` with a real or fake `CERCLE_KEY`.
