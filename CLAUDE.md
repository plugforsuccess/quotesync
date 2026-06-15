# CLAUDE.md

Guidance for Claude (and humans) working in this repository. Written to reflect
the codebase **as it actually is**, not as the marketing docs aspire it to be.
See the "Docs: trust map" below for which docs to trust.

---

## What this software actually is

QuoteSync is an **insurance-agency operations platform**, built first and
foremost as the **retention / service-desk operating system for a single
Allstate agency** (Wiley-Wilson / "insuredbycam", Georgia). It is *not* a
carrier-agnostic "book intelligence" SaaS yet.

> A prior `PRODUCT.md` pitched an aspirational, carrier-agnostic "book
> intelligence" SaaS (AMS connectors/SFTP, nightly 0–100 risk scoring). It was
> removed because it didn't match the code; this file and the audit are the
> accurate references.

The app bundles several distinct surfaces under one React SPA:

- **Retention desk (the core):** ingest Allstate XLSX reports (Pending
  Cancellation, Renewal Review, Termination/Lapse), turn them into ranked,
  per-employee work queues, and drive a daily call loop that records call
  outcomes, callbacks, and **premium saved**. This is the stickiest, most
  real part of the product. Entry points: `/my/today`, `/my/queue`,
  `/agency/retention`.
- **Consumer-facing marketing + lead funnel:** the public site
  (`InsuranceQuotesPage`), a "save/quote" wizard (`/save`), Canopy
  policy-enrichment, and lead routing into `agency/leads`.
- **AI/voice + SMS outreach:** Bland AI outbound/inbound voice and Twilio SMS
  drips, wired mostly to the new-business lead funnel and renewal queue.
- **Defensive Driving course business:** a Georgia 6-hour course with Stripe
  checkout, certificate issuance, and a staff queue (`dd-*` edge functions,
  `/courses/defensive-driving`).
- **Agency back-office:** time & attendance + a standalone punch-clock kiosk
  (`/punch`), comp/bonus models, producer scorecards, weekly operating review,
  planning/revenue projections, referral rewards, and a "newsroom" CMS
  (`/news`).
- **Platform admin plane:** multi-tenant agency onboarding/management under
  `/admin` (architecturally multi-tenant, but Allstate is hardcoded in the
  seams — see "Known reality gaps").

**System of record:** Allstate, **not** QuoteSync. Every retention input is a
manual report upload; the UI even routes users back to Allstate to confirm
outcomes. QuoteSync is the workflow/intelligence layer on top.

For the honest, file-cited assessment of capabilities and gaps, read
**`QUOTESYNC_OS_AUDIT.md`**. For how the agency actually runs day-to-day, read
**`OPERATING_PLAYBOOK.md`**.

---

## Tech stack (verified against the repo)

| Layer | Technology |
|---|---|
| Frontend | **React 19** (`react@^19.2`), Vite 7, React Router 7, Tailwind 3 |
| Data/state | TanStack React Query 5 against `@supabase/supabase-js` v2 |
| Backend | Supabase: Postgres + Row Level Security + Auth |
| Server logic | **Supabase Edge Functions (Deno)** — ~26 functions in `supabase/functions/` |
| Integrations | Bland AI (voice), Twilio (SMS/voice), Canopy (enrichment), Stripe (DD course), Google Places, Vercel Analytics |
| Hosting | Vercel (frontend), Supabase (backend) |
| Charts/PDF | Recharts, `@react-pdf/renderer`; XLSX/CSV via `xlsx` + `papaparse` |

There is **no TypeScript** — the app is `.jsx`/`.js`. There is **no nightly
cron risk-scoring engine** and **no 0–100 retention risk score** in the code.

---

## Repository layout

```
src/
  App.jsx              # all routes (consumer, /my employee, /agency, /admin)
  pages/               # ~63 page components; pages/components/* = feature modules
  hooks/               # ~63 React Query hooks — the data layer lives here
  lib/                 # parsers, supabase client, routing, analytics, utils
  components/          # shared UI, Layout, route guards, newsroom/
  contexts/            # AuthContext (two-plane RBAC), ThemeContext
  config/              # navConfig and friends
supabase/
  functions/           # ~26 Deno edge functions (bland-*, twilio-*, canopy-*, dd-*, punch, ...)
  migrations/          # ~138 timestamped SQL migrations (current lineage)
migrations/            # ~31 older numbered SQL migrations (legacy lineage, still referenced)
tests/
  unit/                # node --test (*.test.mjs) + Vitest-style *.test.js in src/lib
  e2e/                 # Playwright specs
docs/                  # RETENTION_ENGINE.md, SOP.md, USER_MANUAL.md, AD_CREATIVE_GUIDE.md
```

Note the **two migration directories** (`migrations/` legacy +
`supabase/migrations/` current) — both are real and cross-referenced. There are
also three overlapping renewal-model lineages (`renewal_events`,
`renewal_policies`, live `renewal_cases`); `renewal_cases` is the live one.

### Auth & access model

Two-plane RBAC (see `contexts/AuthContext.jsx`, `components/ProtectedRoute.jsx`,
`EmployeeRoute.jsx`):
- **Platform plane:** `platform_admin`, `platform_master_admin` → `/admin`.
- **Agency plane:** `principal` / `producer` / `employee` memberships →
  `/agency/*`, and employee-scoped `/my/*` (queue, today, scorecard).
Every operational table is `agency_id`-scoped with RLS.

---

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # production build
npm run preview        # preview the build
npm run lint           # ESLint (flat config: eslint.config.js)

npm run test:e2e       # Playwright e2e
npm run test:e2e:ui    # Playwright UI mode
node --test tests/unit # unit tests (*.test.mjs)
```

There is no `npm test` script defined; run unit tests via `node --test` and
e2e via the `test:e2e*` scripts. Supabase is managed remotely (`.mcp.json`
points at the hosted project); there is no local Supabase stack checked in.

---

## Conventions & working notes

- **Data access goes through hooks in `src/hooks/`** (React Query). When adding
  a feature, look for an existing `use*` hook before querying Supabase directly.
  Query keys live in `lib/queryKeys.js`.
- **Parsers for carrier reports live in `src/lib/`** (`crossSellParser.js`,
  `bookMetricsParser.js`, retention import logic). These are **format-locked to
  Allstate report shapes** — changing carrier means changing parsers.
- **Routes are centralized in `src/App.jsx`**; nav is driven by
  `src/config/navConfig.js`. Most pages are lazy-loaded via `lazyWithRetry`
  (handles post-deploy chunk errors — don't remove the retry wrapper).
- **Edge functions are Deno**, not Node — different runtime/imports than `src/`.
- Match the surrounding file's style (plain JSX, Tailwind classes, existing
  hook/parser patterns). No TS, no new state libraries.

### Known reality gaps (don't claim these are done)

These are documented in `QUOTESYNC_OS_AUDIT.md`; keep them in mind so we don't
write code/docs that assume them:
- **Allstate is hardcoded** in onboarding (`useAgencyOnboarding.js`), CAT/VC/
  commission lookups, parsers, and some edge functions — true multi-carrier
  onboarding is not finished.
- **No remarketing/re-quote data** is stored on at-risk renewals.
- Renewal outcomes are **partly inferred** (the `easy_pay` auto-resolve
  heuristic), not all observed.
- Intervention logging captures **contact effort**, not the save tactic/offer.
- **No book-level in-force (PIF) denominator** → no credible book-retention-lift
  metric, only per-worked-case save rate.

---

## Docs: trust map

| Doc | Trust | Notes |
|---|---|---|
| `QUOTESYNC_OS_AUDIT.md` | ✅ accurate | File-cited ground-truth audit of capabilities & gaps |
| `OPERATING_PLAYBOOK.md` | ✅ accurate | Real day-to-day agency workflow |
| `docs/RETENTION_ENGINE.md`, `docs/SOP.md`, `docs/USER_MANUAL.md` | ✅ mostly | Operational references |
| `README.md` | n/a | Repository overview (was previously the stock Vite template) |
| `*_TROUBLESHOOTING.md`, `*_FIX.md`, `PR_DESCRIPTION.md`, `zz` | ⚠️ point-in-time | Historical artifacts; verify before relying on them. `zz` is junk (a `less` help dump) |

When in doubt, **read the code** — `App.jsx`, `src/hooks/`, and
`supabase/functions/` are the source of truth.
