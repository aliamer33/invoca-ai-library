import type { Tool } from "../types/tool";
import type { UseToolVotesResult } from "../hooks/useToolVotes";
import { ToolCard } from "./ToolCard";

interface ToolGridProps {
  tools: Tool[];
  votes?: UseToolVotesResult;
}

export function ToolGrid({ tools, votes }: ToolGridProps) {
  if (tools.length === 0) {
    return (
      <div className="empty-state">
        <p>No tools match your search. Try a different filter or keyword.</p>
      </div>
    );
  }

  return (
    <div className="tool-grid" role="list">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id ?? `${tool.name}-${tool.builder_view}`}
          tool={tool}
          voteState={votes?.getVoteState(tool)}
          votingEnabled={votes?.votingEnabled}
          voting={votes?.votingToolId === tool.id}
          onVote={votes ? (toolId, direction) => void votes.vote(toolId, direction) : undefined}
        />
      ))}
    </div>
  );
}
