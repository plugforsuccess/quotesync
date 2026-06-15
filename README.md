# QuoteSync

Insurance-agency operations platform — at its core, the **retention /
service-desk operating system** for an Allstate agency, with a consumer lead
funnel, AI/voice + SMS outreach, a defensive-driving course business, and
agency back-office tooling layered on top.

> Allstate is the system of record; QuoteSync is the workflow/intelligence layer
> on top of manually-imported carrier reports.

## Stack

React 19 + Vite 7 + React Router 7 + Tailwind 3 on the frontend, TanStack React
Query for data access, and Supabase (Postgres + RLS + Auth + Deno Edge
Functions) on the backend. Hosted on Vercel + Supabase. JavaScript/JSX (no
TypeScript).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + integration keys
npm run dev                  # Vite dev server
```

## Common commands

```bash
npm run build            # production build
npm run preview          # preview the build
npm run lint             # ESLint (flat config)
npm run test:e2e         # Playwright e2e
node --test tests/unit   # unit tests
```

## Where things live

- `src/App.jsx` — all routes (consumer, `/my` employee, `/agency`, `/admin`)
- `src/pages/` — page components; `src/hooks/` — the React Query data layer
- `src/lib/` — parsers (Allstate report formats), Supabase client, utils
- `supabase/functions/` — Deno edge functions (Bland, Twilio, Canopy, Stripe/DD, punch)
- `supabase/migrations/` + `migrations/` — SQL migrations (current + legacy lineages)

## Documentation

- **`CLAUDE.md`** — orientation for contributors (and Claude); the accurate
  picture of what's built vs. aspirational.
- **`QUOTESYNC_OS_AUDIT.md`** — file-cited audit of capabilities and gaps.
- **`OPERATING_PLAYBOOK.md`** — how the agency runs day-to-day.
- `docs/` — retention engine, SOPs, user manual.

`PRODUCT.md` describes the aspirational product vision; treat it as a roadmap,
not a description of current behavior (see the trust map in `CLAUDE.md`).
