// Principal-facing retention-bonus panel for the Staff Performance page.
//   • Configure the employee's live bonus plan (enabled / unit / threshold / rate)
//   • See the live estimate for the selected month (from verified call data)
//   • Freeze the month into retention_bonus_ledger (finalize → mark paid)
//
// Gating: when no enabled plan exists, no bonus figures are shown — only the
// "configure a plan" affordance — so the UI never promises uncontracted money.

import { useState, useEffect } from 'react';
import { DollarSign, Lock, CheckCircle2, Pencil } from 'lucide-react';
import { useEmployeeBonusPlan, useSaveBonusPlan } from '../../../hooks/useEmployeeBonusPlan';
import { useRetentionBonusLedger, useFinalizeBonus } from '../../../hooks/useRetentionBonusLedger';
import { BONUS_UNITS, unitMeta, computeBonus } from '../../../config/bonusPlan';
import { BonusVerificationAlert } from './DiscrepancyAlerts';

const EMPTY_FORM = {
  enabled: true,
  bonus_unit: 'connected_call',
  threshold: 30,
  per_unit_amount: 25,
  notes: '',
};

export default function BonusPlanEditor({
  employeeRecord,
  agencyId,
  month,
  verificationData,
  userId,
}) {
  const employeeId = employeeRecord?.id;
  const { data: plan, isLoading: planLoading } = useEmployeeBonusPlan(employeeId);
  const { data: ledger } = useRetentionBonusLedger(employeeId, month);
  const { mutate: savePlan, isPending: saving } = useSaveBonusPlan();
  const { mutate: finalize, isPending: finalizing } = useFinalizeBonus();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Seed the form whenever we open the editor or the loaded plan changes.
  useEffect(() => {
    if (plan) {
      setForm({
        enabled: plan.enabled,
        bonus_unit: plan.bonus_unit,
        threshold: plan.threshold,
        per_unit_amount: Number(plan.per_unit_amount),
        notes: plan.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [plan]);

  const verifiedCount = verificationData?.verified ?? 0;
  const { payableUnits, bonusAmount } = computeBonus(plan, verifiedCount);
  const meta = unitMeta(plan?.bonus_unit);

  function handleSave() {
    savePlan(
      {
        ...(plan?.id ? { id: plan.id } : {}),
        agency_id: agencyId,
        employee_id: employeeId,
        enabled: form.enabled,
        bonus_unit: form.bonus_unit,
        threshold: Math.max(0, parseInt(form.threshold, 10) || 0),
        per_unit_amount: Math.max(0, Number(form.per_unit_amount) || 0),
        notes: form.notes?.trim() || null,
        created_by: userId || null,
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  // Freeze the current month's computed result into the ledger. Stores a
  // PII-light per-attempt snapshot (policy + verification outcome, no phone).
  function handleFinalize(status) {
    const detail = (verificationData?.attempts || []).map((a) => ({
      caseType: a.caseType,
      policy_no: a.policy_no,
      attemptDate: a.attemptDate,
      verified: a.verified,
      reason: a.reason,
    }));
    finalize({
      ...(ledger?.id ? { id: ledger.id } : {}),
      agency_id: agencyId,
      employee_id: employeeId,
      period_month: `${month}-01`,
      bonus_unit: plan.bonus_unit,
      threshold: plan.threshold,
      per_unit_amount: plan.per_unit_amount,
      verified_count: verifiedCount,
      payable_units: payableUnits,
      bonus_amount: bonusAmount,
      detail,
      status,
      computed_by: userId || null,
      ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
    });
  }

  if (planLoading) return null;

  const hasPlan = !!plan?.enabled;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-qs-subtle uppercase tracking-wider mb-3 flex items-center gap-2">
        <DollarSign className="w-4 h-4" />
        Retention Bonus — {month}
      </h3>

      <div className="bg-qs-card rounded-lg border border-qs-border p-5">
        {/* ── No plan: prompt to configure ───────────────────────────────── */}
        {!hasPlan && !editing && (
          <div className="text-center py-4">
            <Lock className="w-8 h-8 text-qs-muted mx-auto mb-3" />
            <div className="text-sm text-qs-dim mb-1">No bonus plan configured</div>
            <div className="text-xs text-qs-subtle mb-4">
              This employee won't see a bonus on their scorecard until you enable a plan.
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-white"
            >
              Configure bonus plan
            </button>
          </div>
        )}

        {/* ── Edit form ──────────────────────────────────────────────────── */}
        {editing && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-qs-text">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Bonus plan active
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-qs-subtle uppercase tracking-wider mb-1">
                  Paid on
                </label>
                <select
                  value={form.bonus_unit}
                  onChange={(e) => setForm({ ...form, bonus_unit: e.target.value })}
                  className="w-full text-sm border border-qs-border rounded-md px-3 py-1.5 bg-qs-elevated text-qs-text"
                >
                  {Object.values(BONUS_UNITS).map((u) => (
                    <option key={u.value} value={u.value}>{u.verifiedLabel}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-qs-subtle uppercase tracking-wider mb-1">
                  Monthly threshold
                </label>
                <input
                  type="number" min="0"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                  className="w-full text-sm border border-qs-border rounded-md px-3 py-1.5 bg-qs-elevated text-qs-text"
                />
              </div>
              <div>
                <label className="block text-xs text-qs-subtle uppercase tracking-wider mb-1">
                  $ per unit above threshold
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.per_unit_amount}
                  onChange={(e) => setForm({ ...form, per_unit_amount: e.target.value })}
                  className="w-full text-sm border border-qs-border rounded-md px-3 py-1.5 bg-qs-elevated text-qs-text"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-qs-subtle uppercase tracking-wider mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. per 2026 comp agreement"
                className="w-full text-sm border border-qs-border rounded-md px-3 py-1.5 bg-qs-elevated text-qs-text"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm font-medium px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save plan'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm font-medium px-4 py-2 rounded-md border border-qs-border text-qs-dim hover:text-qs-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Configured plan: live numbers + freeze controls ────────────── */}
        {hasPlan && !editing && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-qs-subtle">
                {meta.verifiedLabel} · threshold {plan.threshold} · $
                {Number(plan.per_unit_amount).toLocaleString()} per unit
                {plan.notes ? ` · ${plan.notes}` : ''}
              </div>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-qs-dim hover:text-qs-text flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Edit plan
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat value={verifiedCount} label={meta.verifiedLabel} />
              <Stat
                value={`${payableUnits} × $${Number(plan.per_unit_amount).toLocaleString()}`}
                label={`above ${plan.threshold} threshold`}
                accent
              />
              <Stat
                value={`$${bonusAmount.toLocaleString()}`}
                label="bonus earned"
                accent={bonusAmount > 0}
              />
            </div>

            {/* Ledger / freeze state */}
            {ledger ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 mb-3">
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  {ledger.status === 'paid' ? 'Paid' : 'Finalized'} · $
                  {Number(ledger.bonus_amount).toLocaleString()} ({ledger.verified_count}{' '}
                  {meta.short})
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFinalize('finalized')}
                    disabled={finalizing}
                    className="text-xs px-3 py-1.5 rounded-md border border-qs-border text-qs-dim hover:text-qs-text disabled:opacity-60"
                  >
                    Recompute
                  </button>
                  {ledger.status !== 'paid' && (
                    <button
                      onClick={() => handleFinalize('paid')}
                      disabled={finalizing}
                      className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-qs-border bg-qs-elevated px-4 py-3 mb-3">
                <div className="text-sm text-qs-dim">
                  Estimated — not yet frozen to payroll.
                </div>
                <button
                  onClick={() => handleFinalize('finalized')}
                  disabled={finalizing}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-60"
                >
                  {finalizing ? 'Closing…' : 'Close month'}
                </button>
              </div>
            )}

            <BonusVerificationAlert verificationData={verificationData} month={month} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-qs-bright'}`}>
        {value}
      </div>
      <div className="text-xs text-qs-subtle mt-1">{label}</div>
    </div>
  );
}
