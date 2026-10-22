// src/pages/components/rate-checks/DecisionCard.jsx
// Where this rate check goes, per the agency's rules (rate_checks.decision).
// Shows why, and what the dec page can't tell us so the producer asks first.

import { DECISION, decisionLabel } from './format';

const TONE = {
  success: { background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' },
  info:    { background: 'var(--qs-info-subtle)',    border: '1px solid var(--qs-info-border)' },
  warning: { background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' },
  neutral: { background: 'var(--qs-elevated)',       border: '1px solid var(--qs-border)' },
};

export default function DecisionCard({ rc, compact = false }) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  const reasons = Array.isArray(rc.decision_reasons) ? rc.decision_reasons : [];
  const questions = Array.isArray(rc.decision_questions) ? rc.decision_questions : [];
  // The umbrella prompt rides on an Allstate quote; show it as a reason line.
  const umbrella = rc.decision === 'quote_allstate_umbrella';

  return (
    <section className="rounded-xl p-4" style={{ ...TONE[d.tone], color: 'var(--qs-bright)' }} aria-label="Routing decision">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-bold">{decisionLabel(rc)}</h3>
        <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>From the rules — not an underwriting approval</span>
      </div>

      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" style={{ color: 'var(--qs-subtle)' }}>•</span>
              <span>
                <span className="font-medium">{r.name}</span>
                {r.detail && <span style={{ color: 'var(--qs-text)' }}> — {r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {reasons.length === 0 && !umbrella && (
        <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>Nothing on the page trips a rule.</p>
      )}

      {!compact && questions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>Ask before quoting</p>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2" style={{ color: 'var(--qs-text)' }}>
            {questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export function DecisionChip({ rc }) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${d.cls}`}
      title={(rc.decision_reasons || []).map(r => r.name).join(' · ') || undefined}>
      {decisionLabel(rc)}
    </span>
  );
}
