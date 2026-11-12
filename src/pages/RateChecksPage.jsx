// src/pages/RateChecksPage.jsx
// Rate Checks inbox — consumer dec-page uploads (insuredbycam.com/ratecheck).
// Agents copy the policy into an Allstate quote, enter Allstate's price, and
// the outcome (won → call, lost → polite auto-text) is handled by rate-check-outcome.

import { T } from '../components/SiteCopy';
import { customerReviewText, smsHref } from '../lib/reviews';
import { buildText } from '../lib/textTemplates';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { relationshipLine, referrerLabel } from '../lib/relationship';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowRight, BadgeDollarSign, Bell, Camera, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Handshake, History, Link2, Mail, Map as MapIcon,
  MessageSquare, Pencil, Phone, RefreshCw, Search, Send, SlidersHorizontal, Star, Upload, Users, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentAgency } from '../hooks/useAgencyLeads';
import { useEnabledFeatures } from '../hooks/useFeaturePermissions';
import {
  useRateChecks, useRateCheckImageUrl, useUpdateRateCheck, usePromoters,
  useEnterRateCheckQuote, annualize, useRescanRateCheck, useBindRateCheck,
} from '../hooks/useRateChecks';
import { sanitizeMoneyInput, parseMoney } from '../lib/money';
import { HOUSING_LABEL } from '../lib/rateCheckApi';
import PageSpinner from '../components/PageSpinner';
import { thCls, thStyle, inputStyle, money, formatPhone, CARD_STYLE } from './components/rate-checks/ui';
import { insuredName } from './components/rate-checks/policyView';
import {
  STATUS, CONFIDENCE_WARNING, TERM_HINT, DECISION,
  isSelectingText, POLICY_TYPES, policyTypeLabel, CARRIERS, carrierLabel,
} from './components/rate-checks/format';
import { CopyButton, CopyTextButton, Field } from './components/rate-checks/Copyable';
import CompetitorAgents from './components/rate-checks/CompetitorAgents';
import ReferralPartners from './components/rate-checks/ReferralPartners';
import PartnersTab from './components/rate-checks/PartnersTab';
import ScriptsTab from './components/rate-checks/ScriptsTab';
import TextsTab from './components/rate-checks/TextsTab';
import { CurrentAgentBox, ReferralBox } from './components/rate-checks/DrawerExtras';
import AgentUploadDialog from './components/rate-checks/AgentUploadDialog';
import DecisionCard, { DecisionChip } from './components/rate-checks/DecisionCard';
import WinMap from './components/rate-checks/WinMapTab';
import PolicySheet from './components/rate-checks/PolicySheet';
import Carousel from './components/rate-checks/Carousel';
import { GoalHeader, HouseholdCard, LiveDelta } from './components/rate-checks/QuoteCards';
import { looksTooLow, savings } from './components/rate-checks/quoteMath';
import RulesTab from './components/rate-checks/RulesTab';
import InviteDialog from './components/rate-checks/InviteDialog';
import LogQuote from './components/sales/LogQuote';
import ContactStep from './components/sales/ContactStep';
import CloseStep from './components/sales/CloseStep';
import LeadHistory from './components/sales/LeadHistory';
import { TEXT_FROM_OWN_PHONE } from '../lib/textingMode';
import { scannerProblem } from '../lib/scanErrors';
import InvitesTab from './components/rate-checks/InvitesTab';

const OPEN_STATUSES = ['extracted', 'pending', 'extract_failed'];
const FILTERS = [
  { value: 'open', label: 'Needs Quote', statuses: OPEN_STATUSES },
  { value: 'won', label: 'Wins', statuses: ['won', 'bound'] },
  { value: 'lost', label: 'Can’t Beat', short: 'Lost', statuses: ['lost'] },
  { value: 'all', label: 'All', statuses: null },
];
// The consumer page says we text "typically within 30 mins during business hours".
const OVERDUE_MINUTES = 30;


const heading = 'mb-1 text-base font-semibold';

// Re-render every minute so "waiting" times stay current.
function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function minutesSince(ts, now) {
  return ts ? Math.max(0, Math.round((now - new Date(ts).getTime()) / 60000)) : null;
}

function ageText(mins) {
  if (mins == null) return '—';
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

// "12 min ago" for done items; open items show how long the customer has waited.
function Age({ rc, now }) {
  const mins = minutesSince(rc.created_at, now);
  const open = OPEN_STATUSES.includes(rc.status);
  if (open && mins >= OVERDUE_MINUTES) {
    return <span className="whitespace-nowrap font-semibold text-red-500" title="The page says we typically text within 30 minutes"><T k="pages.ratecheckspage.5706de">Waiting</T> {ageText(mins)}</span>;
  }
  return <span style={{ color: 'var(--qs-text)' }}>{mins < 1 ? <T k="pages.ratecheckspage.a69f48">{'Just now'}</T> : <>{ageText(mins)}{" "}<T k="pages.ratecheckspage.f03c0a">{"ago"}</T></>}</span>;
}

function StatusChip({ status, quiet = false }) {
  const c = STATUS[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  if (quiet) return <span className="whitespace-nowrap text-sm font-medium" style={{ color: 'var(--qs-subtle)' }}><T>{c.label}</T></span>;
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${c.cls}`}><T>{c.label}</T></span>;
}

// delta = current − Allstate, so positive means the customer saves.
function Savings({ delta }) {
  if (delta == null) return <span style={{ color: 'var(--qs-subtle)' }}>—</span>;
  const n = Number(delta);
  return n > 0
    ? <span className="font-semibold text-green-600">{money(n)}</span>
    : <span className="text-red-500"><T k="pages.ratecheckspage.141fa1">Allstate</T> {money(Math.abs(n))} <T k="pages.ratecheckspage.addec4">more</T></span>;
}

function StaffTag() {
  return (
    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-subtle)' }}
      title="Uploaded by staff — no texting consent on file"><T k="pages.ratecheckspage.25f6ed">staff upload</T></span>
  );
}

// "via Marcus · Gwinnett expo" — where a rate check came from.
// A partner's full name as entered: "Javon Smith" (staff screens only; the public
// share-link page shows just their first name).
const partnerName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

// Only when it's close: the soonest renewal within 30 days ("Renews in 12 days").
// Further out, or unknown, shows nothing.
function renewalSoon(policies, now) {
  const DAY = 86400000;
  const soonest = policies.map(p => p.expiration_date).filter(Boolean)
    .map(d => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd).getTime(); })
    .filter(t => Number.isFinite(t) && t >= now - DAY)
    .sort((a, b) => a - b)[0];
  if (soonest == null) return null;
  const days = Math.max(0, Math.ceil((soonest - now) / DAY));
  if (days > 30) return null;
  return { text: days === 0 ? 'Renews today' : `Renews in ${days} day${days === 1 ? '' : 's'}`, urgent: days <= 14 };
}

// One small pill style for the card: neutral by default, red for "we owe a reply",
// amber for a renewal that's close.
const PILL_TONE = {
  neutral: { background: 'var(--qs-elevated)', color: 'var(--qs-dim)' },
  red: { background: '#FEF2F2', color: '#B91C1C' },
  amber: { background: '#FFFBEB', color: '#B45309' },
};
function CardPill({ tone = 'neutral', title, label, children }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-5" style={PILL_TONE[tone]} title={title} aria-label={label}>{children}</span>;
}

// How long they've been waiting on us for a quote: red once it's past the 30 minutes
// the page promises, neutral before.
function WaitPill({ rc, now }) {
  const mins = minutesSince(rc.created_at, now);
  return (
    <CardPill tone={mins >= OVERDUE_MINUTES ? 'red' : 'neutral'} title="How long they've been waiting on us for a quote" label={`Waiting on us for a quote: ${ageText(mins)}`}>
      <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{mins < 1 ? <T k="pages.ratecheckspage.a69f48">{'Just now'}</T> : <><T k="pages.ratecheckspage.33d306">{"Waiting"}</T>{" "}{ageText(mins)}</>}
    </CardPill>
  );
}

// "Stephen Pearson": the first name they typed plus the last name off their dec page
// ("PEARSON, STEPHEN & JOCELYN" → Pearson). Falls back to whichever part we have.
const properCase = (w) => w.toLowerCase().replace(/(^|[-'])([a-z])/g, (m, sep, c) => sep + c.toUpperCase());
function personName(first, policies) {
  const raw = (policies || []).map(p => p.extracted?.insured_name).find(Boolean);
  const words = raw ? String(insuredName(raw) || '').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean) : [];
  const core = words.filter(w => !/^(JR|SR|II|III|IV)$/i.test(w));
  const last = core.length > 1 ? properCase(core[core.length - 1]) : null;
  const firstName = first ? properCase(String(first).trim().split(/\s+/)[0]) : (core[0] ? properCase(core[0]) : null);
  if (!firstName) return last;
  return last && last.toLowerCase() !== firstName.toLowerCase() ? `${firstName} ${last}` : firstName;
}

// Whose policy it is and how the sender knows the affiliate. Read on its own so the
// drawer never depends on these newer columns.
function useWho(rcId) {
  return useQuery({
    queryKey: ['rate_check_who', rcId],
    enabled: !!rcId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: row, error } = await supabase.from('rate_checks')
        .select('policyholder_name, contact_relationship, contact_relationship_other, referrer_relationship, referrer_relationship_other')
        .eq('id', rcId).maybeSingle();
      return error ? null : row;
    },
  }).data;
}

// Under the name in the drawer: who referred them, and whose policy it is when it isn't theirs.
// How they know the affiliate, the event and the producer are on the quote sheet.
function WhoIsWho({ rc }) {
  const data = useWho(rc.id);
  const holder = data?.contact_relationship && data.contact_relationship !== 'self'
    ? relationshipLine(data.contact_relationship, data.contact_relationship_other, data.policyholder_name) : null;
  const lines = [
    rc.promoter_name && <><T k="pages.ratecheckspage.36e9b1">Referred by</T> <span className="font-medium" style={{ color: 'var(--qs-dim)' }}>{partnerName(rc.promoter_name)}</span></>,
    holder && <>{holder}{data.contact_relationship === 'other' ? <T k="pages.ratecheckspage.7e70a2">{' · confirm they can make changes'}</T> : ''}</>,
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

// The quote sheet's "Where They Came From" rows.
function useOrigin(rc) {
  const data = useWho(rc.promoter_name ? rc.id : null);
  const first = rc.promoter_name ? partnerName(rc.promoter_name).split(' ')[0] : null;
  return [
    rc.promoter_name && ['Referred by', partnerName(rc.promoter_name)],
    rc.promoter_name && [`How they know ${first}`, referrerLabel(data?.referrer_relationship, data?.referrer_relationship_other)],
    rc.event_name && ['Event', rc.event_name],
    rc.producer_name && ['Producer', rc.producer_name.split(' ')[0]],
  ].filter(Boolean);
}

function OriginTag({ rc, className = '' }) {
  if (!rc.producer_name && !rc.event_name && !rc.promoter_name) return null;
  const text = [rc.promoter_name && `Referred by ${partnerName(rc.promoter_name)}`, rc.event_name, rc.producer_name && `via ${rc.producer_name.split(' ')[0]}`].filter(Boolean).join(' · ');
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`} style={{ color: 'var(--qs-subtle)' }} title={[rc.event_name, rc.producer_name].filter(Boolean).join(' — ')}>
      <Link2 className="h-3 w-3" /> {text}
    </span>
  );
}

// Everyone with the same mobile number is one household: auto with one carrier,
// home with another. The inbox shows one row per household; the drawer switches
// between their policies and totals them, because the bundle decides the win.
const DECISION_RANK = { refer: 6, expanded_market: 5, manual_review: 4, double_check: 3, quote_allstate_umbrella: 2, quote_allstate: 1 };
const STATUS_RANK = { extract_failed: 6, pending: 5, extracted: 4, quoted: 3, won: 2, bound: 1, lost: 0, declined: 0 };

function groupHouseholds(rows) {
  const map = new Map();
  rows.forEach(r => {
    const key = r.phone || r.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return [...map.values()].map(policies => {
    const lead = policies[0];
    const sum = (f) => policies.some(p => p[f] != null) ? policies.reduce((t, p) => t + (Number(p[f]) || 0), 0) : null;
    const allQuoted = policies.every(p => p.allstate_premium != null);
    return {
      key: lead.phone || lead.id,
      lead,
      policies,
      pays: sum('annual_premium'),
      allstate: allQuoted ? sum('allstate_premium') : null,
      delta: allQuoted && policies.every(p => p.delta != null) ? sum('delta') : null,
      decision: policies.filter(p => p.decision).sort((a, b) => (DECISION_RANK[b.decision] || 0) - (DECISION_RANK[a.decision] || 0))[0] || null,
      status: policies.slice().sort((a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0))[0].status,
      newest: policies.reduce((t, p) => (p.created_at > t ? p.created_at : t), lead.created_at),
    };
  });
}

const isOverdue = (h, now) => OPEN_STATUSES.includes(h.status) && minutesSince(h.newest, now) >= OVERDUE_MINUTES;

// "State Farm Auto + Home" when one carrier has everything, else "State Farm auto + Progressive home".
// Work tabs are always in view (Partners too: partner referrals are the focus);
// the weekly and set-up tabs sit behind More.
const WORK_TABS = [
  { v: 'inbox', label: 'Inbox', Icon: Camera },
  { v: 'invites', label: 'Links Sent', short: 'Links', Icon: Send },
  { v: 'promoters', label: 'Affiliates', Icon: BadgeDollarSign },
];
const MORE_GROUPS = [
  // Scripts and Texts moved to their own page (/agency/texts); the old tabs are hidden.
  { title: 'Selling', tabs: [
    { v: 'texts-page', to: '/agency/texts', principal: true, label: 'Texts & Scripts', hint: 'Everything you say and text, in one place', Icon: MessageSquare },
  ] },
  { title: 'Insights', tabs: [
    { v: 'map', label: 'Where We Win', short: 'Win map', hint: 'Win rate by carrier and ZIP', Icon: MapIcon },
    { v: 'agents', label: 'Competing Agents', short: 'Agents', hint: 'Whose customers send us their policy', Icon: Users },
  ] },
  { title: 'Setup', tabs: [
    { v: 'rules', label: 'Rules', hint: 'Where each scan goes', Icon: SlidersHorizontal },
    { v: 'partners', label: 'Referral Agencies', short: 'Referrals', hint: 'Who writes what Allstate can’t', Icon: Handshake },
  ] },
];

function TabBar({ tab, setTab }) {
  const navigate = useNavigate();
  // Texts & Scripts is the principal's page; producers don't see it.
  const { currentAgencyRole } = useAuth();
  const groups = MORE_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => !t.principal || currentAgencyRole === 'principal') }))
    .filter(g => g.tabs.length);
  const [sheet, setSheet] = useState(false);
  const moreTab = MORE_GROUPS.flatMap(g => g.tabs).find(t => t.v === tab);
  const segment = (active) => `flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold ${active ? 'bg-primary-600 text-white' : ''}`;
  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg p-1 sm:max-w-xl" style={{ background: 'var(--qs-elevated)' }} role="tablist">
        {WORK_TABS.map(({ v, label, short, Icon }) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={segment(tab === v)}
            style={tab === v ? undefined : { color: 'var(--qs-text)' }}>
            <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" /> <span className="truncate sm:hidden"><T>{short || label}</T></span><span className="hidden truncate sm:inline"><T>{label}</T></span>
          </button>
        ))}
        <button type="button" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)} className={segment(!!moreTab)}
          style={moreTab ? undefined : { color: 'var(--qs-text)' }}>
          <span className="truncate">{moreTab ? <T>{moreTab.short || moreTab.label}</T> : <T k="pages.ratecheckspage.4bab2d">{'More'}</T>}</span> <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="More Rate Checks pages">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="relative w-full max-w-md rounded-t-2xl p-4 pb-8 sm:rounded-2xl sm:pb-4" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
            {groups.map(g => (
              <div key={g.title} className="mb-3 last:mb-0">
                <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T>{g.title}</T></p>
                <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--qs-border)' }}>
                  {g.tabs.map(({ v, to, label, hint, Icon }, i) => (
                    <button key={v} type="button" onClick={() => { setSheet(false); if (to) navigate(to); else setTab(v); }}
                      className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left" style={{ borderTop: i ? '1px solid var(--qs-border)' : undefined, background: tab === v ? 'var(--qs-elevated)' : undefined }}>
                      <Icon className="h-5 w-5 shrink-0" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold" style={{ color: 'var(--qs-bright)' }}><T>{label}</T></span>
                        <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}><T>{hint}</T></span>
                      </span>
                      {tab === v ? <Check className="h-4 w-4 text-primary-600" aria-label="Current" /> : <ChevronRight className="h-4 w-4" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// One household in the inbox: who, what they have, what it costs, and the next step.
function InboxCard({ h, now, onOpen, onPartner }) {
  const open = OPEN_STATUSES.includes(h.status);
  const late = isOverdue(h, now);
  const first = h.lead.first_name || 'there';
  const holdText = buildText('hold', { name: first });
  const renewal = open ? renewalSoon(h.policies, now) : null;
  const bundle = new Set(h.policies.map(p => p.policy_type).filter(Boolean)).size > 1;
  return (
    <li onClick={onOpen} className="cursor-pointer px-4 py-4" style={{ borderTop: '1px solid var(--qs-border)' }}>
      {/* Who, and how long they've waited on us (top right). */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-base font-semibold" style={{ color: 'var(--qs-bright)' }}>
          {personName(h.lead.first_name, h.policies) || <T k="pages.ratecheckspage.b78fd2">{'No name'}</T>}
          {h.lead.upload_source === 'agent' && <StaffTag />}
        </p>
        {open && <span className="shrink-0"><WaitPill rc={{ ...h.lead, created_at: h.newest, status: h.status }} now={now} /></span>}
      </div>
      {h.lead.promoter_name && h.lead.promoter_id && (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.ratecheckspage.36e9b1">Referred by</T>{' '}
          <button type="button" onClick={e => { e.stopPropagation(); onPartner?.(h.lead.promoter_id); }}
            title={`Open ${partnerName(h.lead.promoter_name)}'s affiliate card`}
            className="font-medium underline underline-offset-2" style={{ color: 'var(--qs-dim)' }}>
            {partnerName(h.lead.promoter_name)}
          </button>
        </p>
      )}
      {!h.lead.promoter_name && (h.lead.producer_name || h.lead.event_name) && <OriginTag rc={{ ...h.lead, promoter_name: null }} />}

      {/* What they pay now (labeled), then the price with the text button and Start quote. */}
      {/* A bundle stacks the price and the Bundle Opportunity pill, centered beside the buttons. */}
      {!bundle && <p className="mt-3 text-xs leading-none" style={{ color: 'var(--qs-dim)' }}>{h.policies.length > 1 ? <T k="pages.ratecheckspage.d079c1">{'Total premium · all policies'}</T> : <T k="pages.ratecheckspage.5ece13">{'Current premium'}</T>}</p>}
      <div className={`${bundle ? 'mt-3' : 'mt-1'} flex items-center justify-between gap-3`}>
        <div className={`flex min-w-0 flex-col ${bundle ? 'items-center' : 'items-start'} gap-1`}>
          <p className="text-lg font-bold leading-6 tabular-nums" style={{ color: 'var(--qs-bright)' }}>{h.pays != null ? `${money(h.pays)} / year` : '—'}</p>
          {bundle && <CardPill><T k="pages.ratecheckspage.6921b0">Bundle Opportunity</T></CardPill>}
          {!open && h.delta != null && <p className="text-sm"><Savings delta={h.delta} /></p>}
        </div>
        {open ? (
          <span className="flex shrink-0 items-center gap-1">
            {late && h.lead.phone && (
              <a href={`sms:+1${h.lead.phone}?&body=${encodeURIComponent(holdText)}`} onClick={e => e.stopPropagation()}
                aria-label="Text them a quick update" title="Text them a quick update"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--qs-elevated)]" style={{ color: 'var(--qs-dim)' }}>
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              </a>
            )}
            <span className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white"><T k="pages.ratecheckspage.5002c4">Start Quote</T></span>
          </span>
        ) : <StatusChip status={h.status} quiet />}
      </div>

      {/* Status: red means we owe them a reply; the renewal is context (amber when close);
          the bundle is a neutral note. */}
      {renewal && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-4" style={{ borderColor: 'var(--qs-border)' }}>
          <CardPill tone={renewal.urgent ? 'amber' : 'neutral'}>{renewal.text}</CardPill>
        </div>
      )}
    </li>
  );
}

function NotifyButton() {
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  if (perm !== 'default') return null;
  return (
    <button onClick={() => Notification.requestPermission().then(setPerm)} title="Get a heads-up on this device when a policy comes in" aria-label="Alert me here"
      className="hidden h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold sm:inline-flex" style={inputStyle}>
      <Bell className="h-4 w-4" aria-hidden="true" /><span className="hidden lg:inline"><T k="pages.ratecheckspage.4bd5f4">Alert Me Here</T></span>
    </button>
  );
}

export default function RateChecksPage() {
  const { user, profile } = useAuth();
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const canEditRules = ['owner', 'principal', 'manager'].includes(currentAgency?.agency_role);
  const { data: features, isLoading: featuresLoading } = useEnabledFeatures(agencyId);
  const [tab, setTab] = useState('inbox');
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  // Snapshot of the clicked row: entering a quote flips it to won/lost, which
  // drops it out of the default 'Needs quote' list — the drawer (and its call
  // script) must stay open until the agent closes it.
  const [openRow, setOpenRow] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingOpenId, setPendingOpenId] = useState(null);
  // A partner's name on a lead opens the Partners tab on their card.
  const [partnerFocus, setPartnerFocus] = useState(null);
  const producerName = profile?.full_name || user?.email || null;
  const now = useNow();

  const enabled = features?.has('rate_checks');
  // One fetch for every status: the filter pills show counts, so filter client-side.
  const { data: rawRows = [], isLoading, error } = useRateChecks(enabled ? agencyId : null, null);
  // "Referred by Javon": partner names onto the rows that came through a partner link.
  const { data: promoters = [] } = usePromoters(enabled ? agencyId : null);
  const allRows = useMemo(() => {
    const names = Object.fromEntries(promoters.map(p => [p.id, p.name]));
    return rawRows.map(r => (r.promoter_id && names[r.promoter_id] ? { ...r, promoter_name: names[r.promoter_id] } : r));
  }, [rawRows, promoters]);
  const open = openRow ? (allRows.find(r => r.id === openRow.id) || openRow) : null;

  // Households, not dec pages: 4 pages from one family is 1, the same as the cards.
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [
    f.value, groupHouseholds(f.statuses ? allRows.filter(r => f.statuses.includes(r.status)) : allRows).length,
  ])), [allRows]);
  // Counted by household, the same way the cards are listed.
  const overdue = useMemo(() => groupHouseholds(allRows.filter(r => OPEN_STATUSES.includes(r.status)))
    .filter(h => isOverdue(h, now)).length, [allRows, now]);

  const rows = useMemo(() => {
    const statuses = FILTERS.find(f => f.value === filter)?.statuses;
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return allRows
      .filter(r => !statuses || statuses.includes(r.status))
      .filter(r => !q
        || [r.first_name, r.extracted?.insured_name, r.carrier, r.zip, r.policy_number, r.decision_carrier, r.event_name, r.producer_name, r.promoter_name].some(v => v && String(v).toLowerCase().includes(q))
        || (qDigits.length >= 3 && (r.phone || '').includes(qDigits)));
  }, [allRows, filter, search]);

  // Needs quote: longest wait first, bigger premium breaks ties. Everything else: newest first.
  const households = useMemo(() => {
    let list = groupHouseholds(rows);
    if (overdueOnly) list = list.filter(h => isOverdue(h, now));
    if (filter === 'open' || overdueOnly) {
      list.sort((a, b) => (a.newest < b.newest ? -1 : a.newest > b.newest ? 1 : (b.pays || 0) - (a.pays || 0)));
    }
    return list;
  }, [rows, overdueOnly, filter, now]);
  // Every policy for the open row's household (across all statuses), for the drawer.
  const openHousehold = useMemo(() => (open ? allRows.filter(r => r.phone && r.phone === open.phone) : []), [allRows, open]);

  // After a staff upload, open its drawer once the new row arrives in the list.
  useEffect(() => {
    if (!pendingOpenId) return;
    const row = allRows.find(r => r.id === pendingOpenId);
    if (row) { setOpenRow(row); setPendingOpenId(null); }
  }, [pendingOpenId, allRows]);

  if (agencyLoading || (agencyId && featuresLoading)) return <PageSpinner />;

  if (!currentAgency || !enabled) {
    return (
      <div className="dark-page flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--qs-bright)' }}><T k="pages.ratecheckspage.9eba0d">Rate Checks Isn't Enabled</T></h2>
          <p style={{ color: 'var(--qs-dim)' }}>
            <T k="pages.ratecheckspage.a401fc">Ask a platform admin to turn on the Rate Checks feature for your agency.</T>
          </p>
        </div>
      </div>
    );
  }

  const openRowFromList = (r) => { if (!isSelectingText()) setOpenRow(r); };

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        {/* Title and actions share one row, so the page reads title → tabs → list. */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="whitespace-nowrap text-xl font-bold sm:text-2xl" style={{ color: 'var(--qs-bright)' }}><T k="pages.ratecheckspage.7427f1">Rate Checks</T></h1>
            <p className="mt-0.5 hidden text-sm sm:block" style={{ color: 'var(--qs-dim)' }}><T k="pages.ratecheckspage.abcc59">People who sent their policy to see if Allstate can beat it.</T></p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotifyButton />
            <button onClick={() => setUploadOpen(true)} aria-label="Upload dec page" title="Upload dec page"
              className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={inputStyle}>
              <Upload className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline"><T k="pages.ratecheckspage.d008bd">Upload Dec Page</T></span>
            </button>
            {/* Send a Link texts from the producer's own number: shown only until Twilio is
                live (TEXT_FROM_OWN_PHONE); then Quick Send (the agency's number) replaces it. */}
            {SHOW_SEND_A_LINK && (
              <button onClick={() => setInviteOpen(true)}
                className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 sm:px-4">
                <Send className="h-4 w-4" aria-hidden="true" /> <T k="pages.ratecheckspage.176f56">Send a Link</T>
              </button>
            )}
          </div>
        </div>

        <TabBar tab={tab} setTab={(v) => { setPartnerFocus(null); setTab(v); }} />

        {tab === 'scripts' ? <ScriptsTab />
          : tab === 'texts' ? <TextsTab agencyId={agencyId} />
          : tab === 'map' ? <WinMap agencyId={agencyId} />
          : tab === 'agents' ? <CompetitorAgents agencyId={agencyId} scans={allRows} />
          : tab === 'promoters' ? <PartnersTab agencyId={agencyId} userId={user?.id} canEdit={canEditRules} focusId={partnerFocus}
              onOpenRateCheck={(id) => { const row = allRows.find(r => r.id === id); if (row) setOpenRow(row); }} />
          : tab === 'partners' ? <ReferralPartners agencyId={agencyId} />
          : tab === 'rules' ? <RulesTab agencyId={agencyId} canEdit={canEditRules} />
          : tab === 'invites' ? <InvitesTab agencyId={agencyId} producerName={producerName}
              onOpenRateCheck={(id) => { const row = allRows.find(r => r.id === id); if (row) setOpenRow(row); else { setFilter('all'); setTab('inbox'); setPendingOpenId(id); } }} />
          : (
          <>
            {overdue > 0 && (
              <button type="button" onClick={() => { setOverdueOnly(o => !o); setFilter('open'); setSearch(''); }}
                title="The Rate Check page tells customers we typically text within 30 minutes."
                className="mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm"
                style={{ background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)', color: 'var(--qs-bright)' }}>
                <Clock className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 font-medium">
                  {overdueOnly
                    ? <><T k="pages.ratecheckspage.b4e610">Showing</T> {overdue} <T k="pages.ratecheckspage.8de5e1">waiting 30+ minutes</T></>
                    : <>{overdue} <T k="pages.ratecheckspage.f9362d">waiting 30+ minutes for a quote</T></>}
                </span>
                <span className="shrink-0 font-semibold text-primary-600">{overdueOnly ? <T k="pages.ratecheckspage.b3f854">{'Show All'}</T> : <T k="pages.ratecheckspage.d97d1e">{'Show'}</T>}</span>
              </button>
            )}

            <div className="sticky top-0 z-[5] -mx-4 mb-3 flex flex-wrap items-center gap-2 px-4 py-2 sm:static sm:mx-0 sm:px-0 sm:py-0" style={{ background: 'var(--qs-bg, var(--qs-card))' }}>
              <div className="flex w-full gap-1 rounded-lg p-1 sm:w-auto" style={{ background: 'var(--qs-elevated)' }}>
                {FILTERS.map(f => (
                  <button key={f.value} onClick={() => { setFilter(f.value); setOverdueOnly(false); }}
                    className={`min-h-[36px] flex-auto whitespace-nowrap rounded-md px-2 text-[13px] font-medium sm:flex-none sm:px-3 sm:text-sm ${filter === f.value && !overdueOnly ? 'bg-primary-600 text-white' : ''}`}
                    style={filter === f.value && !overdueOnly ? undefined : { color: 'var(--qs-text)' }}>
                    <T>{f.short || f.label}</T> <span className={filter === f.value && !overdueOnly ? 'opacity-80' : ''} style={filter === f.value && !overdueOnly ? undefined : { color: 'var(--qs-subtle)' }}>{counts[f.value]}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-72">
                <span className="sr-only"><T k="pages.ratecheckspage.133484">Search</T></span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--qs-subtle)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, carrier, ZIP"
                  className="w-full rounded-lg py-2 pl-8 pr-3 text-sm" style={inputStyle} />
              </label>
            </div>

            <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
              {isLoading ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.585e4c">Loading rate checks…</T></div>
              ) : error ? (
                <div className="p-8 text-center text-red-600"><T k="pages.ratecheckspage.c71c89">Error loading rate checks. Please try again.</T></div>
              ) : households.length === 0 ? (
                <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
                  {search ? <T k="pages.ratecheckspage.51d8d3">{'Nobody matches that search.'}</T> : filter === 'open' ? <T k="pages.ratecheckspage.b3c2f6">{'All caught up — nothing waiting for a quote.'}</T> : <T k="pages.ratecheckspage.ede1ba">{'Nothing here yet.'}</T>}
                </div>
              ) : (
                <>
                  {/* Phones: cards. The whole card opens the quote; Start quote says so. */}
                  <ul className="md:hidden">
                    {households.map(h => <InboxCard key={h.key} h={h} now={now} onOpen={() => openRowFromList(h.lead)} onPartner={(id) => { setPartnerFocus(id); setTab('promoters'); window.scrollTo({ top: 0 }); }} />)}
                  </ul>

                  {/* Desktop: table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr style={{ background: 'var(--qs-elevated)' }}>
                          {['Customer', 'Sent', 'Current policy', 'Pays / yr', 'Next', 'Allstate / yr', 'Saves / yr', 'Status'].map(h => (
                            <th key={h} className={thCls} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {households.map(h => (
                          <tr key={h.key} onClick={() => openRowFromList(h.lead)} className="cursor-pointer"
                            style={{ borderTop: '1px solid var(--qs-border)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-elevated)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-medium whitespace-nowrap" style={{ color: 'var(--qs-bright)' }}>
                                {personName(h.lead.first_name, h.policies) || <T k="pages.ratecheckspage.b78fd2">{'No name'}</T>}{h.policies.length > 1 && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--qs-subtle)' }}>{h.policies.length} <T k="pages.ratecheckspage.94422f">policies</T></span>}{h.lead.upload_source === 'agent' && <StaffTag />}
                              </div>
                              {h.lead.phone && (
                                <a href={`tel:+1${h.lead.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-primary-600 hover:underline whitespace-nowrap">
                                  {formatPhone(h.lead.phone)}
                                </a>
                              )}
                              <OriginTag rc={h.lead} className="block" />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm"><Age rc={{ ...h.lead, created_at: h.newest, status: h.status }} now={now} /></td>
                            <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>
                              {h.policies.map(p => (
                                <div key={p.id} className="whitespace-nowrap">{carrierLabel(p) ? <>{carrierLabel(p)} <span style={{ color: 'var(--qs-subtle)' }}>{policyTypeLabel(p.policy_type)}</span></> : '—'}</div>
                              ))}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{money(h.pays)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{h.decision ? <DecisionChip rc={h.decision} policies={h.policies} /> : <span style={{ color: 'var(--qs-subtle)' }}>—</span>}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{money(h.allstate)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm"><Savings delta={h.delta} /></td>
                            <td className="px-4 py-3 whitespace-nowrap"><StatusChip status={h.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {inviteOpen && (
        <InviteDialog agencyId={agencyId} userId={user?.id} producerName={producerName} onClose={() => setInviteOpen(false)} />
      )}
      {uploadOpen && (
        <AgentUploadDialog agencyId={agencyId} onClose={() => setUploadOpen(false)}
          onCreated={(data) => {
            setUploadOpen(false);
            setTab('inbox');
            setFilter('all');
            setSearch('');
            if (data?.rate_check_id) setPendingOpenId(data.rate_check_id);
          }} />
      )}

      {open && <RateCheckDrawer key={open.phone || open.id} rc={open} household={openHousehold.length ? openHousehold : [open]} now={now}
        onClose={() => setOpenRow(null)} onSelect={(r) => setOpenRow(r)}
        onQuoted={(res) => setOpenRow(r => (r ? { ...r, ...res } : r))} />}
    </div>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────

// Send a Link texts from the producer's own phone: on only until Twilio is live.
const SHOW_SEND_A_LINK = TEXT_FROM_OWN_PHONE;

// The sales workspace: full screen, one household, in steps. Review the quote sheet,
// save the Allstate quote, then contact them and close.
const STEPS = [
  { v: 'review', label: 'Review' },
  { v: 'log', label: 'Quote' },
  { v: 'tell', label: 'Contact' },
  { v: 'close', label: 'Close' },
];

export function RateCheckDrawer({ rc, household, now, onClose, onSelect }) {
  const [step, setStep] = useState('review');
  const [logged, setLogged] = useState(null);
  // Contact is written from the quote: locked until any policy has an Allstate price.
  const quoted = !!logged || household.some(p => p.status !== 'declined' && p.allstate_premium != null);
  const [lockNote, setLockNote] = useState(false);
  useEffect(() => { if (!lockNote) return undefined; const t = setTimeout(() => setLockNote(false), 4000); return () => clearTimeout(t); }, [lockNote]);
  const warning = CONFIDENCE_WARNING[rc.extract_confidence];
  const rescan = useRescanRateCheck();
  const canRescan = !!rc.image_path && !['won', 'lost', 'bound', 'declined'].includes(rc.status);
  const multi = household.length > 1;
  const live = household.filter(p => p.status !== 'declined');
  // The header (name, call, goal) slides away while scrolling down into the quote
  // sheet and comes back on any scroll up.
  const [headerHidden, setHeaderHidden] = useState(false);
  const header = useRef(null);
  const lastY = useRef(0);
  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    const dy = y - lastY.current;
    if (Math.abs(dy) < 6) return;
    lastY.current = y;
    setHeaderHidden(dy > 0 && y > (header.current?.offsetHeight || 0));
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Sales workspace">
      <div onScroll={onScroll} className="relative h-full w-full overflow-y-auto" style={{ background: 'var(--qs-card)', color: 'var(--qs-text)' }}>
        {/* Who + how to reach them, then the steps */}
        <div ref={header} className="sticky top-0 z-10 transition-transform duration-200"
          style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)', transform: headerHidden ? 'translateY(-100%)' : 'none' }}>
        <div className="mx-auto max-w-3xl px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold" style={{ color: 'var(--qs-bright)' }}>{personName(rc.first_name, [rc]) || <T k="pages.ratecheckspage.968f20">{'Rate Check'}</T>}</h2>
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                {carrierLabel(rc) || rc.policy_type ? <Age rc={rc} now={now} /> : <><T k="pages.ratecheckspage.a656b7">{'Policy not read yet'}</T> · <Age rc={rc} now={now} /></>}
              </p>
              {rc.resubmitted_at && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
                  <T k="pages.ratecheckspage.01fa31">Sent again</T> {new Date(rc.resubmitted_at).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {rc.resubmit_count > 1 ? <>{" · "}{rc.resubmit_count}{" "}<T k="pages.ratecheckspage.7196b5">{"times"}</T></> : ''}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusChip status={rc.status} />
              <button onClick={onClose} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="w-4 h-4" /></button>
            </div>
          </div>
          <WhoIsWho rc={rc} />
          {rc.phone && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <a href={`tel:+1${rc.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 font-semibold text-white">
                <Phone className="h-4 w-4" /> <T k="pages.ratecheckspage.c3755e">Call</T> {formatPhone(rc.phone)}
              </a>
              {/* On phones Text and Email are icon buttons so Call, Text, Email and copy fit on one row. */}
              <a href={`sms:+1${rc.phone}`} aria-label="Text" title="Text" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium sm:px-3" style={inputStyle}>
                <MessageSquare className="h-4 w-4" /> <span className="hidden sm:inline"><T k="pages.ratecheckspage.9dffbf">Text</T></span>
              </a>
              {rc.email && (
                <a href={`mailto:${rc.email}`} aria-label="Email" title="Email" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium sm:px-3" style={inputStyle}>
                  <Mail className="h-4 w-4" /> <span className="hidden sm:inline"><T k="pages.ratecheckspage.ce8ae9">Email</T></span>
                </a>
              )}
              <CopyButton text={formatPhone(rc.phone)} label="Copy phone number" className="p-2" />
            </div>
          )}
          {/* What to beat, and the lead's record, on one row. */}
          <div className="mt-2.5 flex items-baseline justify-between gap-3">
            <GoalHeader household={household} className="" showSaved={false} />
            {rc.lead_id && (
              <button type="button" onClick={() => setStep(s => (s === 'history' ? 'review' : 'history'))} aria-pressed={step === 'history'}
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> <T k="sales.history.open">History</T>
              </button>
            )}
          </div>
          {/* Steps: Review → Log Quote → Tell Them → Close */}
          <nav aria-label="Sales steps" className="mt-2.5 flex gap-1 rounded-xl p-1" style={{ background: 'var(--qs-elevated)' }}>
            {STEPS.map((x, i) => {
              const on = step === x.v;
              const done = (x.v === 'review' && step !== 'review') || (x.v === 'log' && quoted);
              const locked = x.v === 'tell' && !quoted;
              return (
                <button key={x.v} type="button" disabled={x.soon} aria-disabled={locked || undefined}
                  onClick={() => { if (locked) { setLockNote(true); return; } setLockNote(false); setStep(x.v); }} aria-current={on ? 'step' : undefined}
                  title={x.soon ? 'Coming in the next step' : undefined}
                  className={`flex min-h-[38px] flex-auto flex-col items-center justify-center whitespace-nowrap rounded-lg px-2 py-0.5 text-[13px] font-semibold leading-tight sm:text-sm ${on ? 'bg-primary-600 text-white shadow-sm' : ''} ${locked ? 'cursor-not-allowed opacity-50' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
                  style={on ? undefined : { color: 'var(--qs-bright)' }}>
                  {/* The step number (or ✓ once done), small and light, above the name. */}
                  <span className="text-[10px] font-medium leading-none tabular-nums opacity-70" aria-hidden="true">{done ? '✓' : i + 1}</span>
                  <T>{x.label}</T>
                </button>
              );
            })}
          </nav>
          {lockNote && (
            <p className="mt-1.5 text-center text-xs font-semibold" style={{ color: 'var(--qs-text)' }} role="status">
              <T k="sales.steps.contact-locked">Save the quote first. Contact unlocks once it's saved.</T>
            </p>
          )}
        </div>
        </div>

        {/* A household with more than one policy: one tab per policy. */}
        {multi && step === 'review' && (
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-5 pt-4" role="tablist" aria-label="Policies in this household">
            {live.map((p, i) => (
              <button key={p.id} type="button" role="tab" aria-selected={p.id === rc.id} onClick={() => onSelect(p)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${p.id === rc.id ? 'bg-primary-600 text-white' : ''}`}
                style={p.id === rc.id ? undefined : { background: 'var(--qs-elevated)', color: 'var(--qs-bright)', border: '1px solid var(--qs-border)' }}>
                {carrierLabel(p) || <><T k="pages.ratecheckspage.policy">Policy</T> {i + 1}</>} <T>{policyTypeLabel(p.policy_type)}</T>
              </button>
            ))}
          </div>
        )}

        {step === 'log' && (
          <div className="mx-auto max-w-3xl space-y-4 p-5">
            {logged ? (
              <div className="rounded-xl p-4" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }} role="status">
                <p className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.logged.title">Quote Saved</T></p>
                <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}><T k="sales.logged.line2">The lead is now Quoted and it counts on your scorecard.</T></p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => setStep('tell')} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-bold text-white">
                    <T k="sales.logged.next">Next: Contact Them</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setLogged(null)} className="text-sm font-semibold text-primary-600 underline"><T k="sales.logged.edit">Change the Rates</T></button>
                </div>
              </div>
            ) : (
              <LogQuote household={live} onLogged={setLogged} />
            )}
          </div>
        )}

        {step === 'tell' && (
          <div className="mx-auto max-w-3xl p-5">
            <ContactStep household={live} />
            <button type="button" onClick={() => setStep('close')} className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl text-sm font-bold"
              style={{ border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
              <T k="sales.contact.toclose2">Next: Close</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {step === 'history' && (
          <div className="mx-auto max-w-3xl p-5">
            <LeadHistory leadId={rc.lead_id} />
          </div>
        )}

        {step === 'close' && (
          <div className="mx-auto max-w-3xl p-5">
            <CloseStep household={live} />
          </div>
        )}

        {step === 'review' && <div className="mx-auto max-w-3xl space-y-6 p-5">
          {rc.extract_error && (
            <Notice tone="danger">
              {scannerProblem(rc.extract_error)
                ? <><T k="pages.ratecheckspage.scan-down">The scanner is down right now, so this photo wasn’t read.</T> <span data-copy="fixed">{scannerProblem(rc.extract_error).reason} {scannerProblem(rc.extract_error).fix}</span> <T k="pages.ratecheckspage.scan-down-2">Read the photo below by hand, or tap Scan Again once it’s fixed.</T></>
                : <T k="pages.ratecheckspage.08f079">We couldn't read this photo. Look at it below and fill in the policy details by hand.</T>}
              {canRescan && (
                <button onClick={() => rescan.mutate({ rateCheckId: rc.id })} disabled={rescan.isPending}
                  className="ml-2 inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${rescan.isPending ? 'animate-spin' : ''}`} /> {rescan.isPending ? <T k="pages.ratecheckspage.36c4a0">{'Scanning…'}</T> : <T k="pages.ratecheckspage.8fd265">{'Scan Again'}</T>}
                </button>
              )}
            </Notice>
          )}
          {rescan.isError && <Notice tone="danger">{rescan.error.message}</Notice>}
          {rescan.isSuccess && rescan.data?.status === 'extracted' && <Notice tone="info"><T k="pages.ratecheckspage.75068f">Scanned again — check the details below.</T></Notice>}
          <PolicyDetails rc={rc} warning={!rc.extract_error ? warning : null} onRescan={canRescan && !rc.extract_error ? () => rescan.mutate({ rateCheckId: rc.id }) : null} rescanning={rescan.isPending} />
          <DecisionCard rc={rc} household={household} />
          <PolicyPhoto rc={rc} />
          <CurrentAgentBox rc={rc} />
          {(rc.status === 'lost' || ['refer', 'expanded_market'].includes(rc.decision)) && <ReferralBox rc={rc} />}
          <button type="button" onClick={() => { setStep('log'); window.scrollTo?.(0, 0); }}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white">
            <T k="sales.review.next">Quoted It in Allstate? Save the Quote</T> <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>}
      </div>
    </div>
  );
}

function Notice({ tone, children }) {
  const styles = {
    danger: { background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)' },
    warning: { background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' },
    info: { background: 'var(--qs-info-subtle)', border: '1px solid var(--qs-info-border)' },
  };
  return <div className="rounded-lg px-3 py-2 text-sm" style={{ ...styles[tone], color: 'var(--qs-bright)' }}>{children}</div>;
}

// Enter Allstate's price → won/lost, then mark it bound.
function QuoteBox({ rc, onQuoted }) {
  const enterQuote = useEnterRateCheckQuote();
  const [premium, setPremium] = useState(rc.allstate_premium != null ? String(rc.allstate_premium) : '');
  const note = rc.quote_note || ''; // kept on the row; the price card no longer asks for one
  const [justSaved, setJustSaved] = useState(false);
  const result = enterQuote.data;
  const outcome = result?.status || (['won', 'lost', 'bound'].includes(rc.status) ? rc.status : null);
  const delta = result?.delta ?? rc.delta;
  const declined = rc.status === 'declined';
  // Bound locally the moment the agent marks it, before the row refetches.
  const [localBound, setLocalBound] = useState(null);
  const bound = rc.status === 'bound' || !!localBound;
  const boundInfo = localBound || rc;
  // An expanded-market risk is quoted with that carrier; the price box compares the same way.
  const market = rc.decision === 'expanded_market' && rc.decision_carrier ? rc.decision_carrier : 'Allstate';
  const quotedPrice = result?.allstate_premium ?? rc.allstate_premium;

  const submit = (e) => {
    e.preventDefault();
    const n = parseMoney(premium);
    if (!n || n <= 0) return;
    enterQuote.mutate(
      { rateCheckId: rc.id, allstatePremium: n, quoteNote: note },
      // Keep the drawer's snapshot current (status chip, savings) once the row leaves the list.
      { onSuccess: (res) => {
        onQuoted?.({ status: res.status, allstate_premium: res.allstate_premium, delta: res.delta, delta_pct: res.delta_pct });
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2500);
      } },
    );
  };

  const script = `Hi ${rc.first_name || 'there'}, it's Cam with Cam Wiley Agency. You sent your ${rc.carrier || 'current'} policy over — ` +
    `I was able to beat it by ${money(delta)} a year with the same coverage. Do you have 5 minutes now to lock it in?`;

  return (
    <section className="grow rounded-xl p-5" style={CARD_STYLE}>
      {quotedPrice != null && !bound && rc.annual_premium != null ? (
        <PriceDrop current={rc.annual_premium} price={quotedPrice} market={market} />
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.318d2e">They pay now</T></p>
          <p className="mt-1 text-4xl font-bold leading-none" style={{ color: 'var(--qs-bright)' }}>
            {rc.annual_premium != null ? <>{money(rc.annual_premium)}<span className="text-lg font-medium" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.6d8fef">/yr</T></span></> : <T k="pages.ratecheckspage.910ba9">{'Price not read yet'}</T>}
          </p>
          {Number(rc.term_months) === 6 && rc.current_premium != null && (
            <p className="mt-2.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>{money(rc.current_premium)} <T k="pages.ratecheckspage.cdd738">every 6 months</T></p>
          )}
        </>
      )}


      {bound && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }}>
          <div className="text-xl font-extrabold text-green-600"><T k="pages.ratecheckspage.79ec67">Bound with</T> {boundInfo.bound_carrier || <T k="pages.ratecheckspage.921d57">{'Allstate'}</T>}{boundInfo.bound_premium != null ? <>{" "}<T k="pages.ratecheckspage.27e90d">{"at"}</T>{" "}{money(boundInfo.bound_premium)}{"/yr"}</> : ''}</div>
          <p className="text-sm" style={{ color: 'var(--qs-text)' }}>{boundInfo.bound_at ? new Date(boundInfo.bound_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}{rc.annual_premium != null && boundInfo.bound_premium != null ? <>{" "}<T k="pages.ratecheckspage.764f2d">{"· they were paying"}</T>{" "}{money(rc.annual_premium)}</> : ''}</p>
          <ReviewAsk rc={rc} review={boundInfo.review} />
        </div>
      )}
      {!bound && <form onSubmit={submit} className="mt-7 space-y-3">
        <label className="block text-sm font-medium" htmlFor="rc-allstate" style={{ color: 'var(--qs-bright)' }}>{market} <T k="pages.ratecheckspage.f9fce9">Price Per Year</T></label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            {premium && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--qs-subtle)' }}>$</span>}
            <input id="rc-allstate" className={`w-full rounded-lg py-3 pr-3 text-base ${premium ? 'pl-7' : 'pl-3'}`} style={inputStyle} inputMode="decimal" placeholder="Enter annual price"
              value={premium} onChange={e => setPremium(sanitizeMoneyInput(e.target.value))} disabled={declined} />
          </div>
          <button type="submit" disabled={enterQuote.isPending || !(parseMoney(premium) > 0) || declined}
            className="shrink-0 rounded-lg bg-primary-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-60">
            {enterQuote.isPending ? <T k="pages.ratecheckspage.56a228">{'Saving…'}</T> : justSaved ? <T k="pages.ratecheckspage.838a49">{'Saved ✓'}</T> : outcome ? <T k="pages.ratecheckspage.fb91e2">{'Update'}</T> : <T k="pages.ratecheckspage.efc007">{'Save'}</T>}
          </button>
        </div>
        {!(parseMoney(premium) > 0) && !outcome && !declined && (
          <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="ratechecks.quote.save-hint-a">Type the</T> {market} <T k="ratechecks.quote.save-hint-b">price for a year, then Save. It records the quote and tells you if it beats what they pay.</T></p>
        )}
        {/* Live: what this price saves them, before Save (once saved, the result box below says it). */}
        {!(outcome && parseMoney(premium) === Number(result?.allstate_premium ?? rc.allstate_premium)) && (
          <LiveDelta current={rc.annual_premium} price={parseMoney(premium)} />
        )}
        {looksTooLow(rc.annual_premium, parseMoney(premium)) && (
          <p className="text-sm text-yellow-600"><T k="pages.ratecheckspage.611b4f">That's a big drop — double-check the limits match.</T></p>
        )}
      </form>}
      {rc.annual_premium == null && !declined && (
        <p className="mt-2 text-xs text-yellow-600"><T k="pages.ratecheckspage.a04282">Fill in their current price under Policy first — otherwise we can't tell if Allstate wins.</T></p>
      )}
      {enterQuote.isError && <p className="mt-2 text-sm text-red-600">{enterQuote.error.message}</p>}

      {outcome === 'won' && !bound && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.ratecheckspage.62f9fb">Call now. The lead is marked Interested.</T></p>
          <p className="mt-3 select-text text-sm" style={{ color: 'var(--qs-bright)' }}>“{script}”</p>
          <CopyTextButton text={script} className="mt-2 text-xs font-semibold text-primary-600 hover:underline"><T k="pages.ratecheckspage.c38517">Copy script</T></CopyTextButton>
          <BindForm rc={rc} market={market} defaultPremium={result?.allstate_premium ?? rc.allstate_premium}
            onBound={(b) => { setLocalBound(b); onQuoted?.(b); }} />
        </div>
      )}
      {outcome === 'lost' && (
        <div className="mt-4 text-sm">
          <div className="font-semibold" style={{ color: 'var(--qs-bright)' }}>
            {market} <T k="pages.ratecheckspage.b1006d">can't beat</T> {money(rc.annual_premium)}<T k="pages.ratecheckspage.97f493">/yr (quoted</T> {money(result?.allstate_premium ?? rc.allstate_premium)}<T k="pages.ratecheckspage.f265a3">). Lead closed.</T>
          </div>
          {result?.sms && (
            result.sms.attempted && result.sms.ok
              ? <p className="mt-1 text-green-600"><T k="pages.ratecheckspage.30b4c9">We sent them a polite text.</T></p>
              : <p className="mt-1 text-yellow-600"><T k="pages.ratecheckspage.a055ce">No text sent</T>{result.sms.reason ? ` — ${result.sms.reason}` : result.sms.error ? ` — ${result.sms.error}` : ''}.</p>
          )}
        </div>
      )}
    </section>
  );
}

// The quoted price next to what they pay now, with the drop drawn as a bar:
// the old price crossed out, the new one big and green (amber if it's higher).
function PriceDrop({ current, price, market }) {
  const s = savings(current, price);
  const share = Math.min(1, Number(price) / Number(current)); // how much of today's bill is left
  const up = s && s.delta < 0;
  const tone = up ? 'var(--qs-warning)' : 'var(--qs-success)';
  return (
    <div>
      {/* Labels on their own row, so the prices below get the full width. */}
      <div className="flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-[0.12em]">
        <span className="whitespace-nowrap" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.318d2e">They pay now</T></span>
        <span className="whitespace-nowrap" style={{ color: tone }}>{market}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        {/* Struck through only when Allstate is cheaper: the price they pay goes away. */}
        <p className={`text-xl font-bold leading-none ${s && s.delta > 0 ? 'line-through decoration-2' : ''}`} style={{ color: 'var(--qs-subtle)' }}>{money(current)}</p>
        <ArrowRight className="mb-0.5 h-5 w-5 shrink-0" style={{ color: tone }} aria-hidden="true" />
        <p className="whitespace-nowrap text-2xl font-extrabold leading-none tabular-nums" style={{ color: tone }}>{money(price)}<span className="text-sm font-semibold"><T k="pages.ratecheckspage.6d8fef">/yr</T></span></p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }} role="img"
        aria-label={s ? (up ? `${market} is ${money(-s.delta)} a year more` : `${market} is ${s.pct}% less`) : undefined}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: tone }} />
      </div>
      {s && (
        <p className="mt-2 text-lg font-extrabold" style={{ color: tone }}>
          {s.delta > 0 ? <><T k="pages.ratecheckspage.6a29f0">{"Saves"}</T>{" "}{money(s.delta)}{"/yr."}</> : s.delta < 0 ? <><T k="pages.ratecheckspage.799b3e">{"Costs"}</T>{" "}{money(-s.delta)}{"/yr more."}</> : <T k="pages.ratecheckspage.a24792">{'Same as they pay.'}</T>}
          {s.pct != null && s.delta !== 0 && <span className="font-semibold"> <T k="pages.ratecheckspage.55453b">That's</T> {Math.abs(s.pct)}% {s.delta > 0 ? <T k="pages.ratecheckspage.fc3dda">{'less!'}</T> : <T k="pages.ratecheckspage.4860e4">{'more.'}</T>}</span>}
        </p>
      )}
    </div>
  );
}

// Step 3: the policy was written. Closes the lead as won and feeds the scoreboard.
// After binding: the thank-you + review text goes out automatically when it can
// (texting consent, Twilio number, review link). Otherwise one tap opens Messages
// with it written in, so every bound customer still gets asked.
function ReviewAsk({ rc, review }) {
  const sent = review?.ok || !!rc.review_requested_at;
  if (sent) {
    return <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: 'var(--qs-text)' }}><Star className="h-4 w-4" /> <T k="rc.desk.review.sent">Thank-you and Google review request texted.</T></p>;
  }
  if (!rc.phone) return null;
  return (
    <a href={smsHref(rc.phone, customerReviewText(rc.first_name))}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white">
      <Star className="h-4 w-4" /> <T k="rc.desk.review.ask">Text Them the Google Review Request</T>
    </a>
  );
}

function BindForm({ rc, market, defaultPremium, onBound }) {
  const bind = useBindRateCheck();
  const [carrier, setCarrier] = useState(market);
  const [other, setOther] = useState('');
  const [premium, setPremium] = useState(defaultPremium != null ? String(defaultPremium) : '');
  const chosen = carrier === '__other' ? other.trim() : carrier;
  const options = [...new Set([market, 'Allstate', rc.decision_carrier].filter(Boolean))];
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: 'var(--qs-border)' }}
      onSubmit={e => { e.preventDefault(); if (!chosen) return; bind.mutate({ rateCheckId: rc.id, carrier: chosen, premium: parseMoney(premium) },
        { onSuccess: (res) => onBound?.({ status: 'bound', bound_carrier: res.bound_carrier, bound_premium: res.bound_premium, bound_at: new Date().toISOString(), review: res.review }) }); }}>
      <label className="text-sm"><span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.79ec67">Bound with</T></span>
        <select value={carrier} onChange={e => setCarrier(e.target.value)} className="rounded-md px-2 py-1.5" style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__other">Other…</option>
        </select>
      </label>
      {carrier === '__other' && <input value={other} onChange={e => setOther(e.target.value)} placeholder="Carrier" className="rounded-md px-2 py-1.5 text-sm" style={inputStyle} />}
      <label className="text-sm"><span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.db8115">Premium / yr</T></span>
        <input value={premium} onChange={e => setPremium(sanitizeMoneyInput(e.target.value))} inputMode="decimal" className="w-28 rounded-md px-2 py-1.5" style={inputStyle} />
      </label>
      <button type="submit" disabled={!chosen || bind.isPending} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {bind.isPending ? <T k="pages.ratecheckspage.56a228">{'Saving…'}</T> : <T k="pages.ratecheckspage.0e6e8c">{'Mark Bound'}</T>}
      </button>
      {bind.isError && <span className="text-sm text-red-600">{bind.error.message}</span>}
    </form>
  );
}

// The quote sheet (PolicySheet) with Scan again / Fix details; "Fix details" swaps in the form.
function PolicyDetails({ rc, warning, onRescan, rescanning }) {
  const [editing, setEditing] = useState(false);
  const origin = useOrigin(rc);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={heading} style={{ color: 'var(--qs-bright)' }}><T k="pages.ratecheckspage.7558bf">Quote Sheet</T></h3>
        {!editing && (
          <div className="flex items-center gap-3">
            {onRescan && (
              <button onClick={onRescan} disabled={rescanning} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} /> {rescanning ? <T k="pages.ratecheckspage.36c4a0">{'Scanning…'}</T> : <T k="pages.ratecheckspage.8fd265">{'Scan Again'}</T>}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
              <Pencil className="h-3.5 w-3.5" /> <T k="pages.ratecheckspage.7a6e64">Fix Details</T>
            </button>
          </div>
        )}
      </div>
      {editing ? <PolicyForm rc={rc} onDone={() => setEditing(false)} /> : <PolicySheet rc={rc} warning={warning} origin={origin} />}
    </section>
  );
}

function PolicyPhoto({ rc }) {
  const { data: imageUrl, isLoading } = useRateCheckImageUrl(rc.image_path);
  const isPdf = rc.image_media_type === 'application/pdf';
  return (
    <section>
      <h3 className={heading} style={{ color: 'var(--qs-bright)' }}><T k="pages.ratecheckspage.11ac95">What They Sent</T></h3>
      {!rc.image_path ? (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.b53e83">No photo on file. Photos are deleted after 90 days.</T></p>
      ) : isLoading ? (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.ratecheckspage.5f02f0">Loading…</T></p>
      ) : !imageUrl ? (
        <p className="text-sm text-red-600"><T k="pages.ratecheckspage.567a3b">Couldn't load the photo.</T></p>
      ) : isPdf ? (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
          <T k="pages.ratecheckspage.59cb8a">Open the PDF</T> <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="block" title="Open full size">
          <img src={imageUrl} alt="Policy page the customer sent" className="max-h-72 w-full rounded-lg border object-contain object-top"
            style={{ borderColor: 'var(--qs-border)', background: '#fff' }} />
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-primary-600"><T k="pages.ratecheckspage.562cd6">Open full size</T> <ExternalLink className="h-3.5 w-3.5" /></span>
        </a>
      )}
    </section>
  );
}

// Agent corrections. Saving recomputes annual_premium.
function PolicyForm({ rc, onDone }) {
  const update = useUpdateRateCheck();
  const [form, setForm] = useState({
    carrier: rc.carrier || '',
    policy_type: rc.policy_type || '',
    current_premium: rc.current_premium != null ? String(rc.current_premium) : '',
    term_months: rc.term_months != null ? String(rc.term_months) : '',
    policy_number: rc.policy_number || '',
    effective_date: rc.effective_date || '',
    expiration_date: rc.expiration_date || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const annual = annualize(parseMoney(form.current_premium), form.term_months);

  const save = () => {
    update.mutate({
      id: rc.id,
      updates: {
        carrier: form.carrier || null,
        policy_type: form.policy_type || null,
        current_premium: parseMoney(form.current_premium),
        term_months: form.term_months ? Number(form.term_months) : null,
        annual_premium: annual,
        policy_number: form.policy_number.trim() || null,
        policy_number_last4: form.policy_number.replace(/[^A-Za-z0-9]/g, '').slice(-4) || null,
        // An agent-picked term is authoritative; otherwise keep how the scan got it.
        term_source: form.term_months !== (rc.term_months != null ? String(rc.term_months) : '')
          ? 'agent' : (rc.term_source || null),
        effective_date: form.effective_date || null,
        expiration_date: form.expiration_date || null,
      },
    }, { onSuccess: onDone });
  };

  const field = 'w-full rounded-md px-2 py-1.5 text-sm';
  const label = (text) => <span style={{ color: 'var(--qs-subtle)' }}><T>{text}</T></span>;
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">{label('Carrier')}
          <select className={field} style={inputStyle} value={form.carrier} onChange={e => set('carrier', e.target.value)}>
            <option value="">—</option>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1">{label('Policy type')}
          <select className={field} style={inputStyle} value={form.policy_type} onChange={e => set('policy_type', e.target.value)}>
            <option value="">—</option>
            {POLICY_TYPES.map(t => <option key={t} value={t}>{policyTypeLabel(t)}</option>)}
          </select>
        </label>
        <label className="space-y-1">{label('Price on the page')}
          <input className={field} style={inputStyle} inputMode="decimal" value={form.current_premium}
            onChange={e => set('current_premium', sanitizeMoneyInput(e.target.value))} placeholder="780.00" />
        </label>
        <label className="space-y-1">{label('For how long')}
          <select className={field} style={inputStyle} value={form.term_months} onChange={e => set('term_months', e.target.value)}>
            <option value="">Not sure</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
        </label>
        <label className="space-y-1">{label('Starts')}
          <input type="date" className={field} style={inputStyle} value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
        </label>
        <label className="space-y-1">{label('Ends')}
          <input type="date" className={field} style={inputStyle} value={form.expiration_date} onChange={e => set('expiration_date', e.target.value)} />
        </label>
        <label className="col-span-2 space-y-1">{label('Policy number')}
          <input className={`${field} font-mono`} style={inputStyle} maxLength={64} value={form.policy_number} onChange={e => set('policy_number', e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}>
        <T k="pages.ratecheckspage.55453b">That's</T> <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{money(annual, { cents: true })}</span> <T k="pages.ratecheckspage.843c6d">a year.</T>
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={save} disabled={update.isPending} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {update.isPending ? <T k="pages.ratecheckspage.56a228">{'Saving…'}</T> : <T k="pages.ratecheckspage.efc007">{'Save'}</T>}
        </button>
        <button onClick={onDone} disabled={update.isPending} className="rounded-lg px-3 py-1.5 text-sm" style={inputStyle}><T k="pages.ratecheckspage.ea4788">Cancel</T></button>
        {update.isError && <span className="text-sm text-red-600">{update.error.message}</span>}
      </div>
    </div>
  );
}
