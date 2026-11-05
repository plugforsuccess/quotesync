// src/components/MultiVehicleBadge.jsx
// Highlights multi-vehicle / multi-item renewal households. These customers are
// higher-value (more premium, more lines to lose, stickier once retained) and
// are prioritized above single-car renewals, so reps should spot them at a
// glance. Renders nothing for a single item. A neutral chip; 3+ items read in
// the stronger text tone so the biggest households still stand out.

import { NEUTRAL_CHIP } from '../lib/statusChips';

export default function MultiVehicleBadge({ count, product, style }) {
  const n = Number(count) || 1;
  if (n < 2) return null;
  const isAuto = (product || '').toLowerCase().includes('auto');
  const noun = isAuto ? 'cars' : 'items';
  return (
    <span
      title={`${n} ${noun} — multi-vehicle household, prioritized`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 4,
        ...NEUTRAL_CHIP, color: n >= 3 ? 'var(--qs-text)' : 'var(--qs-dim)',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {isAuto ? '🚗' : '📦'} {n} {noun}
    </span>
  );
}
