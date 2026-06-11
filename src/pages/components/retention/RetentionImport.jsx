// src/pages/components/retention/RetentionImport.jsx
// Extracted from BookHealthPage.jsx — Import tab with dual upload layout.

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { computePriorityTier } from "../../../lib/retentionPriority";
import { isRewriteReason } from "../../../lib/retentionRewrite";
import CrossSellUploadModal from "../cross-sell/CrossSellUploadModal";

async function syncRetentionQueue(supabase) {
  try {
    await supabase.rpc('auto_resolve_stale_renewals');
  } catch (err) {
    // Non-fatal — log but don't surface to user
    // Queue will self-correct on next cron run (6am ET daily)
    console.warn('[retention sync] queue sync failed:', err.message);
  }
}

function friendlyUploadError(raw = "") {
  const msg = raw.toLowerCase();

  if (msg.includes("conflict do update command cannot affect row a second time"))
    return "Your report contains duplicate policy numbers. Remove the duplicates and re-upload.";

  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("using expression"))
    return "Permission error — your session may have expired. Please refresh the page and try again.";

  if (msg.includes("unique constraint") || msg.includes("unique or exclusion constraint") || msg.includes("duplicate key"))
    return "Some rows already exist. Try re-uploading — the duplicate rows will be skipped automatically.";

  if (msg.includes("violates not-null constraint"))
    return "One or more required fields are missing. Check that the report has Policy Number and all required columns.";

  if (msg.includes("invalid input syntax for type"))
    return "A value in the report couldn't be read — check for invalid dates or non-numeric values.";

  if (msg.includes("could not find required columns"))
    return "Required columns are missing. Make sure the report includes Policy No and Cancel Date columns.";

  if (msg.includes("no valid rows"))
    return "No readable rows found. Check that the file isn't empty and has a Policy No column.";

  if (msg.includes("file read failed"))
    return "The file couldn't be opened. Try saving it again as .xlsx or .csv and re-uploading.";

  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch"))
    return "Connection error — check your internet and try again.";

  return "Something went wrong. If this keeps happening, screenshot this and contact support.";
}


function normaliseProduct(raw = "") {
  const v = raw.toLowerCase().trim();
  // specialty auto MUST be checked before standard auto — both contain "auto"
  if (v.includes("specialty auto") || v.includes("auto - special") || v.includes("motorcycle") || v.includes("motor home") || v.includes("off-road") || v.includes("trailer")) return "specialty_auto";
  if (v.includes("standard auto") || v.includes("private passenger") || v.includes("auto -") || v.includes("auto–")) return "auto";
  // manufactured/mobilehome MUST be checked before ho — "mobilehome" doesn't contain "home" but "manufactured home" does
  if (v.includes("manufactured") || v.includes("mobilehome") || v.includes("mobile home")) return "manufactured";
  if (v.includes("condo") || v.includes("ho6")) return "condo";
  if (v.includes("home") || v.includes("ho3")) return "ho";
  if (v.includes("rent") || v.includes("ho4")) return "renters";
  if (v.includes("landlord")) return "landlord";  // separate from ho — same pts but tracked independently
  if (v.includes("umbrella") || v.includes("pup")) return "pup";
  if (v.includes("boat") || v.includes("watercraft") || v.includes("inland marine")) return "boat";
  if (v.includes("motor club")) return "motor_club";
  return "other";
}

const COL_MAP = {
  policy_no:      ["policy number", "policy no", "policy #", "pol no", "pol #"],
  customer_first: ["insured first name", "first name"],
  customer_last:  ["insured last name", "last name"],
  customer:       ["customer name", "insured name", "insured", "name", "customer"],
  product:        ["product name", "line code", "product code", "line of business", "lob", "coverage type", "policy type", "product"],
  premium:        ["premium new($)", "premium new", "written premium", "annual premium", "premium", "policy premium"],
  prior_premium:  ["premium old($)", "premium old", "prior premium", "previous premium", "original premium"],
  phone:          ["insured phone", "phone number", "phone", "mobile", "cell"],
  items:          ["no. of items", "item count", "items", "number of items"],
  cancel_date:    ["pending cancel date", "termination effective", "cancellation date", "cancel date", "cancel effective date", "eff cancel date", "cancellation effective date"],
  amount_due:     ["amount due($)", "amount due", "amt due", "balance due"],
  cancel_status:  ["status"],
  original_year:  ["original year", "orig year", "policy year"],
};



function findCol(headers, aliases) {
  for (const a of aliases) {
    const idx = headers.findIndex(h => h?.toString().toLowerCase().trim().includes(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ─── Upload Parser ─────────────────────────────────────────────────────────────

function parseReport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        let headerRow = 0;
        for (let i = 0; i < Math.min(10, raw.length); i++) {
          const idx = findCol(raw[i].map(String), COL_MAP.policy_no);
          if (idx >= 0) { headerRow = i; break; }
        }

        const headers = raw[headerRow].map(h => h?.toString().toLowerCase().trim());
        const pi = findCol(headers, COL_MAP.policy_no);
        const ciFirst    = findCol(headers, COL_MAP.customer_first);
        const ciLast     = findCol(headers, COL_MAP.customer_last);
        const ciCombined = findCol(headers, COL_MAP.customer);
        const pri = findCol(headers, COL_MAP.product);
        const pmi = findCol(headers, COL_MAP.premium);
        const di = findCol(headers, COL_MAP.cancel_date);
        const phoneI     = findCol(headers, COL_MAP.phone);
        const priorPmI   = findCol(headers, COL_MAP.prior_premium);
        const itemsI     = findCol(headers, COL_MAP.items);
        const amountDueI    = findCol(headers, COL_MAP.amount_due);
        const cancelStatusI = findCol(headers, COL_MAP.cancel_status);
        const origYearI     = findCol(headers, COL_MAP.original_year);

        if (pi < 0 || di < 0) throw new Error("Could not find required columns (Policy No, Cancel Date). Check report format.");

        const today = new Date().toISOString().slice(0, 10);
        const rows = [];

        for (let i = headerRow + 1; i < raw.length; i++) {
          const row = raw[i];
          const policyNo = row[pi]?.toString().trim();
          if (!policyNo) continue;

          let cancelDate = today;
          if (di >= 0 && row[di]) {
            const d = row[di] instanceof Date ? row[di] : new Date(row[di]);
            if (!isNaN(d)) cancelDate = d.toISOString().slice(0, 10);
          }

          let premium = null;
          if (pmi >= 0 && row[pmi]) {
            const p = parseFloat(row[pmi].toString().replace(/[$,]/g, ""));
            if (!isNaN(p)) premium = p;
          }

          let customerName = null;
          if (ciFirst >= 0 && ciLast >= 0) {
            const first = row[ciFirst]?.toString().trim() || "";
            const last  = row[ciLast]?.toString().trim() || "";
            if (first || last) customerName = `${first} ${last}`.trim();
          } else if (ciCombined >= 0) {
            customerName = row[ciCombined]?.toString().trim() || null;
          }

          const phone = phoneI >= 0 ? (row[phoneI]?.toString().trim() || null) : null;

          let prior_premium = null;
          if (priorPmI >= 0 && row[priorPmI]) {
            const p = parseFloat(row[priorPmI].toString().replace(/[$,]/g, ""));
            if (!isNaN(p)) prior_premium = p;
          }

          const item_count = itemsI >= 0 ? (parseInt(row[itemsI]) || 1) : null;

          const stage = (cancelStatusI >= 0 && row[cancelStatusI]?.toString().trim() === 'Cancelled')
            ? 'cancelled'
            : 'pending_cancel';

          const parsedRow = {
            policy_no:             policyNo,
            customer_name:         customerName,
            product:               normaliseProduct(pri >= 0 ? row[pri]?.toString() : ""),
            premium_at_risk:       premium,
            prior_premium,
            phone,
            item_count,
            cancel_effective_date: cancelDate,
            amount_due:    amountDueI >= 0 ? (parseFloat(String(row[amountDueI]).replace(/[$,]/g, '')) || null) : null,
            original_year: origYearI >= 0 ? parseInt(row[origYearI]) || null : null,
            stage,
          };
          parsedRow.priority_tier = computePriorityTier(parsedRow);
          rows.push(parsedRow);
        }

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Diff Engine ───────────────────────────────────────────────────────────────

function diffReport(parsed, existing, lapseMap = new Map()) {
  const today = new Date().toISOString().slice(0, 10);
  const makeKey = (pno, cdate) => `${pno.toLowerCase()}|${cdate}`;
  const parsedKeys = new Set(parsed.map(r => makeKey(r.policy_no, r.cancel_effective_date)));

  const activeStatuses = [
    'pending', 'attempting', 'left_voicemail', 'contacted',
    'payment_plan_requested', 'promise_to_pay', 'promise_broken', 'pending_review',
  ];
  const activeEvents = existing.filter(e => activeStatuses.includes(e.status));
  const activeKeys = new Map(
    activeEvents.map(e => [makeKey(e.policy_no, e.cancel_effective_date), e])
  );

  const toAdd = [];
  const toUpdate = [];
  const duplicates = [];
  const autoLost = [];      // confirmed lost in lapse_events — auto-closed
  const autoRewritten = []; // cancelled only to rewrite/transfer — RETAINED, not lost
  const toReview = [];   // absent from report, no lapse record — verify in Allstate

  for (const row of parsed) {
    const key = makeKey(row.policy_no, row.cancel_effective_date);
    if (activeKeys.has(key)) {
      const ex = activeKeys.get(key);
      const needsUpdate =
        ex.last_seen_on !== today ||
        ex.premium_at_risk !== row.premium_at_risk ||
        (row.stage === 'cancelled' && ex.stage !== 'cancelled') ||
        (row.amount_due != null && ex.amount_due !== row.amount_due);
      if (needsUpdate) {
        toUpdate.push({
          id: ex.id,
          last_seen_on: today,
          premium_at_risk: row.premium_at_risk,
          prior_premium: row.prior_premium,
          ...(row.stage === 'cancelled' ? { stage: 'cancelled', amount_due: row.amount_due } : {}),
        });
      } else {
        duplicates.push(key);
      }
    } else {
      const priorEvents = existing.filter(
        e => e.policy_no.toLowerCase() === row.policy_no.toLowerCase()
      );
      const cycle = priorEvents.length + 1;
      toAdd.push({ ...row, cycle, first_seen_on: today, last_seen_on: today });
    }
  }

  // Classify absent active cases
  for (const e of activeEvents) {
    if (parsedKeys.has(makeKey(e.policy_no, e.cancel_effective_date))) continue;

    const cancelDate = new Date(e.cancel_effective_date + 'T00:00:00');
    const daysPastCancel = Math.floor((new Date() - cancelDate) / 86400000);
    const lapseRecord = lapseMap.get(e.policy_no);

    if (lapseRecord) {
      // Authoritative — confirmed in termination report. But a "Cancel/Rewrite"
      // termination means the customer was KEPT on a new policy number, not
      // lost — route those to the retained (rewritten) bucket instead.
      const record = {
        id: e.id,
        policy_no: e.policy_no,
        customer_name: e.customer_name,
        product: e.product,
        premium_at_risk: e.premium_at_risk,
        cancel_effective_date: e.cancel_effective_date,
        lapse_date: lapseRecord.lapse_date,
        termination_reason: lapseRecord.termination_reason,
        resolution_date: lapseRecord.lapse_date || today,
      };
      if (isRewriteReason(lapseRecord.termination_reason)) {
        autoRewritten.push(record);
      } else {
        autoLost.push(record);
      }
    } else if (daysPastCancel <= 0) {
      // Cancel date is today or future — still in active window.
      // Do nothing — leave status unchanged, don't surface in review.
    } else {
      // Cancel date has passed but no lapse record.
      // Absence = ambiguous (paid OR lapsed). Must verify in Allstate.
      toReview.push({
        id: e.id,
        policy_no: e.policy_no,
        customer_name: e.customer_name,
        product: e.product,
        premium_at_risk: e.premium_at_risk,
        cancel_effective_date: e.cancel_effective_date,
        last_seen_on: e.last_seen_on,
        attempt_count: e.attempt_count,
        daysPastCancel,
        autoReason: e.attempt_count === 0 ? 'no_contact_missing' : 'worked_case_missing',
      });
    }
  }

  return { toAdd, toUpdate, duplicates, autoLost, autoRewritten, toReview };
}

// ─── Auto-Resolve Review Panel ──────────────────────────────────────────────

function AutoResolveReviewPanel({ cases, decisions, onDecide, onConfirmAll }) {
  const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n || 0)}`;

  const allDecided = cases.length > 0 && cases.every(c => decisions[c.id]);
  const counts = {
    paid: Object.values(decisions).filter(d => d === 'auto_resolved').length,
    lost: Object.values(decisions).filter(d => d === 'lost').length,
    keep: Object.values(decisions).filter(d => d === 'keep').length,
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--qs-warning)',
        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8
      }}>
        ⚠ {cases.length} cases not found in this report — review before closing
      </div>

      <div style={{
        fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 16,
        background: 'var(--qs-elevated)', borderRadius: 6, padding: '8px 12px'
      }}>
        These policies were active but absent from this report. Confirm whether
        they paid, mark as lost, or keep active for follow-up.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-ghost" style={{ fontSize: 12 }}
          onClick={() => cases.forEach(c => onDecide(c.id, 'auto_resolved'))}>
          Mark All Paid
        </button>
        <button className="btn-ghost" style={{ fontSize: 12 }}
          onClick={() => cases.forEach(c => onDecide(c.id, 'keep'))}>
          Keep All Active
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {cases.map(c => {
          const decision = decisions[c.id];
          return (
            <div key={c.id} style={{
              background: 'var(--qs-elevated)',
              border: `1px solid ${
                decision === 'auto_resolved' ? '#10B98133'
                : decision === 'lost' ? '#EF444433'
                : decision === 'keep' ? '#3B82F633'
                : 'var(--qs-border)'
              }`,
              borderRadius: 8, padding: '10px 14px',
              display: 'grid', gridTemplateColumns: '1fr auto',
              gap: 12, alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>
                  {c.customer_name || 'Unknown'}{' '}
                  <span style={{ fontWeight: 400, color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                    {c.policy_no}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>
                  {c.product?.toUpperCase()} · {fmt$(c.premium_at_risk)} at risk
                  · Cancel {c.cancel_effective_date} · Last seen {c.last_seen_on}
                  {c.attempt_count > 0 && ` · ${c.attempt_count} attempts`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--qs-muted)', marginTop: 2 }}>
                  {c.autoReason === 'no_contact_missing'
                    ? '⚠ Never contacted — verify in Allstate: paid or lapsed?'
                    : `⚠ ${c.attempt_count} attempt${c.attempt_count !== 1 ? 's' : ''} made — verify outcome in Allstate`
                  }
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {[
                  { value: 'auto_resolved', label: 'Paid ✓', color: '#10B981' },
                  { value: 'lost',          label: 'Lost',   color: '#EF4444' },
                  { value: 'keep',          label: 'Keep',   color: '#3B82F6' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => onDecide(c.id, opt.value)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      borderRadius: 6, border: `1px solid ${opt.color}33`,
                      background: decision === opt.value ? `${opt.color}22` : 'transparent',
                      color: decision === opt.value ? opt.color : 'var(--qs-subtle)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(decisions).length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 12 }}>
          {counts.paid > 0 && <span style={{ color: '#10B981', marginRight: 12 }}>✓ {counts.paid} marked paid</span>}
          {counts.lost > 0 && <span style={{ color: '#EF4444', marginRight: 12 }}>✗ {counts.lost} marked lost</span>}
          {counts.keep > 0 && <span style={{ color: '#3B82F6' }}>↺ {counts.keep} kept active</span>}
        </div>
      )}

      <button className="btn-primary" disabled={!allDecided} onClick={onConfirmAll}
        style={{ opacity: allDecided ? 1 : 0.4 }}>
        Confirm {cases.length} decisions
      </button>
      {!allDecided && (
        <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 6 }}>
          Decide every case above to continue.
        </div>
      )}
    </div>
  );
}

// ─── Upload Tab ──────────────────────────────────────────────────────────────

function UploadTab({ uploadFile, uploadError, uploadMsg, isParsing, isCommitting, diffResult, fileInputRef, onFileSelect, onCommit, onCancel, autoResolveDecisions, onAutoResolveDecide, onAutoResolveConfirm }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 20 }}>
        Upload the Allstate <span style={{ color: "var(--qs-subtle)", fontFamily: "'DM Mono', monospace" }}>Pending Cancellation</span> report (XLSX).
        The system will diff against existing active events — new policies added, resolved policies auto-closed.
      </div>

      <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFileSelect(e.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }}
          onChange={e => onFileSelect(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, color: "var(--qs-dim)", fontWeight: 500 }}>
          {uploadFile ? uploadFile.name : "Drop report here or click to browse"}
        </div>
        {isParsing && <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 8 }}>Parsing\u2026</div>}
      </div>

      {uploadError && (
        <div style={{ background: "var(--qs-danger-subtle)", border: "1px solid var(--qs-danger-border)", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "var(--qs-danger)" }}>
          {uploadError}
        </div>
      )}

      {diffResult && !uploadMsg && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-bright)", marginBottom: 12 }}>Review before committing</div>

          {/* Detail grid — color values used as inline style props */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: 'New Policies',    value: diffResult.toAdd.length,    color: '#10B981' },
              { label: 'Updated',         value: diffResult.toUpdate.length,  color: '#3B82F6' },
              { label: 'Confirmed Lost',  value: diffResult.autoLost.length,  color: '#EF4444' },
              { label: 'Rewritten',       value: diffResult.autoRewritten?.length ?? 0, color: '#34D399' },
              { label: 'Needs Review',    value: diffResult.toReview.length,  color: '#F59E0B' },
            ].filter(item => item.value > 0).map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Stage breakdown — shown for Cancellation Audit uploads */}
          {diffResult && (diffResult.stage1Count != null || diffResult.stage2Count != null) && (
            <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 6, marginBottom: 10 }}>
              <span style={{ color: 'var(--qs-warning)' }}>⚠ {diffResult.stage1Count ?? 0} pending (Cancel)</span>
              {' · '}
              <span style={{ color: 'var(--qs-danger)' }}>🚫 {diffResult.stage2Count ?? 0} lapsed (Cancelled)</span>
            </div>
          )}

          {diffResult.autoLost.length > 0 && (
            <div style={{ fontSize: 12, background: '#EF444411', border: '1px solid #EF444433',
              borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <span style={{ color: '#EF4444', fontWeight: 600 }}>
                ✗ {diffResult.autoLost.length} confirmed lost
              </span>
              {' '}— matched termination report. Marked lost automatically.
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--qs-dim)' }}>
                {diffResult.autoLost.map(c => (
                  <span key={c.id} style={{ marginRight: 12 }}>
                    {c.customer_name} ({c.product?.toUpperCase()})
                    {c.termination_reason ? ` — ${c.termination_reason}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {diffResult.autoRewritten?.length > 0 && (
            <div style={{ fontSize: 12, background: '#34D39911', border: '1px solid #34D39933',
              borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <span style={{ color: '#34D399', fontWeight: 600 }}>
                ✓ {diffResult.autoRewritten.length} rewritten / transferred
              </span>
              {' '}— cancelled only to move to a new policy. Counted as retained, not lost.
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--qs-dim)' }}>
                {diffResult.autoRewritten.map(c => (
                  <span key={c.id} style={{ marginRight: 12 }}>
                    {c.customer_name} ({c.product?.toUpperCase()})
                    {c.termination_reason ? ` — ${c.termination_reason}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {diffResult.toReview.length > 0 && onAutoResolveDecide && (
            <AutoResolveReviewPanel
              cases={diffResult.toReview}
              decisions={autoResolveDecisions}
              onDecide={onAutoResolveDecide}
              onConfirmAll={onAutoResolveConfirm}
            />
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={onCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadMsg && (
        <div style={{ background: "var(--qs-success-subtle)", border: "1px solid var(--qs-success-border)", borderRadius: 8, padding: "10px 14px", marginTop: 16, fontSize: 13, color: "var(--qs-success)" }}>
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

// ─── Renewal XLSX Parser ────────────────────────────────────────────────────

// Allstate "Upcoming Renewals" / "Renewal Review" report parser
// Handles standard Dash export format
function parseRenewalXLSX(data) {
  const wb = XLSX.read(data, { type: "array" });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  if (allRows.length < 2) return [];

  // Scan first 10 rows for header
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const r = allRows[i].map(h => h?.toString().toLowerCase().trim());
    if (r.some(h => h?.includes("policy"))) { headerIdx = i; break; }
  }

  const headers = allRows[headerIdx].map(h => h?.toString().toLowerCase().trim());
  const rows = allRows.slice(headerIdx + 1);
  const findRenewalCol = (candidates) =>
    headers.findIndex(h => candidates.some(c => h?.includes(c)));

  const iPolicy    = findRenewalCol(["policy number", "policy no", "policy #", "pol no"]);
  const iCustomer  = findRenewalCol(["customer name", "insured name", "insured", "name", "customer"]);
  const iFirstName = findRenewalCol(["insured first name", "first name"]);
  const iLastName  = findRenewalCol(["insured last name", "last name"]);
  // Prefer "product name" (Col 13, readable text like "Homeowners") over "product code" (Col 12, numeric like "010")
  const iProductName = findRenewalCol(["product name"]);
  const iProductCode = findRenewalCol(["line code", "product code", "line of business", "lob"]);
  const iProduct     = iProductName >= 0 ? iProductName : (iProductCode >= 0 ? iProductCode : findRenewalCol(["product"]));
  const iPremium   = findRenewalCol(["renewal premium", "premium new", "written premium", "annual premium", "premium"]);
  const iRenewDate = findRenewalCol(["renewal anniversary date", "renewal anniversary", "anniversary date", "renewal date", "renewal effective", "policy renewal", "expiration date", "exp date"]);
  const iPhone     = findRenewalCol(["insured phone", "phone number", "phone", "mobile", "cell"]);
  const iEmail     = findRenewalCol(["insured email", "email address", "email"]);
  const iItems     = findRenewalCol(["no. of items", "item count", "items", "number of items"]);
  const iRenewalStatus = findRenewalCol(["renewal status"]);
  const iPremiumOld       = findRenewalCol(["premium old($)", "premium old", "prior premium", "previous premium"]);
  const iPremiumChange    = findRenewalCol(["premium change($)", "premium change(", "change($)", "prem change"]);
  const iPremiumChangePct = findRenewalCol(["premium change(%)", "change(%)", "pct change", "% change"]);
  const iOriginalYear     = findRenewalCol(["original year", "orig year", "policy year"]);
  const iPriorYears       = findRenewalCol(["years prior insurance", "years prior", "prior years"]);
  const iEasyPay          = findRenewalCol(["easy pay", "easypay", "autopay"]);
  const iMultiLine        = findRenewalCol(["multi-line indicator", "multi line indicator", "multiline indicator", "multi-line", "multi line"]);

  return rows.filter(r => r.some(Boolean)).map(r => {
    const policyNo = iPolicy >= 0 ? r[iPolicy]?.toString().trim() : null;
    if (!policyNo) return null;

    const productRaw = iProduct >= 0 ? r[iProduct]?.toString() ?? "" : "";
    const product = normaliseProduct(productRaw);

    let renewalDate = null;
    if (iRenewDate >= 0 && r[iRenewDate]) {
      const raw = r[iRenewDate];
      if (raw instanceof Date) {
        renewalDate = raw.toISOString().slice(0, 10);
      } else {
        const parsed = new Date(raw);
        if (!isNaN(parsed)) renewalDate = parsed.toISOString().slice(0, 10);
      }
    }
    if (!renewalDate) return null;

    const premiumRaw = iPremium >= 0 ? r[iPremium] : null;
    const premium = premiumRaw ? parseFloat(String(premiumRaw).replace(/[^0-9.]/g, "")) || null : null;

    const itemsRaw = iItems >= 0 ? parseInt(r[iItems]) : null;
    const itemCount = !isNaN(itemsRaw) && itemsRaw > 0 ? itemsRaw : 1;

    // Build full customer name: prefer first+last columns, fall back to single name column
    let customerName = null;
    if (iFirstName >= 0 && iLastName >= 0) {
      const first = r[iFirstName]?.toString().trim() || "";
      const last  = r[iLastName]?.toString().trim() || "";
      customerName = `${first} ${last}`.trim() || null;
    } else if (iCustomer >= 0) {
      customerName = r[iCustomer]?.toString().trim() || null;
    }

    return {
      policy_no:    policyNo,
      customer_name: customerName,
      product,
      product_raw:  productRaw,
      premium,
      item_count:   itemCount,
      renewal_date: renewalDate,
      phone:        iPhone >= 0 ? r[iPhone]?.toString().trim() || null : null,
      email:        iEmail >= 0 ? r[iEmail]?.toString().trim() || null : null,
      renewal_status: iRenewalStatus >= 0 ? r[iRenewalStatus]?.toString().trim() || null : null,
      premium_old:        iPremiumOld >= 0 ? parseFloat(String(r[iPremiumOld]).replace(/[^0-9.-]/g, "")) || null : null,
      premium_change:     iPremiumChange >= 0 ? parseFloat(String(r[iPremiumChange]).replace(/[^0-9.-]/g, "")) || null : null,
      premium_change_pct: iPremiumChangePct >= 0 ? parseFloat(String(r[iPremiumChangePct]).replace(/[^0-9.-]/g, "")) || null : null,
      original_year:      iOriginalYear >= 0 ? parseInt(r[iOriginalYear]) || null : null,
      years_prior:        iPriorYears >= 0 ? parseInt(r[iPriorYears]) || null : null,
      easy_pay:           iEasyPay >= 0 ? (r[iEasyPay]?.toString().trim().toUpperCase() === "Y") : null,
      multi_line:         iMultiLine >= 0 ? (r[iMultiLine]?.toString().trim() || null) : null,
    };
  }).filter(Boolean);
}

// ─── Renewal Upload Zone (extracted from RenewalTab) ──────────────────────────

function RenewalUploadZone({ agencyId, currentUserId, currentEmployeeId }) {
  const queryClient = useQueryClient();
  const [uploadFile, setUploadFile]       = useState(null);
  const [parsedRows, setParsedRows]       = useState(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [uploadError, setUploadError]     = useState('');
  const [uploadMsg, setUploadMsg]         = useState('');
  const [isParsing, setIsParsing]         = useState(false);
  const [isCommitting, setIsCommitting]   = useState(false);
  const fileInputRef = useRef(null);

  const { data: producers = [] } = useQuery({
    queryKey: ['producers', agencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .overlaps('roles', ['service_inbound', 'service_outbound', 'service'])
        .order('last_name');
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  async function handleFileSelect(file) {
    if (!file) return;
    setUploadFile(file);
    setUploadError("");
    setUploadMsg("");
    setParsedRows(null);
    setExcludedCount(0);
    setIsParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseRenewalXLSX(new Uint8Array(buf));
      if (rows.length === 0) {
        setUploadError("No valid rows found. Check that the file has Policy No and Renewal Date columns.");
        return;
      }
      // Filter out already-resolved rows at parse time so the preview count
      // only shows actionable rows. The auto-resolve logic in handleCommit
      // handles Renewal Taken rows by fetching existing DB rows and comparing
      // — it does NOT need Renewal Taken rows in parsedRows to work correctly.
      const hasStatusCol = rows.some(r => r.renewal_status);
      if (hasStatusCol) {
        const actionable = rows.filter(
          r => !r.renewal_status || r.renewal_status === 'Renewal Not Taken'
        );
        const excluded = rows.length - actionable.length;
        setExcludedCount(excluded);
        if (actionable.length === 0) {
          setUploadError(`All ${rows.length} rows are already renewed or not applicable. No actionable rows to import.`);
          return;
        }
        setParsedRows(actionable);
      } else {
        setExcludedCount(0);
        setParsedRows(rows);
      }
    } catch (err) {
      console.error("[renewal parse error]", err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCommit() {
    if (!parsedRows || !agencyId || isCommitting) return;
    setIsCommitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Find existing rows (for upsert dedup) — also fetch status for auto-resolve logic
      const policyNos = [...new Set(parsedRows.map(r => r.policy_no))];
      const CHUNK_SIZE = 500;
      const existing = [];
      for (let i = 0; i < policyNos.length; i += CHUNK_SIZE) {
        const chunk = policyNos.slice(i, i + CHUNK_SIZE);
        const { data, error: lookupErr } = await supabase
          .from('renewal_cases')
          .select('policy_no, renewal_date, status')
          .eq('agency_id', agencyId)
          .in('policy_no', chunk);
        if (lookupErr) throw new Error(lookupErr.message);
        if (data) existing.push(...data);
      }
      const existingKeys = new Set((existing ?? []).map(e => `${e.policy_no}|${e.renewal_date}`));

      // Build map of current status per row
      const existingStatus = {};
      (existing ?? []).forEach(e => {
        existingStatus[`${e.policy_no}|${e.renewal_date}`] = e.status;
      });

      // For new rows, exclude "Renewal Taken" / "Not Applicable" — no point adding already-resolved cases
      const REPORT_RESOLVED_STATUSES = new Set(['Renewal Taken', 'Not Applicable']);
      const toAdd = parsedRows.filter(r =>
        !existingKeys.has(`${r.policy_no}|${r.renewal_date}`) &&
        !REPORT_RESOLVED_STATUSES.has(r.renewal_status)
      );
      const updatedCount = parsedRows.filter(r => existingKeys.has(`${r.policy_no}|${r.renewal_date}`)).length;

      // 2. Load all active service reps
      const { data: reps } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .overlaps('roles', ['service_outbound'])
        .order('last_name');

      const activeReps = reps || [];
      const assignmentQueue = [...activeReps];

      // 3. Build assignment rotation — seed with existing caseloads for balanced distribution
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from('renewal_cases')
          .select('assigned_to_id')
          .eq('agency_id', agencyId)
          .not('assigned_to_id', 'is', null)
          .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)');

        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) {
            runningCount[c.assigned_to_id]++;
          }
        });
      }

      function pickNextRep() {
        if (assignmentQueue.length === 0) return null;
        const sorted = [...assignmentQueue].sort(
          (a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0)
        );
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked.id;
      }

      // 4. Create upload record
      const { data: upload, error: upErr } = await supabase
        .from('renewal_uploads')
        .insert({
          agency_id: agencyId,
          uploaded_by: currentUserId,
          filename: uploadFile?.name ?? 'unknown',
          rows_added: toAdd.length,
          rows_updated: updatedCount,
          committed: false,
        })
        .select('id')
        .single();
      if (upErr) throw new Error(upErr.message);

      // 5. Insert new rows (with assignment) and update existing rows separately
      //    Mixing them in a single upsert causes PostgREST to normalize columns,
      //    which either drops assigned_to_id on new rows or nullifies it on existing rows.
      const newRecords = toAdd.map(r => {
        const assignedId = pickNextRep();
        return {
          agency_id: agencyId,
          upload_batch_id: upload.id,
          first_seen_on: today,
          last_seen_on: today,
          ...(assignedId ? { assigned_to_id: assignedId } : {}),
          ...r,
        };
      });

      const existingRows = parsedRows.filter(r => existingKeys.has(`${r.policy_no}|${r.renewal_date}`));

      // Statuses that mean Tracy hasn't meaningfully worked the case yet
      const UNWORKED_STATUSES = new Set(['pending', 'attempting', 'left_voicemail']);

      const updateRecords = existingRows.map(r => {
        const key = `${r.policy_no}|${r.renewal_date}`;
        const currentStatus = existingStatus[key];
        const reportStatus = r.renewal_status; // from parsed row

        // Auto-resolve if: report says resolved AND Tracy hasn't worked it yet
        const shouldAutoResolve =
          REPORT_RESOLVED_STATUSES.has(reportStatus) &&
          UNWORKED_STATUSES.has(currentStatus);

        return {
          agency_id: agencyId,
          upload_batch_id: upload.id,
          last_seen_on: today,
          ...(shouldAutoResolve ? { status: 'auto_resolved' } : {}),
          ...r,
          // Preserve first_seen_on — don't overwrite with today for existing rows
          first_seen_on: undefined,
        };
      });

      if (newRecords.length > 0) {
        const { error: insErr } = await supabase
          .from('renewal_cases')
          .insert(newRecords);
        if (insErr) throw new Error(insErr.message);
      }

      if (updateRecords.length > 0) {
        const { error: updErr } = await supabase
          .from('renewal_cases')
          .upsert(updateRecords, { onConflict: 'agency_id,policy_no,renewal_date' });
        if (updErr) throw new Error(updErr.message);
      }

      // ── Post-commit cross-reference ─────────────────────────────────────────
      let crossRefMsg = '';
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const tenDaysAgoStr = tenDaysAgo.toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

      // Fetch all active renewal cases past their renewal date
      const { data: pastDueCases } = await supabase
        .from('renewal_cases')
        .select('id, policy_no, renewal_date, easy_pay, status')
        .eq('agency_id', agencyId)
        .lt('renewal_date', today)
        .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)');

      if (pastDueCases && pastDueCases.length > 0) {
        // Fetch policy numbers from pending_cases (active cancel cases).
        // Exclude retained terminal outcomes (saved/rewritten) — those were
        // kept, not "still in the cancel cycle".
        const { data: cancelCases } = await supabase
          .from('pending_cases')
          .select('policy_no')
          .eq('agency_id', agencyId)
          .not('status', 'in', '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)');

        const cancelPolicies = new Set((cancelCases || []).map(c => c.policy_no));

        // Fetch lapse_events (terminated) with reason so rewrites/transfers
        // (cancelled only to move to a new policy number) count as retained.
        const { data: lapseData } = await supabase
          .from('lapse_events')
          .select('policy_no, termination_reason')
          .eq('agency_id', agencyId);

        const lapsedPolicies = new Set((lapseData || []).map(l => l.policy_no));
        const rewrittenPolicies = new Set(
          (lapseData || []).filter(l => isRewriteReason(l.termination_reason)).map(l => l.policy_no)
        );

        const toLost = [];
        const toRetained = [];
        const toAutoResolve = [];

        for (const rc of pastDueCases) {
          if (rewrittenPolicies.has(rc.policy_no)) {
            // Rewritten/transferred to a new policy number — retained, not lost.
            toRetained.push(rc.id);
          } else if (cancelPolicies.has(rc.policy_no) || lapsedPolicies.has(rc.policy_no)) {
            // On pending cancel or termination report — didn't renew
            toLost.push(rc.id);
          } else if (rc.easy_pay && rc.renewal_date < tenDaysAgoStr) {
            // EasyPay, 10+ days past — auto-processed
            toAutoResolve.push(rc.id);
          } else if (!rc.easy_pay && rc.renewal_date < thirtyDaysAgoStr) {
            // Non-EasyPay, 30+ days past, not on any report — paid manually
            toAutoResolve.push(rc.id);
          }
          // Within buffer — leave active
        }

        if (toLost.length > 0) {
          await supabase
            .from('renewal_cases')
            .update({ status: 'lost', resolution_date: today })
            .in('id', toLost);
        }

        if (toRetained.length > 0) {
          await supabase
            .from('renewal_cases')
            .update({
              status: 'confirmed',
              final_outcome: 'renewed',
              final_outcome_set_at: new Date().toISOString(),
              outcome_source: 'observed',
              resolution_date: today,
            })
            .in('id', toRetained);
        }

        if (toAutoResolve.length > 0) {
          await supabase
            .from('renewal_cases')
            .update({ status: 'auto_resolved', resolution_date: today })
            .in('id', toAutoResolve);
        }

        crossRefMsg = [
          toLost.length > 0 && `${toLost.length} renewal${toLost.length > 1 ? 's' : ''} closed (entered cancel cycle)`,
          toRetained.length > 0 && `${toRetained.length} retained (rewritten)`,
          toAutoResolve.length > 0 && `${toAutoResolve.length} auto-resolved`,
        ].filter(Boolean).join(' \u00b7 ');
      }

      await supabase.from('renewal_uploads').update({ committed: true }).eq('id', upload.id);

      // 6. Build summary message
      const repNames = assignmentQueue.map(r =>
        r.preferred_name || `${r.first_name || ''} ${r.last_name || ''}`.trim()
      );
      const assignmentSummary = activeReps.length === 0
        ? 'No service reps found — cases unassigned'
        : activeReps.length === 1
        ? `All assigned to ${repNames[0]}`
        : `Distributed across ${repNames.join(', ')}`;

      const autoResolved = updateRecords.filter(r => r.status === 'auto_resolved').length;
      const autoResolvedMsg = autoResolved > 0 ? ` · ${autoResolved} auto-resolved` : '';
      const crossRefSummary = crossRefMsg ? ` · ${crossRefMsg}` : '';
      setUploadMsg(`${toAdd.length} added · ${updatedCount} updated${autoResolvedMsg}${crossRefSummary} · ${assignmentSummary}`);
      setParsedRows(null);
      setExcludedCount(0);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await syncRetentionQueue(supabase);
      queryClient.invalidateQueries({ queryKey: ['renewal_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    } catch (err) {
      console.error('[renewal commit error]', err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 16 }}>
        Upload the Allstate <span style={{ fontFamily: "'DM Mono', monospace" }}>Renewal Review</span> report (XLSX).
      </div>

      <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }}
          onChange={e => handleFileSelect(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83D\uDCC4"}</div>
        <div style={{ fontSize: 14, color: "var(--qs-dim)", fontWeight: 500 }}>
          {uploadFile ? uploadFile.name : "Drop renewal report here or click to browse"}
        </div>
        {isParsing && <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 8 }}>Parsing{"\u2026"}</div>}
      </div>

      {/* Assignment info — shown after parsing, before commit */}
      {parsedRows && producers.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 12, marginBottom: 12 }}>
          {producers.length === 1
            ? `All new cases will be assigned to ${producers[0].preferred_name || producers[0].first_name}`
            : `New cases will be distributed across ${producers.length} service reps (workload-balanced)`
          }
        </div>
      )}
      {parsedRows && producers.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--qs-warning)', marginTop: 12, marginBottom: 12 }}>
          {"\u26A0"} No active service reps found — cases will be unassigned
        </div>
      )}

      {uploadError && (
        <div style={{ background: "var(--qs-danger-subtle)", border: "1px solid var(--qs-danger-border)", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "var(--qs-danger)" }}>
          {uploadError}
        </div>
      )}

      {parsedRows && !uploadMsg && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-bright)", marginBottom: 12 }}>
            Preview — {parsedRows.length} actionable rows
            {excludedCount > 0 && (
              <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qs-subtle)", marginLeft: 8 }}>
                ({excludedCount} already renewed excluded)
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={handleCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={() => { setParsedRows(null); setExcludedCount(0); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadMsg && (
        <div style={{ background: "var(--qs-success-subtle)", border: "1px solid var(--qs-success-border)", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "var(--qs-success)" }}>
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

// ─── Lapse XLSX parser (shared with Analytics) ─────────────────────────────

function parseLapseXLSX(data) {
  const wb = XLSX.read(data, { type: "array" });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  if (allRows.length < 2) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const r = allRows[i].map(h => h?.toString().toLowerCase().trim());
    if (r.some(h => h?.includes("policy"))) { headerIdx = i; break; }
  }

  const headers = allRows[headerIdx].map(h => h?.toString().toLowerCase().trim());
  const rows = allRows.slice(headerIdx);
  const findLapseCol = (candidates) => headers.findIndex(h => candidates.some(c => h?.includes(c)));

  const iPolicy   = findLapseCol(["policy", "policy no", "policy number"]);
  const iCustomer = findLapseCol(["customer", "insured", "name"]);
  const iProduct  = findLapseCol(["product name", "line code", "product code", "product", "line of business", "lob"]);
  const iPremium  = findLapseCol(["premium new", "written premium", "annual premium", "premium"]);
  const iDate     = findLapseCol(["termination effective", "lapse date", "cancel date", "cancellation date", "eff date", "effective date"]);
  const iReason   = findLapseCol(["termination reason", "cancel reason", "reason"]);
  const iItems    = findLapseCol(["number of items", "no. of items", "item count", "items"]);

  const SINGLE_ITEM_PRODUCTS = ["ho", "condo", "renters", "landlord", "pup", "manufactured", "boat", "motor_club"];

  return rows.slice(1).filter(r => r.some(Boolean)).map(r => {
    const productRaw = iProduct >= 0 ? r[iProduct]?.toString() ?? "" : "";
    const product = normaliseProduct(productRaw);

    const rawDate = iDate >= 0 ? r[iDate] : null;
    let lapseDate = null;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d)) lapseDate = d.toISOString().slice(0, 10);
    }

    const rawItemCount = iItems >= 0 ? parseInt(r[iItems]) || 1 : 1;
    const item_count = SINGLE_ITEM_PRODUCTS.includes(product) ? 1 : rawItemCount;

    return {
      policy_no:          iPolicy >= 0   ? r[iPolicy]?.toString().trim() ?? "" : "",
      customer_name:      iCustomer >= 0 ? r[iCustomer]?.toString().trim() ?? "" : "",
      product,
      product_raw:        productRaw,
      premium:            iPremium >= 0  ? parseFloat(r[iPremium]?.toString().replace(/[$,]/g, "")) || null : null,
      item_count,
      lapse_date:         lapseDate,
      termination_reason: iReason >= 0   ? r[iReason]?.toString().trim() ?? "" : "",
    };
  }).filter(r => r.policy_no);
}

// ─── Termination Upload Zone (shared component) ─────────────────────────────

function TerminationUploadZone({ agencyId, currentUserId }) {
  const queryClient = useQueryClient();
  const [lapseFile, setLapseFile] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [parsedRows, setParsedRows] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [parseError, setParseError] = useState("");
  const lapseFileRef = useRef(null);

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLapseFile(file);
    setParseError("");
    setParsedRows(null);
    setCommitMsg("");
    try {
      const buf = await file.arrayBuffer();
      const rows = parseLapseXLSX(new Uint8Array(buf));
      if (rows.length === 0) { setParseError("No valid rows found. Check that your file has a Policy No column."); return; }
      setParsedRows(rows);
    } catch (err) {
      console.error("[termination parse error]", err.message);
      setParseError(friendlyUploadError(err.message));
    }
  }

  async function handleCommit() {
    if (!parsedRows || !agencyId) return;
    if (!currentUserId) {
      setParseError("Session expired. Please refresh and try again.");
      return;
    }
    setIsCommitting(true);
    try {
      const policyNos = parsedRows.map(r => r.policy_no);
      const { data: existing } = await supabase
        .from("lapse_events")
        .select("policy_no")
        .eq("agency_id", agencyId)
        .eq("report_month", reportMonth)
        .in("policy_no", policyNos);
      const existingCount = existing?.length ?? 0;
      const newCount = parsedRows.length - existingCount;

      const { data: upload, error: upErr } = await supabase
        .from("lapse_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: currentUserId,
          filename: lapseFile?.name ?? "unknown",
          report_month: reportMonth,
          rows_added: newCount,
          rows_updated: existingCount,
          committed: false,
        })
        .select("id")
        .single();
      if (upErr) throw new Error(upErr.message);

      const records = parsedRows.map(r => ({
        agency_id: agencyId,
        report_month: reportMonth,
        upload_batch_id: upload.id,
        ...r,
      }));

      const { error: evtErr } = await supabase
        .from("lapse_events")
        .upsert(records, { onConflict: "agency_id,policy_no,report_month" });
      if (evtErr) throw new Error(evtErr.message);

      // Cross-reference: close any pending_cases that appear on the termination report
      const terminatedPolicyNos = parsedRows.map(r => r.policy_no).filter(Boolean);
      let crossResolved = 0;

      if (terminatedPolicyNos.length > 0) {
        const { data: matchedCases } = await supabase
          .from('pending_cases')
          .select('id, policy_no, lapse_date')
          .eq('agency_id', agencyId)
          .in('policy_no', terminatedPolicyNos)
          .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation,pending_review)');

        if (matchedCases && matchedCases.length > 0) {
          const today = new Date().toISOString().slice(0, 10);

          for (const c of matchedCases) {
            const lapseRow = parsedRows.find(r => r.policy_no === c.policy_no);
            // A "Cancel/Rewrite" termination means the customer was kept on a
            // new policy number — close as retained (rewritten), not lost.
            const rewritten = isRewriteReason(lapseRow?.termination_reason);
            await supabase
              .from('pending_cases')
              .update({
                status: rewritten ? 'rewritten' : 'lost',
                resolution_date: lapseRow?.lapse_date || today,
                termination_reason: lapseRow?.termination_reason || null,
                ...(rewritten ? { rewrite_reason: lapseRow?.termination_reason || null } : {}),
              })
              .eq('id', c.id);
          }

          crossResolved = matchedCases.length;
        }
      }

      // Flag matching new-business revenue entries as potential chargebacks \u2014
      // a policy that appears on a termination report after being written
      // usually has its commission charged back, and the revenue dashboard
      // has no other signal for this. The flag survives daily NB re-uploads
      // because the upsert only touches the columns it supplies.
      // Rewrites are skipped: the household stays on a new policy number and
      // rewrites generate no new-business entry, so the original entry is the
      // only production record and must keep counting.
      let chargebacksFlagged = 0;
      const flagCandidatePolicyNos = parsedRows
        .filter(r => r.policy_no && !isRewriteReason(r.termination_reason))
        .map(r => r.policy_no);
      if (flagCandidatePolicyNos.length > 0) {
        const { data: nbMatches } = await supabase
          .from('revenue_entries')
          .select('id, policy_no')
          .eq('agency_id', agencyId)
          .in('policy_no', flagCandidatePolicyNos)
          .is('chargeback_flagged_at', null);

        for (const entry of (nbMatches ?? [])) {
          const lapseRow = parsedRows.find(r => r.policy_no === entry.policy_no);
          await supabase
            .from('revenue_entries')
            .update({
              chargeback_flagged_at: new Date().toISOString(),
              chargeback_reason: lapseRow?.termination_reason || null,
              chargeback_lapse_date: lapseRow?.lapse_date || null,
            })
            .eq('id', entry.id);
        }
        chargebacksFlagged = (nbMatches ?? []).length;
      }

      await supabase.from("lapse_uploads").update({ committed: true }).eq("id", upload.id);

      const crossMsg = crossResolved > 0
        ? ` \u00b7 ${crossResolved} pending case${crossResolved > 1 ? 's' : ''} closed from termination report`
        : '';
      const chargebackMsg = chargebacksFlagged > 0
        ? ` \u00b7 ${chargebacksFlagged} new-business entr${chargebacksFlagged > 1 ? 'ies' : 'y'} flagged as possible chargeback`
        : '';
      setCommitMsg(`${parsedRows.length} terminations recorded${crossMsg}${chargebackMsg}`);
      setParsedRows(null);
      setLapseFile(null);
      await syncRetentionQueue(supabase);
      queryClient.invalidateQueries({ queryKey: ["lapse_events_summary", agencyId] });
      queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['renewal_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['revenue_entries', agencyId] });
    } catch (err) {
      console.error("[termination commit error]", err.message);
      setParseError(friendlyUploadError(err.message));
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--qs-subtle)", display: "block", marginBottom: 4 }}>Report Month</label>
          <input
            type="month"
            value={reportMonth.slice(0, 7)}
            onChange={e => setReportMonth(`${e.target.value}-01`)}
            style={{ fontFamily: "inherit" }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <input ref={lapseFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileSelect} />
          <button className="btn-ghost" onClick={() => lapseFileRef.current?.click()}>
            {lapseFile ? `\uD83D\uDCC4 ${lapseFile.name}` : "Choose File"}
          </button>
        </div>
      </div>

      {parseError && (
        <div style={{ background: "var(--qs-danger-subtle)", border: "1px solid var(--qs-danger-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--qs-danger)" }}>
          {parseError}
        </div>
      )}

      {parsedRows && !commitMsg && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-bright)", marginBottom: 12 }}>
            Preview — {parsedRows.length} rows for {reportMonth.slice(0, 7)}
          </div>
          <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginBottom: 16 }}>
            {Object.entries(parsedRows.reduce((acc, r) => { acc[r.product] = (acc[r.product] || 0) + 1; return acc; }, {})).map(([prod, count]) => (
              <span key={prod} style={{ marginRight: 12 }}>{prod}: <strong style={{ color: "var(--qs-dim)" }}>{count}</strong></span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={handleCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={() => { setParsedRows(null); setLapseFile(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {commitMsg && (
        <div style={{ background: "var(--qs-success-subtle)", border: "1px solid var(--qs-success-border)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--qs-success)" }}>
          {commitMsg}
        </div>
      )}
    </div>
  );
}

// ─── Import Tab (unified upload) ──────────────────────────────────────────────

function ImportTab({
  uploadFile, uploadError, uploadMsg, isParsing, isCommitting,
  diffResult, fileInputRef, onFileSelect, onCommit, onCancelUpload,
  cancelAuditFile, cancelAuditError, cancelAuditMsg, isCancelAuditParsing,
  isCancelAuditCommitting, cancelAuditDiff, cancelAuditFileInputRef,
  onCancelAuditFileSelect, onCancelAuditCommit, onCancelAuditCancel,
  agencyId, currentUserId, currentEmployeeId,
  autoResolveDecisions,
  onAutoResolveDecide, onAutoResolveConfirm,
}) {
  return (
    <div style={{ maxWidth: 996, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', textAlign: 'center', marginBottom: 14 }}>
          Upload Allstate reports to refresh the At Risk queue.
        </div>

        {/* Upload sequence strip */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 0, background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)', borderRadius: 10, padding: '10px 20px',
        }}>
          {[
            { step: '\u2460', label: 'Termination',       color: '#EF4444', sublabel: 'closes lost cases' },
            { step: '\u2461', label: 'Cancellation Audit', color: '#F59E0B', sublabel: 'advances staged cases' },
            { step: '\u2462', label: 'Pending Cancel',     color: '#F59E0B', sublabel: 'adds at-risk cases' },
            { step: '\u2463', label: 'Renewal',            color: '#3B82F6', sublabel: 'adds renewal queue' },
            { step: '\u2464', label: 'Cross-Sell',         color: '#10B981', sublabel: 'pitch opportunities' },
          ].map((s, i, arr) => (
            <div key={s.step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '0 12px' }}>
                <div style={{ fontSize: 16, color: s.color }}>{s.step}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-text)', marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)' }}>{s.sublabel}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ color: 'var(--qs-muted)', fontSize: 16, padding: '0 4px' }}>{'\u2192'}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--qs-muted)', textAlign: 'center', marginTop: 8 }}>
          Upload in this order for the most accurate queue diff results
        </div>
      </div>

      {/* ① Termination Report — full width, first in logical order */}
      <div style={{
        marginTop: 16,
        background: 'var(--qs-card)',
        border: '1px solid #EF444433',
        borderRadius: 12, padding: 20
      }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#EF4444',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16
        }}>
          {'\u2460'} Termination Report
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
          Upload the Allstate <span style={{ fontFamily: "'DM Mono', monospace" }}>Termination</span> report (XLSX).
          Confirmed lapses are recorded and any matching pending cases are automatically closed as lost.
        </div>
        <TerminationUploadZone agencyId={agencyId} currentUserId={currentUserId} />
      </div>

      {/* ② Cancellation Audit — full width */}
      <div style={{ marginTop: 16, background: 'var(--qs-card)', border: '1px solid var(--qs-danger-border)',
        borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-danger)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
          {'\u2461'} Cancellation Audit
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
          Upload the Allstate{' '}
          <span style={{ fontFamily: "'DM Mono', monospace" }}>Cancellation Audit</span> report (XLSX).
          <br />
          <span style={{ color: 'var(--qs-warning)' }}>Cancel</span> rows {'\u2192'} Stage 1 (pending).{' '}
          <span style={{ color: 'var(--qs-danger)' }}>Cancelled</span> rows {'\u2192'} Stage 2 (coverage lapsed).
        </div>
        <UploadTab
          uploadFile={cancelAuditFile}
          uploadError={cancelAuditError}
          uploadMsg={cancelAuditMsg}
          isParsing={isCancelAuditParsing}
          isCommitting={isCancelAuditCommitting}
          diffResult={cancelAuditDiff}
          fileInputRef={cancelAuditFileInputRef}
          onFileSelect={onCancelAuditFileSelect}
          onCommit={onCancelAuditCommit}
          onCancel={onCancelAuditCancel}
        />
      </div>

      {/* ③ Pending Cancel  |  ④ Renewal — side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 128, alignItems: 'stretch', marginTop: 16 }}>

        {/* ③ Pending Cancellation */}
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-warning-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-warning)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            {'\u2462'} Pending Cancellation Report
          </div>
          <UploadTab
            uploadFile={uploadFile}
            uploadError={uploadError}
            uploadMsg={uploadMsg}
            isParsing={isParsing}
            isCommitting={isCommitting}
            diffResult={diffResult}
            fileInputRef={fileInputRef}
            onFileSelect={onFileSelect}
            onCommit={onCommit}
            onCancel={onCancelUpload}
            autoResolveDecisions={autoResolveDecisions}
            onAutoResolveDecide={onAutoResolveDecide}
            onAutoResolveConfirm={onAutoResolveConfirm}
          />
        </div>

        {/* ④ Renewal Audit */}
        <div style={{ background: 'var(--qs-card)', border: '1px solid #3B82F633', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-info)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            {'\u2463'} Renewal Audit Report
          </div>
          <RenewalUploadZone
            agencyId={agencyId}
            currentUserId={currentUserId}
            currentEmployeeId={currentEmployeeId}
          />
        </div>

      </div>

      {/* ⑤ Cross-Sell Audit — full width below the side-by-side */}
      <CrossSellUploadCard agencyId={agencyId} currentUserId={currentUserId} />

    </div>
  );
}

function CrossSellUploadCard({ agencyId, currentUserId }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      marginTop: 16,
      background: 'var(--qs-card)',
      border: '1px solid #10B98133',
      borderRadius: 12, padding: 20,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600, color: '#10B981',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16,
      }}>
        {'⑤'} Cross-Sell Audit
      </div>
      <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
        Upload the Allstate{' '}
        <span style={{ fontFamily: "'DM Mono', monospace" }}>Cross-Sell Audit</span> report (XLSX).
        Each row is matched against active renewals and pending cancels — overlap
        customers are routed on hold, monoline matches surface on the renewal modal,
        and unmatched rows become outbound leads.
      </div>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '10px 18px', borderRadius: 8, border: 'none',
          background: '#10B981', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + Upload Cross-Sell Report
      </button>
      {open && (
        <CrossSellUploadModal
          agencyId={agencyId}
          uploadedBy={currentUserId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}


// ─── Wrapper Component ────────────────────────────────────────────────────────
// Manages cancel upload state and renders ImportTab with all props.

export default function RetentionImport({ agencyId, currentUserId, currentEmployeeId }) {
  const queryClient = useQueryClient();

  // Pending cancel upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const fileInputRef = useRef(null);

  // Cancellation Audit upload state
  const [cancelAuditFile, setCancelAuditFile]               = useState(null);
  const [cancelAuditDiff, setCancelAuditDiff]               = useState(null);
  const [cancelAuditMsg, setCancelAuditMsg]                 = useState('');
  const [cancelAuditError, setCancelAuditError]             = useState('');
  const [isCancelAuditParsing, setIsCancelAuditParsing]     = useState(false);
  const [isCancelAuditCommitting, setIsCancelAuditCommitting] = useState(false);
  const cancelAuditFileInputRef = useRef(null);

  // Auto-resolve review state
  const [autoResolveDecisions, setAutoResolveDecisions] = useState({});

  // Fetch pending_cases for diff engine
  const { data: events = [] } = useQuery({
    queryKey: ["pending_cases", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_cases")
        .select("*")
        .eq("agency_id", agencyId)
        .order("cancel_effective_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const loadEvents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pending_cases", agencyId] });
  }, [queryClient, agencyId]);

  // ─── Pending Cancel Upload Flow ──────────────────────────────────────────

  async function handleFileSelect(file) {
    if (!file) return;
    setUploadFile(file);
    setUploadError('');
    setUploadMsg('');
    setDiffResult(null);
    setIsParsing(true);
    try {
      const parsed = await parseReport(file);

      // Always fetch fresh — never diff against stale cache
      const [
        { data: freshEvents, error: fetchErr },
        { data: lapseEvents, error: lapseErr },
      ] = await Promise.all([
        supabase
          .from('pending_cases')
          .select('*')
          .eq('agency_id', agencyId)
          .order('cancel_effective_date', { ascending: true }),
        supabase
          .from('lapse_events')
          .select('policy_no, lapse_date, termination_reason')
          .eq('agency_id', agencyId),
      ]);
      if (fetchErr) throw new Error(fetchErr.message);

      const lapseMap = new Map((lapseEvents || []).map(l => [l.policy_no, l]));
      const diff = diffReport(parsed, freshEvents || [], lapseMap);
      setDiffResult(diff);
      setAutoResolveDecisions({});
    } catch (err) {
      console.error('[triage upload error]', err.message);
      setUploadError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsParsing(false);
    }
  }

  function handleAutoResolveDecision(id, decision) {
    setAutoResolveDecisions(prev => ({ ...prev, [id]: decision }));
  }

  async function handleConfirmReviewDecisions() {
    const today = new Date().toISOString().slice(0, 10);
    const paid = Object.entries(autoResolveDecisions).filter(([, d]) => d === 'auto_resolved').map(([id]) => id);
    const lost = Object.entries(autoResolveDecisions).filter(([, d]) => d === 'lost').map(([id]) => id);
    const keep = Object.entries(autoResolveDecisions).filter(([, d]) => d === 'keep').map(([id]) => id);

    if (paid.length > 0)
      await supabase.from('pending_cases').update({ status: 'auto_resolved', resolution_date: today }).in('id', paid);
    if (lost.length > 0)
      await supabase.from('pending_cases').update({ status: 'lost', resolution_date: today }).in('id', lost);
    if (keep.length > 0)
      await supabase.from('pending_cases').update({ status: 'pending' }).in('id', keep);

    setAutoResolveDecisions({});
    queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
  }

  async function handleCommitUpload() {
    if (!diffResult || !agencyId || isCommitting) return;
    setIsCommitting(true);
    try {
      const { data: reps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .overlaps("roles", ["service_outbound"])
        .order("last_name");

      const activeReps = reps || [];
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from("pending_cases")
          .select("assigned_to_id")
          .eq("agency_id", agencyId)
          .not("assigned_to_id", "is", null)
          .not("status", "in", '(saved,lost,auto_resolved,requested_cancellation)');
        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) runningCount[c.assigned_to_id]++;
        });
      }

      function pickNextRep() {
        if (activeReps.length === 0) return null;
        const sorted = [...activeReps].sort((a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0));
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked;
      }

      const { data: batch, error: batchErr } = await supabase
        .from("pending_cancel_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          filename: uploadFile?.name,
          rows_added: diffResult.toAdd.length,
          rows_updated: diffResult.toUpdate.length,
          rows_auto_resolved: diffResult.autoLost.length + (diffResult.autoRewritten?.length ?? 0) + diffResult.toReview.length,
          committed: false,
        })
        .select().single();
      if (batchErr) throw new Error(batchErr.message);

      const batchId = batch.id;
      if (diffResult.toAdd.length > 0) {
        const { error } = await supabase
          .from("pending_cases")
          .insert(diffResult.toAdd.map(r => {
            const rep = pickNextRep();
            return {
              agency_id: agencyId,
              upload_batch_id: batchId,
              ...(rep ? { assigned_to_id: rep.id, assigned_to: rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim() } : {}),
              ...r,
            };
          }));
        if (error) throw new Error(error.message);
      }

      for (const u of diffResult.toUpdate) {
        const updatePayload = { last_seen_on: u.last_seen_on, premium_at_risk: u.premium_at_risk };
        if (u.prior_premium != null) updatePayload.prior_premium = u.prior_premium;
        if (u.stage != null) updatePayload.stage = u.stage;
        if (u.amount_due != null) updatePayload.amount_due = u.amount_due;
        await supabase.from("pending_cases").update(updatePayload).eq("id", u.id);
      }

      // Auto-close confirmed lost from lapse_events
      if (diffResult.autoLost.length > 0) {
        for (const c of diffResult.autoLost) {
          await supabase.from('pending_cases').update({
            status: 'lost',
            resolution_date: c.resolution_date,
            termination_reason: c.termination_reason || null,
            lapse_date: c.lapse_date || null,
          }).eq('id', c.id);
        }
      }

      // Auto-close rewrites/transfers as RETAINED (not lost) — the customer
      // moved to a new policy number, so this is a save, not a loss.
      if (diffResult.autoRewritten?.length > 0) {
        for (const c of diffResult.autoRewritten) {
          await supabase.from('pending_cases').update({
            status: 'rewritten',
            resolution_date: c.resolution_date,
            termination_reason: c.termination_reason || null,
            rewrite_reason: c.termination_reason || null,
            lapse_date: c.lapse_date || null,
          }).eq('id', c.id);
        }
      }

      // Stage ambiguous absent cases for human review
      if (diffResult.toReview.length > 0) {
        await supabase
          .from('pending_cases')
          .update({ status: 'pending_review' })
          .in('id', diffResult.toReview.map(c => c.id));
      }

      await supabase.from("pending_cancel_uploads").update({ committed: true }).eq("id", batchId);

      // Re-evaluate priority_tier for all active cases — cases that were P3
      // last upload may now be P1/P2 as the cancel date approaches.
      await supabase.rpc('refresh_priority_tiers', {
        p_agency_id: agencyId,
        p_today: new Date().toISOString().slice(0, 10),
      });

      const repNames = activeReps.map(r => r.preferred_name || `${r.first_name || ""} ${r.last_name || ""}`.trim());
      const assignmentSummary = activeReps.length === 0 ? "cases unassigned"
        : activeReps.length === 1 ? `assigned to ${repNames[0]}`
        : `distributed across ${repNames.join(", ")}`;

      const parts = [
        diffResult.toAdd.length > 0     && `${diffResult.toAdd.length} added`,
        diffResult.toUpdate.length > 0   && `${diffResult.toUpdate.length} updated`,
        diffResult.autoLost.length > 0   && `${diffResult.autoLost.length} confirmed lost`,
        diffResult.autoRewritten?.length > 0 && `${diffResult.autoRewritten.length} rewritten`,
        diffResult.toReview.length > 0   && `${diffResult.toReview.length} need review`,
      ].filter(Boolean).join(' · ');

      setUploadMsg(`${parts} · ${assignmentSummary}`);
      setDiffResult(null);
      setUploadFile(null);
      await loadEvents();
      await syncRetentionQueue(supabase);
      queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ["policy_retention_status", agencyId] });
    } catch (err) {
      console.error("[triage commit error]", err.message);
      setUploadError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCommitting(false);
    }
  }

  // ─── Cancellation Audit Upload Flow ──────────────────────────────────────

  async function handleCancelAuditFileSelect(file) {
    if (!file) return;
    setCancelAuditFile(file);
    setCancelAuditError('');
    setCancelAuditMsg('');
    setCancelAuditDiff(null);
    setIsCancelAuditParsing(true);
    try {
      const rows = await parseReport(file);
      const stage1Count = rows.filter(r => r.stage === 'pending_cancel').length;
      const stage2Count = rows.filter(r => r.stage === 'cancelled').length;
      const diff = diffReport(rows, events);
      setCancelAuditDiff({ ...diff, stage1Count, stage2Count });
    } catch (err) {
      setCancelAuditError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCancelAuditParsing(false);
    }
  }

  async function handleCancelAuditCommit() {
    if (!cancelAuditDiff || !agencyId || isCancelAuditCommitting) return;
    setIsCancelAuditCommitting(true);
    try {
      const { data: reps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .overlaps("roles", ["service_outbound"])
        .order("last_name");

      const activeReps = reps || [];
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from("pending_cases")
          .select("assigned_to_id")
          .eq("agency_id", agencyId)
          .not("assigned_to_id", "is", null)
          .not("status", "in", '(saved,lost,auto_resolved,requested_cancellation,cancelled)');
        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) runningCount[c.assigned_to_id]++;
        });
      }

      function pickNextRep() {
        if (activeReps.length === 0) return null;
        const sorted = [...activeReps].sort((a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0));
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked;
      }

      const policyNosFromAdd = cancelAuditDiff.toAdd.map(r => r.policy_no).filter(Boolean);
      let stageAdvanceMap = new Map();
      if (policyNosFromAdd.length > 0) {
        const { data: existing } = await supabase
          .from('pending_cases')
          .select('id, policy_no, stage, status, cancel_effective_date')
          .eq('agency_id', agencyId)
          .in('policy_no', policyNosFromAdd)
          .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation)');
        (existing || []).forEach(e => { stageAdvanceMap.set(e.policy_no.toLowerCase(), e); });
      }

      const { data: batch, error: batchErr } = await supabase
        .from("cancellation_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          filename: cancelAuditFile?.name,
          rows_added: 0, rows_updated: 0, committed: false,
        })
        .select().single();
      if (batchErr) throw new Error(batchErr.message);

      const batchId = batch.id;
      let rowsAdded = 0;
      let rowsUpdated = 0;

      if (cancelAuditDiff.toAdd.length > 0) {
        const trueInserts = [];
        for (const r of cancelAuditDiff.toAdd) {
          const existingByPolicyNo = stageAdvanceMap.get(r.policy_no.toLowerCase());
          if (existingByPolicyNo) {
            const advancePayload = {
              last_seen_on: new Date().toISOString().slice(0, 10),
              ...(r.stage === 'cancelled' ? { stage: 'cancelled' } : {}),
              ...(r.amount_due != null ? { amount_due: r.amount_due } : {}),
              ...(r.cancel_effective_date ? { cancel_effective_date: r.cancel_effective_date } : {}),
              ...(r.premium_at_risk != null ? { premium_at_risk: r.premium_at_risk } : {}),
            };
            await supabase.from('pending_cases').update(advancePayload).eq('id', existingByPolicyNo.id);
            rowsUpdated++;
          } else {
            const rep = pickNextRep();
            trueInserts.push({
              agency_id: agencyId, upload_batch_id: batchId,
              ...(rep ? { assigned_to_id: rep.id, assigned_to: rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim() } : {}),
              ...r,
            });
            rowsAdded++;
          }
        }
        if (trueInserts.length > 0) {
          const { error } = await supabase.from("pending_cases").insert(trueInserts);
          if (error) throw new Error(error.message);
        }
      }

      for (const u of cancelAuditDiff.toUpdate) {
        const updatePayload = { last_seen_on: u.last_seen_on, premium_at_risk: u.premium_at_risk };
        if (u.prior_premium != null) updatePayload.prior_premium = u.prior_premium;
        if (u.stage != null) updatePayload.stage = u.stage;
        if (u.amount_due != null) updatePayload.amount_due = u.amount_due;
        await supabase.from("pending_cases").update(updatePayload).eq("id", u.id);
        rowsUpdated++;
      }

      await supabase.from("cancellation_uploads").update({ committed: true, rows_added: rowsAdded, rows_updated: rowsUpdated }).eq("id", batchId);

      // Re-evaluate priority_tier for all active cases after stage advances.
      await supabase.rpc('refresh_priority_tiers', {
        p_agency_id: agencyId,
        p_today: new Date().toISOString().slice(0, 10),
      });

      const repNames = activeReps.map(r => r.preferred_name || `${r.first_name || ""} ${r.last_name || ""}`.trim());
      const assignmentSummary = activeReps.length === 0 ? "cases unassigned"
        : activeReps.length === 1 ? `assigned to ${repNames[0]}`
        : `distributed across ${repNames.join(", ")}`;

      setCancelAuditMsg(`${cancelAuditDiff.stage1Count ?? 0} pending · ${cancelAuditDiff.stage2Count ?? 0} lapsed · ${rowsUpdated} updated · ${assignmentSummary}`);
      setCancelAuditDiff(null);
      setCancelAuditFile(null);
      await loadEvents();
      await syncRetentionQueue(supabase);
      queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ["policy_retention_status", agencyId] });
    } catch (err) {
      console.error("[cancel audit commit error]", err.message);
      setCancelAuditError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCancelAuditCommitting(false);
    }
  }

  return (
    <ImportTab
      uploadFile={uploadFile}
      uploadError={uploadError}
      uploadMsg={uploadMsg}
      isParsing={isParsing}
      isCommitting={isCommitting}
      diffResult={diffResult}
      fileInputRef={fileInputRef}
      onFileSelect={handleFileSelect}
      onCommit={handleCommitUpload}
      onCancelUpload={() => { setDiffResult(null); setUploadFile(null); setUploadError(''); }}
      cancelAuditFile={cancelAuditFile}
      cancelAuditError={cancelAuditError}
      cancelAuditMsg={cancelAuditMsg}
      isCancelAuditParsing={isCancelAuditParsing}
      isCancelAuditCommitting={isCancelAuditCommitting}
      cancelAuditDiff={cancelAuditDiff}
      cancelAuditFileInputRef={cancelAuditFileInputRef}
      onCancelAuditFileSelect={handleCancelAuditFileSelect}
      onCancelAuditCommit={handleCancelAuditCommit}
      onCancelAuditCancel={() => { setCancelAuditDiff(null); setCancelAuditFile(null); setCancelAuditError(''); }}
      agencyId={agencyId}
      currentUserId={currentUserId}
      currentEmployeeId={currentEmployeeId}
      autoResolveDecisions={autoResolveDecisions}
      onAutoResolveDecide={handleAutoResolveDecision}
      onAutoResolveConfirm={handleConfirmReviewDecisions}
    />
  );
}

export { TerminationUploadZone };
