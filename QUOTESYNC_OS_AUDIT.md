# QuoteSync OS-Readiness Audit — Verdict

A note on method: I read the schema and app code on branch `claude/quotesync-os-audit-Wmwn9` (HEAD `a1123a7`). Every claim below cites a file. Where I write "not found," I searched and it is absent.

## 1. Workflow ownership

There **is** a daily-use spine, and it's real for the *service/retention team* — not the producer or principal.

- The CSR's mandatory daily surface is `/my/today` (`src/pages/TodayPage.jsx:163-206`): it unions `pending_cases` + `renewal_cases` filtered to `assigned_to_id`, ranks them (cancel priority blended with renewal days-until), and enforces a **daily call target** (`dailyTarget = employee?.daily_call_target ?? 8`, `targetHit = callsToday >= dailyTarget`). Work happens in `/my/queue` (`MyQueuePage.jsx`): log call outcome, schedule callback, snooze, mark saved/lost. This is a genuine "clear your queue every day" loop — the strongest stickiness in the product.
- **But the system of record is Allstate, not QuoteSync.** Every input is a manual XLSX upload of an Allstate report — Pending Cancellation, Renewal Review, Termination/Lapse (`RetentionImport.jsx:100-200, 520-618, 1012-1062`). The parsers are even named for Allstate's Dash export (`RetentionImport.jsx:522`). When data is ambiguous, the UI literally tells the agent to leave: *"verify in Allstate: paid or lapsed?"* (`RetentionImport.jsx:368-370`).
- Steps that live **outside** QuoteSync: the actual phone call (`MyQueuePage.jsx` uses `tel:` links), Allstate verification, and **time entry** — the punch clock at `/punch` is a standalone unauthenticated kiosk (`PunchPage.jsx`) and timesheets are hand-keyed by the principal (`TimeAttendancePage.jsx`, admin-gated), not synced from punches.

**Is there a daily task only QuoteSync can do?** Yes, but narrowly: the ranked, assigned, call-target-tracked retention queue. That doesn't exist in Allstate's tools. It is genuine — but it's one department's workflow, not the agency's operating system.

## 2. Lock-in / switching cost

Mixed, and weaker than the price point implies.

- **Re-buildable / re-importable:** the policy census itself is Allstate's — any new tool re-imports the same reports tomorrow. No proprietary policy data is trapped.
- **Genuinely sticky (proprietary, not in Allstate):** the accumulated *operational history* — `renewal_attempts` / `pending_cancel_attempts` (per-touch logs with method/result/employee/timestamp, `20260322000000_disposition_codes_attempt_log.sql`), the learned `termination_reason_aliases` per-agency mapping (`20260518140000`), `ai_call_log` + `ai_transcript`, comp schedules, bonus ledgers (`retention_bonus_ledger`), and scorecards. An established agency would lose months of worked-case history and staff performance baselines.
- **Trapping caveat:** there is **no agency-facing raw data export** — I searched; only derived PDF reports exist (`RevenueReportPDF`, `ScorecardPDF`, `TerminationReasonPDF`). The data sits in Supabase Postgres. That's "trapped" only in the weak sense that the agency can't self-serve a dump; the platform operator holds it.

Net: real switching cost for a *seasoned* tenant, near-zero for a fresh one. This is operational-history lock-in, not data-moat lock-in.

## 3. The retention-data layer — the crown jewel — **PARTIAL (captured, but compromised)**

This is the most important finding, so I'll be precise. The three fields exist and are *populated*, but the asset is softer than a pitch deck would claim.

**(a) Year-over-year renewal premium change per policy — YES, persisted.**
`renewal_cases` carries `premium` (new), `premium_old`, `premium_change`, `premium_change_pct`, `original_year`, `years_prior`. These are parsed straight from Allstate's Renewal Review columns (`RetentionImport.jsx:609-614`) and read back in analytics (`useRetentionMetrics.js:38`). The earlier `renewal_policies` lineage even computed `premium_change_pct`, `rate_shock_flag`, and `priority_tier` as generated stored columns (`20260328000000_renewal_management.sql:88-144`).
*Caveat:* this is **Allstate's** computed delta, ingested — QuoteSync does not diff its own year-over-year snapshots. The longitudinal series exists only for as long as, and at the cadence that, the principal keeps uploading. Miss a month and there's a hole.

**(b) Outcome at renewal (stayed / shopped / left) — YES, but partly inferred.**
Captured via `renewal_cases.renewal_status` (`confirmed/at_risk/escalated/lost/renewed`), `last_contact_outcome` (which includes a distinct `'shopping'` value), and an explicit `final_outcome` (`renewed/lost/unknown`) written by `FinalOutcomeModal.jsx:30-39`. "Left + why" is cross-referenced against `lapse_events`, which carries a 10-category `termination_reason` taxonomy with an `action_class` of preventable/partial/external (`20260518140000`). That termination taxonomy is the single most carrier-attractive artifact in the schema.
*Caveat:* a large share of outcomes are **heuristically inferred, not observed** — the importer auto-resolves past-due renewals as paid based on `easy_pay` + days-elapsed (`RetentionImport.jsx:876-902`). Inferred labels dilute an elasticity dataset.

**(c) Which intervention preceded the outcome — PARTIAL / coarse.**
You can reconstruct *that we called N times, reached or didn't, via ai_voice/human_call/email* (`renewal_attempts`, `last_contact_channel`, `ai_transcript`). What you **cannot** reconstruct is *what was offered to save them* — there is no field for "re-quoted at $X," "applied discount Y," "moved to tier Z." Intervention is logged as contact effort, not save tactic.

**Crown-jewel verdict:** the elasticity triplet is being captured today — that is the good news, and it's better than most agencies have. But "(c) which interventions save them" is answerable only at the blunt level of *contacted vs. not*, and (b) is partly inferred. You are accumulating a *contact-vs-churn* dataset, not yet a *tactic-vs-elasticity* dataset.

## 4. Remarketing bridge — **ABSENT (on the retention side)**

When a renewal is flagged at-risk, the workflow sets `renewal_status='escalated'` + `human_followup_required=true` (`useRenewalCases.js:181-185`) — a human handoff flag. **No re-quote or comparison data is stored.** I searched the entire schema for `remarket / requote / comparison / competitor / quoted_premium`: no such columns on any renewal/retention table. The Canopy quote-enrichment integration that *does* exist (`enrichment_jobs`, `lead_quotes`, `migrations/012_canopy_enrichment.sql`) is wired exclusively to the **new-business lead funnel**, not to at-risk renewals. So today the product cannot prove "we re-shopped this book and saved $X by moving them to a better rate."

## 5. Multi-tenancy & deployment readiness

Architecturally **multi-tenant-by-design, but Allstate-by-default in the seams.**

- **Isolation is real:** every operational table is `agency_id`-scoped with RLS, on a two-plane (platform + agency) RBAC model (`migrations/010a`, `014_two_plane_rbac.sql`, `027_optimize_rls_policies.sql`). Onboarding scaffolding exists (`AdminAgencyOnboardingPage.jsx`, `useAgencyOnboarding.js`) and carrier is a *config row*, not an enum: `agency_carrier_config.carrier_name` (`20260312300000`), and per-employee `employee_producer_codes(carrier, code)` replaced the old `allstate_id`.
- **But onboarding the *second* agency hits hardcoded Allstate defaults:** `carrier_name: 'Allstate'` is hardcoded in the onboarding hook (`useAgencyOnboarding.js:148`); CAT-factor lookups are pinned to `.eq('carrier','allstate')` (`useAgencyOnboarding.js:166`, `useAgencyProductConfig.js:64`, `AdminAgencyOnboardingPage.jsx:123`); VC-eligibility and commission matrices are Allstate-2026 constants in code, not tables. Edge functions (`punch`, `bland-availability-check`) hardcode the Allstate agency UUID. The cross-sell parser is format-locked to an Allstate `Score` column (`crossSellParser.js`).
- **Blockers to #2:** parameterize carrier in onboarding, generalize CAT/VC/commission lookups off the hardcoded `'allstate'`, fix one RLS gap (`pending_cancel_events` lacks an owner/manager policy), parameterize the two edge functions. Roughly a few engineer-days. **Blockers to #100:** onboarding is `platform_master_admin`-driven only (no self-serve), commission/VC schedules have no per-carrier table-driven config UI, and the import parsers assume Allstate report shapes — that's weeks, not days.

## 6. The retention-ROI metric — **NOT credibly, today**

`useRetentionMetrics.js` computes save rate, retain rate, premium saved/retained, contact/reach rate — but all of it is *"% of the cases we worked that we saved"* (`useRetentionMetrics.js:96-120`). To say **"agencies on QuoteSync retain X% more of their book"** you need three things the code does not have: (1) a **book-level PIF census** (policies-in-force at T0 vs T1 — there's a `lapse_events` numerator but no in-force denominator), (2) a **pre-QuoteSync baseline**, and (3) a **cross-agency benchmark** (n=1 tenant today). So the honest sentence the data supports is *"of the cancellations and renewals we worked, we saved X%,"* which is an activity metric, not a book-retention-lift metric a carrier would underwrite.

---

## VERDICT

**One-line classification:** **OS-capable-but-incomplete** — specifically, it is *already the operating system for the retention/service desk*, and *a point tool* for everything else in the agency.

**Evidence summary (the 5 findings that drove it):**
1. A real daily-use loop exists for CSRs (assigned queue + enforced call target, `TodayPage.jsx:163-206`) — but it covers one department, and Allstate remains the system of record (every input is a manual report upload, `RetentionImport.jsx`).
2. The crown-jewel elasticity fields **are** persisted (`renewal_cases.premium_old/premium_change_pct/original_year` + `lapse_events` 10-category termination taxonomy) — the asset is being built.
3. …but outcomes are partly **inferred** (`easy_pay` auto-resolve heuristic, `RetentionImport.jsx:876-902`) and the **intervention is coarse** (contact effort, not save tactic) — so it's a contact-vs-churn dataset, not yet tactic-vs-elasticity.
4. **No remarketing bridge** on renewals and **no stored comparison/quote** on escalation — the one feature that would *prove* retention lift is absent.
5. Multi-tenant skeleton is real (agency-scoped RLS, carrier as config) but **Allstate is hardcoded in the onboarding/CAT/parser seams**, and there's **no book-level retention metric** — so neither the SaaS scale story nor the carrier-ROI story is code-backed today.

**The retention-data verdict:** **PARTIAL — yes, captured; no, not yet the durable elasticity asset.** YoY premium change ✅ (ingested from Allstate, gap-prone). Outcome ✅ but ~partly inferred. Preceding intervention ⚠️ only as contact-attempt metadata, never as the save tactic. What's missing: (i) QuoteSync computing its *own* premium deltas from snapshots rather than trusting Allstate's column, (ii) observed (not inferred) renewal outcomes, (iii) a structured "intervention/offer" record, and (iv) a book-level in-force denominator.

**Shortest path to OS (ordered by leverage):**
1. **[HARD — this is the whole asset] Intervention + outcome instrumentation.** Add a structured `retention_intervention` record (offer type, remarket result, discount applied) linked to each attempt, and replace the `easy_pay` *inferred* outcome with an observed one. Without this, Q3(c) and Q6 never become true. Highest leverage by far.
2. **[MEDIUM] Book-level retention census.** Persist a monthly policies-in-force snapshot per agency so churn has a denominator; this is what unlocks the carrier-credible "X% more retained" sentence (Q6).
3. **[MEDIUM] Remarketing bridge.** On `escalated`, capture the re-quote/comparison (even single-carrier: old vs. proposed premium, tier change). Reuses the Canopy plumbing already built for new-business (Q4).
4. **[EASY] De-Allstate the seams.** Move `carrier_name`, CAT factors, VC/commission schedules off hardcoded `'allstate'` constants into the config tables that already exist; parameterize the two edge functions. Unblocks agency #2 (Q5).
5. **[EASY] Self-serve data export.** A raw export of the agency's own retention history — paradoxically *strengthens* the trust/sell even as it nominally lowers lock-in, and is table-stakes for a system-of-record pitch (Q2).
6. **[MEDIUM, cleanup] Collapse the renewal-model tech debt.** Three overlapping lineages exist — `renewal_events` (`20260321`), `renewal_policies` (`20260328`), and the live `renewal_cases`. Consolidate to remove the risk of fields being written to the wrong table.

**What I'd refuse to claim (a pitch deck might be tempted to):**
- ❌ "QuoteSync is the agency's system of record." It is the retention desk's workflow system; **Allstate is the system of record** (`RetentionImport.jsx:368` literally routes the user back to Allstate to confirm outcomes).
- ❌ "We capture which interventions save customers." We capture *whether and how often we contacted them*, not the save tactic.
- ❌ "Agencies on QuoteSync retain X% more of their book." No in-force denominator, no baseline, n=1 tenant. The supportable claim is per-worked-case save rate.
- ❌ "Multi-carrier / plug-and-play for any agency." Carrier is config-shaped but Allstate-hardcoded in onboarding, CAT lookups, parsers, and edge functions.
- ❌ "We re-shop at-risk renewals." No remarketing/comparison data is stored on the retention side.

The honest one-liner for the owner: **this is a strong retention-desk operating system sitting downstream of Allstate, with the beginnings — but not yet the proof — of the retention-elasticity data moat the $1,000 price depends on.** The single highest-leverage move is #1: turn the intervention log from "how many times we called" into "what we did and what it changed."

---

## Addendum — addressed since this audit (go-live hardening)

A round of go-live work closed several operational gaps. Mapping to the items above, honestly:

- **#3 Remarketing bridge — partially.** Escalation is no longer a bare flag: a `case_escalations` record now routes the case to the principal's **Escalations inbox**, writes an audit case-note, and notifies principals, for **renewals *and* cancels** (`escalate_case`/`resolve_escalation` RPCs). **Still open:** no re-quote / old-vs-proposed-premium comparison is captured on escalation — the remarketing/elasticity capture (#1, #3) remains the highest-leverage gap.
- **#2 Book-level retention census — surfaced, not yet per-policy.** A new **Retention Health** overview reads `book_snapshots` to show blended **net retention %** and **PIF current vs prior-year-end** with a trend. This gives a product-level in-force read from the monthly book-health upload. **Still open:** a per-policy in-force roster (the searchable denominator scoped in `BOOK_IMPORT_SCOPE.md`) for a true per-customer "% of book retained."
- **Activity-vs-outcome visibility — new.** `useQueueHygiene` surfaces the leading process signal the lagging metrics miss: **preventable lapses** (past deadline, zero attempts), **about-to-lapse untouched** (due ≤7d, zero attempts), and an 8-week preventable-lapse trend. A preventable-lapse leak forces the health status off green; the rep gets a "call these before they lapse" alarm on Today. This measures whether the workflow is *working*, distinct from whether a given case was *savable*.
- **Save measured in dollars + pace.** Renewal saves capture final premium off the offer; cancellation saves now capture **premium preserved** (`pending_cases.saved_premium`). A principal **Save Velocity** view trends saves and premium-preserved per week, per rep.
- **Queue integrity.** Snooze can no longer hide a case past its deadline (≥14-day buffer, enforced both in the UI and on write), and re-snoozes are counted and surfaced so deferral can't become a silent hiding place.

These harden the **workflow** layer. They do **not** change the core data-moat verdict: items **#1 (structured intervention + observed outcome)** and the **remarketing/comparison capture** remain the work that turns this from a strong retention desk into the defensible elasticity asset.
