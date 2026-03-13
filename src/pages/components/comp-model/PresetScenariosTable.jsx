// src/pages/components/comp-model/PresetScenariosTable.jsx
// Displays preset scenario rows with all computed output columns.

import { useMemo } from 'react';
import { PRESET_SCENARIOS, computeScenario } from '../../../utils/compModelCalculations';

function fmt(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function PresetScenariosTable({ config, productMix }) {
  const scenarios = useMemo(() => {
    if (!config) return [];
    return PRESET_SCENARIOS.map((s) => ({
      ...s,
      ...computeScenario(s.items, config, productMix),
    }));
  }, [config, productMix]);

  if (!config) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Scenario</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Items/Mo</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Est. VC Premium</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Agency Commission</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">VC Base Comp</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">TP Bonus</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Non-VC Bonus</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Total Cost</th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Profit/Mo</th>
            <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Profit/Yr</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {scenarios.map((s) => (
            <tr
              key={s.name}
              className={s.isTarget ? 'bg-blue-50/50' : 'hover:bg-gray-50'}
            >
              <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">
                {s.name}
                {s.isTarget && <span className="ml-1 text-blue-500">&#9733;</span>}
              </td>
              <td className="py-2 px-2 text-right text-gray-700">{s.items}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.vcPremiumMonthly)}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.agencyCommissionMonthly)}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.vcBaseCompMonthly)}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.tpBonus)}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.nonVcBonus)}</td>
              <td className="py-2 px-2 text-right text-gray-700">{fmt(s.totalCostMonthly)}</td>
              <td className={`py-2 px-2 text-right font-semibold ${s.profitMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s.profitMonthly)}
              </td>
              <td className={`py-2 pl-2 text-right font-semibold ${s.profitAnnual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s.profitAnnual)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
