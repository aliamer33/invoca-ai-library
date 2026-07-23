import { useCallback, useEffect, useRef, useState } from "react";
import { fetchToolsData, type ToolsDataSource } from "../lib/fetchToolsApi";
import type { Tool } from "../types/tool";

const REFRESH_MS = 60_000;

export interface UseToolsResult {
  tools: Tool[];
  lastUpdated: string | null;
  loading: boolean;
  error: string | null;
  source: ToolsDataSource;
  refresh: () => void;
}

export function useTools(): UseToolsResult {
  const [tools, setTools] = useState<Tool[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ToolsDataSource>("mock");
  const abortRef = useRef<AbortController | null>(null);
  const lastSyncedRef = useRef<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (showLoading) setLoading(true);

    try {
      const { data, source: src } = await fetchToolsData(controller.signal);
      if (controller.signal.aborted) return;

      if (data.lastUpdated !== lastSyncedRef.current) {
        lastSyncedRef.current = data.lastUpdated;
        setTools(data.tools);
        setLastUpdated(data.lastUpdated);
      }
      setSource(src);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load tools");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    void load(true);

    const interval = window.setInterval(() => {
      void load(false);
    }, REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [load]);

  return { tools, lastUpdated, loading, error, source, refresh };
}
