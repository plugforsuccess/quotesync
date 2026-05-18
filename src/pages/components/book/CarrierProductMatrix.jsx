// src/pages/components/book/CarrierProductMatrix.jsx
import { useMemo } from 'react';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', condo: 'Condo', renters: 'Renters',
  landlord: 'Landlord', specialty_auto: 'Spec Auto',
  pup: 'Umbrella', manufactured: 'Mfd Home',
  boat: 'Boat', motor_club: 'Motor Club', other: 'Other',
};

export default function CarrierProductMatrix({ rows, totalPremium }) {
  const { carriers, products, cells } = useMemo(() => {
    const carrierMap = new Map();   // carrier_name → carrier_code
    const productSet = new Set();
    const cellMap = new Map();

    for (const r of rows) {
      carrierMap.set(r.carrier_name, r.carrier_code);
      productSet.add(r.product_key);
      const key = `${r.carrier_name}|${r.product_key}`;
      const existing = cellMap.get(key) || { premium: 0, policies: 0 };
      existing.premium += r.premium;
      existing.policies += r.policies;
      cellMap.set(key, existing);
    }

    return {
      carriers: Array.from(carrierMap.keys()).sort(),
      products: Array.from(productSet).sort(),
      cells: cellMap,
    };
  }, [rows]);

  if (carriers.length === 0) {
    return <div style={{ color: 'var(--qs-subtle)' }}>No data</div>;
  }

  // Color a cell by its share of total premium (heat map)
  const cellColor = (premium) => {
    if (totalPremium === 0 || premium === 0) return 'transparent';
    const share = (premium / totalPremium) * 100;
    if (share >= 25) return 'rgba(239, 68, 68, 0.20)';
    if (share >= 10) return 'rgba(245, 158, 11, 0.18)';
    if (share >= 5)  return 'rgba(59, 130, 246, 0.14)';
    if (share >= 1)  return 'rgba(59, 130, 246, 0.07)';
    return 'transparent';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: 'sticky', left: 0, background: 'var(--qs-card)' }}>
              Carrier ↓ Product →
            </th>
            {products.map(p => (
              <th key={p} style={{ ...thStyle, textAlign: 'right' }}>
                {PRODUCT_LABELS[p] ?? p}
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {carriers.map(carrier => {
            let carrierTotal = 0;
            for (const p of products) {
              const cell = cells.get(`${carrier}|${p}`);
              if (cell) carrierTotal += cell.premium;
            }
            return (
              <tr key={carrier} style={{ borderTop: '1px solid var(--qs-border)' }}>
                <td style={{ ...tdStyle, fontWeight: 600, position: 'sticky', left: 0, background: 'var(--qs-card)' }}>
                  {carrier}
                </td>
                {products.map(p => {
                  const cell = cells.get(`${carrier}|${p}`);
                  const premium = cell?.premium ?? 0;
                  return (
                    <td
                      key={p}
                      style={{
                        ...tdStyle, textAlign: 'right',
                        background: cellColor(premium),
                      }}
                    >
                      {premium > 0 ? (
                        <>
                          <div>${(premium / 1000).toFixed(0)}K</div>
                          <div style={{ fontSize: 11, color: 'var(--qs-dim)' }}>
                            {cell.policies} pol
                          </div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--qs-dim)' }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  ${(carrierTotal / 1000).toFixed(0)}K
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--qs-subtle)', marginTop: 12 }}>
        <LegendSwatch color="rgba(59, 130, 246, 0.07)" label="<5% of book" />
        <LegendSwatch color="rgba(59, 130, 246, 0.14)" label="5–10%" />
        <LegendSwatch color="rgba(245, 158, 11, 0.18)" label="10–25%" />
        <LegendSwatch color="rgba(239, 68, 68, 0.20)" label="≥25%" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 14, background: color, borderRadius: 3, border: '1px solid var(--qs-border)' }} />
      {label}
    </span>
  );
}

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--qs-subtle)', fontWeight: 600,
};
const tdStyle = { padding: '8px 12px', color: 'var(--qs-text)' };
