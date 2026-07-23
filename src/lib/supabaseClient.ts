import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  return url || null;
}

export function getSupabaseAnonKey(): string | null {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return key || null;
}

export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(getSupabaseUrl()!, getSupabaseAnonKey()!);
  }
  return client;
}

export function isEditor(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.role === "editor";
}
