import { useCallback, useEffect, useState } from "react";
import {
  fetchToolVoteAggregates,
  fetchUserToolVotes,
  upsertToolVote,
} from "../lib/fetchToolVotes";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type { Tool, ToolVoteValue } from "../types/tool";

export interface ToolVoteState {
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: ToolVoteValue | null;
}

export interface UseToolVotesResult {
  votingEnabled: boolean;
  getVoteState: (tool: Tool) => ToolVoteState;
  vote: (toolId: string, direction: ToolVoteValue) => Promise<void>;
  votingToolId: string | null;
}

const EMPTY_VOTE_STATE: ToolVoteState = {
  upvotes: 0,
  downvotes: 0,
  score: 0,
  userVote: null,
};

export function useToolVotes(tools: Tool[]): UseToolVotesResult {
  const votingEnabled = isSupabaseConfigured();
  const [aggregates, setAggregates] = useState<Map<string, ToolVoteState>>(
    new Map()
  );
  const [votingToolId, setVotingToolId] = useState<string | null>(null);
  const toolIdsKey = tools
    .map((tool) => tool.id)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!votingEnabled) {
      setAggregates(new Map());
      return;
    }

    const toolIds = tools.map((tool) => tool.id).filter(Boolean) as string[];
    if (toolIds.length === 0) {
      setAggregates(new Map());
      return;
    }

    let cancelled = false;

    void Promise.all([fetchToolVoteAggregates(), fetchUserToolVotes(toolIds)])
      .then(([aggregateMap, userVoteMap]) => {
        if (cancelled) return;

        const next = new Map<string, ToolVoteState>();
        for (const toolId of toolIds) {
          const aggregate = aggregateMap.get(toolId);
          next.set(toolId, {
            upvotes: aggregate?.upvotes ?? 0,
            downvotes: aggregate?.downvotes ?? 0,
            score: aggregate?.score ?? 0,
            userVote: userVoteMap.get(toolId) ?? null,
          });
        }
        setAggregates(next);
      })
      .catch(() => {
        if (!cancelled) setAggregates(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [votingEnabled, toolIdsKey, tools]);

  const getVoteState = useCallback(
    (tool: Tool): ToolVoteState => {
      if (!tool.id) return EMPTY_VOTE_STATE;
      return aggregates.get(tool.id) ?? EMPTY_VOTE_STATE;
    },
    [aggregates]
  );

  const vote = useCallback(
    async (toolId: string, direction: ToolVoteValue) => {
      if (!votingEnabled) return;

      const current = aggregates.get(toolId) ?? EMPTY_VOTE_STATE;
      const nextVote = current.userVote === direction ? null : direction;

      setAggregates((prev) => {
        const existing = prev.get(toolId) ?? EMPTY_VOTE_STATE;
        let { upvotes, downvotes, userVote } = existing;

        if (userVote === 1) upvotes = Math.max(0, upvotes - 1);
        if (userVote === -1) downvotes = Math.max(0, downvotes - 1);

        if (nextVote === 1) upvotes += 1;
        if (nextVote === -1) downvotes += 1;

        const next = new Map(prev);
        next.set(toolId, {
          upvotes,
          downvotes,
          score: upvotes - downvotes,
          userVote: nextVote,
        });
        return next;
      });

      setVotingToolId(toolId);
      try {
        await upsertToolVote(toolId, nextVote);
      } catch {
        setAggregates((prev) => {
          const next = new Map(prev);
          next.set(toolId, current);
          return next;
        });
      } finally {
        setVotingToolId(null);
      }
    },
    [votingEnabled, aggregates]
  );

  return { votingEnabled, getVoteState, vote, votingToolId };
}
