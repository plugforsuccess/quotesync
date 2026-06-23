// src/components/CloserPicker.jsx
// Single-select "Which one sealed it?" — shown when a save had 2+ tactics across
// the case. The rep picks the ONE decisive tactic (the closer) from the tactics
// already on record; it's not re-entry, just attribution. No "all of the above":
// the full set is already captured on the attempts, so the closer's only job is
// the one thing the set can't say — which tactic actually closed it. Selecting
// the active chip again clears it (skip → headline auto-derives upstream).

import { useInterventionTypes } from '../hooks/useInterventionTypes';

export default function CloserPicker({ codes, value, onChange, label, required = false }) {
  const { data: types = [] } = useInterventionTypes();
  if (!codes || codes.length === 0) return null;
  const labelOf = (c) => types.find((t) => t.code === c)?.display_name || c;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)', marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: '#F87171', marginLeft: 2 }}>*</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {codes.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(on ? '' : c)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7,
                cursor: 'pointer', border: '1px solid',
                borderColor: on ? 'var(--qs-success, #10B981)' : 'var(--qs-border)',
                background: on ? 'rgba(16,185,129,0.14)' : 'var(--qs-elevated)',
                color: on ? 'var(--qs-success, #10B981)' : 'var(--qs-dim)',
              }}
            >
              {labelOf(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
