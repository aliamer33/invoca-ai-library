/**
 * One-time migration: Google Sheet JSON export → Supabase tools table
 *
 * Usage:
 *   1. While signed into @invoca.com, open your Apps Script /exec URL in a browser
 *   2. Save the JSON response as sheet-export.json in the project root
 *   3. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Dashboard → Settings → API)
 *   4. npm run migrate:sheet
 *
 * Options:
 *   --file path/to/export.json   (default: sheet-export.json)
 *   --clear                      delete all existing tools before import
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ALLOWED_TYPES = {
  "gumloop agent": "Gumloop Agent",
  gumloop: "Gumloop Agent",
  agent: "Gumloop Agent",
  workflow: "Workflow",
  "multi-agent workflow": "Workflow",
  automation: "Workflow",
  "claude skill": "Claude Skill",
  skill: "Claude Skill",
  claude: "Claude Skill",
};

const STATUS_MAP = {
  live: "Live",
  active: "Live",
  beta: "Beta",
  "in development": "Beta",
  scoping: "Beta",
  deprecated: "Deprecated",
};

const VALID_TYPES = new Set(["Gumloop Agent", "Workflow", "Claude Skill"]);
const VALID_STATUS = new Set(["Live", "Beta", "Deprecated"]);

import {
  isUsableUrl,
  normalizeToolUrl,
  resolveBuilderView,
  resolveUserView,
} from "./toolLinks.mjs";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeType(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return ALLOWED_TYPES[key] || raw;
}

function normalizeStatus(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "Live";
  if (VALID_STATUS.has(trimmed)) return trimmed;
  const mapped = STATUS_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return "Live";
}

function normalizeUpdatedAt(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return new Date().toISOString();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function normalizeSheetTool(raw) {
  const docLink =
    raw.doc_link ||
    raw["documentation link"] ||
    raw.documentation ||
    raw["google doc"];
  const team = raw.team || raw["target user"] || raw.department;
  const tags = [
    raw.tags,
    raw["product id"] ? `product:${raw["product id"]}` : null,
    raw.priority ? `priority:${raw.priority}` : null,
    raw.tool ? `platform:${raw.tool}` : null,
  ]
    .filter(Boolean)
    .join(",")
    .replace(/,,+/g, ",");

  const userView = resolveUserView(
    raw.user_view || raw["user view"] || raw["user link"]
  );

  const builderView = resolveBuilderView(
    raw.builder_view || raw["builder view"] || raw["builder link"] || raw.link
  );

  const cleanedDoc = sanitizeText(docLink);

  return {
    ...raw,
    team: sanitizeText(team) || null,
    tags: tags || raw.tags,
    builder_view: builderView,
    user_view: userView || null,
    doc_link: isUsableUrl(normalizeToolUrl(cleanedDoc)) ? normalizeToolUrl(cleanedDoc) : null,
  };
}

function toRow(tool) {
  const normalized = normalizeSheetTool(tool);
  const type = normalizeType(normalized.type);
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Invalid type "${tool.type}" for tool "${tool.name}"`);
  }

  const status = normalizeStatus(normalized.status);

  for (const field of ["name", "description", "owner"]) {
    if (!normalized[field]?.trim()) {
      throw new Error(`Missing required field "${field}" for tool "${tool.name || "(unnamed)"}"`);
    }
  }

  return {
    name: normalized.name.trim(),
    type,
    description: normalized.description.trim(),
    owner: normalized.owner.trim(),
    team: normalized.team?.trim() || null,
    builder_view: normalized.builder_view.trim(),
    user_view: normalized.user_view?.trim() || null,
    doc_link: normalized.doc_link?.trim() || null,
    status,
    tags: normalized.tags?.trim() || null,
    updated_at: normalizeUpdatedAt(normalized.updated_at),
  };
}

function parseArgs(argv) {
  const args = { file: "sheet-export.json", clear: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === "--clear") {
      args.clear = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadEnvLocal(), ...process.env };

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error("Missing VITE_SUPABASE_URL in .env.local");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local\n" +
        "Get it from Supabase Dashboard → Project Settings → API → service_role (secret)"
    );
    process.exit(1);
  }

  const filePath = join(process.cwd(), args.file);
  if (!existsSync(filePath)) {
    console.error(`Export file not found: ${filePath}\n`);
    console.error("Steps:");
    console.error("  1. Open your Apps Script /exec URL in a browser (signed into Google)");
    console.error("  2. Save the JSON as sheet-export.json in the project root");
    console.error("  3. Run: npm run migrate:sheet");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(filePath, "utf8"));
  const tools = payload.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    console.error("No tools found in export file.");
    process.exit(1);
  }

  const rows = tools.map(toRow);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (args.clear) {
    const { error } = await supabase.from("tools").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.error("Failed to clear existing tools:", error.message);
      process.exit(1);
    }
    console.log("Cleared existing tools.");
  }

  const { data, error } = await supabase.from("tools").insert(rows).select("id, name");
  if (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }

  console.log(`Imported ${data.length} tools into Supabase:`);
  for (const row of data) {
    console.log(`  - ${row.name}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
