// src/pages/components/retention/RetentionCancels.jsx
// Extracted from BookHealthPage.jsx — UnifiedAtRiskTab + all modal dependencies.

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { calcRenewalPriority, calcCancelPriority, CURRENT_YEAR } from '../../../lib/retentionPriority';
import { useOtherActiveCases } from '../../../hooks/useOtherActiveCases';
import { useAgencyProductConfig } from '../../../hooks/useAgencyProductConfig';

const STATUS_CONFIG = {
  pending:                { label: "Pending",           color: "#94A3B8", bg: "#94A3B822" },
  attempting:             { label: "Attempting",         color: "#F59E0B", bg: "#F59E0B22" },
  left_voicemail:         { label: "Left Voicemail",    color: "#F59E0B", bg: "#F59E0B22" },
  contacted:              { label: "Contacted",         color: "#3B82F6", bg: "#3B82F622" }, // legacy
  payment_plan_requested: { label: "Payment Plan",      color: "#8B5CF6", bg: "#8B5CF622" },
  promise_to_pay:         { label: "Promise to Pay",    color: "#8B5CF6", bg: "#8B5CF622" },
  saved:                  { label: "Saved ✓",      color: "#10B981", bg: "#10B98122" },
  promise_broken:         { label: "Promise Broken",    color: "#EF4444", bg: "#EF444422" },
  requested_cancellation: { label: "Wants to Cancel",   color: "#EF4444", bg: "#EF444422" },
  lost:                   { label: "Lost",              color: "#64748B", bg: "#64748B22" },
  auto_resolved:          { label: "Auto-Resolved",     color: "#64748B", bg: "#47556922" },
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
  const parts = name.trim().split(/\s+/);
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
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
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
            { label: "Product",          value: event.product?.toUpperCase() || "\u2014",                              color: "#E2E8F0" },
            { label: "Cancel Date",      value: event.cancel_effective_date || "\u2014",                               color: urgencyColor(days) },
            { label: "Days Left",        value: days <= 0 ? "PAST DUE" : `${days} days`,                         color: urgencyColor(days) },
            { label: "Phone",            value: event.phone || "\u2014",                                               color: event.phone ? "#E2E8F0" : "#334155" },
            { label: "Premium at Risk",  value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "\u2014",    color: "#E2E8F0" },
            { label: "Prior Premium",    value: event.prior_premium ? fmtFull$(event.prior_premium) : "\u2014",        color: "#94A3B8" },
            {
              label: "Premium Change",
              value: premiumChangePct !== null ? `${premiumChangePct >= 0 ? "+" : ""}${premiumChangePct.toFixed(1)}%` : "\u2014",
              color: premiumChangePct === null ? "#334155" : premiumChangePct > 0 ? "#EF4444" : "#10B981",
            },
            { label: "Items at Risk",    value: event.item_count != null ? String(event.item_count) : "\u2014",        color: "#E2E8F0" },
            { label: "Status",           value: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).label,     color: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).color },
            { label: "Assigned To",      value: event.assigned_to || "Unassigned",                                color: "#94A3B8" },
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

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event, onClose, onUpdate, agencyId, currentEmployeeId, producers = [] }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const [saving, setSaving] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "" });
  const [form, setForm] = useState({
    status:              event.status,
    assigned_to_id:      event.assigned_to_id || "",
    contact_method:      event.contact_method || "",
    promise_date:        event.promise_date || "",
    termination_reason:  event.termination_reason || "",
    notes:               event.notes || "",
  });

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
      .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
      .eq("pending_case_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    if (!currentEmployeeId) {
      console.warn('[logAttempt] No employee ID — cannot log attempt');
      return;
    }
    setLoggingAttempt(true);
    const { error } = await supabase.from("pending_cancel_attempts").insert({
      pending_case_id: event.id,
      agency_id:       agencyId,
      employee_id:     currentEmployeeId,
      method:          attemptForm.method,
      result:          attemptForm.result,
      note:            attemptForm.note || null,
    });
    if (!error) {
      await supabase.from("pending_cases").update({
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: attemptForm.result,
        ...(event.status === "pending"              ? { status: "attempting"     } : {}),
        ...(attemptForm.result === "left_voicemail" ? { status: "left_voicemail" } : {}),
        ...(attemptForm.result === "reached"        ? { contacted_at: event.contacted_at || new Date().toISOString() } : {}),
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
        .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
        .eq("pending_case_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      setAttemptForm({ method: "phone", result: "no_answer", note: "" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  async function save() {
    setSaving(true);
    const updates = { ...form };
    if (["contacted","promise_to_pay","payment_plan_requested"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["saved","lost","requested_cancellation"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    // Set closed_by_id when resolving a case
    if (["saved","lost","requested_cancellation","cancelled"].includes(form.status)) {
      updates.closed_by_id = currentEmployeeId;
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
    await onUpdate(event.id, updates);
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

  const showOutcomePicker =
    event.status === "contacted" ||
    attemptForm.result === "reached" ||
    ["contacted","payment_plan_requested","promise_to_pay",
     "promise_broken","requested_cancellation"].includes(event.status);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--qs-card)",
        border: "1px solid var(--qs-border)",
        borderRadius: 14,
        width: "100%",
        maxWidth: 640,
        maxHeight: "90vh",
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
              Policy {event.policy_no} · {event.product?.toUpperCase()} · Cycle {event.cycle}
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
                  onChange={e => setAttemptForm(p => ({ ...p, result: e.target.value }))}
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
              {loggingAttempt ? "Logging\u2026" : "+ Log Attempt"}
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

            {/* Outcome — only when customer has been reached */}
            {showOutcomePicker && (
              <div>
                <label className="dark-label">Outcome (customer reached)</label>
                <select
                  className="dark-select"
                  value={form.status}
                  onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}
                >
                  <option value="contacted">Contacted — no action yet</option>
                  <option value="payment_plan_requested">Wants Payment Plan</option>
                  <option value="promise_to_pay">Promised to Pay</option>
                  <option value="saved">Saved ✓</option>
                  <option value="requested_cancellation">Wants to Cancel</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            )}

            {/* Assignment + Promise date */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="dark-label">Assigned To</label>
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
              </div>
              <div>
                <label className="dark-label">Promise Date</label>
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

            {/* Notes */}
            <div>
              <label className="dark-label">Notes</label>
              <textarea
                className="dark-input"
                value={form.notes}
                onChange={ev => setForm(p => ({ ...p, notes: ev.target.value }))}
                rows={3}
                placeholder="Call notes, customer response..."
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {/* Save */}
            <button
              onClick={save}
              disabled={saving}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 10, border: "none",
                background: saving ? "var(--qs-elevated)" : "#10B981",
                color: saving ? "var(--qs-muted)" : "#fff",
                fontSize: 15, fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                marginTop: 4,
              }}
            >
              {saving ? "Saving\u2026" : "Save Case"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Renewal Status Config ──────────────────────────────────────────────────

// Status badge colors — used as style props
const RENEWAL_STATUS_CONFIG = {
  pending:          { label: "Pending",          color: "#94A3B8", bg: "#F1F5F9" },
  attempting:       { label: "Attempting",       color: "#F59E0B", bg: "#FEF3C7" },
  left_voicemail:   { label: "Left Voicemail",   color: "#F59E0B", bg: "#FEF3C7" },
  review_requested: { label: "Review Requested", color: "#3B82F6", bg: "#DBEAFE" },
  shopping:         { label: "Shopping",         color: "#EF4444", bg: "#FEE2E2" },
  confirmed:        { label: "Confirmed ✓", color: "#10B981", bg: "#D1FAE5" },
  at_risk:          { label: "At Risk",          color: "#EF4444", bg: "#FEE2E2" },
  escalated:        { label: "Escalated",        color: "#8B5CF6", bg: "#EDE9FE" },
  lost:             { label: "Lost",             color: "#6B7280", bg: "#F3F4F6" },
  unreachable:      { label: "Unreachable",      color: "#64748B", bg: "#F1F5F9" },
  auto_resolved:    { label: "Auto-Resolved",    color: "#94A3B8", bg: "#F1F5F9" },
};

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

function RenewalDetailModal({ event, onClose, onUpdate, producers, agencyId, currentEmployeeId }) {
  const days = daysUntilRenewal(event.renewal_date);
  const [saving, setSaving] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "" });
  const [form, setForm] = useState({
    status: event.status,
    assigned_to_id: event.assigned_to_id || "",
    contact_method: event.contact_method || "",
    notes: event.notes || "",
    shopping_reason: event.shopping_reason || "",
  });

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
      .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
      .eq("renewal_event_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    if (!currentEmployeeId) {
      console.warn('[logAttempt] No employee ID — cannot log attempt');
      return;
    }
    setLoggingAttempt(true);
    const { error } = await supabase.from("renewal_attempts").insert({
      renewal_event_id: event.id,
      agency_id: agencyId,
      employee_id: currentEmployeeId,
      method: attemptForm.method,
      result: attemptForm.result,
      note: attemptForm.note || null,
    });
    if (!error) {
      const newCount = (event.attempt_count || 0) + 1;
      const statusUpdate = {};
      if (event.status === "pending") statusUpdate.status = "attempting";
      if (attemptForm.result === "left_voicemail") statusUpdate.status = "left_voicemail";
      if (attemptForm.result === "reached") statusUpdate.contacted_at = event.contacted_at || new Date().toISOString();
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
        .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
        .eq("renewal_event_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      setAttemptForm({ method: "phone", result: "no_answer", note: "" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  async function save() {
    setSaving(true);
    const updates = { ...form };
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
    updates.assigned_to_id = updates.assigned_to_id || null;
    if (form.status !== "shopping") updates.shopping_reason = null;
    await onUpdate(event.id, updates);
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

  const showOutcomePicker =
    attemptForm.result === "reached" ||
    ["review_requested","shopping","at_risk","escalated","confirmed"].includes(event.status);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--qs-card)",
        border: "1px solid var(--qs-border)",
        borderRadius: 14,
        width: "100%",
        maxWidth: 640,
        maxHeight: "90vh",
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
              Policy {event.policy_no} · {event.product?.toUpperCase()}
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

          {/* ── KPI strip ───────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
            marginBottom: 16,
          }}>
            {[
              { label: "Policy No",     value: event.policy_no },
              { label: "Product",       value: event.product_raw || event.product?.toUpperCase() },
              { label: "Renewal Date",  value: event.renewal_date, color: renewalUrgencyColor(days) },
              { label: "Days Until",    value: days <= 0 ? "PAST DUE" : `${days} days`, color: renewalUrgencyColor(days) },
              { label: "Premium",       value: event.premium ? fmtFull$(event.premium) : "\u2014" },
              { label: "Prior Premium", value: event.premium_old ? fmtFull$(event.premium_old) : "\u2014" },
              { label: "Premium \u0394",     value: event.premium_change != null
                  ? `${event.premium_change > 0 ? "+" : ""}${fmtFull$(event.premium_change)}`
                  : "\u2014",
                color: event.premium_change == null ? "#94A3B8"
                  : event.premium_change > 0 ? "#EF4444" : "#10B981" },
              { label: "Easy Pay",      value: event.easy_pay === true ? "Yes ✓" : event.easy_pay === false ? "No" : "—" },
              { label: "Multi-Line",
                value: event.multi_line === 'Yes' ? 'Yes — Bundled'
                     : event.multi_line === 'No'  ? 'No — Monoline'
                     : '—',
                color: event.multi_line === 'Yes' ? '#10B981'
                     : event.multi_line === 'No'  ? '#60A5FA'
                     : '#64748B' },
              { label: "Tenure",        value: event.original_year
                  ? `${CURRENT_YEAR - event.original_year} yrs (${event.original_year})`
                  : "\u2014" },
              { label: "Priority",      value: String(event._priority ?? calcRenewalPriority(event)) },
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
                  fontFamily: "'DM Mono', monospace", lineHeight: 1,
                }}>
                  {value || "\u2014"}
                </div>
              </div>
            ))}
          </div>

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
                  onChange={e => setAttemptForm(p => ({ ...p, result: e.target.value }))}
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
              {loggingAttempt ? "Logging\u2026" : "+ Log Attempt"}
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

            {/* Outcome — only when customer has been reached */}
            {showOutcomePicker && (
              <div>
                <label className="dark-label">Outcome (customer reached)</label>
                <select
                  className="dark-select"
                  value={form.status}
                  onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}
                >
                  <option value="confirmed">Confirmed Renewal ✓</option>
                  <option value="review_requested">Wants Policy Review</option>
                  <option value="shopping">Shopping Competitors</option>
                  <option value="at_risk">At Risk (payment/unhappy)</option>
                  <option value="escalated">Escalate to Agent</option>
                  <option value="lost">Lost — Won't Renew</option>
                </select>
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

            {/* Assigned To */}
            <div>
              <label className="dark-label">Assigned To</label>
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
            </div>

            {/* Notes */}
            <div>
              <label className="dark-label">Notes</label>
              <textarea
                className="dark-input"
                value={form.notes}
                onChange={ev => setForm(p => ({ ...p, notes: ev.target.value }))}
                rows={3}
                placeholder="Call notes, customer response..."
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {/* Save */}
            <button
              onClick={save}
              disabled={saving}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 10, border: "none",
                background: saving ? "var(--qs-elevated)" : "#10B981",
                color: saving ? "var(--qs-muted)" : "#fff",
                fontSize: 15, fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                marginTop: 4,
              }}
            >
              {saving ? "Saving\u2026" : "Save Case"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unified Detail Modal ───────────────────────────────────────────────────

function UnifiedDetailModal({ row, onClose, agencyId, employeeMap, producers = [], onReassign }) {
  const [saving, setSaving] = useState(false);
  const [localRow, setLocalRow] = useState(row);

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
            Policy {r.policy_no} · {r.product?.toUpperCase()}
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
                { label: 'Promise Date', value: r.promise_date || '—',
                  color: (() => {
                    if (!r.promise_date) return '#64748B';
                    const d = Math.ceil((new Date(r.promise_date) - new Date()) / 86400000);
                    return d <= 1 ? '#EF4444' : d <= 3 ? '#F59E0B' : '#94A3B8';
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
                  color: (r.cycle || 1) >= 3 ? '#EF4444' : (r.cycle || 1) === 2 ? '#F59E0B' : '#94A3B8' },
                { label: 'Attempts', value: r.cancel_attempts || 0,
                  color: (r.cancel_attempts || 0) >= 3 ? '#EF4444' : '#94A3B8' },
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
                  value: RENEWAL_STATUS_CONFIG[r.renewal_status]?.label || r.renewal_status || '—' },
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
                  color: r.premium_change == null ? '#94A3B8'
                       : r.premium_change > 0 ? '#EF4444' : '#10B981' },
                { label: 'Δ%',
                  value: r.premium_change_pct != null
                    ? `${r.premium_change_pct > 0 ? '+' : ''}${r.premium_change_pct.toFixed(1)}%`
                    : '—',
                  color: r.premium_change_pct == null ? '#94A3B8'
                       : r.premium_change_pct > 0 ? '#EF4444' : '#10B981' },
                { label: 'Tenure',
                  value: r.original_year
                    ? `${new Date().getFullYear() - r.original_year} yrs (${r.original_year})`
                    : '—' },
                { label: 'Easy Pay',
                  value: r.easy_pay === true ? 'Yes ✓' : r.easy_pay === false ? 'No' : '—' },
                { label: 'Multi-Line',
                  value: r.multi_line === 'Yes' ? 'Yes — Bundled'
                       : r.multi_line === 'No'  ? 'No — Monoline'
                       : '—',
                  color: r.multi_line === 'Yes' ? '#10B981'
                       : r.multi_line === 'No'  ? '#60A5FA'
                       : '#64748B' },
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

function calcUnifiedPriority(row) {
  const cancelScore = row.cancel_event_id
    ? calcCancelPriority({
        cancel_effective_date: row.cancel_effective_date,
        premium_at_risk:       row.premium_at_risk,
        attempt_count:         row.cancel_attempts,
        cycle:                 row.cycle,
        status:                row.cancel_status,
        promise_date:          row.promise_date,
      })
    : 0;

  const renewalScore = row.renewal_event_id
    ? calcRenewalPriority({
        renewal_date:       row.renewal_date,
        premium_change_pct: row.premium_change_pct,
        original_year:      row.original_year,
        premium:            row.renewal_premium,
        easy_pay:           row.easy_pay,
      })
    : 0;

  const base = Math.max(cancelScore, renewalScore);
  // Dual risk adds 15 — one call needs to handle both cancel AND renewal
  return row.risk_type === 'dual_risk' ? Math.min(base + 15, 100) : base;
}

function UnifiedAtRiskTab({ agencyId, currentUserId, currentEmployeeId, urgentFilter = false, onClearUrgentFilter }) {
  const { config: productConfig } = useAgencyProductConfig(agencyId);
  const queryClient = useQueryClient();

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
  const [myCasesOnly, setMyCasesOnly] = useState(false);
  const [sortCol, setSortCol] = useState('priority');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedUnified, setSelectedUnified] = useState(null);
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
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    }
    return error;
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  const filteredRows = useMemo(() => {
    let list = rows.map(r => ({ ...r, _priority: calcUnifiedPriority(r) }));

    if (riskFilter !== 'all') {
      list = list.filter(r => r.risk_type === riskFilter);
    }

    if (myCasesOnly && currentEmployeeId) {
      list = list.filter(r =>
        r.cancel_assigned_to_id === currentEmployeeId ||
        r.renewal_assigned_to_id === currentEmployeeId
      );
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

    // Sort logic
    if (sortCol === 'priority') {
      return list.sort((a, b) =>
        sortDir === 'asc' ? a._priority - b._priority : b._priority - a._priority
      );
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
          aVal = a.risk_type === 'renewal' ? (a.renewal_premium || 0) : (a.premium_at_risk || 0);
          bVal = b.risk_type === 'renewal' ? (b.renewal_premium || 0) : (b.premium_at_risk || 0);
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        case 'premium_change_pct':
          aVal = a.premium_change_pct || 0;
          bVal = b.premium_change_pct || 0;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        default:
          return sortDir === 'asc' ? a._priority - b._priority : b._priority - a._priority;
      }
    });
  }, [rows, riskFilter, myCasesOnly, currentEmployeeId, sortCol, sortDir, urgentFilter]);

  const kpiFilteredRows = useMemo(() => {
    if (kpiFilter === null) return filteredRows;
    if (kpiFilter === 'multi_line') return filteredRows.filter(r => r.multi_line === 'Yes');
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

          // KpiCard color prop — hex intentionally
          const kpis = [
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
              kpiFilter === 'multi_line'     ? 'Multi-Line'      : kpiFilter
            }
            <button
              onClick={() => setKpiFilter(null)}
              style={{ background: 'none', border: 'none', color: 'var(--qs-info)',
                cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          </div>
        )}

        {/* My Cases toggle */}
        <button
          onClick={() => setMyCasesOnly(v => !v)}
          className={`btn-ghost ${myCasesOnly ? 'active' : ''}`}
          style={{ marginLeft: 'auto' }}
        >
          👤 My Cases
        </button>
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
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {kpiFilteredRows.map(row => {
              const cancelDays = row.cancel_effective_date ? daysUntilCancel(row.cancel_effective_date) : null;
              const renewalDays = row.renewal_date ? daysUntilRenewal(row.renewal_date) : null;

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
                    {row.product?.toUpperCase() || '—'}
                  </td>

                  <td style={{ color: 'var(--qs-subtle)', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    {((row.cancel_attempts || 0) + (row.renewal_attempts || 0)) || 0}
                  </td>

                  <td style={{ color: 'var(--qs-subtle)', fontSize: 12 }}>
                    {(() => {
                      const cId = row.cancel_assigned_to_id;
                      const rId = row.renewal_assigned_to_id;
                      if (!cId && !rId) return '—';
                      const cName = cId ? employeeMap[cId] : null;
                      const rName = rId ? employeeMap[rId] : null;
                      if (cId && rId && cId !== rId) return `${cName || '✓'} / ${rName || '✓'}`;
                      return cName || rName || '✓';
                    })()}
                  </td>
                </tr>
              );
            })}
            {kpiFilteredRows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--qs-muted)', padding: '32px 0' }}>
                No at-risk policies in this filter
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

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
