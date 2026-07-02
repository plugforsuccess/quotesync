// src/pages/components/retention/RetentionCancels.jsx
// Extracted from BookHealthPage.jsx — UnifiedAtRiskTab + all modal dependencies.

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { calcRenewalPriority, calcCancelPriority, computePriorityTier, compareByTier, TIER_ORDER, CURRENT_YEAR } from '../../../lib/retentionPriority';
import { useOtherActiveCases } from '../../../hooks/useOtherActiveCases';
import { useAgencyProductConfig } from '../../../hooks/useAgencyProductConfig';
import { useBookSnapshots } from '../../../hooks/useBookMetrics';
import { buildChurnModel } from '../../../lib/retentionElasticity';
import { reassignRenewalHousehold } from '../../../lib/householdAssign';
import InterventionPicker from '../../../components/InterventionPicker';
import CloserPicker from '../../../components/CloserPicker';
import MultiVehicleBadge from '../../../components/MultiVehicleBadge';
import { EMPTY_INTERVENTION, interventionInsertFields, onRecordSaveTactics, LOSS_REASON_CODES, HAPPY_CODES } from '../../../lib/interventions';
import { useInterventionTypes } from '../../../hooks/useInterventionTypes';
import { productLabel, premiumTermLabel } from '../../../lib/productLabels';
import { titleCaseName } from '../../../lib/names';
import { CallScriptBox, VoicemailScriptBox, renewalCallScript, cancelCallScript } from '../../../components/RetentionScripts';
import CaseNotesFeed from './CaseNotesFeed';
import LogServiceTaskButton from './LogServiceTaskButton';
import { EscalateCaseBox, LinkedServiceTasks, ReferToSalesBox } from './CaseHandoffExtras';
import { saveMethodFromCodes } from '../../../lib/saveMethods';

const STATUS_CONFIG = {
  pending:                { label: "Pending",           color: "var(--qs-dim)", bg: "#94A3B822" },
  attempting:             { label: "Attempting",         color: "#F59E0B", bg: "#F59E0B22" },
  left_voicemail:         { label: "Left Voicemail",    color: "#F59E0B", bg: "#F59E0B22" },
  contacted:              { label: "Contacted",         color: "#3B82F6", bg: "#3B82F622" }, // legacy
  payment_plan_requested: { label: "Payment Plan",      color: "#8B5CF6", bg: "#8B5CF622" },
  promise_to_pay:         { label: "Promise to Pay",    color: "#8B5CF6", bg: "#8B5CF622" },
  saved:                  { label: "Saved ✓",      color: "#10B981", bg: "#10B98122" },
  rewritten:              { label: "Rewritten ✓",  color: "#34D399", bg: "#34D39922" },
  promise_broken:         { label: "Promise Broken",    color: "#EF4444", bg: "#EF444422" },
  requested_cancellation: { label: "Wants to Cancel",   color: "#EF4444", bg: "#EF444422" },
  lost:                   { label: "Lost",              color: "var(--qs-subtle)", bg: "#64748B22" },
  auto_resolved:          { label: "Auto-Resolved",     color: "var(--qs-subtle)", bg: "#47556922" },
};

const TERMINATION_REASONS = ["Price", "Service", "Claims", "Moving", "Coverage no longer needed", "Other"];
function fmt$(n) {
  if (!n && n !== 0) return "—";
  return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toLocaleString()}`;
}
function fmtFull$(n) {
  if (!n && n !== 0) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function maskCustomerName(name) {
  if (!name) return "—";
  const parts = titleCaseName(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function daysUntilCancel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

// Dynamic color — used as style prop
function urgencyColor(days) {
  if (days <= 3) return "#EF4444";
  if (days <= 7) return "#F59E0B";
  return "#10B981";
}

// ─── Module-Level Sub-Components ───────────────────────────────────────────────

function SortTh({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
    </th>
  );
}

function KpiCard({ label, value, sub, color, urgent, urgentCount, clickable, onClick }) {
  return (
    <div
      className="card"
      style={{
        position: 'relative',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        border: clickable ? '1px solid var(--qs-border)' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.borderColor = color; }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.borderColor = 'var(--qs-border)'; }}
    >
      {urgent && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--qs-danger-subtle)',
          color: 'var(--qs-danger)', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          {urgentCount} URGENT
        </div>
      )}
      {clickable && (
        <div style={{ position: 'absolute', bottom: 8, right: 10,
          fontSize: 9, color: 'var(--qs-muted)', letterSpacing: '0.05em' }}>
          FILTER ↓
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--qs-subtle)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color,
        fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Customer Drilldown Modal ──────────────────────────────────────────────────────

function CustomerDrilldownModal({ event, onClose }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const premiumChangePct = event.prior_premium && event.premium_at_risk
    ? ((event.premium_at_risk - event.prior_premium) / event.prior_premium) * 100
    : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}
      onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--qs-card)", border: "1px solid var(--qs-border)", borderRadius: 14, width: "100%", maxWidth: "98vw", height: "96vh", overflow: "auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--qs-bright)" }}>
              {maskCustomerName(event.customer_name) || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>
              Policy #{event.policy_no || "\u2014"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--qs-subtle)", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Detail grid — color values used as inline style props */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
          {[
            { label: "Product",          value: productLabel(event.product) || "\u2014",                              color: "var(--qs-text)" },
            { label: "Cancel Date",      value: event.cancel_effective_date || "\u2014",                               color: urgencyColor(days) },
            { label: "Days Left",        value: days <= 0 ? "PAST DUE" : `${days} days`,                         color: urgencyColor(days) },
            { label: "Phone",            value: event.phone || "\u2014",                                               color: event.phone ? "var(--qs-text)" : "var(--qs-muted)" },
            { label: "Premium at Risk",  value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "\u2014",    color: "var(--qs-text)" },
            { label: "Prior Premium",    value: event.prior_premium ? fmtFull$(event.prior_premium) : "\u2014",        color: "var(--qs-dim)" },
            {
              label: "Premium Change",
              value: premiumChangePct !== null ? `${premiumChangePct >= 0 ? "+" : ""}${premiumChangePct.toFixed(1)}%` : "\u2014",
              color: premiumChangePct === null ? "var(--qs-muted)" : premiumChangePct > 0 ? "#EF4444" : "#10B981",
            },
            { label: "Items at Risk",    value: event.item_count != null ? String(event.item_count) : "\u2014",        color: "var(--qs-text)" },
            { label: "Status",           value: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).label,     color: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).color },
            { label: "Assigned To",      value: event.assigned_to || "Unassigned",                                color: "var(--qs-dim)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--qs-elevated)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--qs-border)" }}>
              <div style={{ fontSize: 10, color: "var(--qs-subtle)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Notes — full width, only if present */}
        {event.notes && (
          <div style={{ background: "var(--qs-elevated)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--qs-border)", marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--qs-subtle)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
            <div style={{ fontSize: 12, color: "var(--qs-dim)", lineHeight: 1.5 }}>{event.notes}</div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "var(--qs-muted)", marginTop: 16, textAlign: "center" }}>
          Click the row to open the full edit modal
        </div>
      </div>
    </div>
  );
}

// ─── Other Cases Warning ─────────────────────────────────────────────────────

function OtherCasesWarning({ cases }) {
  if (!cases || cases.length < 2) return null;

  return (
    <div style={{
      background: 'var(--qs-warning-subtle)',
      border: '1px solid var(--qs-warning-border)',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-warning)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        ⚠ {cases.length} Active {cases.length === 1 ? 'Case' : 'Cases'} — Same Customer
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cases.map(c => (
          <div key={c.id} style={{ fontSize: 12, color: 'var(--qs-text)', display: 'flex', gap: 8 }}>
            <span style={{
              display: 'inline-block', padding: '1px 6px', borderRadius: 3,
              fontSize: 10, fontWeight: 700,
              background: c.type === 'cancel' ? 'var(--qs-warning-subtle)' : 'var(--qs-info-subtle)',
              color: c.type === 'cancel' ? '#F59E0B' : '#3B82F6', // Component color prop — hex intentionally
            }}>
              {c.type === 'cancel'
                ? (c.stage === 'cancelled' ? '🚫 Lapsed' : '⚠ Pending Cancel')
                : '🔄 Renewal'}
            </span>
            <span style={{ color: 'var(--qs-dim)' }}>{c.policy_no}</span>
            <span>{c.product}</span>
            <span style={{ color: 'var(--qs-subtle)', marginLeft: 'auto' }}>
              {c.date}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 6 }}>
        Address all active cases in one call when possible.
      </div>
    </div>
  );
}

// Escape hatch for the no-contact case: a customer who already paid before we
// ever called isn't a rep save — it's resolved as auto_resolved (no save
// credit, no reached-attempt requirement). Two-step to avoid stray clicks.
function AlreadyPaidAction({ onConfirm, busy }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} style={{
        width: "100%", padding: "9px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        border: "1px dashed var(--qs-border)", background: "transparent",
        color: "var(--qs-muted)", fontSize: 12, fontWeight: 600,
      }}>
        Customer already paid in Allstate? Clear it without a call
      </button>
    );
  }
  return (
    <div style={{ border: "1px solid var(--qs-border)", borderRadius: 8, padding: "10px 12px", background: "var(--qs-elevated)" }}>
      <div style={{ fontSize: 12, color: "var(--qs-dim)", marginBottom: 8 }}>
        Clear this case as <strong>already paid</strong>? It resolves as auto-cleared — no call needed, and it does <strong>not</strong> count as a save.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => { setConfirming(false); onConfirm(); }} style={{
          flex: 1, padding: "8px", borderRadius: 8, border: "none", background: busy ? "var(--qs-card)" : "#10B981",
          color: busy ? "var(--qs-muted)" : "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>
          {busy ? "Clearing…" : "Yes, mark paid"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} style={{
          flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--qs-border)", background: "var(--qs-card)",
          color: "var(--qs-text)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event, onClose, onUpdate, agencyId, currentEmployeeId, producers = [], canReassign = true }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  // Whether a reached attempt has been logged this session — unlocks Case
  // Management (the outcome picker) once the rep has actually spoken to them.
  const [reachedLogged, setReachedLogged] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "", intervention: EMPTY_INTERVENTION, direction: "outbound" });
  // Error shown when a reached call is logged without the (now required) save
  // tactic — the moat field is captured here, at the moment of the call.
  const [attemptError, setAttemptError] = useState(null);
  // Fallback save-tactic capture — only used when NO tactic was tagged on any
  // call (the rare legacy/edge path). Normally the tactic is the one already on
  // the reached-call attempts (single source of truth).
  const [saveIntervention, setSaveIntervention] = useState(EMPTY_INTERVENTION);
  // The "closer": which single tactic sealed the save, when 2+ were used.
  const [closer, setCloser] = useState("");
  const { data: itypes = [] } = useInterventionTypes();
  const [form, setForm] = useState({
    status:              event.status,
    assigned_to_id:      event.assigned_to_id || "",
    contact_method:      event.contact_method || "",
    promise_date:        event.promise_date || "",
    termination_reason:  event.termination_reason || "",
    notes:               event.notes || "",
    rewrite_new_premium: event.rewrite_new_premium || "",
    rewrite_reason:      event.rewrite_reason || "",
  });
  // Kept out of `form` so it's only written on the saved (reinstatement) path —
  // the column it targets is pending_cases.saved_premium.
  const [savedPremium, setSavedPremium] = useState(event.saved_premium ?? "");

  // Script + contact inputs (mirrors the queue card).
  const firstName = event.customer_name?.split(" ")[0] || "there";
  const isLapsed = days < 0;
  const me = (producers || []).find(p => p.id === currentEmployeeId);
  const agentName = me
    ? ([me.preferred_name || me.first_name, me.last_name].filter(Boolean).join(" ") || "your agent")
    : "your agent";

  // Callback scheduling (moved off the list card into the work surface).
  const [cbTime, setCbTime] = useState("");
  const [cbNote, setCbNote] = useState("");
  const [cbSaving, setCbSaving] = useState(false);

  async function scheduleCallback() {
    if (!cbTime || cbSaving) return;
    setCbSaving(true);
    const callbackAt = new Date(cbTime).toISOString();
    await supabase.from("pending_cancel_attempts").insert({
      pending_case_id: event.id, agency_id: agencyId, employee_id: currentEmployeeId,
      method: "phone", result: "reached",
      note: `Callback scheduled: ${cbNote || "no details"}`,
    });
    await onUpdate(event.id, {
      attempt_count:       (event.attempt_count || 0) + 1,
      last_attempt_at:     new Date().toISOString(),
      last_attempt_result: "reached",
      contacted_at:        event.contacted_at || new Date().toISOString(),
      callback_at:         callbackAt,
      callback_note:       cbNote || null,
      status: event.status === "pending" ? "contacted" : event.status,
    });
    setCbSaving(false);
    setCbTime(""); setCbNote("");
    onClose();
  }

  const { data: otherCases = [] } = useOtherActiveCases({
    agencyId,
    customerName:     event.customer_name,
    policyNo:         event.policy_no,
    excludeEventId:   event.id,
    excludeRenewalId: null,
  });

  useEffect(() => {
    supabase
      .from("pending_cancel_attempts")
      .select("id, attempted_at, method, result, note, direction, interventions, employees(first_name, last_name)")
      .eq("pending_case_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    if (!currentEmployeeId) {
      console.warn('[logAttempt] No employee ID — cannot log attempt');
      return;
    }
    // Reached the customer → the save tactic is required. This is the one
    // retention input no Allstate report carries, and it's only knowable now.
    const reachedNeedsTactic =
      attemptForm.result === "reached" &&
      !(attemptForm.intervention?.interventions?.length > 0);
    if (reachedNeedsTactic) {
      setAttemptError("Tag this reached call — what you did to save them, or why you couldn't — before logging it.");
      return;
    }
    setAttemptError(null);
    setLoggingAttempt(true);
    const { error } = await supabase.from("pending_cancel_attempts").insert({
      pending_case_id: event.id,
      agency_id:       agencyId,
      employee_id:     currentEmployeeId,
      method:          attemptForm.method,
      result:          attemptForm.result,
      note:            attemptForm.note || null,
      ...(attemptForm.direction === "inbound" ? { direction: "inbound" } : {}),
      ...(attemptForm.result === "reached" ? interventionInsertFields(attemptForm.intervention) : {}),
    });
    if (!error) {
      await supabase.from("pending_cases").update({
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: attemptForm.result,
        ...(event.status === "pending"              ? { status: "attempting"     } : {}),
        ...(attemptForm.result === "left_voicemail" ? { status: "left_voicemail", awaiting_callback: true } : {}),
        ...(attemptForm.result === "reached"        ? { contacted_at: event.contacted_at || new Date().toISOString(), awaiting_callback: false } : {}),
      }).eq("id", event.id);
      // If this is the first attempt on the case, set opened_by_id
      if ((event.attempt_count === 0 || !event.opened_by_id) && currentEmployeeId) {
        await supabase
          .from('pending_cases')
          .update({ opened_by_id: currentEmployeeId })
          .eq('id', event.id)
          .is('opened_by_id', null);
      }
      const { data } = await supabase
        .from("pending_cancel_attempts")
        .select("id, attempted_at, method, result, note, direction, interventions, employees(first_name, last_name)")
        .eq("pending_case_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      if (attemptForm.result === "reached") {
        setReachedLogged(true);
        // A loss reason on a reached call means the case is lost — pre-set the
        // outcome to Lost so the rep just confirms (Close Case). Save tactics
        // never auto-resolve: a save isn't real until the customer commits.
        if ((attemptForm.intervention?.interventions || []).some((c) => LOSS_REASON_CODES.has(c))) {
          setForm((p) => ({ ...p, status: "lost" }));
        }
      }
      setAttemptForm({ method: "phone", result: "no_answer", note: "", intervention: EMPTY_INTERVENTION, direction: "outbound" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  // Already paid before we reached them → auto_resolved (system close, no save
  // credit, exempt from the reached-attempt rule). Allstate is the system of
  // record; this just clears our queue without faking a call. saved_premium
  // stays NULL — it denotes a credited save, and paying the bill in full is not
  // one. (The at-risk amount is still on the row for reference.)
  async function markAlreadyPaid() {
    setSaving(true);
    setSaveError(null);
    const err = await onUpdate(event.id, {
      status: "auto_resolved",
      resolution_date: new Date().toISOString().slice(0, 10),
      closed_by_id: currentEmployeeId,
      saved_premium: null,
    });
    if (err) {
      setSaveError(`Couldn't clear the case: ${err.message || err}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    // Single source of truth: the tactic is captured on the reached call, so the
    // common path here is a plain status update — no second write to fail. The
    // only time we insert is when the case has NO attempt at all, which the
    // save-has-attempt guard (`enforce_cancel_save_has_attempt`) requires; that
    // synthetic row carries the fallback tactic if the rep supplied one.
    if (["saved", "rewritten"].includes(form.status) && attempts.length === 0) {
      const { error: attErr } = await supabase.from("pending_cancel_attempts").insert({
        pending_case_id: event.id, agency_id: agencyId, employee_id: currentEmployeeId,
        method: "phone", result: "reached",
        note: "Outcome recorded from the work surface",
        auto_logged: true, // not a real dialed call — excluded from outreach/reach metrics
        ...interventionInsertFields(saveIntervention),
      });
      if (attErr) {
        setSaveError(`Couldn't record the call: ${attErr.message}`);
        setSaving(false);
        return;
      }
    }
    const updates = { ...form };
    // contact_method has a CHECK constraint (phone/text/email/other or NULL);
    // an unset method comes through as "" from the form — coerce it to null so
    // the write doesn't trip `pending_cancel_events_contact_method_check`.
    updates.contact_method = form.contact_method || null;
    // promise_date is a DATE column; an unset field comes through as "" from the
    // form and Postgres rejects it ("invalid input syntax for type date"). Coerce
    // empty to null — this is what blocked closing a lost case with no pay promise.
    updates.promise_date = form.promise_date || null;
    if (["contacted","promise_to_pay","payment_plan_requested"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["saved","rewritten","lost","requested_cancellation"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    // Set closed_by_id when resolving a case
    if (["saved","rewritten","lost","requested_cancellation","cancelled"].includes(form.status)) {
      updates.closed_by_id = currentEmployeeId;
    }
    // Premium preserved on a straight save (reinstatement). Captured only on the
    // 'saved' outcome, so other resolutions never touch the column. Rewrites use
    // rewrite_new_premium instead (handled below).
    if (form.status === "saved") {
      const sp = parseFloat(String(savedPremium).replace(/[$,]/g, ""));
      updates.saved_premium = Number.isNaN(sp) ? null : sp;
    }
    // Save method (what saved them) — the headline of the Case-Management tactic;
    // only meaningful on a save, cleared on any non-save outcome so a stale
    // tactic doesn't linger.
    updates.save_method = ["saved","rewritten"].includes(form.status)
      ? derivedSaveMethod : null;
    // Strip rewrite fields if not a rewrite outcome
    if (form.status !== "rewritten") {
      updates.rewrite_new_premium = null;
      updates.rewrite_reason      = null;
    } else {
      updates.rewrite_new_premium = form.rewrite_new_premium
        ? parseFloat(String(form.rewrite_new_premium).replace(/[$,]/g, "")) || null
        : null;
    }
    // Sync assigned_to (legacy text) with assigned_to_id (employee FK)
    // Treat empty string same as unset — use strict null check
    const assignedId = updates.assigned_to_id || null;
    updates.assigned_to_id = assignedId;
    if (!assignedId) {
      updates.assigned_to = null;
    } else {
      const rep = producers.find(p => p.id === assignedId);
      updates.assigned_to = rep
        ? (rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim())
        : null;
    }
    const err = await onUpdate(event.id, updates);
    if (err) {
      setSaveError(`Couldn't save the case: ${err.message || err}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  const ATTEMPT_RESULT_LABELS = {
    no_answer:      "No Answer",
    left_voicemail: "Left Voicemail",
    reached:        "Reached",
    wrong_number:   "Wrong Number",
    busy:           "Busy",
    disconnected:   "Disconnected",
  };

  // Case Management is gated behind a reached customer: the outcome picker only
  // unlocks once a "reached" attempt has actually been LOGGED (Log Attempt
  // clicked), a reached attempt is already on the record (contacted_at stamped),
  // or the case already holds an outcome status. No reach → nothing to record.
  const showOutcomePicker =
    reachedLogged ||
    event.last_attempt_result === "reached" ||
    !!event.contacted_at ||
    // Keep an already-resolved case viewable/editable even if contacted_at was
    // never stamped (e.g. marked saved directly off a reached call).
    ["contacted","payment_plan_requested","promise_to_pay","saved","rewritten","requested_cancellation","lost"].includes(event.status);

  // Scopes the tactic chips to cancel-only tactics (paid past due, reinstated).
  const caseContext = "cancel";
  // Reinstatement (paying after the policy cancels) only makes sense once it
  // has actually cancelled — hide that chip until then.
  const tacticFilter = (t) => t.code !== "reinstatement" || event.stage === "cancelled";
  // The save dollars feed the lift/velocity math, so the premium is required on
  // a save/rewrite outcome — block Save until it's entered.
  const premiumMissing =
    (form.status === "saved" && String(savedPremium).trim() === "") ||
    (form.status === "rewritten" && String(form.rewrite_new_premium ?? "").trim() === "");
  // Button reflects what the selected outcome does: a terminal outcome closes
  // (leaves the queue); anything still-open just saves progress.
  const resolveLabel =
    ["saved","rewritten","lost","requested_cancellation","cancelled"].includes(form.status)
      ? "Close Case" : "Save Progress";
  // Single source of truth: the save tactics already tagged on the reached-call
  // attempts. The close screen reads these — it never re-asks.
  const onRecordTactics = onRecordSaveTactics(attempts);
  const tacticLabel = (c) => itypes.find((t) => t.code === c)?.display_name || c;
  // Headline save_method: the closer when 2+ tactics (priority over all if the
  // rep skipped), the lone tactic when one, else the fallback capture.
  const closerCodes =
    onRecordTactics.length >= 2 ? (closer ? [closer] : onRecordTactics)
    : onRecordTactics.length === 1 ? onRecordTactics
    : (saveIntervention.interventions || []);
  const derivedSaveMethod = saveMethodFromCodes(closerCodes) || event.save_method || null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--qs-card)",
        border: "1px solid var(--qs-border)",
        borderRadius: 14,
        width: "100%",
        maxWidth: 1080,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--qs-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--qs-bright)", marginBottom: 4 }}>
              {maskCustomerName(event.customer_name) || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 13, color: "var(--qs-subtle)" }}>
              Policy {event.policy_no} · {productLabel(event.product)} · Cycle {event.cycle}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--qs-elevated)",
              border: "1px solid var(--qs-border)",
              color: "var(--qs-dim)",
              borderRadius: 8,
              width: 32, height: 32,
              cursor: "pointer",
              fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto" }}>

          {/* ── Other cases warning ─────────────────────────── */}
          <OtherCasesWarning cases={otherCases} />

          {/* ── Lapsed banner ───────────────────────────────── */}
          {event.stage === 'cancelled' && (
            <div style={{
              background: 'var(--qs-danger-subtle)',
              border: '1px solid var(--qs-danger-border)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--qs-danger)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
              }}>
                🚫 Coverage Lapsed — Reinstatement Required
              </div>
              <div style={{ fontSize: 14, color: 'var(--qs-text)' }}>
                Amount to reinstate:{' '}
                <strong style={{ color: 'var(--qs-warning)', fontFamily: "'DM Mono', monospace" }}>
                  {event.amount_due ? `$${Number(event.amount_due).toLocaleString()}` : '—'}
                </strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 4 }}>
                Customer must pay this amount to restore coverage before termination.
              </div>
            </div>
          )}

          {/* ── KPI strip ───────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginBottom: 20,
          }}>
            {[
              {
                label: "Cancel Date",
                value: event.cancel_effective_date || "\u2014",
                color: urgencyColor(days),
              },
              {
                label: "Days Left",
                value: days <= 0 ? "PAST DUE" : `${days} days`,
                color: urgencyColor(days),
              },
              {
                label: "Premium",
                value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "\u2014",
                color: "var(--qs-bright)",
              },
              {
                label: "Attempts",
                value: String(event.attempt_count || 0),
                color: (event.attempt_count || 0) >= 3 ? "#EF4444" : "var(--qs-dim)",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "var(--qs-elevated)",
                border: "1px solid var(--qs-border)",
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--qs-subtle)",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color,
                  fontFamily: "'DM Mono', monospace", lineHeight: 1,
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Active renewal warning — customer also has an active renewal ── */}
          {event.has_active_renewal && event.active_renewal_id && (
            <div style={{
              background: 'rgba(59,130,246,0.07)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#3B82F6',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
              }}>
                ℹ This customer also has an active renewal
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                Resolve this payment issue first. Their renewal case is active —
                resolving the cancel strengthens the renewal conversation.
              </div>
            </div>
          )}

          {/* ── Cross-sell opportunity ── */}
          {event.cross_sell_opportunity && event.cross_sell_product && (
            <div style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#10B981',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
              }}>
                💡 Bundle to save — {productLabel(event.cross_sell_product)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                Quote <strong>{productLabel(event.cross_sell_product)}</strong> as part of the save: a
                multi-policy bundle adds a discount that <strong>lowers this premium</strong> — often the
                fix for a payment-driven cancellation. If they bundle, the cancel resolves and this
                cross-sell auto-releases as a follow-through opportunity.
              </div>
            </div>
          )}

          {/* ── Contact · Call · scripts ─────────────────────── */}
          <div style={{
            background: "var(--qs-elevated)", border: "1px solid var(--qs-border)",
            borderRadius: 10, padding: "14px 16px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Contact</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 14, color: "var(--qs-text)", fontFamily: "'DM Mono', monospace" }}>{event.phone || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 14, color: "var(--qs-dim)" }}>{event.email || "—"}</div>
              </div>
            </div>
            {event.phone && (
              <a href={`tel:${event.phone}`} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                marginTop: 12, width: "100%", boxSizing: "border-box",
                padding: "11px 16px", borderRadius: 8, background: "#10B981", color: "#fff",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}>{"📞"} Call {event.phone}</a>
            )}
            <div style={{ marginTop: 12 }}>
              <CallScriptBox label="Call script">
                {cancelCallScript({
                  firstName, agentName, product: event.product, isLapsed,
                  amountDue: event.amount_due, effectiveDate: event.cancel_effective_date,
                })}
              </CallScriptBox>
              <VoicemailScriptBox firstName={firstName} agentName={agentName} product={event.product} />
            </div>
          </div>

          {/* ── Schedule a callback ──────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <label className="dark-label">Schedule a callback</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="datetime-local" className="dark-input" value={cbTime}
                onChange={e => setCbTime(e.target.value)} style={{ maxWidth: 230 }} />
              <input className="dark-input" placeholder="Note (optional)" value={cbNote}
                onChange={e => setCbNote(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <button onClick={scheduleCallback} disabled={!cbTime || cbSaving} style={{
                fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "none",
                background: "#3B82F6", color: "#fff", fontWeight: 700,
                cursor: (!cbTime || cbSaving) ? "not-allowed" : "pointer",
                opacity: (!cbTime || cbSaving) ? 0.5 : 1, fontFamily: "inherit",
              }}>{cbSaving ? "Scheduling…" : "📅 Schedule"}</button>
            </div>
            {event.callback_at && (
              <div style={{ fontSize: 12, color: "#60A5FA", marginTop: 6 }}>
                Current: {new Date(event.callback_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            )}
          </div>

          {/* ── Section: Attempt Log ─────────────────────────── */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 12,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>Attempt Log</span>
            <span style={{
              background: "var(--qs-elevated)",
              border: "1px solid var(--qs-border)",
              borderRadius: 20, padding: "1px 8px",
              fontSize: 11, color: "var(--qs-dim)",
              fontWeight: 600,
            }}>
              {attempts.length}
            </span>
          </div>

          {/* Log attempt form */}
          <div style={{
            background: "var(--qs-elevated)",
            border: "1px solid var(--qs-border)",
            borderRadius: 10, padding: "14px 16px",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[{ v: "outbound", label: "📞 We called" }, { v: "inbound", label: "📲 They called (inbound)" }].map(opt => {
                const on = attemptForm.direction === opt.v;
                return (
                  <button key={opt.v} type="button"
                    onClick={() => setAttemptForm(p => ({ ...p, direction: opt.v }))}
                    style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 8px", borderRadius: 7,
                      cursor: "pointer", border: "1px solid",
                      borderColor: on ? "#3B82F6" : "var(--qs-border)",
                      background: on ? "rgba(59,130,246,0.14)" : "var(--qs-elevated)",
                      color: on ? "#60A5FA" : "var(--qs-dim)", fontFamily: "inherit" }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label className="dark-label">Method</label>
                <select
                  className="dark-select"
                  value={attemptForm.method}
                  onChange={e => setAttemptForm(p => ({ ...p, method: e.target.value }))}
                >
                  <option value="phone">Phone</option>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="dark-label">Result</label>
                <select
                  className="dark-select"
                  value={attemptForm.result}
                  onChange={e => { setAttemptForm(p => ({ ...p, result: e.target.value })); setAttemptError(null); }}
                >
                  <option value="no_answer">No Answer</option>
                  <option value="left_voicemail">Left Voicemail</option>
                  <option value="reached">Reached Customer</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="busy">Busy</option>
                  <option value="disconnected">Disconnected</option>
                </select>
              </div>
            </div>

            <input
              className="dark-input"
              type="text"
              placeholder="Quick note (optional)"
              value={attemptForm.note}
              onChange={e => setAttemptForm(p => ({ ...p, note: e.target.value }))}
              style={{ marginBottom: 10 }}
            />

            {/* Reached the customer \u2192 capture the save tactic right here, in the
                flow. Required: this is the moat field, and the only moment it's
                knowable. */}
            {attemptForm.result === "reached" && (
              <InterventionPicker
                context={caseContext}
                filter={tacticFilter}
                required
                includeLoss
                value={attemptForm.intervention}
                onChange={(iv) => { setAttemptForm(p => ({ ...p, intervention: iv })); if (iv?.interventions?.length) setAttemptError(null); }}
              />
            )}

            {attemptError && (
              <div style={{
                fontSize: 12, fontWeight: 600, color: "var(--qs-warn, #F59E0B)",
                marginBottom: 10,
              }}>
                {attemptError}
              </div>
            )}

            <button
              onClick={logAttempt}
              disabled={loggingAttempt || !currentEmployeeId}
              title={!currentEmployeeId ? 'Employee record not loaded' : undefined}
              style={{
                width: "100%", padding: "10px",
                borderRadius: 8, border: "none",
                background: (loggingAttempt || !currentEmployeeId) ? "var(--qs-elevated)" : "#3B82F6",
                color: (loggingAttempt || !currentEmployeeId) ? "var(--qs-muted)" : "#fff",
                fontSize: 14, fontWeight: 600,
                cursor: (loggingAttempt || !currentEmployeeId) ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loggingAttempt ? "Logging\u2026" : "+ Log Call"}
            </button>
          </div>

          {/* Past attempts */}
          {attempts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {attempts.map(a => {
                const empName = a.employees
                  ? `${a.employees.first_name || ""} ${a.employees.last_name || ""}`.trim()
                  : "Unknown";
                const resultLabel = ATTEMPT_RESULT_LABELS[a.result] || a.result;
                const resultColor = a.result === "reached" ? "#10B981"
                  : a.result === "left_voicemail" ? "#F59E0B"
                  : "var(--qs-dim)";
                return (
                  <div key={a.id} style={{
                    background: "var(--qs-elevated)",
                    border: "1px solid var(--qs-border)",
                    borderRadius: 8, padding: "10px 14px",
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: resultColor }}>
                        {resultLabel}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--qs-subtle)", marginLeft: 8 }}>
                        via {a.method}
                      </span>
                      {a.direction === "inbound" && (
                        <span title="Customer called the agency — not an outbound dial" style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, marginLeft: 8,
                          background: "rgba(96,165,250,0.14)", border: "1px solid rgba(96,165,250,0.45)", color: "#60A5FA",
                        }}>↙ CALLED IN</span>
                      )}
                      {(a.interventions || []).length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {a.interventions.map(code => (
                            <span key={code} style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4,
                              background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)", color: "#A78BFA",
                            }}>🏷 {String(code).replace(/_/g, " ")}</span>
                          ))}
                        </div>
                      )}
                      {a.note && (
                        <div style={{ fontSize: 12, color: "var(--qs-dim)", marginTop: 3 }}>
                          {a.note}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--qs-subtle)", textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 500 }}>{empName}</div>
                      <div>{new Date(a.attempted_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--qs-border)", margin: "4px 0 20px" }} />

          {/* ── Section: Case Management ─────────────────────── */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
          }}>
            Case Management
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Outcome — visible but locked (greyed, not editable) until a
                reached attempt is logged. */}
            <div style={{ opacity: showOutcomePicker ? 1 : 0.45 }}
              title={showOutcomePicker ? undefined : "Log a reached attempt to record an outcome"}>
              <label className="dark-label">Outcome (customer reached)</label>
              <select
                className="dark-select"
                value={form.status}
                disabled={!showOutcomePicker}
                onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}
                style={{ cursor: showOutcomePicker ? undefined : "not-allowed" }}
              >
                {/* When the case hasn't been resolved to one of the outcomes
                    below, form.status (e.g. "pending"/"attempting") matches no
                    option — a native select would then silently DISPLAY the
                    first option. Render a matching placeholder so it reads
                    "Select an outcome" and stays in sync with state. */}
                {!["contacted","payment_plan_requested","promise_to_pay","saved","rewritten","requested_cancellation","lost"].includes(form.status) && (
                  <option value={form.status}>— Select an outcome —</option>
                )}
                <option value="contacted">Contacted — no action yet</option>
                <option value="payment_plan_requested">Wants Payment Plan</option>
                <option value="promise_to_pay">Promised to Pay</option>
                <option value="saved">Saved ✓ — paid, policy continues</option>
                <option value="rewritten">Rewritten ✓ — new policy at lower rate</option>
                <option value="requested_cancellation">Wants to Cancel</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            {/* No-contact escape hatch: customer already paid before we reached
                them. Only meaningful while the case is still open. */}
            {!["saved","rewritten","lost","requested_cancellation","cancelled","auto_resolved"].includes(event.status) && (
              <AlreadyPaidAction onConfirm={markAlreadyPaid} busy={saving} />
            )}

            {/* Rewrite detail fields — only when Rewritten is selected */}
            {form.status === "rewritten" && (
              <div style={{
                background: "rgba(52,211,153,0.06)",
                border: "1px solid rgba(52,211,153,0.2)",
                borderRadius: 10,
                padding: "14px 16px",
                marginTop: 4,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#34D399",
                  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12,
                }}>
                  Rewrite Details
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="dark-label">
                      New Premium <span style={{ fontWeight: 400, color: "var(--qs-muted)" }}>({premiumTermLabel(event.product)})</span>
                      <span style={{ color: "#F87171", marginLeft: 2 }}>*</span>
                    </label>
                    <input
                      className="dark-input"
                      type="number"
                      placeholder="e.g. 1850"
                      min="0"
                      step="1"
                      value={form.rewrite_new_premium}
                      onChange={ev => setForm(p => ({ ...p, rewrite_new_premium: ev.target.value }))}
                    />
                    {form.rewrite_new_premium && event.premium_at_risk && (
                      <div style={{ fontSize: 11, color: "#34D399", marginTop: 4 }}>
                        {(() => {
                          const orig = parseFloat(event.premium_at_risk);
                          const newPrem = parseFloat(form.rewrite_new_premium);
                          if (!orig || !newPrem || newPrem >= orig) return null;
                          const savings = orig - newPrem;
                          const pct = ((savings / orig) * 100).toFixed(1);
                          return `↓ $${savings.toLocaleString()} reduction (${pct}% off)`;
                        })()}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="dark-label">Reason for Rate Reduction</label>
                    <select
                      className="dark-select"
                      value={form.rewrite_reason}
                      onChange={ev => setForm(p => ({ ...p, rewrite_reason: ev.target.value }))}
                    >
                      <option value="">— Select reason —</option>
                      <option value="coverage_reduction">Coverage reduction</option>
                      <option value="discount_applied">New discount applied</option>
                      <option value="tier_change">Tier change</option>
                      <option value="competitor_match">Held vs. competitor quote</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "var(--qs-muted)", marginTop: 10 }}>
                  Original premium: <strong style={{ color: "var(--qs-dim)" }}>
                    {event.premium_at_risk
                      ? `$${Number(event.premium_at_risk).toLocaleString()}`
                      : "—"}
                  </strong>
                </div>
              </div>
            )}

            {/* Saved premium — only on a straight save (reinstatement) */}
            {form.status === "saved" && (
              <div>
                <label className="dark-label">Premium saved <span style={{ fontWeight: 400, color: "var(--qs-muted)" }}>({premiumTermLabel(event.product)})</span><span style={{ color: "#F87171", marginLeft: 2 }}>*</span></label>
                <input
                  className="dark-input"
                  inputMode="decimal"
                  placeholder={event.premium_at_risk ? `At risk was ${fmtFull$(event.premium_at_risk)}` : "Premium the policy continues at"}
                  value={savedPremium}
                  onChange={ev => setSavedPremium(ev.target.value)}
                />
                <div style={{ fontSize: 11, color: "var(--qs-muted)", marginTop: 4 }}>
                  What the policy continues at after the save.
                  {event.premium_at_risk ? (
                    <button type="button"
                      onClick={() => setSavedPremium(String(event.premium_at_risk))}
                      style={{ marginLeft: 6, background: "none", border: "none", padding: 0,
                        color: "#34D399", fontWeight: 600, cursor: "pointer", fontSize: 11 }}>
                      use at-risk amount
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* What saved them — read from the tactics already tagged on the
                reached calls (single source of truth). Re-asked only if none was
                captured; the closer is asked only when 2+ tactics were used. */}
            {["saved","rewritten"].includes(form.status) && (
              <div>
                <label className="dark-label">What saved them?</label>
                {onRecordTactics.length === 0 ? (
                  <InterventionPicker
                    context={caseContext}
                    filter={tacticFilter}
                    required
                    value={saveIntervention}
                    onChange={setSaveIntervention}
                  />
                ) : onRecordTactics.length === 1 ? (
                  <div style={{ fontSize: 12, color: "var(--qs-dim)" }}>
                    Tactic on record:{" "}
                    <strong style={{ color: "var(--qs-text)" }}>{tacticLabel(onRecordTactics[0])}</strong>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "var(--qs-muted)", marginBottom: 8 }}>
                      Tactics on record: {onRecordTactics.map(tacticLabel).join(" · ")}
                    </div>
                    <CloserPicker
                      codes={onRecordTactics}
                      value={closer}
                      onChange={setCloser}
                      label="Which one sealed it?"
                    />
                  </>
                )}
              </div>
            )}

            {/* Assignment + Promise date */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="dark-label">Assigned To</label>
                {canReassign ? (
                  <select
                    className="dark-select"
                    value={form.assigned_to_id}
                    onChange={ev => setForm(p => ({ ...p, assigned_to_id: ev.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {producers.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.preferred_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--qs-elevated)",
                    border: "1px solid var(--qs-border)", fontSize: 13, color: "var(--qs-text)" }}>
                    {(() => {
                      const a = producers.find(p => p.id === form.assigned_to_id);
                      return a ? (a.preferred_name || `${a.first_name || ""} ${a.last_name || ""}`.trim()) : "Unassigned";
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label className="dark-label">Pay Promise Date</label>
                <input
                  className="dark-input"
                  type="date"
                  value={form.promise_date}
                  onChange={ev => setForm(p => ({ ...p, promise_date: ev.target.value }))}
                />
              </div>
            </div>

            {/* Termination reason — only when requesting cancellation */}
            {form.status === "requested_cancellation" && (
              <div>
                <label className="dark-label">Termination Reason</label>
                <select
                  className="dark-select"
                  value={form.termination_reason}
                  onChange={ev => setForm(p => ({ ...p, termination_reason: ev.target.value }))}
                >
                  <option value="">— Select reason —</option>
                  {TERMINATION_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <CaseNotesFeed caseType="cancel" caseId={event.id} agencyId={agencyId}
              policyNo={event.policy_no} customerName={event.customer_name} />

            <LinkedServiceTasks caseType="cancel" caseId={event.id} />

            <LogServiceTaskButton agencyId={agencyId} policyNo={event.policy_no}
              customerName={event.customer_name} customerPhone={event.phone}
              sourceCaseType="cancel" sourceCaseId={event.id} source="internal" />

            <ReferToSalesBox agencyId={agencyId} caseType="cancel" caseId={event.id}
              customerName={event.customer_name} policyNo={event.policy_no}
              currentProduct={event.product} />

            <EscalateCaseBox caseType="cancel" caseId={event.id} onEscalated={onClose} />

            <div>
              <button
                onClick={save}
                disabled={saving || premiumMissing}
                title={premiumMissing ? "Enter the premium before closing this case" : undefined}
                style={{
                  width: "100%", padding: "12px",
                  borderRadius: 10, border: "none",
                  background: (saving || premiumMissing) ? "var(--qs-elevated)" : "#10B981",
                  color: (saving || premiumMissing) ? "var(--qs-muted)" : "#fff",
                  fontSize: 15, fontWeight: 700,
                  cursor: (saving || premiumMissing) ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  marginTop: 4,
                }}
              >
                {saving ? "Saving\u2026" : resolveLabel}
              </button>
              {premiumMissing && (
                <div style={{ fontSize: 12, color: "#F87171", marginTop: 8, textAlign: "center" }}>
                  Enter the premium amount above to close this case.
                </div>
              )}
              {saveError && (
                <div style={{ fontSize: 12, color: "#F87171", marginTop: 8, textAlign: "center",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "8px 10px" }}>
                  {saveError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Renewal Status Config ──────────────────────────────────────────────────

// Status badge colors — used as style props
const RENEWAL_STATUS_CONFIG = {
  pending:          { label: "Pending",          color: "var(--qs-dim)", bg: "#F1F5F9" },
  attempting:       { label: "Attempting",       color: "#F59E0B", bg: "#FEF3C7" },
  left_voicemail:   { label: "Left Voicemail",   color: "#F59E0B", bg: "#FEF3C7" },
  review_requested: { label: "Review Requested", color: "#3B82F6", bg: "#DBEAFE" },
  shopping:         { label: "Shopping",         color: "#EF4444", bg: "#FEE2E2" },
  confirmed:        { label: "Confirmed ✓", color: "#10B981", bg: "#D1FAE5" },
  at_risk:          { label: "At Risk",          color: "#EF4444", bg: "#FEE2E2" },
  escalated:        { label: "Escalated",        color: "#8B5CF6", bg: "#EDE9FE" },
  lost:             { label: "Lost",             color: "#6B7280", bg: "#F3F4F6" },
  unreachable:      { label: "Unreachable",      color: "var(--qs-subtle)", bg: "#F1F5F9" },
  auto_resolved:    { label: "Auto-Resolved",    color: "var(--qs-dim)", bg: "#F1F5F9" },
};

// Resolved-state banner copy for a renewal. `auto_resolved` is overloaded: the
// nightly cron uses it for system-INFERRED renewals (easy-pay/age — nobody
// called), while the work surface reuses it for a rep who reached a happy or
// already-paid customer (renewed, OBSERVED, not a save). `outcome_source` is the
// disambiguator — surface it so a closed case never reads as "the system did
// it" when a rep actually confirmed it, or vice-versa.
function renewalResolutionBanner(status, outcomeSource) {
  if (status === "confirmed")
    return { label: "Renewed — saved", sub: "rep-confirmed", color: "#10B981", bg: "#D1FAE5" };
  if (status === "lost")
    return { label: "Lost — did not renew", sub: null, color: "#6B7280", bg: "#F3F4F6" };
  if (status === "unreachable")
    return { label: "Unreachable", sub: "no contact made", color: "var(--qs-subtle)", bg: "#F1F5F9" };
  if (status === "auto_resolved") {
    return (outcomeSource === "observed" || outcomeSource === "rep")
      ? { label: "Renewed — confirmed by rep", sub: "not credited as a save", color: "#10B981", bg: "#D1FAE5" }
      : { label: "Auto-resolved — system-inferred", sub: "no call logged", color: "var(--qs-dim)", bg: "#F1F5F9" };
  }
  return null;
}

const RENEWAL_CONTACT_METHODS = ["phone", "text", "email", "other"];

function daysUntilRenewal(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

// Dynamic color — used as style prop
function renewalUrgencyColor(days) {
  if (days < 7) return "#EF4444";
  if (days <= 21) return "#F59E0B";
  return "#10B981";
}

// ─── Renewal Detail Modal ───────────────────────────────────────────────────

function RenewalDetailModal({ event, onClose, onUpdate, producers, agencyId, currentEmployeeId, canReassign = true }) {
  const days = daysUntilRenewal(event.renewal_date);
  // Observed retention model so the Priority readout matches the queue ranking
  // (product × tenure churn) regardless of which surface opened this modal.
  const { data: book } = useBookSnapshots(agencyId);
  const churnModel = useMemo(() => buildChurnModel(book?.products || []), [book]);
  // Script inputs — same source the queue list uses, so the words match.
  const firstName = event.customer_name?.split(' ')[0] || 'there';
  const scriptChangePct = parseFloat(event.premium_change_pct) || 0;
  const rateShock = scriptChangePct >= 15;
  const me = (producers || []).find(p => p.id === currentEmployeeId);
  const agentName = me
    ? ([me.preferred_name || me.first_name, me.last_name].filter(Boolean).join(' ') || 'your agent')
    : 'your agent';
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  // Whether a reached attempt has been logged this session — unlocks Case
  // Management (the outcome picker) once the rep has actually spoken to them.
  const [reachedLogged, setReachedLogged] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "", intervention: EMPTY_INTERVENTION, direction: "outbound" });
  // Error shown when a reached call is logged without the (now required) save
  // tactic — the moat field is captured here, at the moment of the call.
  const [attemptError, setAttemptError] = useState(null);
  // Fallback save-tactic capture — only used when NO tactic was tagged on any
  // call. Normally the tactic is the one already on the reached-call attempts.
  const [saveIntervention, setSaveIntervention] = useState(EMPTY_INTERVENTION);
  // The "closer": which single tactic sealed the save, when 2+ were used.
  const [closer, setCloser] = useState("");
  const { data: itypes = [] } = useInterventionTypes();
  const [form, setForm] = useState({
    status: event.status,
    assigned_to_id: event.assigned_to_id || "",
    contact_method: event.contact_method || "",
    notes: event.notes || "",
    shopping_reason: event.shopping_reason || "",
  });
  // Kept out of `form` so it's only written to renewal_cases on the confirmed
  // (saved) path — the column it targets is the new saved_premium field.
  // Pre-fill with the renewal offer from the report so the rep doesn't retype it;
  // they only change it when the customer paid a different amount.
  const [savedPremium, setSavedPremium] = useState(
    event.saved_premium ?? (event.premium != null ? String(event.premium) : "")
  );
  // Callback scheduling (moved off the list card into the work surface).
  const [cbTime, setCbTime] = useState("");
  const [cbNote, setCbNote] = useState("");
  const [cbSaving, setCbSaving] = useState(false);

  async function scheduleCallback() {
    if (!cbTime || cbSaving) return;
    setCbSaving(true);
    const callbackAt = new Date(cbTime).toISOString();
    await supabase.from("renewal_attempts").insert({
      renewal_case_id: event.id, agency_id: agencyId, employee_id: currentEmployeeId,
      method: "phone", result: "reached",
      note: `Callback scheduled: ${cbNote || "no details"}`,
    });
    await onUpdate(event.id, {
      attempt_count:       (event.attempt_count || 0) + 1,
      last_attempt_at:     new Date().toISOString(),
      last_attempt_result: "reached",
      contacted_at:        event.contacted_at || new Date().toISOString(),
      callback_at:         callbackAt,
      callback_note:       cbNote || null,
    });
    setCbSaving(false);
    setCbTime(""); setCbNote("");
    onClose();
  }

  const { data: otherCases = [] } = useOtherActiveCases({
    agencyId,
    customerName: event.customer_name,
    policyNo: event.policy_no,
    excludeEventId: null,
    excludeRenewalId: event.id,
  });

  useEffect(() => {
    supabase
      .from("renewal_attempts")
      .select("id, attempted_at, method, result, note, direction, interventions, employees(first_name, last_name)")
      .eq("renewal_case_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    if (!currentEmployeeId) {
      console.warn('[logAttempt] No employee ID — cannot log attempt');
      return;
    }
    // Reached the customer → the save tactic is required. This is the one
    // retention input no Allstate report carries, and it's only knowable now.
    const reachedNeedsTactic =
      attemptForm.result === "reached" &&
      !(attemptForm.intervention?.interventions?.length > 0);
    if (reachedNeedsTactic) {
      setAttemptError("Tag this reached call — what you did to save them, or why you couldn't — before logging it.");
      return;
    }
    setAttemptError(null);
    setLoggingAttempt(true);
    const { error } = await supabase.from("renewal_attempts").insert({
      renewal_case_id: event.id,
      agency_id: agencyId,
      employee_id: currentEmployeeId,
      method: attemptForm.method,
      result: attemptForm.result,
      note: attemptForm.note || null,
      ...(attemptForm.direction === "inbound" ? { direction: "inbound" } : {}),
      ...(attemptForm.result === "reached" ? interventionInsertFields(attemptForm.intervention) : {}),
    });
    if (!error) {
      const newCount = (event.attempt_count || 0) + 1;
      const statusUpdate = {};
      if (event.status === "pending") statusUpdate.status = "attempting";
      if (attemptForm.result === "left_voicemail") { statusUpdate.status = "left_voicemail"; statusUpdate.awaiting_callback = true; }
      if (attemptForm.result === "reached") { statusUpdate.contacted_at = event.contacted_at || new Date().toISOString(); statusUpdate.awaiting_callback = false; }
      // Suggest unreachable after 3+ non-reached attempts
      if (newCount >= 3 && attemptForm.result !== "reached" && event.status === "attempting") {
        // Don't auto-set, just leave as attempting — auto-unreachable handles at 5+
      }

      await supabase.from("renewal_cases").update({
        attempt_count: newCount,
        last_attempt_at: new Date().toISOString(),
        last_attempt_result: attemptForm.result,
        ...statusUpdate,
      }).eq("id", event.id);
      // If this is the first attempt on the case, set opened_by_id
      if ((event.attempt_count === 0 || !event.opened_by_id) && currentEmployeeId) {
        await supabase
          .from('renewal_cases')
          .update({ opened_by_id: currentEmployeeId })
          .eq('id', event.id)
          .is('opened_by_id', null);
      }

      const { data } = await supabase
        .from("renewal_attempts")
        .select("id, attempted_at, method, result, note, direction, interventions, employees(first_name, last_name)")
        .eq("renewal_case_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      if (attemptForm.result === "reached") {
        setReachedLogged(true);
        const tags = attemptForm.intervention?.interventions || [];
        // Happy with policy → renewed but NOT a save. Resolve as auto_resolved
        // (renewed, observed, not credited) and close — same bucket as an
        // already-paid renewal, so it never lands in the save tally.
        // saved_premium stays NULL: it means "premium credited as a save", and
        // there was nothing to save here. The premium audit derives the paid
        // amount from the offer for auto-resolved rows, so leaving it NULL loses
        // nothing and keeps the "saved_premium ⇒ credited save" invariant true.
        if (tags.some((c) => HAPPY_CODES.has(c))) {
          await onUpdate(event.id, {
            status: "auto_resolved",
            final_outcome: "renewed",
            outcome_source: "observed",
            final_outcome_set_by: currentEmployeeId,
            final_outcome_set_at: new Date().toISOString(),
            resolution_date: new Date().toISOString().slice(0, 10),
            closed_by_id: currentEmployeeId,
            saved_premium: null,
          });
          setAttemptForm({ method: "phone", result: "no_answer", note: "", intervention: EMPTY_INTERVENTION, direction: "outbound" });
          setLoggingAttempt(false);
          onClose();
          return;
        }
        // A loss reason on a reached call means the case is lost — pre-set the
        // outcome to Lost so the rep just confirms (Close Case). Save tactics
        // never auto-resolve: a save isn't real until the customer commits.
        if (tags.some((c) => LOSS_REASON_CODES.has(c))) {
          setForm((p) => ({ ...p, status: "lost" }));
        }
      }
      setAttemptForm({ method: "phone", result: "no_answer", note: "", intervention: EMPTY_INTERVENTION, direction: "outbound" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  // Already paid before we reached them → auto_resolved (renewed, but observed
  // not rep-driven, so it's exempt from the reached-attempt rule and earns no
  // save credit). saved_premium stays NULL — it denotes a credited save, and
  // this isn't one. The customer paid the offer in full (premium difference $0);
  // the premium audit reconstructs that from the offer for auto-resolved rows.
  async function markAlreadyPaid() {
    setSaving(true);
    setSaveError(null);
    const err = await onUpdate(event.id, {
      status: "auto_resolved",
      final_outcome: "renewed",
      outcome_source: "observed",
      final_outcome_set_by: currentEmployeeId,
      final_outcome_set_at: new Date().toISOString(),
      resolution_date: new Date().toISOString().slice(0, 10),
      closed_by_id: currentEmployeeId,
      saved_premium: null,
    });
    if (err) {
      setSaveError(`Couldn't clear the case: ${err.message || err}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    // Single source of truth: the tactic is captured on the reached call, so the
    // common path here is a plain status update — no second write to fail. The
    // only time we insert is when the case has NO attempt at all, which the
    // save-has-attempt guard (`enforce_renewal_save_has_attempt`) requires; that
    // synthetic row carries the fallback tactic if the rep supplied one.
    if (form.status === "confirmed" && attempts.length === 0) {
      const { error: attErr } = await supabase.from("renewal_attempts").insert({
        renewal_case_id: event.id, agency_id: agencyId, employee_id: currentEmployeeId,
        method: "phone", result: "reached",
        note: "Outcome recorded from the work surface",
        auto_logged: true, // not a real dialed call — excluded from outreach/reach metrics
        ...interventionInsertFields(saveIntervention),
      });
      if (attErr) {
        setSaveError(`Couldn't record the call: ${attErr.message}`);
        setSaving(false);
        return;
      }
    }
    const updates = { ...form };
    // contact_method has a CHECK constraint (phone/text/email/other or NULL);
    // an unset method comes through as "" from the form — coerce it to null so
    // the write doesn't trip `renewal_events_contact_method_check`.
    updates.contact_method = form.contact_method || null;
    if (["review_requested","confirmed","at_risk","shopping","escalated"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["confirmed","lost"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    // Set closed_by_id when resolving a case
    if (["confirmed","lost","unreachable"].includes(form.status)) {
      updates.closed_by_id = currentEmployeeId;
    }
    // Stamp the rep-confirmed elasticity label (outcome + provenance), so every
    // resolved renewal carries a trustworthy final_outcome for the retention dataset.
    if (["confirmed","lost"].includes(form.status)) {
      updates.final_outcome        = form.status === "confirmed" ? "renewed" : "lost";
      updates.outcome_source       = "rep";
      updates.final_outcome_set_by = currentEmployeeId;
      updates.final_outcome_set_at = new Date().toISOString();
    }
    // Saved premium — what the agent got the renewal down to. Captured only on a
    // confirmed save, so other resolutions never touch the new column.
    if (form.status === "confirmed") {
      const sp = parseFloat(String(savedPremium).replace(/[$,]/g, ""));
      updates.saved_premium = Number.isNaN(sp) ? null : sp;
    }
    // Save method (what saved them) — auto-derived from the tactic captured on
    // the call; only meaningful on a confirmed save, cleared otherwise so a
    // stale tactic doesn't linger on a lost/shopping case.
    updates.save_method = form.status === "confirmed" ? derivedSaveMethod : null;
    updates.assigned_to_id = updates.assigned_to_id || null;
    if (form.status !== "shopping") updates.shopping_reason = null;
    const err = await onUpdate(event.id, updates);
    if (err) {
      setSaveError(`Couldn't save the case: ${err.message || err}`);
      setSaving(false);
      return;
    }
    // House rule: a household's active renewals are never split across reps —
    // if this save changed the assignee, carry the customer's other open
    // renewal cases to the same rep.
    if (updates.assigned_to_id && updates.assigned_to_id !== event.assigned_to_id) {
      try {
        await reassignRenewalHousehold(supabase, agencyId, {
          caseId: event.id,
          customerName: event.customer_name,
          phone: event.phone,
          employeeId: updates.assigned_to_id,
        });
      } catch (e) {
        console.error('[household reassign]', e.message);
      }
    }
    setSaving(false);
    onClose();
  }

  const ATTEMPT_RESULT_LABELS = {
    no_answer:      "No Answer",
    left_voicemail: "Left Voicemail",
    reached:        "Reached",
    wrong_number:   "Wrong Number",
    busy:           "Busy",
    disconnected:   "Disconnected",
  };

  // Case Management is gated behind a reached customer: the outcome picker only
  // unlocks once a "reached" attempt has actually been LOGGED (Log Attempt
  // clicked), a reached attempt is already on the record (contacted_at stamped),
  // or the case already holds an outcome status. No reach → nothing to record.
  const showOutcomePicker =
    reachedLogged ||
    event.last_attempt_result === "reached" ||
    !!event.contacted_at ||
    // Keep an already-resolved renewal viewable/editable even if contacted_at
    // was never stamped (e.g. confirmed directly off a reached call).
    ["review_requested","shopping","at_risk","escalated","confirmed","lost"].includes(event.status);

  // Scopes the tactic chips — renewals never see the cancel-only tactics.
  const caseContext = "renewal";
  const tacticFilter = undefined; // no extra stage rules on renewals
  // The renewal-paid premium feeds the lift/velocity math, so it's required to
  // confirm a renewal — block Save until it's entered.
  const premiumMissing = form.status === "confirmed" && String(savedPremium).trim() === "";
  // Button reflects what the selected outcome does: a terminal outcome closes
  // (leaves the queue); anything still-open just saves progress.
  const resolveLabel = ["confirmed","lost"].includes(form.status) ? "Close Case" : "Save Progress";
  // Single source of truth: the save tactics already tagged on the reached-call
  // attempts. The close screen reads these — it never re-asks.
  const onRecordTactics = onRecordSaveTactics(attempts);
  const tacticLabel = (c) => itypes.find((t) => t.code === c)?.display_name || c;
  // Headline save_method: the closer when 2+ tactics (priority over all if the
  // rep skipped), the lone tactic when one, else the fallback capture.
  const closerCodes =
    onRecordTactics.length >= 2 ? (closer ? [closer] : onRecordTactics)
    : onRecordTactics.length === 1 ? onRecordTactics
    : (saveIntervention.interventions || []);
  const derivedSaveMethod = saveMethodFromCodes(closerCodes) || event.save_method || null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--qs-card)",
        border: "1px solid var(--qs-border)",
        borderRadius: 14,
        width: "100%",
        maxWidth: 1080,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--qs-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--qs-bright)", marginBottom: 4 }}>
              {maskCustomerName(event.customer_name) || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 13, color: "var(--qs-subtle)" }}>
              Policy {event.policy_no} · {productLabel(event.product)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--qs-elevated)",
              border: "1px solid var(--qs-border)",
              color: "var(--qs-dim)",
              borderRadius: 8,
              width: 32, height: 32,
              cursor: "pointer",
              fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto" }}>

          <OtherCasesWarning cases={otherCases} />

          {/* Resolved-state banner — for a closed case, say plainly HOW it
              resolved and (for auto_resolved) WHO: a rep-confirmed renewal vs a
              system-inferred one. Reading the status alone, "Auto-Resolved" hides
              that distinction. */}
          {(() => {
            const banner = renewalResolutionBanner(event.status, event.outcome_source);
            if (!banner) return null;
            return (
              <div style={{
                display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
                background: banner.bg, border: `1px solid ${banner.color}33`,
                color: banner.color, borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                fontSize: 13, fontWeight: 700,
              }}>
                <span>{banner.label}</span>
                {banner.sub && (
                  <span style={{ fontWeight: 400, color: "var(--qs-subtle)" }}>· {banner.sub}</span>
                )}
              </div>
            );
          })()}

          {/* ── KPI strip ───────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
            marginBottom: 16,
          }}>
            {[
              { label: "Policy No",     value: event.policy_no },
              // Normalized product first ("AUTO"), raw Allstate text only as a
              // fallback — product_raw is the unreadable "Auto - Private
              // Passenger Voluntary" form.
              { label: "Product",       value: productLabel(event.product) || event.product_raw },
              { label: "Renewal Date",  value: event.renewal_date, color: renewalUrgencyColor(days) },
              { label: "Days Until",    value: days <= 0 ? "PAST DUE" : `${days} days`, color: renewalUrgencyColor(days) },
              { label: "Premium",       value: event.premium ? fmtFull$(event.premium) : "\u2014" },
              { label: "Prior Premium", value: event.premium_old ? fmtFull$(event.premium_old) : "\u2014" },
              { label: "Premium \u0394",     value: event.premium_change != null
                  ? `${event.premium_change > 0 ? "+" : ""}${fmtFull$(event.premium_change)}`
                  : "\u2014",
                color: event.premium_change == null ? "var(--qs-dim)"
                  : event.premium_change > 0 ? "#EF4444" : "#10B981" },
              { label: "Easy Pay",      value: event.easy_pay === true ? "Yes ✓" : event.easy_pay === false ? "No" : "—" },
              { label: "Multiline",
                value: event.multi_line === 'Yes' ? 'Bundled'
                     : event.multi_line === 'No'  ? 'Monoline'
                     : '—',
                color: event.multi_line === 'Yes' ? '#10B981'
                     : event.multi_line === 'No'  ? '#60A5FA'
                     : 'var(--qs-subtle)' },
              { label: "Tenure",        value: event.original_year
                  ? `${CURRENT_YEAR - event.original_year} yrs (${event.original_year})`
                  : "\u2014" },
              { label: "Priority",      value: String(event._priority ?? calcRenewalPriority(event, { churnModel })) },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "var(--qs-elevated)",
                border: "1px solid var(--qs-border)",
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--qs-subtle)",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: color || "var(--qs-text)",
                  fontFamily: "'DM Mono', monospace", lineHeight: 1.15, whiteSpace: "nowrap",
                }}>
                  {value || "\u2014"}
                </div>
              </div>
            ))}
          </div>

          {/* ── Active cancel warning — customer has an active pending cancel ── */}
          {event.has_active_cancel && event.active_cancel_id && (
            <div style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#EF4444',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
              }}>
                ⚠ This customer has an active pending cancel
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                Their <strong>{productLabel(event.active_cancel?.product) || 'other'}</strong> policy
                {' '}is in pending cancel. Address that first — do not lead with the renewal
                or a cross-sell pitch until the cancel issue is resolved.
              </div>
            </div>
          )}

          {/* ── Cross-sell prompt — only when no active cancel ── */}
          {event.cross_sell_opportunity && event.cross_sell_product && !event.has_active_cancel && (
            <div style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#10B981',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
              }}>
                💡 Cross-sell opportunity
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                Allstate flagged this customer for{' '}
                <strong style={{ color: '#10B981' }}>
                  {productLabel(event.cross_sell_product)}
                </strong>.
                {' '}After confirming the renewal, ask:
                <em style={{ color: 'var(--qs-dim)', display: 'block', marginTop: 4 }}>
                  "While I have you — I noticed you only have {productLabel(event.product)} with
                  us. I'd love to get you a quick quote on {productLabel(event.cross_sell_product)}
                  {' '}to see if we can save you some money by bundling."
                </em>
              </div>
            </div>
          )}

          {/* ── Contact info ────────────────────────────────── */}
          <div style={{
            background: "var(--qs-elevated)",
            border: "1px solid var(--qs-border)",
            borderRadius: 10, padding: "14px 16px", marginBottom: 20,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
            }}>
              Contact
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 14, color: "var(--qs-text)", fontFamily: "'DM Mono', monospace" }}>
                  {event.phone || "\u2014"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 14, color: "var(--qs-dim)" }}>
                  {event.email || "\u2014"}
                </div>
              </div>
            </div>
            {event.phone && (
              <a href={`tel:${event.phone}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  marginTop: 12, width: "100%", boxSizing: "border-box",
                  padding: "11px 16px", borderRadius: 8, background: "#10B981", color: "#fff",
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                }}>
                {"\ud83d\udcde"} Call {event.phone}
              </a>
            )}
            <div style={{ marginTop: 12 }}>
              <CallScriptBox label="Call script">
                {renewalCallScript({
                  firstName, agentName, product: event.product, renewalDate: event.renewal_date,
                  rateShock, changePct: scriptChangePct,
                })}
              </CallScriptBox>
              <VoicemailScriptBox firstName={firstName} agentName={agentName} product={event.product} />
            </div>
          </div>

          {/* ── Schedule a callback ──────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <label className="dark-label">Schedule a callback</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="datetime-local" className="dark-input" value={cbTime}
                onChange={e => setCbTime(e.target.value)} style={{ maxWidth: 230 }} />
              <input className="dark-input" placeholder="Note (optional)" value={cbNote}
                onChange={e => setCbNote(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <button onClick={scheduleCallback} disabled={!cbTime || cbSaving}
                style={{
                  fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "#3B82F6", color: "#fff", fontWeight: 700,
                  cursor: (!cbTime || cbSaving) ? "not-allowed" : "pointer",
                  opacity: (!cbTime || cbSaving) ? 0.5 : 1, fontFamily: "inherit",
                }}>
                {cbSaving ? "Scheduling…" : "📅 Schedule"}
              </button>
            </div>
            {event.callback_at && (
              <div style={{ fontSize: 12, color: "#60A5FA", marginTop: 6 }}>
                Current: {new Date(event.callback_at).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </div>
            )}
          </div>

          {/* ── Section: Attempt Log ─────────────────────────── */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 12,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>Attempt Log</span>
            <span style={{
              background: "var(--qs-elevated)",
              border: "1px solid var(--qs-border)",
              borderRadius: 20, padding: "1px 8px",
              fontSize: 11, color: "var(--qs-dim)",
              fontWeight: 600,
            }}>
              {attempts.length}
            </span>
          </div>

          {/* Log attempt form */}
          <div style={{
            background: "var(--qs-elevated)",
            border: "1px solid var(--qs-border)",
            borderRadius: 10, padding: "14px 16px",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[{ v: "outbound", label: "📞 We called" }, { v: "inbound", label: "📲 They called (inbound)" }].map(opt => {
                const on = attemptForm.direction === opt.v;
                return (
                  <button key={opt.v} type="button"
                    onClick={() => setAttemptForm(p => ({ ...p, direction: opt.v }))}
                    style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 8px", borderRadius: 7,
                      cursor: "pointer", border: "1px solid",
                      borderColor: on ? "#3B82F6" : "var(--qs-border)",
                      background: on ? "rgba(59,130,246,0.14)" : "var(--qs-elevated)",
                      color: on ? "#60A5FA" : "var(--qs-dim)", fontFamily: "inherit" }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label className="dark-label">Method</label>
                <select
                  className="dark-select"
                  value={attemptForm.method}
                  onChange={e => setAttemptForm(p => ({ ...p, method: e.target.value }))}
                >
                  <option value="phone">Phone</option>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="dark-label">Result</label>
                <select
                  className="dark-select"
                  value={attemptForm.result}
                  onChange={e => { setAttemptForm(p => ({ ...p, result: e.target.value })); setAttemptError(null); }}
                >
                  <option value="no_answer">No Answer</option>
                  <option value="left_voicemail">Left Voicemail</option>
                  <option value="reached">Reached Customer</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="busy">Busy</option>
                  <option value="disconnected">Disconnected</option>
                </select>
              </div>
            </div>

            <input
              className="dark-input"
              type="text"
              placeholder="Quick note (optional)"
              value={attemptForm.note}
              onChange={e => setAttemptForm(p => ({ ...p, note: e.target.value }))}
              style={{ marginBottom: 10 }}
            />

            {/* Reached the customer \u2192 capture the save tactic right here, in the
                flow. Required: this is the moat field, and the only moment it's
                knowable. */}
            {attemptForm.result === "reached" && (
              <InterventionPicker
                context={caseContext}
                filter={tacticFilter}
                required
                includeLoss
                value={attemptForm.intervention}
                onChange={(iv) => { setAttemptForm(p => ({ ...p, intervention: iv })); if (iv?.interventions?.length) setAttemptError(null); }}
              />
            )}

            {attemptError && (
              <div style={{
                fontSize: 12, fontWeight: 600, color: "var(--qs-warn, #F59E0B)",
                marginBottom: 10,
              }}>
                {attemptError}
              </div>
            )}

            <button
              onClick={logAttempt}
              disabled={loggingAttempt || !currentEmployeeId}
              title={!currentEmployeeId ? 'Employee record not loaded' : undefined}
              style={{
                width: "100%", padding: "10px",
                borderRadius: 8, border: "none",
                background: (loggingAttempt || !currentEmployeeId) ? "var(--qs-elevated)" : "#3B82F6",
                color: (loggingAttempt || !currentEmployeeId) ? "var(--qs-muted)" : "#fff",
                fontSize: 14, fontWeight: 600,
                cursor: (loggingAttempt || !currentEmployeeId) ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loggingAttempt ? "Logging\u2026" : "+ Log Call"}
            </button>
          </div>

          {/* Past attempts */}
          {attempts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {attempts.map(a => {
                const empName = a.employees
                  ? `${a.employees.first_name || ""} ${a.employees.last_name || ""}`.trim()
                  : "Unknown";
                const resultLabel = ATTEMPT_RESULT_LABELS[a.result] || a.result;
                const resultColor = a.result === "reached" ? "#10B981"
                  : a.result === "left_voicemail" ? "#F59E0B"
                  : "var(--qs-dim)";
                return (
                  <div key={a.id} style={{
                    background: "var(--qs-elevated)",
                    border: "1px solid var(--qs-border)",
                    borderRadius: 8, padding: "10px 14px",
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: resultColor }}>
                        {resultLabel}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--qs-subtle)", marginLeft: 8 }}>
                        via {a.method}
                      </span>
                      {a.direction === "inbound" && (
                        <span title="Customer called the agency — not an outbound dial" style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, marginLeft: 8,
                          background: "rgba(96,165,250,0.14)", border: "1px solid rgba(96,165,250,0.45)", color: "#60A5FA",
                        }}>↙ CALLED IN</span>
                      )}
                      {(a.interventions || []).length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {a.interventions.map(code => (
                            <span key={code} style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4,
                              background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)", color: "#A78BFA",
                            }}>🏷 {String(code).replace(/_/g, " ")}</span>
                          ))}
                        </div>
                      )}
                      {a.note && (
                        <div style={{ fontSize: 12, color: "var(--qs-dim)", marginTop: 3 }}>
                          {a.note}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--qs-subtle)", textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 500 }}>{empName}</div>
                      <div>{new Date(a.attempted_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--qs-border)", margin: "4px 0 20px" }} />

          {/* ── Section: Case Management ─────────────────────── */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--qs-subtle)",
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
          }}>
            Case Management
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Outcome — visible but locked (greyed, not editable) until a
                reached attempt is logged. */}
            <div style={{ opacity: showOutcomePicker ? 1 : 0.45 }}
              title={showOutcomePicker ? undefined : "Log a reached attempt to record an outcome"}>
              <label className="dark-label">Outcome (customer reached)</label>
              <select
                className="dark-select"
                value={form.status}
                disabled={!showOutcomePicker}
                onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}
                style={{ cursor: showOutcomePicker ? undefined : "not-allowed" }}
              >
                {/* When the case hasn't been resolved to one of the outcomes
                    below, form.status (e.g. "pending"/"attempting") matches no
                    option — a native select would then silently DISPLAY the
                    first option. Render a matching placeholder so it reads
                    "Select an outcome" and stays in sync with state. */}
                {!["confirmed","review_requested","shopping","at_risk","lost"].includes(form.status) && (
                  <option value={form.status}>— Select an outcome —</option>
                )}
                <option value="confirmed">Confirmed Renewal ✓</option>
                <option value="review_requested">Wants Policy Review</option>
                <option value="shopping">Shopping Competitors</option>
                <option value="at_risk">At Risk (payment/unhappy)</option>
                <option value="lost">Lost — Won't Renew</option>
              </select>
            </div>

            {/* No-contact escape hatch: customer already paid the renewal before
                we reached them. Only meaningful while the case is still open. */}
            {!["confirmed","lost","auto_resolved","unreachable"].includes(event.status) && (
              <AlreadyPaidAction onConfirm={markAlreadyPaid} busy={saving} />
            )}

            {/* Renewal offer (read-only, from report) + premium paid (rep enters) */}
            {form.status === "confirmed" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="dark-label">Renewal offer <span style={{ fontWeight: 400, color: "var(--qs-muted)" }}>(from report)</span></label>
                    <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--qs-elevated)",
                      border: "1px solid var(--qs-border)", fontSize: 13, color: "var(--qs-dim)" }}>
                      {event.premium != null ? fmtFull$(event.premium) : "—"}
                    </div>
                  </div>
                  <div>
                    <label className="dark-label">Renewal paid <span style={{ fontWeight: 400, color: "var(--qs-muted)" }}>({premiumTermLabel(event.product)})</span><span style={{ color: "#F87171", marginLeft: 2 }}>*</span></label>
                    <input
                      className="dark-input"
                      inputMode="decimal"
                      placeholder="Premium paid (as billed)"
                      value={savedPremium}
                      onChange={ev => setSavedPremium(ev.target.value)}
                    />
                  </div>
                </div>
                {savedPremium !== "" && event.premium != null && (() => {
                  const paid = parseFloat(String(savedPremium).replace(/[$,]/g, ""));
                  if (Number.isNaN(paid)) return null;
                  const diff = paid - event.premium; // + paid above offer, − below
                  const pct = event.premium > 0 ? (Math.abs(diff) / event.premium) * 100 : 0;
                  return (
                    <div style={{ fontSize: 12, marginTop: 6, color: "var(--qs-muted)" }}>
                      Premium difference:{" "}
                      <strong style={{ color: diff < 0 ? "#34D399" : diff > 0 ? "#FBBF24" : "var(--qs-dim)" }}>
                        {diff > 0 ? "+" : diff < 0 ? "−" : ""}{fmtFull$(Math.abs(diff))}
                        {pct ? ` (${pct.toFixed(0)}%)` : ""}
                      </strong>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* What saved them — read from the tactics already tagged on the
                reached calls (single source of truth). Re-asked only if none was
                captured; the closer is asked only when 2+ tactics were used. */}
            {form.status === "confirmed" && (
              <div>
                <label className="dark-label">What saved them?</label>
                {onRecordTactics.length === 0 ? (
                  <InterventionPicker
                    context={caseContext}
                    filter={tacticFilter}
                    required
                    value={saveIntervention}
                    onChange={setSaveIntervention}
                  />
                ) : onRecordTactics.length === 1 ? (
                  <div style={{ fontSize: 12, color: "var(--qs-dim)" }}>
                    Tactic on record:{" "}
                    <strong style={{ color: "var(--qs-text)" }}>{tacticLabel(onRecordTactics[0])}</strong>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "var(--qs-muted)", marginBottom: 8 }}>
                      Tactics on record: {onRecordTactics.map(tacticLabel).join(" · ")}
                    </div>
                    <CloserPicker
                      codes={onRecordTactics}
                      value={closer}
                      onChange={setCloser}
                      label="Which one sealed it?"
                    />
                  </>
                )}
              </div>
            )}

            {/* Shopping reason — only when shopping */}
            {form.status === "shopping" && (
              <div>
                <label className="dark-label">Shopping Reason</label>
                <select
                  className="dark-select"
                  value={form.shopping_reason}
                  onChange={ev => setForm(p => ({ ...p, shopping_reason: ev.target.value }))}
                >
                  <option value="">— Select —</option>
                  <option value="price">Price too high</option>
                  <option value="coverage">Coverage concerns</option>
                  <option value="service">Service experience</option>
                  <option value="life_event">Life event (moving, etc.)</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}

            {/* Assigned To — reps can't reassign their own work; managers can. */}
            <div>
              <label className="dark-label">Assigned To</label>
              {canReassign ? (
                <select
                  className="dark-select"
                  value={form.assigned_to_id}
                  onChange={ev => setForm(p => ({ ...p, assigned_to_id: ev.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--qs-elevated)",
                  border: "1px solid var(--qs-border)", fontSize: 13, color: "var(--qs-text)" }}>
                  {(() => {
                    const a = producers.find(p => p.id === form.assigned_to_id);
                    return a ? (a.preferred_name || `${a.first_name || ""} ${a.last_name || ""}`.trim()) : "Unassigned";
                  })()}
                </div>
              )}
            </div>

            <CaseNotesFeed caseType="renewal" caseId={event.id} agencyId={agencyId}
              policyNo={event.policy_no} customerName={event.customer_name} />

            <LinkedServiceTasks caseType="renewal" caseId={event.id} />

            <LogServiceTaskButton agencyId={agencyId} policyNo={event.policy_no}
              customerName={event.customer_name} customerPhone={event.phone}
              sourceCaseType="renewal" sourceCaseId={event.id} source="renewal_call" />

            <ReferToSalesBox agencyId={agencyId} caseType="renewal" caseId={event.id}
              customerName={event.customer_name} policyNo={event.policy_no}
              currentProduct={event.product} />

            <EscalateCaseBox caseType="renewal" caseId={event.id} onEscalated={onClose} />

            <div>
              <button
                onClick={save}
                disabled={saving || premiumMissing}
                title={premiumMissing ? "Enter the premium before closing this case" : undefined}
                style={{
                  width: "100%", padding: "12px",
                  borderRadius: 10, border: "none",
                  background: (saving || premiumMissing) ? "var(--qs-elevated)" : "#10B981",
                  color: (saving || premiumMissing) ? "var(--qs-muted)" : "#fff",
                  fontSize: 15, fontWeight: 700,
                  cursor: (saving || premiumMissing) ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  marginTop: 4,
                }}
              >
                {saving ? "Saving\u2026" : resolveLabel}
              </button>
              {premiumMissing && (
                <div style={{ fontSize: 12, color: "#F87171", marginTop: 8, textAlign: "center" }}>
                  Enter the premium amount above to close this case.
                </div>
              )}
              {saveError && (
                <div style={{ fontSize: 12, color: "#F87171", marginTop: 8, textAlign: "center",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "8px 10px" }}>
                  {saveError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unified Detail Modal ───────────────────────────────────────────────────

function UnifiedDetailModal({ row, onClose, agencyId, producers = [], onReassign }) {
  const [saving, setSaving] = useState(false);
  const [localRow, setLocalRow] = useState(row);
  const { config: productConfig } = useAgencyProductConfig(agencyId);

  // Use localRow for display so reassignment reflects immediately without closing modal
  const r = localRow;

  async function reassign(side, employeeId) {
    // side: 'cancel' | 'renewal'
    setSaving(true);
    try {
      if (side === 'cancel' && r.cancel_event_id) {
        // Sync both assigned_to_id (FK) and assigned_to (legacy text) for display
        const rep = producers.find(p => p.id === employeeId);
        const displayName = rep
          ? (rep.preferred_name || `${rep.first_name || ''} ${rep.last_name || ''}`.trim())
          : null;
        const { error } = await supabase
          .from('pending_cases')
          .update({ assigned_to_id: employeeId || null, assigned_to: displayName })
          .eq('id', r.cancel_event_id);
        if (error) throw error;
        setLocalRow(prev => ({ ...prev, cancel_assigned_to_id: employeeId || null }));
      }
      if (side === 'renewal' && r.renewal_event_id) {
        const { error } = await supabase
          .from('renewal_cases')
          .update({ assigned_to_id: employeeId || null })
          .eq('id', r.renewal_event_id);
        if (error) throw error;
        // House rule: a household's active renewals are never split across
        // reps — move the customer's other open renewal cases along with it.
        await reassignRenewalHousehold(supabase, agencyId, {
          caseId: r.renewal_event_id,
          customerName: r.customer_name,
          phone: r.phone,
          employeeId: employeeId || null,
        });
        setLocalRow(prev => ({ ...prev, renewal_assigned_to_id: employeeId || null }));
      }
      if (onReassign) onReassign(localRow);
    } catch (err) {
      console.error('[reassign error]', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--qs-card)', borderRadius: 14, maxWidth: '98vw', width: '100%', maxHeight: '96vh', overflow: 'auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>
            {maskCustomerName(r.customer_name)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2 }}>
            Policy {r.policy_no} · {productLabel(r.product)}
            {r.risk_type === 'dual_risk' && (
              <span style={{ marginLeft: 8, color: 'var(--qs-danger)', fontWeight: 700 }}>⚡ DUAL RISK</span>
            )}
          </div>
        </div>

        {/* Contact info */}
        {(r.phone || r.email) && (
          <div style={{ background: 'var(--qs-elevated)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, border: '1px solid var(--qs-border)' }}>
            <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {r.phone && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)' }}>Phone</div>
                  <div style={{ fontSize: 13, color: 'var(--qs-text)', fontFamily: "'DM Mono', monospace" }}>{r.phone}</div>
                </div>
              )}
              {r.email && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)' }}>Email</div>
                  <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>{r.email}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending cancel section */}
        {r.cancel_event_id && (
          <div style={{ background: 'var(--qs-elevated)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: '1px solid var(--qs-warning-border)' }}>
            <div style={{ fontSize: 11, color: 'var(--qs-warning)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
              ⚠ Pending Cancellation
            </div>

            {/* Detail grid — color values used as inline style props */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Cancel Date', value: r.cancel_effective_date,
                  color: urgencyColor(daysUntilCancel(r.cancel_effective_date)) },
                { label: 'Days Left',
                  value: (() => { const d = daysUntilCancel(r.cancel_effective_date); return d <= 0 ? 'PAST DUE' : `${d} days`; })(),
                  color: urgencyColor(daysUntilCancel(r.cancel_effective_date)) },
                { label: 'Status',
                  value: STATUS_CONFIG[r.cancel_status]?.label || r.cancel_status || '—' },
                { label: 'Pay Promise Date', value: r.promise_date || '—',
                  color: (() => {
                    if (!r.promise_date) return 'var(--qs-subtle)';
                    const d = Math.ceil((new Date(r.promise_date) - new Date()) / 86400000);
                    return d <= 1 ? '#EF4444' : d <= 3 ? '#F59E0B' : 'var(--qs-dim)';
                  })() },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--qs-text)', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Detail grid — color values used as inline style props */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Premium at Risk', value: r.premium_at_risk ? fmtFull$(r.premium_at_risk) : '—' },
                { label: 'Cycle', value: `#${r.cycle || 1}`,
                  color: (r.cycle || 1) >= 3 ? '#EF4444' : (r.cycle || 1) === 2 ? '#F59E0B' : 'var(--qs-dim)' },
                { label: 'Attempts', value: r.cancel_attempts || 0,
                  color: (r.cancel_attempts || 0) >= 3 ? '#EF4444' : 'var(--qs-dim)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--qs-text)', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}

              {/* Assigned — inline dropdown */}
              <div style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>Assigned To</div>
                <select
                  value={r.cancel_assigned_to_id || ''}
                  onChange={e => reassign('cancel', e.target.value || null)}
                  disabled={saving}
                  style={{
                    background: 'transparent', color: 'var(--qs-text)', border: 'none',
                    fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer', width: '100%', padding: 0, outline: 'none',
                  }}
                >
                  <option value="">— Unassigned</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        )}

        {/* Renewal section */}
        {r.renewal_event_id && (
          <div style={{ background: 'var(--qs-elevated)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: '1px solid var(--qs-info-border)' }}>
            <div style={{ fontSize: 11, color: 'var(--qs-info)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
              🔄 Renewal
            </div>

            {/* Detail grid — color values used as inline style props */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Renewal Date', value: r.renewal_date,
                  color: renewalUrgencyColor(daysUntilRenewal(r.renewal_date)) },
                { label: 'Days Until',
                  value: (() => { const d = daysUntilRenewal(r.renewal_date); return d <= 0 ? 'PAST DUE' : `${d} days`; })(),
                  color: renewalUrgencyColor(daysUntilRenewal(r.renewal_date)) },
                { label: 'Status',
                  value: RENEWAL_STATUS_CONFIG[r.status]?.label || r.status || '—' },
                { label: 'Attempts', value: r.renewal_attempts || 0 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--qs-text)', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Detail grid — color values used as inline style props */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Premium',
                  value: r.renewal_premium ? fmtFull$(r.renewal_premium) : '—' },
                { label: 'Premium Δ',
                  value: r.premium_change != null
                    ? `${r.premium_change > 0 ? '+' : ''}${fmtFull$(r.premium_change)}`
                    : '—',
                  color: r.premium_change == null ? 'var(--qs-dim)'
                       : r.premium_change > 0 ? '#EF4444' : '#10B981' },
                { label: 'Δ%',
                  value: r.premium_change_pct != null
                    ? `${r.premium_change_pct > 0 ? '+' : ''}${r.premium_change_pct.toFixed(1)}%`
                    : '—',
                  color: r.premium_change_pct == null ? 'var(--qs-dim)'
                       : r.premium_change_pct > 0 ? '#EF4444' : '#10B981' },
                { label: 'Tenure',
                  value: r.original_year
                    ? `${new Date().getFullYear() - r.original_year} yrs (${r.original_year})`
                    : '—' },
                { label: 'Easy Pay',
                  value: r.easy_pay === true ? 'Yes ✓' : r.easy_pay === false ? 'No' : '—' },
                { label: 'Multiline',
                  value: r.multi_line === 'Yes' ? 'Bundled'
                       : r.multi_line === 'No'  ? 'Monoline'
                       : '—',
                  color: r.multi_line === 'Yes' ? '#10B981'
                       : r.multi_line === 'No'  ? '#60A5FA'
                       : 'var(--qs-subtle)' },
                { label: 'Items',
                  value: r.renewal_item_count || 1 },
                { label: 'Points',
                  value: `${((productConfig.portfolioPoints[r.product] ?? 0) * (r.renewal_item_count || 1)).toLocaleString()} pts`,
                  color: '#8B5CF6' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--qs-text)', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}

              {/* Assigned — inline dropdown */}
              <div style={{ background: 'var(--qs-card)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 3 }}>Assigned To</div>
                <select
                  value={r.renewal_assigned_to_id || ''}
                  onChange={e => reassign('renewal', e.target.value || null)}
                  disabled={saving}
                  style={{
                    background: 'transparent', color: 'var(--qs-text)', border: 'none',
                    fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer', width: '100%', padding: 0, outline: 'none',
                  }}
                >
                  <option value="">— Unassigned</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        )}

        {/* Service requests — view existing + add (multiple allowed per case) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, marginBottom: 12 }}>
          {r.cancel_event_id && <LinkedServiceTasks caseType="cancel" caseId={r.cancel_event_id} />}
          {r.renewal_event_id && <LinkedServiceTasks caseType="renewal" caseId={r.renewal_event_id} />}
          <LogServiceTaskButton agencyId={agencyId}
            policyNo={r.policy_no} customerName={r.customer_name} customerPhone={r.phone}
            sourceCaseType={r.cancel_event_id ? 'cancel' : 'renewal'}
            sourceCaseId={r.cancel_event_id || r.renewal_event_id}
            source="internal" />
        </div>

        <button className="btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}

// ─── Unified At Risk Tab ────────────────────────────────────────────────────

// Compute portfolio points at risk for a single row in policy_retention_status.
// For dual risk: use renewal_item_count (more accurate — has actual vehicle count).
// For pending cancel only: use cancel_item_count (always 1).
// For renewal only: use renewal_item_count.
function calcRowPoints(row, portfolioPoints) {
  const product = row.product || 'other';
  const pts = portfolioPoints?.[product] ?? 0;
  const items = row.risk_type === 'pending_cancel'
    ? (row.cancel_item_count || 1)
    : (row.renewal_item_count || 1);
  return pts * items;
}

// Field maps from a policy_retention_status row onto the shared scorers. Shared
// by calcUnifiedPriority (table ranking) AND the per-rep queue-position calc
// below, so the two can never drift out of sync.
function renewalScoreInput(row) {
  return {
    renewal_date:       row.renewal_date,
    premium_change_pct: row.premium_change_pct,
    original_year:      row.original_year,
    premium:            row.renewal_premium,
    easy_pay:           row.easy_pay,
    // Multi-vehicle households must outrank single-car renewals — pass the
    // item count + product so the value factor and multi-item boost apply.
    item_count:         row.renewal_item_count,
    product:            row.product,
    multi_line:         row.multi_line,
  };
}
function cancelScoreInput(row) {
  return {
    cancel_effective_date: row.cancel_effective_date,
    premium_at_risk:       row.premium_at_risk,
    attempt_count:         row.cancel_attempts,
    cycle:                 row.cycle,
    status:                row.cancel_status,
    promise_date:          row.promise_date,
  };
}
// Shape a row for compareByTier — the EXACT ordering a rep's cancel queue uses
// (tier → past-due → premium desc → date asc), so a principal-side position
// index matches what the rep actually sees.
function cancelSortInput(row) {
  return {
    priority_tier: computePriorityTier({
      stage:                 row.cancel_stage,
      cancel_effective_date: row.cancel_effective_date,
      premium_at_risk:       row.premium_at_risk,
    }),
    premium_at_risk:       row.premium_at_risk,
    cancel_effective_date: row.cancel_effective_date,
    stage:                 row.cancel_stage,
  };
}

function calcUnifiedPriority(row, churnModel) {
  const cancelScore  = row.cancel_event_id  ? calcCancelPriority(cancelScoreInput(row)) : 0;
  const renewalScore = row.renewal_event_id ? calcRenewalPriority(renewalScoreInput(row), { churnModel }) : 0;
  const base = Math.max(cancelScore, renewalScore);
  // Dual risk adds 15 — one call needs to handle both cancel AND renewal
  return row.risk_type === 'dual_risk' ? Math.min(base + 15, 100) : base;
}

function UnifiedAtRiskTab({ agencyId, currentEmployeeId, urgentFilter = false, onClearUrgentFilter }) {
  const { config: productConfig } = useAgencyProductConfig(agencyId);
  const queryClient = useQueryClient();

  // Observed retention model (product × tenure) so priority reflects the agency's
  // real churn history, not just the static tenure brackets. Falls back to the
  // brackets per-segment when a product/tenure band has no snapshot data.
  const { data: book } = useBookSnapshots(agencyId);
  const churnModel = useMemo(() => buildChurnModel(book?.products || []), [book]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['policy_retention_status', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policy_retention_status')
        .select('*')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: producers = [] } = useQuery({
    queryKey: ['producers', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .overlaps('roles', ['service_inbound', 'service_outbound', 'service'])
        .order('last_name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const employeeMap = useMemo(() => {
    const m = {};
    producers.forEach(p => { m[p.id] = p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(); });
    return m;
  }, [producers]);

  const [riskFilter, setRiskFilter] = useState('all');
  const [kpiFilter, setKpiFilter] = useState(null);
  // Assigned-rep filter, driven by a popover on the "Assigned" column header.
  // 'all' | 'me' | 'unassigned' | employeeId
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [assignMenuPos, setAssignMenuPos] = useState(null);
  const assignBtnRef = useRef(null);

  // Assignees that actually have cases in the list — drives the "Assigned"
  // filter dropdown. Built from the rows (not just the service-role producer
  // list) so anyone with a case assigned can be filtered on.
  const assigneeOptions = useMemo(() => {
    const ids = new Set();
    for (const r of rows) {
      if (r.cancel_assigned_to_id) ids.add(r.cancel_assigned_to_id);
      if (r.renewal_assigned_to_id) ids.add(r.renewal_assigned_to_id);
    }
    return [...ids]
      .map(id => ({ id, name: employeeMap[id] || 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, employeeMap]);

  // Short label for the active assigned-rep filter, shown on the column header.
  const activeAssignLabel =
    assignedFilter === 'all'        ? null :
    assignedFilter === 'me'         ? 'Me' :
    assignedFilter === 'unassigned' ? 'Unassigned' :
    (employeeMap[assignedFilter] || 'Unknown');

  // Open the header filter popover anchored under the caret (portal-rendered so
  // it isn't clipped by the table's horizontal scroll container).
  function toggleAssignMenu() {
    if (assignMenuOpen) { setAssignMenuOpen(false); return; }
    const r = assignBtnRef.current?.getBoundingClientRect();
    if (r) setAssignMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 210) });
    setAssignMenuOpen(true);
  }
  function pickAssign(value) {
    setAssignedFilter(value);
    setAssignMenuOpen(false);
  }
  const [sortCol, setSortCol] = useState('priority');
  const [sortDir, setSortDir] = useState('desc');
  // Drilldown: { event, side: 'cancel'|'renewal' } — opens the full detail modal with logging
  const [drilldown, setDrilldown] = useState(null);

  async function openDrilldown(row, side) {
    // For single-risk rows, auto-pick the side
    if (!side) {
      if (row.risk_type === 'pending_cancel') side = 'cancel';
      else if (row.risk_type === 'renewal') side = 'renewal';
      else {
        // dual_risk — pick the more urgent side
        const cd = row.cancel_effective_date ? daysUntilCancel(row.cancel_effective_date) : 999;
        const rd = row.renewal_date ? daysUntilRenewal(row.renewal_date) : 999;
        side = cd <= rd ? 'cancel' : 'renewal';
      }
    }
    // Fetch full event record so the detail modal has all fields
    let eventId = side === 'cancel' ? row.cancel_event_id : row.renewal_event_id;

    // Fallback: if this side has no event ID, try the other side
    if (!eventId) {
      const otherSide = side === 'cancel' ? 'renewal' : 'cancel';
      const otherId   = side === 'cancel' ? row.renewal_event_id : row.cancel_event_id;
      if (!otherId) return; // genuinely no event on either side
      side    = otherSide;
      eventId = otherId;
    }

    const table = side === 'cancel' ? 'pending_cases' : 'renewal_cases';
    const { data } = await supabase.from(table).select('*').eq('id', eventId).single();
    if (data) {
      // Carry over computed priority from unified row
      data._priority = row._priority;
      setDrilldown({ event: data, side, unifiedRow: row });
    }
  }

  async function updateCancelEvent(id, updates) {
    const { error } = await supabase
      .from('pending_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      // When a cancel resolves to a terminal state, clear the active-cancel
      // cross-reference on any renewal case for the same customer so the
      // renewal modal/card stops showing the warning.
      if (updates?.status &&
          ['saved', 'lost', 'rewritten', 'requested_cancellation'].includes(updates.status)) {
        const { data: pc } = await supabase
          .from('pending_cases')
          .select('customer_name')
          .eq('id', id)
          .single();
        if (pc?.customer_name) {
          await supabase
            .from('renewal_cases')
            .update({ has_active_cancel: false, active_cancel_id: null })
            .eq('agency_id', agencyId)
            .ilike('customer_name', pc.customer_name);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    }
    return error;
  }

  async function updateRenewalEvent(id, updates) {
    const { error } = await supabase
      .from('renewal_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      // When a renewal is confirmed, clear the active-renewal cross-reference
      // on any pending cancel for the same customer.
      if (updates?.status === 'confirmed') {
        const { data: rc } = await supabase
          .from('renewal_cases')
          .select('customer_name')
          .eq('id', id)
          .single();
        if (rc?.customer_name) {
          await supabase
            .from('pending_cases')
            .update({ has_active_renewal: false, active_renewal_id: null })
            .eq('agency_id', agencyId)
            .ilike('customer_name', rc.customer_name);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    }
    return error;
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      // Dollar / urgency columns read best biggest-first; text and dates start
      // ascending. (So clicking "Premium" surfaces the largest exposures, not
      // the smallest.)
      setSortDir(col === 'priority' || col === 'premium' || col === 'premium_change_pct' ? 'desc' : 'asc');
    }
  }

  // Faithful per-rep queue positions — where each case sits in the ASSIGNED
  // rep's call order, computed the same way each rep's own queue orders its
  // work: renewals by calcRenewalPriority (desc), cancels by compareByTier
  // (tier → past-due → premium desc → date asc). Because /my/queue now ranks
  // renewals by calcRenewalPriority too, these indices match what the rep sees.
  // Keyed by event id → { n, total }. Built from the full agency row set (each
  // rep's whole queue), so it reflects priority order — not a rep's session-
  // local focus/daily-cap view, which can't be reproduced here.
  const renewalQueuePos = useMemo(() => {
    const byRep = {};
    for (const r of rows) {
      if (!r.renewal_event_id || !r.renewal_assigned_to_id) continue;
      (byRep[r.renewal_assigned_to_id] ||= []).push(r);
    }
    const pos = {};
    for (const repId in byRep) {
      const sorted = byRep[repId].slice().sort((a, b) =>
        calcRenewalPriority(renewalScoreInput(b), { churnModel }) -
        calcRenewalPriority(renewalScoreInput(a), { churnModel }));
      sorted.forEach((r, i) => { pos[r.renewal_event_id] = { n: i + 1, total: sorted.length }; });
    }
    return pos;
  }, [rows, churnModel]);

  const cancelQueuePos = useMemo(() => {
    const byRep = {};
    for (const r of rows) {
      if (!r.cancel_event_id || !r.cancel_assigned_to_id) continue;
      (byRep[r.cancel_assigned_to_id] ||= []).push(r);
    }
    const pos = {};
    for (const repId in byRep) {
      const sorted = byRep[repId].slice().sort((a, b) => compareByTier(cancelSortInput(a), cancelSortInput(b)));
      sorted.forEach((r, i) => { pos[r.cancel_event_id] = { n: i + 1, total: sorted.length }; });
    }
    return pos;
  }, [rows]);

  // Per-side assignment lines (rep name + queue position), so the Assigned and
  // Queue columns render the same rows in the same order and stay row-aligned.
  const assignmentLines = (row) => {
    const cId = row.cancel_assigned_to_id;
    const rId = row.renewal_assigned_to_id;
    const lines = [];
    if (cId && row.cancel_event_id)
      lines.push({ key: 'c', name: employeeMap[cId] || '✓', pos: cancelQueuePos[row.cancel_event_id], side: 'cancel' });
    if (rId && row.renewal_event_id)
      lines.push({ key: 'r', name: employeeMap[rId] || '✓', pos: renewalQueuePos[row.renewal_event_id], side: 'renewal' });
    return lines;
  };

  const filteredRows = useMemo(() => {
    let list = rows.map(r => ({
      ...r,
      _priority: calcUnifiedPriority(r, churnModel),
      // policy_retention_status doesn't expose priority_tier, so derive it
      // client-side for cancel-side rows from the same inputs the DB uses.
      _priority_tier: r.cancel_event_id
        ? computePriorityTier({
            stage: r.cancel_stage,
            cancel_effective_date: r.cancel_effective_date,
            premium_at_risk: r.premium_at_risk,
          })
        : null,
    }));

    if (riskFilter !== 'all') {
      list = list.filter(r => r.risk_type === riskFilter);
    }

    if (assignedFilter !== 'all') {
      if (assignedFilter === 'unassigned') {
        list = list.filter(r => !r.cancel_assigned_to_id && !r.renewal_assigned_to_id);
      } else {
        const target = assignedFilter === 'me' ? currentEmployeeId : assignedFilter;
        if (target) {
          list = list.filter(r =>
            r.cancel_assigned_to_id === target ||
            r.renewal_assigned_to_id === target
          );
        }
      }
    }

    // Urgent filter — cases with cancel date ≤ 3 days away or past due
    if (urgentFilter) {
      const today = new Date();
      list = list.filter(r => {
        if (!r.cancel_effective_date) return false;
        const days = (new Date(r.cancel_effective_date) - today) / 86400000;
        return days <= 3;
      });
    }

    // Sort logic — priority sorts by tier (P0→P3), then premium desc, then
    // cancel date asc. Renewal-only rows lack a tier; fall back to numeric
    // priority for those by ranking them after P3.
    if (sortCol === 'priority') {
      const dir = sortDir === 'asc' ? -1 : 1;
      return list.sort((a, b) => {
        const aTier = TIER_ORDER[a._priority_tier] ?? 4;
        const bTier = TIER_ORDER[b._priority_tier] ?? 4;
        if (aTier !== bTier) return (aTier - bTier) * dir;

        // Within a tier, rank by the computed priority score — which now carries
        // the multi-vehicle boost, so multi-car renewals outrank single-car ones
        // (renewal-only rows share tier 4, so this is their primary ordering).
        if (a._priority !== b._priority) return (b._priority - a._priority) * dir;

        const aPrem = parseFloat(a.premium_at_risk) || parseFloat(a.renewal_premium) || 0;
        const bPrem = parseFloat(b.premium_at_risk) || parseFloat(b.renewal_premium) || 0;
        if (aPrem !== bPrem) return (bPrem - aPrem) * dir;

        const aDate = a.cancel_effective_date || a.renewal_date || '9999';
        const bDate = b.cancel_effective_date || b.renewal_date || '9999';
        return aDate.localeCompare(bDate) * dir;
      });
    }

    return list.sort((a, b) => {
      let aVal, bVal;
      switch (sortCol) {
        case 'customer_name':
          aVal = (a.customer_name || '').toLowerCase();
          bVal = (b.customer_name || '').toLowerCase();
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'product':
          aVal = (a.product || '').toLowerCase();
          bVal = (b.product || '').toLowerCase();
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'cancel_date':
          aVal = a.cancel_effective_date || '9999';
          bVal = b.cancel_effective_date || '9999';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'renewal_date_actual':
          aVal = a.renewal_date || '';
          bVal = b.renewal_date || '';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'renewal_date':
          aVal = a.renewal_date || '9999';
          bVal = b.renewal_date || '9999';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'premium':
          // Rank by the larger of the two sides so a dual-risk row sorts by its
          // true dollar exposure, not just whichever field happens to be set.
          aVal = Math.max(parseFloat(a.premium_at_risk) || 0, parseFloat(a.renewal_premium) || 0);
          bVal = Math.max(parseFloat(b.premium_at_risk) || 0, parseFloat(b.renewal_premium) || 0);
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        case 'premium_change_pct':
          aVal = a.premium_change_pct || 0;
          bVal = b.premium_change_pct || 0;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        default:
          return sortDir === 'asc' ? a._priority - b._priority : b._priority - a._priority;
      }
    });
  }, [rows, riskFilter, assignedFilter, currentEmployeeId, sortCol, sortDir, urgentFilter, churnModel]);

  const kpiFilteredRows = useMemo(() => {
    if (kpiFilter === null) return filteredRows;
    if (kpiFilter === 'multi_line') return filteredRows.filter(r => r.multi_line === 'Yes');
    if (kpiFilter === 'uncovered21') {
      // Renewals already inside the 21-day bill window with zero attempts —
      // the coverage-gap list behind the 21-Day Coverage KPI.
      return filteredRows.filter(r =>
        r.renewal_event_id && daysUntilRenewal(r.renewal_date) <= 21 && !r.renewal_attempts);
    }
    return filteredRows.filter(r => r.risk_type === kpiFilter);
  }, [filteredRows, kpiFilter]);

  if (isLoading) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading at-risk policies...</div>;
  }

  return (
    <div>
      {/* KPI strip — sorted by value descending */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {(() => {
          const totalPremium = rows.reduce((s, r) =>
            s + (r.premium_at_risk || 0) + (r.renewal_premium || 0), 0);
          const totalPoints  = rows.reduce((s, r) => s + calcRowPoints(r, productConfig.portfolioPoints), 0);
          const totalItems   = rows.reduce((s, r) => s + (
            r.risk_type === 'pending_cancel'
              ? (r.cancel_item_count || 1)
              : (r.renewal_item_count || 1)
          ), 0);
          const countRenewals      = rows.filter(r => r.risk_type === 'renewal').length;
          const countMultiLine     = rows.filter(r => r.multi_line === 'Yes').length;
          const countPendingCancel = rows.filter(r => r.risk_type === 'pending_cancel').length;
          const countDualRisk      = rows.filter(r => r.risk_type === 'dual_risk').length;

          // 21-day coverage — the agency goal is a first touch on every renewal
          // BEFORE the bill posts at 21 days out. Measured on open renewal-side
          // cases already inside the bill window: what share got at least one
          // attempt. The uncovered count is the actionable number (it drives
          // the click-through filter).
          const inside21 = rows.filter(r =>
            r.renewal_event_id && daysUntilRenewal(r.renewal_date) <= 21);
          const uncovered21 = inside21.filter(r => !r.renewal_attempts).length;
          const coveragePct = inside21.length
            ? Math.round(((inside21.length - uncovered21) / inside21.length) * 100)
            : 100;

          // KpiCard color prop — hex intentionally
          const kpis = [
            {
              key:        'coverage21',
              label:      '21-Day Coverage',
              rawValue:   uncovered21,
              display:    `${coveragePct}%`,
              sub:        uncovered21
                ? `${uncovered21} untouched inside 21d`
                : 'all inside-21d renewals touched',
              color:      uncovered21 ? '#EF4444' : '#10B981',
              filterKey:  uncovered21 ? 'uncovered21' : null,
            },
            {
              key:        'premium',
              label:      'Premium Exposed',
              rawValue:   totalPremium,
              display:    fmt$(totalPremium),
              sub:        'total at risk',
              color:      '#EC4899',
              filterKey:  null,
            },
            {
              key:        'points',
              label:      'Points at Risk',
              rawValue:   totalPoints,
              display:    totalPoints.toLocaleString(),
              sub:        'portfolio impact',
              color:      '#8B5CF6',
              filterKey:  null,
            },
            {
              key:        'items',
              label:      'Items at Risk',
              rawValue:   totalItems,
              display:    totalItems.toLocaleString(),
              sub:        'total policy items',
              color:      '#06B6D4',
              filterKey:  null,
            },
            {
              key:        'renewals',
              label:      'Renewals',
              rawValue:   countRenewals,
              display:    countRenewals,
              sub:        'shopping risk',
              color:      '#3B82F6',
              filterKey:  'renewal',
            },
            {
              key:        'multi_line',
              label:      'Multi-Line at Risk',
              rawValue:   countMultiLine,
              display:    countMultiLine,
              sub:        'bundled customers',
              color:      '#10B981',
              filterKey:  'multi_line',
            },
            {
              key:        'pending_cancel',
              label:      'Pending Cancel',
              rawValue:   countPendingCancel,
              display:    countPendingCancel,
              sub:        'payment risk',
              color:      '#F59E0B',
              filterKey:  'pending_cancel',
            },
            {
              key:        'dual_risk',
              label:      'Dual Risk',
              rawValue:   countDualRisk,
              display:    countDualRisk,
              sub:        'cancel + renewal',
              color:      '#EF4444',
              filterKey:  'dual_risk',
            },
          ];

          const sorted = [...kpis].sort((a, b) => b.rawValue - a.rawValue);

          return sorted.map(kpi => (
            <KpiCard
              key={kpi.key}
              label={kpi.label}
              value={kpi.display}
              sub={kpi.sub}
              color={kpi.color}
              clickable={!!kpi.filterKey}
              onClick={kpi.filterKey ? () => { setKpiFilter(kpi.filterKey); onClearUrgentFilter?.(); } : undefined}
            />
          ));
        })()}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all',            label: `All (${rows.length})` },
          { key: 'dual_risk',      label: `🔴 Dual Risk (${rows.filter(r => r.risk_type === 'dual_risk').length})` },
          { key: 'pending_cancel', label: 'Pending Cancel' },
          { key: 'renewal',        label: 'Renewals' },
        ].map(f => (
          <button key={f.key} className={`btn-ghost ${riskFilter === f.key ? 'active' : ''}`}
            onClick={() => { setRiskFilter(f.key); setKpiFilter(null); onClearUrgentFilter?.(); }}>
            {f.label}
          </button>
        ))}

        {kpiFilter && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--qs-info-subtle)', border: '1px solid var(--qs-info-border)',
            borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--qs-info)',
          }}>
            Filtered: {
              kpiFilter === 'renewal'        ? 'Renewals'        :
              kpiFilter === 'pending_cancel' ? 'Pending Cancel'  :
              kpiFilter === 'dual_risk'      ? 'Dual Risk'       :
              kpiFilter === 'multi_line'     ? 'Multi-Line'      :
              kpiFilter === 'uncovered21'    ? 'Untouched inside 21d' : kpiFilter
            }
            <button
              onClick={() => setKpiFilter(null)}
              style={{ background: 'none', border: 'none', color: 'var(--qs-info)',
                cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          </div>
        )}

      </div>

      {/* Urgent filter banner */}
      {urgentFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#EF444411', border: '1px solid #EF444433',
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444' }}>
            🚨 Showing urgent cases only — cancel date within 3 days
          </span>
          <button
            onClick={() => { onClearUrgentFilter?.(); }}
            style={{
              fontSize: 11, color: 'var(--qs-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Clear filter ✕
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <SortTh col="priority"           label="Priority"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th>Stage</th>
              <SortTh col="customer_name"      label="Customer"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              {/* Cancel column — hide when filtering to renewal-only */}
              {riskFilter !== 'renewal' && (
                <SortTh col="cancel_date" label="Cancel" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}

              {/* Date column — show actual renewal date, only when filtering to renewal */}
              {riskFilter === 'renewal' && (
                <SortTh col="renewal_date_actual" label="Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}

              {/* Renewal days-remaining column — hide when filtering to cancel-only */}
              {riskFilter !== 'pending_cancel' && (
                <SortTh col="renewal_date" label="Renewal" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}
              <SortTh col="premium"             label="Premium"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="premium_change_pct" label="Δ%"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="product"            label="Product"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th>Attempts</th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button
                  ref={assignBtnRef}
                  onClick={toggleAssignMenu}
                  title="Filter by assigned rep"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, font: 'inherit', letterSpacing: 'inherit',
                    textTransform: 'inherit',
                    color: activeAssignLabel ? 'var(--qs-info)' : 'inherit',
                  }}
                >
                  Assigned
                  {activeAssignLabel && (
                    <span style={{ fontWeight: 700, textTransform: 'none' }}>
                      : {activeAssignLabel}
                    </span>
                  )}
                  <span style={{ fontSize: 9, opacity: activeAssignLabel ? 1 : 0.6 }}>
                    {activeAssignLabel ? '⏷' : '▾'}
                  </span>
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }} title="Where each case sits in the assigned rep's call order (priority order)">Queue</th>
            </tr>
          </thead>
          <tbody>
            {kpiFilteredRows.map(row => {
              const cancelDays = row.cancel_effective_date ? daysUntilCancel(row.cancel_effective_date) : null;
              const renewalDays = row.renewal_date ? daysUntilRenewal(row.renewal_date) : null;
              const lines = assignmentLines(row);

              return (
                <tr key={`${row.cancel_event_id || ''}-${row.renewal_event_id || ''}`}
                  className="triage-row"
                  onClick={() => openDrilldown(row)}>

                  {/* Priority */}
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                      fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                      background: row._priority >= 80 ? 'var(--qs-danger-subtle)' : row._priority >= 55 ? 'var(--qs-warning-subtle)' : row._priority >= 30 ? 'var(--qs-info-subtle)' : 'rgb(100 116 139 / 0.13)',
                      color:      row._priority >= 80 ? 'var(--qs-danger)'   : row._priority >= 55 ? 'var(--qs-warning)'   : row._priority >= 30 ? 'var(--qs-info)'   : 'var(--qs-subtle)',
                    }}>{row._priority}</span>
                  </td>

                  {/* Stage */}
                  <td>
                    {row.cancel_stage === 'cancelled' ? (
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 10, fontWeight: 700, background: 'var(--qs-danger-subtle)', color: 'var(--qs-danger)' }}>
                        🚫 Lapsed
                      </span>
                    ) : row.cancel_event_id ? (
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 10, fontWeight: 700, background: 'var(--qs-warning-subtle)', color: 'var(--qs-warning)' }}>
                        ⚠ Pending
                      </span>
                    ) : null}
                  </td>

                  {/* Customer name */}
                  <td style={{ color: 'var(--qs-text)', fontWeight: 600, fontSize: 13 }}>
                    {maskCustomerName(row.customer_name)}
                    {row.risk_type === 'dual_risk' && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--qs-danger)' }}>⚡</span>
                    )}
                    <MultiVehicleBadge count={row.renewal_item_count} product={row.product} style={{ marginLeft: 6 }} />
                  </td>

                  {/* Cancel urgency cell */}
                  {riskFilter !== 'renewal' && (
                    <td>
                      {row.cancel_effective_date ? (
                        <span style={{ color: urgencyColor(cancelDays), fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                          {cancelDays <= 0 ? 'PAST DUE' : `${cancelDays}d`}
                        </span>
                      ) : <span style={{ color: 'var(--qs-muted)' }}>—</span>}
                    </td>
                  )}

                  {/* Renewal actual date cell — only in renewal filter */}
                  {riskFilter === 'renewal' && (
                    <td style={{ color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      {row.renewal_date || '—'}
                    </td>
                  )}

                  {/* Renewal days-remaining cell */}
                  {riskFilter !== 'pending_cancel' && (
                    <td>
                      {row.renewal_date ? (
                        <span style={{ color: renewalUrgencyColor(renewalDays), fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                          {renewalDays <= 0 ? 'PAST' : `${renewalDays}d`}
                        </span>
                      ) : <span style={{ color: 'var(--qs-muted)' }}>—</span>}
                    </td>
                  )}

                  <td style={{ color: 'var(--qs-text)', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                    {row.risk_type === 'renewal'
                      ? (row.renewal_premium ? fmtFull$(row.renewal_premium) : '—')
                      : (row.premium_at_risk ? fmtFull$(row.premium_at_risk) : '—')}
                  </td>

                  <td style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 12,
                    color: row.premium_change_pct == null ? 'var(--qs-subtle)' : row.premium_change_pct > 0 ? 'var(--qs-danger)' : 'var(--qs-success)'
                  }}>
                    {row.premium_change_pct != null ? `${row.premium_change_pct > 0 ? '+' : ''}${row.premium_change_pct.toFixed(1)}%` : '—'}
                  </td>

                  {/* Product */}
                  <td style={{ color: 'var(--qs-dim)', fontSize: 12 }}>
                    {productLabel(row.product) || '—'}
                  </td>

                  <td style={{ color: 'var(--qs-subtle)', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    {((row.cancel_attempts || 0) + (row.renewal_attempts || 0)) || 0}
                  </td>

                  {/* Assigned — rep name(s), one line per side */}
                  <td style={{ color: 'var(--qs-subtle)', fontSize: 12 }}>
                    {(() => {
                      const cId = row.cancel_assigned_to_id;
                      const rId = row.renewal_assigned_to_id;
                      if (!cId && !rId) return '—';
                      if (!lines.length) return employeeMap[cId] || employeeMap[rId] || '✓';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lines.map(l => (
                            <span key={l.key} style={{ display: 'flex', alignItems: 'center', minHeight: 18, whiteSpace: 'nowrap' }}>
                              {l.name}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Queue — where the case sits in each assigned rep's call order
                      (#n/total, top-3 highlighted). Lines align with Assigned. */}
                  <td style={{ fontSize: 12 }}>
                    {lines.length === 0
                      ? <span style={{ color: 'var(--qs-dim)' }}>—</span>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lines.map(l => (
                            <span key={l.key} style={{ display: 'flex', alignItems: 'center', minHeight: 18 }}>
                              {l.pos ? (
                                <span title={`#${l.pos.n} of ${l.pos.total} in ${l.name}'s ${l.side} queue (priority order)`}
                                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700,
                                    color: l.pos.n <= 3 ? '#F59E0B' : 'var(--qs-dim)',
                                    background: l.pos.n <= 3 ? 'rgba(245,158,11,0.12)' : 'var(--qs-elevated)',
                                    border: '1px solid var(--qs-border)', borderRadius: 4, padding: '0 5px', whiteSpace: 'nowrap' }}>
                                  {lines.length > 1 ? (l.side === 'cancel' ? 'C ' : 'R ') : ''}#{l.pos.n}/{l.pos.total}
                                </span>
                              ) : <span style={{ color: 'var(--qs-dim)' }}>—</span>}
                            </span>
                          ))}
                        </div>
                      )}
                  </td>
                </tr>
              );
            })}
            {kpiFilteredRows.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--qs-muted)', padding: '32px 0' }}>
                No at-risk policies in this filter
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Assigned-rep filter popover — anchored under the "Assigned" header caret */}
      {assignMenuOpen && assignMenuPos && createPortal(
        <>
          <div
            onClick={() => setAssignMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 60 }}
          />
          <div
            role="menu"
            style={{
              position: 'fixed', top: assignMenuPos.top, left: assignMenuPos.left,
              width: 210, maxHeight: 320, overflowY: 'auto', zIndex: 61,
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            {[
              ...(currentEmployeeId ? [{ value: 'me', label: '👤 Me (my cases)' }] : []),
              { value: 'all',        label: 'Anyone' },
              { value: 'unassigned', label: 'Unassigned' },
            ].map(opt => (
              <button
                key={opt.value}
                role="menuitem"
                onClick={() => pickAssign(opt.value)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 13,
                  background: assignedFilter === opt.value ? 'var(--qs-info-subtle)' : 'transparent',
                  color: assignedFilter === opt.value ? 'var(--qs-info)' : 'var(--qs-text)',
                  fontWeight: assignedFilter === opt.value ? 700 : 500,
                }}
              >
                {opt.label}
              </button>
            ))}
            {assigneeOptions.length > 0 && (
              <div style={{ borderTop: '1px solid var(--qs-border)', margin: '4px 0' }} />
            )}
            {assigneeOptions.map(a => (
              <button
                key={a.id}
                role="menuitem"
                onClick={() => pickAssign(a.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 13,
                  background: assignedFilter === a.id ? 'var(--qs-info-subtle)' : 'transparent',
                  color: assignedFilter === a.id ? 'var(--qs-info)' : 'var(--qs-text)',
                  fontWeight: assignedFilter === a.id ? 700 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {a.name}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* Drilldown detail modal — opens the full cancel or renewal modal with logging */}
      {drilldown && drilldown.side === 'cancel' && (
        <EventDetailModal
          event={drilldown.event}
          onClose={() => setDrilldown(null)}
          onUpdate={updateCancelEvent}
          agencyId={agencyId}
          currentEmployeeId={currentEmployeeId}
          producers={producers}
        />
      )}
      {drilldown && drilldown.side === 'renewal' && (
        <RenewalDetailModal
          event={drilldown.event}
          onClose={() => setDrilldown(null)}
          onUpdate={updateRenewalEvent}
          producers={producers}
          agencyId={agencyId}
          currentEmployeeId={currentEmployeeId}
        />
      )}
      {/* For dual_risk rows, show a switch button inside the modal overlay */}
      {drilldown && drilldown.unifiedRow?.risk_type === 'dual_risk' && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1010, display: 'flex', gap: 8,
        }}>
          <button
            className={drilldown.side === 'cancel' ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
            onClick={() => openDrilldown(drilldown.unifiedRow, 'cancel')}
          >
            Cancel Details
          </button>
          <button
            className={drilldown.side === 'renewal' ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
            onClick={() => openDrilldown(drilldown.unifiedRow, 'renewal')}
          >
            Renewal Details
          </button>
        </div>
      )}
    </div>
  );
}


export { EventDetailModal, RenewalDetailModal };
export default UnifiedAtRiskTab;
