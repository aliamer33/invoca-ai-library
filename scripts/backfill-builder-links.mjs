/**
 * Backfill builder_view (and user_view) in Supabase from sheet-export.json
 * Matches sheet rows to DB tools by Product ID (PD), stored in tags as product:PD0001.
 *
 * Usage:
 *   npm run backfill:links
 *   npm run backfill:links -- --file path/to/export.json
 *   npm run backfill:links -- --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  isPlaceholderBuilderUrl,
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

function parseArgs(argv) {
  const args = { file: "sheet-export.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function normalizeProductId(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PRODUCT:/i, "");
}

function extractProductIdFromTags(tags) {
  if (!tags) return "";
  for (const part of String(tags).split(",")) {
    const trimmed = part.trim();
    const match = trimmed.match(/^product:(.+)$/i);
    if (match) return normalizeProductId(match[1]);
  }
  return "";
}

function extractSheetLinks(raw) {
  const builderRaw =
    raw.builder_view ||
    raw["builder view"] ||
    raw["builder link"] ||
    raw.link ||
    raw.url ||
    "";
  const userRaw = raw.user_view || raw["user view"] || raw["user link"] || "";
  const productId = normalizeProductId(
    raw["product id"] || raw.product_id || raw.pd || raw["product id"]
  );

  return {
    name: String(raw.name || "").trim(),
    productId,
    builder_view: resolveBuilderView(builderRaw),
    user_view: resolveUserView(userRaw),
  };
}

async function loadDbTools(supabase) {
  const attempts = [
    {
      select: "id, name, tags, builder_view, user_view",
      builderColumn: "builder_view",
      map: (tool) => ({
        id: tool.id,
        name: tool.name,
        productId: extractProductIdFromTags(tool.tags),
        builder_view: tool.builder_view,
        user_view: tool.user_view,
      }),
    },
    {
      select: "id, name, tags, link, user_view",
      builderColumn: "link",
      map: (tool) => ({
        id: tool.id,
        name: tool.name,
        productId: extractProductIdFromTags(tool.tags),
        builder_view: tool.link,
        user_view: tool.user_view,
      }),
    },
    {
      select: "id, name, tags, link",
      builderColumn: "link",
      map: (tool) => ({
        id: tool.id,
        name: tool.name,
        productId: extractProductIdFromTags(tool.tags),
        builder_view: tool.link,
        user_view: null,
      }),
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase.from("tools").select(attempt.select);
    if (!error) {
      return {
        tools: (data ?? []).map(attempt.map),
        builderColumn: attempt.builderColumn,
        hasUserView: attempt.select.includes("user_view"),
      };
    }
    lastError = error.message;
  }

  throw new Error(lastError ?? "Failed to load tools from Supabase");
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
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const filePath = join(process.cwd(), args.file);
  if (!existsSync(filePath)) {
    console.error(`Export file not found: ${filePath}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(filePath, "utf8"));
  const sheetTools = payload.tools;
  if (!Array.isArray(sheetTools) || sheetTools.length === 0) {
    console.error("No tools found in export file.");
    process.exit(1);
  }

  const sheetByProductId = new Map();
  const ambiguous = [];
  const missingProductId = [];

  for (const raw of sheetTools) {
    const extracted = extractSheetLinks(raw);
    if (!extracted.productId) {
      if (extracted.name) missingProductId.push(extracted.name);
      continue;
    }

    if (sheetByProductId.has(extracted.productId)) {
      ambiguous.push(extracted.productId);
      continue;
    }
    sheetByProductId.set(extracted.productId, extracted);
  }

  if (missingProductId.length > 0) {
    console.warn("Sheet rows missing product id (skipped):");
    for (const name of missingProductId) console.warn(`  - ${name}`);
  }

  if (ambiguous.length > 0) {
    console.warn("Ambiguous duplicate product ids in sheet export (skipped):");
    for (const productId of ambiguous) console.warn(`  - ${productId}`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { tools: dbTools, builderColumn, hasUserView } = await loadDbTools(supabase);
  if (builderColumn === "link") {
    console.warn(
      "Supabase still uses the legacy `link` column. Run `supabase db push` to apply builder_view migration."
    );
  }
  if (!hasUserView) {
    console.warn("Supabase has no `user_view` column yet; only builder links will be updated.");
  }

  let updated = 0;
  let skippedNoSheetUrl = 0;
  let skippedNoSheetMatch = 0;
  let clearedInvalid = 0;
  const stillInvalid = [];

  for (const tool of dbTools ?? []) {
    if (!tool.productId) {
      skippedNoSheetMatch++;
      continue;
    }

    const sheet = sheetByProductId.get(tool.productId);

    if (!sheet) {
      skippedNoSheetMatch++;
      continue;
    }

    const update = {};

    if (isUsableUrl(sheet.builder_view)) {
      if (tool.builder_view !== sheet.builder_view) {
        update.builder_view = sheet.builder_view;
      }
    } else if (
      tool.builder_view &&
      (!isUsableUrl(normalizeToolUrl(tool.builder_view)) ||
        isPlaceholderBuilderUrl(tool.builder_view))
    ) {
      update.builder_view = "";
      clearedInvalid++;
    } else {
      skippedNoSheetUrl++;
      if (
        tool.builder_view &&
        (!isUsableUrl(normalizeToolUrl(tool.builder_view)) ||
          isPlaceholderBuilderUrl(tool.builder_view))
      ) {
        stillInvalid.push(tool.name);
      }
      continue;
    }

    if (hasUserView && isUsableUrl(sheet.user_view)) {
      if (tool.user_view !== sheet.user_view) {
        update.user_view = sheet.user_view;
      }
    }

    if (Object.keys(update).length === 0) continue;

    const dbUpdate =
      builderColumn === "link"
        ? {
            ...(update.builder_view !== undefined
              ? { link: update.builder_view }
              : {}),
            ...(update.user_view !== undefined
              ? { user_view: update.user_view }
              : {}),
          }
        : update;

    if (Object.keys(dbUpdate).length === 0) continue;

    if (args.dryRun) {
      console.log(`[dry-run] ${tool.productId} ${tool.name}:`, dbUpdate);
      updated++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("tools")
      .update(dbUpdate)
      .eq("id", tool.id);

    if (updateError) {
      console.error(`Failed to update ${tool.productId} "${tool.name}":`, updateError.message);
      continue;
    }

    console.log(`Updated ${tool.productId} "${tool.name}":`, dbUpdate);
    updated++;
  }

  console.log("\nSummary:");
  console.log(`  Updated: ${updated}${args.dryRun ? " (dry run)" : ""}`);
  console.log(`  Skipped (no usable URL in sheet): ${skippedNoSheetUrl}`);
  console.log(`  Skipped (no sheet match): ${skippedNoSheetMatch}`);
  console.log(`  Cleared invalid builder_view: ${clearedInvalid}`);
  if (stillInvalid.length > 0) {
    console.log(`  Still invalid after backfill: ${stillInvalid.length}`);
    for (const name of stillInvalid.slice(0, 10)) console.log(`    - ${name}`);
    if (stillInvalid.length > 10) {
      console.log(`    ... and ${stillInvalid.length - 10} more`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
