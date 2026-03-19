// src/pages/components/dashboard/CapacityPlanner.jsx
// Section 4: Capacity Planning Model — current performance + scenario planner

import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Plus, X, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getCommissionRate, getFirstYearMultiplier } from '../../../lib/commissionUtils';

// ─── Reusable rows ──────────────────────────────────────────────────────────

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
      <span className="text-sm" style={{ color: 'var(--qs-dim)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: highlight || 'var(--qs-bright)' }}>{value}</span>
    </div>
  );
}

function InputRow({ label, value, onChange, prefix, suffix, min, max, step = 1, description }) {
  return (
    <div className="py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
      <div className="flex justify-between items-center">
        <label className="text-sm" style={{ color: 'var(--qs-dim)' }}>{label}</label>
        <div className="relative">
          {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>{prefix}</span>}
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            className={`dark-input w-24 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${prefix ? 'pl-6 pr-2' : suffix ? 'pl-2 pr-6' : 'px-2'}`}
          />
          {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>{suffix}</span>}
        </div>
      </div>
      {description && <p className="text-xs mt-0.5" style={{ color: 'var(--qs-subtle)' }}>{description}</p>}
    </div>
  );
}

// ─── Commission Reference Table (collapsible) ───────────────────────────────

const TIER_LABELS = { preferredBundled: 'Pref Bundled', bundled: 'Bundled', monoline: 'Monoline' };

function CommissionReferenceTable({ matrix, baseCommission, renewalInfo }) {
  const [open, setOpen] = useState(false);
  const productLines = Object.keys(matrix);
  const tiers = Object.keys(TIER_LABELS);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium"
        style={{ color: 'var(--qs-info)' }}
      >
        New Business Commission Schedule
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--qs-border)' }}>
                <th className="text-left py-1 pr-3 font-medium" style={{ color: 'var(--qs-subtle)' }} />
                {tiers.map(k => (
                  <th key={k} className="text-right py-1 px-2 font-medium" style={{ color: 'var(--qs-subtle)' }}>
                    {TIER_LABELS[k]}
                  </th>
                ))}
                <th className="text-left py-1 pl-3 font-medium" style={{ color: 'var(--qs-subtle)' }} />
              </tr>
            </thead>
            <tbody>
              {productLines.map(pl => {
                const info = renewalInfo?.[pl];
                let renewalNote = '';
                if (info) {
                  if (!info.renewalRates) {
                    renewalNote = `(${info.cycleMonths}-mo renewal: same rates)`;
                  } else {
                    const rateStr = tiers.map(t => `${info.renewalRates[t]}%`).join(' / ');
                    renewalNote = `(${info.cycleMonths}-mo renewal: ${rateStr})`;
                  }
                }
                return (
                  <tr key={pl} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                    <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'var(--qs-text)' }}>{pl}</td>
                    {tiers.map(tier => (
                      <td key={tier} className="py-1 px-2 text-right font-medium" style={{ color: 'var(--qs-text)' }}>
                        {baseCommission + matrix[pl][tier]}%
                      </td>
                    ))}
                    <td className="py-1 pl-3 whitespace-nowrap text-xs" style={{ color: 'var(--qs-subtle)' }}>{renewalNote}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs mt-1" style={{ color: 'var(--qs-dim)' }}>
            Base: {baseCommission}% new business
            {renewalInfo && (
              <> | Auto 1st renewal: {renewalInfo['Standard Auto']?.renewalBase ?? baseCommission}% | Home/OPL 1st renewal: {renewalInfo['Homeowners / Condo']?.renewalBase ?? baseCommission}%</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Policy Mix Table ────────────────────────────────────────────────────────

function PolicyMixTable({
  policyMix, commissionMatrix, baseCommission,
  onMixChange, onMixAdd, onMixRemove,
  tierOptions, productLines, renewalInfo,
}) {
  const totalMix = policyMix.reduce((s, r) => s + r.mixPct, 0);
  const mixValid = Math.abs(totalMix - 100) < 0.01;

  return (
    <div className="mt-3">
      <p className="text-sm font-medium mb-2" style={{ color: 'var(--qs-text)' }}>Your Policy Mix</p>

      {/* Desktop header */}
      <div className="hidden md:grid md:grid-cols-[minmax(120px,1fr)_minmax(100px,1fr)_5rem_3.5rem_4rem_2.5rem_1.5rem] gap-1 text-xs font-medium mb-1 px-1" style={{ color: 'var(--qs-subtle)' }}>
        <span>Product Line</span>
        <span>Tier</span>
        <span className="text-right">Premium</span>
        <span className="text-right">Comm %</span>
        <span className="text-right">Mix %</span>
        <span className="text-center">1st Yr</span>
        <span />
      </div>

      {policyMix.map((row, idx) => {
        const commRate = getCommissionRate(row.productLine, row.tier, commissionMatrix, baseCommission);
        const multiplier = getFirstYearMultiplier(row.productLine);
        return (
          <div key={idx}>
            {/* Desktop row */}
            <div className="hidden md:grid md:grid-cols-[minmax(120px,1fr)_minmax(100px,1fr)_5rem_3.5rem_4rem_2.5rem_1.5rem] gap-1 items-center py-1" style={{ borderBottom: '1px solid var(--qs-border)' }}>
              {/* Product line select */}
              <select
                value={row.productLine}
                onChange={(e) => onMixChange(idx, 'productLine', e.target.value)}
                className="dark-select text-sm truncate"
              >
                {productLines.map(pl => (
                  <option key={pl} value={pl}>{pl}</option>
                ))}
              </select>

              {/* Tier select */}
              <select
                value={row.tier}
                onChange={(e) => onMixChange(idx, 'tier', e.target.value)}
                className="dark-select text-sm truncate"
              >
                {tierOptions.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>

              {/* Premium input */}
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--qs-subtle)' }}>$</span>
                <input
                  type="number"
                  value={row.avgPremium}
                  onChange={(e) => onMixChange(idx, 'avgPremium', parseFloat(e.target.value) || 0)}
                  min={0}
                  step={100}
                  className="dark-input w-full text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-5 pr-1"
                />
              </div>

              {/* Commission % (read-only, auto-populated) */}
              <span className="text-sm text-right font-medium px-1 py-1 rounded" style={{ color: 'var(--qs-dim)', background: 'var(--qs-elevated)' }}>{commRate}%</span>

              {/* Mix % input */}
              <div className="relative">
                <input
                  type="number"
                  value={row.mixPct}
                  onChange={(e) => onMixChange(idx, 'mixPct', parseFloat(e.target.value) || 0)}
                  min={0}
                  max={100}
                  className="dark-input w-full text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-1 pr-5"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--qs-subtle)' }}>%</span>
              </div>

              {/* 1st Year multiplier badge */}
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded text-center ${
                multiplier === 2 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                ×{multiplier}
              </span>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onMixRemove(idx)}
                disabled={policyMix.length <= 1}
                className={`p-0.5 ${policyMix.length <= 1 ? 'cursor-not-allowed' : 'hover:text-red-500'}`}
                style={{ color: policyMix.length <= 1 ? 'var(--qs-border)' : 'var(--qs-subtle)' }}
                title="Remove row"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile stacked row */}
            <div className="md:hidden py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <select
                  value={row.productLine}
                  onChange={(e) => onMixChange(idx, 'productLine', e.target.value)}
                  className="dark-select text-sm flex-1 mr-1"
                >
                  {productLines.map(pl => (
                    <option key={pl} value={pl}>{pl}</option>
                  ))}
                </select>
                <select
                  value={row.tier}
                  onChange={(e) => onMixChange(idx, 'tier', e.target.value)}
                  className="dark-select text-sm flex-1 mr-1"
                >
                  {tierOptions.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onMixRemove(idx)}
                  disabled={policyMix.length <= 1}
                  className={`p-0.5 flex-shrink-0 ${policyMix.length <= 1 ? 'cursor-not-allowed' : 'hover:text-red-500'}`}
                  style={{ color: policyMix.length <= 1 ? 'var(--qs-border)' : 'var(--qs-subtle)' }}
                  title="Remove row"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--qs-subtle)' }}>$</span>
                  <input
                    type="number"
                    value={row.avgPremium}
                    onChange={(e) => onMixChange(idx, 'avgPremium', parseFloat(e.target.value) || 0)}
                    min={0}
                    step={100}
                    className="dark-input w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-5 pr-1"
                  />
                </div>
                <span className="font-medium px-2 py-1 rounded text-sm" style={{ color: 'var(--qs-dim)', background: 'var(--qs-elevated)' }}>{commRate}%</span>
                <div className="relative">
                  <input
                    type="number"
                    value={row.mixPct}
                    onChange={(e) => onMixChange(idx, 'mixPct', parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="dark-input w-14 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-1 pr-5"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--qs-subtle)' }}>%</span>
                </div>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                  multiplier === 2 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  ×{multiplier}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer: total + add row */}
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={onMixAdd}
          className="flex items-center gap-1 text-sm font-medium"
          style={{ color: 'var(--qs-info)' }}
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--qs-dim)' }}>
            Total: <span className={`font-semibold ${mixValid ? 'text-green-600' : 'text-red-600'}`}>
              {Math.round(totalMix)}%
            </span>
          </span>
          {mixValid
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <AlertCircle className="w-4 h-4 text-red-500" />
          }
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CapacityPlanner({
  kpis, plannerInputs, onInputChange,
  onMixChange, onMixAdd, onMixRemove,
  tierOptions, productLines, renewalInfo,
}) {
  if (!kpis) return null;

  const { submissions, conversionRate, avgScore, runRate, projectedMonthly, gapTo700 } = kpis;
  const {
    targetSubmissions, avgCPC, landingPageConvRate, closeRate,
    policyMix = [],
    commissionMatrix = {},
    baseCommission = 9,
  } = plannerInputs;

  // Computed outputs
  const outputs = useMemo(() => {
    const convRate = landingPageConvRate / 100;
    const close = closeRate / 100;

    // Blended stats for display
    const blendedPremium = policyMix.reduce(
      (sum, r) => sum + (r.mixPct / 100) * r.avgPremium, 0
    );
    const blendedCommission = blendedPremium > 0
      ? policyMix.reduce((sum, r) => {
          const mix = r.mixPct / 100;
          const rate = getCommissionRate(
            r.productLine, r.tier, commissionMatrix, baseCommission
          );
          return sum + (mix * r.avgPremium * rate);
        }, 0) / blendedPremium
      : 0;

    // Funnel projections (monthly)
    const requiredLeads = close > 0 ? Math.ceil(targetSubmissions / close) : 0;
    const requiredClicks = convRate > 0 ? Math.ceil(requiredLeads / convRate) : 0;
    const estMonthlyAdSpend = requiredClicks * avgCPC;
    const estPoliciesClosed = Math.round(targetSubmissions * close);
    const estMonthlyCommission = estPoliciesClosed * blendedPremium * (blendedCommission / 100);
    const monthlyNet = estMonthlyCommission - estMonthlyAdSpend;

    // First-year projection
    // Each policy's first-year commission depends on its renewal cycle:
    // Auto (6-mo cycle): new biz + 1 renewal at same rate = ×2
    // Home/OPL (12-mo cycle): new biz only = ×1
    const firstYearPolicies = estPoliciesClosed * 12;
    const firstYearCommPerPolicy = policyMix.reduce((sum, row) => {
      const mix = row.mixPct / 100;
      const rate = getCommissionRate(row.productLine, row.tier, commissionMatrix, baseCommission) / 100;
      const multiplier = getFirstYearMultiplier(row.productLine);
      return sum + mix * row.avgPremium * rate * multiplier;
    }, 0);
    const firstYearGrossCommission = firstYearPolicies * firstYearCommPerPolicy;
    const firstYearAdSpend = estMonthlyAdSpend * 12;
    const firstYearNet = firstYearGrossCommission - firstYearAdSpend;
    const firstYearROI = firstYearAdSpend > 0 ? (firstYearNet / firstYearAdSpend) * 100 : 0;

    // Breakeven metrics (using first-year commission per policy)
    const costPerPolicy = estPoliciesClosed > 0 ? estMonthlyAdSpend / estPoliciesClosed : 0;
    // earnPerPolicy uses first-year commission (higher for auto-heavy mixes due to ×2 multiplier)
    const earnPerPolicy = firstYearCommPerPolicy;
    const breakevenCloseRate = convRate > 0 && earnPerPolicy > 0
      ? Math.sqrt(avgCPC / (convRate * earnPerPolicy)) * 100
      : 0;
    const breakevenCPC = close * close * convRate * earnPerPolicy;

    const leadsPerDay = targetSubmissions / 30;

    return {
      blendedPremium: Math.round(blendedPremium),
      blendedCommission: blendedCommission.toFixed(1),
      requiredLeads,
      requiredClicks,
      estMonthlyAdSpend,
      estPoliciesClosed,
      estMonthlyCommission,
      monthlyNet,
      firstYearPolicies,
      firstYearGrossCommission,
      firstYearAdSpend,
      firstYearNet,
      firstYearROI,
      firstYearCommPerPolicy,
      costPerPolicy,
      breakevenCloseRate,
      breakevenCPC,
      leadsPerDay,
    };
  }, [targetSubmissions, avgCPC, landingPageConvRate, closeRate, policyMix, commissionMatrix, baseCommission]);

  const totalMix = policyMix.reduce((s, r) => s + r.mixPct, 0);
  const mixValid = Math.abs(totalMix - 100) < 0.01;
  const gapColor = gapTo700 >= 0 ? 'text-green-600' : 'text-red-600';
  const monthlyNetColor = outputs.monthlyNet >= 0 ? 'text-green-600' : 'text-red-600';
  const firstYearNetColor = outputs.firstYearNet >= 0 ? 'text-green-600' : 'text-red-600';
  const firstYearRoiColor = outputs.firstYearROI > 100 ? 'text-green-600' : outputs.firstYearROI >= 0 ? 'text-yellow-600' : 'text-red-600';
  const [showBreakeven, setShowBreakeven] = useState(false);

  return (
    <div className="dark-card">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5" style={{ color: 'var(--qs-info)' }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>Capacity Planning Model</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Current Performance */}
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-3">Current Performance</h3>
          <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
            <StatRow label="Submissions (30d)" value={submissions.toLocaleString()} />
            <StatRow label="Conversion Rate" value={`${conversionRate}%`} />
            <StatRow label="Avg Lead Score" value={avgScore} />
            <StatRow label="Run Rate (monthly)" value={runRate.toLocaleString()} />
            <StatRow label="Projected Monthly" value={projectedMonthly.toLocaleString()} />
            <StatRow
              label="Gap to 700 Target"
              value={gapTo700 >= 0 ? `+${gapTo700}` : `${gapTo700}`}
              highlight={gapColor}
            />
          </div>
        </div>

        {/* Right: Scenario Planner */}
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-3">Scenario Planner</h3>
          <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }} className="mb-4">
            <InputRow
              label="Target Submissions/mo"
              value={targetSubmissions}
              onChange={(v) => onInputChange('targetSubmissions', v)}
              min={0}
              max={10000}
            />
            <InputRow
              label="Avg CPC"
              value={avgCPC}
              onChange={(v) => onInputChange('avgCPC', v)}
              prefix="$"
              min={0}
              step={0.5}
            />
            <InputRow
              label="Landing Page Conv Rate"
              value={landingPageConvRate}
              onChange={(v) => onInputChange('landingPageConvRate', v)}
              suffix="%"
              min={1}
              max={100}
            />
            <InputRow
              label="Close Rate"
              value={closeRate}
              onChange={(v) => onInputChange('closeRate', v)}
              suffix="%"
              min={0}
              max={100}
            />

            {/* Commission Reference (collapsed by default) */}
            <div className="pt-3">
              <CommissionReferenceTable matrix={commissionMatrix} baseCommission={baseCommission} renewalInfo={renewalInfo} />
            </div>

            {/* Policy Mix */}
            <PolicyMixTable
              policyMix={policyMix}
              commissionMatrix={commissionMatrix}
              baseCommission={baseCommission}
              onMixChange={onMixChange}
              onMixAdd={onMixAdd}
              onMixRemove={onMixRemove}
              tierOptions={tierOptions}
              productLines={productLines}
              renewalInfo={renewalInfo}
            />

            {/* Blended summary */}
            <div className="flex items-center justify-between mt-3 pt-2 text-sm" style={{ borderTop: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
              <span>Blended Premium: <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>${outputs.blendedPremium.toLocaleString()}</span></span>
              <span title="Premium-weighted average across your product mix">Blended Commission: <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{outputs.blendedCommission}%</span></span>
            </div>
          </div>

          {/* Projections */}
          <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-3">Projections</h4>

            {/* Monthly Snapshot */}
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-2">Monthly Snapshot</p>
            <StatRow label="Policies Closed/mo" value={outputs.estPoliciesClosed.toLocaleString()} />
            <StatRow
              label="New Business Commission"
              value={`$${outputs.estMonthlyCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatRow
              label="Ad Spend"
              value={`$${outputs.estMonthlyAdSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--qs-text)' }}>Net</span>
              <span className={`text-sm font-bold ${monthlyNetColor}`}>
                {outputs.monthlyNet < 0 ? '(' : ''}${Math.abs(outputs.monthlyNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}{outputs.monthlyNet < 0 ? ')' : ''}
                {outputs.monthlyNet >= 0
                  ? <TrendingUp className="w-4 h-4 inline ml-1 text-green-500" />
                  : <TrendingDown className="w-4 h-4 inline ml-1 text-red-500" />
                }
              </span>
            </div>

            <div className="my-3" style={{ borderTop: '1px solid var(--qs-border)' }} />

            {/* First-Year Projection */}
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-2">
              First-Year Projection
              <span className="text-xs font-normal normal-case ml-1" style={{ color: 'var(--qs-subtle)' }}>(12 months of new business)</span>
            </p>
            <StatRow label="Total Policies Written" value={outputs.firstYearPolicies.toLocaleString()} />
            <StatRow
              label="Gross Commission"
              value={`$${outputs.firstYearGrossCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              highlight="var(--qs-bright)"
            />
            <StatRow
              label="Total Ad Spend"
              value={`$${outputs.firstYearAdSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--qs-text)' }}>Net</span>
              <span className={`text-sm font-bold ${firstYearNetColor}`}>
                {outputs.firstYearNet < 0 ? '(' : ''}${Math.abs(outputs.firstYearNet).toLocaleString(undefined, { maximumFractionDigits: 0 })}{outputs.firstYearNet < 0 ? ')' : ''}
                {outputs.firstYearNet >= 0
                  ? <TrendingUp className="w-4 h-4 inline ml-1 text-green-500" />
                  : <TrendingDown className="w-4 h-4 inline ml-1 text-red-500" />
                }
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium" style={{ color: 'var(--qs-text)' }}>ROI</span>
              <span className={`text-sm font-bold ${firstYearRoiColor}`}>
                {outputs.firstYearROI.toFixed(1)}%
              </span>
            </div>

            {/* Leads per day context */}
            <div className="my-2" style={{ borderTop: '1px solid var(--qs-border)' }} />
            <StatRow label="Leads Per Day" value={outputs.leadsPerDay.toFixed(1)} highlight="text-primary-600" />

            {!mixValid && (
              <p className="text-xs text-red-500 mt-2">
                Mix total is {Math.round(totalMix)}%. Adjust to 100% for accurate projections.
              </p>
            )}

            {/* Breakeven metrics (expandable) */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowBreakeven(!showBreakeven)}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--qs-info)' }}
              >
                Breakeven Analysis
                {showBreakeven ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showBreakeven && (
                <div className="mt-2 rounded p-3" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
                  <StatRow
                    label="Cost Per Policy"
                    value={`$${outputs.costPerPolicy.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <StatRow
                    label="1st-Year Commission/Policy"
                    value={`$${outputs.firstYearCommPerPolicy.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <StatRow
                    label="Breakeven Close Rate"
                    value={outputs.breakevenCloseRate > 0 && outputs.breakevenCloseRate <= 100
                      ? `${outputs.breakevenCloseRate.toFixed(1)}%`
                      : 'N/A'}
                  />
                  <StatRow
                    label="Breakeven CPC"
                    value={outputs.breakevenCPC > 0
                      ? `$${outputs.breakevenCPC.toFixed(2)}`
                      : 'N/A'}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
