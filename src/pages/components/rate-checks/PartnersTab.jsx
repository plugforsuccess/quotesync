// src/pages/components/rate-checks/PartnersTab.jsx
// "Partners" tab: people outside the agency (friends, influencers) who share a
// permanent Rate Check link and are paid a flat fee per qualified household —
// by the dec pages it sends, never by what it buys. Shows each partner's link,
// what they're owed this month, their close rate and cost per win, the pay
// schedule, and a yearly export of what was paid, for 1099s. Math lives in partnerPay.js.

import { T } from '../../../components/SiteCopy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, MessageSquare, MoreHorizontal, Plus, Star } from 'lucide-react';
import { partnerReviewText, smsHref } from '../../../lib/reviews';
import { buildText } from '../../../lib/textTemplates';
import Dismissible from '../../../components/Dismissible';
import {
  usePromoters, usePromoterScans, usePromoterRates, usePromoterPayouts,
  useRecruiters, useFloorSettings, useSavePromoter, useSavePromoterRates, useRecordPromoterPayout, useSetPromoterPhoto, partnerW9Url,
  usePartnerApplications, useCloseApplication, usePartnerRules, useSavePartnerRules,
} from '../../../hooks/useRateChecks';
import { downloadCSV } from '../../../lib/csvExport';
import { formatPhoneInput, isEmail, squarePhoto } from '../../../lib/rateCheckApi';
import { CopyTextButton } from './Copyable';
import { inviteUrl } from './invite';
import { PARTNER_AGREEMENT_REQUIRED } from '../../../lib/partnerProgram';
import SendPitch from './SendPitch';
import { activations, activatedCount, recruitUrl } from './partnerRecruiting';
import { inputStyle, money, formatPhone, formatDate } from './ui';
import {
  TIERS, EXTRA_LINE, EXTRA_LINE_CAP, TIER_LABEL, scheduleFrom, rulesFrom, households, partnerSummary, applyCap,
  monthsWithActivity, monthLabel, monthName, monthStart, currentMonth, payoutPlan, paidInYear, shortDate, PAY_DAY,
} from './partnerPay';

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const dollars = (n) => (n == null ? '—' : money(n, { cents: !Number.isInteger(n) }));

function Stat({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}><T>{label}</T></p>
      <p className="text-lg font-bold tabular-nums" style={{ color: tone || 'var(--qs-bright)' }}>{value}</p>
    </div>
  );
}

export default function PartnersTab({ agencyId, userId, canEdit, onOpenRateCheck, focusId = null }) {
  const { data: promoters = [], isLoading, error } = usePromoters(agencyId);
  const { data: scans = [] } = usePromoterScans(agencyId);
  const { data: rateRows = [] } = usePromoterRates(agencyId);
  const { data: payouts = [] } = usePromoterPayouts(agencyId);
  const { data: rulesRow } = usePartnerRules(agencyId);
  const rules = useMemo(() => rulesFrom(rulesRow), [rulesRow]);
  const savePromoter = useSavePromoter();
  const recordPayout = useRecordPromoterPayout();
  const { data: recruiters = [] } = useRecruiters(agencyId);
  const { data: floors } = useFloorSettings(agencyId);
  const nameOf = (uid) => recruiters.find(r => r.userId === uid)?.name || null;
  const activated = useMemo(() => activations(promoters, scans, Date.now(), rules), [promoters, scans, rules]);

  const schedule = useMemo(() => scheduleFrom(rateRows), [rateRows]);
  const now = currentMonth();
  const [month, setMonth] = useState(now);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(focusId);
  // The partner whose details are showing; the rest of the time, the list.
  const [selected, setSelected] = useState(focusId);

  // Opened from a partner's name on a lead: expand their card and bring it into view.
  useEffect(() => {
    if (!focusId || isLoading) return;
    setOpen(focusId);
    setSelected(focusId);
    // Scroll after the applications list above has had a moment to load and push the card down.
    const t = setTimeout(() => document.getElementById(`partner-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => clearTimeout(t);
  }, [focusId, isLoading]);

  const byPartner = useMemo(() => {
    const all = households(scans, schedule, Date.now(), rules);
    return Object.fromEntries(promoters.map(p => {
      // A partner's own household (same phone as the partner) is never paid as a referral.
      const own = (h) => !!p.phone && String(h.phone || '').replace(/\D/g, '').slice(-10) === String(p.phone).replace(/\D/g, '').slice(-10);
      const hh = applyCap(all.filter(h => h.promoterId === p.id && !own(h)), p.monthly_cap);
      const mine = payouts.filter(x => x.promoter_id === p.id);
      return [p.id, { hh, summary: partnerSummary(hh, month), plan: payoutPlan(hh, mine, month, rules.minPayout) }];
    }));
  }, [scans, schedule, promoters, month, payouts, rules]);
  const months = useMemo(() => monthsWithActivity(households(scans, schedule, Date.now(), rules), now), [scans, schedule, now, rules]);
  const paidFor = (promoterId) => payouts.find(x => x.promoter_id === promoterId && x.period === monthStart(month));
  const monthOwed = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.owed || 0), 0);
  const monthHouseholds = promoters.reduce((t, p) => t + (byPartner[p.id]?.summary.month.households || 0), 0);

  // 1099s count what was paid in the calendar year (by payment date), so a payout
  // that covers carried-over months is reported at its full amount.
  const year = Number(month.slice(0, 4));
  const paidThisYear = useMemo(() => paidInYear(payouts, year), [payouts, year]);
  const exportYear = () => {
    downloadCSV(`affiliate-1099-${year}.csv`, promoters.filter(p => paidThisYear[p.id]).map(p => {
      const t = paidThisYear[p.id];
      return {
        affiliate: p.name, phone: p.phone ? formatPhone(p.phone) : '', email: p.email || '',
        year, paid: t.amount.toFixed(2), payments: t.payments,
        months_covered: t.months.map(monthLabel).join('; '), last_paid: formatDate(t.lastPaid),
        w9_on_file: p.w9_received_at ? 'yes' : 'no', tin: p.w9_tin_last4 ? `${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} ending ${p.w9_tin_last4}` : '',
        agreement_signed: p.agreement_signed_at ? formatDate(p.agreement_signed_at) : 'no',
      };
    }));
  };

  if (isLoading) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.1448f6">Loading affiliates…</T></p>;
  if (error) return <p className="text-sm text-red-500">{error.message}</p>;

  return (
    <div className="space-y-4">
      <RecruitPanel userId={userId} recruiters={recruiters} activated={activated} floor={floors?.partners_floor ?? 2} canEdit={canEdit} month={now} />

      <Applications agencyId={agencyId} userId={userId} canEdit={canEdit} savePromoter={savePromoter} nameOf={nameOf} />

      <Dismissible id="partners.program-rules">
        <p className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--qs-warning)' }} aria-hidden="true" />
          <span><T k="pages.components.ratechecks.partnerstab.15dc1f">Affiliates are paid per qualified household they send, never per sale, and they don't discuss coverage or price. Confirm the program with Allstate compliance and your attorney before the first payment, and get a W-9 on file.</T></span>
        </p>
      </Dismissible>

      {promoters.length === 0 ? (
        /* No partners yet: one card, one button. */
        <div className="dark-card" style={{ padding: 20 }}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.partnerstab.811aa9">No Affiliates Yet</T></h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>
            <T k="pages.components.ratechecks.partnerstab.bbdbfa">Add someone who'll share your Rate Check link.</T> {PARTNER_AGREEMENT_REQUIRED ? <T k="pages.components.ratechecks.partnerstab.7c6168">{'They get a private portal to sign the agreement, then their own link that pays per household.'}</T> : <T k="pages.components.ratechecks.partnerstab.27e431">{'They get their own link that pays per household, and a private portal to see what they’ve earned.'}</T>}
          </p>
          {canEdit && !adding && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-[44px] w-[9.5rem] items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.partnerstab.fcd1b4">Add Affiliate</T>
              </button>
              <SendPitch className="min-h-[44px] w-[9.5rem] justify-center rounded-lg px-4" />
            </div>
          )}
          {adding && <AddPartner agencyId={agencyId} userId={userId} save={savePromoter} onDone={() => setAdding(false)} />}
        </div>
      ) : (
        /* This month, across partners */
        <div className="dark-card" style={{ padding: 16 }}>
          <div className="flex items-center justify-between gap-3">
            <label className="relative inline-flex items-center">
              <span className="sr-only"><T k="pages.components.ratechecks.partnerstab.7cbb88">Month</T></span>
              <select value={month} onChange={e => setMonth(e.target.value)}
                className="h-9 appearance-none rounded-full py-0 pl-3.5 pr-9 text-sm font-semibold"
                style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
            </label>
            {canEdit && (
              <span className="flex flex-wrap justify-end gap-2">
                <SendPitch className="h-9 w-[8.5rem] justify-center rounded-full px-3.5" />
                <button type="button" onClick={() => setAdding(a => !a)} aria-expanded={adding}
                  className="inline-flex h-9 w-[8.5rem] items-center justify-center gap-1.5 rounded-full bg-primary-600 px-3.5 text-sm font-semibold text-white hover:bg-primary-700">
                  <Plus className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.partnerstab.fcd1b4">Add Affiliate</T>
                </button>
              </span>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-3 divide-x overflow-hidden rounded-xl" style={{ background: 'var(--qs-elevated)', borderColor: 'var(--qs-border)' }}>
            {[['Affiliates', promoters.filter(p => p.active).length], ['Households', monthHouseholds], ['Owed', dollars(monthOwed)]].map(([k, v]) => (
              <div key={k} className="px-3 py-3 text-center" style={{ borderColor: 'var(--qs-border)' }}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--qs-subtle)' }}><T>{k}</T></dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{v}</dd>
              </div>
            ))}
          </dl>
          {Object.keys(paidThisYear).length > 0 && (
            <button type="button" onClick={exportYear} title={`What each affiliate was paid in ${year}, by payment date`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline">
              <Download className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.partnerstab.0095a9">Export</T> {year} <T k="pages.components.ratechecks.partnerstab.c18bab">payments For 1099s</T>
            </button>
          )}
          {adding && <AddPartner agencyId={agencyId} userId={userId} save={savePromoter} onDone={() => setAdding(false)} />}
        </div>
      )}

      {/* Every partner as a row; tap one for their links, numbers and settings. */}
      {promoters.length > 0 && !promoters.some(p => p.id === selected) && (
        <section className="dark-card overflow-hidden" style={{ padding: 0 }} aria-label="Affiliates">
          <ul>
            {promoters.map((p, i) => {
              const { summary: s, plan } = byPartner[p.id] || {};
              const paid = paidFor(p.id);
              const owed = paid ? Number(paid.amount) : (plan?.amount || 0) + (plan?.upcoming || 0);
              return (
                <li key={p.id} style={i ? { borderTop: '1px solid var(--qs-border)' } : undefined}>
                  <button type="button" onClick={() => { setSelected(p.id); window.scrollTo({ top: 0 }); }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--qs-elevated)] sm:gap-4 sm:px-5" style={{ opacity: p.active ? 1 : 0.6 }}>
                    <Avatar p={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold" style={{ color: 'var(--qs-bright)' }}>{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
                        {!p.active && <Pill><T k="pages.components.ratechecks.partnerstab.c7dfb6">Paused</T></Pill>}
                        {(PARTNER_AGREEMENT_REQUIRED || p.agreement_signed_at) && <Pill ok={!!p.agreement_signed_at}>{p.agreement_signed_at ? <T k="pages.components.ratechecks.partnerstab.6e3665">{'Signed'}</T> : <T k="pages.components.ratechecks.partnerstab.f0582a">{'Not signed'}</T>}</Pill>}
                        <Pill ok={!!p.w9_received_at}>{p.w9_received_at ? <T k="pages.components.ratechecks.partnerstab.6aff6f">{'W-9 on file'}</T> : <T k="pages.components.ratechecks.partnerstab.00fff8">{'W-9 needed'}</T>}</Pill>
                      </span>
                    </span>
                    <span className="hidden w-24 shrink-0 text-right sm:block">
                      <span className="block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{monthName(month)}</span>
                      <span className="block text-sm font-semibold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{s?.month.households || 0} {(s?.month.households || 0) === 1 ? <T k="pages.components.ratechecks.partnerstab.52996f">{'Household'}</T> : <T k="pages.components.ratechecks.partnerstab.dbb1c9">{'Households'}</T>}</span>
                    </span>
                    <span className="w-16 shrink-0 text-right sm:w-20">
                      <span className="block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{paid ? <T k="pages.components.ratechecks.partnerstab.dc9d45">{'Paid'}</T> : <T k="pages.components.ratechecks.partnerstab.89e255">{'Owed'}</T>}</span>
                      <span className="block text-sm font-bold tabular-nums" style={{ color: 'var(--qs-success)' }}>{dollars(owed)}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The open partner */}
      {promoters.filter(p => p.id === selected).map(p => {
        const { hh = [], summary: s, plan } = byPartner[p.id] || {};
        const paid = paidFor(p.id);
        const expanded = open === p.id;
        const monthRows = hh.filter(h => h.month === month);
        return (
          <section key={p.id} id={`partner-${p.id}`} className="dark-card scroll-mt-24" style={{ padding: 16, opacity: p.active ? 1 : 0.6 }}>
            <button type="button" onClick={() => setSelected(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {promoters.length > 1 ? <><T k="pages.components.ratechecks.partnerstab.1cdf51">{"All Affiliates ("}</T>{promoters.length}{")"}</> : <T k="pages.components.ratechecks.partnerstab.faff1a">{'All Affiliates'}</T>}
            </button>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <PartnerPhoto promoter={p} canEdit={canEdit} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{p.name}{!p.active && <span className="ml-2 text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.e99180">Paused</T></span>}</h3>
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{[p.phone && formatPhone(p.phone), p.email].filter(Boolean).join(' · ') || <T k="pages.components.ratechecks.partnerstab.e4f057">{'No contact on file'}</T>}</p>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                {(PARTNER_AGREEMENT_REQUIRED || p.agreement_signed_at) && <Pill ok={!!p.agreement_signed_at}>{p.agreement_signed_at ? <T k="pages.components.ratechecks.partnerstab.f4f566">{'Agreement signed'}</T> : <T k="pages.components.ratechecks.partnerstab.4c58cf">{'Agreement not signed'}</T>}</Pill>}
                <Pill ok={!!p.w9_received_at}>{p.w9_received_at ? <><T k="pages.components.ratechecks.partnerstab.6aff6f">{"W-9 on file"}</T>{p.w9_tin_last4 ? ` · ${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} …${p.w9_tin_last4}` : ''}</> : <T k="pages.components.ratechecks.partnerstab.00fff8">{'W-9 needed'}</T>}</Pill>
              </span>
            </div>
            <RecruitedBy promoter={p} recruiters={recruiters} canEdit={canEdit}
              onChange={(uid) => savePromoter.mutate({ id: p.id, agencyId, recruited_by: uid })} />
            {PARTNER_AGREEMENT_REQUIRED && !p.agreement_signed_at && (
              <Dismissible id={`partners.unsigned.${p.id}`}>
                <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
                  <T k="pages.components.ratechecks.partnerstab.89a58f">Their link doesn't earn anything until they sign. Send them their portal link: they sign there, then see their link and earnings.</T>
                </p>
              </Dismissible>
            )}

            <LinkRow label="Portal (private: send only to them)" url={portalUrl(p.portal_token)}
              sms={p.phone ? portalSms(p) : null} smsLabel={`Text ${p.name.split(' ')[0]}`} />
            <LinkRow label={!PARTNER_AGREEMENT_REQUIRED || p.agreement_signed_at ? 'Share link' : 'Share link · off until signed'} url={inviteUrl(p.code)}
              muted={PARTNER_AGREEMENT_REQUIRED && !p.agreement_signed_at}
              sms={p.phone ? smsHref(p.phone, `Your link to share: ${inviteUrl(p.code)}`) : null} smsLabel={`Text ${p.name.split(' ')[0]}`} />

            {p.phone && (
              <a href={smsHref(p.phone, partnerReviewText(p.name))} title="Opens Messages with your Google review link written in"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:underline">
                <Star className="h-3.5 w-3.5" aria-hidden="true" /> <T k="rc.partners.askreview">Ask for a Google review (if they’re a customer)</T>
              </a>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Households" value={s.month.households} />
              <Stat label="Owed" value={dollars(paid ? Number(paid.amount) : plan.amount + plan.upcoming)} tone="var(--qs-success)" />
              <Stat label="Status" value={paid ? 'Paid' : plan.amount > 0 ? (plan.underMinimum ? `Under ${dollars(rules.minPayout)}` : 'Due now') : plan.upcoming > 0 ? `Pays ${shortDate(plan.upcomingPayDay)}` : '—'} tone={paid ? 'var(--qs-success)' : undefined} />
            </div>
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
                  {monthRows.length} {monthRows.length === 1 ? <T k="pages.components.ratechecks.partnerstab.52996f">{'Household'}</T> : <T k="pages.components.ratechecks.partnerstab.dbb1c9">{'Households'}</T>} <T k="pages.components.ratechecks.partnerstab.13b5bf">in</T> {monthLabel(month)}
                </button>
              ) : (
                <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.ef6e5f">No households in</T> {monthLabel(month)} <T k="pages.components.ratechecks.partnerstab.58969e">yet.</T></span>
              )}
              {canEdit && (paid ? (
                <button type="button" disabled={recordPayout.isPending}
                  onClick={() => recordPayout.mutate({ agencyId, promoterId: p.id, months: [{ period: monthStart(month) }], userId, remove: true })}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={inputStyle}><T k="pages.components.ratechecks.partnerstab.16903d">Mark Unpaid</T></button>
              ) : plan.amount > 0 && !plan.underMinimum && !p.w9_received_at ? (
                <span className="text-xs font-semibold" style={{ color: 'var(--qs-warning)' }}><T k="pages.components.ratechecks.partnerstab.ff3f98">W-9 needed before paying</T> {dollars(plan.amount)}</span>
              ) : plan.amount > 0 && !plan.underMinimum ? (
                <button type="button" disabled={recordPayout.isPending}
                  onClick={() => recordPayout.mutate({ agencyId, promoterId: p.id, userId,
                    months: plan.months.map(m => ({ period: monthStart(m.month), households: m.households, amount: m.amount })) })}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white">
                  <T k="pages.components.ratechecks.partnerstab.b82a9a">Mark</T> {dollars(plan.amount)} <T k="pages.components.ratechecks.partnerstab.91fb8d">paid (</T>{plan.months.map(m => monthName(m.month)).join(', ')} <T k="pages.components.ratechecks.partnerstab.ec8311">activity)</T>
                </button>
              ) : plan.underMinimum ? (
                <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.02552d">Under</T> {dollars(rules.minPayout)} <T k="pages.components.ratechecks.partnerstab.6cffe4">· carries over</T></span>
              ) : null)}
            </div>

            {(recordPayout.error || savePromoter.error) && (recordPayout.variables?.promoterId === p.id || savePromoter.variables?.id === p.id) && (
              <p className="mt-2 text-sm text-red-500" role="alert"><T k="pages.components.ratechecks.partnerstab.5b5a0c">Couldn't save that:</T> {(recordPayout.error || savePromoter.error).message}</p>
            )}

            {/* Partner settings: what each one means, and one action each. */}
            {canEdit && (
              <dl className="mt-4 divide-y overflow-hidden rounded-xl" style={{ border: '1px solid var(--qs-border)', borderColor: 'var(--qs-border)' }}>
                <SettingRow label="W-9"
                  value={p.w9_received_at
                    ? `On file${p.w9_tin_last4 ? ` · ${p.w9_tin_type === 'ein' ? 'EIN' : 'SSN'} …${p.w9_tin_last4}` : ' (paper copy)'}`
                    : `Needed before the first payment. ${p.name.split(' ')[0]} can sign it in the portal.`}
                  tone={p.w9_received_at ? 'ok' : 'warn'}
                  action={p.w9_pdf_path
                    ? <SettingButton onClick={() => partnerW9Url(p.w9_pdf_path).then(url => window.open(url, '_blank', 'noopener')).catch(err => window.alert(err.message))}><T k="pages.components.ratechecks.partnerstab.c3bf44">Open</T></SettingButton>
                    : <SettingButton onClick={() => savePromoter.mutate({ id: p.id, agencyId, w9_received_at: p.w9_received_at ? null : new Date().toISOString() })}>
                        {p.w9_received_at ? <T k="pages.components.ratechecks.partnerstab.719ea3">{'Clear'}</T> : <T k="pages.components.ratechecks.partnerstab.448550">{'Got paper W-9'}</T>}
                      </SettingButton>} />
                <CapControl value={p.monthly_cap} onSave={(cap) => savePromoter.mutate({ id: p.id, agencyId, monthly_cap: cap })} />
                <SettingRow label="Share link"
                  value={p.active ? 'On. New scans from the link count toward pay.' : 'Paused. The link doesn\u2019t take new scans.'}
                  tone={p.active ? 'ok' : 'warn'}
                  action={<SettingButton onClick={() => savePromoter.mutate({ id: p.id, agencyId, active: !p.active })}>{p.active ? <T k="pages.components.ratechecks.partnerstab.781961">{'Pause'}</T> : <T k="pages.components.ratechecks.partnerstab.26563e">{'Turn on'}</T>}</SettingButton>} />
              </dl>
            )}

            {expanded && monthRows.length > 0 && (
              <ul className="mt-3 overflow-hidden rounded-lg" style={{ border: '1px solid var(--qs-border)' }}>
                {monthRows.map((h, i) => (
                  <li key={h.key} className="flex items-center justify-between gap-3 px-3 py-2.5" style={i ? { borderTop: '1px solid var(--qs-border)' } : undefined}>
                    <div className="min-w-0">
                      <button type="button" onClick={() => onOpenRateCheck?.(h.scans[0].id)} className="text-left text-sm font-semibold hover:underline" style={{ color: 'var(--qs-bright)' }}>
                        {h.firstName || <T k="pages.components.ratechecks.partnerstab.bc7819">{'Unknown'}</T>}
                        <span className="ml-1.5 font-normal" style={{ color: 'var(--qs-subtle)' }}>{h.phone ? formatPhone(h.phone) : ''}</span>
                      </button>
                      <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                        {h.tier ? TIER_LABEL[h.tier] : <T k="pages.components.ratechecks.partnerstab.be4b39">{'Not qualified'}</T>}{h.landlord ? ' + Landlord' : ''}{h.extras ? <>{" + "}{h.extras}{" "}<T k="pages.components.ratechecks.partnerstab.b43c4b">{"extra"}</T>{" "}{h.extras === 1 ? 'line' : 'lines'}</> : ''}
                        {h.overCap && <span style={{ color: 'var(--qs-warning)' }}> <T k="pages.components.ratechecks.partnerstab.49f11b">· over the monthly cap</T></span>}
                        {' · '}<span style={{ color: h.won ? 'var(--qs-success)' : undefined }}>{h.won ? <T k="pages.components.ratechecks.partnerstab.b273fb">{'Won'}</T> : h.quoted ? <T k="pages.components.ratechecks.partnerstab.8e06ee">{'Quoted'}</T> : <T k="pages.components.ratechecks.partnerstab.5d4986">{'Not quoted yet'}</T>}</span>
                        {rules.requireCallConfirm && h.tier && (
                          <span style={{ color: h.confirmed ? 'var(--qs-success)' : 'var(--qs-subtle)' }}>
                            {' · '}{h.confirmed ? <T k="pages.components.ratechecks.partnerstab.75a6eb">{'Replied Y'}</T> : h.texted ? <T k="pages.components.ratechecks.partnerstab.75d372">{'Waiting on Y'}</T> : <T k="pages.components.ratechecks.partnerstab.9f4495">{'Not texted yet'}</T>}
                          </span>
                        )}
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
      <PayoutRules agencyId={agencyId} userId={userId} rules={rules} canEdit={canEdit} />
    </div>
  );
}

const portalUrl = (token) => `${window.location.origin}/affiliate/${token}`;
// Opens the Messages app with the partner's portal link written in.
const portalSms = (p) => `sms:+1${p.phone}?&body=${encodeURIComponent(buildText('partnerWelcome', { name: p.name, portalLink: portalUrl(p.portal_token) }))}`;

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
          disabled={setPhoto.isPending} className="text-[11px] font-semibold text-primary-600"
          aria-label={photo ? `Remove ${first}'s photo` : `Add ${first}'s photo`}>
          {setPhoto.isPending ? <T k="pages.components.ratechecks.partnerstab.56a228">{'Saving…'}</T> : photo ? <T k="pages.components.ratechecks.partnerstab.e96390">{'Remove'}</T> : <T k="pages.components.ratechecks.partnerstab.560a4b">{'Add Photo'}</T>}
        </button>
      )}
      {error && <p className="max-w-[7rem] text-center text-[11px] text-red-500">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

// Status as plain text with a colored dot: green done, amber needed, gray otherwise.
function Pill({ ok, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: 'var(--qs-elevated)', color: 'var(--qs-text)' }}>
      <span className="h-2 w-2 rounded-full" style={{ background: ok ? '#16A34A' : ok === false ? '#F59E0B' : '#94A3B8' }} aria-hidden="true" />{children}
    </span>
  );
}

// A partner's photo (with their OK) or initials, for the list.
function Avatar({ p }) {
  const photo = p.photo_consent_at ? p.photo_url : null;
  const initials = String(p.name).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold"
      style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }} aria-hidden="true">
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

// A link on an affiliate's card: one row; tapping it opens a drawer with Copy, Text and Open.
function LinkRow({ label, url, muted = false, sms = null, smsLabel = 'Text' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* old browser */ }
  };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const big = 'flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-semibold';
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}><T>{label}</T></p>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${label}: Copy, Text or Open`}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', opacity: muted ? 0.55 : 1 }}>
        <span className="min-w-0 flex-1 truncate font-mono text-sm" style={{ color: 'var(--qs-cyan)' }}>{url}</span>
        <MoreHorizontal className="h-4 w-4 shrink-0" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl p-5 pb-7 shadow-2xl sm:rounded-3xl" style={{ background: 'var(--qs-card)', color: 'var(--qs-text)' }}>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full sm:hidden" style={{ background: 'var(--qs-border)' }} aria-hidden="true" />
            <p className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T>{label}</T></p>
            <p className="mt-1 break-all font-mono text-sm" style={{ color: 'var(--qs-cyan)' }}>{url}</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button type="button" onClick={copy} className={big} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                {copied ? <T k="rc.partners.link.copied">Copied</T> : <T k="rc.partners.link.copy">Copy</T>}
              </button>
              {sms ? (
                <a href={sms} onClick={() => setOpen(false)} className={big} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                  <MessageSquare className="h-5 w-5" aria-hidden="true" /> {smsLabel}
                </a>
              ) : (
                <span className={`${big} opacity-40`} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }} title="No mobile number on file">
                  <MessageSquare className="h-5 w-5" aria-hidden="true" /> <T k="rc.partners.link.text">Text</T>
                </span>
              )}
              <a href={url} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={big} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
                <ExternalLink className="h-5 w-5" aria-hidden="true" /> <T k="rc.partners.link.open">Open</T>
              </a>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-xl py-3 text-sm font-semibold" style={{ color: 'var(--qs-subtle)' }}>
              <T k="rc.partners.link.close">Close</T>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// One labeled setting on a partner's card: what it is, where it stands, one action.
function SettingRow({ label, value, tone, action, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderColor: 'var(--qs-border)' }}>
      <div className="min-w-0">
        <dt className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T>{label}</T></dt>
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
          <SettingButton onClick={() => { onSave(draft ? Number(draft) : null); setEditing(false); }}><T k="pages.components.ratechecks.partnerstab.c9cc8c">Save</T></SettingButton>
        </span>
      ) : <SettingButton onClick={() => { setDraft(value ?? ''); setEditing(true); }}>{value ? <T k="pages.components.ratechecks.partnerstab.64fbd9">{'Change'}</T> : <T k="pages.components.ratechecks.partnerstab.634082">{'Set limit'}</T>}</SettingButton>} />
  );
}

// What applicants said about being with Allstate (and with us).
const CUSTOMER_BADGE = {
  agency: 'Cam Wiley Agency customer', yes: 'Allstate customer', allstate_other: 'Allstate · another agent',
  allstate_unsure: 'Allstate · agent unknown', no: 'Not with Allstate',
};

// People who asked to join from the Drivers Ed page. "Add as partner" makes the partner
// (same as Add partner) and closes the application; then send them their portal link.
// The partner floor (Schedule B): each producer's own "Become a Partner" link and how many
// partners they've activated this month. Activated = signed the agreement AND sent a
// qualified household. Managers also see everyone's count.
function FloorSlots({ count, floor, size = 'md' }) {
  // One slot per partner owed; filled as they activate. Past the floor, a "+n".
  const big = size === 'md';
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: floor }, (_, i) => (
        <span key={i} className={`${big ? 'h-2.5 w-8' : 'h-1.5 w-5'} rounded-full`}
          style={{ background: i < count ? (count >= floor ? 'var(--qs-success)' : 'var(--qs-info)') : 'var(--qs-border)' }} />
      ))}
      {count > floor && <span className="text-xs font-bold" style={{ color: 'var(--qs-success)' }}>+{count - floor}</span>}
    </span>
  );
}

function RecruitPanel({ userId, recruiters, activated, floor, canEdit, month }) {
  const me = recruiters.find(r => r.userId === userId);
  if (!me) return null;
  const mine = activatedCount(activated, userId, month);
  const team = recruiters
    .filter(r => ['producer', 'principal', 'manager', 'owner'].includes(r.role))
    .map(r => ({ ...r, count: activatedCount(activated, r.userId, month) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const met = mine >= floor;
  const link = me.code ? recruitUrl(me.code) : null;
  const pitch = link ? `Want to earn money sharing a free insurance rate check with people you know? Apply to be a Cam Wiley Agency affiliate: ${link}` : '';
  return (
    <section className="dark-card" style={{ padding: 0 }} aria-label="Affiliate floor">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T k="partners.floor.title">Your Affiliate Floor</T></h3>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-subtle)' }}>{monthName(month)}</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <p className="tabular-nums leading-none" style={{ color: met ? 'var(--qs-success)' : 'var(--qs-bright)' }}>
            <span className="text-[34px] font-extrabold">{mine}</span>
            <span className="ml-1 text-lg font-semibold" style={{ color: 'var(--qs-subtle)' }}><T k="partners.floor.of">of</T> {floor}</span>
          </p>
          <div className="min-w-0">
            <FloorSlots count={mine} floor={floor} />
            <p className="mt-1.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
              {met ? <T k="partners.floor.met">Floor met this month.</T> : <>{floor - mine} <T k="partners.floor.togo">more to activate this month.</T></>}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--qs-text)' }}>
          <T k="partners.floor.line">An affiliate counts once they sign the agreement and send a qualified household.</T>
        </p>
        {link && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CopyTextButton text={link} className="min-h-[44px] justify-center whitespace-nowrap rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700">
              <T k="partners.floor.copy">Copy Link</T>
            </CopyTextButton>
            <a href={smsHref('', pitch)} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
              style={{ border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> <T k="partners.floor.text">Text It</T>
            </a>
          </div>
        )}
      </div>
      {canEdit && team.length > 1 && (
        <div style={{ borderTop: '1px solid var(--qs-border)' }}>
          <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] sm:px-5" style={{ color: 'var(--qs-subtle)' }}><T k="partners.floor.team">Team This Month</T></p>
          <ul className="px-4 pb-2 sm:px-5" aria-label="Team affiliate floor">
            {team.map((r, i) => (
              <li key={r.userId} className="flex items-center gap-3 py-2.5" style={i ? { borderTop: '1px solid var(--qs-border)' } : undefined}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--qs-text)' }}>{r.name}</span>
                <FloorSlots count={r.count} floor={floor} size="sm" />
                <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: r.count >= floor ? 'var(--qs-success)' : 'var(--qs-subtle)' }}>{r.count} / {floor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Who recruited this partner (credited with them and the households they send).
function RecruitedBy({ promoter: p, recruiters, canEdit, onChange }) {
  const name = recruiters.find(r => r.userId === p.recruited_by)?.name;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
      <label htmlFor={`recruited-${p.id}`} className="text-sm font-medium" style={{ color: 'var(--qs-subtle)' }}><T k="partners.recruited-by">Recruited By</T></label>
      {canEdit ? (
        <select id={`recruited-${p.id}`} value={p.recruited_by || ''} onChange={(e) => onChange(e.target.value || null)}
          className="min-h-[36px] min-w-[10rem] rounded-lg px-2.5 text-sm font-semibold" style={inputStyle} aria-label={`Recruited by, for ${p.name}`}>
          <option value="">Nobody</option>
          {recruiters.map(r => <option key={r.userId} value={r.userId}>{r.name}</option>)}
        </select>
      ) : (
        <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{name || '—'}</span>
      )}
    </div>
  );
}

function Applications({ agencyId, userId, canEdit, savePromoter, nameOf }) {
  const { data: apps = [] } = usePartnerApplications(agencyId);
  const close = useCloseApplication();
  const [busy, setBusy] = useState(null);
  if (!apps.length) return null;
  const add = (a) => {
    setBusy(a.id);
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
    // Credited to the producer whose recruit link they applied through (none if they found the page themselves).
    savePromoter.mutate({ agencyId, userId, name, phone: a.phone, email: a.email || '', recruited_by: a.recruited_by || null }, {
      onSuccess: (row) => close.mutate({ id: a.id, status: 'added', promoterId: row?.id, agencyId }, { onSettled: () => setBusy(null) }),
      onError: () => setBusy(null),
    });
  };
  return (
    <section className="dark-card" style={{ padding: 16 }} aria-label="Affiliate applications">
      <h3 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>
        {apps.length === 1 ? <T k="pages.components.ratechecks.partnerstab.b1357a">{'1 Person Wants to Be an Affiliate'}</T> : <>{apps.length}{" "}<T k="pages.components.ratechecks.partnerstab.398113">{"People Want to Be Affiliates"}</T></>}
      </h3>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.28fa07">From the Drivers Ed page. Add them, then send them their portal link.</T></p>
      <ul className="mt-3 space-y-2">
        {apps.map(a => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--qs-elevated)' }}>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>
                {[a.first_name, a.last_name].filter(Boolean).join(' ')}
                {CUSTOMER_BADGE[a.is_customer] && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold" style={a.is_customer === 'agency' ? { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)' } : { color: 'var(--qs-text)', background: 'var(--qs-card)' }}>{CUSTOMER_BADGE[a.is_customer]}</span>}
              </p>
              <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                {[formatPhone(a.phone), a.email, a.audience, `applied ${formatDate(a.created_at)}`, a.recruited_by && `via ${nameOf(a.recruited_by) || 'a recruit link'}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => close.mutate({ id: a.id, status: 'dismissed', agencyId })} disabled={busy === a.id}
                  className="min-h-[36px] rounded-lg px-3 text-sm font-semibold" style={inputStyle}><T k="pages.components.ratechecks.partnerstab.c8a59e">Dismiss</T></button>
                <button type="button" onClick={() => add(a)} disabled={busy === a.id}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
                  <Plus className="h-4 w-4" aria-hidden="true" /> {busy === a.id ? <T k="pages.components.ratechecks.partnerstab.ffb2e6">{'Adding…'}</T> : <T k="pages.components.ratechecks.partnerstab.840a9d">{'Add As Affiliate'}</T>}
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
  const [form, setForm] = useState({ first: '', last: '', phone: '', email: '', street: '', city: '', state: 'GA', zip: '' });
  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === 'phone') v = formatPhoneInput(v);
    if (k === 'state') v = v.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
    if (k === 'zip') v = v.replace(/\D/g, '').slice(0, 5);
    setForm(f => ({ ...f, [k]: v }));
  };
  const anyAddress = form.street.trim() || form.city.trim() || form.zip;
  const fullAddress = form.street.trim() && form.city.trim() && /^[A-Z]{2}$/.test(form.state) && form.zip.length === 5;
  const name = `${form.first.trim()} ${form.last.trim()}`.replace(/\s+/g, ' ').trim();
  const ok = form.first.trim() && form.last.trim() && (!form.email || isEmail(form.email)) && (!form.phone || form.phone.replace(/\D/g, '').length === 10)
    && (!anyAddress || fullAddress);
  const field = 'w-full rounded-lg px-3 py-2.5 text-sm';
  const Label = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold" style={{ color: 'var(--qs-dim)' }}>{children}</label>;
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    save.mutate({
      agencyId, userId, name, phone: form.phone, email: form.email,
      recruited_by: userId, // whoever adds a partner recruited them; change it on the partner's card
      mailing_address: fullAddress ? form.street : '',
      mailing_city_state_zip: fullAddress ? `${form.city.trim()}, ${form.state} ${form.zip}` : '',
    }, { onSuccess: onDone });
  };
  return (
    <form className="mt-4 grid gap-3 rounded-lg p-3 md:grid-cols-3" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }} onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 md:col-span-3">
        <div><Label htmlFor="ap-first"><T k="pages.components.ratechecks.partnerstab.5352a6">First name *</T></Label>
          <input id="ap-first" className={field} style={inputStyle} value={form.first} onChange={set('first')} required autoComplete="off" /></div>
        <div><Label htmlFor="ap-last"><T k="pages.components.ratechecks.partnerstab.4bc190">Last name *</T></Label>
          <input id="ap-last" className={field} style={inputStyle} value={form.last} onChange={set('last')} required autoComplete="off" /></div>
      </div>
      <p className="-mt-1 text-xs md:col-span-3" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.b7c3f8">Use their legal name: it goes on their W-9 and 1099.</T></p>
      <div className="grid gap-3 sm:grid-cols-2 md:col-span-3">
      <div><Label htmlFor="ap-phone"><T k="pages.components.ratechecks.partnerstab.87d17f">Mobile</T></Label>
        <input id="ap-phone" className={field} style={inputStyle} inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="off" />
        {form.phone && form.phone.replace(/\D/g, '').length !== 10 && <p className="mt-1 text-xs" style={{ color: 'var(--qs-warning)' }}><T k="pages.components.ratechecks.partnerstab.9b86de">Enter all 10 digits.</T></p>}</div>
      <div><Label htmlFor="ap-email"><T k="pages.components.ratechecks.partnerstab.ce8ae9">Email</T></Label>
        <input id="ap-email" className={field} style={inputStyle} type="email" value={form.email} onChange={set('email')} autoComplete="off" />
        {form.email && !isEmail(form.email) && <p className="mt-1 text-xs" style={{ color: 'var(--qs-warning)' }}><T k="pages.components.ratechecks.partnerstab.d16dca">That email doesn't look right, like name@yahoo.com.</T></p>}</div>
      </div>

      <p className="-mb-1 mt-1 text-xs md:col-span-3" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.1c76b0">Mailing address (optional): fills in their W-9 so they only add their SSN and sign.</T></p>
      <div className="md:col-span-3"><Label htmlFor="ap-street"><T k="pages.components.ratechecks.partnerstab.669a90">Street address</T></Label>
        <input id="ap-street" className={field} style={inputStyle} value={form.street} onChange={set('street')} autoComplete="off" /></div>
      <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-2 md:col-span-3">
        <div><Label htmlFor="ap-city"><T k="pages.components.ratechecks.partnerstab.57d056">City</T></Label>
          <input id="ap-city" className={field} style={inputStyle} value={form.city} onChange={set('city')} autoComplete="off" /></div>
        <div><Label htmlFor="ap-state"><T k="pages.components.ratechecks.partnerstab.46a2a4">State</T></Label>
          <input id="ap-state" className={`${field} uppercase`} style={inputStyle} value={form.state} onChange={set('state')} autoComplete="off" /></div>
        <div><Label htmlFor="ap-zip"><T k="pages.components.ratechecks.partnerstab.4348f9">ZIP</T></Label>
          <input id="ap-zip" className={`${field} tabular-nums`} style={inputStyle} inputMode="numeric" value={form.zip} onChange={set('zip')} autoComplete="off" /></div>
      </div>
      {anyAddress && !fullAddress && <p className="text-xs md:col-span-3" style={{ color: 'var(--qs-warning)' }}><T k="pages.components.ratechecks.partnerstab.4ff75f">Finish the address (street, city, state and 5-digit ZIP), or clear it.</T></p>}

      <button type="submit" disabled={!ok || save.isPending} className="h-11 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50 md:col-start-3">
        {save.isPending ? <T k="pages.components.ratechecks.partnerstab.ffb2e6">{'Adding…'}</T> : <T k="pages.components.ratechecks.partnerstab.1fb935">{'Add Affiliate'}</T>}
      </button>
      {save.error && <p className="text-sm text-red-500 md:col-span-3">{save.error.message}</p>}
    </form>
  );
}

// The agency's payout rules: when a household becomes payable, which pages count,
// and the smallest payout. The fixed rules (what a household is, what never counts)
// are listed underneath so the whole policy reads in one place.
// The "needs texting set up" note under the payout rules: hidden (Cam knows Twilio isn't live).
const SHOW_TEXTING_ALERT = false;

function RuleRow({ title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5 sm:gap-10" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T>{title}</T></p>
        {hint && <p className="text-xs leading-snug" style={{ color: 'var(--qs-subtle)' }}><T>{hint}</T></p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PayoutRules({ agencyId, userId, rules, canEdit }) {
  const saveRules = useSavePartnerRules();
  const [draft, setDraft] = useState(null);
  const v = draft || rules;
  const set = (k) => (e) => setDraft(d => ({ ...(d || rules), [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value.replace(/[^\d.]/g, '') }));
  const num = (k, aria, prefix = '', suffix = '') => (draft
    ? <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--qs-subtle)' }}>{prefix}
        <input inputMode="decimal" value={v[k]} onChange={set(k)} aria-label={aria}
          className="w-16 rounded px-2 py-1 text-right text-sm tabular-nums" style={inputStyle} />{suffix && <>{' '}<T>{suffix.trim()}</T></>}</span>
    : <span className="text-base font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{prefix}{v[k]}{suffix && <>{' '}<T>{suffix.trim()}</T></>}</span>);
  return (
    <section className="dark-card" style={{ padding: 16 }} aria-label="Payout rules">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.4b8f92">Payout Rules</T></h3>
        {canEdit && !draft && <button type="button" onClick={() => setDraft({ ...rules })} className="text-sm font-semibold text-primary-600"><T k="pages.components.ratechecks.partnerstab.7dce12">Edit</T></button>}
      </div>
      <div className="mt-2">
        <RuleRow title="Pay only after the customer replies Y"
          hint="When their quote is ready we text them; a household pays once they reply Y to set up a call.">
          {draft
            ? <input type="checkbox" checked={!!v.requireCallConfirm} onChange={set('requireCallConfirm')} aria-label="Pay only after the customer replies Y" className="h-5 w-5 accent-blue-600" />
            : <span className="text-sm font-bold" style={{ color: v.requireCallConfirm ? 'var(--qs-success)' : 'var(--qs-subtle)' }}>{v.requireCallConfirm ? <T k="pages.components.ratechecks.partnerstab.e0049a">{'On'}</T> : <T k="pages.components.ratechecks.partnerstab.e3de5a">{'Off'}</T>}</span>}
        </RuleRow>
        {!v.requireCallConfirm && (
          <RuleRow title="Otherwise pays once quoted, or after" hint="So a slow week at the desk doesn't cost the affiliate.">
            {num('quoteDays', 'Days before an unquoted household pays', '', ' days')}
          </RuleRow>
        )}
        <RuleRow title="Expired pages count for" hint="A dec page expired longer ago than this doesn't count.">
          {num('expiredDays', 'Days an expired page still counts', '', ' days')}
        </RuleRow>
        <RuleRow title="Smallest payout" hint="Months under this carry over to the next payout.">
          {num('minPayout', 'Smallest payout', '$')}
        </RuleRow>
      </div>
      {SHOW_TEXTING_ALERT && v.requireCallConfirm && (
        <Dismissible id="partners.needs-texting">
          <p className="mt-2 rounded-lg px-3 py-2 text-xs leading-snug" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', color: 'var(--qs-text)' }}>
            <T k="pages.components.ratechecks.partnerstab.30f8f7">Needs texting set up: until the agency has a Twilio number, the quote-ready text can't go out, so no one can reply Y and affiliates aren't paid.</T>
          </p>
        </Dismissible>
      )}
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-snug" style={{ color: 'var(--qs-subtle)' }}>
        <li><T k="pages.components.ratechecks.partnerstab.5b1959">A household is one phone number, address or policy, paid once, in the month its first page arrives.</T></li>
        <li><T k="pages.components.ratechecks.partnerstab.c95e1e">Unreadable pages, repeats, current Allstate policies and thrown-out scans never count.</T></li>
        <li><T k="pages.components.ratechecks.partnerstab.3b2027">Pay is on what the household sends, never on what it buys.</T></li>
        <li><T k="pages.components.ratechecks.partnerstab.5142f7">Each month's activity is paid on the</T> {PAY_DAY}<T k="pages.components.ratechecks.partnerstab.55a395">st of the following month: October activity pays November</T> {PAY_DAY}<T k="pages.components.ratechecks.partnerstab.3a9a5c">, November activity pays December</T> {PAY_DAY}.</li>
      </ul>
      {draft && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}><T k="pages.components.ratechecks.partnerstab.ea4788">Cancel</T></button>
          <button type="button" disabled={saveRules.isPending}
            onClick={() => saveRules.mutate({ agencyId, userId, rules: draft }, { onSuccess: () => setDraft(null) })}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><T k="pages.components.ratechecks.partnerstab.0f671f">Save Rules</T></button>
        </div>
      )}
      {saveRules.error && <p className="mt-2 text-sm text-red-500">{saveRules.error.message}</p>}
    </section>
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
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.partnerstab.2ee376">Pay Schedule · Per Qualified Household</T></h3>
        {canEdit && !draft && <button type="button" onClick={() => setDraft({ ...schedule })} className="text-sm font-semibold text-primary-600"><T k="pages.components.ratechecks.partnerstab.7dce12">Edit</T></button>}
      </div>
      <dl className="mt-2">
        {rows.map(t => (
          <div key={t.key} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: '1px solid var(--qs-border)' }}>
            <dt className="text-sm" style={{ color: 'var(--qs-text)' }}>
              {/* One editable piece per row (the extra-line row used to be split in three, easy to garble). */}
              {t.key === EXTRA_LINE.key
                ? <T k="pages.components.ratechecks.partnerstab.extra-lines-row">{`Additional lines, up to ${EXTRA_LINE_CAP}`}</T>
                : <T>{t.label}</T>}
            </dt>
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
      {draft && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}><T k="pages.components.ratechecks.partnerstab.ea4788">Cancel</T></button>
          <button type="button" disabled={saveRates.isPending}
            onClick={() => saveRates.mutate({ agencyId, schedule: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v) || 0])) }, { onSuccess: () => setDraft(null) })}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><T k="pages.components.ratechecks.partnerstab.ba40c5">Save Schedule</T></button>
        </div>
      )}
      {saveRates.error && <p className="mt-2 text-sm text-red-500">{saveRates.error.message}</p>}
    </section>
  );
}
