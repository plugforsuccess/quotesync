# The Retention Engine — How It Works

This document explains the retention/OS engine added to QuoteSync: what it does,
how the pieces connect, and how it gets smarter over time.

## The one-sentence version

The engine turns the Allstate reports you already download into a daily, ranked
"work these renewals first — that's where a phone call actually saves money"
list, and quietly records what your team did to save each customer so it learns
which tactics work.

## The closed loop

```
        ┌──────────────────────────────────────────────────────────────┐
        │                                                              │
   (1) INGEST            (2) MEASURE          (3) RANK                 │
   Upload Allstate  ──▶  Observed retention ─▶ Expected saveable   ──┐ │
   reports               by product/tenure    premium per renewal   │ │
        ▲                + per-policy outcome  ("work these first")  │ │
        │                                                            ▼ │
   (6) REFINE                                              (4) ACT     │
   Learn which          ◀────────  (5) CAPTURE  ◀──────  Agents work  │
   tactics save                    Record the save        the ranked  │
   (per-tactic                     tactic on each         queue, log  │
   save rate)                      reached call           calls ──────┘
```

Every step exists in code today. Steps 1–5 run on real data now; step 6
(per-tactic learning) sharpens automatically as capture data accumulates.

## The pieces (and where they live)

### 1. Ingestion — `book_snapshots`, `policy_audit_snapshots`
**Where:** Retention page → **📖 Book Metrics** tab.
You upload two Allstate reports (same manual download you already do):

- **Premium & Profitability** → `book_snapshots` (one row per product per month).
  Carries Allstate's own computed **retention %**, the **prior-year baseline**,
  **tenure bands** (0–2 / 2–5 / 5+ yr), PIF counts, premium, and loss ratios.
- **Policy Audit** → `policy_audit_snapshots` (one row per policy per month).
  The **per-policy in-force census** — the observed "did this policy stay?"
  outcome, keyed on policy number so it joins to renewals and terminations.

Each upload **stacks** into a longitudinal series — the durable asset a single
downloaded spreadsheet can't give you. Other Allstate reports (Renewal Review,
Pending Cancellation, Termination) already feed `renewal_cases`, `pending_cases`,
and `lapse_events`.

### 2. Measurement — the scoreboard
The **📖 Book Metrics** tab renders a principal scoreboard from `book_snapshots`:
blended book retention vs. prior year, and a per-product **leak table** that
flags where the book is bleeding (low retention, negative point-variance, weak
new-business 0–2yr tenure).

### 3. Ranking — `expected saveable premium`
**Where:** Retention page → **🎯 Targeting** tab.

```
expected saveable premium = annual premium
                          × churn probability   (how likely this customer leaves)
                          × save lift            (how much a call changes that)
```

- **Churn probability** comes from your *observed* retention (by product +
  tenure band, from `book_snapshots`), multiplied by a **rate-shock multiplier**
  from this renewal's actual rate increase (`premium_change_pct`). Bigger
  increase → higher churn. Until a Premium & Profitability report is uploaded,
  churn falls back to sensible default priors, so the tab still works.
- **Save lift** starts as a conservative **30%** prior (a call recovers ~30% of
  would-be leavers) and becomes a *learned, per-tactic* number once capture data
  exists (step 6).

The tab lists active renewals ranked by saveable dollars: total saveable in the
queue, how concentrated it is (top-25 carry), and the per-case churn risk and
saveable $. This is the difference between "call by renewal date" and "call
where the money is."

### 4. Act — the queues
Service reps work their daily queue (`/my/today`, `/my/queue`); producers work
new business (`/my/leads`). The ranking above tells them what to prioritize.

### 5. Capture — `intervention_types`, intervention columns
**Where:** the log-call popover in `/my/queue`, once a call is marked **Reached**.

The agent taps **what they did to save the customer** — re-quote (deductible /
coverage), bundle, discount, competitor match, payment plan, explained the
increase, escalated, other — plus optional offered premium and competitor quote.
This is the one retention input **no Allstate report contains**; it only exists
because it's captured at the moment of the call. It's stored per attempt on
`renewal_attempts` / `pending_cancel_attempts`.

### 6. Refine — the learning loop
The `policy_elasticity_base` view joins each policy's **observed outcome**
(from `policy_audit_snapshots`) to its **rate change** (`renewal_cases`) and the
**intervention effort** logged against it. As captured calls + monthly Policy
Audit uploads accumulate, this dataset answers *"which tactic saves customers at
which rate band?"* — which (a) replaces the 30% save-lift prior with real
per-tactic numbers, and (b) is the proprietary, durable asset behind the
system-of-record pricing.

### 7. Monitor — is the workflow actually working?
**Where:** Retention page → **🩺 Health** tab (the principal's landing), plus
**🏎️ Velocity**, and the **Escalations** inbox.

The scoreboard measures *outcomes*; this layer measures whether the desk is
executing — and catches breakage before next month's net-retention number moves:

- **Health overview** — one green/amber/red status tying book health (net
  retention %, PIF vs prior-YE, trend from `book_snapshots`) to operational
  signals (save rate, premium saved vs at-risk, velocity, terminations,
  escalations, parked cases). Every tile drills in.
- **Workflow-leak alarms** (`useQueueHygiene`) — the leading indicator: **preventable
  lapses** (past deadline, *never called*), **about-to-lapse untouched** (due
  ≤7d, zero attempts), and an 8-week preventable-lapse trend. A leak forces the
  status off green; the rep sees a "call these before they lapse" banner on Today.
- **Save velocity** — saves/week (cancel saves + confirmed renewals) and premium
  preserved, per rep, with a recent-vs-prior-4-week trend. The *pace*, not just a
  lifetime rate.
- **Escalation hand-off** — when a rep can't close a case (needs a licensed-agent
  / principal decision), **Escalate to agent** records a `case_escalations` row,
  flags the case, writes an audit note, and notifies principals, who work the
  **Escalations inbox** (open → decide → resolve). Renewals *and* cancels.
- **Queue integrity** — snooze can't park a case within 14 days of its deadline
  (enforced in UI and on write); re-snoozes are counted so deferral can't become
  a silent hiding place.
- **Dollar capture** — renewal saves record final premium off the offer;
  cancellation saves record premium preserved (`saved_premium`).

## What's live now vs. what ramps with data

| Capability | Status |
|---|---|
| 🎯 Targeting ranks active renewals by saveable $ | **Live now** — uses real rate-change data (`premium_change_pct`) |
| Churn grounded in *your observed* retention (not priors) | **After** you upload a Premium & Profitability report |
| 📖 Book Metrics scoreboard (retention trend, leak table) | **After** Premium & Profitability upload; trend builds month over month |
| Per-policy observed outcomes (`policy_elasticity_base`) | **After** Policy Audit uploads |
| Intervention capture on calls | **Live now** |
| 🩺 Health status + workflow-leak alarms (preventable lapses) | **Live now** — operational signals; net-retention tile fills after a Premium & Profitability upload |
| 🏎️ Save velocity (per-rep, weekly) | **Live now** |
| Escalation hand-off → principal Escalations inbox | **Live now** |
| Per-tactic save-lift learning | **Ramps** as captured calls + monthly Policy Audits accumulate |

## To light it up

On the Retention page → **📖 Book Metrics** tab, upload:
1. **Premium & Profitability** report → scoreboard populates; Targeting churn
   switches from priors to your observed retention.
2. **Policy Audit** report → per-policy outcomes fill `policy_elasticity_base`.

Then keep uploading both monthly. The longer the series, the sharper the engine.
