import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  approveSubmission,
  deleteTool,
  fetchPendingSubmissions,
  insertTool,
  rejectSubmission,
  updateTool,
  type ToolInput,
} from "../lib/fetchToolsSupabase";
import { isUsableUrl, normalizeToolUrl } from "../lib/toolLinks";
import { getSupabaseClient, isEditor } from "../lib/supabaseClient";
import { type Tool, type ToolSubmission } from "../types/tool";
import {
  resolveToolTypeForSubmit,
  ToolTypeField,
} from "./ToolTypeField";
import { DepartmentField } from "./DepartmentField";

const STATUS_OPTIONS = ["Live", "Beta", "Deprecated"] as const;

interface AdminPanelProps {
  tools: Tool[];
  open: boolean;
  onClose: () => void;
  onMutated: () => void;
}

function emptyForm(): ToolInput {
  return {
    name: "",
    type: "Gumloop Agent",
    description: "",
    owner: "",
    team: "",
    departments: "",
    builder_view: "",
    user_view: "",
    doc_link: "",
    status: "Live",
    tags: "",
  };
}

function toolToForm(tool: Tool): ToolInput {
  return {
    name: tool.name,
    type: tool.type,
    description: tool.description,
    owner: tool.owner,
    team: tool.team ?? "",
    departments: tool.departments ?? "",
    builder_view: tool.builder_view,
    user_view: tool.user_view ?? "",
    doc_link: tool.doc_link ?? "",
    status: tool.status ?? "Live",
    tags: tool.tags ?? "",
  };
}

export function AdminPanel({
  tools,
  open,
  onClose,
  onMutated,
}: AdminPanelProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ToolInput>(emptyForm);
  const [pendingSubmissions, setPendingSubmissions] = useState<ToolSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [toolSearch, setToolSearch] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !open) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setForm(emptyForm());
      setFormError(null);
      setAuthError(null);
      setPendingSubmissions([]);
      setToolSearch("");
    }
  }, [open]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    if (!query) return tools;
    return tools.filter((tool) => tool.name.toLowerCase().includes(query));
  }, [tools, toolSearch]);

  useEffect(() => {
    if (!open || !session || !isEditor(user)) return;

    setSubmissionsLoading(true);
    void fetchPendingSubmissions()
      .then(setPendingSubmissions)
      .catch((err) => {
        setFormError(err instanceof Error ? err.message : "Failed to load submissions");
      })
      .finally(() => setSubmissionsLoading(false));
  }, [open, session, user]);

  if (!open) return null;

  const editor = isEditor(user);

  async function reloadSubmissions() {
    const submissions = await fetchPendingSubmissions();
    setPendingSubmissions(submissions);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setAuthLoading(true);
    setAuthError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);
    if (error) setAuthError(error.message);
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(tool: Tool) {
    if (!tool.id) return;
    setEditingId(tool.id);
    setForm(toolToForm(tool));
    setFormError(null);
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;

    setSaving(true);
    setFormError(null);

    try {
      const builderView = normalizeToolUrl(form.builder_view);
      if (!isUsableUrl(builderView)) {
        throw new Error("Builder view must be a valid http(s) URL");
      }

      const docLink = normalizeToolUrl(form.doc_link);
      if (!isUsableUrl(docLink)) {
        throw new Error("Documentation link must be a valid http(s) URL");
      }

      const payload: ToolInput = {
        ...form,
        type: resolveToolTypeForSubmit(form.type),
        team: form.team?.trim() || undefined,
        departments: form.departments?.trim() || undefined,
        builder_view: builderView,
        user_view: normalizeToolUrl(form.user_view) || undefined,
        doc_link: docLink,
        tags: form.tags?.trim() || undefined,
      };

      if (editingId) {
        await updateTool(editingId, payload);
      } else {
        await insertTool(payload);
      }

      setEditingId(null);
      setForm(emptyForm());
      onMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tool: Tool) {
    if (!editor || !tool.id) return;
    if (!window.confirm(`Delete "${tool.name}"?`)) return;

    setFormError(null);
    try {
      await deleteTool(tool.id);
      if (editingId === tool.id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      onMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleApprove(submission: ToolSubmission) {
    if (!editor) return;
    setFormError(null);
    try {
      await approveSubmission(submission, "Beta");
      await reloadSubmissions();
      onMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function handleReject(submission: ToolSubmission) {
    if (!editor) return;
    const notes = window.prompt(`Reject "${submission.name}"? Optional note:`);
    if (notes === null) return;

    setFormError(null);
    try {
      await rejectSubmission(submission.id, notes || undefined);
      await reloadSubmissions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Reject failed");
    }
  }

  return (
    <div
      className="admin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-title"
      onClick={onClose}
    >
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <header className="admin-header">
          <h2 id="admin-title">Manage tools</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {!session ? (
          <form className="admin-form" onSubmit={handleSignIn}>
            <p className="admin-hint">
              Sign in with your editor account to add, edit, or delete tools.
            </p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {authError && <p className="admin-error">{authError}</p>}
            <button type="submit" className="btn btn-primary" disabled={authLoading}>
              {authLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <>
            <div className="admin-session">
              <span>Signed in as {user?.email}</span>
              <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            {!editor && (
              <p className="admin-error" role="alert">
                Your account does not have editor permissions. Ask an admin to set{" "}
                <code>app_metadata.role</code> to <code>editor</code> in Supabase.
              </p>
            )}

            {editor && (
              <>
                <section className="admin-section">
                  <h3>Pending submissions ({pendingSubmissions.length})</h3>
                  {submissionsLoading ? (
                    <p className="admin-hint">Loading submissions…</p>
                  ) : pendingSubmissions.length === 0 ? (
                    <p className="admin-hint">No pending submissions.</p>
                  ) : (
                    <ul className="admin-tool-list">
                      {pendingSubmissions.map((submission) => (
                        <li key={submission.id}>
                          <div>
                            <strong>{submission.name}</strong>
                            <span className="admin-tool-meta">
                              {submission.type} · {submission.owner}
                              {submission.submitter_email
                                ? ` · ${submission.submitter_email}`
                                : ""}
                            </span>
                          </div>
                          <div className="admin-tool-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => void handleApprove(submission)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => void handleReject(submission)}
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="admin-toolbar">
                  <input
                    type="search"
                    className="search-input admin-tool-search"
                    placeholder="Search tool names…"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    aria-label="Search tool names"
                  />
                  <button type="button" className="btn btn-primary" onClick={startAdd}>
                    Add tool directly
                  </button>
                </div>

                <ul className="admin-tool-list">
                  {filteredTools.length === 0 && toolSearch.trim() ? (
                    <li className="admin-tool-list-empty">
                      No tools match &ldquo;{toolSearch.trim()}&rdquo;
                    </li>
                  ) : (
                    filteredTools.map((tool) => (
                      <li key={tool.id ?? `${tool.name}-${tool.builder_view}`}>
                        <div>
                          <strong>{tool.name}</strong>
                          <span className="admin-tool-meta">{tool.type}</span>
                        </div>
                        <div className="admin-tool-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => startEdit(tool)}
                            disabled={!tool.id}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void handleDelete(tool)}
                            disabled={!tool.id}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>

                <form className="admin-form admin-form-grid" onSubmit={handleSave}>
                  <h3>{editingId ? "Edit tool" : "New tool"}</h3>

                  <label>
                    Name *
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </label>

                  <label className="tool-type-field">
                    Type *
                    <ToolTypeField
                      value={form.type}
                      onChange={(type) => setForm({ ...form, type })}
                      extraTypes={tools.map((tool) => tool.type)}
                    />
                  </label>

                  <label className="admin-span-2">
                    Description *
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      required
                      rows={3}
                    />
                  </label>

                  <label>
                    Owner *
                    <input
                      value={form.owner}
                      onChange={(e) => setForm({ ...form, owner: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Owning team
                    <input
                      value={form.team}
                      onChange={(e) => setForm({ ...form, team: e.target.value })}
                      placeholder="e.g. AI Enablement"
                    />
                  </label>

                  <div className="admin-span-2">
                    <DepartmentField
                      value={form.departments ?? ""}
                      onChange={(departments) => setForm({ ...form, departments })}
                    />
                  </div>

                  <label>
                    User view
                    <input
                      type="url"
                      value={form.user_view}
                      onChange={(e) => setForm({ ...form, user_view: e.target.value })}
                    />
                  </label>

                  <label>
                    Builder view *
                    <input
                      type="url"
                      value={form.builder_view}
                      onChange={(e) =>
                        setForm({ ...form, builder_view: e.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Documentation link *
                    <input
                      type="url"
                      value={form.doc_link}
                      onChange={(e) => setForm({ ...form, doc_link: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Status
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Tags
                    <input
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="comma,separated,tags"
                    />
                  </label>

                  {formError && <p className="admin-error admin-span-2">{formError}</p>}

                  <div className="admin-form-actions admin-span-2">
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving…" : editingId ? "Update tool" : "Create tool"}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={startAdd}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
