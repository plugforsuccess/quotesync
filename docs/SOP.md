# QuoteSync — Standard Operating Procedures

The operating standards every role follows in QuoteSync, and the KPIs each is
accountable for. Pairs with `docs/USER_MANUAL.md` (how to use each screen) and
`docs/RETENTION_ENGINE.md` (how the engine works).

**SOP go-live: July 1, 2026.** Everything before is the preserved *baseline*;
the clean "SOP era" is measured from go-live. Nothing is deleted — the baseline
is how we prove the SOPs worked.

---

## 0. Data-integrity standards — non-negotiable (feed every KPI)

Bad data in = useless analytics out. These apply to everyone:

1. **Never select "Insured Request — All Other."** Always record the *true*
   termination reason. (Tracked by the Data Quality KPI; target 0%.)
2. **Capture the save tactic on every reached call** — the intervention picker
   in the log-call popover (re-quote, bundle, discount, competitor match,
   payment plan, explained increase, etc.).
3. **Mark every outcome same-day** — saved / lost / confirmed / renewed.
4. **Upload reports on cadence and in order** (Section 4).

---

## 1. Service / Retention Rep — daily

**Home base:** `/my/today` → `/my/queue`.

1. **Clock in** at `/punch`.
2. **Work `/my/today`** top-to-bottom — the queue is ranked; start at the top.
3. **Log every call** in `/my/queue`. On *Reached*: pick the outcome **and the
   save tactic**. Schedule a callback if needed.
4. **Hit your daily call target (8).**
5. **Resolve same-day** — mark saved/lost; on a loss, record the *true* reason.

| KPI | Target | Where |
|---|---|---|
| Calls logged / day | **8** | Today / Scorecard |
| Cancel save rate | trend ↑ | Scorecard |
| Renewal retain rate | trend ↑ | Scorecard |
| Contact & reach rate | trend ↑ | Scorecard |
| Premium saved / retained | trend ↑ | Scorecard |
| Promise follow-through | trend ↑ | Scorecard |
| Connected (verified) calls → bonus | ≥ plan threshold | My Scorecard |
| Intervention captured on reached calls | **100%** | (data standard) |

---

## 2. Producer / Sales — daily

**Home base:** `/my/leads`.

1. **Clock in** at `/punch`.
2. **Clear follow-ups due**, then work `/my/leads` by rank.
3. **Log every touch**; schedule the next follow-up; snooze dead-ends.
4. **Quote/bind in Lead Manager**, then disposition the lead.

| KPI | Target | Where |
|---|---|---|
| Touches / day · follow-ups due cleared | target met | My Leads |
| Outbound calls | **75 / week · 15 / day** | Scorecard |
| **VC items / month** | **60** (elite 70 · meets 60 · min 50) | Scorecard |
| Outbound activity grade | A90 · B75 · C55 | Scorecard |
| Composite grade | 60% production + 40% activity | Scorecard |
| Written premium / items (MTD) | vs goal | Scorecard / Planning |
| Funnel conversion · lead quality | trend ↑ | Funnel Dashboard |

---

## 3. Agency Principal — weekly & monthly

**Daily/weekly:** 🎯 Targeting (work the saveable-premium list) · ⚡ At Risk.

**Every Monday — Weekly Review (`/agency/weekly-review`):**
- Where We Stand (NB, renewals, active cancels, P0/P1, save rate, throughput).
- **Data Quality KPI** — drive no-reason rate to **0%** (baseline 43%).
- What Slipped (incl. overdue uploads/cadences).

**Monthly — feed the engine (📖 Book Metrics):**
- Upload **Policy Audit** (early, ~5th) and **Premium & Profitability** (~15th–25th).
- Review blended book retention vs prior year, the per-product leak table,
  and the action-class mix (drive *preventable* churn down).

| KPI | Target | Cadence |
|---|---|---|
| Blended book retention vs PY | ↑ | monthly |
| PIF count + variance | ↑ | monthly |
| Per-product retention / 0–2yr tenure | flag <75% | monthly |
| Action-class mix (preventable/partial/external) | shrink preventable | monthly |
| No-reason termination rate | **0%** | weekly/monthly |
| Saveable premium in queue | worked down | ongoing |
| Save rate (30d) · producer throughput | ↑ | weekly |
| AI calling (if enabled): confirmed/consent/cost per confirmed | watch | weekly |
| Management cadence (check-in 7d / scorecard 31d / comp 90d / eval 365d) | current | per cadence |

---

## 4. Upload cadence & order (Principal)

The UI shows order + due windows (sign-in checklist + Import-tab stepper).

| # | Report | Where | Window |
|---|---|---|---|
| 1 | Termination | Import | 1st–5th |
| 2 | Cancellation Audit | Import | monthly |
| 3 | Pending Cancellation | Import | **8th–10th *and* 20th–25th** |
| 4 | Renewal | Import | 8th–10th |
| 5 | Cross-Sell Audit | Import | 8th–12th |
| 6 | Policy Audit | 📖 Book Metrics | 5th–15th |
| 7 | Premium & Profitability | 📖 Book Metrics | 15th–25th |

Order 1–5 matters (they cross-reference during the queue diff — Termination
first). 6–7 are independent. Pending Cancellation is **twice a month** — the
cancel cycle is continuous; skipping the second pass lets mid-month cancels
lapse unworked.

---

## 5. The KPI register (accountability summary)

Every accountability KPI has an **owner · target · cadence · the action that
keeps it healthy · where to view it** — captured per role in Sections 1–3.
Diagnostic metrics (funnel step drop-off, lead-quality distribution, channel
performance, comp bands, trailing/YTD commission, time-&-attendance coverage,
cross-sell, referrals) are reviewed in planning but are not per-person daily
targets.

## 6. How go-live measurement works

- **Baseline** = all data before 2026-07-01 (kept, never deleted).
- **SOP era** = on/after 2026-07-01.
- The **Data Quality KPI** shows baseline vs. SOP era side by side; the
  **Reasons tab → "Since SOP launch"** toggle filters reason analytics to the
  clean era. Watch the SOP-era numbers improve against the baseline — that
  delta is the proof the SOPs are working.
