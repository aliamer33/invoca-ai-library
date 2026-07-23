import type { ToolsResponse } from "../types/tool";
import { fetchToolsSupabase } from "./fetchToolsSupabase";
import { isSupabaseConfigured } from "./supabaseClient";

export type ToolsDataSource = "supabase" | "api" | "mock";

const MOCK_URL = "/mock/tools.json";
const EMBED_TIMEOUT_MS = 30_000;
const MESSAGE_SOURCE = "invoca-ai-library";

const TRUSTED_ORIGINS = [
  "https://script.google.com",
  "https://script.googleusercontent.com",
];

function getApiUrl(): string | null {
  const url = import.meta.env.VITE_TOOLS_API_URL?.trim();
  return url || null;
}

function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_ORIGINS.some(
    (trusted) => origin === trusted || origin.endsWith(".googleusercontent.com")
  );
}

/**
 * Loads Apps Script inside a hidden iframe so Google/Okta auth runs in Google's
 * context, then receives sheet data via postMessage.
 */
function fetchViaEmbed(url: string, signal: AbortSignal): Promise<ToolsResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const embedUrl = appendParam(url, "embed", "1");
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Invoca AI Library data");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;";
    iframe.src = embedUrl;

    const timeoutId = window.setTimeout(() => {
      cleanup(
        new Error(
          "Timed out loading Google Sheet data. Sign in to @invoca.com, open your /exec URL in a new tab, then click Refresh now."
        )
      );
    }, EMBED_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;
      const data = event.data as { source?: string; payload?: ToolsResponse };
      if (data?.source !== MESSAGE_SOURCE || !data.payload) return;
      cleanup();
      resolve(data.payload);
    };

    const onAbort = () => {
      cleanup(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = (err?: Error) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
      iframe.remove();
      if (err) reject(err);
    };

    signal.addEventListener("abort", onAbort);
    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
}

/** JSONP fallback when iframe postMessage is blocked */
function fetchJsonp(url: string, signal: AbortSignal): Promise<ToolsResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const callbackName = `invocaAiLib_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const scriptUrl = appendParam(url, "callback", callbackName);
    const win = window as unknown as Record<string, unknown>;

    const cleanup = (err?: Error) => {
      delete win[callbackName];
      script.remove();
      signal.removeEventListener("abort", onAbort);
      if (err) reject(err);
    };

    const onAbort = () => {
      cleanup(new DOMException("Aborted", "AbortError"));
    };

    win[callbackName] = (data: ToolsResponse) => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onerror = () => {
      cleanup(
        new Error(
          "Could not load Apps Script (JSONP). Redeploy Code.gs with embed + callback support."
        )
      );
    };

    signal.addEventListener("abort", onAbort);
    document.head.appendChild(script);
  });
}

async function fetchAppsScript(
  apiUrl: string,
  signal: AbortSignal
): Promise<ToolsResponse> {
  try {
    return await fetchViaEmbed(apiUrl, signal);
  } catch (embedErr) {
    if (signal.aborted) throw embedErr;
    try {
      return await fetchJsonp(apiUrl, signal);
    } catch {
      const hint =
        embedErr instanceof Error ? embedErr.message : "Unknown error";
      throw new Error(
        `${hint} Also: redeploy apps-script/Code.gs (new version), sign in at @invoca.com, and open your /exec URL once in this browser.`
      );
    }
  }
}

export async function fetchToolsData(
  signal: AbortSignal
): Promise<{ data: ToolsResponse; source: ToolsDataSource }> {
  if (isSupabaseConfigured()) {
    const data = await fetchToolsSupabase(signal);
    return { data, source: "supabase" };
  }

  const apiUrl = getApiUrl();

  if (apiUrl) {
    const data = await fetchAppsScript(apiUrl, signal);
    return { data, source: "api" };
  }

  const res = await fetch(MOCK_URL, { signal });
  if (!res.ok) throw new Error(`Mock data error: ${res.status}`);
  const data = (await res.json()) as ToolsResponse;
  return { data, source: "mock" };
}

/** Opens the Apps Script URL so the user can complete Google/Okta sign-in */
export function openAppsScriptAuth(): void {
  const apiUrl = getApiUrl();
  if (apiUrl) {
    window.open(appendParam(apiUrl, "embed", "1"), "_blank", "noopener,noreferrer");
  }
}
