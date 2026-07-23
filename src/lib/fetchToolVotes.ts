import type { ToolVoteAggregate, ToolVoteValue } from "../types/tool";
import { getVoterKey } from "./voterKey";
import { getSupabaseClient } from "./supabaseClient";

export async function fetchToolVoteAggregates(): Promise<Map<string, ToolVoteAggregate>> {
  const supabase = getSupabaseClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase.rpc("get_tool_vote_aggregates");
  if (error) throw new Error(error.message);

  const map = new Map<string, ToolVoteAggregate>();
  for (const row of (data as ToolVoteAggregate[]) ?? []) {
    map.set(row.tool_id, {
      tool_id: row.tool_id,
      upvotes: Number(row.upvotes),
      downvotes: Number(row.downvotes),
      score: Number(row.score),
    });
  }
  return map;
}

export async function fetchUserToolVotes(
  toolIds: string[]
): Promise<Map<string, ToolVoteValue>> {
  const supabase = getSupabaseClient();
  if (!supabase || toolIds.length === 0) return new Map();

  const voterKey = getVoterKey();
  const { data, error } = await supabase
    .from("tool_votes")
    .select("tool_id, vote")
    .eq("voter_key", voterKey)
    .in("tool_id", toolIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, ToolVoteValue>();
  for (const row of (data as { tool_id: string; vote: ToolVoteValue }[]) ?? []) {
    map.set(row.tool_id, row.vote);
  }
  return map;
}

export async function upsertToolVote(
  toolId: string,
  vote: ToolVoteValue | null
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const voterKey = getVoterKey();

  if (vote === null) {
    const { error } = await supabase
      .from("tool_votes")
      .delete()
      .eq("tool_id", toolId)
      .eq("voter_key", voterKey);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("tool_votes").upsert(
    {
      tool_id: toolId,
      voter_key: voterKey,
      vote,
    },
    { onConflict: "tool_id,voter_key" }
  );
  if (error) throw new Error(error.message);
}
