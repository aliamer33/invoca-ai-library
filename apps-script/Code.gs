/**
 * Invoca AI Library — Google Apps Script JSON API
 *
 * Deploy: Extensions → Apps Script (bound to your Sheet) → paste this file
 * Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Only users in your Google Workspace (invoca.com)
 */

var ALLOWED_TYPES = {
  "gumloop agent": "Gumloop Agent",
  "gumloop": "Gumloop Agent",
  "agent": "Gumloop Agent",
  workflow: "Workflow",
  "claude skill": "Claude Skill",
  skill: "Claude Skill",
  claude: "Claude Skill",
};

var HEADER_ALIASES = {
  name: "name",
  "tool name": "name",
  title: "name",
  type: "type",
  "tool type": "type",
  category: "type",
  description: "description",
  summary: "description",
  owner: "owner",
  "tool owner": "owner",
  contact: "owner",
  team: "team",
  department: "team",
  dept: "team",
  departments: "departments",
  "target teams": "departments",
  audience: "departments",
  builder_view: "builder_view",
  "builder view": "builder_view",
  "builder link": "builder_view",
  link: "builder_view",
  url: "builder_view",
  "tool link": "builder_view",
  user_view: "user_view",
  "user view": "user_view",
  "user link": "user_view",
  doc_link: "doc_link",
  "doc link": "doc_link",
  documentation: "doc_link",
  "documentation link": "doc_link",
  "google doc": "doc_link",
  status: "status",
  tags: "tags",
  updated_at: "updated_at",
  "updated at": "updated_at",
  "last updated": "updated_at",
};

function doGet(e) {
  e = e || {};
  var payload = buildToolsPayload();

  // Embed mode: hidden iframe on localhost posts data to parent (works with Okta SSO)
  if (e.parameter && e.parameter.embed === "1") {
    return embedResponse(payload);
  }

  var callback = e.parameter && e.parameter.callback;

  if (callback) {
    if (!/^[a-zA-Z_$][\w$]*$/.test(callback)) {
      return ContentService.createTextOutput("Invalid callback").setMimeType(
        ContentService.MimeType.TEXT
      );
    }
    return ContentService.createTextOutput(
      callback + "(" + JSON.stringify(payload) + ")"
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse(payload);
}

function buildToolsPayload() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return { tools: [], lastUpdated: new Date().toISOString() };
  }

  var headers = data[0].map(normalizeHeader);
  var tools = [];
  var lastUpdated = "";

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (isEmptyRow(row)) continue;

    var tool = rowToTool(headers, row);
    if (!tool.name || !tool.type) continue;

    tools.push(tool);

    if (tool.updated_at && tool.updated_at > lastUpdated) {
      lastUpdated = tool.updated_at;
    }
  }

  if (!lastUpdated) {
    lastUpdated = new Date().toISOString();
  }

  return { tools: tools, lastUpdated: lastUpdated };
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase();
}

function mapHeader(header) {
  return HEADER_ALIASES[header] || header;
}

function normalizeType(raw) {
  var key = String(raw || "")
    .trim()
    .toLowerCase();
  return ALLOWED_TYPES[key] || raw;
}

function isEmptyRow(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") return false;
  }
  return true;
}

var INVALID_URL_PLACEHOLDERS = { "\u2014": true, "-": true, "\u2013": true };

function isUsableUrl(value) {
  var trimmed = String(value || "").trim();
  if (!trimmed || INVALID_URL_PLACEHOLDERS[trimmed]) return false;
  return /^https?:\/\//i.test(trimmed);
}

function normalizeToolUrl(value) {
  var raw = String(value || "");
  if (!raw.trim()) return "";

  var lines = raw.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var collapsed = String(lines[i] || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!collapsed) continue;
    if (isUsableUrl(collapsed)) return collapsed;

    var match = collapsed.match(/https?:\/\/[^\s<>"']+/gi);
    if (match) {
      for (var j = 0; j < match.length; j++) {
        var candidate = match[j].replace(/[),.;]+$/, "");
        if (isUsableUrl(candidate)) return candidate;
      }
    }
  }

  return "";
}

function normalizeLinkField(value) {
  return normalizeToolUrl(value);
}

function rowToTool(headers, row) {
  var tool = {};

  for (var i = 0; i < headers.length; i++) {
    var field = mapHeader(headers[i]);
    var value = row[i];
    if (value === null || value === undefined || value === "") continue;
    if (field === "type") {
      tool.type = normalizeType(value);
    } else if (
      field === "builder_view" ||
      field === "user_view" ||
      field === "doc_link"
    ) {
      tool[field] = normalizeLinkField(value);
      if (!tool[field]) continue;
    } else {
      tool[field] = String(value).trim();
    }
  }

  return tool;
}

function embedResponse(payload) {
  var html =
    "<!DOCTYPE html><html><body><script>" +
    "(function(){var msg={source:'invoca-ai-library',payload:" +
    JSON.stringify(payload) +
    "};if(window.parent!==window){window.parent.postMessage(msg,'*');}})();" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setTitle("Invoca AI Library")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
