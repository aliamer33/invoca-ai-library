import type { Tool } from "../types/tool";

export function matchesKeywordSearch(tool: Tool, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    tool.name,
    tool.description,
    tool.owner,
    tool.team ?? "",
    tool.departments ?? "",
    tool.tags ?? "",
    tool.type,
    tool.status ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function matchesAnyKeywordSearch(
  tool: Tool,
  queries: string[]
): boolean {
  return queries.some((query) => matchesKeywordSearch(tool, query));
}

export function sortToolsByRelevance(
  tools: Tool[],
  semanticScores: Map<string, number>
): Tool[] {
  if (semanticScores.size === 0) return tools;

  return [...tools].sort((a, b) => {
    const scoreA = a.id ? semanticScores.get(a.id) ?? -1 : -1;
    const scoreB = b.id ? semanticScores.get(b.id) ?? -1 : -1;
    return scoreB - scoreA;
  });
}
