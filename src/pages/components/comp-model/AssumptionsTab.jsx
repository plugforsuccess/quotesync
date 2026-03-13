// src/pages/components/comp-model/AssumptionsTab.jsx
// Tab 1: Side-by-side layout of FixedAssumptionsForm + ProductMixTable.

import FixedAssumptionsForm from './FixedAssumptionsForm';
import ProductMixTable from './ProductMixTable';

export default function AssumptionsTab({ config, productMix, carrierName, onUpdateConfig, onSaveProductMix }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — Fixed & Rate Assumptions */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <FixedAssumptionsForm config={config} onUpdate={onUpdateConfig} />
      </div>

      {/* Right — Product Mix */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <ProductMixTable
          productMix={productMix}
          carrierName={carrierName}
          onSave={onSaveProductMix}
        />
      </div>
    </div>
  );
}
