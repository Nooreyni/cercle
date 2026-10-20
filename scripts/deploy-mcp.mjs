// Copies the shared logic next to the Edge Function entry, then deploys it with the Supabase CLI.
// The function checks the Cercle pairing key itself, so JWT verification is off.
import { copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = "supabase/functions/cercle-mcp";
copyFileSync("www/core.js", dir + "/core.js");
copyFileSync("mcp/tools.js", dir + "/tools.js");
console.log("copied core.js and tools.js into", dir);
if (process.argv.includes("--copy-only")) process.exit(0);
execFileSync("npx", ["supabase", "functions", "deploy", "cercle-mcp", "--no-verify-jwt", "--project-ref", "pxayslaqnuhcbakuaimg"], { stdio: "inherit" });
