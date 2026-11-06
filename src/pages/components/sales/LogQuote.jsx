// Sales workspace, step 2: log the Allstate quote the producer ran in Allstate's system.
// One rate per policy, for that policy's term (6-month auto, 12-month home), compared
// with what they pay now; the household total decides the result. Logging saves the
// rate on each rate check: the database marks it a win or a loss, adds the quote to the
// producer's numbers and moves the lead to Quoted. Nothing is texted from here.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { carrierLabel, policyTypeLabel } from '../rate-checks/format';
import { money } from '../rate-checks/ui';
import { parseMoney, sanitizeMoneyInput } from '../../../lib/money';
import { useLogHouseholdQuote } from '../../../hooks/useRateChecks';
import { quoteResult } from './quoteResult';

const termOf = (rc) => (Number(rc.term_months) === 6 ? 6 : 12);
const termWord = (t) => (t === 6 ? '6-month' : '12-month');
const annualFromTerm = (rate, t) => Math.round(rate * (12 / t) * 100) / 100;

const TONE = {
  saves: { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' },
  same: { color: 'var(--qs-bright)', background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' },
  more: { color: 'var(--qs-danger)', background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)' },
};

function ResultLine({ r, size = 'text-base' }) {
  if (!r) return null;
  return (
    <span className={`${size} font-bold tabular-nums`} style={{ color: TONE[r.kind].color }}>
      {r.kind === 'saves' && <><T k="sales.log.saves">Saves</T> {money(r.diff)}<T k="sales.log.peryear">/yr</T></>}
      {r.kind === 'same' && <T k="sales.log.same">About the same</T>}
      {r.kind === 'more' && <>{money(-r.diff)}<T k="sales.log.peryear">/yr</T> <T k="sales.log.more">more</T></>}
    </span>
  );
}

export default function LogQuote({ household, onLogged }) {
  const policies = household.filter(rc => rc.status !== 'declined');
  const [rates, setRates] = useState(() => Object.fromEntries(policies.map(rc => {
    const t = termOf(rc);
    return [rc.id, rc.allstate_premium != null ? String(Math.round(rc.allstate_premium * t / 12 * 100) / 100) : ''];
  })));
  const log = useLogHouseholdQuote();

  const rows = policies.map(rc => {
    const t = termOf(rc);
    const rate = parseMoney(rates[rc.id]);
    const currentTerm = rc.current_premium != null ? Number(rc.current_premium) : (rc.annual_premium != null ? Number(rc.annual_premium) * t / 12 : null);
    return { rc, t, rate: rate > 0 ? rate : null, currentTerm, result: quoteResult(rc.annual_premium, rate > 0 ? annualFromTerm(rate, t) : null) };
  });
  const filled = rows.filter(r => r.rate != null);
  const total = useMemo(() => {
    const cur = filled.reduce((s, r) => s + (Number(r.rc.annual_premium) || 0), 0);
    const all = filled.reduce((s, r) => s + annualFromTerm(r.rate, r.t), 0);
    return { cur, all, result: quoteResult(cur, all) };
  }, [filled]);

  const submit = (e) => {
    e.preventDefault();
    if (!filled.length) return;
    log.mutate(filled.map(r => ({ id: r.rc.id, allstatePremium: annualFromTerm(r.rate, r.t) })), {
      onSuccess: () => onLogged?.({ result: total.result, total }),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.log.title">Log the Allstate Quote</T></h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.log.line">Run it in Allstate, then type each policy’s rate for its term. Leave a policy blank if you didn’t quote it.</T></p>
      </div>

      <ul className="space-y-3">
        {rows.map(({ rc, t, currentTerm, result }) => (
          <li key={rc.id} className="rounded-xl p-4" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
            <p className="font-bold" style={{ color: 'var(--qs-bright)' }}>{carrierLabel(rc) || <T k="sales.log.policy">Policy</T>} <T>{policyTypeLabel(rc.policy_type)}</T></p>
            <p className="mt-0.5 text-sm tabular-nums" style={{ color: 'var(--qs-subtle)' }}>
              <T k="sales.log.paysnow">Pays now</T> <b style={{ color: 'var(--qs-bright)' }}>{currentTerm != null ? money(currentTerm) : '—'}</b> {t === 6 ? <T k="sales.log.every6">every 6 months</T> : <T k="sales.log.every12">a year</T>}
            </p>
            <label className="mt-3 block text-sm font-semibold" htmlFor={`rate-${rc.id}`} style={{ color: 'var(--qs-bright)' }}>
              <T k="sales.log.allstate">Allstate</T> <T>{termWord(t)}</T> <T k="sales.log.rate">Rate</T>
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--qs-subtle)' }}>$</span>
                <input id={`rate-${rc.id}`} inputMode="decimal" value={rates[rc.id]} placeholder="0"
                  onChange={(e) => setRates(m => ({ ...m, [rc.id]: sanitizeMoneyInput(e.target.value) }))}
                  className="w-full rounded-lg py-3 pl-7 pr-3 text-lg font-semibold tabular-nums"
                  style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }} />
              </div>
              <span className="w-32 shrink-0 text-right"><ResultLine r={result} /></span>
            </div>
          </li>
        ))}
      </ul>

      {/* The household total decides the result and the text that follows. */}
      <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={total.result ? TONE[total.result.kind] : TONE.same}>
        <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>
          <T k="sales.log.household">Household</T> · {money(total.all)}<T k="sales.log.peryear">/yr</T> <T k="sales.log.vs">vs</T> {money(total.cur)}
        </span>
        {total.result ? <ResultLine r={total.result} size="text-lg" /> : <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.log.enter">Enter a rate</T></span>}
      </div>

      {log.isError && <p className="text-sm text-red-600" role="alert">{log.error.message}</p>}
      <button type="submit" disabled={!filled.length || log.isPending}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {log.isPending ? <T k="sales.log.saving">Logging…</T> : <><Check className="h-5 w-5" aria-hidden="true" /> <T k="sales.log.button">Log Quote</T></>}
      </button>
    </form>
  );
}
