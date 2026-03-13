// src/pages/components/comp-model/CustomScenarioInput.jsx
// Single integer input with live computed output row.

import { useState, useMemo } from 'react';
import { Calculator } from 'lucide-react';
import { computeScenario } from '../../../utils/compModelCalculations';

function fmt(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function CustomScenarioInput({ config, productMix }) {
  const [itemCount, setItemCount] = useState('');

  const scenario = useMemo(() => {
    const n = parseInt(itemCount, 10);
    if (!config || isNaN(n) || n <= 0) return null;
    return computeScenario(n, config, productMix);
  }, [itemCount, config, productMix]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Custom Scenario</h4>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-gray-600 whitespace-nowrap">Enter monthly item count:</label>
        <input
          type="number"
          min="1"
          value={itemCount}
          onChange={(e) => setItemCount(e.target.value)}
          placeholder="e.g. 22"
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {scenario && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Est. VC Premium</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.vcPremiumMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Agency Commission</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.agencyCommissionMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Total Cost</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.totalCostMonthly)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${scenario.profitMonthly >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500">Profit/Mo</p>
            <p className={`text-sm font-bold ${scenario.profitMonthly >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(scenario.profitMonthly)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">VC Base Comp</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.vcBaseCompMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">TP Bonus</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.tpBonus)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Total Annual Comp</p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.annualComp)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${scenario.profitAnnual >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500">Profit/Yr</p>
            <p className={`text-sm font-bold ${scenario.profitAnnual >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(scenario.profitAnnual)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
