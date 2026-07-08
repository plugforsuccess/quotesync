// src/components/InterventionPicker.jsx
// Captures WHAT happened on a reached call: the save tactic(s) when we kept them,
// a single loss reason when we didn't, or a neutral "no decision yet" when
// nothing was resolved. Single source of truth for the moat dataset.
//
// Selection rules (enforced here so a call can't contradict itself):
//   • Save tactics  — multi-select (you can do several things to save them).
//   • Loss reason   — single-select, and clears any save/neutral selection.
//   • No decision   — single-select, and clears everything else.
// So a call is EITHER one-or-more saves, OR one loss, OR one "no decision".
//
// value = {
//   interventions: string[], offeredPremium, competitorName, competitorQuote, discountNote
// }

import { useInterventionTypes } from '../hooks/useInterventionTypes';
import { EMPTY_INTERVENTION, HAPPY_CODES } from '../lib/interventions';

// `includeLoss` adds the "couldn't save — why" reasons and the neutral
// "no decision" option — used on the call-log surface (a reached call can end in
// a loss or a non-event), not when recording a save outcome.
// Fixed "$" inside the money inputs so a typed value still reads as a premium.
const dollarAdornment = {
  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--qs-dim)', fontSize: 14, pointerEvents: 'none',
};

export default function InterventionPicker({ value, onChange, context, filter, required = false, includeLoss = false }) {
  const { data: allTypes = [] } = useInterventionTypes();
  const base = allTypes
    .filter((t) => !t.applies_to || t.applies_to === 'all' || t.applies_to === context)
    .filter((t) => !filter || filter(t));
  const saveTypes = base.filter((t) => !t.is_loss_reason && !t.is_neutral);
  // "Happy with policy" is stored is_neutral but is a positive confirmation, so
  // it gets its own group rather than sitting under "No decision".
  const happyTypes = includeLoss ? base.filter((t) => HAPPY_CODES.has(t.code)) : [];
  const neutralTypes = includeLoss ? base.filter((t) => t.is_neutral && !HAPPY_CODES.has(t.code)) : [];
  const lossTypes = includeLoss ? base.filter((t) => t.is_loss_reason) : [];
  const visibleTypes = [...saveTypes, ...happyTypes, ...neutralTypes, ...lossTypes];

  const v = value || EMPTY_INTERVENTION;
  const selected = v.interventions || [];
  const isSave = (code) => saveTypes.some((t) => t.code === code);

  const toggle = (code, kind) => {
    let next;
    if (kind === 'save') {
      // Multi-select among save tactics; clears any loss/neutral selection.
      const saves = selected.filter(isSave);
      next = saves.includes(code) ? saves.filter((c) => c !== code) : [...saves, code];
    } else {
      // Loss / neutral are single-select and exclusive of everything else.
      next = selected.includes(code) ? [] : [code];
    }
    onChange({ ...v, interventions: next });
  };

  // Show the extra structured fields only when a selected chip asks for them.
  const selectedTypes = visibleTypes.filter((t) => selected.includes(t.code));
  const showPremium = selectedTypes.some((t) => t.captures_premium);
  const showCompetitor = selectedTypes.some((t) => t.captures_competitor);

  if (visibleTypes.length === 0) return null;

  const chip = (t, kind) => {
    const on = selected.includes(t.code);
    const palette = kind === 'loss'
      ? { c: 'var(--qs-warn, #F59E0B)', bg: 'rgba(245,158,11,0.14)' }
      : kind === 'neutral'
      ? { c: '#9CA3AF', bg: 'rgba(156,163,175,0.16)' }
      : { c: 'var(--qs-success, #10B981)', bg: 'rgba(16,185,129,0.14)' };
    return (
      <button
        key={t.code}
        type="button"
        title={t.description || ''}
        onClick={() => toggle(t.code, kind)}
        style={{
          fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7,
          cursor: 'pointer', border: '1px solid',
          borderColor: on ? palette.c : 'var(--qs-border)',
          background: on ? palette.bg : 'var(--qs-elevated)',
          color: on ? palette.c : 'var(--qs-dim)',
        }}
      >
        {t.display_name}
      </button>
    );
  };

  const groupLabel = (text, hint) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)', margin: '2px 0 6px' }}>
      {text}
      {hint && <span style={{ fontWeight: 400, fontStyle: 'italic' }}> · {hint}</span>}
    </div>
  );
  const chipRow = (types, kind, mb) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: mb }}>
      {types.map((t) => chip(t, kind))}
    </div>
  );
  const grouped = happyTypes.length > 0 || neutralTypes.length > 0 || lossTypes.length > 0;
  const tailMb = showPremium || showCompetitor ? 12 : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)', marginBottom: 8 }}>
        {includeLoss ? 'What happened on this call?' : 'What did you do to save them?'}{' '}
        {required
          ? <span style={{ fontWeight: 700, color: '#F87171' }} title="required">*</span>
          : <span style={{ fontWeight: 400 }}>(optional)</span>}
      </div>

      {/* Save tactics (multi-select) */}
      {grouped && groupLabel('Saved them by', 'select all that apply')}
      {chipRow(saveTypes, 'save', grouped ? 10 : tailMb)}

      {/* Happy with policy — positive, but not a save */}
      {happyTypes.length > 0 && (
        <>
          {groupLabel('Renewing — no save needed')}
          {chipRow(happyTypes, 'neutral', 10)}
        </>
      )}

      {/* Neutral — reached, nothing resolved */}
      {neutralTypes.length > 0 && (
        <>
          {groupLabel('No decision')}
          {chipRow(neutralTypes, 'neutral', 10)}
        </>
      )}

      {/* Loss reasons (single-select) */}
      {lossTypes.length > 0 && (
        <>
          {groupLabel("Couldn't save — why", 'pick one')}
          {chipRow(lossTypes, 'loss', tailMb)}
        </>
      )}

      {/* Offered premium — re-quote / bundle / competitor-match style tactics.
          Captured here because it's the only place the LOST quote can ever be
          recorded (a save writes saved_premium at close; a loss writes nothing).
          On the save path it pre-fills the close screen, so this is typed once. */}
      {showPremium && (
        <>
          <div style={{ position: 'relative', marginBottom: 2 }}>
            <span style={dollarAdornment}>$</span>
            <input
              type="number"
              inputMode="decimal"
              className="dark-input"
              placeholder="Premium quoted on this call — required"
              value={v.offeredPremium}
              onChange={(e) => onChange({ ...v, offeredPremium: e.target.value })}
              style={{ fontSize: 14, padding: '9px 12px 9px 26px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginBottom: 8 }}>
            Kept even if the call ends lost — it's the price that didn't save them (Offers report).
            On a save it pre-fills the close screen, so you won't retype it.
          </div>
        </>
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
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={dollarAdornment}>$</span>
            <input
              type="number"
              inputMode="decimal"
              className="dark-input"
              placeholder="Their quote, if shared"
              value={v.competitorQuote}
              onChange={(e) => onChange({ ...v, competitorQuote: e.target.value })}
              style={{ fontSize: 14, padding: '9px 12px 9px 26px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
