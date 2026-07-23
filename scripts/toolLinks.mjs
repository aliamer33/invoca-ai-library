const INVALID_PLACEHOLDERS = new Set(["—", "-", "–"]);

const PLACEHOLDER_BUILDER_URLS = new Set([
  "https://gumloop.com",
  "https://www.gumloop.com",
  "https://claude.ai",
  "https://www.claude.ai",
]);

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function sanitizeText(value) {
  return String(value ?? "").trim();
}

export function isUsableUrl(value) {
  const trimmed = sanitizeText(value);
  if (!trimmed || INVALID_PLACEHOLDERS.has(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

export function normalizeToolUrl(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const collapsed = line.replace(/\s+/g, " ").trim();
    if (!collapsed) continue;

    if (isUsableUrl(collapsed)) {
      return collapsed;
    }

    const match = collapsed.match(URL_PATTERN);
    if (match) {
      for (const candidate of match) {
        const url = candidate.replace(/[),.;]+$/, "");
        if (isUsableUrl(url)) return url;
      }
    }
  }

  return "";
}

export function isPlaceholderBuilderUrl(value) {
  const normalized = normalizeToolUrl(value).replace(/\/+$/, "").toLowerCase();
  return PLACEHOLDER_BUILDER_URLS.has(normalized);
}

export function resolveBuilderView(value) {
  const url = normalizeToolUrl(value);
  if (!url || isPlaceholderBuilderUrl(url)) return "";
  return url;
}

export function resolveUserView(value) {
  return normalizeToolUrl(value);
}

export function normalizeToolName(name) {
  return sanitizeText(name).toLowerCase();
}
