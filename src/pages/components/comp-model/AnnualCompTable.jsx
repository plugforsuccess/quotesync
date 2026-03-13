// src/pages/components/comp-model/AnnualCompTable.jsx
// Annual compensation view mirroring the spreadsheet's annual tab.

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

export default function AnnualCompTable({ config, productMix }) {
  const scenarios = useMemo(() => {
    if (!config) return [];
    return PRESET_SCENARIOS.map((s) => ({
      ...s,
      ...computeScenario(s.items, config, productMix),
    }));
  }, [config, productMix]);

  if (!config) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Annual Compensation
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Scenario</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Items/Mo</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Base Salary</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Annual VC Base</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Annual TP Bonus</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Annual Non-VC</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Total Annual Comp</th>
              <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Agency Profit/Yr</th>
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
                <td className="py-2 px-2 text-right text-gray-700">{fmt(s.baseSalaryAnnual)}</td>
                <td className="py-2 px-2 text-right text-gray-700">{fmt(s.vcBaseCompMonthly * 12)}</td>
                <td className="py-2 px-2 text-right text-gray-700">{fmt(s.tpBonus * 12)}</td>
                <td className="py-2 px-2 text-right text-gray-700">{fmt(s.nonVcBonus * 12)}</td>
                <td className="py-2 px-2 text-right font-semibold text-gray-900">{fmt(s.annualComp)}</td>
                <td className={`py-2 pl-2 text-right font-semibold ${s.profitAnnual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(s.profitAnnual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
