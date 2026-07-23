import { useMemo, useState } from "react";
import "./App.css";
import { AdminPanel } from "./components/AdminPanel";
import { SubmitToolPanel } from "./components/SubmitToolPanel";
import { Filters, type DepartmentFilter, type TypeFilter } from "./components/Filters";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ToolGrid } from "./components/ToolGrid";
import { useSemanticSearch } from "./hooks/useSemanticSearch";
import { useToolVotes } from "./hooks/useToolVotes";
import { openAppsScriptAuth } from "./lib/fetchToolsApi";
import { useTools } from "./hooks/useTools";
import {
  matchesAnyKeywordSearch,
  sortToolsByRelevance,
} from "./lib/searchTools";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import { SUGGESTED_DEPARTMENTS, SUGGESTED_TOOL_TYPES, parseDepartments, toolMatchesDepartment } from "./types/tool";

export default function App() {
  const { tools, lastUpdated, loading, error, source, refresh } = useTools();
  const votes = useToolVotes(tools);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("all");
  const [adminOpen, setAdminOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const supabaseEnabled = isSupabaseConfigured();

  const availableTypes = useMemo(() => {
    const types = new Set<string>(SUGGESTED_TOOL_TYPES);
    for (const tool of tools) {
      if (tool.type.trim()) types.add(tool.type.trim());
    }
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [tools]);

  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const department of SUGGESTED_DEPARTMENTS) {
      counts[department] = 0;
    }
    for (const tool of tools) {
      for (const department of parseDepartments(tool.departments)) {
        if (department in counts) {
          counts[department] += 1;
        }
      }
    }
    return counts;
  }, [tools]);

  const availableDepartments = useMemo(
    () => [...SUGGESTED_DEPARTMENTS],
    []
  );

  const { semanticScores, searching, semanticActive } = useSemanticSearch(
    search,
    typeFilter
  );

  const hasActiveQuery = search.trim().length > 0;

  const filteredTools = useMemo(() => {
    const keywordQueries = [search].map((value) => value.trim()).filter(Boolean);

    const matched = tools.filter((tool) => {
      if (typeFilter !== "all" && tool.type !== typeFilter) return false;
      if (
        departmentFilter !== "all" &&
        !toolMatchesDepartment(tool.departments, departmentFilter)
      ) {
        return false;
      }
      if (!hasActiveQuery) return true;

      const keywordMatch =
        keywordQueries.length === 0 ||
        matchesAnyKeywordSearch(tool, keywordQueries);
      const semanticMatch =
        semanticActive && tool.id && semanticScores.has(tool.id);

      return keywordMatch || semanticMatch;
    });

    if (semanticActive && semanticScores.size > 0) {
      return sortToolsByRelevance(matched, semanticScores);
    }

    return matched;
  }, [
    tools,
    typeFilter,
    departmentFilter,
    search,
    hasActiveQuery,
    semanticActive,
    semanticScores,
  ]);

  return (
    <>
      <Header />
      <main className="main">
        <Filters
          search={search}
          onSearchChange={setSearch}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          availableTypes={availableTypes}
          departmentFilter={departmentFilter}
          onDepartmentFilterChange={setDepartmentFilter}
          availableDepartments={availableDepartments}
          departmentCounts={departmentCounts}
          resultCount={filteredTools.length}
          totalCount={tools.length}
          semanticSearchEnabled={supabaseEnabled}
          searching={searching}
        />

        {error && (
          <div className="error-banner" role="alert">
            <p>{error}</p>
            {!supabaseEnabled && import.meta.env.VITE_TOOLS_API_URL && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={openAppsScriptAuth}
              >
                Sign in with Google (opens in new tab)
              </button>
            )}
          </div>
        )}

        <ToolGrid tools={filteredTools} votes={votes} />
      </main>
      <Footer
        loading={loading}
        lastUpdated={lastUpdated}
        source={source}
        onRefresh={refresh}
        showSuggest={supabaseEnabled}
        onSuggest={() => setSubmitOpen(true)}
        showManage={supabaseEnabled}
        onManage={() => setAdminOpen(true)}
      />
      {supabaseEnabled && (
        <SubmitToolPanel
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
        />
      )}
      {supabaseEnabled && (
        <AdminPanel
          tools={tools}
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          onMutated={refresh}
        />
      )}
    </>
  );
}
