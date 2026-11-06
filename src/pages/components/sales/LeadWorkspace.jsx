// Sales workspace for a lead with no uploaded policy (a winback, a call-in): the same
// full-screen steps as a Rate Check. Review what we know, save the Allstate quote typed
// by product, contact them, close. History holds texts, activity and where they came from.
import { useEffect, useState } from 'react';
import { ArrowRight, Check, History, Mail, MessageSquare, Phone, X } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { useLeadSales, useLogQuote } from '../../../hooks/useSales';
import { PRODUCTS, LABEL, defaultTerm } from '../../../lib/sales';
import { parseMoney, sanitizeMoneyInput } from '../../../lib/money';
import { parseWinbackNote } from '../../../lib/winbackNote';
import { displayName } from '../../../lib/names';
import { formatPhone, inputStyle, money } from '../rate-checks/ui';
import { CopyButton } from '../rate-checks/Copyable';
import { ContactPanel } from './ContactStep';
import CloseStep from './CloseStep';
import LeadHistory from './LeadHistory';

const STEPS = [
  { v: 'review', label: 'Review' },
  { v: 'log', label: 'Quote' },
  { v: 'tell', label: 'Contact' },
  { v: 'close', label: 'Bind' },
];
const STATUS = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', interested: 'Interested', closed_won: 'Won', closed_lost: 'Lost' };
const card = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };
const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };
const annual = (l) => (Number(l.premium) || 0) * (12 / (Number(l.term_months) || 12));
// "Auto" from a winback's "Lost Auto" (or "ho" → home), to start the quote on what they left.
const PRODUCT_OF = { Auto: 'auto', Home: 'home', Condo: 'condo', Renters: 'renters', Landlord: 'landlord', PUP: 'umbrella', Motorcycle: 'motorcycle', Boat: 'boat' };

function Row({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-[15px]" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <dt className="shrink-0" style={{ color: 'var(--qs-subtle)' }}><T>{label}</T></dt>
      <dd className="min-w-0 text-right font-semibold" style={{ color: 'var(--qs-bright)' }}>{children}</dd>
    </div>
  );
}

function QuoteEditor({ lead, agencyId, openQuote, start, onSaved }) {
  const logQuote = useLogQuote();
  const [lines, setLines] = useState(() => (openQuote?.lines?.length
    ? openQuote.lines.map(l => ({ product: l.product, premium: l.premium != null ? String(l.premium) : '', term_months: Number(l.term_months) || defaultTerm(l.product) }))
    : start ? [{ product: start, premium: '', term_months: defaultTerm(start) }] : []));
  const toggle = (p) => setLines(ls => (ls.some(l => l.product === p) ? ls.filter(l => l.product !== p) : [...ls, { product: p, premium: '', term_months: defaultTerm(p) }]));
  const set = (p, patch) => setLines(ls => ls.map(l => (l.product === p ? { ...l, ...patch } : l)));
  const ok = lines.length > 0 && lines.every(l => parseMoney(l.premium) > 0);
  const total = lines.reduce((s, l) => s + annual({ ...l, premium: parseMoney(l.premium) || 0 }), 0);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) logQuote.mutate({ agencyId, lead, lines, quoteId: openQuote?.id }, { onSuccess: onSaved }); }}>
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.log.title">Save the Allstate Quote</T></h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.lead.log-line">Pick what you quoted in Allstate and the rate for each policy’s term.</T></p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Policies quoted">
        {PRODUCTS.map(([key, label]) => {
          const on = lines.some(l => l.product === key);
          return (
            <button key={key} type="button" onClick={() => toggle(key)} aria-pressed={on}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${on ? 'bg-primary-600 text-white' : ''}`}
              style={on ? undefined : { ...card, color: 'var(--qs-bright)' }}>
              {on && <Check className="h-4 w-4" aria-hidden="true" />}<T>{label}</T>
            </button>
          );
        })}
      </div>
      {lines.map(l => (
        <div key={l.product} className="rounded-xl p-4" style={card}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold" style={{ color: 'var(--qs-bright)' }}><T>{LABEL[l.product]}</T></span>
            <div className="inline-flex rounded-lg p-0.5" style={field} role="radiogroup" aria-label={`${LABEL[l.product]} term`}>
              {[6, 12].map(t => (
                <button key={t} type="button" role="radio" aria-checked={l.term_months === t} onClick={() => set(l.product, { term_months: t })}
                  className={`h-8 rounded-md px-2.5 text-xs font-semibold ${l.term_months === t ? 'bg-primary-600 text-white' : ''}`}
                  style={l.term_months === t ? undefined : { color: 'var(--qs-bright)' }}>
                  {t === 6 ? <T k="sales.close.6mo">6 Months</T> : <T k="sales.close.12mo">12 Months</T>}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-xs font-semibold" style={{ color: 'var(--qs-bright)' }}>
            <T k="sales.lead.rate">Allstate Rate</T>
            <span className="relative mt-1 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>$</span>
              <input inputMode="decimal" value={l.premium} onChange={e => set(l.product, { premium: sanitizeMoneyInput(e.target.value) })}
                aria-label={`${LABEL[l.product]} Allstate rate`} className="w-full rounded-lg py-2.5 pl-7 pr-2 text-base font-semibold tabular-nums" style={field} />
            </span>
          </label>
        </div>
      ))}
      {total > 0 && (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.lead.total">Household</T> · <b style={{ color: 'var(--qs-bright)' }}>{money(total)}</b><T k="sales.log.peryear">/yr</T></p>
      )}
      {logQuote.isError && <p className="text-sm text-red-600" role="alert">{logQuote.error.message}</p>}
      <button type="submit" disabled={!ok || logQuote.isPending} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:opacity-50">
        {logQuote.isPending ? <T k="sales.close.saving">Saving…</T> : <T k="sales.log.save">Save Quote</T>}
      </button>
    </form>
  );
}

export default function LeadWorkspace({ lead, agencyId, onClose }) {
  const [step, setStep] = useState('review');
  const [editing, setEditing] = useState(false);
  const { data: sales } = useLeadSales(lead.id);
  const openQuote = (sales?.quotes || []).find(q => q.status === 'open') || null;
  const lastQuote = openQuote || (sales?.quotes || [])[0] || null;
  const win = lead.source === 'winback' ? parseWinbackNote(lead.callback_note) : null;
  const name = [displayName(lead.first_name), displayName(lead.last_name)].filter(Boolean).join(' ') || 'No Name';
  const quotedTotal = (openQuote?.lines || []).reduce((s, l) => s + annual(l), 0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (v) => { setStep(v); window.scrollTo?.(0, 0); };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Sales workspace">
      <div className="relative h-full w-full overflow-y-auto" style={{ background: 'var(--qs-card)', color: 'var(--qs-text)' }}>
        <div className="sticky top-0 z-10" style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)' }}>
          <div className="mx-auto max-w-3xl px-5 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold" style={{ color: 'var(--qs-bright)' }}>{name}</h2>
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                  {win ? <T k="sales.lead.former">Former Customer</T> : <T>{lead.source ? `${lead.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Lead` : 'Lead'}</T>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-bright)', border: '1px solid var(--qs-border)' }}>
                  <T>{STATUS[lead.status] || 'New'}</T>
                </span>
                <button onClick={onClose} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="h-4 w-4" /></button>
              </div>
            </div>
            {lead.phone && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <a href={`tel:+1${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 font-semibold text-white">
                  <Phone className="h-4 w-4" /> <T k="pages.ratecheckspage.c3755e">Call</T> {formatPhone(lead.phone)}
                </a>
                <a href={`sms:+1${lead.phone}`} aria-label="Text" title="Text" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium sm:px-3" style={inputStyle}>
                  <MessageSquare className="h-4 w-4" /> <span className="hidden sm:inline"><T k="pages.ratecheckspage.9dffbf">Text</T></span>
                </a>
                {lead.email && (
                  <a href={`mailto:${lead.email}`} aria-label="Email" title="Email" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium sm:px-3" style={inputStyle}>
                    <Mail className="h-4 w-4" /> <span className="hidden sm:inline"><T k="pages.ratecheckspage.ce8ae9">Email</T></span>
                  </a>
                )}
                <CopyButton text={formatPhone(lead.phone)} label="Copy phone number" className="p-2" />
              </div>
            )}
            <div className="mt-2.5 flex items-baseline justify-between gap-3">
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                {quotedTotal > 0 ? <><T k="sales.close.quoted">Quoted</T> <b style={{ color: 'var(--qs-bright)' }}>{money(quotedTotal)}</b><T k="sales.log.peryear">/yr</T></>
                  : win?.premium != null ? <><T k="sales.lead.paid">Paid Us</T> <b style={{ color: 'var(--qs-bright)' }}>{money(win.premium)}</b><T k="sales.log.peryear">/yr</T></> : null}
              </p>
              <button type="button" onClick={() => go(step === 'history' ? 'review' : 'history')} aria-pressed={step === 'history'}
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> <T k="sales.history.open">History</T>
              </button>
            </div>
            <nav aria-label="Sales steps" className="mt-2.5 flex gap-1 rounded-xl p-1" style={{ background: 'var(--qs-elevated)' }}>
              {STEPS.map((x, i) => {
                const on = step === x.v;
                const done = (x.v === 'review' && step !== 'review') || (x.v === 'log' && !!openQuote);
                return (
                  <button key={x.v} type="button" onClick={() => go(x.v)} aria-current={on ? 'step' : undefined}
                    className={`flex min-h-[38px] flex-auto flex-col items-center justify-center whitespace-nowrap rounded-lg px-2 py-0.5 text-[13px] font-semibold leading-tight sm:text-sm ${on ? 'bg-primary-600 text-white shadow-sm' : ''}`}
                    style={on ? undefined : { color: 'var(--qs-bright)' }}>
                    <span className="text-[10px] font-medium leading-none tabular-nums opacity-70" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    <T>{x.label}</T>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="mx-auto max-w-3xl space-y-5 p-5">
          {step === 'review' && (
            <>
              <section className="rounded-xl px-4 pt-3 pb-1" style={card}>
                <h3 className="pb-2 text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.lead.know">What We Know</T></h3>
                <dl>
                  <Row label="Phone">{lead.phone ? formatPhone(lead.phone) : null}</Row>
                  <Row label="Email">{lead.email || <span style={{ color: 'var(--qs-subtle)' }}><T k="sales.lead.notgiven">Not given</T></span>}</Row>
                  <Row label="Address">{[lead.street_address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ') || null}</Row>
                  {win && <Row label="Policy They Left">{[win.line, win.month].filter(Boolean).join(' · ') || null}</Row>}
                  {win && <Row label="Why They Left">{win.reason}</Row>}
                  {win && <Row label="Premium With Us">{win.premium != null ? <>{money(win.premium)}<span style={{ color: 'var(--qs-subtle)' }}>/yr</span></> : null}</Row>}
                  {!win && <Row label="Note">{lead.callback_note}</Row>}
                  {lead.next_followup_at && <Row label="Follow Up">{new Date(lead.next_followup_at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Row>}
                  {lastQuote && <Row label="Quote">{(lastQuote.lines || []).map(l => LABEL[l.product] || l.product).join(' + ')} · {money((lastQuote.lines || []).reduce((s, l) => s + annual(l), 0))}<span style={{ color: 'var(--qs-subtle)' }}>/yr</span></Row>}
                </dl>
              </section>
              <button type="button" onClick={() => go('log')}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white">
                <T k="sales.review.next">Quoted It in Allstate? Save the Quote</T> <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}

          {step === 'log' && (openQuote && !editing ? (
            <div className="rounded-xl p-4" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }} role="status">
              <p className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.logged.title">Quote Saved</T></p>
              <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>
                {(openQuote.lines || []).map(l => LABEL[l.product] || l.product).join(' + ')} · <b>{money(quotedTotal)}</b><T k="sales.log.peryear">/yr</T>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => go('tell')} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-bold text-white">
                  <T k="sales.logged.next">Next: Contact Them</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-primary-600 underline"><T k="sales.logged.edit">Change the Rates</T></button>
              </div>
            </div>
          ) : (
            <QuoteEditor lead={lead} agencyId={agencyId} openQuote={openQuote} start={PRODUCT_OF[win?.line] || null} onSaved={() => setEditing(false)} />
          ))}

          {step === 'tell' && (
            <>
              {openQuote ? (
                <ContactPanel first={displayName(lead.first_name)} phone={lead.phone} leadId={lead.id} cur={null} all={quotedTotal}
                  consented={!!lead.consent_given_at} />
              ) : (
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.contact.first">Save the quote first; the message is written from it.</T></p>
              )}
              <button type="button" onClick={() => go('close')} className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl text-sm font-bold"
                style={{ border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                <T k="sales.contact.tobind">Next: Bind</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}

          {step === 'close' && <CloseStep lead={lead} agencyId={agencyId} openQuote={openQuote} />}

          {step === 'history' && <LeadHistory leadId={lead.id} />}
        </div>
      </div>
    </div>
  );
}
