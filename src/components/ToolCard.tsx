import type { Tool } from "../types/tool";
import { parseDepartments } from "../types/tool";
import type { ToolVoteState } from "../hooks/useToolVotes";
import { resolveBuilderView, resolveDocLink, resolveUserView } from "../lib/toolLinks";

interface ToolCardProps {
  tool: Tool;
  voteState?: ToolVoteState;
  votingEnabled?: boolean;
  voting?: boolean;
  onVote?: (toolId: string, direction: 1 | -1) => void;
}

const KNOWN_BADGE_KEYS = new Set(["gumloop-agent", "workflow", "claude-skill"]);

function typeClass(type: string): string {
  const key = type.toLowerCase().replace(/\s+/g, "-");
  if (KNOWN_BADGE_KEYS.has(key)) return `badge badge-${key}`;
  return "badge badge-custom";
}

export function ToolCard({
  tool,
  voteState,
  votingEnabled = false,
  voting = false,
  onVote,
}: ToolCardProps) {
  const tagList = tool.tags
    ? tool.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const departmentList = parseDepartments(tool.departments);

  const upvotes = voteState?.upvotes ?? tool.upvotes ?? 0;
  const downvotes = voteState?.downvotes ?? tool.downvotes ?? 0;
  const userVote = voteState?.userVote ?? tool.userVote ?? null;
  const canVote = votingEnabled && !!tool.id && !!onVote;
  const builderView = resolveBuilderView(tool.builder_view);
  const userView = resolveUserView(tool.user_view);
  const docLink = resolveDocLink(tool.doc_link);

  return (
    <article className="tool-card">
      <div className="tool-card-header">
        <h2 className="tool-name">{tool.name}</h2>
        <span className={typeClass(tool.type)}>{tool.type}</span>
      </div>

      {tool.status && (
        <span className={`status status-${tool.status.toLowerCase()}`}>
          {tool.status}
        </span>
      )}

      <p className="tool-description">{tool.description}</p>

      <dl className="tool-meta">
        <div>
          <dt>Owner</dt>
          <dd>{tool.owner}</dd>
        </div>
        {tool.team && (
          <div>
            <dt>Owning team</dt>
            <dd>{tool.team}</dd>
          </div>
        )}
      </dl>

      {departmentList.length > 0 && (
        <ul className="department-list" aria-label="Departments">
          {departmentList.map((department) => (
            <li key={department} className="department-tag">
              {department}
            </li>
          ))}
        </ul>
      )}

      {tagList.length > 0 && (
        <ul className="tag-list" aria-label="Tags">
          {tagList.map((tag) => (
            <li key={tag} className="tag">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {canVote && (
        <div className="tool-votes" aria-label="Tool feedback">
          <span className="tool-votes-label">Helpful?</span>
          <div className="tool-vote-buttons">
            <button
              type="button"
              className={`vote-btn ${userVote === 1 ? "vote-btn-active vote-btn-up" : ""}`}
              aria-label={`Upvote ${tool.name}`}
              aria-pressed={userVote === 1}
              disabled={voting}
              onClick={() => onVote(tool.id!, 1)}
            >
              ▲ {upvotes}
            </button>
            <button
              type="button"
              className={`vote-btn ${userVote === -1 ? "vote-btn-active vote-btn-down" : ""}`}
              aria-label={`Downvote ${tool.name}`}
              aria-pressed={userVote === -1}
              disabled={voting}
              onClick={() => onVote(tool.id!, -1)}
            >
              ▼ {downvotes}
            </button>
          </div>
        </div>
      )}

      <div className="tool-links">
        {userView && (
          <a
            href={userView}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            User view
          </a>
        )}
        {builderView && (
          <a
            href={builderView}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Builder view
          </a>
        )}
        {docLink && (
          <a
            href={docLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Documentation
          </a>
        )}
      </div>
    </article>
  );
}
