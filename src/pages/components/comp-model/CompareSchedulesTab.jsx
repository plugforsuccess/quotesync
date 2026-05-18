// src/pages/components/comp-model/CompareSchedulesTab.jsx
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAllSchedules } from '../../../hooks/useCompSchedules';
import { useAgencyCommissionRates } from '../../../hooks/useAgencyCommissionRates';
import { useAllProducerConfigs } from '../../../hooks/useProducerCompModel';
import { scenarioRow } from '../../../utils/compModelCalculations';
import { getBlendedValues } from '../../../lib/commissionUtils';

const DEFAULT_SCENARIO_ITEMS = '20, 25, 30, 35, 40';

// Inline style for form inputs (see "Component patterns" section of this spec).
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  color: 'var(--qs-text)',
  fontSize: 14,
  outline: 'none',
};

// Maps producer_comp_product_mix.product_name → useAgencyCommissionRates matrix key.
// See repository-conventions reference: the existing hook collapses three DB products
// into 'Other Personal Lines'.
const PRODUCT_NAME_TO_LABEL = {
  'Auto':              'Standard Auto',
  'Home':              'Homeowners / Condo',
  'Condo':             'Homeowners / Condo',
  'Renters':           'Other Personal Lines',
  'Landlord':          'Other Personal Lines',
  'Personal Umbrella': 'Other Personal Lines',
  'Boat Owners':       'Other Personal Lines',
  'Manufactured Home': 'Other Personal Lines',
  'Specialty Auto':    'Standard Auto',
};

function normalizeProductLabel(productName) {
  return PRODUCT_NAME_TO_LABEL[productName] ?? 'Other Personal Lines';
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export default function CompareSchedulesTab({ config, productMix }) {
  const { currentAgencyId } = useAuth();
  const { data: allSchedules = [], isLoading: loadingSchedules } = useAllSchedules(currentAgencyId);

  const defaultIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const current = allSchedules.find(s =>
      !s.is_announced_only &&
      s.effective_from <= today &&
      (s.effective_to === null || s.effective_to > today)
    );
    const announced = allSchedules.find(s => s.is_announced_only);
    return {
      currentId: current?.id ?? '',
      compareId: announced?.id ?? '',
    };
  }, [allSchedules]);

  const [currentScheduleId, setCurrentScheduleId] = useState('');
  const [compareScheduleId, setCompareScheduleId] = useState('');
  const [scenarioInput, setScenarioInput] = useState(DEFAULT_SCENARIO_ITEMS);

  useEffect(() => {
    if (defaultIds.currentId && !currentScheduleId) {
      setCurrentScheduleId(defaultIds.currentId);
    }
    if (defaultIds.compareId && !compareScheduleId) {
      setCompareScheduleId(defaultIds.compareId);
    }
  }, [defaultIds.currentId, defaultIds.compareId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentRates = useAgencyCommissionRates(
    currentAgencyId,
    currentScheduleId ? { scheduleId: currentScheduleId } : undefined
  );
  const compareRates = useAgencyCommissionRates(
    currentAgencyId,
    compareScheduleId ? { scheduleId: compareScheduleId, includeAnnouncedOnly: true } : undefined
  );

  const parsedItems = useMemo(() =>
    scenarioInput
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0 && n <= 200),
    [scenarioInput]
  );

  const policyMixForBlend = useMemo(() => {
    return (productMix ?? []).map(p => ({
      productLine: normalizeProductLabel(p.product_name),
      tier: 'bundled',  // default tier weight for blended; producers don't store tier per line
      avgPremium: Number(p.avg_prem_item),
      mixPct: Number(p.mix_pct) * 100,  // producer_comp_product_mix stores decimals; getBlendedValues expects 0-100
    }));
  }, [productMix]);

  const deltaRows = useMemo(() => {
    if (!config || policyMixForBlend.length === 0) return [];
    if (!currentRates.isLoaded || !compareRates.isLoaded) return [];

    const currentBlend = getBlendedValues(
      policyMixForBlend, currentRates.commissionMatrix, currentRates.baseCommission
    );
    const compareBlend = getBlendedValues(
      policyMixForBlend, compareRates.commissionMatrix, compareRates.baseCommission
    );

    return parsedItems.map(n => {
      const configCurrent = { ...config, vc_commission_rate: currentBlend.commissionRate / 100 };
      const configCompare = { ...config, vc_commission_rate: compareBlend.commissionRate / 100 };
      const blendedAvgValue = currentBlend.avgPremium; // same product mix → same on both sides

      const rowCurrent = scenarioRow(n, configCurrent, blendedAvgValue);
      const rowCompare = scenarioRow(n, configCompare, blendedAvgValue);

      const deltaMonthly = rowCompare.agencyCommission - rowCurrent.agencyCommission;
      const deltaPct = rowCurrent.agencyCommission > 0
        ? (deltaMonthly / rowCurrent.agencyCommission) * 100
        : 0;

      return {
        items: n,
        currentCommission: rowCurrent.agencyCommission,
        compareCommission: rowCompare.agencyCommission,
        deltaMonthly,
        deltaPct,
      };
    });
  }, [parsedItems, config, policyMixForBlend, currentRates, compareRates]);

  const { data: allProducerConfigs = [] } = useAllProducerConfigs(currentAgencyId);

  const agencyWideImpact = useMemo(() => {
    if (!currentRates.isLoaded || !compareRates.isLoaded) {
      return { monthly: 0, annual: 0, includedCount: 0, excludedCount: 0 };
    }
    if (allProducerConfigs.length === 0 || policyMixForBlend.length === 0) {
      return { monthly: 0, annual: 0, includedCount: 0, excludedCount: 0 };
    }

    const currentBlend = getBlendedValues(
      policyMixForBlend, currentRates.commissionMatrix, currentRates.baseCommission
    );
    const compareBlend = getBlendedValues(
      policyMixForBlend, compareRates.commissionMatrix, compareRates.baseCommission
    );

    let totalMonthlyDelta = 0;
    let included = 0;
    let excluded = 0;

    for (const pc of allProducerConfigs) {
      const target = pc.tp_band1_threshold ?? null;
      if (!target) { excluded++; continue; }
      const cfgCurrent = { ...pc, vc_commission_rate: currentBlend.commissionRate / 100 };
      const cfgCompare = { ...pc, vc_commission_rate: compareBlend.commissionRate / 100 };
      const rowCurrent = scenarioRow(target, cfgCurrent, currentBlend.avgPremium);
      const rowCompare = scenarioRow(target, cfgCompare, compareBlend.avgPremium);
      totalMonthlyDelta += (rowCompare.agencyCommission - rowCurrent.agencyCommission);
      included++;
    }

    return {
      monthly: totalMonthlyDelta,
      annual: totalMonthlyDelta * 12,
      includedCount: included,
      excludedCount: excluded,
    };
  }, [allProducerConfigs, currentRates, compareRates, policyMixForBlend]);

  if (loadingSchedules) {
    return <div className="text-sm text-[var(--qs-subtle)]">Loading schedules…</div>;
  }

  if (allSchedules.length < 2) {
    return (
      <div className="rounded border border-[var(--qs-border)] bg-[var(--qs-card)] p-8 text-center">
        <p className="text-[var(--qs-text)]">
          Need at least two schedules to compare.
        </p>
        <p className="text-sm text-[var(--qs-subtle)] mt-2">
          Create a second schedule (e.g., next year's announced rates) on the{' '}
          <a href="/agency/comp-schedules" className="text-[var(--qs-info)] underline">
            Comp Schedules
          </a>{' '}
          page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Current Schedule">
          <select
            value={currentScheduleId}
            onChange={(e) => setCurrentScheduleId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select a schedule —</option>
            {allSchedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.schedule_label} {s.is_announced_only ? '(Announced)' : ''}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Compare Against">
          <select
            value={compareScheduleId}
            onChange={(e) => setCompareScheduleId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select a schedule —</option>
            {allSchedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.schedule_label} {s.is_announced_only ? '(Announced)' : ''}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField
        label="Scenario item counts"
        helpText="Comma-separated. Example: 20, 25, 30, 35"
      >
        <input
          type="text"
          value={scenarioInput}
          onChange={(e) => setScenarioInput(e.target.value)}
          style={inputStyle}
        />
      </FormField>

      {currentScheduleId && compareScheduleId && deltaRows.length > 0 && (
        <>
          <div className="rounded border border-[var(--qs-border)] bg-[var(--qs-card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--qs-elevated)] text-xs uppercase text-[var(--qs-subtle)]">
                <tr>
                  <th className="px-4 py-2 text-right">Items/mo</th>
                  <th className="px-4 py-2 text-right">Current Comp $</th>
                  <th className="px-4 py-2 text-right">New Comp $</th>
                  <th className="px-4 py-2 text-right">Delta $</th>
                  <th className="px-4 py-2 text-right">Delta %</th>
                </tr>
              </thead>
              <tbody>
                {deltaRows.map(r => {
                  const positive = r.deltaMonthly > 0;
                  const negative = r.deltaMonthly < 0;
                  const color = positive ? 'var(--qs-success)' : negative ? 'var(--qs-danger)' : 'var(--qs-subtle)';
                  return (
                    <tr key={r.items} className="border-t border-[var(--qs-border)]">
                      <td className="px-4 py-2 text-right text-[var(--qs-text)]">{r.items}</td>
                      <td className="px-4 py-2 text-right text-[var(--qs-text)]">${formatMoney(r.currentCommission)}</td>
                      <td className="px-4 py-2 text-right text-[var(--qs-text)]">${formatMoney(r.compareCommission)}</td>
                      <td className="px-4 py-2 text-right font-medium" style={{ color }}>
                        {positive ? '+' : ''}${formatMoney(r.deltaMonthly)}
                      </td>
                      <td className="px-4 py-2 text-right font-bold" style={{ color }}>
                        {positive ? '+' : ''}{r.deltaPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Avg producer monthly impact"
              value={
                deltaRows.length > 0
                  ? `${(deltaRows.reduce((s, r) => s + r.deltaMonthly, 0) / deltaRows.length) >= 0 ? '+' : ''}$${formatMoney(deltaRows.reduce((s, r) => s + r.deltaMonthly, 0) / deltaRows.length)}`
                  : '—'
              }
              subline="Average across scenarios"
            />
            <StatCard
              label="Avg producer annual impact"
              value={
                deltaRows.length > 0
                  ? `${((deltaRows.reduce((s, r) => s + r.deltaMonthly, 0) / deltaRows.length) * 12) >= 0 ? '+' : ''}$${formatMoney((deltaRows.reduce((s, r) => s + r.deltaMonthly, 0) / deltaRows.length) * 12)}`
                  : '—'
              }
              subline="At avg scenario × 12 months"
            />
            <StatCard
              label="Agency-wide annual impact"
              value={`${agencyWideImpact.annual >= 0 ? '+' : ''}$${formatMoney(agencyWideImpact.annual)}`}
              subline={
                agencyWideImpact.excludedCount > 0
                  ? `${agencyWideImpact.includedCount} producers · ${agencyWideImpact.excludedCount} excluded (no target set)`
                  : `${agencyWideImpact.includedCount} active producer${agencyWideImpact.includedCount === 1 ? '' : 's'}`
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function FormField({ label, helpText, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--qs-text)] mb-1">{label}</label>
      {children}
      {helpText && <p className="text-xs text-[var(--qs-dim)] mt-1">{helpText}</p>}
    </div>
  );
}

function StatCard({ label, value, subline }) {
  return (
    <div className="rounded border border-[var(--qs-border)] bg-[var(--qs-card)] p-4">
      <div className="text-xs uppercase text-[var(--qs-subtle)] mb-2">{label}</div>
      <div className="text-2xl font-bold text-[var(--qs-bright)]">{value}</div>
      {subline && <div className="text-xs text-[var(--qs-dim)] mt-1">{subline}</div>}
    </div>
  );
}
