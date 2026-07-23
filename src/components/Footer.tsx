import type { ToolsDataSource } from "../lib/fetchToolsApi";

interface FooterProps {
  loading: boolean;
  lastUpdated: string | null;
  source: ToolsDataSource;
  onRefresh: () => void;
  onManage?: () => void;
  onSuggest?: () => void;
  showManage?: boolean;
  showSuggest?: boolean;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function Footer({
  loading,
  lastUpdated,
  source,
  onRefresh,
  onManage,
  onSuggest,
  showManage = false,
  showSuggest = false,
}: FooterProps) {
  return (
    <footer className="footer">
      <p>
        {loading ? "Syncing…" : `Last synced: ${formatSyncTime(lastUpdated)}`}
        {source === "mock" && (
          <span className="source-badge"> · Demo data</span>
        )}
        {source === "supabase" && (
          <span className="source-badge"> · Supabase</span>
        )}
      </p>
      <div className="footer-actions">
        {showSuggest && onSuggest && (
          <button type="button" className="btn btn-primary" onClick={onSuggest}>
            Suggest a tool
          </button>
        )}
        {showManage && onManage && (
          <button type="button" className="btn btn-secondary" onClick={onManage}>
            Manage tools
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          Refresh now
        </button>
      </div>
    </footer>
  );
}
