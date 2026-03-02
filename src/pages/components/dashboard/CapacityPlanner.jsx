// src/pages/components/dashboard/CapacityPlanner.jsx
// Section 4: Capacity Planning Model — current performance + scenario planner

import { useMemo } from 'react';
import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';

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
            className="w-24 text-right text-sm font-semibold border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
        </div>
      </div>
      {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
    </div>
  );
}

export default function CapacityPlanner({ kpis, plannerInputs, onInputChange }) {
  if (!kpis) return null;

  const { submissions, conversionRate, avgScore, runRate, projectedMonthly, gapTo700 } = kpis;
  const {
    targetSubmissions, avgCPC, landingPageConvRate,
    closeRate, avgPremium, commissionRate,
  } = plannerInputs;

  // Computed outputs
  const outputs = useMemo(() => {
    const convRate = landingPageConvRate / 100;
    const close = closeRate / 100;
    const commission = commissionRate / 100;

    const visitorsNeeded = convRate > 0 ? Math.ceil(targetSubmissions / convRate) : 0;
    const monthlyAdSpend = visitorsNeeded * avgCPC;
    const costPerSubmission = targetSubmissions > 0 ? monthlyAdSpend / targetSubmissions : 0;
    const policiesWritten = Math.round(targetSubmissions * close);
    const monthlyRevenue = (policiesWritten * avgPremium * commission) / 12;
    const monthlyROI = monthlyAdSpend > 0 ? ((monthlyRevenue - monthlyAdSpend) / monthlyAdSpend) * 100 : 0;
    const annualBookValue = policiesWritten * avgPremium * commission;
    const leadsPerDay = targetSubmissions / 30;

    return {
      visitorsNeeded,
      monthlyAdSpend,
      costPerSubmission,
      policiesWritten,
      monthlyRevenue,
      monthlyROI,
      annualBookValue,
      leadsPerDay,
    };
  }, [targetSubmissions, avgCPC, landingPageConvRate, closeRate, avgPremium, commissionRate]);

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
            <InputRow
              label="Avg Annual Premium"
              value={avgPremium}
              onChange={(v) => onInputChange('avgPremium', v)}
              prefix="$"
              min={0}
              step={100}
            />
            <InputRow
              label="Commission Rate"
              value={commissionRate}
              onChange={(v) => onInputChange('commissionRate', v)}
              suffix="%"
              min={0}
              max={100}
            />
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
          </div>
        </div>
      </div>
    </div>
  );
}
