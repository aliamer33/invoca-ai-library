import type { Tool, ToolSubmission, ToolsResponse } from "../types/tool";
import { parseDepartments, serializeDepartments } from "../types/tool";
import { syncToolEmbedding } from "./semanticSearch";
import { getSupabaseClient } from "./supabaseClient";
import {
  isUsableUrl,
  normalizeToolUrl,
  resolveBuilderView,
  resolveDocLink,
  resolveUserView,
} from "./toolLinks";

interface ToolRow {
  id: string;
  name: string;
  type: Tool["type"];
  description: string;
  owner: string;
  team: string | null;
  departments: string | null;
  builder_view?: string;
  link?: string;
  user_view: string | null;
  doc_link: string | null;
  status: string | null;
  tags: string | null;
  updated_at: string;
}

function rowToTool(row: ToolRow): Tool {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    owner: row.owner,
    team: row.team ?? undefined,
    departments: row.departments ?? undefined,
    builder_view: resolveBuilderView(row.builder_view ?? row.link),
    user_view: resolveUserView(row.user_view) || undefined,
    doc_link: resolveDocLink(row.doc_link) || undefined,
    status: row.status ?? undefined,
    tags: row.tags ?? undefined,
    updated_at: row.updated_at,
  };
}

function computeLastUpdated(tools: Tool[]): string {
  if (tools.length === 0) return new Date().toISOString();
  return tools.reduce((max, tool) => {
    const value = tool.updated_at ?? "";
    return value > max ? value : max;
  }, tools[0].updated_at ?? new Date().toISOString());
}

export async function fetchToolsSupabase(
  signal: AbortSignal
): Promise<ToolsResponse> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("tools")
    .select("*")
    .order("updated_at", { ascending: false })
    .abortSignal(signal);

  if (error) throw new Error(error.message);

  const tools = (data as ToolRow[]).map(rowToTool);
  return { tools, lastUpdated: computeLastUpdated(tools) };
}

export interface ToolInput {
  name: string;
  type: Tool["type"];
  description: string;
  owner: string;
  team?: string;
  departments?: string;
  builder_view: string;
  user_view?: string;
  doc_link: string;
  status?: string;
  tags?: string;
}

function requireDocLink(docLink: string | undefined): string {
  const trimmed = normalizeToolUrl(docLink);
  if (!trimmed) {
    throw new Error("Documentation link is required");
  }
  return trimmed;
}

function requireBuilderView(builderView: string | undefined): string {
  const trimmed = normalizeToolUrl(builderView);
  if (!isUsableUrl(trimmed)) {
    throw new Error("Builder view must be a valid http(s) URL");
  }
  return trimmed;
}

function toRowPayload(input: ToolInput) {
  return {
    name: input.name,
    type: input.type,
    description: input.description,
    owner: input.owner,
    team: input.team || null,
    departments: serializeDepartments(parseDepartments(input.departments)) ?? null,
    builder_view: requireBuilderView(input.builder_view),
    user_view: normalizeToolUrl(input.user_view) || null,
    doc_link: requireDocLink(input.doc_link),
    status: input.status || "Live",
    tags: input.tags || null,
  };
}

async function queueEmbeddingSync(toolId: string): Promise<void> {
  try {
    await syncToolEmbedding(toolId);
  } catch {
    // Search index can be backfilled later; don't block catalog edits.
  }
}

export async function insertTool(input: ToolInput): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("tools")
    .insert(toRowPayload(input))
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = (data as { id: string }).id;
  await queueEmbeddingSync(id);
  return id;
}

export async function updateTool(id: string, input: ToolInput): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase
    .from("tools")
    .update(toRowPayload(input))
    .eq("id", id);
  if (error) throw new Error(error.message);

  await queueEmbeddingSync(id);
}

export async function deleteTool(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase.from("tools").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface SubmissionInput {
  name: string;
  type: Tool["type"];
  description: string;
  owner: string;
  team?: string;
  departments?: string;
  builder_view: string;
  user_view?: string;
  doc_link: string;
  tags?: string;
  submitter_email?: string;
}

function toSubmissionPayload(input: SubmissionInput) {
  return {
    name: input.name,
    type: input.type,
    description: input.description,
    owner: input.owner,
    team: input.team || null,
    departments: serializeDepartments(parseDepartments(input.departments)) ?? null,
    builder_view: requireBuilderView(input.builder_view),
    user_view: normalizeToolUrl(input.user_view) || null,
    doc_link: requireDocLink(input.doc_link),
    tags: input.tags || null,
    submitter_email: input.submitter_email || null,
    status: "pending" as const,
  };
}

export async function submitTool(input: SubmissionInput): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase
    .from("tool_submissions")
    .insert(toSubmissionPayload(input));
  if (error) throw new Error(error.message);
}

export async function fetchPendingSubmissions(): Promise<ToolSubmission[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("tool_submissions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as ToolSubmission[]) ?? [];
}

export async function approveSubmission(
  submission: ToolSubmission,
  status: "Live" | "Beta" = "Beta"
): Promise<void> {
  if (!submission.doc_link?.trim()) {
    throw new Error("Documentation link is required before approving");
  }

  await insertTool({
    name: submission.name,
    type: submission.type,
    description: submission.description,
    owner: submission.owner,
    team: submission.team,
    departments: submission.departments,
    builder_view: submission.builder_view,
    user_view: submission.user_view,
    doc_link: submission.doc_link,
    status,
    tags: submission.tags,
  });

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase
    .from("tool_submissions")
    .update({ status: "approved" })
    .eq("id", submission.id);
  if (error) throw new Error(error.message);
}

export async function rejectSubmission(
  id: string,
  reviewerNotes?: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase
    .from("tool_submissions")
    .update({
      status: "rejected",
      reviewer_notes: reviewerNotes?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
