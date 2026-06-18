# QuoteSync — User Manual (by Role)

A practical, role-based guide to running the agency in QuoteSync. For how the
retention engine works under the hood, see `docs/RETENTION_ENGINE.md`.

Roles in QuoteSync:
- **Platform Admin** — operates the platform across agencies.
- **Agency Principal** — owns one agency; sees everything.
- **Producer (Sales)** — writes new business.
- **Service / Retention Rep** — keeps existing customers (renewals + cancels).

A principal can also "wear a hat" (Sales or Service) via the persona switcher to
work alongside the team.

---

## 1. Agency Principal

You own the book. Your day is: know where the book is leaking, point the team at
the highest-value work, and keep the data fed.

### Daily / weekly
- **Retention → 🎯 Targeting** — your highest-leverage screen. Active renewals
  ranked by **expected saveable premium**. Shows total saveable dollars in the
  queue and the per-case churn risk. Tell the team to start at the top.
- **Retention → ⚡ At Risk** — pending cancellations and at-risk renewals to work.
- **Retention → 📖 Book Metrics** — your book scoreboard: blended retention vs.
  prior year and a per-product leak table (red = bleeding). Watch the
  point-variance and the new-business 0–2yr tenure numbers.
- **Weekly Operating Review** (`/agency/weekly-review`) — what slipped, where you
  stand, this week's focus.

### Monthly — feed the engine (this is the important habit)
On **Retention → 📖 Book Metrics**, upload from Allstate Dash:
1. **Premium & Profitability** report → updates the scoreboard and grounds the
   Targeting churn numbers in your real retention.
2. **Policy Audit** report → records each policy's in-force outcome (the data
   that proves what your team's calls actually saved).

Also keep uploading the existing reports on **Retention → ⬆ Import**:
**Renewal Review**, **Pending Cancellation**, and the monthly **Termination**
report. The more regularly you upload, the sharper everything downstream gets.

### Management
- **Staff Performance** (`/agency/staff-performance`) and **Planning**
  (`/agency/planning`) — scorecards, capacity, production goals.
- **Comp Schedules / Producer Comp** — compensation modeling.
- **Team** (`/agency/team`) and **Settings** — employees, invites, carrier config,
  termination-reason aliases.
- **Reasons / Terminations / Net Growth / Trends** tabs on Retention — the
  analytics on why customers leave and how the book is moving.

---

## 2. Producer (Sales) — New Business

Your job is to turn assigned leads into bound policies. Your home base is the
new-business queue.

### Your daily queue — `/my/leads` ("Leads" in the nav)
- A ranked list of your open leads: **follow-ups due first**, then by lead score,
  then oldest. Each card shows the lead's name, **click-to-call phone**, product
  intent, location, status, lead score, enrichment/risk flags, and attempts.
- The header tracks **touched today vs. your daily target** and how many
  follow-ups are due.
- Per lead you can:
  - **Log Touch** — record a call result (reached / no answer / voicemail / etc.)
    with a note. A first touch moves a new lead to "contacted."
  - **📅 Follow-up** — schedule the next follow-up (floats the lead to the top
    when due) with a note.
  - **💤 Snooze** — push a lead out a few days so it stops cluttering the queue.
  - **Open →** — jump to the full lead detail page for messaging, quoting, and
    disposition (close won / close lost).

### Also yours
- **Cross-Sell** (`/agency/cross-sell`) — existing customers with a new-product
  opportunity.
- **Scorecard** (`/my/scorecard`) — your production and bonus.
- **Referrals** and **Punch** (time clock).

---

## 3. Service / Retention Rep — Keep the Book

Your job is to save renewals and pending cancellations. Your home base is your
daily queue, and **what you record on each call now matters more than ever**.

### Your day — `/my/today` and `/my/queue`
- **Today** shows your unified "what to dial next" list (cancels + renewals),
  ranked by urgency, with your **daily call target**.
- **My Queue** is the working surface. For each case:
  - **Log Call** — pick the result. If you **Reached** the customer, you'll see
    the new **"What did you do to save them?"** picker (see below).
  - **📅 Callback** — log as reached + schedule a callback.
  - **Mark Saved / Lost / Won't Renew**, **Snooze**, etc.

### NEW — capture the save tactic (do this on every reached call)
When you mark a call **Reached**, tap **what you actually did**:
- Re-quote (raised deductible / adjusted coverage)
- Bundled policies · Applied discount · Matched a competitor quote
- Payment plan / EFT · Explained the increase · Escalated · Other
- If you re-quoted or matched a competitor, enter the **premium you quoted** (and
  the competitor + their quote).

It takes a few seconds and it's optional — but it's how the system learns which
moves actually save customers. "Called → saved" tells us nothing; "bundled →
saved at a 20% increase" builds the playbook.

### Also yours
- **Scorecard** (`/my/scorecard`) — your save rate, premium saved, bonus.
- **Punch** (time clock).

---

## 4. Platform Admin

You operate the platform across agencies (not a single agency's book).

- **/admin** — platform overview.
- **/admin/agencies** — all agencies; **/admin/agencies/new** to onboard a new one.
- **/admin/agency/employees** — employee roster across the platform.
- **/admin/settings** — platform settings.
- **/admin/audit** — the audit trail.

Agency-level work (retention, leads, planning) is done from the agency routes
above, as the agency principal.

---

## Quick reference — where the new features live

| Feature | Where | Who |
|---|---|---|
| 🎯 Saveable-premium targeting | Retention → **Targeting** | Principal (and reps via the worked queues) |
| 📖 Book scoreboard + report upload | Retention → **Book Metrics** | Principal |
| Intervention capture (save tactic) | `/my/queue` → Log Call → *Reached* | Service / Retention reps |
| New-business queue | `/my/leads` | Producers (Sales) |
| Per-policy elasticity foundation | `policy_elasticity_base` (data layer) | Engine (built from uploads + captures) |

## The one habit that makes all of it work

1. **Principal:** upload Premium & Profitability + Policy Audit (and the renewal/
   cancel/termination reports) every month.
2. **Reps:** record the save tactic on every reached call.

Do those two things and the engine compounds — the scoreboard trends, the
targeting sharpens, and the "which interventions save customers" dataset becomes
the thing the business is actually built on.
