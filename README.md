# Invoca AI Library

Internal catalog for sharing AI tools built at Invoca (Gumloop agents, workflows, Claude skills, and custom types). Data is stored in **Supabase** (recommended) or a Google Sheet via Apps Script. The site auto-refreshes every 60 seconds.

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

This creates the `tools` table (plus submissions, votes, and embeddings), RLS policies, and seeds sample tools from `mock/tools.json`.

Migrations live in [`supabase/migrations/`](supabase/migrations/). Apply all of them — later ones rename `link` → `builder_view`, add `user_view` / `departments`, allow custom tool types, and enable voting + semantic search.

### 3. Create an editor account

Editors can add, edit, and delete tools via **Manage tools** in the app footer.

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** (email + password)
2. Open the user → **Raw App Meta Data** → set:

```json
{ "role": "editor" }
```

Use `app_metadata`, not `user_metadata` — only `app_metadata` is safe for authorization.

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
| Filter by type / department | Anyone |
| Up/down vote tools | Anyone (anonymous voter id in browser localStorage) |
| Suggest a tool | Anyone (creates pending submission; custom tool types allowed) |
| Approve / reject submissions | Editors (`app_metadata.role = "editor"`) |
| Add / edit / delete catalog directly | Editors |

### 7. Catalog fields (intent and constraints)

Verified against `src/types/tool.ts`, `src/lib/fetchToolsSupabase.ts`, and `src/lib/toolLinks.ts`.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Display name |
| `type` | yes | Free text (max 50 chars). Presets: `Gumloop Agent`, `Workflow`, `Claude Skill`. Custom labels allowed. |
| `description` | yes | What the tool does |
| `owner` | yes | Person responsible |
| `team` | no | Owning team (e.g. AI Enablement) |
| `departments` | no | Comma-separated audience tags. Suggested values in `SUGGESTED_DEPARTMENTS`. |
| `builder_view` | yes* | Builder / edit URL (`http`/`https`). Bare roots like `https://gumloop.com` or `https://claude.ai` are treated as placeholders and hidden in the UI. |
| `user_view` | no | End-user run URL (shown as **User view** when set) |
| `doc_link` | yes* | Documentation URL. Required for editor create/update and for approving submissions. |
| `status` | no | `Live`, `Beta`, or `Deprecated` (default `Live`) |
| `tags` | no | Comma-separated labels |

\*On Supabase CRUD paths. Sheet/mock rows may omit some fields; cards only render usable `http(s)` links.

**Departments vs team:** `team` is who owns the tool. `departments` is who the tool is *for* (filter chips on the catalog). Stored as a single comma-separated string; the UI parses/serializes via `parseDepartments` / `serializeDepartments`.

**Dual links:** Cards show **User view**, **Builder view**, and **Documentation** independently when each URL resolves. Migration `20250616000000_tool_view_links.sql` renamed legacy `link` → `builder_view` and added `user_view`.

### 8. Semantic search (optional)

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

New and updated tools sync embeddings automatically when editors save via **Manage tools** (failures are non-blocking; re-run the backfill if search looks stale).

**How search combines:** Keyword match ORs with semantic matches (`useSemanticSearch` + `searchTools`). When semantic results exist, tools are sorted by relevance score. Default match threshold in the edge function is `0.45`.

**pgvector index note:** Migrations use an IVFFlat index (`vector_cosine_ops`), which works on all Supabase pgvector versions. HNSW is not used. If your catalog grows beyond ~100 tools, recreate the index with a higher `lists` value (roughly √row count):

```sql
drop index if exists public.tools_embedding_idx;
create index tools_embedding_idx on public.tools
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);
analyze public.tools;
```

### 9. Voting (Supabase only)

- Votes are stored in `tool_votes` keyed by `(tool_id, voter_key)`.
- `voter_key` is a UUID in `localStorage` (`invoca-ai-catalog-voter-key`).
- Clicking the same direction again clears the vote (toggle).
- Voting UI is hidden when Supabase env vars are not set (demo / Apps Script modes).

### 10. Troubleshooting Supabase migrations

| Error | Fix |
|-------|-----|
| `access method "hnsw" does not exist` | Your project uses an older pgvector — migrations already use IVFFlat; run `supabase db push` or apply `20250615000002_fix_embedding_hnsw_index.sql` |
| `operator class "vector_ip_ops" does not exist` | Same — use IVFFlat + cosine ops (included in current migrations) |
| `column "link" does not exist` / missing `builder_view` | Apply `20250616000000_tool_view_links.sql` |
| Missing department filters | Apply `20250617000000_add_departments.sql` |
| Semantic search returns nothing | Run `npm run backfill:embeddings` and confirm edge functions are deployed |
| Voting buttons missing | Confirm `VITE_SUPABASE_*` env vars are set and `tool_votes` migration is applied |
| Approve fails with "Documentation link is required" | Submissions need a valid `doc_link` before approve |

## Connect your Google Sheet (legacy)

### 1. Sheet columns

Row 1 must be headers. Supported names (case-insensitive; aliases in `apps-script/Code.gs` and `src/schema.ts`):

| Column | Required | Example |
|--------|----------|---------|
| name | yes | Air Traffic Control Intake |
| type | yes | `Gumloop Agent`, `Workflow`, `Claude Skill`, or any custom label |
| description | yes | What the tool does |
| owner | yes | Ali Amer |
| team | no | AI Enablement |
| departments | no | Engineering,Marketing (comma-separated audience) |
| builder_view | yes | https://gumloop.com/... (aliases: `link`, `url`, `builder link`) |
| user_view | no | https://gumloop.com/.../run (aliases: `user link`) |
| doc_link | no | https://docs.google.com/... |
| status | no | Live, Beta, Deprecated |
| tags | no | intake,slack (comma-separated) |
| updated_at | no | 2026-05-22 |

### 2. Apps Script

1. Open your Google Sheet → **Extensions** → **Apps Script**
2. Replace the default script with [`apps-script/Code.gs`](apps-script/Code.gs)
3. **Deploy** → **New deployment** → type **Web app**
   - **Execute as:** Me
   - **Who has access:** Only users in your Google Workspace (invoca.com)
4. Copy the deployment URL (ends with `/exec`)

**Important:** The site loads data via a hidden iframe + `postMessage` (and JSONP fallback) so it works from localhost with your @invoca.com Google login. After you change `Code.gs`, create a **new deployment version** (Deploy → Manage deployments → Edit → Version: New version → Deploy).

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
| `npm run backfill:links` | Update `builder_view` / `user_view` from a sheet JSON export (matches `product:PD####` tags). Supports `--dry-run` and `--file` |
| `npm run migrate:sheet` | One-time import from Google Sheet JSON export |
| `npm run supabase:deploy-functions` | Deploy `semantic-search` and `sync-tool-embedding` |

## Architecture (codepaths)

```
Browser
  └─ App.tsx
       ├─ useTools()          → fetchToolsApi → Supabase | Apps Script | mock
       ├─ useToolVotes()      → tool_votes (+ anonymous voter_key)
       ├─ useSemanticSearch() → Edge Function semantic-search → match_tools RPC
       ├─ Filters             → type + department chips + keyword/semantic search
       ├─ ToolGrid / ToolCard → dual links, votes, department tags
       ├─ SubmitToolPanel     → tool_submissions (anon insert)
       └─ AdminPanel          → editor CRUD + approve/reject
```

| Concern | Primary files |
|---------|---------------|
| Tool contract | `src/types/tool.ts` |
| Sheet header aliases | `src/schema.ts`, `apps-script/Code.gs` |
| URL normalization | `src/lib/toolLinks.ts` |
| Supabase CRUD / submissions | `src/lib/fetchToolsSupabase.ts` |
| Data source selection | `src/lib/fetchToolsApi.ts`, `src/lib/supabaseClient.ts` |
| Polling (60s + visibility) | `src/hooks/useTools.ts` |
| Edge functions | `supabase/functions/semantic-search`, `sync-tool-embedding` |

## Project structure

```
invoca-ai-catalog/
├── supabase/
│   ├── config.toml
│   ├── functions/         # semantic-search, sync-tool-embedding
│   └── migrations/        # schema, RLS, votes, embeddings, departments, dual links
├── apps-script/Code.gs    # Legacy Sheet-bound Apps Script
├── mock/tools.json        # Source copy of demo data (also in public/mock/)
├── public/brand/          # Invoca logos
├── scripts/               # migrate-sheet, backfill embeddings/links
└── src/
    ├── components/        # Header, Filters, ToolCard, ToolGrid, Footer,
    │                      # AdminPanel, SubmitToolPanel, DepartmentField, ToolTypeField
    ├── hooks/             # useTools, useToolVotes, useSemanticSearch
    ├── lib/               # Supabase client, fetch APIs, search, toolLinks, voterKey
    ├── schema.ts          # Sheet column alias documentation mirror
    └── types/tool.ts      # Tool / submission / vote TypeScript contract
```

## Data source priority

When environment variables are set, the app loads data in this order:

1. **Supabase** — if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. **Google Apps Script** — if `VITE_TOOLS_API_URL` is set
3. **Mock JSON** — `public/mock/tools.json` (local dev default)

## Hosting

- **Vercel:** `vercel.json` builds with Vite and serves `dist/`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the project environment.
- **Netlify / other static hosts:** Deploy `dist/` the same way.

## Future ideas

- **Automated ingestion:** Gumloop/Claude webhooks via Supabase Edge Functions (Air Traffic Control Phase 2).
- **Realtime:** Supabase Realtime subscriptions could replace 60s polling.

## Customizing column names

If your sheet uses different headers, add aliases in:

- [`apps-script/Code.gs`](apps-script/Code.gs) → `HEADER_ALIASES`
- [`src/schema.ts`](src/schema.ts) → `SHEET_COLUMN_ALIASES` (documentation mirror)
