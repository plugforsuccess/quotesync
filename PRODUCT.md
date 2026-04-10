# QuoteSync

**The operational intelligence layer that turns an agency's book of business into a forecastable revenue engine.**

---

## The Problem

Independent insurance agencies run on spreadsheets, carrier portals, and institutional memory. An agency owner with a 2,000-household book can tell you roughly which clients are "at risk" — but only because they remember the awkward renewal call last March, not because any system told them so.

Meanwhile, the tools they already pay for are the wrong shape for the question:

- **Agency Management Systems (AMS360, HawkSoft, EZLynx)** are systems of record. They store policies, transactions, and documents. They were not designed to surface *which clients are about to leave* or *which book segments are dangerously over-concentrated in a single carrier*.
- **Generic CRMs (Salesforce, HubSpot)** model pipelines for new business. They have no native concept of a renewal, an endorsement, a carrier appointment, or a premium-weighted retention score.
- **BI tools (Power BI, Looker)** can technically answer any question, but require a data engineer the agency does not have and a data model the agency has never built.

The result: agency owners lose clients they could have saved, discover carrier concentration problems only after a carrier non-renews an appointment, and assign renewal follow-ups based on whichever CSR has the lightest inbox that week. Revenue leaks through gaps that are invisible until they are irreversible.

## The Solution

QuoteSync is an **agency book intelligence platform**. It is not a lead-gen tool, not a quote comparison rater, and not a replacement for your AMS. It sits *on top of* the agency's existing book of business and answers three questions the AMS cannot:

1. **Who is about to leave, and what should we do about it today?**
2. **Which renewals in the next 30/60/90 days need a human touch, and whose desk should they be on?**
3. **Where is the book structurally fragile — by carrier, by line, by segment — and how do we fix it before it breaks?**

QuoteSync ingests policy and client data from the agency's existing systems, runs it through a retention risk model and a concentration analysis engine, and surfaces the results as a prioritized, actionable worklist for the owner and their staff. Every number in the platform is tied to a specific next action.

---

## Feature Breakdown

### 1. Book Analytics & Retention Risk Scoring

QuoteSync scores every household and policy in the book on a 0–100 retention risk scale, refreshed nightly.

**Data ingestion**
- Scheduled imports from the agency's AMS via CSV drop, SFTP, or direct connector where supported.
- Normalization pipeline maps carrier-specific field names, policy types, and LOB codes into a unified schema stored in Supabase (PostgreSQL).
- Historical snapshots are retained so the platform can detect *change* (premium movement, coverage reduction, payment lapses) rather than just state.

**Risk signals**
The composite risk score is a weighted function of signals grouped into four families:

| Family | Example signals |
|---|---|
| **Pricing** | Premium increase at last renewal vs. book median, rate jump relative to same carrier/state cohort, downgrade from multi-policy discount |
| **Engagement** | Days since last client-initiated contact, unread service emails, unanswered renewal outreach attempts |
| **Coverage** | Recent coverage reduction, dropped endorsements, LOB attrition (e.g., dropped umbrella while keeping auto) |
| **Lifecycle** | Tenure, life-event signals (address change, new driver, new vehicle), payment method changes, NSF history |

Each signal has an auditable contribution to the final score. Agents can click any score and see *why* — QuoteSync is explicitly not a black-box model.

**Surfacing**
- **Household detail view** shows the score, the top three contributing signals, and a recommended next action.
- **Book heatmap** lets the owner see risk concentration across the whole book at a glance — by geography, producer, carrier, or LOB.
- **Risk-sorted worklist** is the default landing screen for CSRs: highest risk, highest premium, earliest action due.

**Threshold actions**
Risk thresholds trigger workflow events automatically:
- **Score ≥ 75 (Critical):** escalates to the assigned producer, opens a "save" task, and locks the household from automated renewal emails so a human owns the conversation.
- **Score 50–74 (Watch):** adds to the weekly review queue, flags any upcoming renewal as "manual touch required."
- **Score < 50 (Healthy):** eligible for standard automated renewal workflows.

### 2. Renewal Pipeline & Follow-Up Tracking

The renewal pipeline is the daily driver for CSRs and account managers.

**Date tracking and prioritization**
- Every policy's effective and renewal dates are pulled from the AMS feed and reconciled against carrier-provided renewal offers when available.
- Policies are automatically bucketed into **30 / 60 / 90 day** windows, and within each window sorted by a prioritization score that combines premium, retention risk, and household value (sum of all active policies).
- Multi-policy households are rolled up so that a household with auto renewing in 45 days and home renewing in 55 days is worked as a single conversation, not two disconnected tasks.

**Follow-up workflows**
- **Automated cadence:** low-risk renewals receive a templated email sequence (initial notice, reminder, confirmation) scheduled against the renewal date. Templates are agency-owned and versioned.
- **Manual cadence:** watch-list and critical renewals drop into a staff member's task queue with a pre-populated talking-points card (rate change, coverage changes, competing-carrier context).
- Every touch — email, call log, note — is appended to the household timeline. Nothing lives in a CSR's personal inbox.

**Pipeline view**
- Kanban-style columns for `Upcoming (90)`, `Active (60)`, `Imminent (30)`, `In Progress`, `Retained`, `Lost`.
- Filters for producer, carrier, LOB, risk tier, and premium band.
- Owner-level rollup shows projected retained premium by week and flags any week where the expected retention rate falls below the trailing 12-week average.

**Staff assignment and task tracking**
- Renewals can be assigned by round-robin, by book-of-record producer, or by explicit owner override.
- Each task has an SLA clock. Overdue tasks escalate to the assigning manager.
- Workload balancing view shows open tasks, average age, and close rate per staff member so owners can spot CSRs who are drowning before they burn out.

### 3. Carrier Mix & Premium Analysis

This module answers the strategic questions agency owners usually only think about once a year — and usually too late.

**Carrier distribution**
- Book composition is broken down by carrier across several dimensions: policy count, total written premium, agency revenue (commission), and household count.
- Trend lines show how each carrier's share of the book has moved over the last 4, 8, and 12 quarters.

**Concentration risk**
- QuoteSync flags **premium concentration** when any single carrier exceeds a configurable threshold (default: 25% of total written premium).
- **Commission concentration** is tracked separately because a carrier can be a small share of premium but a disproportionately large share of agency revenue due to contingency bonuses — losing them hurts more than the premium number suggests.
- **Line-of-business concentration** surfaces hidden fragility (e.g., "72% of your commercial book is General Liability with a single carrier in a single state").
- Concentration alerts include a *blast-radius* estimate: if this carrier non-renewed your appointment tomorrow, which households would be directly affected, and what is the defensive rewrite cost?

**Revenue trending**
- Time-series views by carrier, LOB, producer, and segment (personal / commercial / life & health).
- Cohort analysis: retention curves for households acquired in a given quarter, broken down by acquisition source.
- Same-store growth: premium growth excluding new business, so the owner can see whether the existing book is actually expanding or just being replaced.

**Diversification insights**
QuoteSync does not just report the problem. For each flagged concentration risk it generates a **diversification recommendation**:
- Which households are the best candidates to rewrite to a secondary carrier (based on underwriting fit, price competitiveness, and household risk score).
- Which LOBs are underpenetrated in the existing book (e.g., 1,400 auto households, only 280 home policies — a concrete cross-sell universe).
- Which carrier appointments the agency does not yet have but should, based on the geographic and LOB profile of the book.

---

## Who It's For

QuoteSync is built for **independent insurance agencies with an active book of business between roughly 500 and 25,000 households** — large enough that institutional memory no longer scales, small enough that a full-time data team is not on the table.

### Agency Owner / Principal
- Opens the **Book Health dashboard** first thing Monday: retained premium last week, at-risk premium this week, carrier concentration alerts, producer workload.
- Uses **concentration analysis** quarterly to drive carrier appointment strategy and defend against non-renewal risk.
- Reviews **producer scorecards** to coach CSRs and identify training or capacity issues.

### Account Manager / CSR
- Lives in the **renewal pipeline** and the **risk-sorted worklist**.
- Works assigned renewals and save tasks; logs every touch; closes out retained renewals and documents lost ones with a structured reason code that feeds back into the risk model.

### Producer
- Sees their own book segment: which households are at risk, which renewals are theirs to own, which cross-sell opportunities the carrier mix module has surfaced in their territory.

### Operations / Back Office
- Manages data ingestion connectors, template libraries, SLA configuration, and staff assignments.
- Monitors data quality reports (missing fields, stale feeds, reconciliation errors).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| State / data | React Query against a typed Supabase client |
| Backend | Supabase (PostgreSQL, Row Level Security, Auth) |
| Server logic | Supabase Edge Functions (Deno) for ingestion, scoring, and notification workflows |
| Scheduled jobs | Edge Function cron for nightly recomputation of risk scores and pipeline rollups |
| Auth & permissions | Supabase Auth with agency-scoped RLS policies; role-based access for owner / manager / CSR / producer |
| Hosting | Vercel (frontend), Supabase (backend), regional data residency configurable |
| Observability | Structured logs from Edge Functions, query-level metrics in Supabase, frontend error reporting |

The codebase is past 255 commits and has been actively developed as a single cohesive product rather than a pile of prototypes.

## Architecture Overview

```
           ┌──────────────────────────────────────────────┐
           │  Agency Management System (AMS360, HawkSoft, │
           │  EZLynx, Applied Epic, CSVs, carrier feeds)  │
           └──────────────────┬───────────────────────────┘
                              │ scheduled export / SFTP / connector
                              ▼
           ┌──────────────────────────────────────────────┐
           │   INGESTION  — Supabase Edge Functions       │
           │   • schema mapping & normalization           │
           │   • historical snapshot & diff               │
           │   • data quality validation                  │
           └──────────────────┬───────────────────────────┘
                              │
                              ▼
           ┌──────────────────────────────────────────────┐
           │   STORAGE  — PostgreSQL (Supabase)           │
           │   • normalized book schema                   │
           │   • time-series snapshots                    │
           │   • RLS-enforced agency isolation            │
           └──────────────────┬───────────────────────────┘
                              │
                              ▼
           ┌──────────────────────────────────────────────┐
           │   PROCESSING  — nightly jobs                 │
           │   • retention risk scoring                   │
           │   • renewal pipeline bucketing               │
           │   • carrier concentration analysis           │
           │   • task & alert generation                  │
           └──────────────────┬───────────────────────────┘
                              │
                              ▼
           ┌──────────────────────────────────────────────┐
           │   INSIGHTS  — React + Vite frontend          │
           │   • dashboards, pipeline, worklists          │
           │   • drill-down explainability                │
           └──────────────────┬───────────────────────────┘
                              │
                              ▼
           ┌──────────────────────────────────────────────┐
           │   ACTION  — workflows & integrations         │
           │   • assigned tasks with SLA clocks           │
           │   • templated outbound communication         │
           │   • write-back notes to AMS where supported  │
           └──────────────────────────────────────────────┘
```

Data flow is strictly one-directional for the ingestion path: the AMS remains the system of record. QuoteSync is the system of *intelligence*, and writes back only structured notes, tasks, and activity logs — never policy data.

## Competitive Differentiation

QuoteSync is not trying to be AMS360, HawkSoft, or Salesforce. It is trying to be the layer those tools were never built to provide.

- **vs. Agency Management Systems (AMS360, HawkSoft, EZLynx, Applied Epic):** The AMS is a system of record optimized for transactions, documents, and compliance. It will tell you what a policy *is*. QuoteSync tells you what a policy is *about to do* — and what to do about it. We integrate with the AMS rather than replace it, which means no data migration, no staff retraining on a new policy entry workflow, and no risk to the agency's operational core.

- **vs. Generic CRMs (Salesforce, HubSpot, Zoho):** Generic CRMs model a sales pipeline for net-new prospects. Independent agencies do not primarily grow by net-new cold outreach; they grow by retaining and expanding the existing book. QuoteSync is built around the *renewal* and the *household*, not the *opportunity* and the *contact*. Every object in the model — policy, renewal, endorsement, carrier appointment, commission — is a first-class citizen. You cannot get that out of Salesforce without a six-figure implementation and a full-time admin.

- **vs. BI tools (Power BI, Tableau, Looker):** A BI tool can theoretically answer any of the questions QuoteSync answers. In practice, an agency would need to build the data model, the ETL, the semantic layer, the dashboards, *and* the workflow surface on top — and then maintain it. QuoteSync ships that whole stack pre-built for the insurance agency workflow.

- **vs. point solutions for retention scoring:** Standalone retention scoring vendors drop a number into the agency's existing workflow and leave the follow-through to humans. QuoteSync closes the loop: the score *drives* the renewal pipeline, *drives* task assignment, and *drives* the concentration strategy — in one product, with one login, owned by one team.

- **Built by an agent, for agents.** Every signal, threshold, and workflow in QuoteSync exists because someone who has actually run an agency said "this is the thing I wish I'd known on Monday morning." The product does not try to teach agencies a new vocabulary; it speaks the one they already use: household, binder, endorsement, book roll, contingency, appointment, non-renew.

---

## Metrics & KPIs the Platform Tracks

QuoteSync is opinionated about what success looks like for an agency. The platform exposes these as first-class metrics with trendlines, targets, and drill-downs:

**Retention & risk**
- Household retention rate (trailing 12 months)
- Premium retention rate (trailing 12 months)
- At-risk premium (sum of written premium on households scoring ≥ 50)
- Save rate on critical-risk households (retained / touched)
- Average risk score by producer, carrier, and LOB

**Renewal pipeline**
- Renewals due 30 / 60 / 90
- Renewal touch coverage (% of upcoming renewals with a logged touch in the SLA window)
- Average days-to-first-touch on renewals
- Projected retained premium by week
- Task SLA adherence by staff member

**Carrier mix & concentration**
- Written premium by carrier (share + trend)
- Commission by carrier (share + trend)
- Concentration alerts open
- Blast-radius exposure (premium at risk from top-1 and top-3 carriers)
- Diversification opportunity pipeline (households eligible for rewrite)

**Book health & growth**
- Same-store premium growth (excluding new business)
- Household lifetime value by cohort
- Cross-sell ratio (policies per household) trend
- New business vs. attrition (net book movement)

**Operational**
- Data feed freshness and reconciliation error rate
- Active users and session depth by role
- Time-to-insight: median seconds from login to first actionable task

---

## Future Roadmap

This section is a living placeholder. Cameron to finalize sequencing, dates, and scope.

- **Direct carrier integrations** — [TBD]
- **Predictive commission forecasting (contingency modeling)** — [TBD]
- **E&O risk scoring module** — [TBD]
- **Client-facing renewal portal** — [TBD]
- **Mobile companion app for producers in the field** — [TBD]
- **Native write-back to AMS360 / HawkSoft / Applied Epic** — [TBD]
- **AI-generated renewal talking points and save scripts** — [TBD]
- **Benchmarking against anonymized peer agencies** — [TBD]
- **Commercial lines expansion: loss-run ingestion and experience mod tracking** — [TBD]
- **Multi-agency / cluster / network rollups for aggregators** — [TBD]

---

*QuoteSync is an independent product and is not affiliated with or endorsed by AMS360, HawkSoft, EZLynx, Applied Epic, Salesforce, or any carrier named in this document.*
