# Report File Naming Convention

Local file labels for every report uploaded to QuoteSync. Companion to
`REPORT_INGESTION.md` (date filters / due windows) and `docs/SOP.md`
(upload order).

Pattern: `PREFIX_YYYY_MM[_DD]` — type prefix, then the **period the data
covers**, zero-padded so files sort by type then date.

## Label patterns

| Report | Cadence / window | Label pattern | Example |
|---|---|---|---|
| Termination | Monthly, 1st–5th, covers prior month | `TERM_YYYY_MM` | `TERM_2026_05` |
| Cancellation Audit | Monthly, 8th–10th | `CXLAUDIT_YYYY_MM` | `CXLAUDIT_2026_06` |
| Pending Cancellation | Twice monthly (8th–10th, 20th–25th), point-in-time snapshot | `PENDCXL_YYYY_MM_DD` | `PENDCXL_2026_06_09` |
| Renewal | Monthly, 8th–10th | `RENEW_YYYY_MM` | `RENEW_2026_06` |
| Cross-Sell Audit | Monthly, 8th–12th | `XSELL_YYYY_MM` | `XSELL_2026_06` |
| Policy Audit | Monthly, 5th–15th, covers prior month | `POLAUDIT_YYYY_MM` | `POLAUDIT_2026_05` |
| Premium & Profitability | Monthly, 15th–25th, covers prior production month | `PREMPROF_YYYY_MM` | `PREMPROF_2026_05` |
| Daily Call Log | Daily, by call date | `CALLLOG_YYYY_MM_DD` | `CALLLOG_2026_06_10` |
| Daily Queue Report | Daily/weekly, by report date | `QUEUE_YYYY_MM_DD` | `QUEUE_2026_06_10` |
| Weekly User Summary | Weekly, Friday+, by week's Monday | `WEEKSUM_YYYY_MM_DD` | `WEEKSUM_2026_06_08` |

## Rules

1. **Name by coverage, not download date.** The May termination report
   downloaded June 11 is `TERM_2026_05`. Reports that lag a month
   (Termination, Policy Audit, Premium & Profitability) always carry the
   covered month. Snapshot reports carry the month (or day) they were
   pulled.
2. **One file = one period.** Never export a range that spans two report
   months — there is no honest name for it, and the import month-tags
   everything in the file as one period.
3. **Snapshot reports use the full date** when more than one pull per
   month is possible (Pending Cancellation: `PENDCXL_2026_06_09` and
   `PENDCXL_2026_06_23`).
4. **Cross-sell direction suffix.** If Allstate forces separate exports
   per direction, append `HAS-PITCH`:
   `XSELL_2026_06_AUTO-HO` (auto customers, pitching home),
   `XSELL_2026_06_HO-AUTO`, `XSELL_2026_06_MH-AUTO` (mobile home,
   pitching auto). A single combined export needs no suffix.
5. **Keep the `.xlsx` extension.** When renaming, type only the label —
   the OS preserves the extension. Don't retype it (risk of
   `.xlsx.xlsx` with hidden extensions) and don't delete it (the upload
   dialog filters by extension).
6. **Rename at download time**, before the file lands in the folder —
   raw portal names (`BOB Termination Audit Report_05_01_2026 - ...`)
   are where disorder creeps in.

## Folder layout

```
Reports/
  2026/                    ← pending queue: not yet committed in portal
    TERM_2026_05.xlsx
    CXLAUDIT_2026_06.xlsx
    archive_uploaded/      ← moved here ONLY after commit confirmation
      TERM_2026_04.xlsx
      ...
```

- Flat by year — no per-type or per-month subfolders; the prefixes do
  the grouping and per-month folders break for prior-month reports.
- A file in the year root means "not yet committed." Empty root = fully
  caught up.
- Move to `archive_uploaded/` only after the portal's commit
  confirmation, never on upload attempt. This matters most for the
  Cross-Sell Audit, whose commit creates leads and does not de-duplicate
  on re-upload.
- Re-downloads go back in the root and replace the archived copy when
  committed — one file per type + period.
- Roll a new year folder each January; keep old years as the audit
  trail (the portal stores each upload's filename, and some source data
  — e.g. call logs — purges from the system after 180 days, leaving the
  local archive as the only copy).
