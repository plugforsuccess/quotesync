// Sales workspace, step 4: close it out. Bound (what was written), a follow-up date,
// or lost (why). Each one moves the lead: bound → Won, lost → Lost; a follow-up keeps
// it open and brings it back up on that day.
import { useState } from 'react';
import { CalendarClock, Check, ShieldCheck, X } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { policyTypeLabel } from '../rate-checks/format';
import { money } from '../rate-checks/ui';
import { parseMoney, sanitizeMoneyInput } from '../../../lib/money';
import { LABEL, LOST, bundleTypeFor } from '../../../lib/sales';
import { useBindHousehold, useLogBind, useScheduleFollowUp, useLoseHousehold } from '../../../hooks/useSales';

const termOf = (rc) => (Number(rc.term_months) === 6 ? 6 : 12);
const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };
const card = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };

function Choice({ on, onClick, icon: Icon, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-sm font-bold ${on ? 'bg-primary-600 text-white' : ''}`}
      style={on ? undefined : { ...card, color: 'var(--qs-bright)' }}>
      <Icon className="h-5 w-5" aria-hidden="true" /> {children}
    </button>
  );
}

// Marks a card as the Allstate policy being written.
function AllstateMark() {
  return (
    <span className="inline-flex h-9 shrink-0 items-center rounded-lg bg-white px-1.5" style={{ border: '1px solid var(--qs-border)' }}>
      <img src="/logos/carriers/allstate.jpg" alt="Allstate" className="h-7 w-auto" />
    </span>
  );
}

function Done({ children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }} role="status">
      <p className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--qs-bright)' }}><Check className="h-5 w-5" aria-hidden="true" /> {children}</p>
    </div>
  );
}

function Bound({ household, leadId }) {
  const quoted = household.filter(rc => rc.allstate_premium != null || rc.status === 'won');
  const list = quoted.length ? quoted : household;
  const [rows, setRows] = useState(() => Object.fromEntries(list.map(rc => [rc.id, {
    on: true,
    premium: rc.allstate_premium != null ? String(Math.round(rc.allstate_premium * termOf(rc) / 12 * 100) / 100) : '',
    policy: '', // the new Allstate policy's number, not the one they're leaving
  }])));
  const bind = useBindHousehold();
  const set = (id, k, v) => setRows(m => ({ ...m, [id]: { ...m[id], [k]: v } }));
  const picked = list.filter(rc => rows[rc.id].on);
  const ok = picked.length && picked.every(rc => parseMoney(rows[rc.id].premium) > 0);
  if (bind.isSuccess) return <Done><T k="sales.close.bound-done">Bound. The lead is closed as Won and the bind counts on your scorecard.</T></Done>;
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!ok) return;
      bind.mutate({ leadId, rows: picked.map(rc => ({ id: rc.id, annualPremium: Math.round(parseMoney(rows[rc.id].premium) * (12 / termOf(rc)) * 100) / 100, policyNumber: rows[rc.id].policy.trim() || null })) });
    }}>
      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.close.bound-line">Check what you wrote in Allstate and the premium they paid for its term.</T></p>
      {list.map(rc => {
        const r = rows[rc.id];
        const t = termOf(rc);
        return (
          <div key={rc.id} className="rounded-xl p-4" style={{ ...card, opacity: r.on ? 1 : 0.6 }}>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 font-bold" style={{ color: 'var(--qs-bright)' }}>
                <input type="checkbox" checked={r.on} onChange={e => set(rc.id, 'on', e.target.checked)} className="h-5 w-5 accent-[#2563EB]" />
                <T>{`${policyTypeLabel(rc.policy_type)} New Business`}</T>
              </label>
              <AllstateMark />
            </div>
            {r.on && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold" style={{ color: 'var(--qs-bright)' }}>
                  <T k="sales.close.premium">Premium</T> ({t === 6 ? <T k="sales.close.6mo">6 Months</T> : <T k="sales.close.12mo">12 Months</T>})
                  <span className="relative mt-1 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>$</span>
                    <input inputMode="decimal" value={r.premium} onChange={e => set(rc.id, 'premium', sanitizeMoneyInput(e.target.value))}
                      aria-label={`${policyTypeLabel(rc.policy_type)} bound premium`} className="w-full rounded-lg py-2.5 pl-7 pr-2 text-base font-semibold tabular-nums" style={field} />
                  </span>
                </label>
                <label className="block text-xs font-semibold" style={{ color: 'var(--qs-bright)' }}>
                  <T k="sales.close.policy">Policy Number</T> <span style={{ color: 'var(--qs-subtle)' }}>· <T k="sales.close.optional">Optional</T></span>
                  <input value={r.policy} onChange={e => set(rc.id, 'policy', e.target.value)} maxLength={40}
                    aria-label={`${policyTypeLabel(rc.policy_type)} policy number`} className="mt-1 w-full rounded-lg px-3 py-2.5 text-base" style={field} />
                </label>
              </div>
            )}
          </div>
        );
      })}
      {bind.isError && <p className="text-sm text-red-600" role="alert">{bind.error.message}</p>}
      <button type="submit" disabled={!ok || bind.isPending} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:opacity-50">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" /> {bind.isPending ? <T k="sales.close.saving">Saving…</T> : <><T k="sales.close.mark-bound">Mark Bound</T> · {picked.length} {picked.length === 1 ? <T k="sales.close.policy-1">Policy</T> : <T k="sales.close.policies">Policies</T>}</>}
      </button>
    </form>
  );
}

// A lead with no uploaded policy (a winback): what was written, from the saved quote.
function LeadBound({ lead, agencyId, openQuote }) {
  const list = (openQuote?.lines || []).map((l, i) => ({ key: `${l.product}-${i}`, product: l.product, term: Number(l.term_months) === 6 ? 6 : 12, premium: l.premium }));
  const [rows, setRows] = useState(() => Object.fromEntries(list.map(l => [l.key, { on: true, premium: l.premium != null ? String(l.premium) : '', policy: '' }])));
  const bind = useLogBind();
  const set = (k, f, v) => setRows(m => ({ ...m, [k]: { ...m[k], [f]: v } }));
  const picked = list.filter(l => rows[l.key]?.on);
  const ok = picked.length && picked.every(l => parseMoney(rows[l.key].premium) > 0);
  if (bind.isSuccess) return <Done><T k="sales.close.bound-done">Bound. The lead is closed as Won and the bind counts on your scorecard.</T></Done>;
  if (!list.length) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.close.quote-first">Save the quote first; Bound is filled in from it.</T></p>;
  const cars = Math.max(1, Number(lead.vehicle_count) || 1);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!ok) return;
      const lines = picked.map(l => ({ product: l.product, items: l.product === 'auto' ? cars : 1, premium: rows[l.key].premium, term_months: l.term, policy_number: rows[l.key].policy }));
      bind.mutate({ agencyId, lead, quoteId: openQuote.id, lines, bundleType: bundleTypeFor(lines.map(l => l.product)), bundleOverridden: false });
    }}>
      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.close.bound-line">Check what you wrote in Allstate and the premium they paid for its term.</T></p>
      {list.map(l => {
        const r = rows[l.key];
        const label = LABEL[l.product] || l.product;
        return (
          <div key={l.key} className="rounded-xl p-4" style={{ ...card, opacity: r.on ? 1 : 0.6 }}>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 font-bold" style={{ color: 'var(--qs-bright)' }}>
                <input type="checkbox" checked={r.on} onChange={e => set(l.key, 'on', e.target.checked)} className="h-5 w-5 accent-[#2563EB]" />
                <T>{`${label} New Business`}</T>
              </label>
              <AllstateMark />
            </div>
            {r.on && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold" style={{ color: 'var(--qs-bright)' }}>
                  <T k="sales.close.premium">Premium</T> ({l.term === 6 ? <T k="sales.close.6mo">6 Months</T> : <T k="sales.close.12mo">12 Months</T>})
                  <span className="relative mt-1 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>$</span>
                    <input inputMode="decimal" value={r.premium} onChange={e => set(l.key, 'premium', sanitizeMoneyInput(e.target.value))}
                      aria-label={`${label} bound premium`} className="w-full rounded-lg py-2.5 pl-7 pr-2 text-base font-semibold tabular-nums" style={field} />
                  </span>
                </label>
                <label className="block text-xs font-semibold" style={{ color: 'var(--qs-bright)' }}>
                  <T k="sales.close.policy">Policy Number</T> <span style={{ color: 'var(--qs-subtle)' }}>· <T k="sales.close.optional">Optional</T></span>
                  <input value={r.policy} onChange={e => set(l.key, 'policy', e.target.value)} maxLength={40}
                    aria-label={`${label} policy number`} className="mt-1 w-full rounded-lg px-3 py-2.5 text-base" style={field} />
                </label>
              </div>
            )}
          </div>
        );
      })}
      {bind.isError && <p className="text-sm text-red-600" role="alert">{bind.error.message}</p>}
      <button type="submit" disabled={!ok || bind.isPending} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:opacity-50">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" /> {bind.isPending ? <T k="sales.close.saving">Saving…</T> : <><T k="sales.close.mark-bound">Mark Bound</T> · {picked.length} {picked.length === 1 ? <T k="sales.close.policy-1">Policy</T> : <T k="sales.close.policies">Policies</T>}</>}
      </button>
    </form>
  );
}

const tomorrowAt10 = () => {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function FollowUp({ leadId, withNote = true }) {
  const [at, setAt] = useState(tomorrowAt10);
  const [note, setNote] = useState('');
  const follow = useScheduleFollowUp();
  if (follow.isSuccess) {
    return <Done><T k="sales.close.follow-done">Follow-up set for</T> {new Date(at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</Done>;
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (at) follow.mutate({ leadId, at: new Date(at).toISOString(), note }); }}>
      <label className="block text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>
        <T k="sales.close.when">Call Them Back</T>
        <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-base" style={field} />
      </label>
      {withNote && <label className="block text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>
        <T k="sales.close.why">Note</T> <span style={{ color: 'var(--qs-subtle)' }}>· <T k="sales.close.optional">Optional</T></span>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="e.g. Wants to talk to spouse first"
          className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-base" style={field} />
      </label>}
      {follow.isError && <p className="text-sm text-red-600" role="alert">{follow.error.message}</p>}
      <button type="submit" disabled={!at || follow.isPending} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:opacity-50">
        <CalendarClock className="h-5 w-5" aria-hidden="true" /> {follow.isPending ? <T k="sales.close.saving">Saving…</T> : <T k="sales.close.set-follow">Set Follow-Up</T>}
      </button>
    </form>
  );
}

function Lost({ leadId }) {
  const [reason, setReason] = useState(null);
  const lose = useLoseHousehold();
  if (lose.isSuccess) return <Done><T k="sales.close.lost-done">Marked Lost. The lead is closed.</T></Done>;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Why it was lost" className="space-y-2">
        {LOST.map(([v, label, hint]) => (
          <button key={v} type="button" role="radio" aria-checked={reason === v} onClick={() => setReason(v)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ${reason === v ? 'ring-2 ring-primary-600' : ''}`} style={card}>
            <span>
              <span className="block font-bold" style={{ color: 'var(--qs-bright)' }}><T>{label}</T></span>
              <span className="block text-sm" style={{ color: 'var(--qs-subtle)' }}><T>{hint}</T></span>
            </span>
            {reason === v && <Check className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {lose.isError && <p className="text-sm text-red-600" role="alert">{lose.error.message}</p>}
      <button type="button" disabled={!reason || lose.isPending} onClick={() => lose.mutate({ leadId, reason })}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-white disabled:opacity-50" style={{ background: '#B42318' }}>
        <X className="h-5 w-5" aria-hidden="true" /> {lose.isPending ? <T k="sales.close.saving">Saving…</T> : <T k="sales.close.mark-lost">Mark Lost</T>}
      </button>
    </div>
  );
}

/**
 * household: the Rate Check rows. Or, for a lead with no upload (a winback): lead,
 * agencyId and its open quote. A winback's note is its story, so no note on follow-up.
 */
export default function CloseStep({ household = [], lead = null, agencyId = null, openQuote = null }) {
  const leadId = lead?.id || household[0]?.lead_id || null;
  const [pick, setPick] = useState(null);
  const total = lead
    ? (openQuote?.lines || []).reduce((s, l) => s + (Number(l.premium) || 0) * (12 / (Number(l.term_months) || 12)), 0)
    : household.filter(rc => rc.allstate_premium != null).reduce((s, rc) => s + Number(rc.allstate_premium), 0);
  if (!leadId) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.close.nolead">This upload has no lead yet, so it can’t be closed here.</T></p>;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.close.title">Close It Out</T></h3>
        {total > 0 && <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.close.quoted">Quoted</T> {money(total)}<T k="sales.log.peryear">/yr</T></p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Choice on={pick === 'bound'} onClick={() => setPick('bound')} icon={ShieldCheck}><T k="sales.close.c-bound">Bound</T></Choice>
        <Choice on={pick === 'follow'} onClick={() => setPick('follow')} icon={CalendarClock}><T k="sales.close.c-follow">Follow Up</T></Choice>
        <Choice on={pick === 'lost'} onClick={() => setPick('lost')} icon={X}><T k="sales.close.c-lost">Lost</T></Choice>
      </div>
      {pick === 'bound' && (lead ? <LeadBound lead={lead} agencyId={agencyId} openQuote={openQuote} /> : <Bound household={household} leadId={leadId} />)}
      {pick === 'follow' && <FollowUp leadId={leadId} withNote={lead?.source !== 'winback'} />}
      {pick === 'lost' && <Lost leadId={leadId} />}
    </div>
  );
}
