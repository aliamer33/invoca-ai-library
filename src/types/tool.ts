/** Common tool types shown as presets in forms and filter chips */
export const SUGGESTED_TOOL_TYPES = [
  "Gumloop Agent",
  "Workflow",
  "Claude Skill",
] as const;

export type SuggestedToolType = (typeof SUGGESTED_TOOL_TYPES)[number];

/** @deprecated Use SUGGESTED_TOOL_TYPES — kept for backward compatibility */
export const TOOL_TYPES = SUGGESTED_TOOL_TYPES;

export type ToolType = string;

export const CUSTOM_TOOL_TYPE_OPTION = "__custom__";
export const MAX_TOOL_TYPE_LENGTH = 50;

export function normalizeToolType(value: string): string {
  return value.trim().slice(0, MAX_TOOL_TYPE_LENGTH);
}

export function isSuggestedToolType(value: string): value is SuggestedToolType {
  return (SUGGESTED_TOOL_TYPES as readonly string[]).includes(value);
}

/** Business departments used for catalog filtering and audience tagging */
export const SUGGESTED_DEPARTMENTS = [
  "Customer Success",
  "Marketing",
  "Engineering",
  "People and Culture",
  "Sales",
  "Rev Ops",
  "Analytics",
] as const;

export type SuggestedDepartment = (typeof SUGGESTED_DEPARTMENTS)[number];

export function parseDepartments(value: string | undefined | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function serializeDepartments(departments: string[]): string | undefined {
  const unique = [...new Set(departments.map((d) => d.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(",") : undefined;
}

export function toolMatchesDepartment(
  toolDepartments: string | undefined,
  filter: string
): boolean {
  return parseDepartments(toolDepartments).includes(filter);
}

/**
 * Sheet column contract (row 1 headers in Google Sheet).
 * Apps Script normalizes headers to these keys; see SHEET_COLUMN_MAP in Code.gs.
 */
export interface Tool {
  id?: string;
  name: string;
  type: ToolType;
  description: string;
  owner: string;
  team?: string;
  departments?: string;
  builder_view: string;
  user_view?: string;
  doc_link?: string;
  status?: string;
  tags?: string;
  updated_at?: string;
  upvotes?: number;
  downvotes?: number;
  score?: number;
  userVote?: 1 | -1 | null;
}

export interface ToolsResponse {
  tools: Tool[];
  lastUpdated: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface ToolSubmission {
  id: string;
  name: string;
  type: ToolType;
  description: string;
  owner: string;
  team?: string;
  departments?: string;
  builder_view: string;
  user_view?: string;
  doc_link?: string;
  tags?: string;
  submitter_email?: string;
  status: SubmissionStatus;
  reviewer_notes?: string;
  created_at: string;
  updated_at: string;
}

export type ToolVoteValue = 1 | -1;

export interface ToolVoteAggregate {
  tool_id: string;
  upvotes: number;
  downvotes: number;
  score: number;
}
