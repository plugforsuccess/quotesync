// src/pages/components/rate-checks/PartnersTab.jsx
// "Partners" tab: people outside the agency (friends, influencers) who share a
// permanent Rate Check link and are paid a flat fee per qualified household —
// by the dec pages it sends, never by what it buys. Shows each partner's link,
// what they're owed this month, their close rate and cost per win, the pay
// schedule, and a monthly payout export for 1099s. Math lives in partnerPay.js.

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, Plus } from 'lucide-react';
import {
  usePromoters, usePromoterScans, usePromoterRates, usePromoterPayouts,
  useSavePromoter, useSavePromoterRates, useRecordPromoterPayout, useSetPromoterPhoto,
} from '../../../hooks/useRateChecks';
import { downloadCSV } from '../../../lib/csvExport';
import { formatPhoneInput, isEmail, squarePhoto } from '../../../lib/rateCheckApi';
import { CopyTextButton } from './Copyable';
import { inviteUrl } from './invite';
import { inputStyle, money, formatPhone, formatDate } from './ui';
import {
  TIERS, EXTRA_LINE, EXTRA_LINE_CAP, TIER_LABEL, scheduleFrom, households, partnerSummary, applyCap,
  monthsWithActivity, monthLabel, monthStart, currentMonth,
} from './partnerPay';

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const dollars = (n) => (n == null ? '—' : money(n, { cents: !Number.isInteger(n) }));

function Stat({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color: tone || 'var(--qs-bright)' }}>{value}</p>
    </div>
  );
}

export default function PartnersTab({ agencyId, userId, canEdit, onOpenRateCheck }) {
  const { data: promoters = [], isLoading, error } = usePromoters(agencyId);
  const { data: scans = [] } = usePromoterScans(agencyId);
  const { data: rateRows = [] } = usePromoterRates(agencyId);
  const { data: payouts = [] } = usePromoterPayouts(agencyId);
  const savePromoter = useSavePromoter();
  const recordPayout = useRecordPromoterPayout();

  const schedule = useMemo(() => scheduleFrom(rateRows), [rateRows]);
  const now = currentMonth();
  const [month, setMonth] = useState(now);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);

  const byPartner = useMemo(() => {
    const all = households(scans, schedule);
    return Object.fromEntries(promoters.map(p => {
      const hh = applyCap(all.filter(h => h.promoterId === p.id), p.monthly_cap);
      return [p.id, { hh, summary: partnerSummary(hh, month) }];
    }));
  }, [scans, schedule, promoters, month]);
  const months = useMemo(() => monthsWithActivity(households(scans, schedule), now), [scans, schedule, now]);
  const paidFor = (promoterId) => payouts.find(x => x.promoter_id === promoterId && x.period === monthStart(month));
  const monthOwed = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.owed || 0), 0);
  const monthHouseholds = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.households || 0), 0);

  const exportMonth = () => {
    downloadCSV(`partner-payouts-${month}.csv`, promoters.map(p => {
      const s = byPartner[p.id]?.summary;
      return {
        partner: p.name, phone: p.phone ? formatPhone(p.phone) : '', email: p.email || '',
        month: monthLabel(month), households: s?.month.households || 0, amount: (s?.month.owed || 0).toFixed(2),
        w9_on_file: p.w9_received_at ? 'yes' : 'no', agreement_signed: p.agreement_signed_at ? formatDate(p.agreement_signed_at) : 'no',
        paid: paidFor(p.id) ? formatDate(paidFor(p.id).paid_at) : '',
      };
    }));
  };

  if (isLoading) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading partners…</p>;
  if (error) return <p className="text-sm text-red-500">{error.message}</p>;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--qs-warning)' }} aria-hidden="true" />
        <span>Partners are paid per qualified household they send, never per sale, and they don&apos;t discuss coverage or price.
          Confirm the program with Allstate compliance and your attorney before the first payment, and get a W-9 on file.</span>
      </p>

      {promoters.length === 0 ? (
        /* No partners yet: one card, one button. */
        <div className="dark-card" style={{ padding: 20 }}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>No partners yet</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>
            Add someone who&apos;ll share your Rate Check link. They get a private portal to sign the agreement, then their own link that pays per household.
          </p>
          {canEdit && !adding && (
            <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add partner
            </button>
          )}
          {adding && <AddPartner agencyId={agencyId} userId={userId} save={savePromoter} onDone={() => setAdding(false)} />}
        </div>
      ) : (
        /* This month, across partners */
        <div className="dark-card" style={{ padding: 16 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select value={month} onChange={e => setMonth(e.target.value)} className="dark-select -ml-1 border-0 bg-transparent text-base font-bold"
              style={{ width: 'auto', color: 'var(--qs-bright)', background: 'transparent' }} aria-label="Month">
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            {canEdit && (
              <button type="button" onClick={() => setAdding(a => !a)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add partner
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Partners" value={promoters.filter(p => p.active).length} />
            <Stat label="Households" value={monthHouseholds} />
            <Stat label="Owed" value={dollars(monthOwed)} tone="var(--qs-warning)" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" onClick={exportMonth} disabled={!payouts.length}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={inputStyle}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export for 1099s
            </button>
            {!payouts.length && <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Available once a partner is paid</span>}
          </div>
          {adding && <AddPartner agencyId={agencyId} userId={userId} save={savePromoter} onDone={() => setAdding(false)} />}
        </div>
      )}

      {/* One card per partner */}
      {promoters.map(p => {
        const { hh = [], summary: s } = byPartner[p.id] || {};
        const paid = paidFor(p.id);
        const expanded = open === p.id;
        const monthRows = hh.filter(h => h.month === month);
        return (
          <section key={p.id} className="dark-card" style={{ padding: 16, opacity: p.active ? 1 : 0.6 }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <PartnerPhoto promoter={p} canEdit={canEdit} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{p.name}{!p.active && <span className="ml-2 text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>Paused</span>}</h3>
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{[p.phone && formatPhone(p.phone), p.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                <Pill ok={!!p.agreement_signed_at}>{p.agreement_signed_at ? 'Agreement signed' : 'Agreement not signed'}</Pill>
                <Pill ok={!!p.w9_received_at}>{p.w9_received_at ? 'W-9 on file' : 'W-9 needed'}</Pill>
              </span>
            </div>
            {!p.agreement_signed_at && (
              <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
                Their link doesn&apos;t earn anything until they sign. Send them their portal link: they sign there, then see their link and earnings.
              </p>
            )}

            <LinkRow label="Portal (private: send only to them)" url={portalUrl(p.portal_token)} copyLabel="Copy portal link" />
            <LinkRow label={p.agreement_signed_at ? 'Share link' : 'Share link · off until signed'} url={inviteUrl(p.code)} copyLabel="Copy link" muted={!p.agreement_signed_at} />

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label={s.month.overCap ? `Households · ${s.month.overCap} over cap` : 'Households'} value={s.month.households} />
              <Stat label="Owed" value={dollars(s.month.owed)} tone="var(--qs-warning)" />
              <Stat label="Status" value={paid ? 'Paid' : s.month.owed > 0 ? 'Unpaid' : '—'} tone={paid ? 'var(--qs-success)' : undefined} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
              <Stat label="All time" value={s.households} />
              <Stat label="Won" value={s.won ? `${s.won} · ${pct(s.closeRate)}` : '0'} />
              <Stat label="Cost per win" value={dollars(s.costPerWin)} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpen(expanded ? null : p.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
                {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                {monthRows.length ? `${monthRows.length} ${monthRows.length === 1 ? 'household' : 'households'} in ${monthLabel(month)}` : `Nothing in ${monthLabel(month)}`}
              </button>
              {canEdit && (
                <span className="ml-auto flex flex-wrap gap-2">
                  {s.month.owed > 0 && (
                    <button type="button" disabled={recordPayout.isPending}
                      onClick={() => recordPayout.mutate({ agencyId, promoterId: p.id, period: monthStart(month), households: s.month.households, amount: s.month.owed, userId, remove: !!paid })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${paid ? '' : 'bg-primary-600 text-white'}`} style={paid ? inputStyle : undefined}>
                      {paid ? 'Mark unpaid' : `Mark ${dollars(s.month.owed)} paid`}
                    </button>
                  )}
                  <button type="button" onClick={() => savePromoter.mutate({ id: p.id, agencyId, w9_received_at: p.w9_received_at ? null : new Date().toISOString() })}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}>{p.w9_received_at ? 'Clear W-9' : 'W-9 received'}</button>
                  <CapControl value={p.monthly_cap} onSave={(cap) => savePromoter.mutate({ id: p.id, agencyId, monthly_cap: cap })} />
                  <button type="button" onClick={() => savePromoter.mutate({ id: p.id, agencyId, active: !p.active })}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}>{p.active ? 'Pause link' : 'Turn link on'}</button>
                </span>
              )}
            </div>

            {expanded && monthRows.length > 0 && (
              <ul className="mt-3 overflow-hidden rounded-lg" style={{ border: '1px solid var(--qs-border)' }}>
                {monthRows.map((h, i) => (
                  <li key={h.key} className="flex items-center justify-between gap-3 px-3 py-2.5" style={i ? { borderTop: '1px solid var(--qs-border)' } : undefined}>
                    <div className="min-w-0">
                      <button type="button" onClick={() => onOpenRateCheck?.(h.scans[0].id)} className="text-left text-sm font-semibold hover:underline" style={{ color: 'var(--qs-bright)' }}>
                        {h.firstName || 'Unknown'}
                        <span className="ml-1.5 font-normal" style={{ color: 'var(--qs-subtle)' }}>{h.phone ? formatPhone(h.phone) : ''}</span>
                      </button>
                      <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                        {h.tier ? TIER_LABEL[h.tier] : 'Not qualified'}{h.extras ? ` + ${h.extras} extra ${h.extras === 1 ? 'line' : 'lines'}` : ''}
                        {h.overCap && <span style={{ color: 'var(--qs-warning)' }}> · over the monthly cap</span>}
                        {' · '}<span style={{ color: h.won ? 'var(--qs-success)' : undefined }}>{h.won ? 'Won' : h.quoted ? 'Quoted' : 'Not quoted yet'}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{dollars(h.fee)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <PaySchedule agencyId={agencyId} schedule={schedule} canEdit={canEdit} />
    </div>
  );
}

const portalUrl = (token) => `${window.location.origin}/partner/${token}`;

// The photo on their share link's landing page. Partners can add their own in the
// portal; staff add one here only with the partner's OK.
function PartnerPhoto({ promoter: p, canEdit }) {
  const setPhoto = useSetPromoterPhoto();
  const input = useRef(null);
  const [error, setError] = useState('');
  const first = String(p.name).trim().split(/\s+/)[0];
  const initials = String(p.name).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const photo = p.photo_consent_at ? p.photo_url : null;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(`Only add a photo ${first} gave you and agreed to show on their share link. Add it?`)) return;
    setError('');
    try { setPhoto.mutate({ promoter: p, dataUrl: await squarePhoto(file) }, { onError: (err) => setError(err.message) }); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button type="button" disabled={!canEdit || setPhoto.isPending} onClick={() => input.current?.click()}
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-base font-bold disabled:cursor-default"
        style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-subtle)' }}
        aria-label={photo ? `Change ${first}'s photo` : `Add ${first}'s photo`}>
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials}
      </button>
      {canEdit && (
        <button type="button" onClick={() => (photo ? setPhoto.mutate({ promoter: p, dataUrl: null }) : input.current?.click())}
          disabled={setPhoto.isPending} className="text-[11px] font-semibold text-primary-600">
          {setPhoto.isPending ? 'Saving…' : photo ? 'Remove photo' : 'Add photo'}
        </button>
      )}
      {error && <p className="max-w-[7rem] text-center text-[11px] text-red-500">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

function Pill({ ok, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={ok
        ? { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }
        : { color: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }}>
      {ok && <Check className="h-3 w-3" aria-hidden="true" />}{children}
    </span>
  );
}

function LinkRow({ label, url, copyLabel, muted = false }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{label}</p>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', opacity: muted ? 0.55 : 1 }}>
        <span className="min-w-0 flex-1 truncate font-mono text-sm" style={{ color: 'var(--qs-cyan)' }}>{url}</span>
        <CopyTextButton text={url} className="shrink-0 rounded px-2 py-1 text-xs font-semibold" style={inputStyle}>{copyLabel}</CopyTextButton>
      </div>
    </div>
  );
}

// Most households paid per month; blank means no cap.
function CapControl({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value ?? ''); setEditing(true); }} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}>
        {value ? `Cap ${value}/month` : 'No cap'}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm" style={inputStyle}>
      Cap
      <input inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Monthly cap"
        className="w-14 rounded px-1.5 py-0.5 text-right tabular-nums" style={inputStyle} placeholder="none" />
      <button type="button" onClick={() => { onSave(draft ? Number(draft) : null); setEditing(false); }} className="font-semibold text-primary-600">Save</button>
    </span>
  );
}

function AddPartner({ agencyId, userId, save, onDone }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: k === 'phone' ? formatPhoneInput(e.target.value) : e.target.value }));
  const ok = form.name.trim() && (!form.email || isEmail(form.email)) && (!form.phone || form.phone.replace(/\D/g, '').length === 10);
  const field = 'w-full rounded px-2 py-2 text-sm';
  return (
    <form className="mt-4 grid gap-2 rounded-lg p-3 md:grid-cols-4" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}
      onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate({ agencyId, userId, ...form }, { onSuccess: onDone }); }}>
      <input className={field} style={inputStyle} placeholder="Name *" value={form.name} onChange={set('name')} aria-label="Partner name" required />
      <input className={field} style={inputStyle} placeholder="Mobile" inputMode="tel" value={form.phone} onChange={set('phone')} aria-label="Partner mobile" />
      <input className={field} style={inputStyle} placeholder="Email" type="email" value={form.email} onChange={set('email')} aria-label="Partner email" />
      <button type="submit" disabled={!ok || save.isPending} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {save.isPending ? 'Adding…' : 'Add and make links'}
      </button>
      <p className="text-xs md:col-span-4" style={{ color: 'var(--qs-subtle)' }}>Use their full legal name (it goes on the agreement and the 1099). Then send them their portal link to sign.</p>
      {save.error && <p className="text-sm text-red-500 md:col-span-4">{save.error.message}</p>}
    </form>
  );
}

function PaySchedule({ agencyId, schedule, canEdit }) {
  const saveRates = useSavePromoterRates();
  const [draft, setDraft] = useState(null);
  const values = draft || schedule;
  const rows = [...TIERS, EXTRA_LINE];
  return (
    <section className="dark-card" style={{ padding: 16 }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>Pay schedule · per qualified household</h3>
        {canEdit && !draft && <button type="button" onClick={() => setDraft({ ...schedule })} className="text-sm font-semibold text-primary-600">Edit</button>}
      </div>
      <dl className="mt-2">
        {rows.map(t => (
          <div key={t.key} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: '1px solid var(--qs-border)' }}>
            <dt className="text-sm" style={{ color: 'var(--qs-text)' }}>{t.label}{t.key === EXTRA_LINE.key ? `, up to ${EXTRA_LINE_CAP}` : ''}</dt>
            <dd>
              {draft ? (
                <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--qs-subtle)' }}>$
                  <input inputMode="decimal" value={values[t.key]} aria-label={`${t.label} fee`}
                    onChange={e => setDraft(d => ({ ...d, [t.key]: e.target.value.replace(/[^\d.]/g, '') }))}
                    className="w-20 rounded px-2 py-1 text-right text-sm tabular-nums" style={inputStyle} />
                </span>
              ) : (
                <span className="text-base font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>
                  {t.key === EXTRA_LINE.key ? '+' : ''}{dollars(Number(values[t.key]))}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        A household is one phone number, paid once, in the month its first page arrives. Pages that couldn&apos;t be read, repeats and
        thrown-out scans don&apos;t count. Pay is on what they send, never on what they buy.
      </p>
      {draft && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}>Cancel</button>
          <button type="button" disabled={saveRates.isPending}
            onClick={() => saveRates.mutate({ agencyId, schedule: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v) || 0])) }, { onSuccess: () => setDraft(null) })}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save schedule</button>
        </div>
      )}
      {saveRates.error && <p className="mt-2 text-sm text-red-500">{saveRates.error.message}</p>}
    </section>
  );
}
