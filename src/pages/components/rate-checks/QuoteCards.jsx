// src/pages/components/rate-checks/QuoteCards.jsx
// The payoff on the drawer's quote cards: the goal header (the number to beat,
// how many policies are quoted, what the quotes save so far), the Household card, and the live
// savings line under a price as it's typed. Math lives in quoteMath.js.
//
// Card colours: every quote card has the same neutral border. Colour only carries
// a result: green = they save, amber = Allstate costs more.

import { carrierLabel, policyTypeLabel } from './format';
import { CARD_STYLE, money } from './ui';
import { householdGoal, savings } from './quoteMath';

const tone = (delta) => (delta > 0 ? 'var(--qs-success)' : 'var(--qs-warning)');
const policyName = (p) => [carrierLabel(p), policyTypeLabel(p.policy_type)].filter(Boolean).join(' ') || 'Not read yet';

/** "Beat $9,916/yr · 1 of 2 quoted · Saves $5,660 so far" — a quote saves; nothing is saved until it binds. */
export function GoalHeader({ household }) {
  const g = householdGoal(household);
  if (g.target == null) return null;
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }} aria-label="Quote goal">
      <span>Beat <b style={{ color: 'var(--qs-bright)' }}>{money(g.target)}/yr</b></span>
      <span aria-hidden="true">·</span>
      <span>{g.quoted} of {g.total} quoted</span>
      {g.saved != null && (
        <>
          <span aria-hidden="true">·</span>
          <span style={{ color: tone(g.saved) }} className="font-semibold">
            {g.saved > 0 ? `Saves ${money(g.saved)}/yr so far` : g.saved < 0 ? `${money(-g.saved)} more so far` : 'Even so far'}
          </span>
        </>
      )}
    </p>
  );
}

/** "Saves them $5,660/yr (81%)" as the price is typed. */
export function LiveDelta({ current, price, className = '' }) {
  const s = savings(current, price);
  if (!s) return null;
  return (
    <p className={`text-lg font-extrabold ${className}`} style={{ color: tone(s.delta) }} aria-live="polite">
      {s.delta > 0 ? `Saves them ${money(s.delta)}/yr` : s.delta < 0 ? `${money(-s.delta)}/yr more than they pay` : 'Same as they pay'}
      {s.pct != null && s.delta !== 0 && <span className="font-semibold"> ({Math.abs(s.pct)}%)</span>}
    </p>
  );
}

// Every policy this phone number sent and which one is being worked on. The
// household's savings live in the goal header, not here.
export function HouseholdCard({ rc, household, onSelect }) {
  return (
    <div className="flex grow flex-col rounded-xl p-4" style={CARD_STYLE}>
      <h3 className="text-lg font-bold leading-tight" style={{ color: 'var(--qs-bright)' }}>
        Household <span className="font-medium" style={{ color: 'var(--qs-subtle)' }}>· {household.length} policies</span>
      </h3>
      {/* The rows share whatever height the card has, so it never ends in a blank strip. */}
      <div className="mt-3 flex flex-1 flex-col gap-2" role="tablist" aria-label="Policies in this household">
        {household.map(p => {
          const active = p.id === rc.id;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={active} onClick={() => onSelect?.(p)}
              className={`flex min-h-[64px] w-full flex-1 flex-col justify-center gap-1 rounded-xl px-4 py-3 text-left ${active ? 'bg-primary-600 text-white' : ''}`}
              style={active ? undefined : { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
              {active && <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">Working on</span>}
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-bold leading-tight">{policyName(p)}</span>
                {p.annual_premium != null && <span className="shrink-0 text-lg font-bold tabular-nums leading-tight">{money(p.annual_premium)}<span className={`text-sm font-medium ${active ? 'opacity-80' : ''}`} style={active ? undefined : { color: 'var(--qs-subtle)' }}>/yr</span></span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
