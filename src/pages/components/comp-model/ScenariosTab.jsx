// src/pages/components/comp-model/ScenariosTab.jsx
// Tab 2: Preset scenarios, break-even callout, custom scenario, annual comp table.

import { useMemo } from 'react';
import { Target } from 'lucide-react';
import PresetScenariosTable from './PresetScenariosTable';
import CustomScenarioInput from './CustomScenarioInput';
import AnnualCompTable from './AnnualCompTable';
import { calcBreakEven, calcBlendedAvg } from '../../../utils/compModelCalculations';

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function ScenariosTab({ config, productMix }) {
  const breakEven = useMemo(() => {
    if (!config) return null;
    return calcBreakEven(config, productMix);
  }, [config, productMix]);

  const blendedAvg = useMemo(() => calcBlendedAvg(productMix), [productMix]);

  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* Preset Scenarios */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
          Monthly Scenarios
        </h3>
        <PresetScenariosTable config={config} productMix={productMix} />
      </div>

      {/* Break-Even Callout */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <Target className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {breakEven
              ? `Break-even: ~${breakEven} items/month at current blended avg (${formatCurrency(blendedAvg)})`
              : 'Break-even not reached within 200 items/month — review assumptions'}
          </p>
        </div>
      </div>

      {/* Custom Scenario */}
      <CustomScenarioInput config={config} productMix={productMix} />

      {/* Annual Compensation Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <AnnualCompTable config={config} productMix={productMix} />
      </div>
    </div>
  );
}
