# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Vite + React 19 + TypeScript** single-page app (the "Invoca AI Library" tool catalog). There is no separate backend service in this repo; data comes from Supabase, a legacy Google Apps Script endpoint, or bundled mock JSON.

### Services / how to run
- **Dev server (only service):** `npm run dev` → Vite on http://localhost:5173. See the Scripts table in `README.md` for `build`/`preview` and the data-source scripts.
- With no env vars set, the app runs on **mock data** from `public/mock/tools.json` (footer badge shows **"Demo data"**). This is the default local dev path and needs no external services.
- To use a real backend, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local` (see `README.md` "Connect Supabase"). Restart the dev server after changing env vars — Vite only reads `VITE_*` vars at startup.

### Lint / test / build
- **Lint:** there is no ESLint config or `lint` script. Type-checking via `tsc` is the closest equivalent.
- **Tests:** there is no automated test suite in this repo.
- **Build / type-check:** `npm run build` runs `tsc -b && vite build`. Run `npx tsc -b` alone for a fast type-check without producing a `dist/`.

### Non-obvious notes
- **Voting UI only renders with Supabase configured.** In demo/mock mode the up/down vote buttons are hidden by design — this is expected, not a bug. Core catalog browsing, search, and type/team filters all work fully on mock data.
- The `supabase/` migrations + edge functions and `apps-script/Code.gs` are optional integrations; they require a linked Supabase project / deployed Apps Script and are not needed to run or demo the app locally.
