// Employee's personal retention queue — cases assigned to them.
// Reuses EventDetailModal and RenewalDetailModal from RetentionCancels
// but scoped entirely to the current employee via RLS.

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees } from '../hooks/useEmployees';
import { calcCancelPriority, daysUntilCancel, compareByTier } from '../lib/retentionPriority';
import { buildChurnModel, expectedSaveablePremium } from '../lib/retentionElasticity';
import { useBookSnapshots } from '../hooks/useBookMetrics';
import { useInterventionEffectiveness } from '../hooks/useInterventionEffectiveness';
import { EventDetailModal, RenewalDetailModal } from './components/retention/RetentionCancels';
import ReadingColumn from '../components/ReadingColumn';
import { CallScriptBox, VoicemailScriptBox, renewalCallScript, cancelCallScript } from '../components/RetentionScripts';
import { titleCaseName } from '../lib/names';
import { productLabel } from '../lib/productLabels';

// Snooze guardrails: a case can't be deferred once its deadline is within 14
// days, and a snooze can never PARK it to within 14 days of the deadline — so a
// case never hides past the point it has to be worked. eligibleSnoozeOptions
// returns the still-allowed durations for a given deadline (possibly none).
const SNOOZE_CHOICES = [
  { days: 1, reason: 'retry_tomorrow',   label: '1 day — retry tomorrow' },
  { days: 2, reason: 'retry_in_2_days',  label: '2 days — retry in 2 days' },
  { days: 7, reason: 'retry_next_week',  label: '1 week — retry next week' },
];
const SNOOZE_DEADLINE_BUFFER_DAYS = 14;
function eligibleSnoozeOptions(deadlineStr) {
  if (!deadlineStr) return SNOOZE_CHOICES; // no deadline → no deadline risk
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(deadlineStr) - today) / 86400000);
  const maxSnooze = days - SNOOZE_DEADLINE_BUFFER_DAYS;
  if (maxSnooze < 1) return [];
  return SNOOZE_CHOICES.filter(c => c.days <= maxSnooze);
}

// The rep reads scripts verbatim — full name, or a clear placeholder if the
// employee record hasn't loaded.
function agentNameFor(employee) {
  return [employee?.preferred_name || employee?.first_name, employee?.last_name]
    .filter(Boolean).join(' ') || '[your name]';
}

// Format relative time — "2d ago", "3h ago", "just now"
function relativeTime(dateStr) {
  if (!dateStr) return null;
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Format phone for display
function fmtPhone(phone) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return phone;
}

// Format currency
const fmt$ = n => n == null ? '—' : n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Math.round(n)}`;

// Normalize a date for display / scripts — "April 13, 2026". Date-only strings
// (YYYY-MM-DD) are parsed as local time to avoid a timezone off-by-one.
function fmtDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Attempt result labels
const RESULT_LABELS = {
  no_answer:      'No Answer',
  left_voicemail: 'Left Voicemail',
  reached:        'Reached',
  wrong_number:   'Wrong Number',
  busy:           'Busy',
  disconnected:   'Disconnected',
};

// Collapse a household's policies into one queue entry (call once, work both
// lines). Preserves the incoming queue order — the household sits where its
// first/soonest policy ranks; single-policy customers pass through unchanged.
function groupRenewalsByHousehold(cases) {
  const groups = [];
  const byKey = {};
  for (const ev of cases) {
    const key = (ev.customer_name || '').trim().toLowerCase();
    if (key && byKey[key]) { byKey[key].cases.push(ev); continue; }
    const g = { key: key || ev.id, cases: [ev] };
    if (key) byKey[key] = g;
    groups.push(g);
  }
  return groups;
}

const PRIORITY_BUCKETS = [
  {
    key: 'P0',
    label: '🔴 LAPSED — Coverage Gone',
    sublabel: 'Policy terminated. Reinstatement call required.',
    color: '#EF4444',
  },
  {
    key: 'P1',
    label: '🟠 HIGH PRIORITY',
    sublabel: 'Past due or <7 days · Premium ≥$2,000',
    color: '#F59E0B',
  },
  {
    key: 'P2',
    label: '🟡 STANDARD',
    sublabel: 'Past due or <7 days · Premium <$2,000',
    color: '#64748B',
  },
  {
    key: 'P3',
    label: '⚪ UPCOMING',
    sublabel: 'More than 7 days until cancel date',
    color: '#334155',
  },
];

// Last attempt one-liner
function lastAttemptSummary(result, attemptedAt) {
  if (!result && !attemptedAt) return null;
  const label = RESULT_LABELS[result] || result;
  const ago   = relativeTime(attemptedAt);
  return `${label}${ago ? ` · ${ago}` : ''}`;
}

export default function MyQueuePage() {
  const { data: employee } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [activeTab, setActiveTab] = useState('cancel'); // 'cancel' | 'renewal'


  // Transcript expand
  const [expandedTranscript, setExpandedTranscript] = useState(null); // event.id

  // Master-detail selection — which cancel lead is open in the right pane.
  const [selectedCancelId, setSelectedCancelId] = useState(null);
  const [selectedRenewalCaseId, setSelectedRenewalCaseId] = useState(null);

  // Stale refresh tracking
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // Force a real refetch (bypasses staleTime) with visible feedback, so the
  // button always pulls current data — invalidate alone can silently no-op.
  async function refreshQueue() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refetchCancel(),
        refetchRenewal(),
        queryClient.invalidateQueries({ queryKey: ['my_cancel_cases_snoozed', employeeId] }),
      ]);
      setLastRefreshed(Date.now());
    } finally {
      setRefreshing(false);
    }
  }

  // Cancel filter bar — client-side filter of cancelCases
  // values: 'all' | 'lapsed' | 'pending' | 'never_called' | 'multi_policy' | 'callbacks' | 'snoozed'
  const [cancelFilter, setCancelFilter] = useState('all');

  // Focus mode — show only top N cases up to the employee's daily call target
  const [focusMode, setFocusMode] = useState(() => {
    try { return sessionStorage.getItem('qs_queue_focus') !== 'false'; }
    catch { return true; }
  });
  function toggleFocusMode() {
    setFocusMode(m => {
      const next = !m;
      try { sessionStorage.setItem('qs_queue_focus', String(next)); } catch { /* noop */ }
      return next;
    });
  }



  // Renewal list filter + closing-window mode. Declared up here (not next to the
  // filter memo) because renewalStats below reads closingMode — declaring it
  // later would be a temporal-dead-zone access.
  const [renewalFilter, setRenewalFilter] = useState('all');
  const [closingMode, setClosingMode] = useState('soon'); // 'soon' (≤14d) | 'proactive' (≥21d)
  const clickTimerRef = useRef(null);

  const employeeId = employee?.id;
  const orgId      = employee?.org_id;

  // Fetch active employees for the Assigned To dropdown in the detail modals.
  const { data: employees = [] } = useActiveEmployees(orgId);

  // Pull cases assigned to this employee — RLS enforces they only see their own.
  // Snoozed cases (snoozed_until in the future) are hidden from the default view.
  const { data: cancelCases = [], isLoading: cancelLoading, refetch: refetchCancel } = useQuery({
    queryKey: ['my_cancel_cases', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('pending_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)')
        .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)
        .order('cancel_effective_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(e => ({
        ...e,
        _priority: calcCancelPriority(e),
      })).sort(compareByTier);
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });

  // Snoozed cancel cases — only fetched when the Snoozed filter is active.
  const { data: snoozedCancelCases = [] } = useQuery({
    queryKey: ['my_cancel_cases_snoozed', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('pending_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)')
        .gte('snoozed_until', new Date().toISOString())
        .order('snoozed_until', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId && cancelFilter === 'snoozed',
    staleTime: 2 * 60 * 1000,
  });

  const { data: renewalCases = [], isLoading: renewalLoading, refetch: refetchRenewal } = useQuery({
    queryKey: ['my_renewal_cases', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('renewal_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)')
        .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)
        .order('renewal_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });

  const roles = employee?.roles || [];

  // Track stale refresh
  useEffect(() => {
    if (!cancelLoading && !renewalLoading) setLastRefreshed(Date.now());
  }, [cancelLoading, renewalLoading]);

  // Today's Focus stats
  const todayStr = new Date().toISOString().slice(0, 10);

  // Saveable-premium ranking — same model the principal's Targeting tab uses:
  // premium × churn (observed retention by product/tenure, rate-shock adjusted)
  // × save lift. Falls back to product priors when book metrics aren't
  // readable in this context. Declared here (above renewalStats/focusRenewal,
  // which depend on it) to avoid a temporal-dead-zone reference error.
  const { data: book } = useBookSnapshots(orgId);
  const { effectiveSaveLift } = useInterventionEffectiveness(orgId);
  const churnModel = useMemo(() => buildChurnModel(book?.products || []), [book]);

  const focusStats = useMemo(() => {
    const criticalCount    = cancelCases.filter(e => {
      const d = daysUntilCancel(e.cancel_effective_date);
      return d !== null && d <= 3;
    }).length;
    const totalPremiumAtRisk = cancelCases.reduce((s, e) => s + (parseFloat(e.premium_at_risk) || 0), 0);
    const attemptedToday   =
      cancelCases.filter(e => e.last_attempt_at?.slice(0, 10) === todayStr).length +
      renewalCases.filter(e => e.last_attempt_at?.slice(0, 10) === todayStr).length;
    const untouched        = cancelCases.filter(e => !e.attempt_count || e.attempt_count === 0).length;
    return { criticalCount, totalPremiumAtRisk, attemptedToday, untouched };
  }, [cancelCases, renewalCases, todayStr]);

  // Renewal-tab KPI stats — the renewal queue's working model: urgency
  // (window closing), risk (rate shocks), value (expected saveable), backlog.
  const renewalStats = useMemo(() => {
    const daysOf = (r) => {
      const d = new Date(r.renewal_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((d - today) / 86400000);
    };
    const closingCount = renewalCases.filter(r => {
      const d = daysOf(r);
      if (isNaN(d)) return false;
      return closingMode === 'proactive' ? d >= 21 : d <= 14;
    }).length;
    const rateShockCount = renewalCases.filter(r =>
      r.rate_shock_flag || (parseFloat(r.premium_change_pct) || 0) >= 15
    ).length;
    const totalSaveable = renewalCases.reduce(
      (s, r) => s + expectedSaveablePremium(r, churnModel, effectiveSaveLift), 0
    );
    const untouched = renewalCases.filter(r => !r.attempt_count).length;
    return { closingCount, rateShockCount, totalSaveable, untouched };
  }, [renewalCases, churnModel, effectiveSaveLift, closingMode]);

  // Multi-policy flag lookup — same customer appearing in >1 case
  const customerPolicyCounts = useMemo(() => {
    const counts = {};
    for (const c of cancelCases) {
      counts[c.customer_name] = (counts[c.customer_name] || 0) + 1;
    }
    for (const r of renewalCases) {
      counts[r.customer_name] = (counts[r.customer_name] || 0) + 1;
    }
    return counts;
  }, [cancelCases, renewalCases]);

  // Client-side filter applied to cancel cases before bucketing
  const filteredCancelCases = useMemo(() => {
    switch (cancelFilter) {
      case 'critical':
        return cancelCases.filter(e => {
          const d = daysUntilCancel(e.cancel_effective_date);
          return d !== null && d <= 3;
        });
      case 'lapsed':
        return cancelCases.filter(e => e.stage === 'cancelled');
      case 'pending':
        return cancelCases.filter(e => e.stage === 'pending_cancel');
      case 'never_called':
        return cancelCases.filter(e => !e.attempt_count || e.attempt_count === 0);
      case 'multi_policy':
        return cancelCases.filter(e => (customerPolicyCounts[e.customer_name] || 1) > 1);
      case 'snoozed':
        return snoozedCancelCases;
      case 'callbacks':
        return cancelCases
          .filter(e => e.callback_at)
          .sort((a, b) => new Date(a.callback_at) - new Date(b.callback_at));
      case 'promises':
        // Overdue pay-promises — they said they'd pay by a date that has passed.
        return cancelCases
          .filter(e => e.promise_date && new Date(e.promise_date) < new Date())
          .sort((a, b) => new Date(a.promise_date) - new Date(b.promise_date));
      default:
        return cancelCases;
    }
  }, [cancelCases, cancelFilter, customerPolicyCounts, snoozedCancelCases]);

  // Daily call target from employee record
  const dailyTarget = employee?.daily_call_target ?? 8;

  // Calls logged today across both queues (cases touched today via last_attempt_at)
  const callsToday = useMemo(() => {
    const cancelToday = cancelCases.filter(c =>
      c.last_attempt_at?.slice(0, 10) === todayStr
    ).length;
    const renewalToday = renewalCases.filter(c =>
      c.last_attempt_at?.slice(0, 10) === todayStr
    ).length;
    return cancelToday + renewalToday;
  }, [cancelCases, renewalCases, todayStr]);

  const targetHit = callsToday >= dailyTarget;
  const progressPct = Math.min(100, Math.round((callsToday / dailyTarget) * 100));

  // Focus cases — top N from filteredCancelCases (touched today appear first
  // so cards don't jump after logging a call), capped at dailyTarget.
  const focusCases = useMemo(() => {
    const touched = filteredCancelCases.filter(c => c.last_attempt_at?.slice(0, 10) === todayStr);
    const untouched = filteredCancelCases.filter(c => c.last_attempt_at?.slice(0, 10) !== todayStr);
    return [...touched, ...untouched].slice(0, dailyTarget);
  }, [filteredCancelCases, dailyTarget, todayStr]);

  // The cases the queue actually displays based on focus toggle.
  // Callbacks view shows every scheduled callback (no focus cap), soonest first.
  const displayCancelCases = (focusMode && cancelFilter !== 'callbacks' && cancelFilter !== 'promises') ? focusCases : filteredCancelCases;

  // KPI-card filter for the renewal list: 'all' | 'closing' | 'rate_shock' | 'untouched'
  // (renewalFilter / closingMode / clickTimerRef are declared at the top of the
  // component so renewalStats can read closingMode without a TDZ error.)
  const inClosingWindow = (d) => isNaN(d) ? false : (closingMode === 'proactive' ? d >= 21 : d <= 14);
  const filteredRenewalCases = useMemo(() => {
    const daysOf = (r) => {
      const d = new Date(r.renewal_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((d - today) / 86400000);
    };
    switch (renewalFilter) {
      case 'closing':
        return renewalCases.filter(r => inClosingWindow(daysOf(r)));
      case 'rate_shock':
        return renewalCases.filter(r => r.rate_shock_flag || (parseFloat(r.premium_change_pct) || 0) >= 15);
      case 'untouched':
        return renewalCases.filter(r => !r.attempt_count);
      case 'callbacks':
        return renewalCases
          .filter(r => r.callback_at)
          .sort((a, b) => new Date(a.callback_at) - new Date(b.callback_at));
      default:
        return renewalCases;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewalCases, renewalFilter, closingMode]);

  // Renewal focus — same daily-target cap as the cancel queue, but ordered by
  // expected saveable premium so reps work the highest-value calls first.
  // Touched-today float up so cards don't jump after a call. The full-queue
  // view keeps its soonest-first order for browsing.
  const focusRenewalCases = useMemo(() => {
    const bySaveable = (a, b) =>
      expectedSaveablePremium(b, churnModel, effectiveSaveLift)
      - expectedSaveablePremium(a, churnModel, effectiveSaveLift);
    const touched = filteredRenewalCases.filter(c => c.last_attempt_at?.slice(0, 10) === todayStr);
    const untouched = filteredRenewalCases
      .filter(c => c.last_attempt_at?.slice(0, 10) !== todayStr)
      .slice()
      .sort(bySaveable);
    return [...touched, ...untouched].slice(0, dailyTarget);
  }, [filteredRenewalCases, dailyTarget, todayStr, churnModel, effectiveSaveLift]);
  const displayRenewalCases = (focusMode && renewalFilter !== 'callbacks') ? focusRenewalCases : filteredRenewalCases;
  const groupedRenewals = groupRenewalsByHousehold(displayRenewalCases);

  // Master-detail selection for the renewal dialer (mirrors the cancel tab).
  const selectedRenewalCase =
    displayRenewalCases.find(c => c.id === selectedRenewalCaseId) || displayRenewalCases[0] || null;
  const selectedRenewalIdx = selectedRenewalCase
    ? displayRenewalCases.findIndex(c => c.id === selectedRenewalCase.id)
    : -1;

  // Bucket display cases by priority_tier (P0 → P3, plus an "other" fallback)
  const cancelBuckets = useMemo(() => {
    const groups = { P0: [], P1: [], P2: [], P3: [], other: [] };
    for (const c of displayCancelCases) {
      const tier = c.priority_tier;
      if (tier && groups[tier]) groups[tier].push(c);
      else groups.other.push(c);
    }
    return groups;
  }, [displayCancelCases]);

  // In the Callbacks / Promises views, skip priority bucketing — show one flat
  // group in strict due order so reps work them in sequence.
  const FLAT_CANCEL_VIEWS = {
    callbacks: { label: '📅 CALLBACKS · soonest first',    color: '#60A5FA' },
    promises:  { label: '⚠ PAY PROMISES · most overdue first', color: '#F87171' },
  };
  const BUCKETS = FLAT_CANCEL_VIEWS[cancelFilter]
    ? (displayCancelCases.length
        ? [{ key: cancelFilter, ...FLAT_CANCEL_VIEWS[cancelFilter], cases: displayCancelCases }]
        : [])
    : PRIORITY_BUCKETS
        .map(b => ({ ...b, cases: cancelBuckets[b.key] || [] }))
        .filter(b => b.cases.length > 0);

  // Flattened, in-priority-order list backing the master-detail pane and
  // keyboard navigation. "other" tier cases (no recognized tier) trail behind.
  const flatCancelCases = useMemo(() => (
    (cancelFilter === 'callbacks' || cancelFilter === 'promises')
      ? displayCancelCases
      : [
          ...PRIORITY_BUCKETS.flatMap(b => cancelBuckets[b.key] || []),
          ...(cancelBuckets.other || []),
        ]
  ), [cancelBuckets, cancelFilter, displayCancelCases]);
  const selectedCancel =
    flatCancelCases.find(c => c.id === selectedCancelId) || flatCancelCases[0] || null;
  const selectedCancelIdx = selectedCancel
    ? flatCancelCases.findIndex(c => c.id === selectedCancel.id)
    : -1;

  // Keep the selection valid as the list changes (filters, focus mode, a case
  // resolving and dropping out). Falls back to the first lead.
  useEffect(() => {
    if (flatCancelCases.length === 0) {
      if (selectedCancelId !== null) setSelectedCancelId(null);
    } else if (!flatCancelCases.some(c => c.id === selectedCancelId)) {
      setSelectedCancelId(flatCancelCases[0].id);
    }
  }, [flatCancelCases, selectedCancelId]);

  useEffect(() => {
    if (displayRenewalCases.length === 0) {
      if (selectedRenewalCaseId !== null) setSelectedRenewalCaseId(null);
    } else if (!displayRenewalCases.some(c => c.id === selectedRenewalCaseId)) {
      setSelectedRenewalCaseId(displayRenewalCases[0].id);
    }
  }, [displayRenewalCases, selectedRenewalCaseId]);

  // Keyboard call-through: ↑/↓ or j/k to move between leads, C to dial the
  // selected lead. Ignored while typing or when a popover/modal is open.
  useEffect(() => {
    function onKey(e) {
      if (activeTab !== 'cancel' && activeTab !== 'renewal') return;
      if (selectedEvent || selectedRenewal) return;
      // Don't hijack browser/OS shortcuts — e.g. Ctrl/Cmd+C is copy, not "call".
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

      const isCancel = activeTab === 'cancel';
      const list = isCancel ? flatCancelCases : displayRenewalCases;
      const current = isCancel ? selectedCancel : selectedRenewalCase;
      const select = isCancel ? setSelectedCancelId : setSelectedRenewalCaseId;
      if (!list.length) return;
      const idx = list.findIndex(c => c.id === current?.id);
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const next = list[Math.min(idx + 1, list.length - 1)];
        if (next) select(next.id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prev = list[Math.max(idx - 1, 0)];
        if (prev) select(prev.id);
      } else if (e.key === 'c' || e.key === 'C') {
        const dial = current?.phone || current?.customer_phone;
        if (dial) window.location.href = `tel:${dial}`;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, flatCancelCases, displayRenewalCases, selectedCancel, selectedRenewalCase, selectedEvent, selectedRenewal]);

  // Keep the active row visible in the (independently scrolling) master list.
  useEffect(() => {
    if (!selectedCancel) return;
    document.querySelector(`[data-cancel-row="${selectedCancel.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCancel?.id]);

  useEffect(() => {
    if (!selectedRenewalCase) return;
    document.querySelector(`[data-renewal-row="${selectedRenewalCase.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRenewalCase?.id]);

  async function updateCancelCase(id, updates) {
    const { error } = await supabase
      .from('pending_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases', employeeId] });
    }
    return error;
  }

  async function updateRenewalCase(id, updates) {
    const { error } = await supabase
      .from('renewal_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['my_renewal_cases', employeeId] });
    }
    return error;
  }


  // Snooze a case for N days — hides it from the default queue. Guarded so it
  // can never park a case within 14 days of its deadline, and counts re-snoozes
  // so repeatedly-parked cases stay visible to the principal.
  async function handleSnooze(type, event, days, reason) {
    const deadline = type === 'cancel' ? event.cancel_effective_date : event.renewal_date;
    if (!eligibleSnoozeOptions(deadline).some(c => c.days === days)) return; // guardrail

    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    const patch = {
      snoozed_until: snoozeUntil.toISOString(),
      snooze_reason: reason,
      snooze_count: (event.snooze_count || 0) + 1,
    };

    if (type === 'cancel') {
      await updateCancelCase(event.id, patch);
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases_snoozed', employeeId] });
    } else {
      await updateRenewalCase(event.id, patch);
    }
  }


  // Compact master-list row — dense and scannable, ~15-18 visible at once.
  function CancelRow({ event, policyCount = 1, active, onSelect }) {
    const days     = daysUntilCancel(event.cancel_effective_date);
    const isLapsed = event.stage === 'cancelled';
    const urgent   = days !== null && days <= 3;
    const statusText = isLapsed ? 'Lapsed'
      : days === null ? '—'
      : days === 0 ? 'Today'
      : days < 0 ? `${Math.abs(days)}d ago`
      : `${days}d`;
    const statusColor = (isLapsed || urgent) ? '#F87171'
      : (days !== null && days <= 7) ? '#FBBF24'
      : 'var(--qs-dim)';
    const sub = [
      productLabel(event.product),
      event.amount_due > 0 ? `${fmt$(event.amount_due)} due` : null,
      policyCount > 1 ? `${policyCount} policies` : `${event.attempt_count || 0} attempts`,
    ].filter(Boolean).join(' · ');

    return (
      <button
        type="button"
        data-cancel-row={event.id}
        onClick={onSelect}
        className="qs-focusable qs-cancel-row"
        aria-current={active ? 'true' : undefined}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: active ? 'rgba(59,130,246,0.14)' : undefined,
          border: '1px solid',
          borderColor: active ? 'rgba(59,130,246,0.45)' : 'transparent',
          borderLeft: `3px solid ${active ? '#3B82F6' : isLapsed ? '#EF4444' : urgent ? '#F87171' : 'transparent'}`,
          borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 2,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--qs-bright)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {titleCaseName(event.customer_name)}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: statusColor, flexShrink: 0 }}>
            {statusText}
          </span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--qs-dim)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      </button>
    );
  }

  // Compact master-list row for the renewal dialer (mirrors CancelRow).
  function RenewalRow({ event, active, onSelect }) {
    const d = (() => {
      const date = new Date(event.renewal_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((date - today) / 86400000);
    })();
    const statusText = isNaN(d) ? '—' : d === 0 ? 'Today' : d < 0 ? 'Overdue' : `${d}d`;
    const statusColor = d <= 7 ? '#F87171' : d <= 14 ? '#FBBF24' : d >= 21 ? '#34D399' : 'var(--qs-dim)';
    const changePct = parseFloat(event.premium_change_pct) || 0;
    const saveable = expectedSaveablePremium(event, churnModel, effectiveSaveLift);
    const sub = [
      productLabel(event.product),
      event.premium != null ? fmt$(event.premium) : null,
      changePct >= 15 ? `⚠ +${changePct.toFixed(0)}%` : null,
      saveable > 0 ? `~${fmt$(saveable)} saveable` : null,
    ].filter(Boolean).join(' · ');

    return (
      <button
        type="button"
        data-renewal-row={event.id}
        onClick={onSelect}
        className="qs-focusable qs-cancel-row"
        aria-current={active ? 'true' : undefined}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: active ? 'rgba(59,130,246,0.14)' : undefined,
          border: '1px solid',
          borderColor: active ? 'rgba(59,130,246,0.45)' : 'transparent',
          borderLeft: `3px solid ${active ? '#3B82F6' : changePct >= 15 ? '#F87171' : 'transparent'}`,
          borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 2,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--qs-bright)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {titleCaseName(event.customer_name)}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: statusColor, flexShrink: 0 }}>
            {statusText}
          </span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--qs-dim)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      </button>
    );
  }

  // Multi-policy household — one card, a row per policy. Call the customer once
  // and work each line; clicking a policy row opens that case like any other.
  function HouseholdRenewalGroup({ cases, selectedId, onSelect }) {
    const name = titleCaseName(cases[0].customer_name);
    return (
      <div style={{ border: '1px solid var(--qs-border)', borderRadius: 8,
        marginBottom: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, padding: '6px 10px', background: 'var(--qs-elevated)' }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--qs-bright)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--qs-dim)',
            background: 'var(--qs-card)', padding: '1px 7px', borderRadius: 10, flexShrink: 0 }}>
            {cases.length} policies · 1 call
          </span>
        </div>
        {cases.map(ev => {
          const date = new Date(ev.renewal_date);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const d = Math.ceil((date - today) / 86400000);
          const statusText = isNaN(d) ? '—' : d === 0 ? 'Today' : d < 0 ? 'Overdue' : `${d}d`;
          const statusColor = d <= 7 ? '#F87171' : d <= 14 ? '#FBBF24' : d >= 21 ? '#34D399' : 'var(--qs-dim)';
          const changePct = parseFloat(ev.premium_change_pct) || 0;
          const active = selectedId === ev.id;
          return (
            <button
              key={ev.id}
              type="button"
              data-renewal-row={ev.id}
              onClick={() => onSelect(ev.id)}
              className="qs-focusable"
              aria-current={active ? 'true' : undefined}
              style={{
                display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
                gap: 8, textAlign: 'left', cursor: 'pointer', border: 'none',
                background: active ? 'rgba(59,130,246,0.14)' : 'transparent',
                borderLeft: `3px solid ${active ? '#3B82F6' : changePct >= 15 ? '#F87171' : 'transparent'}`,
                padding: '0.45rem 0.75rem',
              }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--qs-dim)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {productLabel(ev.product)}{ev.premium != null ? ` · ${fmt$(ev.premium)}` : ''}
                {changePct >= 15 ? ` · ⚠ +${changePct.toFixed(0)}%` : ''}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                {statusText}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Right-pane detail for the active call — full script + actions.
  function CancelDetail({ event, policyCount = 1, position }) {
    const days       = daysUntilCancel(event.cancel_effective_date);
    const urgent     = days !== null && days <= 3;
    const phone      = event.phone;
    const lastAtt    = lastAttemptSummary(event.last_attempt_result, event.last_attempt_at);
    const promisePast = event.promise_date && new Date(event.promise_date) < new Date();
    const promiseSoon = event.promise_date && !promisePast;
    const isLapsed   = event.stage === 'cancelled';

    // Talking-point script strip — primary purpose of the call.
    // NOTE: the 120-day rewrite window is an internal agent/VC business rule.
    // It must never appear in customer-facing call scripts.
    const firstName = event.customer_name?.split(' ')[0] || 'there';
    // The rep reads the script verbatim — use their full name (first + last),
    // falling back to the "[your name]" placeholder if the employee isn't loaded.
    const agentName = [employee?.preferred_name || employee?.first_name, employee?.last_name]
      .filter(Boolean).join(' ') || '[your name]';
    const scriptLine = cancelCallScript({
      firstName, agentName, product: event.product, isLapsed,
      amountDue: event.amount_due, effectiveDate: event.cancel_effective_date,
    });

    // Color-coded urgency for the "days until cancel" key fact.
    const daysColor = urgent ? '#F87171' : days <= 7 ? '#FBBF24' : 'var(--qs-dim)';
    const daysLabel = days === null ? '—'
      : days === 0 ? 'TODAY'
      : days < 0 ? `${Math.abs(days)}d ago`
      : `${days}d`;

    // Status / inline-badge chips. Bumped off text-xs so labels stay legible.
    const chip = {
      fontSize: '0.875rem', fontWeight: 700, borderRadius: 6,
      padding: '0.1875rem 0.5rem', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    };
    // Shared 44px-tall action control — meets the AA touch-target minimum.
    // Fluid label so controls read larger on big monitors.
    const btnBase = {
      minHeight: '2.75rem', padding: '0 1.125rem', borderRadius: 8,
      fontSize: 'clamp(0.9375rem, 0.9rem + 0.2vw, 1.0625rem)',
      fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    };
    // Compact "key facts" tile — amount due / days, grouped near the name.
    // Capped so the cluster stays tight on a full-width card instead of
    // stretching edge to edge.
    const factTile = {
      flex: '0 1 18rem', minWidth: '12rem',
      background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 8, padding: '0.75rem 1rem',
    };
    const factLabel = {
      fontSize: '0.8125rem', fontWeight: 700, color: 'var(--qs-dim)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem',
    };
    // Fluid value size for the headline numbers (amount / days).
    const factValueSize = 'clamp(1.625rem, 1.3rem + 1vw, 2.25rem)';

    return (
      <article style={{
        background:  'var(--qs-card)',
        border: `1px solid ${
          isLapsed
            ? 'rgba(239,68,68,0.4)'
            : urgent
            ? 'rgba(239,68,68,0.3)'
            : 'var(--qs-border)'
        }`,
        borderLeft: `4px solid ${
          isLapsed
            ? '#EF4444'
            : urgent
            ? '#F87171'
            : days <= 7
            ? '#FBBF24'
            : 'var(--qs-border)'
        }`,
        borderRadius: 12,
        padding: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>

        {/* 1 ── Header: name + policy number (status lives in the cards) ─ */}
        <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
          <h3 style={{
            fontSize: 'clamp(1.375rem, 1.15rem + 0.7vw, 1.75rem)',
            fontWeight: 600, color: 'var(--qs-bright)',
            margin: 0, lineHeight: 1.2,
          }}>
            {titleCaseName(event.customer_name)}
          </h3>

          {event.policy_no && (
            <span style={{
              fontSize: 'clamp(1.375rem, 1.15rem + 0.7vw, 1.75rem)',
              fontWeight: 500, color: 'var(--qs-dim)', lineHeight: 1.2,
            }}>
              {event.policy_no}
            </span>
          )}

          {policyCount > 1 && (
            <span style={{ ...chip, background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>
              ⚠ {policyCount} policies
            </span>
          )}
          {event.has_active_renewal && (
            <span style={{
              ...chip, background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.25)', color: '#60A5FA',
            }}>
              🔄 Also renewing
            </span>
          )}
          {event.cross_sell_opportunity && event.cross_sell_product && (
            <span style={{
              ...chip, background: 'rgba(16,185,129,0.10)',
              border: '1px solid rgba(16,185,129,0.25)', color: '#34D399',
            }}
            title="Quoting this line adds a multi-policy discount that lowers their current premium — a save lever, not just an upsell.">
              💡 Bundle {productLabel(event.cross_sell_product)} → lower premium
            </span>
          )}
          {event.ai_transcript && (
            <button
              className="qs-focusable"
              onClick={() => setExpandedTranscript(prev => prev === event.id ? null : event.id)}
              style={{ ...chip, background: 'rgba(99,102,241,0.15)', color: '#818CF8',
                border: 'none', cursor: 'pointer' }}>
              🤖 AI spoke
            </button>
          )}
        </header>

        {/* 2 ── Key facts: amount due + days, grouped near the name ───── */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {event.amount_due > 0 && (
            <div style={factTile}>
              <div style={factLabel}>Amount due</div>
              <div style={{
                fontSize: factValueSize, fontWeight: 800, color: '#F87171',
                fontFamily: "'DM Mono', monospace", lineHeight: 1.1,
              }}>
                ${Number(event.amount_due).toLocaleString()}
              </div>
            </div>
          )}
          <div style={factTile}>
            <div style={factLabel}>
              {event.product ? `${event.product} ` : ''}
              {isLapsed ? 'coverage' : days < 0 ? 'overdue' : 'cancels in'}
            </div>
            <div style={{
              fontSize: factValueSize, fontWeight: 800,
              color: isLapsed ? '#F87171' : daysColor,
              fontFamily: "'DM Mono', monospace", lineHeight: 1.1,
            }}>
              {isLapsed ? '⚠ LAPSED' : daysLabel}
            </div>
            <div style={{ fontSize: '0.9375rem', color: 'var(--qs-dim)', marginTop: '0.25rem' }}>
              {isLapsed ? 'since ' : ''}{fmtDate(event.cancel_effective_date)}
            </div>
          </div>
        </div>

        {/* 3 ── Meta line: position (phone lives on the Call button) ──── */}
        {position && (
          <div style={{ display: 'flex', justifyContent: 'flex-end',
            fontSize: '0.875rem', color: 'var(--qs-muted)', fontWeight: 500 }}>
            {position}
          </div>
        )}

        {/* 4 ── Call script — 16px, comfortable measure & line-height ── */}
        <div style={{
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.20)',
          borderRadius: 8,
          padding: '1rem',
        }}>
          <div style={{
            fontSize: '0.8125rem', fontWeight: 700, color: 'var(--qs-dim)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem',
          }}>
            {isLapsed ? 'Reinstatement script' : 'Call script'}
          </div>
          <p style={{
            fontSize: 'clamp(1rem, 0.95rem + 0.35vw, 1.1875rem)',
            color: 'var(--qs-text)', lineHeight: 1.65, margin: 0,
          }}>
            {scriptLine}
          </p>
        </div>

        {/* Voicemail script — read if no answer (generic, no balance/coverage). */}
        <VoicemailScriptBox firstName={firstName} agentName={agentName} product={event.product} />

        {/* Status line: promise / last attempt / callback ────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {promisePast && (
              <span style={{ ...chip, fontSize: '0.8125rem', fontWeight: 700, color: '#FCA5A5',
                background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)' }}>
                ⚠ Pay promise overdue · {new Date(event.promise_date).toLocaleDateString()}
              </span>
            )}
            {promiseSoon && (
              <span style={{ ...chip, fontSize: '0.8125rem', fontWeight: 600, color: '#FBBF24',
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                📌 Pay promise {new Date(event.promise_date).toLocaleDateString()}
              </span>
            )}
            {lastAtt && !promisePast && (
              <span style={{ fontSize: '0.9375rem', color: 'var(--qs-dim)' }}>
                {event.attempt_count || 0} attempts · {lastAtt}
              </span>
            )}
            {!lastAtt && !promisePast && (
              <span style={{ fontSize: '0.9375rem', color: 'var(--qs-dim)', fontWeight: 600 }}>
                {event.attempt_count || 0} attempts
              </span>
            )}

            {/* Scheduled callback */}
            {event.callback_at && new Date(event.callback_at) > new Date() && (
              <span style={{ ...chip, fontSize: '0.8125rem', fontWeight: 600, color: '#60A5FA',
                background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)' }}>
                📅 Call back {new Date(event.callback_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </span>
            )}
            {event.callback_at && new Date(event.callback_at) <= new Date() && (
              <span style={{ ...chip, fontSize: '0.8125rem', color: '#FBBF24',
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                ⏰ Callback overdue
              </span>
            )}

            {/* Snoozed indicator */}
            {event.snoozed_until && new Date(event.snoozed_until) > new Date() && (
              <span style={{ ...chip, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--qs-dim)',
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
                ⏸ Snoozed until {new Date(event.snoozed_until).toLocaleDateString()}
                {event.snooze_count > 1 ? ` · ${event.snooze_count}×` : ''}
              </span>
            )}
        </div>

        {/* AI Transcript inline expand */}
        {expandedTranscript === event.id && event.ai_transcript && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: 8,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            fontSize: '1rem', color: 'var(--qs-text)', lineHeight: 1.6,
            maxHeight: 200, overflowY: 'auto',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#818CF8',
              textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
              AI Transcript
            </span>
            {event.ai_transcript}
          </div>
        )}

        {/* 5 ── Actions: prominent Call, then disposition row ─────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {phone && (
            <a href={`tel:${phone}`}
              className="qs-focusable"
              style={{
                ...btnBase, minHeight: '3rem', width: '100%',
                fontSize: 'clamp(1rem, 0.95rem + 0.3vw, 1.125rem)',
                background: 'rgba(52,211,153,0.14)', color: '#34D399',
                border: '1px solid rgba(52,211,153,0.3)', textDecoration: 'none',
              }}>
              📞 Call {fmtPhone(phone)}
            </a>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Log Call / Callback / Saved / Lost / Wants to Cancel moved into
                the case work surface (Open) — the outcome is captured there. */}

            {/* Snooze — only after 2+ attempts, and only while the deadline is
                far enough out (≥14-day buffer). */}
            {event.attempt_count >= 2 && (() => {
              const snoozeOpts = eligibleSnoozeOptions(event.cancel_effective_date);
              if (snoozeOpts.length === 0) {
                return (
                  <span
                    title="Within 14 days of the cancel date — this has to be worked, not snoozed."
                    style={{
                      ...btnBase, width: 'auto', cursor: 'default',
                      color: 'var(--qs-muted)', border: '1px solid var(--qs-border)',
                      background: 'var(--qs-elevated)', display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    🔒 Too close to snooze
                  </span>
                );
              }
              return (
                <select
                  className="dark-select qs-focusable"
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    const [days, reason] = e.target.value.split('|');
                    handleSnooze('cancel', event, parseInt(days), reason);
                    e.target.value = '';
                  }}
                  style={{
                    ...btnBase, width: 'auto',
                    color: 'var(--qs-dim)',
                    border: '1px solid var(--qs-border)',
                    background: 'var(--qs-elevated)',
                  }}
                >
                  <option value="">⏸ Snooze</option>
                  {snoozeOpts.map(o => (
                    <option key={o.days} value={`${o.days}|${o.reason}`}>{o.label}</option>
                  ))}
                </select>
              );
            })()}

            <button
              className="qs-focusable"
              onClick={() => setSelectedEvent(event)}
              style={{
                ...btnBase,
                border: '1px solid #3B82F6', background: '#3B82F6',
                color: '#fff', fontWeight: 700,
                marginLeft: 'auto',
              }}>
              Open case →
            </button>
          </div>

          {/* Keyboard call-through hint */}
          <div style={{ fontSize: '0.8125rem', color: 'var(--qs-muted)', marginTop: '0.125rem' }}>
            <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>C</kbd> call · or click a lead
          </div>
        </div>
      </article>
    );
  }

  function RenewalCard({ event, policyCount = 1 }) {
    const daysUntil = (() => {
      const d = new Date(event.renewal_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((d - today) / 86400000);
    })();
    const urgent    = daysUntil <= 14;
    const changePct = parseFloat(event.premium_change_pct) || 0;
    const rateShock = event.rate_shock_flag || changePct >= 15;
    const phone     = event.phone || event.customer_phone;
    const lastAtt   = lastAttemptSummary(event.last_attempt_result, event.last_attempt_at);

    return (
      <div style={{
        background:   'var(--qs-card)',
        border:       `1px solid ${urgent ? 'rgba(245,158,11,0.3)' : 'var(--qs-border)'}`,
        borderLeft:   `3px solid ${urgent ? '#FBBF24' : 'var(--qs-border)'}`,
        borderRadius: 10,
        padding:      '18px 20px',
      }}>

        {/* Row 1: Name / badges / days */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--qs-bright)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {titleCaseName(event.customer_name)}
              </span>

              {rateShock && (
                <span style={{ fontSize: 13, background: 'rgba(239,68,68,0.15)', color: '#F87171',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>
                  ⚠ Rate Shock
                </span>
              )}

              {event.multi_line === 'Yes' && (
                <span style={{ fontSize: 13, background: 'rgba(59,130,246,0.12)', color: '#60A5FA',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 600, flexShrink: 0 }}>
                  Bundle 🔗
                </span>
              )}

              {event.easy_pay && (
                <span style={{ fontSize: 13, background: 'rgba(52,211,153,0.12)', color: '#34D399',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 600, flexShrink: 0 }}>
                  AutoPay ✓
                </span>
              )}

              {event.claim_flag && event.claim_flag !== 'none' && (
                <span style={{ fontSize: 13, background: 'rgba(245,158,11,0.15)', color: '#FBBF24',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>
                  ⚠ {event.claim_flag === 'open' ? 'Open Claim' : 'Recent Claim'}
                </span>
              )}

              {event.ai_transcript && (
                <button
                  onClick={() => setExpandedTranscript(prev => prev === event.id ? null : event.id)}
                  style={{ fontSize: 13, background: 'rgba(99,102,241,0.15)', color: '#818CF8',
                    border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                    fontWeight: 600, flexShrink: 0 }}>
                  🤖 AI spoke
                </button>
              )}

              {policyCount > 1 && (
                <span style={{
                  fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#FBBF24',
                  borderRadius: 4, padding: '1px 6px', fontWeight: 700, flexShrink: 0,
                }}>
                  ⚠ {policyCount} policies
                </span>
              )}

              {event.has_active_cancel && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#F87171', flexShrink: 0,
                }}>
                  ⚠ Cancel active
                </span>
              )}
              {event.cross_sell_opportunity && event.cross_sell_product && !event.has_active_cancel && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: '#34D399', flexShrink: 0,
                }}>
                  💡 X-sell: {productLabel(event.cross_sell_product)}
                </span>
              )}
            </div>

            <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 3 }}>
              {event.policy_no} · {productLabel(event.product)}
            </div>
          </div>

          {/* Days — green ≥21d (ideal proactive-contact window), amber/red as
              renewal nears and the save window closes. */}
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700,
              color: daysUntil <= 7 ? '#F87171'
                : daysUntil <= 14 ? '#FBBF24'
                : daysUntil >= 21 ? '#34D399'
                : 'var(--qs-dim)' }}>
              {daysUntil === 0 ? 'Today' : daysUntil < 0 ? 'Overdue' : `${daysUntil}d`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>renewal</div>
            {(() => {
              // Why this card ranks where it does in focus mode.
              const saveable = expectedSaveablePremium(event, churnModel, effectiveSaveLift);
              return saveable > 0 ? (
                <div style={{ fontSize: 10, color: 'var(--qs-muted)', marginTop: 2 }}
                  title="Expected saveable premium = premium × churn risk × save rate. Drives focus-mode order.">
                  ~{fmt$(saveable)} saveable
                </div>
              ) : null;
            })()}
          </div>
        </div>

        {/* Talking point script — primary call purpose */}
        <CallScriptBox label="Call script">
          {renewalCallScript({
            firstName: event.customer_name?.split(' ')[0] || 'there',
            agentName: agentNameFor(employee),
            product: event.product, renewalDate: event.renewal_date,
            rateShock, changePct,
          })}
        </CallScriptBox>

        {/* Voicemail script — read if no answer. Deliberately generic (no
            premium/coverage), since a voicemail can be overheard. */}
        <VoicemailScriptBox firstName={event.customer_name?.split(' ')[0] || 'there'} agentName={agentNameFor(employee)} product={event.product} />

        {/* Row 2: Premium + change + attempts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {event.premium != null && (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)' }}>
              {fmt$(event.premium)}
            </span>
          )}
          {changePct !== 0 && (
            <span style={{ fontSize: 14, fontWeight: 700, color: changePct > 0 ? '#F87171' : '#34D399' }}>
              {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
            </span>
          )}
          {event.premium_change != null && event.premium_change !== 0 && (
            <span style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
              {/* Auto renews on a 6-month term, not annually — label the delta by term. */}
              ({changePct > 0 ? '+' : ''}{fmt$(event.premium_change)}/{/auto/i.test(event.product || '') ? '6 mo' : 'yr'})
            </span>
          )}
          {lastAtt ? (
            <span style={{ fontSize: 13, color: 'var(--qs-subtle)', marginLeft: 'auto' }}>
              {event.attempt_count || 0} attempts · {lastAtt}
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--qs-dim)', marginLeft: 'auto' }}>
              {event.attempt_count || 0} attempts
            </span>
          )}

          {/* Scheduled callback */}
          {event.callback_at && new Date(event.callback_at) > new Date() && (
            <span style={{
              fontSize: 11, color: '#3B82F6', fontWeight: 600,
              background: 'rgba(59,130,246,0.10)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 4, padding: '1px 7px', flexShrink: 0,
            }}>
              📅 Call back {new Date(event.callback_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          )}
          {event.callback_at && new Date(event.callback_at) <= new Date() && (
            <span style={{
              fontSize: 11, color: '#F59E0B', fontWeight: 700,
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 4, padding: '1px 7px', flexShrink: 0,
            }}>
              ⏰ Callback overdue
            </span>
          )}

          {/* Snoozed indicator */}
          {event.snoozed_until && new Date(event.snoozed_until) > new Date() && (
            <span style={{
              fontSize: 11, color: 'var(--qs-muted)', fontWeight: 600,
              background: 'var(--qs-elevated)',
              border: '1px solid var(--qs-border)',
              borderRadius: 4, padding: '1px 7px', flexShrink: 0,
            }}>
              ⏸ Snoozed until {new Date(event.snoozed_until).toLocaleDateString()}
              {event.snooze_count > 1 ? ` · ${event.snooze_count}×` : ''}
            </span>
          )}
        </div>

        {/* AI Transcript inline expand */}
        {expandedTranscript === event.id && event.ai_transcript && (
          <div style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 6,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            fontSize: 14, color: 'var(--qs-dim)', lineHeight: 1.5,
            maxHeight: 160, overflowY: 'auto',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#818CF8',
              textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
              AI Transcript
            </span>
            {event.ai_transcript}
          </div>
        )}

        {/* Row 3: Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {phone && (
            <a href={`tel:${phone}`}
              style={{
                fontSize: 13, padding: '7px 12px', borderRadius: 7,
                background: 'rgba(52,211,153,0.12)', color: '#34D399',
                border: '1px solid rgba(52,211,153,0.25)', textDecoration: 'none',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              }}>
              📞 {fmtPhone(phone)}
            </a>
          )}

          {/* Log Call / Callback / Confirmed / Won't Renew all live in the case
              work surface (Open) now — where outcome + saved-premium are captured. */}

          {/* Snooze — only after 2+ attempts, and only while the renewal date is
              far enough out (≥14-day buffer). */}
          {event.attempt_count >= 2 && (() => {
            const snoozeOpts = eligibleSnoozeOptions(event.renewal_date);
            if (snoozeOpts.length === 0) {
              return (
                <span
                  title="Within 14 days of the renewal date — this has to be worked, not snoozed."
                  style={{
                    fontSize: 12, padding: '5px 10px', borderRadius: 7,
                    color: 'var(--qs-muted)', border: '1px solid var(--qs-border)',
                    background: 'var(--qs-elevated)', display: 'inline-flex', alignItems: 'center',
                  }}
                >
                  🔒 Too close to snooze
                </span>
              );
            }
            return (
              <select
                className="dark-select"
                defaultValue=""
                onChange={e => {
                  if (!e.target.value) return;
                  const [days, reason] = e.target.value.split('|');
                  handleSnooze('renewal', event, parseInt(days), reason);
                  e.target.value = '';
                }}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 7,
                  cursor: 'pointer', color: 'var(--qs-muted)',
                  border: '1px solid var(--qs-border)',
                  background: 'var(--qs-elevated)',
                }}
              >
                <option value="">⏸ Snooze</option>
                {snoozeOpts.map(o => (
                  <option key={o.days} value={`${o.days}|${o.reason}`}>{o.label}</option>
                ))}
              </select>
            );
          })()}

          <button
            onClick={() => setSelectedRenewal(event)}
            style={{
              fontSize: 13, padding: '7px 14px', borderRadius: 7,
              border: '1px solid #3B82F6', background: '#3B82F6',
              color: '#fff', cursor: 'pointer', fontWeight: 700,
              marginLeft: 'auto',
            }}>
            Open case →
          </button>
        </div>
      </div>
    );
  }

  // Sales-only employees have no retention queue — send them to their
  // scorecard (the sales home) instead of showing an empty queue.
  const isServiceRole = roles.includes('service_inbound')
    || roles.includes('service_outbound');
  if (employee && !isServiceRole) {
    return <Navigate to="/my/scorecard" replace />;
  }

  return (
    <div>

      {/* ── Header: title + stale indicator ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
            My Queue
          </div>
          <div style={{ fontSize: 15, color: 'var(--qs-subtle)' }}>
            {cancelCases.length} pending cancel &middot; {renewalCases.length} renewals
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--qs-dim)' }}>
            Updated {relativeTime(new Date(lastRefreshed).toISOString())}
          </span>
          <button
            onClick={refreshQueue}
            disabled={refreshing}
            style={{ fontSize: 13, padding: '6px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
              color: 'var(--qs-subtle)', cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.7 : 1 }}>
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ── Today's Focus — KPI cards scoped to the active tab ───────── */}
      <div style={{
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16,
      }}>
        {(activeTab === 'cancel' ? [
          {
            label: 'Critical',
            value: focusStats.criticalCount,
            color: focusStats.criticalCount > 0 ? '#F87171' : '#34D399',
            sub:   '≤ 3 days',
            filter: 'critical', isOn: cancelFilter === 'critical',
            apply: () => setCancelFilter(f => f === 'critical' ? 'all' : 'critical'),
          },
          {
            label: 'At Risk',
            value: fmt$(focusStats.totalPremiumAtRisk),
            color: 'var(--qs-bright)',
            sub:   'premium',
          },
          {
            label: 'Contacts',
            value: focusStats.attemptedToday,
            color: focusStats.attemptedToday > 0 ? '#34D399' : 'var(--qs-dim)',
            sub:   'logged today',
          },
          {
            label: 'Untouched',
            value: focusStats.untouched,
            color: focusStats.untouched > 5 ? '#FBBF24' : 'var(--qs-dim)',
            sub:   'never called',
            filter: 'never_called', isOn: cancelFilter === 'never_called',
            apply: () => setCancelFilter(f => f === 'never_called' ? 'all' : 'never_called'),
          },
        ] : [
          {
            label: closingMode === 'proactive' ? 'Proactive Window' : 'Closing Window',
            value: renewalStats.closingCount,
            color: renewalStats.closingCount > 0 ? '#FBBF24' : '#34D399',
            sub:   closingMode === 'proactive'
              ? '≥ 21 days out · dbl-click for ≤14'
              : '≤ 14 days · dbl-click for ≥21',
            filter: 'closing', isOn: renewalFilter === 'closing',
            apply: () => setRenewalFilter(f => f === 'closing' ? 'all' : 'closing'),
            // Double-click flips the window definition and shows it immediately.
            applyDouble: () => { setClosingMode(m => m === 'proactive' ? 'soon' : 'proactive'); setRenewalFilter('closing'); },
          },
          {
            label: 'Rate Shocks',
            value: renewalStats.rateShockCount,
            color: renewalStats.rateShockCount > 0 ? '#F87171' : 'var(--qs-dim)',
            sub:   '+15% or more',
            filter: 'rate_shock', isOn: renewalFilter === 'rate_shock',
            apply: () => setRenewalFilter(f => f === 'rate_shock' ? 'all' : 'rate_shock'),
          },
          {
            label: 'Saveable',
            value: fmt$(renewalStats.totalSaveable),
            color: 'var(--qs-bright)',
            sub:   'expected premium',
          },
          {
            label: 'Untouched',
            value: renewalStats.untouched,
            color: renewalStats.untouched > 5 ? '#FBBF24' : 'var(--qs-dim)',
            sub:   'never called',
            filter: 'untouched', isOn: renewalFilter === 'untouched',
            apply: () => setRenewalFilter(f => f === 'untouched' ? 'all' : 'untouched'),
          },
          {
            label: '📅 Callbacks',
            value: renewalCases.filter(r => r.callback_at).length,
            color: renewalCases.some(r => r.callback_at) ? '#60A5FA' : 'var(--qs-dim)',
            sub:   'scheduled',
            filter: 'callbacks', isOn: renewalFilter === 'callbacks',
            apply: () => setRenewalFilter(f => f === 'callbacks' ? 'all' : 'callbacks'),
          },
        ]).map(stat => {
          const clickable = !!stat.apply;
          const Tag = clickable ? 'button' : 'div';
          // Cards with applyDouble debounce the single click so a double-click
          // can fire the window toggle instead.
          const onClick = !clickable ? undefined : (stat.applyDouble ? () => {
            if (clickTimerRef.current) return;
            clickTimerRef.current = setTimeout(() => { clickTimerRef.current = null; stat.apply(); }, 220);
          } : stat.apply);
          const onDoubleClick = stat.applyDouble ? () => {
            clearTimeout(clickTimerRef.current); clickTimerRef.current = null;
            stat.applyDouble();
          } : undefined;
          return (
            <Tag
              key={stat.label}
              type={clickable ? 'button' : undefined}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              className={clickable ? 'qs-focusable' : undefined}
              title={clickable ? (stat.applyDouble ? 'Click to filter · double-click to switch window' : (stat.isOn ? 'Clear filter' : `Filter the list to ${stat.label.toLowerCase()}`)) : undefined}
              style={{
                textAlign: 'center', background: stat.isOn ? 'rgba(59,130,246,0.10)' : 'transparent',
                border: '1px solid', borderColor: stat.isOn ? 'rgba(59,130,246,0.45)' : 'transparent',
                borderRadius: 10, padding: '6px 4px',
                cursor: clickable ? 'pointer' : 'default',
              }}>
              <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 6,
                textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                {stat.label}{stat.isOn ? ' ✕' : ''}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{stat.sub}</div>
            </Tag>
          );
        })}
      </div>

      {/* ── Tab Toggle ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[
          { key: 'cancel',  label: `⚠ Pending Cancel (${cancelCases.length})`  },
          { key: 'renewal', label: `🔄 Renewals (${renewalCases.length})`       },
        ].map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 600,
              background: activeTab === t.key ? 'var(--qs-info)' : 'var(--qs-elevated)',
              color:      activeTab === t.key ? '#FFFFFF'        : 'var(--qs-subtle)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Daily progress + focus toggle (cancel tab only — renewals don't share the call target yet) */}
      {/* Progress + focus toggle — both queues. callsToday and the toggle
          label are already tab-aware; gating this to the cancel tab left
          renewals with no daily progress and no focus control. */}
      {((activeTab === 'cancel' && !cancelLoading && cancelCases.length > 0)
        || (activeTab === 'renewal' && !renewalLoading && renewalCases.length > 0)) && (
        <div style={{
          background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', marginBottom: 6,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-dim)' }}>
                Today's calls
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                fontFamily: "'DM Mono', monospace",
                color: targetHit ? '#10B981' : 'var(--qs-bright)',
              }}>
                {callsToday}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--qs-muted)', marginLeft: 2 }}>
                  / {dailyTarget}
                </span>
              </div>
            </div>
            <div style={{
              height: 6, borderRadius: 3,
              background: 'var(--qs-card)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                borderRadius: 3,
                background: targetHit ? '#10B981'
                  : progressPct >= 50 ? '#3B82F6'
                  : '#F59E0B',
                transition: 'width 0.4s ease',
              }} />
            </div>
            {targetHit && (
              <div style={{ fontSize: 11, color: '#10B981', marginTop: 4, fontWeight: 600 }}>
                ✓ Daily target reached
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 40, background: 'var(--qs-border)', flexShrink: 0 }} />

          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginBottom: 6 }}>
              {(() => {
                const tabTotal = activeTab === 'renewal' ? filteredRenewalCases.length : filteredCancelCases.length;
                return focusMode
                  ? `Focus: top ${Math.min(dailyTarget, tabTotal)} ${activeTab === 'renewal' ? 'renewals' : 'cases'}`
                  : `Full queue: ${tabTotal} ${activeTab === 'renewal' ? 'renewals' : 'cases'}`;
              })()}
            </div>
            <button
              onClick={toggleFocusMode}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                borderColor: focusMode ? '#3B82F6' : 'var(--qs-border)',
                background: focusMode ? 'rgba(59,130,246,0.12)' : 'var(--qs-card)',
                color: focusMode ? '#3B82F6' : 'var(--qs-subtle)',
                transition: 'all 0.15s',
              }}
            >
              {focusMode ? '⚡ Focus mode' : '☰ Full queue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Pending Cancel Tab — master-detail dialer ────────────────── */}
      {activeTab === 'cancel' && (
        <div>
          {cancelLoading && (
            <div style={{ color: 'var(--qs-subtle)', fontSize: 15 }}>Loading...</div>
          )}

          {/* Empty state */}
          {!cancelLoading && cancelCases.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 16px' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
                Cancel queue is clear
              </div>
              <div style={{ fontSize: 15, color: 'var(--qs-subtle)', maxWidth: 360, margin: '0 auto' }}>
                No active pending cancel cases assigned to you. Check back tomorrow or contact your
                principal if new cases need assignment.
              </div>
            </div>
          )}

          {!cancelLoading && cancelCases.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">

              {/* ── Master: dense lead list ───────────────────────────── */}
              <aside
                className="lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto"
                style={{
                  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderRadius: 12, padding: 10,
                }}>
                {/* Filter bar */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    { key: 'all',          label: `All (${cancelCases.length})` },
                    { key: 'lapsed',       label: `Lapsed (${cancelCases.filter(e => e.stage === 'cancelled').length})` },
                    { key: 'pending',      label: `Pending (${cancelCases.filter(e => e.stage === 'pending_cancel').length})` },
                    { key: 'never_called', label: `Untouched (${cancelCases.filter(e => !e.attempt_count).length})` },
                    { key: 'multi_policy', label: `Multi (${cancelCases.filter(e => (customerPolicyCounts[e.customer_name] || 1) > 1).length})` },
                    { key: 'callbacks',    label: `📅 Callbacks (${cancelCases.filter(e => e.callback_at).length})` },
                    { key: 'promises',     label: `⚠ Promises (${cancelCases.filter(e => e.promise_date && new Date(e.promise_date) < new Date()).length})` },
                    { key: 'snoozed',      label: `Snoozed${cancelFilter === 'snoozed' ? ` (${snoozedCancelCases.length})` : ''}` },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setCancelFilter(f.key)}
                      className="qs-focusable"
                      style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 20,
                        border: '1px solid',
                        borderColor: cancelFilter === f.key ? '#3B82F6' : 'var(--qs-border)',
                        background: cancelFilter === f.key ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
                        color: cancelFilter === f.key ? '#3B82F6' : 'var(--qs-dim)',
                        cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Grouped rows */}
                {BUCKETS.map(bucket => (
                  <div key={bucket.key} style={{ marginBottom: 10 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 2px 4px',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: bucket.color,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {bucket.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--qs-dim)',
                        background: 'var(--qs-elevated)', padding: '1px 7px',
                        borderRadius: 10, fontWeight: 600 }}>
                        {bucket.cases.length}
                      </span>
                    </div>
                    {bucket.cases.map(event => (
                      <CancelRow
                        key={event.id}
                        event={event}
                        policyCount={customerPolicyCounts[event.customer_name] || 1}
                        active={selectedCancel?.id === event.id}
                        onSelect={() => setSelectedCancelId(event.id)}
                      />
                    ))}
                  </div>
                ))}

                {flatCancelCases.length === 0 && (
                  <div style={{ padding: '24px 12px', textAlign: 'center',
                    fontSize: 14, color: 'var(--qs-subtle)' }}>
                    No leads match this filter.
                  </div>
                )}

                {/* "X more cases" banner — focus mode only */}
                {focusMode && filteredCancelCases.length > dailyTarget && (
                  <div style={{
                    textAlign: 'center', padding: '12px 8px',
                    fontSize: 13, color: 'var(--qs-muted)',
                    borderTop: '1px solid var(--qs-border)', marginTop: 4,
                  }}>
                    {filteredCancelCases.length - dailyTarget} more in full queue
                    {' · '}
                    <button
                      onClick={toggleFocusMode}
                      className="qs-focusable"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#3B82F6', fontSize: 13, fontWeight: 600, padding: 0,
                      }}
                    >
                      View all
                    </button>
                  </div>
                )}
              </aside>

              {/* ── Detail: active call ───────────────────────────────── */}
              <section style={{ minWidth: 0 }}>
                {selectedCancel ? (
                  <CancelDetail
                    key={selectedCancel.id}
                    event={selectedCancel}
                    policyCount={customerPolicyCounts[selectedCancel.customer_name] || 1}
                    position={`${selectedCancelIdx + 1} of ${flatCancelCases.length}`}
                  />
                ) : (
                  <div style={{
                    background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                    borderRadius: 12, padding: '64px 24px', textAlign: 'center',
                    color: 'var(--qs-subtle)', fontSize: 15,
                  }}>
                    Select a lead from the list to start the call.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* ── Renewals Tab ─────────────────────────────────────────────── */}
      {activeTab === 'renewal' && (
        <ReadingColumn size="full">
          {renewalLoading && (
            <div style={{ color: 'var(--qs-subtle)', fontSize: 15 }}>Loading...</div>
          )}

          {/* Empty state */}
          {!renewalLoading && renewalCases.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 16px' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
                No renewals assigned
              </div>
              <div style={{ fontSize: 15, color: 'var(--qs-subtle)', maxWidth: 360, margin: '0 auto' }}>
                Upload a renewal report in the Retention Hub and assign cases to see them here.
              </div>
            </div>
          )}

          {/* Master-detail dialer — same layout as the cancel tab */}
          {!renewalLoading && renewalCases.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">

              {/* ── Master: dense renewal list ─────────────────────────── */}
              <aside
                className="lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto"
                style={{
                  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderRadius: 12, padding: 10,
                }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 2px 6px',
                }}>
                  {focusMode ? 'Focus — highest saveable first' : 'Full queue — soonest first'}
                </div>
                {groupedRenewals.map(g => g.cases.length === 1 ? (
                  <RenewalRow
                    key={g.cases[0].id}
                    event={g.cases[0]}
                    active={selectedRenewalCase?.id === g.cases[0].id}
                    onSelect={() => setSelectedRenewalCaseId(g.cases[0].id)}
                  />
                ) : (
                  <HouseholdRenewalGroup
                    key={g.key}
                    cases={g.cases}
                    selectedId={selectedRenewalCase?.id}
                    onSelect={setSelectedRenewalCaseId}
                  />
                ))}

                {/* "X more renewals" banner — focus mode only */}
                {focusMode && filteredRenewalCases.length > dailyTarget && (
                  <div style={{
                    textAlign: 'center', padding: '12px 8px',
                    fontSize: 13, color: 'var(--qs-muted)',
                    borderTop: '1px solid var(--qs-border)', marginTop: 4,
                  }}>
                    {filteredRenewalCases.length - dailyTarget} more in full queue
                    {' · '}
                    <button
                      onClick={toggleFocusMode}
                      className="qs-focusable"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#3B82F6', fontSize: 13, fontWeight: 600, padding: 0,
                      }}
                    >
                      View all
                    </button>
                  </div>
                )}
              </aside>

              {/* ── Detail: active call ────────────────────────────────── */}
              <section style={{ minWidth: 0 }}>
                {selectedRenewalCase ? (
                  <div key={selectedRenewalCase.id}>
                    <div style={{
                      fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 8,
                      display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span>{selectedRenewalIdx + 1} of {displayRenewalCases.length}</span>
                      <span>↑↓ or j/k to move · C to call</span>
                    </div>
                    <RenewalCard
                      event={selectedRenewalCase}
                      policyCount={customerPolicyCounts[selectedRenewalCase.customer_name] || 1}
                    />
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                    borderRadius: 12, padding: '64px 24px', textAlign: 'center',
                    color: 'var(--qs-subtle)', fontSize: 15,
                  }}>
                    Select a renewal from the list to start the call.
                  </div>
                )}
              </section>
            </div>
          )}
        </ReadingColumn>
      )}

      {/* ── Detail Modals (existing — unchanged) ─────────────────────── */}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateCancelCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={employees}
          canReassign={false}
        />,
        document.body
      )}
      {selectedRenewal && createPortal(
        <RenewalDetailModal
          event={selectedRenewal}
          onClose={() => setSelectedRenewal(null)}
          onUpdate={updateRenewalCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={employees}
          canReassign={false}
        />,
        document.body
      )}


    </div>
  );
}
