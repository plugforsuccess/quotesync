// src/pages/components/rate-checks/DecisionCard.jsx
// Where this rate check goes, per the agency's rules (rate_checks.decision).
// Shows why, what the page already tells us, and what still has to be asked.

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
  const all = Array.isArray(rc.decision_reasons) ? rc.decision_reasons : [];
  const reasons = all.filter(r => r.decision !== 'info' && r.decision !== 'fact');
  const hints = all.filter(r => r.decision === 'info');
  const facts = all.filter(r => r.decision === 'fact');
  const questions = Array.isArray(rc.decision_questions) ? rc.decision_questions : [];

  return (
    <section className="rounded-xl p-5" style={{ ...TONE[d.tone], color: 'var(--qs-bright)' }} aria-label="Routing decision">
      <h3 className="text-xl font-bold leading-tight">{decisionLabel(rc)}</h3>
      <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>From the rules — not an underwriting approval</p>

      {reasons.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--qs-subtle)' }} />
              <span><span className="font-semibold">{r.name}</span>{r.detail && <span style={{ color: 'var(--qs-text)' }}> — {r.detail}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {reasons.length === 0 && <p className="mt-3 text-sm" style={{ color: 'var(--qs-text)' }}>Nothing on the page needs special handling.</p>}

      {hints.map((r, i) => (
        <p key={i} className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}><span className="font-semibold">{r.name}.</span> {r.detail}</p>
      ))}

      {!compact && facts.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>On the page</p>
          <ul className="mt-1.5 space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>
            {facts.flatMap(f => String(f.detail || '').split('; ')).filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {!compact && questions.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>Still to ask</p>
          <ul className="mt-1.5 space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>
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
      title={(rc.decision_reasons || []).filter(r => r.decision !== 'info' && r.decision !== 'fact').map(r => r.name).join(' · ') || undefined}>
      {decisionLabel(rc)}
    </span>
  );
}
