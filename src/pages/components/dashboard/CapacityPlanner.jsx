// src/pages/components/dashboard/CapacityPlanner.jsx
// Section 4: Capacity Planning Model — current performance + scenario planner

import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Plus, X, CheckCircle, AlertCircle } from 'lucide-react';

// ─── Helper: look up commission rate from matrix ─────────────────────────────

function getCommissionRate(productLine, tier, matrix, baseRate) {
  const rates = matrix[productLine];
  if (!rates) return baseRate;
  return rates[tier] ?? baseRate;
}

// ─── Reusable rows ──────────────────────────────────────────────────────────

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${highlight || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

function InputRow({ label, value, onChange, prefix, suffix, min, max, step = 1, description }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-600">{label}</label>
        <div className="flex items-center gap-1">
          {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            className="w-24 text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
        </div>
      </div>
      {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
    </div>
  );
}

// ─── Commission Reference Table (collapsible) ───────────────────────────────

const TIER_LABELS = { preferredBundled: 'Pref Bundled', bundled: 'Bundled', monoline: 'Monoline' };

function CommissionReferenceTable({ matrix, baseCommission }) {
  const [open, setOpen] = useState(false);
  const productLines = Object.keys(matrix);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        New Business Commission Schedule
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200">
                <th className="text-left py-1 pr-3 font-medium text-gray-500" />
                {Object.keys(TIER_LABELS).map(k => (
                  <th key={k} className="text-right py-1 px-2 font-medium text-gray-500">
                    {TIER_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productLines.map(pl => (
                <tr key={pl} className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-700 whitespace-nowrap">{pl}</td>
                  {Object.keys(TIER_LABELS).map(tier => (
                    <td key={tier} className="py-1 px-2 text-right text-gray-800 font-medium">
                      {matrix[pl][tier]}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1">Base commission: {baseCommission}%</p>
        </div>
      )}
    </div>
  );
}

// ─── Policy Mix Table ────────────────────────────────────────────────────────

function PolicyMixTable({
  policyMix, commissionMatrix, baseCommission,
  onMixChange, onMixAdd, onMixRemove,
  tierOptions, productLines,
}) {
  const totalMix = policyMix.reduce((s, r) => s + r.mixPct, 0);
  const mixValid = Math.abs(totalMix - 100) < 0.01;

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-gray-700 mb-2">Your Policy Mix</p>

      {/* Desktop header */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_5rem_4rem_5rem_2rem] gap-1 text-xs font-medium text-gray-500 mb-1 px-1">
        <span>Product Line</span>
        <span>Tier</span>
        <span className="text-right">Premium</span>
        <span className="text-right">Comm</span>
        <span className="text-right">Mix %</span>
        <span />
      </div>

      {policyMix.map((row, idx) => {
        const commRate = getCommissionRate(row.productLine, row.tier, commissionMatrix, baseCommission);
        return (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem_4rem_5rem_2rem] gap-1 items-center py-1 border-b border-gray-100"
          >
            {/* Product line select */}
            <select
              value={row.productLine}
              onChange={(e) => onMixChange(idx, 'productLine', e.target.value)}
              className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {productLines.map(pl => (
                <option key={pl} value={pl}>{pl}</option>
              ))}
            </select>

            {/* Tier select */}
            <select
              value={row.tier}
              onChange={(e) => onMixChange(idx, 'tier', e.target.value)}
              className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {tierOptions.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>

            {/* Premium input */}
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-gray-400">$</span>
              <input
                type="number"
                value={row.avgPremium}
                onChange={(e) => onMixChange(idx, 'avgPremium', parseFloat(e.target.value) || 0)}
                min={0}
                step={100}
                className="w-full text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Commission (read-only) */}
            <span className="text-sm text-right text-gray-400 font-medium">{commRate}%</span>

            {/* Mix % input */}
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                value={row.mixPct}
                onChange={(e) => onMixChange(idx, 'mixPct', parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
                className="w-full text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onMixRemove(idx)}
              className="p-0.5 text-gray-400 hover:text-red-500"
              title="Remove row"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      {/* Footer: total + add row */}
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={onMixAdd}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
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
  tierOptions, productLines,
}) {
  if (!kpis) return null;

  const { submissions, conversionRate, avgScore, runRate, projectedMonthly, gapTo700 } = kpis;
  const {
    targetSubmissions, avgCPC, landingPageConvRate,
    closeRate, policyMix, commissionMatrix, baseCommission,
  } = plannerInputs;

  // Computed outputs
  const outputs = useMemo(() => {
    const convRate = landingPageConvRate / 100;
    const close = closeRate / 100;

    // Visitor / ad-spend calculations (unchanged)
    const visitorsNeeded = convRate > 0 ? Math.ceil(targetSubmissions / convRate) : 0;
    const monthlyAdSpend = visitorsNeeded * avgCPC;
    const costPerSubmission = targetSubmissions > 0 ? monthlyAdSpend / targetSubmissions : 0;
    const policiesWritten = Math.round(targetSubmissions * close);
    const leadsPerDay = targetSubmissions / 30;

    // Weighted revenue from policy mix
    const weightedAnnualPerPolicy = policyMix.reduce((sum, row) => {
      const mix = row.mixPct / 100;
      const commRate = getCommissionRate(
        row.productLine, row.tier, commissionMatrix, baseCommission
      ) / 100;
      return sum + (mix * row.avgPremium * commRate);
    }, 0);

    const annualBookValue = policiesWritten * weightedAnnualPerPolicy;
    const monthlyRevenue = annualBookValue / 12;
    const monthlyROI = monthlyAdSpend > 0 ? ((monthlyRevenue - monthlyAdSpend) / monthlyAdSpend) * 100 : 0;

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

    return {
      visitorsNeeded,
      monthlyAdSpend,
      costPerSubmission,
      policiesWritten,
      monthlyRevenue,
      monthlyROI,
      annualBookValue,
      leadsPerDay,
      blendedPremium: Math.round(blendedPremium),
      blendedCommission: blendedCommission.toFixed(1),
    };
  }, [targetSubmissions, avgCPC, landingPageConvRate, closeRate, policyMix, commissionMatrix, baseCommission]);

  const gapColor = gapTo700 >= 0 ? 'text-green-600' : 'text-red-600';
  const roiColor = outputs.monthlyROI >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Capacity Planning Model</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Current Performance */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Current Performance</h3>
          <div className="bg-gray-50 rounded-lg p-4">
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
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Scenario Planner</h3>
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
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
              <CommissionReferenceTable matrix={commissionMatrix} baseCommission={baseCommission} />
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
            />

            {/* Blended summary */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-blue-200 text-sm text-gray-700">
              <span>Blended Premium: <span className="font-semibold text-gray-900">${outputs.blendedPremium.toLocaleString()}</span></span>
              <span>Blended Commission: <span className="font-semibold text-gray-900">{outputs.blendedCommission}%</span></span>
            </div>
          </div>

          {/* Outputs */}
          <div className="bg-gray-50 rounded-lg p-4">
            <StatRow label="Visitors Needed/mo" value={outputs.visitorsNeeded.toLocaleString()} />
            <StatRow label="Monthly Ad Spend" value={`$${outputs.monthlyAdSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} />
            <StatRow label="Cost Per Submission" value={`$${outputs.costPerSubmission.toFixed(2)}`} />
            <StatRow label="Policies Written/mo" value={outputs.policiesWritten.toLocaleString()} />
            <StatRow label="Monthly Revenue" value={`$${outputs.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} />
            <StatRow
              label="Monthly ROI"
              value={`${outputs.monthlyROI.toFixed(1)}%`}
              highlight={roiColor}
            />
            <StatRow
              label="Annual Book Value"
              value={`$${outputs.annualBookValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              highlight="text-blue-600"
            />
            <StatRow
              label="Leads Per Day"
              value={outputs.leadsPerDay.toFixed(1)}
              highlight="text-blue-600 text-base"
            />
            <StatRow label="Blended Premium" value={`$${outputs.blendedPremium.toLocaleString()}`} />
            <StatRow label="Blended Commission" value={`${outputs.blendedCommission}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}
