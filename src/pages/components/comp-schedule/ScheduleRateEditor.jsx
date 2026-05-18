// src/pages/components/comp-schedule/ScheduleRateEditor.jsx
import { useState, useEffect, useMemo } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useScheduleRates,
  useSaveScheduleRates,
} from '../../../hooks/useCompSchedules';
import {
  useAgencyProducts,
  useAgencyTiers,
} from '../../../hooks/useAgencyConfig';

// DEFAULT_RATES_GA_2026: Hardcoded GA-2026 baseline for placeholder display.
// Total decimal rates from the seeded agency_commission_rates in
// supabase/migrations/20260312300000_agency_config_layer.sql.
const DEFAULT_RATES_GA_2026 = {
  auto:    { preferred: 0.25, bundled: 0.20, monoline: 0.15 },
  ho:      { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  renters: { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  other:   { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
};

export default function ScheduleRateEditor({ scheduleId }) {
  const { currentAgencyId } = useAuth();
  const { data: rates, isLoading: ratesLoading } = useScheduleRates(scheduleId);
  const { data: products = [] } = useAgencyProducts(currentAgencyId);
  const { data: tiers = [] } = useAgencyTiers(currentAgencyId);
  const saveRates = useSaveScheduleRates();

  // Local edit state: { [product_key]: { [tier_key]: stringPercent } }
  // Stored as percentage strings (e.g. "16.00") for editing; converted on save.
  const [edits, setEdits] = useState({});
  const [errors, setErrors] = useState({});
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (rates) {
      const initial = {};
      for (const [productKey, tierMap] of Object.entries(rates)) {
        initial[productKey] = {};
        for (const [tierKey, rate] of Object.entries(tierMap)) {
          initial[productKey][tierKey] = (rate * 100).toFixed(2);
        }
      }
      setEdits(initial);
    }
  }, [rates]);

  const visibleProducts = useMemo(
    () => products.filter(p => p.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [products]
  );
  const visibleTiers = useMemo(
    () => [...tiers].sort((a, b) => a.sort_order - b.sort_order),
    [tiers]
  );

  const handleCellChange = (productKey, tierKey, value) => {
    setEdits(prev => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [tierKey]: value },
    }));
    const errKey = `${productKey}-${tierKey}`;
    if (errors[errKey]) {
      setErrors(prev => ({ ...prev, [errKey]: undefined }));
    }
  };

  const validate = () => {
    const e = {};
    for (const productKey of Object.keys(edits)) {
      for (const tierKey of Object.keys(edits[productKey] || {})) {
        const raw = edits[productKey][tierKey];
        if (raw === '' || raw === null || raw === undefined) continue;
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0 || num > 100) {
          e[`${productKey}-${tierKey}`] = 'Must be 0 < x ≤ 100';
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSavedToast(false);

    const ratesArray = [];
    for (const productKey of Object.keys(edits)) {
      for (const tierKey of Object.keys(edits[productKey] || {})) {
        const raw = edits[productKey][tierKey];
        if (raw === '' || raw === null || raw === undefined) continue;
        ratesArray.push({
          product_key: productKey,
          tier_key:    tierKey,
          rate:        Number(raw) / 100,
        });
      }
    }

    try {
      await saveRates.mutateAsync({
        scheduleId,
        agencyId: currentAgencyId,
        rates: ratesArray,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (err) {
      setErrors(prev => ({ ...prev, submit: err.message ?? 'Save failed' }));
    }
  };

  if (ratesLoading) {
    return <div className="text-sm text-[var(--qs-subtle)] py-4">Loading rates…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--qs-text)]">Commission Rates</h3>
        <div className="flex items-center gap-3">
          {savedToast && (
            <span className="text-xs text-[var(--qs-success)]">Saved.</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveRates.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--qs-info)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} />
            {saveRates.isPending ? 'Saving…' : 'Save Rates'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs uppercase text-[var(--qs-subtle)]">
              <th className="text-left px-2 py-2 font-medium">Product</th>
              {visibleTiers.map(t => (
                <th key={t.tier_key} className="text-right px-2 py-2 font-medium">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map(p => (
              <tr key={p.product_key} className="border-t border-[var(--qs-border)]">
                <td className="px-2 py-2 text-[var(--qs-text)]">{p.label}</td>
                {visibleTiers.map(t => {
                  const value = edits[p.product_key]?.[t.tier_key] ?? '';
                  const errKey = `${p.product_key}-${t.tier_key}`;
                  const defaultRate = DEFAULT_RATES_GA_2026[p.product_key]?.[t.tier_key];
                  const placeholderText = defaultRate != null
                    ? `${(defaultRate * 100).toFixed(2)} (default)`
                    : '—';
                  return (
                    <td key={t.tier_key} className="px-2 py-1">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={value}
                          onChange={(e) => handleCellChange(p.product_key, t.tier_key, e.target.value)}
                          placeholder={placeholderText}
                          style={{
                            width: 96, textAlign: 'right',
                            padding: '4px 8px',
                            background: 'var(--qs-elevated)',
                            border: `1px solid ${errors[errKey] ? 'var(--qs-danger)' : 'var(--qs-border)'}`,
                            borderRadius: 6,
                            color: 'var(--qs-text)',
                            fontSize: 13,
                            outline: 'none',
                          }}
                        />
                        <span className="text-[var(--qs-dim)] text-xs">%</span>
                      </div>
                      {errors[errKey] && (
                        <p className="text-[10px] text-[var(--qs-danger)] mt-0.5 text-right">
                          {errors[errKey]}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errors.submit && (
        <div className="flex items-start gap-2 text-sm text-[var(--qs-danger)]">
          <AlertCircle size={14} />
          {errors.submit}
        </div>
      )}

      <p className="text-xs text-[var(--qs-dim)]">
        Leave a cell blank to use the carrier's base commission floor for that product/tier.
        Inactive products are hidden — configure products in Agency Settings.
      </p>
    </div>
  );
}
