// src/pages/components/comp-model/PresetScenariosTable.jsx
// Displays preset scenario rows with all computed output columns.

import { T } from '../../../components/SiteCopy';
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
            <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.54861e">Scenario</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.667841">Items/Mo</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.d07f1e">Est. VC Premium</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.19e15f">Agency Commission</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.426a5e">VC Base Comp</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.fee220">TP Bonus</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.6833bf">Non-VC Bonus</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.50e91d">Total Cost</T></th>
            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.25bafe">Profit/Mo</T></th>
            <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.presetscenariostable.014d51">Profit/Yr</T></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {scenarios.map((s) => (
            <tr
              key={s.name}
              className={s.isTarget ? 'bg-primary-50/50' : 'hover:bg-gray-50'}
            >
              <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">
                {s.name}
                {s.isTarget && <span className="ml-1 text-primary-500">&#9733;</span>}
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
