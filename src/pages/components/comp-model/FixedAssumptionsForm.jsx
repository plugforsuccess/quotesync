// src/pages/components/comp-model/FixedAssumptionsForm.jsx
// Editable form for fixed & rate compensation assumptions.
// Saves via debounced auto-save on field change.

import { useState, useEffect, useRef, useCallback } from 'react';
import { DollarSign, Percent, Hash } from 'lucide-react';

const FIELDS = [
  { key: 'base_salary_annual', label: 'Base Salary (Annual)', type: 'currency', icon: DollarSign },
  { key: 'employer_burden_monthly', label: 'Employer Burden (Monthly)', type: 'currency', icon: DollarSign },
  { key: 'vc_base_comp_pct', label: 'VC Base Comp Rate', type: 'percent', icon: Percent },
  { key: 'vc_commission_rate', label: 'Agency VC Commission Rate', type: 'percent', icon: Percent },
  { key: 'non_vc_bonus_monthly', label: 'Non-VC Bonus (Monthly Est.)', type: 'currency', icon: DollarSign },
  { key: 'tp_band1_threshold', label: 'TP Band 1 Threshold (items)', type: 'integer', icon: Hash },
  { key: 'tp_band1_addon', label: 'TP Band 1 Add-On ($/item)', type: 'currency', icon: DollarSign },
  { key: 'tp_band2_threshold', label: 'TP Band 2 Threshold (items)', type: 'integer', icon: Hash },
  { key: 'tp_band2_addon', label: 'TP Band 2 Add-On ($/item)', type: 'currency', icon: DollarSign },
];

function formatDisplayValue(value, type) {
  const num = Number(value);
  if (isNaN(num)) return '';
  if (type === 'percent') return (num * 100).toFixed(2);
  if (type === 'currency') return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return String(num);
}

function parseInputValue(inputValue, type) {
  const cleaned = String(inputValue).replace(/[,$%]/g, '');
  const num = Number(cleaned);
  if (isNaN(num)) return null;
  if (type === 'percent') return num / 100;
  return num;
}

export default function FixedAssumptionsForm({ config, onUpdate }) {
  const [localValues, setLocalValues] = useState({});
  const [editingField, setEditingField] = useState(null);
  const debounceRef = useRef(null);

  // Sync local state when config changes from server
  useEffect(() => {
    if (!config) return;
    const vals = {};
    FIELDS.forEach((f) => {
      vals[f.key] = config[f.key];
    });
    setLocalValues(vals);
  }, [config]);

  const debouncedSave = useCallback(
    (key, value) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate({ [key]: value });
      }, 800);
    },
    [onUpdate]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (key, rawValue, type) => {
    const parsed = parseInputValue(rawValue, type);
    if (parsed === null) return;

    setLocalValues((prev) => ({ ...prev, [key]: parsed }));
    debouncedSave(key, parsed);
  };

  if (!config) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
        Fixed & Rate Assumptions
      </h3>
      <div className="space-y-3">
        {FIELDS.map((field) => {
          const Icon = field.icon;
          const isEditing = editingField === field.key;
          const rawValue = localValues[field.key];

          return (
            <div key={field.key} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Icon className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">
                  {field.label}
                </label>
                <div className="relative">
                  {field.type === 'currency' && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  )}
                  <input
                    type="text"
                    inputMode={field.type === 'integer' ? 'numeric' : 'decimal'}
                    value={
                      isEditing
                        ? formatDisplayValue(rawValue, field.type)
                        : formatDisplayValue(rawValue, field.type)
                    }
                    onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                    onFocus={() => setEditingField(field.key)}
                    onBlur={() => setEditingField(null)}
                    className={`w-full text-sm border border-gray-200 rounded-lg py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                      field.type === 'currency' ? 'pl-6 pr-3' : field.type === 'percent' ? 'pl-3 pr-6' : 'pl-3 pr-3'
                    }`}
                  />
                  {field.type === 'percent' && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
