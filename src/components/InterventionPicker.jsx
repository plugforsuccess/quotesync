// src/components/InterventionPicker.jsx
// Captures WHAT happened on a reached call: the save tactic when we kept them,
// or — when `includeLoss` is set — the reason we couldn't. Joins later to
// premium change + outcome to build the retention-elasticity model.
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
// popover.

import { useInterventionTypes } from '../hooks/useInterventionTypes';
import { EMPTY_INTERVENTION } from '../lib/interventions';

// `context` ('cancel' | 'renewal') scopes the chips: cancel-only tactics (paid
// past due, reinstated) never show on a renewal call and vice-versa. Types
// tagged `applies_to: 'all'` show everywhere. `filter` is an optional predicate
// for finer rules (e.g. only "Reinstated" once the policy has cancelled).
// `includeLoss` adds the "couldn't save — why" reasons — used on the call-log
// surface (a reached call can end in a loss), not when recording a save.
export default function InterventionPicker({ value, onChange, context, filter, required = false, includeLoss = false }) {
  const { data: allTypes = [] } = useInterventionTypes();
  const base = allTypes
    .filter((t) => !t.applies_to || t.applies_to === 'all' || t.applies_to === context)
    .filter((t) => !filter || filter(t));
  const saveTypes = base.filter((t) => !t.is_loss_reason);
  const lossTypes = includeLoss ? base.filter((t) => t.is_loss_reason) : [];
  const visibleTypes = [...saveTypes, ...lossTypes];

  const v = value || EMPTY_INTERVENTION;
  const selected = v.interventions || [];

  const toggle = (code) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange({ ...v, interventions: next });
  };

  // Show the extra structured fields only when a selected chip asks for them.
  const selectedTypes = visibleTypes.filter((t) => selected.includes(t.code));
  const showPremium = selectedTypes.some((t) => t.captures_premium);
  const showCompetitor = selectedTypes.some((t) => t.captures_competitor);

  if (visibleTypes.length === 0) return null;

  const chip = (t, loss) => {
    const on = selected.includes(t.code);
    const onColor = loss ? 'var(--qs-warn, #F59E0B)' : 'var(--qs-success, #10B981)';
    const onBg = loss ? 'rgba(245,158,11,0.14)' : 'rgba(16,185,129,0.14)';
    return (
      <button
        key={t.code}
        type="button"
        title={t.description || ''}
        onClick={() => toggle(t.code)}
        style={{
          fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7,
          cursor: 'pointer', border: '1px solid',
          borderColor: on ? onColor : 'var(--qs-border)',
          background: on ? onBg : 'var(--qs-elevated)',
          color: on ? onColor : 'var(--qs-dim)',
        }}
      >
        {t.display_name}
      </button>
    );
  };

  const groupLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)', margin: '2px 0 6px' }}>{text}</div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)', marginBottom: 8 }}>
        {includeLoss ? 'What happened on this call?' : 'What did you do to save them?'}{' '}
        {required
          ? <span style={{ fontWeight: 700, color: '#F87171' }} title="required">*</span>
          : <span style={{ fontWeight: 400 }}>(optional)</span>}
      </div>

      {/* Save tactics */}
      {includeLoss && lossTypes.length > 0 && groupLabel('Saved them by')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: lossTypes.length > 0 ? 10 : (showPremium || showCompetitor ? 12 : 0) }}>
        {saveTypes.map((t) => chip(t, false))}
      </div>

      {/* Loss reasons — only on the call-log surface */}
      {lossTypes.length > 0 && (
        <>
          {groupLabel("Couldn't save — why")}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showPremium || showCompetitor ? 12 : 0 }}>
            {lossTypes.map((t) => chip(t, true))}
          </div>
        </>
      )}

      {/* Offered premium — re-quote / bundle / company-transfer style tactics */}
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

      {/* Competitor detail — churn intel when the customer was shopping. Both
          fields are optional: customers don't always share who or how much. */}
      {showCompetitor && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            className="dark-input"
            placeholder="Competitor, if named (e.g. Geico)"
            value={v.competitorName}
            onChange={(e) => onChange({ ...v, competitorName: e.target.value })}
            style={{ fontSize: 14, padding: '9px 12px', flex: 1, boxSizing: 'border-box' }}
          />
          <input
            type="number"
            inputMode="decimal"
            className="dark-input"
            placeholder="Their quote ($), if shared"
            value={v.competitorQuote}
            onChange={(e) => onChange({ ...v, competitorQuote: e.target.value })}
            style={{ fontSize: 14, padding: '9px 12px', flex: 1, boxSizing: 'border-box' }}
          />
        </div>
      )}
    </div>
  );
}
