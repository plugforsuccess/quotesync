# Scope — Full Book / In-Force Roster Importer

### Goal
Make **every active customer** in the agency's book findable in QuoteSync —
not just those currently on a renewal, cancel, new-business, or lapse list.
Today the customer directory is built only from those work-list reports, so a
steady customer (active policy, not up for renewal, not cancelling) is invisible
to Customer Search and can't be linked to a household. This is also the missing
**in-force denominator** the OS audit flagged for a real book-retention metric.

> An **interim** is already live: customers named on a service task become
> searchable/linkable (see `customer_directory` migration). This document scopes
> the durable fix.

---

## 0. The one prerequisite — does the report exist?
We need a **full in-force policy roster** export from Allstate — one row per
active policy with the customer's name and contact info. In Allstate tooling this
is usually one of:
- **"Book of Business"** / **"Policy List"** / **"Policies in Force (PIF)"** export
  (Allstate Gateway / Dash / Agency reporting), or
- A **customer/household roster** export.

**Action for the agency:** confirm you can export a complete in-force policy or
customer list (CSV/XLSX) that includes at least: policy number, customer name,
product/line, status, and (ideally) phone/email/zip and premium. **If that
export exists, send a sample (headers + a few rows, PII redacted is fine)** and
this becomes a few days of work. If it doesn't, we stay on the interim.

---

## 1. Data model
New table **`book_policies`** (per-policy in-force census, agency-scoped):

| column | notes |
|---|---|
| `id` | uuid pk |
| `agency_id` | uuid |
| `policy_no` | text |
| `customer_name` | text |
| `product` / `product_key` | normalized line |
| `status` | in_force / cancelled / etc. |
| `premium` | numeric (annualized) |
| `phone`, `email`, `zip` | contact |
| `effective_date`, `term`, `tenure_years` | optional |
| `as_of` | snapshot date (the export's date) |
| `upload_batch_id` | uuid |
| `created_at`, `updated_at` | |

Unique on `(agency_id, policy_no)` — re-imports **upsert** (refresh the census).

---

## 2. Importer
Mirror the existing retention uploads (`RetentionImport.jsx` pattern):
1. **Upload + parse** the Allstate book export (XLSX/CSV) — a parser keyed to its
   column shape (like the Renewal Review / Pending Cancellation parsers).
2. **Column mapping + preview** (rows added / updated), with a commit step.
3. **Upsert** into `book_policies` by `(agency_id, policy_no)`; mark policies
   absent from the new export as `cancelled`/inactive (true in-force snapshot).
4. Stamp `as_of` from the export date so we keep monthly snapshots.

UI: a new card on the Retention import / admin surface ("Import book of business").

---

## 3. Wire into the directory (replaces the interim)
Add `book_policies` (status in_force) as the **primary** source of
`customer_directory`, so the directory reflects the **whole book** instead of just
work-list activity. Keep renewal/cancel/etc. for their open-work counts. The
service-task interim source can then be dropped (or kept as a fallback).

Result: Customer Search + household linking + service-task linking all cover
**every active customer**, with accurate active-policy counts and products.

---

## 4. Bonus it unlocks
- **Book-level retention metric** — `book_policies` gives the **in-force
  denominator** (PIF at T0 vs T1) that today's per-worked-case save rate lacks.
  Combined with `lapse_events`, you get true "% of the book retained."
- **Household completeness** — every policy a customer holds shows on their
  household page, not just the ones currently being worked.
- **Cross-sell targeting** — monoline customers (1 active product) become
  visible across the whole book, not just when they hit a work list.

---

## 5. Effort & open questions
- **Effort:** ~2–4 engineer-days once we have a sample export (table + parser +
  upload UI + directory rewire). Larger if the export needs heavy normalization
  or there are multiple report shapes.
- **Open questions:**
  1. Does the agency have access to a full in-force export? (the prerequisite)
  2. What's its exact column shape? (drives the parser)
  3. Cadence — monthly snapshot, or on demand?
  4. Does it include contact info (phone/email), or do we keep pulling that from
     the work-list records?

**Next step:** get a sample of the export → confirm feasibility → build.
