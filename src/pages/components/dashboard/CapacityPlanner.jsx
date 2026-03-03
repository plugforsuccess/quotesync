// src/pages/components/dashboard/CapacityPlanner.jsx
// Section 4: Capacity Planning Model — current performance + scenario planner

import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Plus, X, CheckCircle, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getCommissionRate } from '../../../lib/commissionUtils';

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
      <div className="hidden md:grid md:grid-cols-[minmax(120px,1fr)_minmax(100px,1fr)_5rem_3.5rem_4rem_1.5rem] gap-1 text-xs font-medium text-gray-500 mb-1 px-1">
        <span>Product Line</span>
        <span>Tier</span>
        <span className="text-right">Premium</span>
        <span className="text-right">Comm %</span>
        <span className="text-right">Mix %</span>
        <span />
      </div>

      {policyMix.map((row, idx) => {
        const commRate = getCommissionRate(row.productLine, row.tier, commissionMatrix, baseCommission);
        return (
          <div key={idx}>
            {/* Desktop row */}
            <div className="hidden md:grid md:grid-cols-[minmax(120px,1fr)_minmax(100px,1fr)_5rem_3.5rem_4rem_1.5rem] gap-1 items-center py-1 border-b border-gray-100">
              {/* Product line select */}
              <select
                value={row.productLine}
                onChange={(e) => onMixChange(idx, 'productLine', e.target.value)}
                className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 truncate focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {productLines.map(pl => (
                  <option key={pl} value={pl}>{pl}</option>
                ))}
              </select>

              {/* Tier select */}
              <select
                value={row.tier}
                onChange={(e) => onMixChange(idx, 'tier', e.target.value)}
                className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 truncate focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              {/* Commission % (read-only, auto-populated) */}
              <span className="text-sm text-right text-gray-600 bg-gray-50 font-medium px-1 py-1 rounded">{commRate}%</span>

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
                disabled={policyMix.length <= 1}
                className={`p-0.5 ${policyMix.length <= 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                title="Remove row"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile stacked row */}
            <div className="md:hidden py-2 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <select
                  value={row.productLine}
                  onChange={(e) => onMixChange(idx, 'productLine', e.target.value)}
                  className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 flex-1 mr-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {productLines.map(pl => (
                    <option key={pl} value={pl}>{pl}</option>
                  ))}
                </select>
                <select
                  value={row.tier}
                  onChange={(e) => onMixChange(idx, 'tier', e.target.value)}
                  className="text-sm text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 flex-1 mr-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {tierOptions.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onMixRemove(idx)}
                  disabled={policyMix.length <= 1}
                  className={`p-0.5 flex-shrink-0 ${policyMix.length <= 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                  title="Remove row"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-0.5">
                  <span className="text-xs text-gray-400">$</span>
                  <input
                    type="number"
                    value={row.avgPremium}
                    onChange={(e) => onMixChange(idx, 'avgPremium', parseFloat(e.target.value) || 0)}
                    min={0}
                    step={100}
                    className="w-20 text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <span className="text-gray-600 bg-gray-50 font-medium px-2 py-1 rounded text-sm">{commRate}%</span>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={row.mixPct}
                    onChange={(e) => onMixChange(idx, 'mixPct', parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="w-14 text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
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

    // Funnel projections
    const requiredLeads = close > 0 ? Math.ceil(targetSubmissions / close) : 0;
    const requiredClicks = convRate > 0 ? Math.ceil(requiredLeads / convRate) : 0;
    const estMonthlyAdSpend = requiredClicks * avgCPC;
    const estPoliciesClosed = Math.round(targetSubmissions * close);
    const estMonthlyPremium = estPoliciesClosed * blendedPremium;
    const estMonthlyCommission = estMonthlyPremium * (blendedCommission / 100);
    const net = estMonthlyCommission - estMonthlyAdSpend;
    const roi = estMonthlyAdSpend > 0 ? (net / estMonthlyAdSpend) * 100 : 0;

    // Breakeven metrics
    const costPerPolicy = estPoliciesClosed > 0 ? estMonthlyAdSpend / estPoliciesClosed : 0;
    const commissionPerPolicy = blendedPremium * (blendedCommission / 100);
    // Breakeven close rate: the close rate where commission = ad spend
    // commission = (targetSubmissions * breakevenClose) * blendedPremium * (blendedCommission/100)
    // adSpend = (targetSubmissions / breakevenClose) / convRate * avgCPC  -- but this creates a complex equation
    // Simpler: at breakeven, costPerPolicy = commissionPerPolicy
    // costPerPolicy = adSpend / policies = (requiredClicks * avgCPC) / policies
    // Since requiredClicks = (targetSubmissions / closeRate) / convRate, and policies = targetSubmissions * closeRate:
    // costPerPolicy = (targetSubmissions * avgCPC) / (closeRate^2 * convRate * targetSubmissions) = avgCPC / (closeRate^2 * convRate)
    // At breakeven: avgCPC / (breakevenClose^2 * convRate) = blendedPremium * blendedCommission/100
    // breakevenClose = sqrt(avgCPC / (convRate * blendedPremium * blendedCommission / 100))
    const earnPerPolicy = blendedPremium * (blendedCommission / 100);
    const breakevenCloseRate = convRate > 0 && earnPerPolicy > 0
      ? Math.sqrt(avgCPC / (convRate * earnPerPolicy)) * 100
      : 0;
    // Breakeven CPC: the max CPC where commission = ad spend at current close rate
    // adSpend = requiredClicks * CPC = ((targetSubs / close) / convRate) * CPC
    // commission = targetSubs * close * earnPerPolicy
    // At breakeven: ((targetSubs / close) / convRate) * CPC = targetSubs * close * earnPerPolicy
    // CPC = close^2 * convRate * earnPerPolicy
    const breakevenCPC = close * close * convRate * earnPerPolicy;

    // Legacy compat for existing display
    const leadsPerDay = targetSubmissions / 30;

    return {
      blendedPremium: Math.round(blendedPremium),
      blendedCommission: blendedCommission.toFixed(1),
      requiredLeads,
      requiredClicks,
      estMonthlyAdSpend,
      estPoliciesClosed,
      estMonthlyPremium,
      estMonthlyCommission,
      net,
      roi,
      costPerPolicy,
      commissionPerPolicy,
      breakevenCloseRate,
      breakevenCPC,
      leadsPerDay,
    };
  }, [targetSubmissions, avgCPC, landingPageConvRate, closeRate, policyMix, commissionMatrix, baseCommission]);

  const totalMix = policyMix.reduce((s, r) => s + r.mixPct, 0);
  const mixValid = Math.abs(totalMix - 100) < 0.01;
  const gapColor = gapTo700 >= 0 ? 'text-green-600' : 'text-red-600';
  const netColor = outputs.net >= 0 ? 'text-green-600' : 'text-red-600';
  const roiColor = outputs.roi > 100 ? 'text-green-600' : outputs.roi >= 0 ? 'text-yellow-600' : 'text-red-600';
  const [showBreakeven, setShowBreakeven] = useState(false);

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
              <span title="Premium-weighted average across your product mix">Blended Commission: <span className="font-semibold text-gray-900">{outputs.blendedCommission}%</span></span>
            </div>
          </div>

          {/* Projections */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Projections</h4>

            {/* Traffic & spend */}
            <StatRow label="Required Leads/mo" value={outputs.requiredLeads.toLocaleString()} />
            <StatRow label="Required Clicks/mo" value={outputs.requiredClicks.toLocaleString()} />
            <StatRow
              label="Est. Ad Spend/mo"
              value={`$${outputs.estMonthlyAdSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />

            <div className="border-t border-gray-200 my-2" />

            {/* Revenue */}
            <StatRow label="Est. Policies Closed/mo" value={outputs.estPoliciesClosed.toLocaleString()} />
            <StatRow
              label="Est. Monthly Premium"
              value={`$${outputs.estMonthlyPremium.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatRow
              label="Est. Monthly Commission"
              value={`$${outputs.estMonthlyCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />

            <div className="border-t border-gray-200 my-2" />

            {/* Bottom line */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Net (Commission - Spend)</span>
              <span className={`text-sm font-bold ${netColor}`}>
                {outputs.net < 0 ? '(' : ''}${Math.abs(outputs.net).toLocaleString(undefined, { maximumFractionDigits: 0 })}{outputs.net < 0 ? ')' : ''}
                {outputs.net >= 0
                  ? <TrendingUp className="w-4 h-4 inline ml-1 text-green-500" />
                  : <TrendingDown className="w-4 h-4 inline ml-1 text-red-500" />
                }
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-gray-700">ROI</span>
              <span className={`text-sm font-bold ${roiColor}`}>
                {outputs.roi.toFixed(1)}%
              </span>
            </div>

            {/* Leads per day context */}
            <div className="border-t border-gray-200 my-2" />
            <StatRow label="Leads Per Day" value={outputs.leadsPerDay.toFixed(1)} highlight="text-blue-600" />

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
                className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                Breakeven Analysis
                {showBreakeven ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showBreakeven && (
                <div className="mt-2 bg-white rounded p-3 border border-gray-200">
                  <StatRow
                    label="Cost Per Policy"
                    value={`$${outputs.costPerPolicy.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <StatRow
                    label="Commission Per Policy"
                    value={`$${outputs.commissionPerPolicy.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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
