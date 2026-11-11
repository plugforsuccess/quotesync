// src/components/lists/AddToList.jsx
// "Won't upload? Add to a list": someone who won't send their dec page goes onto one of
// the principal's lists (the default one picked), so they get the list's follow-up email
// and later campaigns. Used in Quick Send (tone 'light') and the lead workspace (tone 'app').
// onAdd({ list_id, first_name, last_name, email, phone }) → { already?, list? }.
import { useEffect, useState } from 'react';
import { Check, ListPlus, Loader2 } from 'lucide-react';
import { T } from '../SiteCopy';
import { cleanEmail, cleanName, cleanPhone, isEmail } from '../../lib/contactLists';

const fmtPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

const STYLES = {
  light: {
    card: { className: 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' },
    field: { className: 'mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100' },
    label: 'text-sm font-semibold text-slate-700',
    title: 'text-lg font-bold text-slate-900',
    muted: 'text-sm text-slate-500',
    primary: 'bg-blue-700 text-white active:bg-blue-800 disabled:bg-slate-300',
    open: { className: 'flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-bold text-slate-700 shadow-sm active:bg-slate-50' },
    error: 'text-red-700',
  },
  app: {
    card: { className: 'rounded-xl p-4', style: { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' } },
    field: { className: 'mt-1.5 block w-full rounded-lg px-3 py-2.5 text-base', style: { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' } },
    label: 'text-sm font-semibold',
    title: 'text-base font-bold',
    muted: 'text-sm',
    primary: 'bg-primary-600 text-white disabled:opacity-50',
    open: { className: 'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold', style: { border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' } },
    error: 'text-red-600',
  },
};

export default function AddToList({ lists, defaults = {}, onAdd, tone = 'app', emptyNote }) {
  const s = STYLES[tone];
  const app = tone === 'app';
  const txt = app ? { color: 'var(--qs-bright)' } : undefined;
  const sub = app ? { color: 'var(--qs-subtle)' } : undefined;
  const [open, setOpen] = useState(false);
  const pick = () => (lists || []).find(l => l.is_default)?.id || lists?.[0]?.id || '';
  const [f, setF] = useState({ list_id: '', first_name: '', last_name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { name, list, already }

  // Opening fills in what's already known (the name and number typed in Quick Send, the lead's details).
  const start = () => {
    setF({ list_id: pick(), first_name: defaults.first_name || '', last_name: defaults.last_name || '', email: defaults.email || '', phone: fmtPhone(defaults.phone || '') });
    setError(''); setDone(null); setOpen(true);
  };
  useEffect(() => { if (open && !f.list_id && lists?.length) setF(v => ({ ...v, list_id: pick() })); }, [lists]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lists?.length) return emptyNote ? <p className={s.muted} style={sub}>{emptyNote}</p> : null;

  if (done) {
    return (
      <div {...s.card} role="status">
        <p className={`flex items-center gap-2 ${s.title}`} style={txt}><Check className="h-5 w-5 shrink-0" aria-hidden="true" />
          {done.already ? `${done.name} is already on ${done.list}.` : `Added ${done.name} to ${done.list}.`}
        </p>
        <button type="button" onClick={() => { setDone(null); setOpen(false); }} className="mt-2 text-sm font-semibold underline" style={txt}><T k="lists.add.done">Done</T></button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={start} {...s.open}>
        <ListPlus className="h-5 w-5" aria-hidden="true" /> <T k="lists.add.open">Won’t Upload? Add to a List</T>
      </button>
    );
  }

  const set = (k) => (e) => setF(v => ({ ...v, [k]: k === 'phone' ? fmtPhone(e.target.value) : e.target.value }));
  const phoneOk = !f.phone || cleanPhone(f.phone);
  const ok = f.list_id && f.first_name.trim() && isEmail(f.email) && phoneOk;
  const listName = lists.find(l => l.id === f.list_id)?.name || 'the list';
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setError('');
    try {
      const first = cleanName(f.first_name);
      const r = await onAdd({ list_id: f.list_id, first_name: first, last_name: cleanName(f.last_name) || null, email: cleanEmail(f.email), phone: cleanPhone(f.phone) || null });
      setDone({ name: first, list: r?.list || listName, already: !!r?.already });
    } catch (err) {
      setError(err.message || 'Could not add them. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} {...s.card} aria-label="Add to a list">
      <p className={s.title} style={txt}><T k="lists.add.title">Add to a List</T></p>
      <p className={`mt-0.5 ${s.muted}`} style={sub}><T k="lists.add.why">For someone who won’t upload right now. They’ll get your follow-up email with the link.</T></p>
      <div className="mt-4 space-y-3.5">
        {lists.length > 1 && (
          <label className="block">
            <span className={s.label} style={txt}><T k="lists.add.list">List</T></span>
            <select value={f.list_id} onChange={set('list_id')} {...s.field}>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={s.label} style={txt}><T k="lists.add.first">First Name</T></span>
            <input value={f.first_name} onChange={set('first_name')} maxLength={80} autoCapitalize="words" autoComplete="off" {...s.field} />
          </label>
          <label className="block">
            <span className={s.label} style={txt}><T k="lists.add.last">Last Name</T> <span className="font-normal" style={sub}>(<T k="lists.add.optional">optional</T>)</span></span>
            <input value={f.last_name} onChange={set('last_name')} maxLength={80} autoCapitalize="words" autoComplete="off" {...s.field} />
          </label>
        </div>
        <label className="block">
          <span className={s.label} style={txt}><T k="lists.add.email">Email</T></span>
          <input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={f.email} onChange={set('email')} maxLength={200} placeholder="name@example.com" {...s.field} />
        </label>
        <label className="block">
          <span className={s.label} style={txt}><T k="lists.add.phone">Mobile Number</T> <span className="font-normal" style={sub}>(<T k="lists.add.optional">optional</T>)</span></span>
          <input type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={set('phone')} placeholder="(404) 555-1212" {...s.field} />
        </label>
      </div>
      {f.email && !isEmail(f.email) && <p className={`mt-2 text-sm ${s.error}`}><T k="lists.add.bad-email">Check the email: it needs an @ and a domain, like name@gmail.com.</T></p>}
      {error && <p className={`mt-2 text-sm font-medium ${s.error}`} role="alert">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={!ok || busy} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold ${s.primary}`}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ListPlus className="h-5 w-5" aria-hidden="true" />}
          {lists.length > 1 ? <T k="lists.add.submit">Add to List</T> : <>Add to {listName}</>}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-3 text-sm font-semibold" style={sub}><T k="lists.add.cancel">Cancel</T></button>
      </div>
    </form>
  );
}
