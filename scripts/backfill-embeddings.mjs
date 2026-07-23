/**
 * Backfill tool embeddings via the sync-tool-embedding edge function.
 *
 * Usage:
 *   npm run backfill:embeddings
 *
 * Requires in .env.local (or environment):
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  ""
).trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Set VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
  process.exit(1);
}

async function syncTool(toolId) {
  const response = await fetch(`${url}/functions/v1/sync-tool-embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ id: toolId }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload.error ??
      payload.message ??
      response.statusText ??
      `HTTP ${response.status}`;
    return { ok: false, error: message };
  }

  const result = payload.results?.[0];
  if (result && !result.ok) {
    return { ok: false, error: result.error ?? "Sync failed" };
  }

  return { ok: true };
}

const supabase = createClient(url, serviceKey);

const { data: tools, error } = await supabase
  .from("tools")
  .select("id, name")
  .is("embedding", null)
  .order("name");

if (error) {
  console.error("Failed to list tools:", error.message);
  process.exit(1);
}

if (!tools?.length) {
  console.log("All tools already have embeddings — nothing to backfill.");
  process.exit(0);
}

console.log(`Backfilling ${tools.length} tool(s)…`);

let synced = 0;
let failed = 0;
const failures = [];

for (const tool of tools) {
  process.stdout.write(`  ${tool.name}… `);
  const result = await syncTool(tool.id);
  if (result.ok) {
    synced += 1;
    console.log("ok");
  } else {
    failed += 1;
    failures.push({ name: tool.name, error: result.error });
    console.log("failed");
  }
}

console.log(`\nBackfill complete: ${synced} synced, ${failed} failed`);

if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
}
