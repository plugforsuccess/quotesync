// src/pages/components/comp-model/ActualsSummaryCard.jsx
// Displays actual compensation computed from real revenue_entries for a selected month.

import { useMemo } from 'react';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { tpBonus, fixedCostMonthly } from '../../../utils/compModelCalculations';

function fmt(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function SummaryRow({ label, value, highlight }) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'font-semibold' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${
        highlight && value < 0 ? 'text-red-600' :
        highlight && value >= 0 ? 'text-green-600' :
        'text-gray-900'
      }`}>
        {fmt(value)}
      </span>
    </div>
  );
}

export default function ActualsSummaryCard({
  entries,
  vcProductKeys,
  config,
  unattributedCount,
  monthLabel,
}) {
  const actuals = useMemo(() => {
    if (!config || !entries || !vcProductKeys) return null;

    // vcProductKeys comes from agency_products.is_vc_eligible = true
    // Includes: auto, specialty_auto, ho, condo, renters, landlord, pup, boat, manufactured
    const vcEntries = entries.filter((e) => vcProductKeys.includes(e.product));
    const actualVcPrem = vcEntries.reduce((s, e) => s + e.premium, 0);
    const actualVcItems = vcEntries.reduce((s, e) => s + e.itemCount, 0);
    const actualVcComp = actualVcPrem * (Number(config.vc_base_comp_pct) || 0);
    const actualTp = tpBonus(actualVcItems, config);
    const actualNonVc = Number(config.non_vc_bonus_monthly) || 0;
    const actualVarComp = actualVcComp + actualTp + actualNonVc;
    const actualBaseMo = (Number(config.base_salary_annual) || 0) / 12;
    const actualTotalMo = actualBaseMo + actualVarComp;
    const actualCommission = actualVcPrem * (Number(config.vc_commission_rate) || 0);
    const fixed = fixedCostMonthly(config);
    const actualProfit = actualCommission - (fixed + actualVcComp + actualTp + actualNonVc);

    return {
      vcItems: actualVcItems,
      vcPremium: actualVcPrem,
      vcComp: actualVcComp,
      tpBonus: actualTp,
      nonVcBonus: actualNonVc,
      varComp: actualVarComp,
      baseMo: actualBaseMo,
      totalMo: actualTotalMo,
      commission: actualCommission,
      profit: actualProfit,
    };
  }, [entries, vcProductKeys, config]);

  if (!config) return null;

  // Empty state
  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No entries found</h3>
        <p className="text-sm text-gray-500">
          No entries found for this producer in {monthLabel}. Upload the NB file to calculate actuals.
        </p>
      </div>
    );
  }

  if (!actuals) return null;

  return (
    <div className="space-y-4">
      {/* Unattributed warning */}
      {unattributedCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            <strong>{unattributedCount}</strong> {unattributedCount === 1 ? 'entry' : 'entries'} this month
            {unattributedCount === 1 ? ' has' : ' have'} no producer attribution and {unattributedCount === 1 ? 'is' : 'are'} excluded.
            Re-upload the NB file to resolve.
          </p>
        </div>
      )}

      {/* Summary card */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
          Actuals — {monthLabel}
        </h3>

        <div className="divide-y divide-gray-100">
          <SummaryRow label="VC Items Bound" value={actuals.vcItems} />
          <SummaryRow label="Written VC Premium" value={actuals.vcPremium} />
          <div className="border-t border-gray-200 mt-1 pt-1" />
          <SummaryRow label={`VC Base Comp (${((Number(config.vc_base_comp_pct) || 0) * 100).toFixed(0)}%)`} value={actuals.vcComp} />
          <SummaryRow label="TP Volume Bonus" value={actuals.tpBonus} />
          <SummaryRow label="Non-VC Bonus" value={actuals.nonVcBonus} />
          <SummaryRow label="Total Variable Comp" value={actuals.varComp} highlight />
          <div className="border-t border-gray-200 mt-1 pt-1" />
          <SummaryRow label="Base Salary (monthly)" value={actuals.baseMo} />
          <SummaryRow label="Total Monthly Comp" value={actuals.totalMo} highlight />
          <div className="border-t border-gray-200 mt-1 pt-1" />
          <SummaryRow label="Agency Commission" value={actuals.commission} />
          <SummaryRow label="Agency Profit (Mo)" value={actuals.profit} highlight />
        </div>
      </div>
    </div>
  );
}
