// src/pages/RateChecksPage.jsx
// Rate Checks inbox — consumer dec-page uploads (insuredbycam.com/ratecheck).
// Agents copy the policy into an Allstate quote, enter Allstate's price, and
// the outcome (won → call, lost → polite auto-text) is handled by rate-check-outcome.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, BadgeDollarSign, Bell, Camera, Check, ChevronDown, ChevronRight, ExternalLink, Handshake, Link2, Mail, Map as MapIcon,
  MessageSquare, Pencil, Phone, RefreshCw, Search, Send, SlidersHorizontal, Upload, Users, X,
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
import {
  STATUS, CONFIDENCE_WARNING, TERM_HINT, DECISION, decisionLabel,
  isSelectingText, POLICY_TYPES, policyTypeLabel, CARRIERS, carrierLabel,
} from './components/rate-checks/format';
import { CopyButton, CopyTextButton, Field } from './components/rate-checks/Copyable';
import CompetitorAgents from './components/rate-checks/CompetitorAgents';
import ReferralPartners from './components/rate-checks/ReferralPartners';
import PartnersTab from './components/rate-checks/PartnersTab';
import { CurrentAgentBox, ReferralBox } from './components/rate-checks/DrawerExtras';
import AgentUploadDialog from './components/rate-checks/AgentUploadDialog';
import DecisionCard, { DecisionChip } from './components/rate-checks/DecisionCard';
import WinMap from './components/rate-checks/WinMapTab';
import PolicySheet from './components/rate-checks/PolicySheet';
import Carousel from './components/rate-checks/Carousel';
import { GoalHeader, HouseholdCard, LiveDelta } from './components/rate-checks/QuoteCards';
import { looksTooLow } from './components/rate-checks/quoteMath';
import RulesTab from './components/rate-checks/RulesTab';
import InviteDialog from './components/rate-checks/InviteDialog';
import InvitesTab from './components/rate-checks/InvitesTab';

const OPEN_STATUSES = ['extracted', 'pending', 'extract_failed'];
const FILTERS = [
  { value: 'open', label: 'Needs quote', statuses: OPEN_STATUSES },
  { value: 'won', label: 'Wins', statuses: ['won', 'bound'] },
  { value: 'lost', label: 'Can’t beat', short: 'Lost', statuses: ['lost'] },
  { value: 'all', label: 'All', statuses: null },
];
// The consumer page promises a text "within the hour".
const OVERDUE_MINUTES = 60;


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
    return <span className="font-semibold text-red-500" title="We promised a text within the hour">Waiting {ageText(mins)}</span>;
  }
  return <span style={{ color: 'var(--qs-text)' }}>{mins < 1 ? 'Just now' : `${ageText(mins)} ago`}</span>;
}

function StatusChip({ status, quiet = false }) {
  const c = STATUS[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  if (quiet) return <span className="whitespace-nowrap text-sm font-medium" style={{ color: 'var(--qs-subtle)' }}>{c.label}</span>;
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${c.cls}`}>{c.label}</span>;
}

// delta = current − Allstate, so positive means the customer saves.
function Savings({ delta }) {
  if (delta == null) return <span style={{ color: 'var(--qs-subtle)' }}>—</span>;
  const n = Number(delta);
  return n > 0
    ? <span className="font-semibold text-green-600">{money(n)}</span>
    : <span className="text-red-500">Allstate {money(Math.abs(n))} more</span>;
}

function StaffTag() {
  return (
    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-subtle)' }}
      title="Uploaded by staff — no texting consent on file">staff upload</span>
  );
}

// "via Marcus · Gwinnett expo" — where a rate check came from.
function OriginTag({ rc, className = '' }) {
  if (!rc.producer_name && !rc.event_name && !rc.promoter_name) return null;
  const text = [rc.promoter_name && `Referred by ${rc.promoter_name.split(' ')[0]}`, rc.event_name, rc.producer_name && `via ${rc.producer_name.split(' ')[0]}`].filter(Boolean).join(' · ');
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
function householdLine(h) {
  const carriers = [...new Set(h.policies.map(p => carrierLabel(p)).filter(Boolean))];
  const types = h.policies.map(p => policyTypeLabel(p.policy_type)).filter(Boolean);
  if (!types.length) return 'Policy not read yet';
  if (carriers.length <= 1) return [carriers[0], types.join(' + ')].filter(Boolean).join(' ');
  return h.policies.map(p => [carrierLabel(p), policyTypeLabel(p.policy_type).toLowerCase()].filter(Boolean).join(' ')).join(' + ');
}

// Work tabs are always in view; the weekly and set-up tabs sit behind More.
const WORK_TABS = [
  { v: 'inbox', label: 'Inbox', Icon: Camera },
  { v: 'invites', label: 'Links sent', Icon: Send },
];
const MORE_GROUPS = [
  { title: 'Insights', tabs: [
    { v: 'map', label: 'Where we win', short: 'Win map', hint: 'Win rate by carrier and ZIP', Icon: MapIcon },
    { v: 'agents', label: 'Competing agents', short: 'Agents', hint: 'Whose customers send us their policy', Icon: Users },
  ] },
  { title: 'Setup', tabs: [
    { v: 'rules', label: 'Rules', hint: 'Where each scan goes', Icon: SlidersHorizontal },
    { v: 'promoters', label: 'Partners', hint: 'People paid to share your link', Icon: BadgeDollarSign },
    { v: 'partners', label: 'Referral agencies', short: 'Referrals', hint: 'Who writes what Allstate can’t', Icon: Handshake },
  ] },
];

function TabBar({ tab, setTab }) {
  const [sheet, setSheet] = useState(false);
  const moreTab = MORE_GROUPS.flatMap(g => g.tabs).find(t => t.v === tab);
  const segment = (active) => `flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold ${active ? 'bg-primary-600 text-white' : ''}`;
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg p-1 sm:max-w-md" style={{ background: 'var(--qs-elevated)' }} role="tablist">
        {WORK_TABS.map(({ v, label, Icon }) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={segment(tab === v)}
            style={tab === v ? undefined : { color: 'var(--qs-text)' }}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
          </button>
        ))}
        <button type="button" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)} className={segment(!!moreTab)}
          style={moreTab ? undefined : { color: 'var(--qs-text)' }}>
          <span className="truncate">{moreTab ? moreTab.short || moreTab.label : 'More'}</span> <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="More Rate Checks pages">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="relative w-full max-w-md rounded-t-2xl p-4 pb-8 sm:rounded-2xl sm:pb-4" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
            {MORE_GROUPS.map(g => (
              <div key={g.title} className="mb-3 last:mb-0">
                <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>{g.title}</p>
                <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--qs-border)' }}>
                  {g.tabs.map(({ v, label, hint, Icon }, i) => (
                    <button key={v} type="button" onClick={() => { setTab(v); setSheet(false); }}
                      className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left" style={{ borderTop: i ? '1px solid var(--qs-border)' : undefined, background: tab === v ? 'var(--qs-elevated)' : undefined }}>
                      <Icon className="h-5 w-5 shrink-0" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold" style={{ color: 'var(--qs-bright)' }}>{label}</span>
                        <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{hint}</span>
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

// Start quote and Text now: same height and width, so they stack as a pair.
const CARD_BTN = 'inline-flex h-11 w-36 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold';

// One household in the inbox: who, what they have, what it costs, and the next step.
function InboxCard({ h, now, onOpen }) {
  const open = OPEN_STATUSES.includes(h.status);
  const late = isOverdue(h, now);
  const first = h.lead.first_name || 'there';
  const holdText = `Hi ${first}, it's Cam with Allstate. I'm working on your quote now and I'll have it to you shortly.`;
  return (
    <li onClick={onOpen} className="cursor-pointer px-4 py-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-base font-semibold" style={{ color: 'var(--qs-bright)' }}>
          {h.lead.first_name || 'No name'}
          {h.policies.length > 1 && <span className="ml-1.5 text-sm font-normal" style={{ color: 'var(--qs-subtle)' }}>· {h.policies.length} policies</span>}
          {h.lead.upload_source === 'agent' && <StaffTag />}
        </span>
        <span className="shrink-0 whitespace-nowrap text-sm"><Age rc={{ ...h.lead, created_at: h.newest, status: h.status }} now={now} /></span>
      </div>
      <p className="text-sm" style={{ color: 'var(--qs-text)' }}>{householdLine(h)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-lg font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{h.pays != null ? `${money(h.pays)}/yr` : '—'}</span>
          {!open && h.delta != null && <span className="block text-sm"><Savings delta={h.delta} /></span>}
        </span>
        {open
          ? <span className={`${CARD_BTN} bg-primary-600 text-white`}>Start quote ›</span>
          : <StatusChip status={h.status} quiet />}
      </div>
      {(open && (h.decision || (late && h.lead.phone))) || h.lead.producer_name || h.lead.event_name || h.lead.promoter_name ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {open && h.decision && <QuietDecision rc={h.decision} />}
            <OriginTag rc={h.lead} />
          </span>
          {open && late && h.lead.phone && (
            <a href={`sms:+1${h.lead.phone}?&body=${encodeURIComponent(holdText)}`} onClick={e => e.stopPropagation()}
              className={CARD_BTN} style={inputStyle}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> Text now
            </a>
          )}
        </div>
      ) : null}
    </li>
  );
}

// The routing result as a small label, so it doesn't read as a button.
const DECISION_DOT = { success: 'var(--qs-success)', info: 'var(--qs-info)', warning: 'var(--qs-warning)', neutral: 'var(--qs-subtle)' };
function QuietDecision({ rc }) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: 'var(--qs-text)' }}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: DECISION_DOT[d.tone] }} />{decisionLabel(rc)}
    </span>
  );
}

function NotifyButton() {
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  if (perm !== 'default') return null;
  return (
    <button onClick={() => Notification.requestPermission().then(setPerm)} title="Get a heads-up on this device when a policy comes in"
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold" style={inputStyle}>
      <Bell className="w-4 h-4" /> Alert me here
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

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [
    f.value, f.statuses ? allRows.filter(r => f.statuses.includes(r.status)).length : allRows.length,
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
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--qs-bright)' }}>Rate Checks isn&apos;t enabled</h2>
          <p style={{ color: 'var(--qs-dim)' }}>
            Ask a platform admin to turn on the Rate Checks feature for your agency.
          </p>
        </div>
      </div>
    );
  }

  const openRowFromList = (r) => { if (!isSelectingText()) setOpenRow(r); };

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>Rate Checks</h1>
            <Link to="/agency/leads" className="shrink-0 text-sm font-medium text-primary-600 hover:underline">All leads ›</Link>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-dim)' }}>People who sent their policy to see if Allstate can beat it.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setInviteOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
              <Send className="w-4 h-4" /> Send a link
            </button>
            <button onClick={() => setUploadOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={inputStyle}>
              <Upload className="w-4 h-4" /> Upload dec page
            </button>
            <NotifyButton />
          </div>
        </div>

        <TabBar tab={tab} setTab={setTab} />

        {tab === 'map' ? <WinMap agencyId={agencyId} />
          : tab === 'agents' ? <CompetitorAgents agencyId={agencyId} scans={allRows} />
          : tab === 'promoters' ? <PartnersTab agencyId={agencyId} userId={user?.id} canEdit={canEditRules}
              onOpenRateCheck={(id) => { const row = allRows.find(r => r.id === id); if (row) setOpenRow(row); }} />
          : tab === 'partners' ? <ReferralPartners agencyId={agencyId} />
          : tab === 'rules' ? <RulesTab agencyId={agencyId} canEdit={canEditRules} />
          : tab === 'invites' ? <InvitesTab agencyId={agencyId} producerName={producerName}
              onOpenRateCheck={(id) => { const row = allRows.find(r => r.id === id); if (row) setOpenRow(row); else { setFilter('all'); setTab('inbox'); setPendingOpenId(id); } }} />
          : (
          <>
            {overdue > 0 && (
              <button type="button" onClick={() => { setOverdueOnly(o => !o); setFilter('open'); setSearch(''); }}
                className="mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm"
                style={{ background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)', color: 'var(--qs-bright)' }}>
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span className="min-w-0 flex-1">
                  {overdueOnly
                    ? <>Showing the {overdue} who waited over an hour.</>
                    : <>{overdue} {overdue === 1 ? 'person has' : 'people have'} waited over an hour. The page promised a text within the hour.</>}
                </span>
                <span className="shrink-0 font-semibold text-primary-600">{overdueOnly ? 'Show all' : 'Show them ›'}</span>
              </button>
            )}

            <div className="sticky top-0 z-[5] -mx-4 mb-3 flex flex-wrap items-center gap-2 px-4 py-2 sm:static sm:mx-0 sm:px-0 sm:py-0" style={{ background: 'var(--qs-bg, var(--qs-card))' }}>
              <div className="flex w-full gap-1 rounded-lg p-1 sm:w-auto" style={{ background: 'var(--qs-elevated)' }}>
                {FILTERS.map(f => (
                  <button key={f.value} onClick={() => { setFilter(f.value); setOverdueOnly(false); }}
                    className={`min-h-[36px] flex-auto whitespace-nowrap rounded-md px-2 text-[13px] font-medium sm:flex-none sm:px-3 sm:text-sm ${filter === f.value && !overdueOnly ? 'bg-primary-600 text-white' : ''}`}
                    style={filter === f.value && !overdueOnly ? undefined : { color: 'var(--qs-text)' }}>
                    {f.short || f.label} <span className={filter === f.value && !overdueOnly ? 'opacity-80' : ''} style={filter === f.value && !overdueOnly ? undefined : { color: 'var(--qs-subtle)' }}>{counts[f.value]}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-72">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--qs-subtle)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, carrier, ZIP"
                  className="w-full rounded-lg py-2 pl-8 pr-3 text-sm" style={inputStyle} />
              </label>
            </div>

            <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
              {isLoading ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading rate checks…</div>
              ) : error ? (
                <div className="p-8 text-center text-red-600">Error loading rate checks. Please try again.</div>
              ) : households.length === 0 ? (
                <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
                  {search ? 'Nobody matches that search.' : filter === 'open' ? 'All caught up — nothing waiting for a quote.' : 'Nothing here yet.'}
                </div>
              ) : (
                <>
                  {/* Phones: cards. The whole card opens the quote; Start quote says so. */}
                  <ul className="md:hidden">
                    {households.map(h => <InboxCard key={h.key} h={h} now={now} onOpen={() => openRowFromList(h.lead)} />)}
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
                                {h.lead.first_name || 'No name'}{h.policies.length > 1 && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--qs-subtle)' }}>{h.policies.length} policies</span>}{h.lead.upload_source === 'agent' && <StaffTag />}
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
                            <td className="px-4 py-3 whitespace-nowrap">{h.decision ? <DecisionChip rc={h.decision} /> : <span style={{ color: 'var(--qs-subtle)' }}>—</span>}</td>
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

function RateCheckDrawer({ rc, household: rows, now, onClose, onSelect, onQuoted }) {
  // Prices saved in this drawer, so the chips and goal header update before the list refetches.
  const [saved, setSaved] = useState({});
  const household = rows.map(p => (p.id in saved ? { ...p, allstate_premium: saved[p.id] } : p));
  const quoted = (res) => {
    if (res?.allstate_premium != null) setSaved(m => ({ ...m, [rc.id]: res.allstate_premium }));
    onQuoted(res);
  };
  const warning = CONFIDENCE_WARNING[rc.extract_confidence];
  const insuredName = rc.extracted?.insured_name;
  const rescan = useRescanRateCheck();
  const canRescan = !!rc.image_path && !['won', 'lost', 'bound', 'declined'].includes(rc.status);
  const multi = household.length > 1;
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
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Rate check detail">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div onScroll={onScroll} className="relative h-full w-full max-w-xl overflow-y-auto shadow-xl" style={{ background: 'var(--qs-card)', color: 'var(--qs-text)' }}>
        {/* Who + how to reach them */}
        <div ref={header} className="sticky top-0 z-10 px-5 pt-4 pb-3 transition-transform duration-200"
          style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)', transform: headerHidden ? 'translateY(-100%)' : 'none' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold" style={{ color: 'var(--qs-bright)' }}>{rc.first_name || insuredName || 'Rate check'}</h2>
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                {[carrierLabel(rc), policyTypeLabel(rc.policy_type).toLowerCase()].filter(Boolean).join(' ') || 'Policy not read yet'} · <Age rc={rc} now={now} />
              </p>
              <OriginTag rc={rc} className="mt-0.5" />
              {rc.resubmitted_at && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
                  Sent again {new Date(rc.resubmitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {rc.resubmit_count > 1 ? ` · ${rc.resubmit_count} times` : ''}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusChip status={rc.status} />
              <button onClick={onClose} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="w-4 h-4" /></button>
            </div>
          </div>
          {rc.phone && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <a href={`tel:+1${rc.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 font-semibold text-white">
                <Phone className="h-4 w-4" /> Call {formatPhone(rc.phone)}
              </a>
              <a href={`sms:+1${rc.phone}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium" style={inputStyle}>
                <MessageSquare className="h-4 w-4" /> Text
              </a>
              {rc.email && (
                <a href={`mailto:${rc.email}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium" style={inputStyle}>
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
              <CopyButton text={formatPhone(rc.phone)} label="Copy phone number" className="p-2" />
              {rc.lead_id && (
                <Link to={`/agency/leads/${rc.lead_id}`} className="ml-auto inline-flex items-center gap-1 text-primary-600 hover:underline">
                  Lead record <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
          <GoalHeader household={household} />
        </div>

        {/* Household, what to quote, the price — one swipe each; then the quote sheet and reference */}
        <div className="pt-4">
          {/* Slide 1: the household (when there's more than one policy) with the price right under it. Slide 2: what to quote. */}
          <Carousel label="Quote this policy" slides={[
            { key: 'price', label: multi ? 'Household and price' : 'Price', content: (
              <div className="space-y-3">
                {multi && <HouseholdCard rc={rc} household={household} onSelect={onSelect} />}
                <QuoteBox rc={household.find(p => p.id === rc.id) || rc} onQuoted={quoted} />
                {rc.upload_source === 'agent' && (
                  <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Uploaded by staff — no texting consent on file, so no automatic texts go out. Follow up yourself.</p>
                )}
              </div>
            ) },
            { key: 'decision', label: 'What to quote', content: <DecisionCard rc={rc} /> },
          ]} />
        </div>

        <div className="space-y-6 p-5">
          {rc.extract_error && (
            <Notice tone="danger">
              We couldn&apos;t read this photo. Look at it below and fill in the policy details by hand.
              {canRescan && (
                <button onClick={() => rescan.mutate({ rateCheckId: rc.id })} disabled={rescan.isPending}
                  className="ml-2 inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${rescan.isPending ? 'animate-spin' : ''}`} /> {rescan.isPending ? 'Scanning…' : 'Scan again'}
                </button>
              )}
            </Notice>
          )}
          {rescan.isError && <Notice tone="danger">{rescan.error.message}</Notice>}
          {rescan.isSuccess && rescan.data?.status === 'extracted' && <Notice tone="info">Scanned again — check the details below.</Notice>}
          <PolicyDetails rc={rc} warning={!rc.extract_error ? warning : null} onRescan={canRescan && !rc.extract_error ? () => rescan.mutate({ rateCheckId: rc.id }) : null} rescanning={rescan.isPending} />
          <PolicyPhoto rc={rc} />
          <CurrentAgentBox rc={rc} />
          {(rc.status === 'lost' || ['refer', 'expanded_market'].includes(rc.decision)) && <ReferralBox rc={rc} />}
        </div>
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
  const deltaPct = result?.delta_pct ?? rc.delta_pct;
  const declined = rc.status === 'declined';
  // Bound locally the moment the agent marks it, before the row refetches.
  const [localBound, setLocalBound] = useState(null);
  const bound = rc.status === 'bound' || !!localBound;
  const boundInfo = localBound || rc;
  // An expanded-market risk is quoted with that carrier; the price box compares the same way.
  const market = rc.decision === 'expanded_market' && rc.decision_carrier ? rc.decision_carrier : 'Allstate';

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

  const script = `Hi ${rc.first_name || 'there'}, it's Cam with Allstate. You sent your ${rc.carrier || 'current'} policy over — ` +
    `I was able to beat it by ${money(delta)} a year with the same coverage. Do you have 5 minutes now to lock it in?`;

  return (
    <section className="rounded-xl p-4" style={CARD_STYLE}>
      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>They pay now</p>
      <p className="text-3xl font-bold" style={{ color: 'var(--qs-bright)' }}>
        {rc.annual_premium != null ? <>{money(rc.annual_premium)}<span className="text-base font-medium" style={{ color: 'var(--qs-subtle)' }}>/yr</span></> : 'Price not read yet'}
      </p>
      {Number(rc.term_months) === 6 && rc.current_premium != null && (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{money(rc.current_premium)} every 6 months</p>
      )}


      {bound && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }}>
          <div className="text-xl font-extrabold text-green-600">Bound with {boundInfo.bound_carrier || 'Allstate'}{boundInfo.bound_premium != null ? ` at ${money(boundInfo.bound_premium)}/yr` : ''}</div>
          <p className="text-sm" style={{ color: 'var(--qs-text)' }}>{boundInfo.bound_at ? new Date(boundInfo.bound_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{rc.annual_premium != null && boundInfo.bound_premium != null ? ` · they were paying ${money(rc.annual_premium)}` : ''}</p>
        </div>
      )}
      {!bound && <form onSubmit={submit} className="mt-4 space-y-2">
        <label className="block text-sm font-medium" htmlFor="rc-allstate" style={{ color: 'var(--qs-bright)' }}>{market} price per year</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            {premium && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--qs-subtle)' }}>$</span>}
            <input id="rc-allstate" className={`w-full rounded-md py-2 pr-2 text-base ${premium ? 'pl-7' : 'pl-3'}`} style={inputStyle} inputMode="decimal" placeholder="Enter annual price"
              value={premium} onChange={e => setPremium(sanitizeMoneyInput(e.target.value))} disabled={declined} />
          </div>
          <button type="submit" disabled={enterQuote.isPending || !(parseMoney(premium) > 0) || declined}
            className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-60">
            {enterQuote.isPending ? 'Saving…' : justSaved ? 'Saved ✓' : outcome ? 'Update' : 'Save'}
          </button>
        </div>
        {/* Live: what this price saves them, before Save (once saved, the result box below says it). */}
        {!(outcome && parseMoney(premium) === Number(result?.allstate_premium ?? rc.allstate_premium)) && (
          <LiveDelta current={rc.annual_premium} price={parseMoney(premium)} />
        )}
        {looksTooLow(rc.annual_premium, parseMoney(premium)) && (
          <p className="text-sm text-yellow-600">That&apos;s a big drop — double-check the limits match.</p>
        )}
      </form>}
      {rc.annual_premium == null && !declined && (
        <p className="mt-2 text-xs text-yellow-600">Fill in their current price under Policy first — otherwise we can&apos;t tell if Allstate wins.</p>
      )}
      {enterQuote.isError && <p className="mt-2 text-sm text-red-600">{enterQuote.error.message}</p>}

      {outcome === 'won' && !bound && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' }}>
          <div className="text-2xl font-extrabold text-green-600">Saves {money(delta)}/yr{deltaPct != null ? ` (${Math.round(deltaPct)}%)` : ''}</div>
          <p className="text-sm" style={{ color: 'var(--qs-text)' }}>Call now. The lead is marked Interested.</p>
          <p className="mt-3 select-text text-sm" style={{ color: 'var(--qs-bright)' }}>“{script}”</p>
          <CopyTextButton text={script} className="mt-2 text-xs font-semibold text-primary-600 hover:underline">Copy script</CopyTextButton>
          <BindForm rc={rc} market={market} defaultPremium={result?.allstate_premium ?? rc.allstate_premium}
            onBound={(b) => { setLocalBound(b); onQuoted?.(b); }} />
        </div>
      )}
      {outcome === 'lost' && (
        <div className="mt-4 text-sm">
          <div className="font-semibold" style={{ color: 'var(--qs-bright)' }}>
            {market} can&apos;t beat {money(rc.annual_premium)}/yr (quoted {money(result?.allstate_premium ?? rc.allstate_premium)}). Lead closed.
          </div>
          {result?.sms && (
            result.sms.attempted && result.sms.ok
              ? <p className="mt-1 text-green-600">We sent them a polite text.</p>
              : <p className="mt-1 text-yellow-600">No text sent{result.sms.reason ? ` — ${result.sms.reason}` : result.sms.error ? ` — ${result.sms.error}` : ''}.</p>
          )}
        </div>
      )}
    </section>
  );
}

// Step 3: the policy was written. Closes the lead as won and feeds the scoreboard.
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
        { onSuccess: (res) => onBound?.({ status: 'bound', bound_carrier: res.bound_carrier, bound_premium: res.bound_premium, bound_at: new Date().toISOString() }) }); }}>
      <label className="text-sm"><span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>Bound with</span>
        <select value={carrier} onChange={e => setCarrier(e.target.value)} className="rounded-md px-2 py-1.5" style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__other">Other…</option>
        </select>
      </label>
      {carrier === '__other' && <input value={other} onChange={e => setOther(e.target.value)} placeholder="Carrier" className="rounded-md px-2 py-1.5 text-sm" style={inputStyle} />}
      <label className="text-sm"><span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>Premium / yr</span>
        <input value={premium} onChange={e => setPremium(sanitizeMoneyInput(e.target.value))} inputMode="decimal" className="w-28 rounded-md px-2 py-1.5" style={inputStyle} />
      </label>
      <button type="submit" disabled={!chosen || bind.isPending} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {bind.isPending ? 'Saving…' : 'Mark bound'}
      </button>
      {bind.isError && <span className="text-sm text-red-600">{bind.error.message}</span>}
    </form>
  );
}

// The quote sheet (PolicySheet) with Scan again / Fix details; "Fix details" swaps in the form.
function PolicyDetails({ rc, warning, onRescan, rescanning }) {
  const [editing, setEditing] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={heading} style={{ color: 'var(--qs-bright)' }}>Quote sheet</h3>
        {!editing && (
          <div className="flex items-center gap-3">
            {onRescan && (
              <button onClick={onRescan} disabled={rescanning} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} /> {rescanning ? 'Scanning…' : 'Scan again'}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
              <Pencil className="h-3.5 w-3.5" /> Fix details
            </button>
          </div>
        )}
      </div>
      {editing ? <PolicyForm rc={rc} onDone={() => setEditing(false)} /> : <PolicySheet rc={rc} warning={warning} />}
    </section>
  );
}

function PolicyPhoto({ rc }) {
  const { data: imageUrl, isLoading } = useRateCheckImageUrl(rc.image_path);
  const isPdf = rc.image_media_type === 'application/pdf';
  return (
    <section>
      <h3 className={heading} style={{ color: 'var(--qs-bright)' }}>What they sent</h3>
      {!rc.image_path ? (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>No photo on file. Photos are deleted after 90 days.</p>
      ) : isLoading ? (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</p>
      ) : !imageUrl ? (
        <p className="text-sm text-red-600">Couldn&apos;t load the photo.</p>
      ) : isPdf ? (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
          Open the PDF <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="block" title="Open full size">
          <img src={imageUrl} alt="Policy page the customer sent" className="max-h-72 w-full rounded-lg border object-contain object-top"
            style={{ borderColor: 'var(--qs-border)', background: '#fff' }} />
          <span className="mt-1 inline-flex items-center gap-1 text-sm text-primary-600">Open full size <ExternalLink className="h-3.5 w-3.5" /></span>
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
  const label = (text) => <span style={{ color: 'var(--qs-subtle)' }}>{text}</span>;
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
        That&apos;s <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{money(annual, { cents: true })}</span> a year.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={save} disabled={update.isPending} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onDone} disabled={update.isPending} className="rounded-lg px-3 py-1.5 text-sm" style={inputStyle}>Cancel</button>
        {update.isError && <span className="text-sm text-red-600">{update.error.message}</span>}
      </div>
    </div>
  );
}
