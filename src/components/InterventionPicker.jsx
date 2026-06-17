// src/components/InterventionPicker.jsx
// Captures WHAT the agent did to save the customer (the save tactic), so it can
// later be joined to premium change + outcome to build the retention-elasticity
// model. Controlled component — see `value` shape below.
//
// value = {
//   interventions: string[],     // intervention_types.code[]
//   offeredPremium:  string|number|'',
//   competitorName:  string,
//   competitorQuote: string|number|'',
//   discountNote:    string,
// }
//
// Styled with the app's --qs-* CSS vars so it blends into the dark log-call
// popover. Optional by design — never blocks saving.

import { useInterventionTypes } from '../hooks/useInterventionTypes';
import { EMPTY_INTERVENTION } from '../lib/interventions';

// `context` ('cancel' | 'renewal') scopes the tactic chips: cancel-only tactics
// (paid past due, reinstated) never show on a renewal call and vice-versa.
// Types tagged `applies_to: 'all'` show everywhere.
export default function InterventionPicker({ value, onChange, context }) {
  const { data: allTypes = [] } = useInterventionTypes();
  const types = allTypes.filter(
    (t) => !t.applies_to || t.applies_to === 'all' || t.applies_to === context
  );
  const v = value || EMPTY_INTERVENTION;
  const selected = v.interventions || [];

  const toggle = (code) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange({ ...v, interventions: next });
  };

  // Show the extra structured fields only when a selected tactic asks for them.
  const selectedTypes = types.filter((t) => selected.includes(t.code));
  const showPremium = selectedTypes.some((t) => t.captures_premium);
  const showCompetitor = selectedTypes.some((t) => t.captures_competitor);

  if (types.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)', marginBottom: 8 }}>
        What did you do to save them? <span style={{ fontWeight: 400 }}>(optional)</span>
      </div>

      {/* Tactic chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showPremium || showCompetitor ? 12 : 0 }}>
        {types.map((t) => {
          const on = selected.includes(t.code);
          return (
            <button
              key={t.code}
              type="button"
              title={t.description || ''}
              onClick={() => toggle(t.code)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7,
                cursor: 'pointer', border: '1px solid',
                borderColor: on ? 'var(--qs-success, #10B981)' : 'var(--qs-border)',
                background: on ? 'rgba(16,185,129,0.14)' : 'var(--qs-elevated)',
                color: on ? 'var(--qs-success, #10B981)' : 'var(--qs-dim)',
              }}
            >
              {t.display_name}
            </button>
          );
        })}
      </div>

      {/* Offered premium — for re-quote / bundle / competitor-match tactics */}
      {showPremium && (
        <input
          type="number"
          inputMode="decimal"
          className="dark-input"
          placeholder="Premium you quoted them ($)"
          value={v.offeredPremium}
          onChange={(e) => onChange({ ...v, offeredPremium: e.target.value })}
          style={{ marginBottom: 8, fontSize: 14, padding: '9px 12px', width: '100%', boxSizing: 'border-box' }}
        />
      )}

      {/* Competitor detail — when matching a competitor quote */}
      {showCompetitor && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            className="dark-input"
            placeholder="Competitor (e.g. Geico)"
            value={v.competitorName}
            onChange={(e) => onChange({ ...v, competitorName: e.target.value })}
            style={{ fontSize: 14, padding: '9px 12px', flex: 1, boxSizing: 'border-box' }}
          />
          <input
            type="number"
            inputMode="decimal"
            className="dark-input"
            placeholder="Their quote ($)"
            value={v.competitorQuote}
            onChange={(e) => onChange({ ...v, competitorQuote: e.target.value })}
            style={{ fontSize: 14, padding: '9px 12px', flex: 1, boxSizing: 'border-box' }}
          />
        </div>
      )}
    </div>
  );
}
