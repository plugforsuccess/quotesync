// src/components/MultiVehicleBadge.jsx
// Highlights multi-vehicle / multi-item renewal households. These customers are
// higher-value (more premium, more lines to lose, stickier once retained) and
// are prioritized above single-car renewals, so reps should spot them at a
// glance. Renders nothing for a single item. 2 = blue, 3+ = amber (the biggest
// households stand out).

export default function MultiVehicleBadge({ count, product, style }) {
  const n = Number(count) || 1;
  if (n < 2) return null;
  const isAuto = (product || '').toLowerCase().includes('auto');
  const noun = isAuto ? 'cars' : 'items';
  const color = n >= 3 ? '#F59E0B' : '#3B82F6';
  return (
    <span
      title={`${n} ${noun} — multi-vehicle household, prioritized`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 4,
        background: `${color}1a`, border: `1px solid ${color}55`, color,
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {isAuto ? '🚗' : '📦'} {n} {noun}
    </span>
  );
}
