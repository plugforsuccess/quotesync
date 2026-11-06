// src/pages/components/sales/SalesForms.jsx
// Quote / Bound / Lost on a lead (Producer Command Center, step 1).
//   Quote  — tick the products quoted, the premium for each policy's term.
//   Bound  — what was written: items per product (auto prefilled from the cars on
//            file), the premium the customer actually paid (can be less than quoted),
//            the bundle type (worked out, can be changed), policy numbers optional.
//   Lost   — Price, No response, or Not eligible.
// Credit goes to whoever logs it. Lead status follows (Quoted, Won, Lost).
import { useMemo, useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { useLeadSales, useLogBind, useLogQuote, useMarkLost } from '../../../hooks/useSales';
import { PRODUCTS, LABEL, BUNDLE, LOST, bundleTypeFor, defaultTerm, money } from '../../../lib/sales';

const nameOf = (lead) => [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'this lead';

const box = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' };

function ProductChips({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRODUCTS.map(([key, label]) => {
        const on = selected.includes(key);
        return (
          <button key={key} type="button" onClick={() => onToggle(key)} aria-pressed={on}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${on ? 'bg-primary-600 text-white' : ''}`}
            style={on ? undefined : box}>
            {on && <Check className="h-4 w-4" aria-hidden="true" />}{label}
          </button>
        );
      })}
    </div>
  );
}

function TermSwitch({ value, onChange, label }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg p-0.5" style={box} role="radiogroup" aria-label={`${label} term`}>
      {[6, 12].map(t => (
        <button key={t} type="button" role="radio" aria-checked={value === t} onClick={() => onChange(t)}
          className={`h-8 rounded-md px-2.5 text-xs font-semibold ${value === t ? 'bg-primary-600 text-white' : ''}`}>
          {t} mo
        </button>
      ))}
    </div>
  );
}

function PremiumInput({ value, onChange, label }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>$</span>
      <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
        aria-label={label} className="h-10 w-full rounded-lg pl-7 pr-3 text-sm tabular-nums" style={box} />
    </label>
  );
}

function Sheet({ title, sub, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{title}</h2>
            {sub && <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ color: 'var(--qs-subtle)' }}><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        <div className="border-t px-5 py-4" style={{ borderColor: 'var(--qs-border)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>{footer}</div>
      </div>
    </div>
  );
}

const primaryBtn = 'inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 font-semibold text-white disabled:opacity-50';

// ── Quote ───────────────────────────────────────────────────────────────────
function QuoteForm({ lead, agencyId, onClose }) {
  const logQuote = useLogQuote();
  const [lines, setLines] = useState([]);
  const toggle = (p) => setLines(ls => (ls.some(l => l.product === p) ? ls.filter(l => l.product !== p) : [...ls, { product: p, premium: '', term_months: defaultTerm(p) }]));
  const set = (p, patch) => setLines(ls => ls.map(l => (l.product === p ? { ...l, ...patch } : l)));
  const ready = lines.length > 0 && lines.every(l => Number(String(l.premium).replace(/[^0-9.]/g, '')) > 0);
  const save = () => logQuote.mutate({ agencyId, lead, lines }, { onSuccess: onClose });
  return (
    <Sheet title="Log a quote" sub={nameOf(lead)} onClose={onClose}
      footer={<>
        {logQuote.error && <p className="mb-2 text-sm text-red-600" role="alert">Couldn’t save: {logQuote.error.message}</p>}
        <button type="button" className={primaryBtn} disabled={!ready || logQuote.isPending} onClick={save}>
          {logQuote.isPending ? 'Saving…' : lines.length ? `Save quote · ${lines.length} ${lines.length === 1 ? 'policy' : 'policies'}` : 'Pick what you quoted'}
        </button>
      </>}>
      <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>What did you quote?</p>
      <ProductChips selected={lines.map(l => l.product)} onToggle={toggle} />
      {lines.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Quoted premium, as Allstate shows it</p>
          {lines.map(l => (
            <div key={l.product} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm font-semibold">{LABEL[l.product]}</span>
              <PremiumInput value={l.premium} onChange={v => set(l.product, { premium: v })} label={`${LABEL[l.product]} quoted premium`} />
              <TermSwitch value={l.term_months} onChange={t => set(l.product, { term_months: t })} label={LABEL[l.product]} />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ── Bound ───────────────────────────────────────────────────────────────────
function BindForm({ lead, agencyId, openQuote, onClose }) {
  const logBind = useLogBind();
  const cars = Math.max(1, Number(lead?.vehicle_count) || 1);
  const fromQuote = (openQuote?.lines || []).map(l => ({
    product: l.product, items: l.product === 'auto' ? cars : 1,
    premium: l.premium != null ? String(l.premium) : '', term_months: Number(l.term_months) || defaultTerm(l.product), policy_number: '',
  }));
  const [lines, setLines] = useState(fromQuote);
  const [bundle, setBundle] = useState(null); // null = worked out
  const toggle = (p) => setLines(ls => (ls.some(l => l.product === p) ? ls.filter(l => l.product !== p)
    : [...ls, { product: p, items: p === 'auto' ? cars : 1, premium: '', term_months: defaultTerm(p), policy_number: '' }]));
  const set = (p, patch) => setLines(ls => ls.map(l => (l.product === p ? { ...l, ...patch } : l)));
  const auto = bundleTypeFor(lines.map(l => l.product));
  const bundleType = bundle || auto;
  const items = lines.reduce((t, l) => t + (Math.max(1, Number(l.items) || 1)), 0);
  const ready = lines.length > 0 && lines.every(l => Number(String(l.premium).replace(/[^0-9.]/g, '')) > 0);
  const save = () => logBind.mutate({ agencyId, lead, quoteId: openQuote?.id, lines, bundleType, bundleOverridden: !!bundle && bundle !== auto }, { onSuccess: onClose });

  return (
    <Sheet title="Mark bound" sub={nameOf(lead)} onClose={onClose}
      footer={<>
        {logBind.error && <p className="mb-2 text-sm text-red-600" role="alert">Couldn’t save: {logBind.error.message}</p>}
        <button type="button" className={primaryBtn} disabled={!ready || logBind.isPending} onClick={save}>
          {logBind.isPending ? 'Saving…' : lines.length ? `Save bind · ${items} ${items === 1 ? 'item' : 'items'}` : 'Pick what you wrote'}
        </button>
      </>}>
      <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>What did you write?</p>
      <ProductChips selected={lines.map(l => l.product)} onToggle={toggle} />

      {lines.length > 0 && (
        <div className="mt-4 space-y-3">
          {lines.map(l => (
            <div key={l.product} className="rounded-xl p-3" style={box}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--qs-bright)' }}>{LABEL[l.product]}</span>
                {l.product === 'auto' ? (
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--qs-subtle)' }}>Cars</span>
                    <span className="inline-flex items-center rounded-lg" style={{ border: '1px solid var(--qs-border)' }}>
                      <button type="button" aria-label="One fewer car" className="h-8 w-8 font-bold" onClick={() => set('auto', { items: Math.max(1, (Number(l.items) || 1) - 1) })}>−</button>
                      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{l.items}</span>
                      <button type="button" aria-label="One more car" className="h-8 w-8 font-bold" onClick={() => set('auto', { items: (Number(l.items) || 1) + 1 })}>+</button>
                    </span>
                  </span>
                ) : <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>1 item</span>}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <PremiumInput value={l.premium} onChange={v => set(l.product, { premium: v })} label={`${LABEL[l.product]} bound premium`} />
                <TermSwitch value={l.term_months} onChange={t => set(l.product, { term_months: t })} label={LABEL[l.product]} />
              </div>
              <input value={l.policy_number} onChange={e => set(l.product, { policy_number: e.target.value })} placeholder="Policy number (optional)"
                aria-label={`${LABEL[l.product]} policy number`} className="mt-2 h-10 w-full rounded-lg px-3 text-sm" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }} />
              {l.product === 'auto' && (
                <p className="mt-2 text-xs" style={{ color: 'var(--qs-subtle)' }}>You own this policy until its first renewal.</p>
              )}
            </div>
          ))}

          <div>
            <p className="mb-1.5 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Bundle</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={box} role="radiogroup" aria-label="Bundle type">
              {Object.entries(BUNDLE).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={bundleType === k} onClick={() => setBundle(k === auto ? null : k)}
                  className={`h-9 rounded-lg px-1 text-xs font-semibold sm:text-sm ${bundleType === k ? 'bg-primary-600 text-white' : ''}`}>{label}</button>
              ))}
            </div>
            {bundle && bundle !== auto && <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>Changed by you (worked out as {BUNDLE[auto]}).</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── Lost ────────────────────────────────────────────────────────────────────
function LostForm({ lead, openQuotes, onClose }) {
  const markLost = useMarkLost();
  const [reason, setReason] = useState('');
  return (
    <Sheet title="Mark lost" sub={nameOf(lead)} onClose={onClose}
      footer={<>
        {markLost.error && <p className="mb-2 text-sm text-red-600" role="alert">Couldn’t save: {markLost.error.message}</p>}
        <button type="button" className={primaryBtn} disabled={!reason || markLost.isPending}
          onClick={() => markLost.mutate({ lead, quoteIds: openQuotes.map(q => q.id), reason }, { onSuccess: onClose })}>
          {markLost.isPending ? 'Saving…' : 'Mark lost'}
        </button>
      </>}>
      <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Why?</p>
      <div className="space-y-2" role="radiogroup" aria-label="Reason">
        {LOST.map(([k, label, hint]) => (
          <button key={k} type="button" role="radio" aria-checked={reason === k} onClick={() => setReason(k)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ${reason === k ? 'ring-2 ring-primary-600' : ''}`} style={box}>
            <span><span className="block font-semibold" style={{ color: 'var(--qs-bright)' }}>{label}</span><span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{hint}</span></span>
            {reason === k && <Check className="h-5 w-5 text-primary-600" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Opens the right form for a lead. mode: 'quote' | 'bind' | 'lost'. */
export function SalesSheet({ mode, lead, agencyId, onClose }) {
  const { data, isLoading } = useLeadSales(lead?.id);
  if (!lead || (mode !== 'quote' && isLoading)) return null;
  const open = (data?.quotes || []).filter(q => q.status === 'open');
  if (mode === 'quote') return <QuoteForm lead={lead} agencyId={agencyId} onClose={onClose} />;
  if (mode === 'bind') return <BindForm lead={lead} agencyId={agencyId} openQuote={open[0]} onClose={onClose} />;
  return <LostForm lead={lead} openQuotes={open} onClose={onClose} />;
}

const STATUS = {
  open: ['Open', '#F59E0B'], bound: ['Bound', '#16A34A'], lost: ['Lost', '#94A3B8'],
};
const lostLabel = Object.fromEntries(LOST.map(([k, l]) => [k, l]));

/** The "Quotes & binds" card on the lead page. */
export function LeadSalesCard({ lead, agencyId }) {
  const { data } = useLeadSales(lead?.id);
  const [mode, setMode] = useState(null);
  const quotes = useMemo(() => data?.quotes || [], [data]);
  const binds = data?.binds || [];
  const open = quotes.filter(q => q.status === 'open');
  const btn = 'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900"><FileText className="h-5 w-5" aria-hidden="true" /> Quotes &amp; binds</h2>
      <p className="mb-4 text-sm text-gray-500">Counts toward whoever logs it.</p>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => setMode('quote')} className={`${btn} border border-gray-300 text-gray-800 hover:bg-gray-50`}>Quote</button>
        <button type="button" onClick={() => setMode('bind')} className={`${btn} bg-primary-600 text-white hover:bg-primary-700`}>Bound</button>
        <button type="button" onClick={() => setMode('lost')} disabled={!open.length} className={`${btn} border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-40`}>Lost</button>
      </div>

      {(quotes.length > 0 || binds.length > 0) && (
        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {binds.map(b => {
            const items = (b.bound_items || []).reduce((t, i) => t + i.item_count, 0);
            const auto = (b.bound_items || []).find(i => i.product === 'auto');
            return (
              <li key={b.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-gray-900">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS.bound[1] }} aria-hidden="true" />
                    Bound · {items} {items === 1 ? 'item' : 'items'} · {BUNDLE[b.bundle_type]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(b.bound_items || []).map(i => `${LABEL[i.product] || i.product}${i.item_count > 1 ? ` ×${i.item_count}` : ''}`).join(' + ')} · {new Date(`${b.bound_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {auto?.first_renewal_on && ` · first renewal ${new Date(`${auto.first_renewal_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-green-700" title="Annual">{money(b.bound_premium)}<span className="text-xs font-normal text-gray-400">/yr</span></span>
              </li>
            );
          })}
          {quotes.filter(q => q.status !== 'bound').map(q => (
            <li key={q.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS[q.status][1] }} aria-hidden="true" />
                  Quote · {STATUS[q.status][0]}{q.status === 'lost' && q.lost_reason ? ` (${lostLabel[q.lost_reason]}${q.auto_closed ? ', after 30 days' : ''})` : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {(q.products || []).map(p => LABEL[p] || p).join(' + ')} · {new Date(`${q.quoted_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {q.rate_check_id && ' · from Rate Check'}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-green-700" title="Annual">{money(q.quoted_premium)}<span className="text-xs font-normal text-gray-400">/yr</span></span>
            </li>
          ))}
        </ul>
      )}

      {mode && <SalesSheet mode={mode} lead={lead} agencyId={agencyId} onClose={() => setMode(null)} />}
    </div>
  );
}
