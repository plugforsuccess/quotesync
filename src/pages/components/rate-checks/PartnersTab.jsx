// src/pages/components/rate-checks/PartnersTab.jsx
// "Partners" tab: people outside the agency (friends, influencers) who share a
// permanent Rate Check link and are paid a flat fee per qualified household —
// by the dec pages it sends, never by what it buys. Shows each partner's link,
// what they're owed this month, their close rate and cost per win, the pay
// schedule, and a yearly export of what was paid, for 1099s. Math lives in partnerPay.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, MessageSquare, Plus } from 'lucide-react';
import {
  usePromoters, usePromoterScans, usePromoterRates, usePromoterPayouts,
  useSavePromoter, useSavePromoterRates, useRecordPromoterPayout, useSetPromoterPhoto, partnerW9Url,
  usePartnerApplications, useCloseApplication,
} from '../../../hooks/useRateChecks';
import { downloadCSV } from '../../../lib/csvExport';
import { formatPhoneInput, isEmail, squarePhoto } from '../../../lib/rateCheckApi';
import { CopyTextButton } from './Copyable';
import { inviteUrl } from './invite';
import { PARTNER_AGREEMENT_REQUIRED } from '../../../lib/partnerProgram';
import { inputStyle, money, formatPhone, formatDate } from './ui';
import {
  TIERS, EXTRA_LINE, EXTRA_LINE_CAP, TIER_LABEL, MIN_PAYOUT, QUOTE_DAYS, scheduleFrom, households, partnerSummary, applyCap,
  monthsWithActivity, monthLabel, monthStart, currentMonth, payoutPlan, paidInYear,
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

export default function PartnersTab({ agencyId, userId, canEdit, onOpenRateCheck, focusId = null }) {
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
  const [open, setOpen] = useState(focusId);

  // Opened from a partner's name on a lead: expand their card and bring it into view.
  useEffect(() => {
    if (!focusId || isLoading) return;
    setOpen(focusId);
    // Scroll after the applications list above has had a moment to load and push the card down.
    const t = setTimeout(() => document.getElementById(`partner-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => clearTimeout(t);
  }, [focusId, isLoading]);

  const byPartner = useMemo(() => {
    const all = households(scans, schedule);
    return Object.fromEntries(promoters.map(p => {
      const hh = applyCap(all.filter(h => h.promoterId === p.id), p.monthly_cap);
      const mine = payouts.filter(x => x.promoter_id === p.id);
      return [p.id, { hh, summary: partnerSummary(hh, month), plan: payoutPlan(hh, mine, month) }];
    }));
  }, [scans, schedule, promoters, month, payouts]);
  const months = useMemo(() => monthsWithActivity(households(scans, schedule), now), [scans, schedule, now]);
  const paidFor = (promoterId) => payouts.find(x => x.promoter_id === promoterId && x.period === monthStart(month));
  const monthOwed = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.owed || 0), 0);
  const monthHouseholds = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.households || 0), 0);

  // 1099s count what was paid in the calendar year (by payment date), so a payout
  // that covers carried-over months is reported at its full amount.
  const year = Number(month.slice(0, 4));
  const paidThisYear = useMemo(() => paidInYear(payouts, year), [payouts, year]);
  const exportYear = () => {
    downloadCSV(`partner-1099-${year}.csv`, promoters.filter(p => paidThisYear[p.id]).map(p => {
      const t = paidThisYear[p.id];
      return {
        partner: p.name, phone: p.phone ? formatPhone(p.phone) : '', email: p.email || '',
        year, paid: t.amount.toFixed(2), payments: t.payments,
        months_covered: t.months.map(monthLabel).join('; '), last_paid: formatDate(t.lastPaid),
        w9_on_file: p.w9_received_at ? 'yes' : 'no', tin: p.w9_tin_last4 ? `${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} ending ${p.w9_tin_last4}` : '',
        agreement_signed: p.agreement_signed_at ? formatDate(p.agreement_signed_at) : 'no',
      };
    }));
  };

  if (isLoading) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading partners…</p>;
  if (error) return <p className="text-sm text-red-500">{error.message}</p>;

  return (
    <div className="space-y-4">
      <Applications agencyId={agencyId} userId={userId} canEdit={canEdit} savePromoter={savePromoter} />

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
            Add someone who&apos;ll share your Rate Check link. {PARTNER_AGREEMENT_REQUIRED ? 'They get a private portal to sign the agreement, then their own link that pays per household.' : 'They get their own link that pays per household, and a private portal to see what they’ve earned.'}
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
            <button type="button" onClick={exportYear} disabled={!Object.keys(paidThisYear).length}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={inputStyle}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export {year} for 1099s
            </button>
            <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>{Object.keys(paidThisYear).length ? `What each partner was paid in ${year}, by payment date` : `Available once a partner is paid in ${year}`}</span>
          </div>
          {adding && <AddPartner agencyId={agencyId} userId={userId} save={savePromoter} onDone={() => setAdding(false)} />}
        </div>
      )}

      {/* One card per partner */}
      {promoters.map(p => {
        const { hh = [], summary: s, plan } = byPartner[p.id] || {};
        const paid = paidFor(p.id);
        const expanded = open === p.id;
        const monthRows = hh.filter(h => h.month === month);
        return (
          <section key={p.id} id={`partner-${p.id}`} className="dark-card scroll-mt-24" style={{ padding: 16, opacity: p.active ? 1 : 0.6 }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <PartnerPhoto promoter={p} canEdit={canEdit} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{p.name}{!p.active && <span className="ml-2 text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>Paused</span>}</h3>
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{[p.phone && formatPhone(p.phone), p.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                {(PARTNER_AGREEMENT_REQUIRED || p.agreement_signed_at) && <Pill ok={!!p.agreement_signed_at}>{p.agreement_signed_at ? 'Agreement signed' : 'Agreement not signed'}</Pill>}
                <Pill ok={!!p.w9_received_at}>{p.w9_received_at ? `W-9 on file${p.w9_tin_last4 ? ` · ${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} …${p.w9_tin_last4}` : ''}` : 'W-9 needed'}</Pill>
              </span>
            </div>
            {PARTNER_AGREEMENT_REQUIRED && !p.agreement_signed_at && (
              <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
                Their link doesn&apos;t earn anything until they sign. Send them their portal link: they sign there, then see their link and earnings.
              </p>
            )}

            <LinkRow label="Portal (private: send only to them)" url={portalUrl(p.portal_token)} copyLabel="Copy"
              extra={p.phone && !p.w9_received_at && (
                <a href={portalSms(p)} aria-label={`Text ${p.name.split(' ')[0]} the portal link`} title={`Text ${p.name.split(' ')[0]} the portal link`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-700">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Text {p.name.split(' ')[0]}
                </a>
              )} />
            <LinkRow label={!PARTNER_AGREEMENT_REQUIRED || p.agreement_signed_at ? 'Share link' : 'Share link · off until signed'} url={inviteUrl(p.code)} copyLabel="Copy link" muted={PARTNER_AGREEMENT_REQUIRED && !p.agreement_signed_at} />

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Households" value={s.month.households} />
              <Stat label="Owed" value={dollars(paid ? Number(paid.amount) : plan.amount)} tone="var(--qs-warning)" />
              <Stat label="Status" value={paid ? 'Paid' : plan.underMinimum ? `Under ${dollars(MIN_PAYOUT)}` : plan.amount > 0 ? 'Unpaid' : '—'} tone={paid ? 'var(--qs-success)' : undefined} />
            </div>
            {(s.month.pending > 0 || s.month.overCap > 0 || (!paid && plan.carried > 0) || (!paid && plan.underMinimum)) && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
                {[
                  s.month.pending > 0 && `${s.month.pending} waiting on a quote (pays in ${QUOTE_DAYS} days either way)`,
                  s.month.overCap > 0 && `${s.month.overCap} over the monthly cap`,
                  !paid && plan.carried > 0 && `includes ${dollars(plan.carried)} carried from ${plan.months.filter(m => m.month !== month).map(m => monthLabel(m.month).split(' ')[0]).join(', ')}`,
                  !paid && plan.underMinimum && 'carries to next month',
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
              <Stat label="All time" value={s.households} />
              <Stat label="Won" value={s.won ? `${s.won} · ${pct(s.closeRate)}` : '0'} />
              <Stat label="Cost per win" value={dollars(s.costPerWin)} />
            </div>

            {/* This month's households (tap to list them), and the payout action when one is due. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {monthRows.length ? (
                <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
                  {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  {monthRows.length} {monthRows.length === 1 ? 'household' : 'households'} in {monthLabel(month)}
                </button>
              ) : (
                <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>No households in {monthLabel(month)} yet.</span>
              )}
              {canEdit && (paid ? (
                <button type="button" disabled={recordPayout.isPending}
                  onClick={() => recordPayout.mutate({ agencyId, promoterId: p.id, months: [{ period: monthStart(month) }], userId, remove: true })}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={inputStyle}>Mark unpaid</button>
              ) : plan.amount > 0 && !plan.underMinimum && !p.w9_received_at ? (
                <span className="text-xs font-semibold" style={{ color: 'var(--qs-warning)' }}>W-9 needed before paying {dollars(plan.amount)}</span>
              ) : plan.amount > 0 && !plan.underMinimum ? (
                <button type="button" disabled={recordPayout.isPending}
                  onClick={() => recordPayout.mutate({ agencyId, promoterId: p.id, userId,
                    months: plan.months.map(m => ({ period: monthStart(m.month), households: m.households, amount: m.amount })) })}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white">
                  Mark {dollars(plan.amount)} paid{plan.carried ? ` (${plan.months.length} months)` : ''}
                </button>
              ) : plan.underMinimum ? (
                <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Under {dollars(MIN_PAYOUT)} · carries over</span>
              ) : null)}
            </div>

            {/* Partner settings: what each one means, and one action each. */}
            {canEdit && (
              <dl className="mt-4 divide-y overflow-hidden rounded-xl" style={{ border: '1px solid var(--qs-border)', borderColor: 'var(--qs-border)' }}>
                <SettingRow label="W-9"
                  value={p.w9_received_at
                    ? `On file${p.w9_tin_last4 ? ` · ${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} …${p.w9_tin_last4}` : ' (paper copy)'}`
                    : `Needed before the first payment. ${p.name.split(' ')[0]} can sign it in the portal.`}
                  tone={p.w9_received_at ? 'ok' : 'warn'}
                  action={p.w9_pdf_path
                    ? <SettingButton onClick={() => partnerW9Url(p.w9_pdf_path).then(url => window.open(url, '_blank', 'noopener')).catch(err => window.alert(err.message))}>Open</SettingButton>
                    : <SettingButton onClick={() => savePromoter.mutate({ id: p.id, agencyId, w9_received_at: p.w9_received_at ? null : new Date().toISOString() })}>
                        {p.w9_received_at ? 'Clear' : 'Got paper W-9'}
                      </SettingButton>} />
                <CapControl value={p.monthly_cap} onSave={(cap) => savePromoter.mutate({ id: p.id, agencyId, monthly_cap: cap })} />
                <SettingRow label="Share link"
                  value={p.active ? 'On. New scans from the link count toward pay.' : 'Paused. The link doesn\u2019t take new scans.'}
                  tone={p.active ? 'ok' : 'warn'}
                  action={<SettingButton onClick={() => savePromoter.mutate({ id: p.id, agencyId, active: !p.active })}>{p.active ? 'Pause' : 'Turn on'}</SettingButton>} />
              </dl>
            )}

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
// Opens the Messages app with the partner's portal link written in.
const portalSms = (p) => `sms:+1${p.phone}?&body=${encodeURIComponent(
  `Hi ${p.name.split(' ')[0]}, it's Cam. Here's your insuredbycam.com partner portal: ${portalUrl(p.portal_token)}\nSign your W-9 there (takes 30 seconds) and copy your share link. Keep this link private.`)}`;

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

function LinkRow({ label, url, copyLabel, muted = false, extra = null }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{label}</p>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', opacity: muted ? 0.55 : 1 }}>
        <span className="min-w-0 flex-1 truncate font-mono text-sm" style={{ color: 'var(--qs-cyan)' }}>{url}</span>
        <CopyTextButton text={url} className="shrink-0 rounded px-2 py-1 text-xs font-semibold" style={inputStyle}>{copyLabel}</CopyTextButton>
        {extra}
      </div>
    </div>
  );
}

// One labeled setting on a partner's card: what it is, where it stands, one action.
function SettingRow({ label, value, tone, action, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderColor: 'var(--qs-border)' }}>
      <div className="min-w-0">
        <dt className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{label}</dt>
        <dd className="text-xs leading-snug" style={{ color: tone === 'warn' ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>{value}</dd>
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function SettingButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[36px] rounded-lg px-3 text-sm font-semibold text-primary-600" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
      {children}
    </button>
  );
}

// Most households paid per month; blank means no limit.
function CapControl({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  return (
    <SettingRow label="Monthly limit"
      value={value ? `Pays up to ${value} households a month; the rest are logged but not paid.` : 'No limit. Every qualified household is paid.'}
      action={editing ? (
        <span className="inline-flex items-center gap-1.5">
          <input inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Households paid per month"
            className="h-9 w-16 rounded-lg px-2 text-right text-sm tabular-nums" style={inputStyle} placeholder="none" autoFocus />
          <SettingButton onClick={() => { onSave(draft ? Number(draft) : null); setEditing(false); }}>Save</SettingButton>
        </span>
      ) : <SettingButton onClick={() => { setDraft(value ?? ''); setEditing(true); }}>{value ? 'Change' : 'Set limit'}</SettingButton>} />
  );
}

// What applicants said about being with Allstate (and with us).
const CUSTOMER_BADGE = {
  agency: 'Cam Wiley Agency customer', yes: 'Allstate customer', allstate_other: 'Allstate · another agent',
  allstate_unsure: 'Allstate · agent unknown', no: 'Not with Allstate',
};

// People who asked to join from the Drivers Ed page. "Add as partner" makes the partner
// (same as Add partner) and closes the application; then send them their portal link.
function Applications({ agencyId, userId, canEdit, savePromoter }) {
  const { data: apps = [] } = usePartnerApplications(agencyId);
  const close = useCloseApplication();
  const [busy, setBusy] = useState(null);
  if (!apps.length) return null;
  const add = (a) => {
    setBusy(a.id);
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
    savePromoter.mutate({ agencyId, userId, name, phone: a.phone, email: a.email || '' }, {
      onSuccess: (row) => close.mutate({ id: a.id, status: 'added', promoterId: row?.id, agencyId }, { onSettled: () => setBusy(null) }),
      onError: () => setBusy(null),
    });
  };
  return (
    <section className="dark-card" style={{ padding: 16 }} aria-label="Partner applications">
      <h3 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>
        {apps.length === 1 ? '1 person wants to be a partner' : `${apps.length} people want to be partners`}
      </h3>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>From the Drivers Ed page. Add them, then send them their portal link.</p>
      <ul className="mt-3 space-y-2">
        {apps.map(a => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--qs-elevated)' }}>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>
                {[a.first_name, a.last_name].filter(Boolean).join(' ')}
                {CUSTOMER_BADGE[a.is_customer] && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold" style={a.is_customer === 'agency' ? { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)' } : { color: 'var(--qs-text)', background: 'var(--qs-card)' }}>{CUSTOMER_BADGE[a.is_customer]}</span>}
              </p>
              <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                {[formatPhone(a.phone), a.email, a.audience, `applied ${formatDate(a.created_at)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => close.mutate({ id: a.id, status: 'dismissed', agencyId })} disabled={busy === a.id}
                  className="min-h-[36px] rounded-lg px-3 text-sm font-semibold" style={inputStyle}>Dismiss</button>
                <button type="button" onClick={() => add(a)} disabled={busy === a.id}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
                  <Plus className="h-4 w-4" aria-hidden="true" /> {busy === a.id ? 'Adding…' : 'Add as partner'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {(savePromoter.error || close.error) && <p className="mt-2 text-sm text-red-500">{(savePromoter.error || close.error).message}</p>}
    </section>
  );
}

function AddPartner({ agencyId, userId, save, onDone }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', street: '', city: '', state: 'GA', zip: '' });
  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === 'phone') v = formatPhoneInput(v);
    if (k === 'state') v = v.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
    if (k === 'zip') v = v.replace(/\D/g, '').slice(0, 5);
    setForm(f => ({ ...f, [k]: v }));
  };
  const anyAddress = form.street.trim() || form.city.trim() || form.zip;
  const fullAddress = form.street.trim() && form.city.trim() && /^[A-Z]{2}$/.test(form.state) && form.zip.length === 5;
  const ok = form.name.trim() && (!form.email || isEmail(form.email)) && (!form.phone || form.phone.replace(/\D/g, '').length === 10)
    && (!anyAddress || fullAddress);
  const field = 'w-full rounded-lg px-3 py-2.5 text-sm';
  const Label = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold" style={{ color: 'var(--qs-dim)' }}>{children}</label>;
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    save.mutate({
      agencyId, userId, name: form.name, phone: form.phone, email: form.email,
      mailing_address: fullAddress ? form.street : '',
      mailing_city_state_zip: fullAddress ? `${form.city.trim()}, ${form.state} ${form.zip}` : '',
    }, { onSuccess: onDone });
  };
  return (
    <form className="mt-4 grid gap-3 rounded-lg p-3 md:grid-cols-3" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }} onSubmit={submit}>
      <div><Label htmlFor="ap-name">Full legal name *</Label>
        <input id="ap-name" className={field} style={inputStyle} value={form.name} onChange={set('name')} required autoComplete="off" /></div>
      <div><Label htmlFor="ap-phone">Mobile</Label>
        <input id="ap-phone" className={field} style={inputStyle} inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="off" /></div>
      <div><Label htmlFor="ap-email">Email</Label>
        <input id="ap-email" className={field} style={inputStyle} type="email" value={form.email} onChange={set('email')} autoComplete="off" /></div>

      <p className="-mb-1 mt-1 text-xs md:col-span-3" style={{ color: 'var(--qs-subtle)' }}>Mailing address (optional): fills in their W-9 so they only add their SSN and sign.</p>
      <div className="md:col-span-3"><Label htmlFor="ap-street">Street address</Label>
        <input id="ap-street" className={field} style={inputStyle} value={form.street} onChange={set('street')} autoComplete="off" /></div>
      <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-2 md:col-span-3">
        <div><Label htmlFor="ap-city">City</Label>
          <input id="ap-city" className={field} style={inputStyle} value={form.city} onChange={set('city')} autoComplete="off" /></div>
        <div><Label htmlFor="ap-state">State</Label>
          <input id="ap-state" className={`${field} uppercase`} style={inputStyle} value={form.state} onChange={set('state')} autoComplete="off" /></div>
        <div><Label htmlFor="ap-zip">ZIP</Label>
          <input id="ap-zip" className={`${field} tabular-nums`} style={inputStyle} inputMode="numeric" value={form.zip} onChange={set('zip')} autoComplete="off" /></div>
      </div>
      {anyAddress && !fullAddress && <p className="text-xs md:col-span-3" style={{ color: 'var(--qs-warning)' }}>Finish the address (street, city, state and 5-digit ZIP), or clear it.</p>}

      <button type="submit" disabled={!ok || save.isPending} className="h-11 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50 md:col-start-3">
        {save.isPending ? 'Adding…' : 'Add partner'}
      </button>
      {save.error && <p className="text-sm text-red-500 md:col-span-3">{save.error.message}</p>}
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
        A household is one phone number, address or policy, paid once, in the month its first page arrives. It pays once you&apos;ve
        quoted it, or after {QUOTE_DAYS} days if nobody got to it. Pages that couldn&apos;t be read, repeats, Allstate policies, pages
        expired over 30 days and thrown-out scans don&apos;t count. Pay is on what they send, never on what they buy. Months under {dollars(MIN_PAYOUT)} carry over.
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
