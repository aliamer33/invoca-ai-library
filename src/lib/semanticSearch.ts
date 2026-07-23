import {
  getSupabaseAnonKey,
  getSupabaseClient,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./supabaseClient";

export interface SemanticSearchResult {
  id: string;
  similarity: number;
}

export function isSemanticSearchAvailable(): boolean {
  return isSupabaseConfigured();
}

export async function semanticSearch(
  query: string,
  options?: {
    filterType?: string | null;
    matchThreshold?: number;
    matchCount?: number;
  }
): Promise<SemanticSearchResult[]> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured");
  }

  const response = await fetch(`${url}/functions/v1/semantic-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      query,
      filter_type: options?.filterType ?? null,
      match_threshold: options?.matchThreshold ?? 0.45,
      match_count: options?.matchCount ?? 50,
    }),
  });

  const payload = (await response.json()) as {
    results?: SemanticSearchResult[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Semantic search failed (${response.status})`);
  }

  return payload.results ?? [];
}

export async function syncToolEmbedding(toolId: string): Promise<void> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return;

  const supabase = getSupabaseClient();
  const session = supabase ? await supabase.auth.getSession() : null;
  const accessToken = session?.data.session?.access_token ?? anonKey;

  await fetch(`${url}/functions/v1/sync-tool-embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id: toolId }),
  });
}
