// src/pages/components/comp-model/CustomScenarioInput.jsx
// Single integer input with live computed output row.

import { T } from '../../../components/SiteCopy';
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
        <Calculator className="w-4 h-4 text-primary-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide"><T k="pages.components.compmodel.customscenarioinput.6af46a">Custom Scenario</T></h4>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-gray-600 whitespace-nowrap"><T k="pages.components.compmodel.customscenarioinput.671cf8">Enter monthly item count:</T></label>
        <input
          type="number"
          min="1"
          value={itemCount}
          onChange={(e) => setItemCount(e.target.value)}
          placeholder="e.g. 22"
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {scenario && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.d07f1e">Est. VC Premium</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.vcPremiumMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.19e15f">Agency Commission</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.agencyCommissionMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.50e91d">Total Cost</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.totalCostMonthly)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${scenario.profitMonthly >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.25bafe">Profit/Mo</T></p>
            <p className={`text-sm font-bold ${scenario.profitMonthly >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(scenario.profitMonthly)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.426a5e">VC Base Comp</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.vcBaseCompMonthly)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.fee220">TP Bonus</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.tpBonus)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.8c23e1">Total Annual Comp</T></p>
            <p className="text-sm font-bold text-gray-900">{fmt(scenario.annualComp)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${scenario.profitAnnual >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-xs text-gray-500"><T k="pages.components.compmodel.customscenarioinput.014d51">Profit/Yr</T></p>
            <p className={`text-sm font-bold ${scenario.profitAnnual >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(scenario.profitAnnual)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
