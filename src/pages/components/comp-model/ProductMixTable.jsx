// src/pages/components/comp-model/ProductMixTable.jsx
// Editable product mix table with live blended average and mix % validation.
// Supports add/remove product rows with auto-save.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { calcBlendedAvg, calcMixPctTotal } from '../../../utils/compModelCalculations';

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function ProductMixTable({ productMix, carrierName, onSave }) {
  const [rows, setRows] = useState([]);
  const debounceRef = useRef(null);

  // Sync from props
  useEffect(() => {
    if (productMix) {
      setRows(productMix.map((p) => ({ ...p })));
    }
  }, [productMix]);

  const debouncedSave = useCallback(
    (updatedRows) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSave(updatedRows);
      }, 800);
    },
    [onSave]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateRow = (index, field, rawValue) => {
    const updated = rows.map((r, i) => {
      if (i !== index) return r;
      let value = rawValue;
      if (field === 'mix_pct') {
        value = Number(String(rawValue).replace('%', '')) / 100;
        if (isNaN(value)) return r;
      } else if (field === 'avg_prem_item') {
        value = Number(String(rawValue).replace(/[$,]/g, ''));
        if (isNaN(value)) return r;
      }
      return { ...r, [field]: value };
    });
    setRows(updated);
    debouncedSave(updated);
  };

  const addRow = () => {
    const updated = [...rows, { product_name: '', mix_pct: 0, avg_prem_item: 0, sort_order: rows.length }];
    setRows(updated);
  };

  const removeRow = (index) => {
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
    debouncedSave(updated);
  };

  const mixTotal = calcMixPctTotal(rows);
  const mixValid = Math.abs(mixTotal - 1.0) < 0.001;
  const blendedAvg = calcBlendedAvg(rows);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Product Mix
        </h3>
        {carrierName && (
          <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
            {carrierName}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-2 text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">% of VC Items</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Avg Premium</th>
              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Weighted Avg</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const weightedAvg = (Number(row.mix_pct) || 0) * (Number(row.avg_prem_item) || 0);
              return (
                <tr key={idx} className="group">
                  <td className="py-1.5 pr-2">
                    <input
                      type="text"
                      value={row.product_name || ''}
                      onChange={(e) => updateRow(idx, 'product_name', e.target.value)}
                      placeholder="Product name"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={((Number(row.mix_pct) || 0) * 100).toFixed(0)}
                        onChange={(e) => updateRow(idx, 'mix_pct', e.target.value)}
                        className="w-20 ml-auto block text-right border border-gray-200 rounded px-2 py-1 pr-6 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={Number(row.avg_prem_item) || ''}
                        onChange={(e) => updateRow(idx, 'avg_prem_item', e.target.value)}
                        className="w-24 ml-auto block text-right border border-gray-200 rounded pl-5 pr-2 py-1 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-600 font-medium">
                    {formatCurrency(weightedAvg)}
                  </td>
                  <td className="py-1.5 pl-1">
                    <button
                      onClick={() => removeRow(idx)}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td className="py-2 pr-2 text-xs font-bold text-gray-700 uppercase">Total</td>
              <td className="py-2 px-2 text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    mixValid ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {mixValid ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  {(mixTotal * 100).toFixed(0)}%
                </span>
              </td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        onClick={addRow}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Product
      </button>

      <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-100">
        <p className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-0.5">
          Blended Avg VC Premium / Item
        </p>
        <p className="text-2xl font-bold text-primary-900">
          {formatCurrency(blendedAvg)}
        </p>
      </div>
    </div>
  );
}
