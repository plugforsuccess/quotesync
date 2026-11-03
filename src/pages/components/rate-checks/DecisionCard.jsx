// src/pages/components/rate-checks/DecisionCard.jsx
// Where this rate check goes, per the agency's rules (rate_checks.decision).
// Leads with what to do next, then why, and the questions still to ask — answered right on the card (rate_checks.intake_answers).

import { useState } from 'react';
import { Check } from 'lucide-react';
import { DECISION, decisionLabel } from './format';
import { vehicleQuestions } from './policyView';
import { CARD_STYLE } from './ui';
import { useUpdateRateCheck } from '../../../hooks/useRateChecks';
import { T } from '../../../components/SiteCopy';

const PILL = {
  success: { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' },
  info:    { color: 'var(--qs-info)', background: 'var(--qs-info-subtle)', border: '1px solid var(--qs-info-border)' },
  warning: { color: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' },
  neutral: { color: 'var(--qs-subtle)', background: 'var(--qs-card)', border: '1px solid var(--qs-border)' },
};

// The rules' PUP hints, turned into the action they call for. Each line is editable
// on the page (Edit copy); the key is the hint it answers.
const ACTIONS = [
  [/home liability is under \$300k/i, 'home_limit', 'Quote the home at $300k liability, then add a PUP', 'Auto liability already qualifies. A $300k home limit makes the household PUP-eligible, so quote the umbrella with it.'],
  [/get their home dec page/i, 'home_page', 'Get the home dec page, then add a PUP', 'Auto liability already qualifies. The PUP also needs the home at $300k liability, so get that page and quote it.'],
  [/auto liability is under 250\/500/i, 'auto_limit', 'Quote the auto at 250/500 liability, then add a PUP', 'Home liability already qualifies. Auto at 250/500 makes the household PUP-eligible, so quote the umbrella with it.'],
  [/get their auto dec page/i, 'auto_page', 'Get the auto dec page, then add a PUP', 'Home liability already qualifies. The PUP also needs auto liability at 250/500, so get that page and quote it.'],
];
function actionFor(hint) {
  const hit = ACTIONS.find(([re]) => re.test(hint?.detail || ''));
  return hit ? { key: hit[1], headline: hit[2], why: hit[3] } : null;
}

export default function DecisionCard({ rc, household = null, compact = false }) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  const all = Array.isArray(rc.decision_reasons) ? rc.decision_reasons : [];
  const reasons = all.filter(r => r.decision !== 'info' && r.decision !== 'fact');
  const hints = all.filter(r => r.decision === 'info');
  // The rules' questions, plus what only the producer can find out (loan payoff year per financed car).
  const questions = [...(Array.isArray(rc.decision_questions) ? rc.decision_questions : []), ...vehicleQuestions(rc)];
  // Lead with an action when a hint calls for one; the rest stay as notes.
  const actionIdx = hints.findIndex(h => actionFor(h));
  const action = actionIdx >= 0 ? actionFor(hints[actionIdx]) : null;
  const notes = hints.filter((_, i) => i !== actionIdx);

  return (
    <section className="flex h-full flex-col rounded-xl p-4" style={{ ...CARD_STYLE, color: 'var(--qs-bright)' }} aria-label="Routing decision">
      {action ? (
        <>
          {/* "(+PUP)": the umbrella isn't unlocked yet; the action below gets it there. */}
          <span className="self-start rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={PILL[d.tone]}>{decisionLabel(rc, household)}{/PUP/.test(decisionLabel(rc, household) || '') ? '' : ' (+PUP)'}</span>
          <h3 className="mt-2 text-lg font-bold leading-snug"><T k={`rc.decision.${action.key}.headline`}>{action.headline}</T></h3>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k={`rc.decision.${action.key}.why`}>{action.why}</T></p>
        </>
      ) : (
        <h3 className="text-xl font-bold leading-tight" style={{ color: PILL[d.tone].color === 'var(--qs-subtle)' ? undefined : PILL[d.tone].color }}>{decisionLabel(rc, household)}</h3>
      )}

      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--qs-subtle)' }} />
              <span><span className="font-semibold">{r.name}</span>{r.detail && <span style={{ color: 'var(--qs-text)' }}> — {r.detail}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {reasons.length === 0 && !action && notes.length === 0 && <p className="mt-1 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.decisioncard.33aaed">Nothing on the page needs special handling.</T></p>}

      {notes.map((r, i) => (
        <p key={i} className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}><span className="font-semibold">{r.name}.</span> {r.detail}</p>
      ))}

      {!compact && questions.length > 0 && <StillToAsk rc={rc} questions={questions} />}
    </section>
  );
}

// ── Still to ask: Yes/No (with details on Yes) or a payoff year, saved as answered ──

const isPayoff = (q) => /^loan payoff year/i.test(q);
const answered = (a) => a?.answer != null && a.answer !== '';

function StillToAsk({ rc, questions }) {
  const update = useUpdateRateCheck();
  const [answers, setAnswers] = useState(() => (rc.intake_answers && typeof rc.intake_answers === 'object' ? rc.intake_answers : {}));
  const [error, setError] = useState('');
  const save = (q, patch) => {
    const next = { ...answers, [q]: { ...answers[q], ...patch, at: new Date().toISOString() } };
    setAnswers(next);
    setError('');
    update.mutate({ id: rc.id, updates: { intake_answers: next } }, { onError: (err) => setError(err.message) });
  };
  const done = questions.every(q => answered(answers[q]));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.decisioncard.af77ad">Still to ask</T></p>
        {done && <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--qs-success)' }}><Check className="h-3.5 w-3.5" aria-hidden="true" /> <T k="pages.components.ratechecks.decisioncard.e4b516">All info collected</T></span>}
      </div>
      <ul className="mt-1.5 space-y-2">
        {questions.map(q => <Question key={q} q={q} a={answers[q]} onSave={(patch) => save(q, patch)} />)}
      </ul>
      {error && <p className="mt-1 text-xs text-red-500" role="alert"><T k="pages.components.ratechecks.decisioncard.da1a84">Couldn't save:</T> {error}</p>}
    </div>
  );
}

function Question({ q, a, onSave }) {
  const [open, setOpen] = useState(!answered(a));
  const [details, setDetails] = useState(a?.details || '');
  const isDone = answered(a);
  const label = isPayoff(q) ? q.replace(/^loan payoff year for the /i, 'Loan Payoff — ') : q;

  if (isDone && !open) {
    const shown = a.answer === 'yes' ? `Yes${a.details ? ` — ${a.details}` : ''}` : a.answer === 'no' ? 'No' : a.answer;
    return (
      <li>
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-start gap-2 text-left text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--qs-success)' }} aria-hidden="true" />
          <span className="min-w-0"><span style={{ color: 'var(--qs-subtle)' }}>{label}:</span> <b>{shown}</b></span>
        </button>
      </li>
    );
  }

  const thisYear = new Date().getFullYear();
  const pick = (patch) => { onSave(patch); if (patch.answer !== 'yes') setOpen(false); };
  return (
    <li className="rounded-lg p-2.5" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
      <p className="text-sm" style={{ color: 'var(--qs-text)' }}>{label}</p>
      {isPayoff(q) ? (
        <select aria-label={label} value={a?.answer || ''} onChange={e => pick({ answer: e.target.value })}
          className="dark-select mt-2 w-full rounded-md px-2 py-2 text-sm" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
          <option value="">Choose a year</option>
          {Array.from({ length: 8 }, (_, i) => thisYear + i).map(y => <option key={y} value={String(y)}>{y}</option>)}
          <option value="Paid off">Paid off</option>
          <option value="Not sure">Not sure</option>
        </select>
      ) : (
        <>
          <div className="mt-2 flex gap-2" role="group" aria-label={label}>
            {['yes', 'no'].map(v => (
              <button key={v} type="button" aria-pressed={a?.answer === v} onClick={() => pick({ answer: v, ...(v === 'no' ? { details: null } : {}) })}
                className={`h-9 flex-1 rounded-md text-sm font-semibold ${a?.answer === v ? 'bg-primary-600 text-white' : ''}`}
                style={a?.answer === v ? undefined : { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                {v === 'yes' ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          {a?.answer === 'yes' && (
            <div className="mt-2 flex gap-2">
              <input value={details} onChange={e => setDetails(e.target.value)} placeholder="What and when"
                aria-label={`${label}: details`} className="min-w-0 flex-1 rounded-md px-2 py-2 text-sm"
                style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }} />
              <button type="button" onClick={() => { onSave({ details: details.trim() || null }); setOpen(false); }}
                className="rounded-md bg-primary-600 px-3 text-sm font-semibold text-white"><T k="pages.components.ratechecks.decisioncard.f92965">Done</T></button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function DecisionChip({ rc, policies = null }) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${d.cls}`}
      title={(rc.decision_reasons || []).filter(r => r.decision !== 'info' && r.decision !== 'fact').map(r => r.name).join(' · ') || undefined}>
      {decisionLabel(rc, policies)}
    </span>
  );
}
