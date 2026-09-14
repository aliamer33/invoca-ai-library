# Invoca AI Library

Internal catalog for sharing AI tools built at Invoca (Gumloop agents, workflows, and Claude skills). Data is stored in **Supabase** (recommended) or a Google Sheet via Apps Script. The site auto-refreshes every 60 seconds.

## Refreshing the catalog

`useTools` (`src/hooks/useTools.ts`) loads on mount, polls every **60s**, and refetches when the tab becomes visible. Footer **Refresh now** forces an immediate pull.

**Equality gate:** the hook only applies a successful response when payload `lastUpdated` differs from the previous value. Unchanged catalog timestamps leave both the in-memory tool list and the footer label alone — a successful poll or **Refresh now** with no newer `updated_at` is effectively a no-op for UI state. (PR #2 would split **Last synced** vs **Catalog updated** and always apply the fetched list; it is still unmerged.)

Footer **Last synced** therefore shows the payload’s `lastUpdated` (newest tool `updated_at` from the data source), not wall-clock of the last HTTP poll. Source badge: **Supabase**, **Demo data**, or neither (legacy Sheet/API).

Footer **Suggest a tool** and **Manage tools** render only when `VITE_SUPABASE_*` is configured (`App.tsx`).

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

Open http://localhost:5173 — you'll see sample tools from `public/mock/tools.json` (footer shows **Demo data**).

**Demo caveat:** several mock tools use bare homepage builder URLs (`https://gumloop.com`, `https://claude.ai`). The UI strips those as placeholders (`src/lib/toolLinks.ts`), so **Builder** buttons may be missing until you replace them with real pipeline/skill URLs.

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

Migrations live in [`supabase/migrations/`](supabase/migrations/):

| Migration | What it adds |
|-----------|--------------|
| `20250610000000_create_tools.sql` | Base `tools` table + RLS + seed |
| `20250611000000_add_tool_submissions.sql` | Suggest-a-tool pipeline |
| `20250612000000_add_semantic_search.sql` | Embeddings + pgvector |
| `20250615000000_allow_custom_tool_types.sql` | Free-text tool types (`tools` + `tool_submissions`) |
| `20250615000001_add_tool_votes.sql` | Anonymous up/down votes |
| `20250615000002_fix_embedding_hnsw_index.sql` | IVFFlat cosine index (compat fix) |
| `20250616000000_tool_view_links.sql` | `link` → `builder_view` + optional `user_view` |
| `20250617000000_add_departments.sql` | Audience `departments` column |

### 3. Create an editor account

Editors can add, edit, and delete tools via **Manage tools** in the app footer.

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** (email + password)
2. Open the user → **Raw App Meta Data** → set:

```json
{ "role": "editor" }
```

Use `app_metadata`, not `user_metadata` — only `app_metadata` is safe for authorization (`isEditor` in `src/lib/supabaseClient.ts`).

**Auth redirects:** [`supabase/config.toml`](supabase/config.toml) sets `site_url` to `https://invoca-ai-catalog.vercel.app` and allows `http://127.0.0.1:5173` plus that Vercel host in `additional_redirect_urls`. Mirror the same URLs in the hosted project’s Auth → URL configuration when deploying, or local **Manage tools** sign-in can fail redirects.

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

Editors sign in via **Manage tools**, review pending submissions, and **Approve** (publishes to catalog as `Beta` by default — hardcoded in `AdminPanel`) or **Reject**. Direct **Manage tools** inserts default `status` to `Live` when omitted.

Apply the submissions migration if you set up before this feature existed:

```bash
supabase db push
```

### 6. Access model

| Action | Who |
|--------|-----|
| Read catalog | Anyone (anon key, no sign-in) |
| Filter by type / department | Anyone (client-side chips). **Type** chips include presets plus any custom types present in the loaded catalog. **Department** chips are only `SUGGESTED_DEPARTMENTS` — Manage/Suggest forms also only offer those checkboxes (`DepartmentField`). Free-text audience tags outside that list (e.g. sheet imports) still match keyword search and department filter equality, but get no chip and cannot be set from the UI. UI label is **All teams** / department names, but the filter reads the `departments` field (audience), not `team` (owner). |
| Up/down vote tools | Anyone when Supabase is configured (anonymous voter id in `localStorage` key `invoca-ai-catalog-voter-key`). Clicking the same vote again clears it (row delete). Vote UI is hidden on mock/Sheet sources. |
| Suggest a tool | Anyone (creates pending submission; custom tool types allowed) — Supabase only |
| Approve / reject submissions | Editors (`app_metadata.role = "editor"`) |
| Add / edit / delete catalog directly | Editors |

#### RLS summary (operators)

| Table | SELECT | INSERT | UPDATE / DELETE |
|-------|--------|--------|-----------------|
| `tools` | anon + authenticated | editors only | editors only |
| `tool_submissions` | editors only | anon + authenticated (`status = pending`) | editors only |
| `tool_votes` | anon + authenticated | anon + authenticated | anon + authenticated |

Votes are keyed by `(tool_id, voter_key)` (`UNIQUE`). Deleting a tool cascades vote rows (`ON DELETE CASCADE`).

### 7. Semantic search (optional)

Semantic search matches tools by meaning using pgvector embeddings and Supabase Edge Functions. **No external OpenAI (or other) API key** — both functions embed with the built-in `Supabase.ai.Session("gte-small")` model (**384** dimensions; see `supabase/functions/*/index.ts`).

Client behavior (`src/hooks/useSemanticSearch.ts` + `src/lib/semanticSearch.ts` + `App.tsx`):

- Runs only when Supabase env vars are set and the query is **≥ 3 characters**
- Debounced **350ms**; results combine with keyword matches (**OR**), then sort by similarity when semantic hits exist
- Keyword search (`src/lib/searchTools.ts`) matches name, description, owner, team, departments, tags, type, and status
- Default edge-function params: `match_threshold` **0.45**, `match_count` **50**
- Edge RPC optional filter: `filter_type` only (follows the active type chip). **Department is applied client-side after** the semantic/keyword match — the edge function does not receive a department filter.

Embedding text for each tool (`sync-tool-embedding`): `name`, `type`, `description`, `team`, `departments`, `tags` (newline-joined). Owner and status are **not** embedded.

**Deploy edge functions** (requires [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project):

```bash
supabase functions deploy semantic-search
supabase functions deploy sync-tool-embedding
```

Or: `npm run supabase:deploy-functions`

`sync-tool-embedding` uses the project **service role** key inside the function runtime (Supabase injects `SUPABASE_SERVICE_ROLE_KEY`). The browser may call it with the editor JWT after Manage saves; backfill scripts call it with the service role explicitly.

**Backfill embeddings** for tools with a null `embedding`. Add your service role key to `.env.local` first (Dashboard → Settings → API — **never commit this key**):

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Then run:

```bash
npm run backfill:embeddings
```

New and updated tools sync embeddings automatically when editors save via **Manage tools** (best-effort; failures do not block CRUD). Calling `sync-tool-embedding` with no `{ id }` body also backfills all null-embedding rows. Deletes do not need an embedding cleanup step (row is gone).

**pgvector index note:** Migrations use an IVFFlat index (`vector_cosine_ops`), which works on all Supabase pgvector versions. HNSW is not used. If your catalog grows beyond ~100 tools, recreate the index with a higher `lists` value (roughly √row count):

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
| Voting buttons missing | Confirm `VITE_SUPABASE_*` env vars are set and `tool_votes` migration is applied — vote UI is Supabase-only |
| Suggest / Manage missing in footer | Same — those actions are gated on `isSupabaseConfigured()` |
| Manage sign-in redirect fails | Align Auth URL config with `supabase/config.toml` (`127.0.0.1:5173` + production host) |
| Department chips always empty / wrong | Confirm `20250617000000_add_departments.sql` is applied; tags live in `departments`, not `team`. Chips + forms only use `SUGGESTED_DEPARTMENTS`. UI says “teams” but filters audience tags. |
| Builder / User view buttons missing | Confirm `20250616000000_tool_view_links.sql` is applied; bare homepage URLs like `https://gumloop.com` are treated as placeholders and hidden |
| Approve / suggest fails with doc link error | `doc_link` must be a usable `http(s)` URL (`requireDocLink` in `fetchToolsSupabase.ts`) |
| Footer Last synced never moves / Refresh seems ignored | Timestamp is catalog `lastUpdated` (max tool `updated_at`); `useTools` skips applying the response when that value is unchanged — edit a tool or wait until source data changes |
| Semantic search never fires | Need Supabase env + query length ≥ 3; confirm functions deployed and embeddings backfilled |
| `migrate:sheet` fails on custom types | Script still allows only `Gumloop Agent` / `Workflow` / `Claude Skill` — add custom types via Manage tools after import |
| Sheet departments missing after migrate | `migrate:sheet` does not write `departments`; set audience tags in Manage tools (or SQL) after import |

## Catalog field contract

Shared TypeScript contract: [`src/types/tool.ts`](src/types/tool.ts). Supabase CRUD validation: [`src/lib/fetchToolsSupabase.ts`](src/lib/fetchToolsSupabase.ts). Display URL sanitization: [`src/lib/toolLinks.ts`](src/lib/toolLinks.ts).

### Ownership vs audience

| Field | Meaning | Example |
|-------|---------|---------|
| `team` | Owning / maintaining team | `AI Enablement` |
| `departments` | Audience tags (comma-separated). Filter chips use `SUGGESTED_DEPARTMENTS` | `Marketing,Sales` |

Do not confuse sheet alias `department` / `dept` (maps to **`team`**) with `departments` / `audience` / `target teams` (maps to **`departments`**). See `HEADER_ALIASES` in [`apps-script/Code.gs`](apps-script/Code.gs) and `SHEET_COLUMN_ALIASES` in [`src/schema.ts`](src/schema.ts). The migrate CLI also maps sheet `target user` → `team`.

Suggested departments (filter chips + form checkboxes only — no free-text department input in Manage/Suggest):

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
- Bare builder homepages are treated as empty and hidden in the UI: `https://gumloop.com`, `https://www.gumloop.com`, `https://claude.ai`, `https://www.claude.ai`.
- Rows that still have a legacy `link` column are mapped to `builder_view` on read.

### Tool types

Presets shown in forms/filters: `Gumloop Agent`, `Workflow`, `Claude Skill` (`SUGGESTED_TOOL_TYPES`). After `20250615000000_allow_custom_tool_types.sql`, the app and DB allow any non-empty free-text type (max 50 chars in the UI). Type filter chips also include custom types already present in the catalog. Apps Script `normalizeType` maps known aliases but also passes through unknown labels.

**CLI caveat:** `npm run migrate:sheet` still rejects types outside the three presets (`VALID_TYPES` in `scripts/migrate-sheet-to-supabase.mjs`).

### Status defaults

| Path | Default `status` |
|------|------------------|
| Manage tools insert/update (empty) | `Live` |
| Approve submission | `Beta` |
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

**Important:** The site loads data via a hidden iframe `postMessage` path (with JSONP fallback), so it works from localhost with your @invoca.com Google login. Embed mode times out after **30s** (`EMBED_TIMEOUT_MS` in `fetchToolsApi.ts`) and then tries JSONP. After you change `Code.gs`, create a **new deployment version** (Deploy → Manage deployments → Edit → Version: New version → Deploy).

### 3. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_TOOLS_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Restart `npm run dev`. The footer should no longer show "Demo data".

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
- Maps owning team from `team`, `department`, or `target user`.
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
│   ├── config.toml            # local CLI + auth site_url / redirect URLs
│   ├── functions/             # semantic-search, sync-tool-embedding
│   └── migrations/            # Postgres schema + RLS + seed deltas
├── apps-script/Code.gs        # Legacy Sheet-bound Apps Script
├── mock/tools.json            # Source copy of demo data (also in public/mock/)
├── public/brand/              # Invoca logos
├── scripts/                   # migrate + backfill CLIs
├── vercel.json                # SPA rewrite to index.html
├── src/
│   ├── components/            # Header, Filters, ToolCard, ToolGrid, Footer,
│   │                          # AdminPanel, SubmitToolPanel, DepartmentField, ToolTypeField
│   ├── hooks/                 # useTools, useToolVotes, useSemanticSearch
│   ├── lib/                   # Supabase client, fetchers, toolLinks, search
│   ├── types/tool.ts          # Tool + submission TypeScript contract
│   └── schema.ts              # Sheet column alias mirror (docs / migration helpers)
```

## Architecture (read path)

1. `useTools` polls every 60s and refetches on tab focus (`src/hooks/useTools.ts`). Applies response only when `lastUpdated` changes; footer **Last synced** tracks that value.
2. `fetchToolsData` chooses the source (`src/lib/fetchToolsApi.ts`):
   1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
   2. **Google Apps Script** — else if `VITE_TOOLS_API_URL` is set (iframe ≤30s → JSONP fallback)
   3. **Mock JSON** — `public/mock/tools.json`
3. `App` applies type + department filters, then keyword and optional semantic search (≥3 chars, 350ms debounce). Semantic RPC may filter by type; department is always client-side.
4. Votes load separately via `useToolVotes` when Supabase is configured (toggle vote on second click clears it).

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
