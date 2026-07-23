import { useEffect, useRef, useState } from "react";
import type { TypeFilter } from "../components/Filters";
import {
  isSemanticSearchAvailable,
  semanticSearch,
} from "../lib/semanticSearch";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

export interface UseSemanticSearchResult {
  semanticScores: Map<string, number>;
  searching: boolean;
  semanticActive: boolean;
}

export function useSemanticSearch(
  search: string,
  typeFilter: TypeFilter
): UseSemanticSearchResult {
  const [semanticScores, setSemanticScores] = useState<Map<string, number>>(
    new Map()
  );
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  const combinedQuery = search.trim();

  const semanticEnabled =
    isSemanticSearchAvailable() && combinedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!semanticEnabled) {
      setSemanticScores(new Map());
      setSearching(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await semanticSearch(combinedQuery, {
          filterType: typeFilter === "all" ? null : typeFilter,
        });

        if (requestId.current !== currentRequest) return;

        const scores = new Map<string, number>();
        for (const row of results) {
          scores.set(row.id, row.similarity);
        }
        setSemanticScores(scores);
      } catch {
        if (requestId.current !== currentRequest) return;
        setSemanticScores(new Map());
      } finally {
        if (requestId.current === currentRequest) {
          setSearching(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [combinedQuery, semanticEnabled, typeFilter]);

  return {
    semanticScores,
    searching,
    semanticActive: semanticEnabled,
  };
}
