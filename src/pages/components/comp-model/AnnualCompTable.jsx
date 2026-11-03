// src/pages/components/comp-model/AnnualCompTable.jsx
// Annual compensation view mirroring the spreadsheet's annual tab.

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
        <T k="pages.components.compmodel.annualcomptable.c4318c">Annual Compensation</T>
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.54861e">Scenario</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.667841">Items/Mo</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.792e1b">Base Salary</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.479480">Annual VC Base</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.d094e2">Annual TP Bonus</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.a511f7">Annual Non-VC</T></th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.8c23e1">Total Annual Comp</T></th>
              <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"><T k="pages.components.compmodel.annualcomptable.91314e">Agency Profit/Yr</T></th>
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
