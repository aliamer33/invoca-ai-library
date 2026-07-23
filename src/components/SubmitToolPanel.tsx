import { useEffect, useState, type FormEvent } from "react";
import { submitTool, type SubmissionInput } from "../lib/fetchToolsSupabase";
import { isUsableUrl, normalizeToolUrl } from "../lib/toolLinks";
import {
  resolveToolTypeForSubmit,
  ToolTypeField,
} from "./ToolTypeField";
import { DepartmentField } from "./DepartmentField";

interface SubmitToolPanelProps {
  open: boolean;
  onClose: () => void;
}

function emptyForm(): SubmissionInput {
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
    tags: "",
    submitter_email: "",
  };
}

export function SubmitToolPanel({ open, onClose }: SubmitToolPanelProps) {
  const [form, setForm] = useState<SubmissionInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setError(null);
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const builderView = normalizeToolUrl(form.builder_view);
      if (!isUsableUrl(builderView)) {
        throw new Error("Builder view must be a valid http(s) URL");
      }

      const docLink = normalizeToolUrl(form.doc_link);
      if (!isUsableUrl(docLink)) {
        throw new Error("Documentation link must be a valid http(s) URL");
      }

      await submitTool({
        ...form,
        type: resolveToolTypeForSubmit(form.type),
        team: form.team?.trim() || undefined,
        departments: form.departments?.trim() || undefined,
        builder_view: builderView,
        user_view: normalizeToolUrl(form.user_view) || undefined,
        doc_link: docLink,
        tags: form.tags?.trim() || undefined,
        submitter_email: form.submitter_email?.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="admin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-title"
    >
      <div className="admin-panel">
        <header className="admin-header">
          <h2 id="submit-title">Suggest a tool</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {submitted ? (
          <div className="admin-form">
            <p className="admin-hint">
              Thanks! Your submission is pending review. An editor will publish it
              to the catalog once approved.
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="admin-form admin-form-grid" onSubmit={handleSubmit}>
            <p className="admin-hint admin-span-2">
              Share an AI tool with the team. Pick a common type or choose
              &ldquo;Other&rdquo; to type your own. No sign-in required — submissions
              are reviewed before going live.
            </p>

            <label>
              Tool name *
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
              Tags
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="comma,separated,tags"
              />
            </label>

            <label>
              Your email
              <input
                type="email"
                value={form.submitter_email}
                onChange={(e) =>
                  setForm({ ...form, submitter_email: e.target.value })
                }
                placeholder="optional, for follow-up"
              />
            </label>

            {error && <p className="admin-error admin-span-2">{error}</p>}

            <div className="admin-form-actions admin-span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
