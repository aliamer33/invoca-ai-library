# Invoca AI Library

Internal catalog for sharing AI tools built at Invoca (Gumloop agents, workflows, and Claude skills). Data is stored in **Supabase** (recommended) or a Google Sheet via Apps Script. The site auto-refreshes every 60 seconds.

## Quick start (local, demo data)

```bash
cd ~/Projects/invoca-ai-catalog
npm install
npm run dev
```

Open http://localhost:5173 — you'll see sample tools from `public/mock/tools.json` (footer shows **Demo data**).

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

Migrations live in [`supabase/migrations/`](supabase/migrations/). Later deltas include:

| Migration | What it adds |
|-----------|--------------|
| `20250611000000_add_tool_submissions.sql` | Suggest-a-tool pipeline |
| `20250612000000_add_semantic_search.sql` | Embeddings + pgvector |
| `20250615000000_allow_custom_tool_types.sql` | Free-text tool types |
| `20250615000001_add_tool_votes.sql` | Anonymous up/down votes |
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

Anyone can suggest a tool via **Suggest a tool** in the footer (no sign-in). Submissions land in `tool_submissions` with status `pending`.

Editors sign in via **Manage tools**, review pending submissions, and **Approve** (publishes to catalog as `Beta`) or **Reject**.

Apply the submissions migration if you set up before this feature existed:

```bash
supabase db push
```

### 6. Access model

| Action | Who |
|--------|-----|
| Read catalog | Anyone (anon key, no sign-in) |
| Filter by type / department | Anyone (client-side chips) |
| Up/down vote tools | Anyone (anonymous voter id in `localStorage` key `invoca-ai-catalog-voter-key`) |
| Suggest a tool | Anyone (creates pending submission; custom tool types allowed) |
| Approve / reject submissions | Editors (`app_metadata.role = "editor"`) |
| Add / edit / delete catalog directly | Editors |

### 7. Semantic search (optional)

Semantic search matches tools by meaning using pgvector embeddings and Supabase Edge Functions.

**Deploy edge functions** (requires [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project):

```bash
supabase functions deploy semantic-search
supabase functions deploy sync-tool-embedding
```

Or: `npm run supabase:deploy-functions`

**Backfill embeddings** for existing tools. Add your service role key to `.env.local` first (Dashboard → Settings → API — **never commit this key**):

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Then run:

```bash
npm run backfill:embeddings
```

New and updated tools sync embeddings automatically when editors save via **Manage tools** (best-effort; failures do not block CRUD).

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
| Semantic search returns nothing | Run `npm run backfill:embeddings` and confirm edge functions are deployed |
| Voting buttons missing | Confirm `VITE_SUPABASE_*` env vars are set and `tool_votes` migration is applied |
| Department chips always empty / wrong | Confirm `20250617000000_add_departments.sql` is applied; tags live in `departments`, not `team` |
| Builder / User view buttons missing | Confirm `20250616000000_tool_view_links.sql` is applied; bare homepage URLs like `https://gumloop.com` are treated as placeholders and hidden |

## Catalog field contract

Shared TypeScript contract: [`src/types/tool.ts`](src/types/tool.ts). Supabase CRUD validation: [`src/lib/fetchToolsSupabase.ts`](src/lib/fetchToolsSupabase.ts). Display URL sanitization: [`src/lib/toolLinks.ts`](src/lib/toolLinks.ts).

### Ownership vs audience

| Field | Meaning | Example |
|-------|---------|---------|
| `team` | Owning / maintaining team | `AI Enablement` |
| `departments` | Audience tags (comma-separated). Filter chips use `SUGGESTED_DEPARTMENTS` | `Marketing,Sales` |

Do not confuse sheet alias `department` / `dept` (maps to **`team`**) with `departments` / `audience` / `target teams` (maps to **`departments`**). See `HEADER_ALIASES` in [`apps-script/Code.gs`](apps-script/Code.gs).

Suggested departments (filter chips + form checkboxes):

- Customer Success, Marketing, Engineering, People and Culture, Sales, Rev Ops, Analytics

### Dual links (`builder_view` / `user_view`)

Migration `20250616000000_tool_view_links.sql` renames `link` → `builder_view` and adds optional `user_view`.

| Field | Required (Supabase CRUD) | Purpose |
|-------|--------------------------|---------|
| `builder_view` | Yes — valid `http(s)` URL | Build / edit surface (Gumloop builder, Claude skill, etc.) |
| `user_view` | No | End-user facing URL when different from builder |
| `doc_link` | Yes for insert/update/approve | Documentation |

**URL constraints** (`src/lib/toolLinks.ts`):

- Values must start with `http://` or `https://` (after trimming / extracting from multi-line cells).
- Placeholders `—`, `-`, `–` are discarded.
- Bare builder homepages are treated as empty and hidden in the UI: `https://gumloop.com`, `https://www.gumloop.com`, `https://claude.ai`, `https://www.claude.ai`.
- Rows that still have a legacy `link` column are mapped to `builder_view` on read.

### Tool types

Presets shown in forms/filters: `Gumloop Agent`, `Workflow`, `Claude Skill` (`SUGGESTED_TOOL_TYPES`). After `20250615000000_allow_custom_tool_types.sql`, any non-empty free-text type is allowed (max 50 chars in the UI).

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
| doc_link | no for sheet read; **required** when saving via Supabase Manage tools | https://docs.google.com/... |
| status | no | Live, Beta, Deprecated |
| tags | no | intake,slack (comma-separated) |
| updated_at | no | 2026-05-22 |

\*Apps Script skips empty rows missing `name`/`type`; the React Supabase admin form requires `builder_view` and `doc_link`.

### 2. Apps Script

1. Open your Google Sheet → **Extensions** → **Apps Script**
2. Replace the default script with [`apps-script/Code.gs`](apps-script/Code.gs)
3. **Deploy** → **New deployment** → type **Web app**
   - **Execute as:** Me
   - **Who has access:** Only users in your Google Workspace (invoca.com)
4. Copy the deployment URL (ends with `/exec`)

**Important:** The site loads data via a hidden iframe `postMessage` path (with JSONP fallback), so it works from localhost with your @invoca.com Google login. After you change `Code.gs`, create a **new deployment version** (Deploy → Manage deployments → Edit → Version: New version → Deploy).

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

Add or edit a row in the Sheet. Within ~60 seconds (or when you refocus the browser tab), the catalog updates. Use **Refresh now** in the footer for an immediate pull.

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
| `npm run migrate:sheet` | One-time import from Google Sheet JSON export |
| `npm run supabase:deploy-functions` | Deploy `semantic-search` and `sync-tool-embedding` |

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
│   ├── functions/         # semantic-search, sync-tool-embedding
│   └── migrations/        # Postgres schema + RLS + seed deltas
├── apps-script/Code.gs    # Legacy Sheet-bound Apps Script
├── mock/tools.json        # Source copy of demo data (also in public/mock/)
├── public/brand/          # Invoca logos
├── scripts/               # migrate + backfill CLIs
├── src/
│   ├── components/        # Header, Filters, ToolCard, ToolGrid, Footer,
│   │                      # AdminPanel, SubmitToolPanel, DepartmentField, ToolTypeField
│   ├── hooks/             # useTools, useToolVotes, useSemanticSearch
│   ├── lib/               # Supabase client, fetchers, toolLinks, search
│   ├── types/tool.ts      # Tool + submission TypeScript contract
│   └── schema.ts          # Sheet column alias mirror (docs / migration helpers)
```

## Architecture (read path)

1. `useTools` polls every 60s and refetches on tab focus (`src/hooks/useTools.ts`).
2. `fetchToolsData` chooses the source (`src/lib/fetchToolsApi.ts`):
   1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
   2. **Google Apps Script** — else if `VITE_TOOLS_API_URL` is set (iframe → JSONP fallback)
   3. **Mock JSON** — `public/mock/tools.json`
3. `App` applies type + department filters, then keyword and optional semantic search.
4. Votes load separately via `useToolVotes` when Supabase is configured.

## Data source priority

When environment variables are set, the app loads data in this order:

1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. **Google Apps Script** — if `VITE_TOOLS_API_URL` is set
3. **Mock JSON** — `public/mock/tools.json` (local dev default)

## Future: hosting and auth

- **Vercel / Netlify:** Deploy `dist/` as a static site; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment variables. See [`vercel.json`](vercel.json).
- **Automated ingestion:** Gumloop/Claude webhooks via Supabase Edge Functions (Air Traffic Control Phase 2).
- **Realtime:** Supabase Realtime subscriptions could replace 60s polling.

## Customizing column names

If your sheet uses different headers, add aliases in:

- [`apps-script/Code.gs`](apps-script/Code.gs) → `HEADER_ALIASES`
- [`src/schema.ts`](src/schema.ts) → `SHEET_COLUMN_ALIASES` (documentation mirror)
