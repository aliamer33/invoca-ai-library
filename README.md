# Invoca AI Library

Internal catalog for sharing AI tools built at Invoca (Gumloop agents, workflows, and Claude skills). Data is stored in **Supabase** (recommended) or a Google Sheet via Apps Script. The site auto-refreshes every 60 seconds.

## Refreshing the catalog

`useTools` (`src/hooks/useTools.ts`) loads on mount, polls every **60s**, and refetches when the tab becomes visible. Footer **Refresh now** forces an immediate pull.

**Equality gate:** `useTools` only applies a successful response when payload `lastUpdated` differs from the previous value. Unchanged catalog timestamps leave **both** the in-memory tool list and the footer label alone — a successful poll or **Refresh now** with no newer max `updated_at` is a no-op for UI state. (PR #2 would split **Last synced** vs **Catalog updated** and always apply the fetched list; it is still unmerged.)

**Empty-catalog caveat:** when Supabase returns zero tools, `computeLastUpdated` in `fetchToolsSupabase.ts` falls back to `new Date().toISOString()`. Every poll then has a new `lastUpdated`, so the equality gate never stabilizes and the footer clock keeps moving even though the list is empty. Once at least one tool exists, `lastUpdated` is the max row `updated_at` again.

Footer **Last synced** therefore shows the payload’s `lastUpdated` (newest tool `updated_at` from the data source when tools exist), not wall-clock of the last HTTP poll. Source badge: **Supabase**, **Demo data**, or neither (legacy Sheet/API).

Footer **Suggest a tool** and **Manage tools** render only when `VITE_SUPABASE_*` is configured (`App.tsx`).

**Default list order:** Supabase reads order tools by `updated_at` descending (`fetchToolsSupabase`). Type/department filters preserve that order. When a semantic search returns scores, `sortToolsByRelevance` reorders matches by similarity (highest first); keyword-only matches without scores stay at the bottom of that sort (`-1`).

**Update catalog content**

1. Supabase path: Footer → **Manage tools** → sign in as editor → add/edit/delete or approve submissions.
2. Sheet path: edit the Sheet (redeploy Apps Script if `Code.gs` changed), then refresh.
3. After bulk imports, optionally run `npm run backfill:embeddings` (and `npm run backfill:links` if dual-link columns need sheet backfill).

## Quick start (local, demo data)

```bash
cd ~/Projects/invoca-ai-catalog
npm install
npm run dev
```

Open http://127.0.0.1:5173 — you'll see sample tools from `public/mock/tools.json` (footer shows **Demo data**). Prefer **`127.0.0.1`** over `localhost` when testing **Manage tools** sign-in: Auth redirect allowlists in [`supabase/config.toml`](supabase/config.toml) list `http://127.0.0.1:5173`, not `http://localhost:5173`.

**Demo caveat:** several mock tools use bare homepage builder URLs (`https://gumloop.com`, `https://claude.ai`). The UI strips those as placeholders (`src/lib/toolLinks.ts`), so **Builder** buttons may be missing until you replace them with real pipeline/skill URLs. Keep `mock/tools.json` and `public/mock/tools.json` in sync (the app serves the `public/` copy).

## Connect Supabase (recommended)

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Apply the database schema

From the repo root:

```bash
supabase db push
```

This creates the `tools` table, related tables (`tool_submissions`, `tool_votes`), RLS policies, and seeds sample tools from `mock/tools.json`.

**Catalog size:** local [`supabase/config.toml`](supabase/config.toml) sets API `max_rows = 1000`. `fetchToolsSupabase` loads with a single `.select("*")` (no pagination), so catalogs above that limit are **silently truncated** in the UI (newest `updated_at` first). Hosted Supabase projects use the same PostgREST default unless you raise it. Plan pagination or a higher `max_rows` before the catalog grows past ~1000 tools.

**Semantic ∩ truncation:** `match_tools` / the semantic-search edge function return only `{ id, similarity }` and never full tool rows. `App` intersects those ids with the **already-loaded** catalog array. Tools past the `max_rows` window can still embed and match in Postgres, but they **will not render** until they appear in the unpaginated fetch.

Migrations live in [`supabase/migrations/`](supabase/migrations/):

| Migration | What it adds |
|-----------|--------------|
| `20250610000000_create_tools.sql` | Base `tools` table + RLS + seed |
| `20250611000000_add_tool_submissions.sql` | Suggest-a-tool pipeline |
| `20250612000000_add_semantic_search.sql` | Embeddings + pgvector |
| `20250615000000_allow_custom_tool_types.sql` | Free-text tool types |
| `20250615000001_add_tool_votes.sql` | Anonymous up/down votes |
| `20250615000002_fix_embedding_hnsw_index.sql` | IVFFlat cosine index (compat fix) |
| `20250616000000_tool_view_links.sql` | `link` → `builder_view` + optional `user_view` |
| `20250617000000_add_departments.sql` | Audience `departments` column |

**Local reset note:** [`supabase/seed.sql`](supabase/seed.sql) is a stub (“seed is included in the initial migration”). Sample rows are inserted by `20250610000000_create_tools.sql`, not by `seed.sql`. After `supabase db reset`, confirm those INSERT rows ran with the first migration.

### 3. Create an editor account

Editors can add, edit, and delete tools via **Manage tools** in the app footer.

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** (email + password)
2. Open the user → **Raw App Meta Data** → set:

```json
{ "role": "editor" }
```

Use `app_metadata`, not `user_metadata` — only `app_metadata` is safe for authorization (`isEditor` in `src/lib/supabaseClient.ts`).

**Manage tools auth:** the panel uses **email + password only** (`signInWithPassword` in `AdminPanel.tsx`) — no magic link or OAuth in the UI. Signed-in users without `app_metadata.role = "editor"` see an explicit permissions error and cannot CRUD.

**Auth redirects:** [`supabase/config.toml`](supabase/config.toml) sets `site_url` to `https://invoca-ai-catalog.vercel.app` and allows `http://127.0.0.1:5173` plus that Vercel host in `additional_redirect_urls` (not `http://localhost:5173`). `enable_signup` is `true` in that config, but writes remain editor-gated by RLS. Mirror the same URLs in the hosted project’s Auth → URL configuration when deploying, or local **Manage tools** sign-in can fail redirects.

### 4. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Find these in Supabase Dashboard → **Project Settings** → **API**.

Restart `npm run dev`. The footer should show **Supabase** (not "Demo data"). Use **Manage tools** to sign in as an editor and CRUD catalog entries.

### 5. User submission pipeline

Anyone can suggest a tool via **Suggest a tool** in the footer (no sign-in). Submissions land in `tool_submissions` with status `pending`. Both **Suggest** and editor **Approve** require a usable `doc_link` (`submitTool` / `approveSubmission` in `src/lib/fetchToolsSupabase.ts`).

Editors sign in via **Manage tools**, review pending submissions, and **Approve** or **Reject**:

- **Approve** always publishes as `Beta` from the UI (`AdminPanel` calls `approveSubmission(submission, "Beta")`). The helper accepts `"Live" | "Beta"`, but the panel does not offer a status picker — change status afterward via edit if needed.
- **Approve is not transactional:** `approveSubmission` **inserts** a `tools` row first, then updates the submission to `approved`. If the insert succeeds and the status update fails, the tool is already live while the row stays `pending` — clicking **Approve** again creates a **duplicate** catalog entry. Prefer fixing the stuck submission in SQL (set `status = 'approved'`) rather than approving twice.
- **Reject** opens `window.prompt` for an optional note → `reviewer_notes`. **Cancel** on that prompt aborts the reject entirely (`notes === null` → no DB write).
- Direct **Manage tools** inserts default `status` to `Live` when omitted.
- Manage’s submissions list loads **pending only** (`fetchPendingSubmissions` filters `status = pending`). Approved/rejected history is not shown in the UI.

Manage’s in-panel tool list search matches **name only** (substring), unlike the public catalog keyword search.

Apply the submissions migration if you set up before this feature existed:

```bash
supabase db push
```

### 6. Access model

| Action | Who |
|--------|-----|
| Read catalog | Anyone (anon key, no sign-in) |
| Filter by type / department | Anyone (client-side chips). **Type** chips include presets plus any custom types present in the loaded catalog; type match is **exact / case-sensitive** (`tool.type !== typeFilter`). **Department** chips always list every `SUGGESTED_DEPARTMENTS` entry with a count (including `(0)`) — Manage/Suggest forms also only offer those checkboxes (`DepartmentField`). Free-text audience tags outside that list (e.g. sheet imports) still appear on cards and match keyword / department equality filters, but get no chip and cannot be set from the UI. Filters UI group label is **Team** and the “all” chip says **All teams**, but both filter the `departments` field (audience), not `team` (owner). Tool cards label `team` as **Owning team** to reduce that confusion. **There is no status chip** — Live / Beta / Deprecated all stay in the grid (status badge on the card; status is also in the keyword haystack). |
| Up/down vote tools | Anyone when Supabase is configured (anonymous voter id in `localStorage` key `invoca-ai-catalog-voter-key`). Same-direction click clears by **deleting** the `tool_votes` row; opposite-direction click switches the vote. Requires a tool UUID (`tool.id`) — mock JSON rows have no ids, so vote UI is Supabase-only. Aggregates load via `get_tool_vote_aggregates()` (**SECURITY DEFINER**, **all** tools — not scoped to the visible page). If `localStorage` is blocked, `getVoterKey` falls back to an ephemeral in-memory id (votes will not stick across reloads). |
| Suggest a tool | Anyone (creates pending submission; custom tool types allowed) — Supabase only |
| Approve / reject submissions | Editors (`app_metadata.role = "editor"`) |
| Add / edit / delete catalog directly | Editors |

#### RLS summary (operators)

| Table | SELECT | INSERT | UPDATE / DELETE |
|-------|--------|--------|-----------------|
| `tools` | anon + authenticated | editors only | editors only |
| `tool_submissions` | editors only | anon + authenticated (`status = pending`) | editors only (UPDATE; **no DELETE policy**) |
| `tool_votes` | anon + authenticated | anon + authenticated | anon + authenticated (UPDATE + DELETE; clear-vote uses DELETE) |

Votes are unique on `(tool_id, voter_key)`. Deleting a tool is a hard delete (`window.confirm` in Manage) and cascades its vote rows (`ON DELETE CASCADE`) — including `migrate:sheet --clear`. Clear-vote requires the DELETE policy above. Vote clicks update the UI optimistically and roll back if the upsert/DELETE fails (`useToolVotes`). Aggregate RPC is intentionally broad (full-table `GROUP BY`); pair that with catalog growth planning alongside `max_rows`.

### 7. Semantic search (optional)

Semantic search matches tools by meaning using pgvector embeddings and Supabase Edge Functions. **No external OpenAI (or other) API key** — both functions embed with the built-in `Supabase.ai.Session("gte-small")` model (**384** dimensions; see `supabase/functions/*/index.ts`).

Client behavior (`src/hooks/useSemanticSearch.ts` + `src/lib/semanticSearch.ts` + `src/lib/searchTools.ts` + `App.tsx`):

- **Any non-empty query** runs keyword filtering immediately (even 1–2 characters).
- Semantic RPC runs only when Supabase env vars are set **and** the query is **≥ 3 characters** (debounced **350ms**). Shorter queries never call the edge function.
- Results combine keyword **OR** semantic matches, then sort by similarity when semantic hits exist.
- Semantic RPC returns **ids + scores only**; ranking/filtering still runs against the in-memory catalog from `useTools` (see Catalog size / truncation above).
- Keyword search matches name, description, owner, team, departments, tags, type, and status — **not** `builder_view` / `user_view` / `doc_link` URLs. There is no dedicated status filter chip.
- Default edge-function params: `match_threshold` **0.45**, `match_count` **50**. The SQL `match_tools` function defaults threshold to **0.5** when called without args (the edge function always passes **0.45**) and caps `match_count` with `least(match_count, 200)`.
- Edge RPC optional filter: `filter_type` only (follows the active type chip; exact type string). **Department is applied client-side after** the semantic/keyword match — the edge function does not receive a department filter.
- If the edge call fails, `useSemanticSearch` clears scores silently; keyword matches still show.

Embedding text for each tool (`sync-tool-embedding`): `name`, `type`, `description`, `team`, `departments`, `tags` (newline-joined). Owner and status are **not** embedded.

**Deploy edge functions** (requires [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project):

```bash
supabase functions deploy semantic-search
supabase functions deploy sync-tool-embedding
```

Or: `npm run supabase:deploy-functions`

`semantic-search` calls `match_tools` with the project **anon** key inside the function. `sync-tool-embedding` uses the project **service role** key inside the function runtime (Supabase injects `SUPABASE_SERVICE_ROLE_KEY`). The browser may call sync with the editor JWT after Manage saves; backfill scripts call it with the service role explicitly.

**Backfill embeddings** for tools with a null `embedding`. Add your service role key to `.env.local` first (Dashboard → Settings → API — **never commit this key**):

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Then run:

```bash
npm run backfill:embeddings
```

New and updated tools sync embeddings automatically when editors save via **Manage tools** (best-effort; failures do not block CRUD). Calling `sync-tool-embedding` with no `{ id }` body also backfills all null-embedding rows in one request. The `npm run backfill:embeddings` CLI instead lists null-embedding tools and syncs them **one id at a time** (clearer per-tool failure reporting).

**pgvector index note:** Migrations use an IVFFlat index (`vector_cosine_ops`), which works on all Supabase pgvector versions. HNSW is not used. Shipped migrations create the index with `lists = 4` (`20250615000002_fix_embedding_hnsw_index.sql`). If your catalog grows beyond ~100 tools, recreate with a higher `lists` value (roughly √row count):

```sql
drop index if exists public.tools_embedding_idx;
create index tools_embedding_idx on public.tools
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);
analyze public.tools;
```

### 8. Troubleshooting Supabase migrations

| Error | Fix |
|-------|-----|
| `access method "hnsw" does not exist` | Your project uses an older pgvector — migrations already use IVFFlat; run `supabase db push` or apply `20250615000002_fix_embedding_hnsw_index.sql` |
| `operator class "vector_ip_ops" does not exist` | Same — use IVFFlat + cosine ops (included in current migrations) |
| Semantic search returns nothing | Run `npm run backfill:embeddings` and confirm edge functions are deployed (`gte-small` — no OpenAI key needed) |
| Voting buttons missing | Confirm `VITE_SUPABASE_*` env vars are set and `tool_votes` migration is applied — vote UI is Supabase-only (needs tool UUIDs) |
| Suggest / Manage missing in footer | Same — those actions are gated on `isSupabaseConfigured()` |
| Signed in but cannot edit | User lacks `app_metadata.role = "editor"` — Manage tools shows a permissions alert |
| Department chips always empty / wrong | Confirm `20250617000000_add_departments.sql` is applied; tags live in `departments`, not `team`. Chips + forms only use `SUGGESTED_DEPARTMENTS`. UI label **Team** still means audience `departments`. |
| Builder / User view buttons missing | Confirm `20250616000000_tool_view_links.sql` is applied; bare homepage URLs like `https://gumloop.com` are treated as placeholders and hidden for **Builder** only |
| Saved Builder URL but no button; edit shows blank Builder | Manage/Suggest/**Approve** accept any `http(s)` URL (`isUsableUrl`); Supabase reads (`rowToTool`) strip homepage placeholders via `resolveBuilderView` before the UI sees them, so cards **and** the Manage edit form show blank Builder. Re-enter a real pipeline/skill URL before saving other edits — otherwise save fails with “Builder view must be a valid http(s) URL” |
| Approve / suggest fails with doc link error | `doc_link` must be a usable `http(s)` URL (`requireDocLink` in `fetchToolsSupabase.ts`). Sheet migrate may insert `doc_link = null` — fix before Approve if you later re-suggest, or set docs in Manage after import |
| Approve always lands as Beta | UI hardcodes `Beta`; edit the tool afterward to set Live/Deprecated |
| Approve succeeded but submission still pending / duplicate tools | `approveSubmission` is insert-then-update (not a transaction). Mark the stuck submission `approved` in SQL; do not click Approve again |
| Rejected / approved submissions missing in Manage | UI only fetches `pending` — history is in `tool_submissions`, not the panel |
| Reject prompt Cancel does nothing | Cancel (`null`) aborts — it does not reject without a note |
| Catalog stops at ~1000 tools | PostgREST `max_rows` (local config `1000`) + unpaginated `select("*")` — raise the limit or add pagination |
| Semantic finds a tool but the card never appears | Match ids are intersected with the loaded catalog only — truncated rows (or ids not in memory) stay invisible even when Postgres similarity hits |
| Cannot hide Deprecated / filter by status | No status chip — use keyword (`Deprecated`) or edit status in Manage; cards still show a status badge |
| Votes reset every reload in private/locked-down browsers | `localStorage` unavailable → ephemeral voter key; allow storage or accept non-persistent votes |
| Footer Last synced never moves / Refresh seems ignored | Timestamp is catalog `lastUpdated` (max tool `updated_at`); `useTools` skips applying the response when that value is unchanged — edit a tool or wait until source data changes |
| Empty catalog: Last synced keeps changing | Zero tools → `computeLastUpdated` uses wall-clock ISO each fetch, so the equality gate never settles until a row exists |
| `migrate:sheet` fails on homepage-only builder links | CLI runs `resolveBuilderView` before insert; bare `gumloop.com` / `claude.ai` become `""`, but `builder_view` is `NOT NULL` — import errors. Use real builder URLs in the export (Manage can persist those homepages; migrate cannot) |
| Manage sign-in redirect fails | Align Auth URL config with `supabase/config.toml` (`127.0.0.1:5173` + `https://invoca-ai-catalog.vercel.app`). Use `http://127.0.0.1:5173` in the browser — `localhost` is not in the allowlist. Auth is email/password only. |
| Search by URL finds nothing | Keyword haystack omits link fields — search name/description/tags (or use semantic meaning) instead |
| Semantic search never fires | Need Supabase env + query length ≥ 3; confirm functions deployed and embeddings backfilled. Queries of 1–2 chars are keyword-only |
| Custom type chip selected but no tools | Type filter is exact / case-sensitive — spelling must match the stored `type` string |
| `migrate:sheet` fails on custom types | Script still allows only `Gumloop Agent` / `Workflow` / `Claude Skill` — add custom types via Manage tools after import (live Sheet/Apps Script reads keep unknown types as-is) |
| Sheet departments missing after migrate | `migrate:sheet` does not write `departments`; set audience tags in Manage tools (or SQL) after import |
| Sheet `dept` column empty after migrate | Migrate reads `team` / `target user` / `department` only — rename `dept` → `department`/`team` or use Apps Script live reads |
| `migrate:sheet` fails entire import on one bad row | Bulk insert is all-or-nothing — fix the offending row (type/Builder/required fields) and re-run |
| `supabase db reset` has no sample tools | `seed.sql` is a stub; sample INSERT lives in `20250610000000_create_tools.sql` |

## Catalog field contract

Shared TypeScript contract: [`src/types/tool.ts`](src/types/tool.ts). Supabase CRUD validation: [`src/lib/fetchToolsSupabase.ts`](src/lib/fetchToolsSupabase.ts). Display URL sanitization: [`src/lib/toolLinks.ts`](src/lib/toolLinks.ts).

### Ownership vs audience

| Field | Meaning | Example |
|-------|---------|---------|
| `team` | Owning / maintaining team (card label: **Owning team**) | `AI Enablement` |
| `departments` | Audience tags (comma-separated). Filter chips use `SUGGESTED_DEPARTMENTS` | `Marketing,Sales` |

Do not confuse sheet alias `department` / `dept` (maps to **`team`**) with `departments` / `audience` / `target teams` (maps to **`departments`**). See `HEADER_ALIASES` in [`apps-script/Code.gs`](apps-script/Code.gs) and `SHEET_COLUMN_ALIASES` in [`src/schema.ts`](src/schema.ts). Alias path differences:

- Apps Script / `schema.ts`: `department` **and** `dept` → `team`.
- `migrate:sheet`: owning team from `team` \|\| `target user` \|\| `department` only — **`dept` is not read**.
- `migrate:sheet` maps `target user` → `team`; that alias is **not** in Apps Script / `schema.ts`, so live Sheet reads leave a `target user` column unmapped unless you rename the header or import via migrate.

Suggested departments (filter chips + form checkboxes only — no free-text department input in Manage/Suggest). Filters UI says **Team** / **All teams**, but chips filter `departments` (audience), not owning `team`. Form legend says **Departments**. Chips always render this full list with live counts (including `(0)`), not only departments that appear on tools:

- Customer Success, Marketing, Engineering, People and Culture, Sales, Rev Ops, Analytics

### Dual links (`builder_view` / `user_view`)

Migration `20250616000000_tool_view_links.sql` renames `link` → `builder_view` and adds optional `user_view`.

| Field | Required (Supabase CRUD) | Purpose |
|-------|--------------------------|---------|
| `builder_view` | Yes — valid `http(s)` URL | Build / edit surface (Gumloop builder, Claude skill, etc.) |
| `user_view` | No | End-user facing URL when different from builder |
| `doc_link` | Yes for insert/update/suggest/approve | Documentation |

**URL constraints** (`src/lib/toolLinks.ts`):

- Values must start with `http://` or `https://` (after trimming / extracting from multi-line cells).
- Placeholders `—`, `-`, `–` are discarded.
- Bare builder homepages are treated as empty and hidden in the UI **for Builder only**: `https://gumloop.com`, `https://www.gumloop.com`, `https://claude.ai`, `https://www.claude.ai`.
- **Write vs display asymmetry:** Manage/Suggest validate with `isUsableUrl` / `normalizeToolUrl` and **can persist** those homepage URLs. Supabase reads (`rowToTool`) strip them via `resolveBuilderView` **before** tools reach cards or Manage’s `toolToForm`, so the Builder button and edit field look empty. Saving other fields without re-entering a real Builder URL fails client validation. `user_view` and `doc_link` are **not** homepage-stripped — only dash-style placeholders and non-URLs.
- **Migrate CLI is stricter on Builder:** `migrate:sheet` uses `resolveBuilderView` (same strip) and writes the result; empty Builder after strip violates `builder_view NOT NULL`. Prefer real URLs in the sheet export.
- Rows that still have a legacy `link` column are mapped to `builder_view` on read.

### Tool types

Presets shown in forms/filters: `Gumloop Agent`, `Workflow`, `Claude Skill` (`SUGGESTED_TOOL_TYPES`). After `20250615000000_allow_custom_tool_types.sql`, the app and DB allow any non-empty free-text type (max 50 chars in the UI via `ToolTypeField`). Type filter chips also include custom types already present in the catalog. Custom types render with the `badge-custom` CSS class.

**Path differences:**

- Live Sheet / Apps Script: `normalizeType` maps known aliases, otherwise keeps the raw string (custom types pass through).
- `npm run migrate:sheet`: still rejects types outside the three presets (`VALID_TYPES` in `scripts/migrate-sheet-to-supabase.mjs`).

### Status defaults

| Path | Default `status` |
|------|------------------|
| Manage tools insert/update (empty) | `Live` |
| Approve submission (UI) | Always `Beta` (no picker; edit afterward to change) |
| Sheet migrate (empty / unknown) | `Live` (with aliases like `active` → Live, `in development` → Beta) |

## Connect your Google Sheet (legacy)

### 1. Sheet columns

Row 1 must be headers. Supported names (case-insensitive; aliases in `apps-script/Code.gs`):

| Column | Required | Example |
|--------|----------|---------|
| name | yes | Air Traffic Control Intake |
| type | yes | `Gumloop Agent`, `Workflow`, `Claude Skill`, or any custom label |
| description | yes | What the tool does |
| owner | yes | Ali Amer |
| team | no | AI Enablement (owning team) |
| departments | no | Marketing,Sales (audience; comma-separated) |
| builder_view | yes\* | https://gumloop.com/pipeline/... (`link` / `url` aliases still work) |
| user_view | no | https://... end-user URL |
| doc_link | no for sheet read; **required** when saving via Supabase Manage tools / Suggest | https://docs.google.com/... |
| status | no | Live, Beta, Deprecated |
| tags | no | intake,slack (comma-separated) |
| updated_at | no | 2026-05-22 |

\*Apps Script skips empty rows missing `name`/`type`; the React Supabase admin and suggest forms require `builder_view` and `doc_link`.

### 2. Apps Script

1. Open your Google Sheet → **Extensions** → **Apps Script**
2. Replace the default script with [`apps-script/Code.gs`](apps-script/Code.gs)
3. **Deploy** → **New deployment** → type **Web app**
   - **Execute as:** Me
   - **Who has access:** Only users in your Google Workspace (invoca.com)
4. Copy the deployment URL (ends with `/exec`)

**Important:** The site loads data via a hidden iframe `postMessage` path (with JSONP fallback), so it works from localhost with your @invoca.com Google login. Embed mode times out after **30s** (`EMBED_TIMEOUT_MS` in `src/lib/fetchToolsApi.ts`) and then tries JSONP. After you change `Code.gs`, create a **new deployment version** (Deploy → Manage deployments → Edit → Version: New version → Deploy).

Apps Script itself only rejects dash-style URL placeholders; homepage stripping for Builder happens in the React client (`ToolCard` / Supabase mapper), so Sheet-served catalog cards still hide bare `gumloop.com` / `claude.ai` Builder buttons.

### 3. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_TOOLS_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Restart `npm run dev`. The footer should no longer show "Demo data".

If both Supabase and Apps Script env vars are set, **Supabase wins** and the Sheet URL is ignored.

### 4. Verify auto-refresh

Add or edit a row in the Sheet. Within ~60 seconds (or when you refocus the browser tab), the catalog updates. Use **Refresh now** in the footer for an immediate pull — remember the equality gate above if `updated_at` did not change.

### Troubleshooting connection errors

Invoca uses Google Workspace + Okta SSO. The site loads sheet data through a **hidden Google iframe** (not a direct `fetch`), so you must redeploy the latest `Code.gs` and sign in once.

1. **Redeploy Apps Script** — Deploy → Manage deployments → Edit → **New version** → Deploy (must include `embed=1` and `callback` support in `Code.gs`).
2. Click **Sign in with Google** on the error banner (or open your `/exec?embed=1` URL in a tab) and complete @invoca.com / Okta login.
3. Return to the catalog and click **Refresh now**.
4. **Restart** `npm run dev` after changing `.env.local`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run backfill:embeddings` | Generate vector embeddings for tools (requires edge function + service role key) |
| `npm run backfill:links` | Backfill `builder_view` / `user_view` from a sheet JSON export (matches on `product:PD####` tags; supports `--dry-run` and `--file`) |
| `npm run migrate:sheet` | One-time import from Google Sheet JSON export (`--file`, `--clear`) |
| `npm run supabase:deploy-functions` | Deploy `semantic-search` and `sync-tool-embedding` |

### Migrate sheet → Supabase

```bash
# 1. Open Apps Script /exec while signed into @invoca.com; save JSON as sheet-export.json
# 2. Set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
npm run migrate:sheet
npm run migrate:sheet -- --file path/to/export.json
npm run migrate:sheet -- --clear   # deletes existing tools first
```

Constraints (verify in `scripts/migrate-sheet-to-supabase.mjs`):

- Types must normalize to the three presets; custom types throw.
- Does **not** populate `departments` (set later in Manage tools).
- Maps `product id` / `priority` / platform fields into `tags` (`product:…`, `priority:…`, `platform:…`).
- Maps owning team from `team`, `department`, or `target user` — **not** `dept` (Apps Script does map `dept`).
- Builder URLs pass through `resolveBuilderView` (homepage placeholders → empty). Empty Builder fails `NOT NULL` on insert — unlike Manage, which can persist those homepages.
- `doc_link` may be `null` after import (Manage/Suggest/Approve still require it for later writes).
- Insert is a **single bulk** `.insert(rows)` — one bad row fails the whole batch (no per-row continue).
- `--clear` deletes all existing tools (vote rows cascade).
- After import, run `npm run backfill:embeddings` (and `npm run backfill:links` if dual links need fixing).

### Backfill builder links

For catalogs migrated before dual-link columns existed:

```bash
# expects sheet-export.json in repo root by default
npm run backfill:links -- --dry-run
npm run backfill:links
npm run backfill:links -- --file path/to/export.json
```

Requires `VITE_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Matching uses Product ID from sheet fields (`product id`, `pd`, …) against tool tags shaped like `product:PD0001`.

## Project structure

```
invoca-ai-catalog/
├── supabase/
│   ├── config.toml
│   ├── seed.sql           # Stub — real seed is in create_tools migration
│   ├── functions/         # semantic-search, sync-tool-embedding
│   └── migrations/        # Postgres schema + RLS + seed deltas
├── apps-script/Code.gs    # Legacy Sheet-bound Apps Script
├── mock/tools.json        # Source copy of demo data (also in public/mock/)
├── public/brand/          # Invoca logos
├── scripts/               # migrate + backfill CLIs
├── vercel.json            # SPA rewrite to index.html
├── src/
│   ├── components/        # Header, Filters, ToolCard, ToolGrid, Footer,
│   │                      # AdminPanel, SubmitToolPanel, DepartmentField, ToolTypeField
│   ├── hooks/             # useTools, useToolVotes, useSemanticSearch
│   ├── lib/               # Supabase client, fetchers, toolLinks, search
│   ├── types/tool.ts      # Tool + submission TypeScript contract
│   └── schema.ts          # Sheet column alias mirror (docs / migration helpers)
```

## Architecture (read path)

1. `useTools` polls every 60s and refetches on tab focus (`src/hooks/useTools.ts`). Applies response only when `lastUpdated` changes; footer **Last synced** tracks that value.
2. `fetchToolsData` chooses the source (`src/lib/fetchToolsApi.ts`):
   1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (ordered by `updated_at` DESC)
   2. **Google Apps Script** — else if `VITE_TOOLS_API_URL` is set (iframe ≤30s → JSONP fallback)
   3. **Mock JSON** — `public/mock/tools.json`
3. `App` applies type + department filters (no status filter), then keyword and optional semantic search. Keyword runs for any non-empty query; semantic needs ≥3 chars (350ms debounce). Semantic RPC returns ids/scores only and may filter by type (exact); department is always client-side; results must also exist in the loaded catalog. Keyword haystack excludes URL fields. Edge failures fall back to keyword-only.
4. Votes load separately via `useToolVotes` when Supabase is configured (aggregates via global RPC; toggle same vote clears via DELETE; opposite vote switches; optimistic UI with rollback).

## Data source priority

When environment variables are set, the app loads data in this order:

1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. **Google Apps Script** — if `VITE_TOOLS_API_URL` is set
3. **Mock JSON** — `public/mock/tools.json` (local dev default)

## Future: hosting and auth

- **Vercel / Netlify:** Deploy `dist/` as a static site; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment variables. See [`vercel.json`](vercel.json) (SPA rewrite to `index.html`). Keep Supabase Auth redirect URLs in sync with `supabase/config.toml`.
- **Automated ingestion:** Gumloop/Claude webhooks via Supabase Edge Functions (Air Traffic Control Phase 2).
- **Realtime:** Supabase Realtime subscriptions could replace 60s polling.

## Customizing column names

If your sheet uses different headers, add aliases in:

- [`apps-script/Code.gs`](apps-script/Code.gs) → `HEADER_ALIASES`
- [`src/schema.ts`](src/schema.ts) → `SHEET_COLUMN_ALIASES` (documentation mirror)
