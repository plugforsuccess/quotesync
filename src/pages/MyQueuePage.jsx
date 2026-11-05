// Employee's personal retention queue — cases assigned to them.
// Reuses EventDetailModal and RenewalDetailModal from RetentionCancels
// but scoped entirely to the current employee via RLS.

import { T } from '../components/SiteCopy';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees } from '../hooks/useEmployees';
import { calcCancelPriority, calcRenewalPriority, daysUntilCancel, compareByTier } from '../lib/retentionPriority';
import { buildChurnModel, expectedSaveablePremium } from '../lib/retentionElasticity';
import { useBookSnapshots } from '../hooks/useBookMetrics';
import { useInterventionEffectiveness } from '../hooks/useInterventionEffectiveness';
import { EventDetailModal, RenewalDetailModal } from './components/retention/RetentionCancels';
import ReadingColumn from '../components/ReadingColumn';
import { CallScriptBox, VoicemailScriptBox, renewalCallScript, cancelCallScript } from '../components/RetentionScripts';
import { titleCaseName } from '../lib/names';
import { productLabel } from '../lib/productLabels';
import MultiVehicleBadge from '../components/MultiVehicleBadge';
import { useWinbackLapses, winbackFor } from '../hooks/useWinbackLapses';
import { NEUTRAL_CHIP, DANGER_CHIP } from '../lib/statusChips';

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
// A renewing customer worth a bundle pitch: not mid-cancellation and either the
// cross-sell audit flagged a specific gap (and they're not already bundled), or
// the carrier explicitly marks them single-line. The audit gap is the primary,
// actionable signal; the multi_line === 'No' arm catches single-line customers
// the latest audit didn't cover so none are missed. (Every cross-sell target is
// already a monoline customer, so these live in one card, not two.)
function isBundleTarget(r) {
  return !r.has_active_cancel && (
    (r.cross_sell_opportunity && r.cross_sell_product && r.multi_line !== 'Yes') ||
    r.multi_line === 'No'
  );
}

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

// Color discipline for the queue: red (--qs-danger) is reserved for "must act
// today" — lapsed, ≤3 days to cancel, a renewal inside its 14-day save window,
// an overdue pay promise, an overdue callback. Every
// other tier/flag reads as neutral text so the one red thing on screen is the
// thing to act on. Bucket order carries the priority; color doesn't repeat it.
const PRIORITY_BUCKETS = [
  {
    key: 'P0',
    label: 'Lapsed — coverage gone',
    sublabel: 'Policy terminated. Reinstatement call required.',
    color: 'var(--qs-danger)',
  },
  {
    key: 'P1',
    label: 'High priority',
    sublabel: 'Past due or <7 days · Premium ≥$2,000',
    color: 'var(--qs-text)',
  },
  {
    key: 'P2',
    label: 'Standard',
    sublabel: 'Past due or <7 days · Premium <$2,000',
    color: 'var(--qs-dim)',
  },
  {
    key: 'P3',
    label: 'Upcoming',
    sublabel: 'More than 7 days until cancel date',
    color: 'var(--qs-dim)',
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

  // Realtime: when a case assigned to me changes — a new assignment, a
  // principal reassigning it in the agency portal, or a status flip from another
  // tab — refetch the affected list so the queue stays in sync without a manual
  // refresh. Mirrors the auto-reconnecting channel used on /my/today so this
  // queue behaves the same way. (Note: Supabase delivers the "now matches me"
  // event to the new assignee; a reassigned-away case clears on the previous
  // rep's next refetch.)
  useEffect(() => {
    if (!employeeId) return;

    let reconnectTimer = null;
    let isReconnecting = false;
    let currentChannel = null;

    function subscribe() {
      const channel = supabase
        .channel(`my-queue-cases-${employeeId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pending_cases',
          filter: `assigned_to_id=eq.${employeeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['my_cancel_cases', employeeId] });
          queryClient.invalidateQueries({ queryKey: ['my_cancel_cases_snoozed', employeeId] });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'renewal_cases',
          filter: `assigned_to_id=eq.${employeeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['my_renewal_cases', employeeId] });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isReconnecting = false;
          } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && !isReconnecting) {
            isReconnecting = true;
            reconnectTimer = setTimeout(() => {
              supabase.removeChannel(channel);
              currentChannel = null;
              subscribe();
            }, 5000);
          }
        });

      currentChannel = channel;
    }

    subscribe();

    return () => {
      clearTimeout(reconnectTimer);
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
      }
    };
  }, [employeeId, queryClient]);

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
  // Lost-line lookup so the renewal card can flag a win-back (bundle) pitch to
  // make while the rep already has the customer on the renewal call.
  const winbackMap = useWinbackLapses(orgId);
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
    // The 21-day backstop: untouched cases about to cross into the bill window
    // (bill posts at 21 days out). These get called before anything else so no
    // customer hears from the bill before they hear from us.
    const crossingCount = renewalCases.filter(r => {
      const d = daysOf(r);
      return !r.attempt_count && !isNaN(d) && d >= 21 && d <= 28;
    }).length;
    return { closingCount, rateShockCount, totalSaveable, untouched, crossingCount };
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
      case 'bundle':
        // Bundle-pitch list: audit-flagged cross-sell gaps + carrier-flagged
        // single-line customers, in one place (see isBundleTarget).
        return renewalCases.filter(isBundleTarget);
      case 'crossing':
        // The 21-day backstop list: untouched, about to cross into the bill
        // window. Closest deadline first — these are today's must-calls.
        return renewalCases
          .filter(r => { const d = daysOf(r); return !r.attempt_count && !isNaN(d) && d >= 21 && d <= 28; })
          .sort((a, b) => daysOf(a) - daysOf(b));
      case 'callbacks':
        return renewalCases
          .filter(r => r.callback_at)
          .sort((a, b) => new Date(a.callback_at) - new Date(b.callback_at));
      default:
        return renewalCases;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewalCases, renewalFilter, closingMode]);

  // Renewal focus — same daily-target cap as the cancel queue. Ordered by the
  // shared churn-priority scorer (calcRenewalPriority), so it matches the agency
  // At-Risk tab exactly: the billing timeline, rate shock, tenure/observed churn,
  // portfolio value, an easy-pay penalty and bundling all factor in — instead of
  // raw saveable dollars, which was surfacing big-but-sticky bundled autopay
  // accounts. Using the same scorer here also lets the principal view reproduce
  // each rep's queue position faithfully. Touched-today float up so cards don't
  // jump after a call. The full-queue view keeps its soonest-first order.
  const focusRenewalCases = useMemo(() => {
    const byPriority = (a, b) =>
      calcRenewalPriority(b, { churnModel }) - calcRenewalPriority(a, { churnModel });
    const daysOf = (r) => {
      const d = new Date(r.renewal_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((d - today) / 86400000);
    };
    // 21-day backstop: never-attempted cases about to cross into the bill
    // window are pinned above the churn ranking (closest deadline first), so
    // coverage is guaranteed and can't be starved by higher-scoring cases.
    const isCrossing = (r) => {
      const d = daysOf(r);
      return !r.attempt_count && !isNaN(d) && d >= 21 && d <= 28;
    };
    const touched = filteredRenewalCases.filter(c => c.last_attempt_at?.slice(0, 10) === todayStr);
    const rest = filteredRenewalCases.filter(c => c.last_attempt_at?.slice(0, 10) !== todayStr);
    const crossing = rest.filter(isCrossing).sort((a, b) => daysOf(a) - daysOf(b));
    const scored = rest.filter(c => !isCrossing(c)).sort(byPriority);
    return [...touched, ...crossing, ...scored].slice(0, dailyTarget);
  }, [filteredRenewalCases, dailyTarget, todayStr, churnModel]);
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
    callbacks: { label: '📅 Callbacks · soonest first',    color: 'var(--qs-text)' },
    promises:  { label: '⚠ Pay promises · most overdue first', color: 'var(--qs-danger)' },
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
    // Red only when coverage is at risk today; otherwise the day count is just
    // a number the rep reads, not a color they react to.
    const statusColor = (isLapsed || urgent) ? 'var(--qs-danger)' : 'var(--qs-text)';
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
          background: active ? 'var(--qs-info-subtle)' : undefined,
          border: '1px solid',
          borderColor: active ? 'var(--qs-info-border)' : 'transparent',
          borderLeft: `3px solid ${active ? 'var(--qs-info)' : (isLapsed || urgent) ? 'var(--qs-danger)' : 'transparent'}`,
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
    const statusColor = d <= 14 ? 'var(--qs-danger)' : 'var(--qs-text)';
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
          background: active ? 'var(--qs-info-subtle)' : undefined,
          border: '1px solid',
          borderColor: active ? 'var(--qs-info-border)' : 'transparent',
          borderLeft: `3px solid ${active ? 'var(--qs-info)' : d <= 14 ? 'var(--qs-danger)' : 'transparent'}`,
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
            {cases.length} <T k="pages.myqueuepage.8e202e">policies · 1 call</T>
          </span>
        </div>
        {cases.map(ev => {
          const date = new Date(ev.renewal_date);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const d = Math.ceil((date - today) / 86400000);
          const statusText = isNaN(d) ? '—' : d === 0 ? 'Today' : d < 0 ? 'Overdue' : `${d}d`;
          const statusColor = d <= 14 ? 'var(--qs-danger)' : 'var(--qs-text)';
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
                background: active ? 'var(--qs-info-subtle)' : 'transparent',
                borderLeft: `3px solid ${active ? 'var(--qs-info)' : d <= 14 ? 'var(--qs-danger)' : 'transparent'}`,
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

    // The "days until cancel" key fact goes red only when it's the thing to act
    // on today (lapsed / ≤3 days); otherwise it reads as a plain headline number.
    const daysColor = (isLapsed || urgent) ? 'var(--qs-danger)' : 'var(--qs-bright)';
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
        border: '1px solid var(--qs-border)',
        borderLeft: `4px solid ${(isLapsed || urgent) ? 'var(--qs-danger)' : 'var(--qs-border)'}`,
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
            <span style={{ ...chip, ...NEUTRAL_CHIP }}>
              {policyCount} <T k="pages.myqueuepage.94422f">policies</T>
            </span>
          )}
          {event.has_active_renewal && (
            <span style={{ ...chip, ...NEUTRAL_CHIP }}>
              <T k="pages.myqueuepage.9ac08a">🔄 Also renewing</T>
            </span>
          )}
          {event.cross_sell_opportunity && event.cross_sell_product && (
            <span style={{ ...chip, ...NEUTRAL_CHIP }}
            title="Quoting this line adds a multi-policy discount that lowers their current premium — a save lever, not just an upsell.">
              <T k="pages.myqueuepage.ac0892">💡 Bundle</T> {productLabel(event.cross_sell_product)} <T k="pages.myqueuepage.2961fa">→ lower premium</T>
            </span>
          )}
          {event.ai_transcript && (
            <button
              className="qs-focusable"
              onClick={() => setExpandedTranscript(prev => prev === event.id ? null : event.id)}
              style={{ ...chip, ...NEUTRAL_CHIP, cursor: 'pointer' }}>
              <T k="pages.myqueuepage.45882e">🤖 AI spoke</T>
            </button>
          )}
        </header>

        {/* 2 ── Key facts: amount due + days, grouped near the name ───── */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {event.amount_due > 0 && (
            <div style={factTile}>
              <div style={factLabel}><T k="pages.myqueuepage.ab9d12">Amount due</T></div>
              <div style={{
                fontSize: factValueSize, fontWeight: 800, color: 'var(--qs-bright)',
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
              color: daysColor,
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
          background: 'var(--qs-info-subtle)',
          border: '1px solid var(--qs-info-border)',
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
              <span style={{ ...chip, ...DANGER_CHIP, fontSize: '0.8125rem', fontWeight: 700 }}>
                <T k="pages.myqueuepage.4a1490">⚠ Pay promise overdue ·</T> {new Date(event.promise_date).toLocaleDateString()}
              </span>
            )}
            {promiseSoon && (
              <span style={{ ...chip, ...NEUTRAL_CHIP, fontSize: '0.8125rem', fontWeight: 600 }}>
                <T k="pages.myqueuepage.69d16e">📌 Pay promise</T> {new Date(event.promise_date).toLocaleDateString()}
              </span>
            )}
            {lastAtt && !promisePast && (
              <span style={{ fontSize: '0.9375rem', color: 'var(--qs-dim)' }}>
                {event.attempt_count || 0} <T k="pages.myqueuepage.582369">attempts ·</T> {lastAtt}
              </span>
            )}
            {!lastAtt && !promisePast && (
              <span style={{ fontSize: '0.9375rem', color: 'var(--qs-dim)', fontWeight: 600 }}>
                {event.attempt_count || 0} <T k="pages.myqueuepage.79845f">attempts</T>
              </span>
            )}

            {/* Scheduled callback */}
            {event.callback_at && new Date(event.callback_at) > new Date() && (
              <span style={{ ...chip, ...NEUTRAL_CHIP, fontSize: '0.8125rem', fontWeight: 600 }}>
                <T k="pages.myqueuepage.9aef40">📅 Call back</T> {new Date(event.callback_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </span>
            )}
            {event.callback_at && new Date(event.callback_at) <= new Date() && (
              <span style={{ ...chip, ...DANGER_CHIP, fontSize: '0.8125rem', fontWeight: 700 }}>
                <T k="pages.myqueuepage.a465c6">⏰ Callback overdue</T>
              </span>
            )}

            {/* Snoozed indicator */}
            {event.snoozed_until && new Date(event.snoozed_until) > new Date() && (
              <span style={{ ...chip, ...NEUTRAL_CHIP, fontSize: '0.8125rem', fontWeight: 600 }}>
                <T k="pages.myqueuepage.77b44f">⏸ Snoozed until</T> {new Date(event.snoozed_until).toLocaleDateString()}
                {event.snooze_count > 1 ? ` · ${event.snooze_count}×` : ''}
              </span>
            )}
        </div>

        {/* AI Transcript inline expand */}
        {expandedTranscript === event.id && event.ai_transcript && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: 8,
            background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            fontSize: '1rem', color: 'var(--qs-text)', lineHeight: 1.6,
            maxHeight: 200, overflowY: 'auto',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--qs-dim)',
              textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
              <T k="pages.myqueuepage.ef283f">AI Transcript</T>
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
                background: 'var(--qs-info)', color: '#FFFFFF', fontWeight: 700,
                border: '1px solid var(--qs-info)', textDecoration: 'none',
              }}>
              <T k="pages.myqueuepage.72f662">📞 Call</T> {fmtPhone(phone)}
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
                    <T k="pages.myqueuepage.93e90c">🔒 Too close to snooze</T>
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
                border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
                color: 'var(--qs-text)', fontWeight: 600,
                marginLeft: 'auto',
              }}>
              <T k="pages.myqueuepage.33c277">Open case →</T>
            </button>
          </div>

          {/* Keyboard call-through hint */}
          <div style={{ fontSize: '0.8125rem', color: 'var(--qs-muted)', marginTop: '0.125rem' }}>
            <kbd>↑</kbd> <kbd>↓</kbd> <T k="pages.myqueuepage.19a391">move ·</T> <kbd>C</kbd> <T k="pages.myqueuepage.6530e6">call · or click a lead</T>
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
    // Red once the renewal is inside the 14-day save window — same threshold the list rows use.
    const urgent    = daysUntil <= 14;
    const changePct = parseFloat(event.premium_change_pct) || 0;
    const rateShock = event.rate_shock_flag || changePct >= 15;
    const phone     = event.phone || event.customer_phone;
    const lastAtt   = lastAttemptSummary(event.last_attempt_result, event.last_attempt_at);
    const winback   = winbackFor(winbackMap, event.customer_name, event.zip, event.product);
    // Small inline flag chips on the renewal card (neutral by default).
    const flag = {
      ...NEUTRAL_CHIP, fontSize: 13, borderRadius: 4, padding: '2px 8px',
      fontWeight: 600, flexShrink: 0,
    };

    return (
      <div style={{
        background:   'var(--qs-card)',
        border:       '1px solid var(--qs-border)',
        borderLeft:   `3px solid ${urgent ? 'var(--qs-danger)' : 'var(--qs-border)'}`,
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

              <MultiVehicleBadge count={event.item_count} product={event.product} />

              {winback && (
                <span
                  title={`Lost their ${productLabel(winback.product)} ${winback.months}mo ago${winback.reason ? ` (${winback.reason})` : ''}. While you have them on the renewal, pitch adding it back — the bundle discount lowers this premium too.`}
                  style={{ ...flag, cursor: 'help' }}>
                  <T k="pages.myqueuepage.0a06b1">♻ Win back</T> {productLabel(winback.product)} <T k="pages.myqueuepage.b606d3">· lost</T> {winback.months}<T k="pages.myqueuepage.27c9d5">mo</T>
                </span>
              )}

              {rateShock && (
                <span style={{ ...flag, color: 'var(--qs-text)', fontWeight: 700 }}>
                  <T k="pages.myqueuepage.9f0d6e">⚠ Rate Shock</T>
                </span>
              )}

              {event.multi_line === 'Yes' && (
                <span style={flag}>
                  <T k="pages.myqueuepage.59ff79">Bundle 🔗</T>
                </span>
              )}

              {event.multi_line === 'No' && (
                <span title={rateShock
                  ? 'Monoline + rate shock — elevated churn risk with no bundle anchor, and a bundle-back opportunity. Boosted in your focus queue.'
                  : 'Monoline (single line) — bundle-pitch target.'}
                  style={{ ...flag, cursor: 'help', fontWeight: rateShock ? 700 : 600 }}>
                  <T k="pages.myqueuepage.8bac95">Monoline</T>{rateShock ? ' ⚡' : ''}
                </span>
              )}

              {event.easy_pay && (
                <span style={flag}>
                  <T k="pages.myqueuepage.8121e6">AutoPay ✓</T>
                </span>
              )}

              {event.claim_flag && event.claim_flag !== 'none' && (
                <span style={{ ...flag, fontWeight: 700 }}>
                  ⚠ {event.claim_flag === 'open' ? 'Open Claim' : 'Recent Claim'}
                </span>
              )}

              {event.ai_transcript && (
                <button
                  onClick={() => setExpandedTranscript(prev => prev === event.id ? null : event.id)}
                  style={{ ...flag, cursor: 'pointer' }}>
                  <T k="pages.myqueuepage.45882e">🤖 AI spoke</T>
                </button>
              )}

              {policyCount > 1 && (
                <span style={flag}>
                  {policyCount} <T k="pages.myqueuepage.94422f">policies</T>
                </span>
              )}

              {event.has_active_cancel && (
                <span style={{ ...flag, ...DANGER_CHIP, fontWeight: 700 }}>
                  <T k="pages.myqueuepage.e287f9">⚠ Cancel active</T>
                </span>
              )}
              {event.cross_sell_opportunity && event.cross_sell_product && !event.has_active_cancel && (
                <span style={flag}>
                  <T k="pages.myqueuepage.0a5e37">💡 X-sell:</T> {productLabel(event.cross_sell_product)}
                </span>
              )}
            </div>

            <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 3 }}>
              {event.policy_no} · {productLabel(event.product)}
            </div>
          </div>

          {/* Days — red once the save window is closing (≤7d); otherwise a
              plain number. */}
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700,
              color: urgent ? 'var(--qs-danger)' : 'var(--qs-bright)' }}>
              {daysUntil === 0 ? 'Today' : daysUntil < 0 ? 'Overdue' : `${daysUntil}d`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}><T k="pages.myqueuepage.4b537a">renewal</T></div>
            {(() => {
              // Why this card ranks where it does in focus mode.
              const saveable = expectedSaveablePremium(event, churnModel, effectiveSaveLift);
              return saveable > 0 ? (
                <div style={{ fontSize: 10, color: 'var(--qs-muted)', marginTop: 2 }}
                  title="Expected saveable premium = premium × churn risk × save rate. Drives focus-mode order.">
                  ~{fmt$(saveable)} <T k="pages.myqueuepage.b4de38">saveable</T>
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
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-text)' }}>
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
              {event.attempt_count || 0} <T k="pages.myqueuepage.582369">attempts ·</T> {lastAtt}
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--qs-dim)', marginLeft: 'auto' }}>
              {event.attempt_count || 0} <T k="pages.myqueuepage.79845f">attempts</T>
            </span>
          )}

          {/* Scheduled callback */}
          {event.callback_at && new Date(event.callback_at) > new Date() && (
            <span style={{
              ...NEUTRAL_CHIP, fontSize: 11, fontWeight: 600,
              borderRadius: 4, padding: '1px 7px', flexShrink: 0,
            }}>
              <T k="pages.myqueuepage.9aef40">📅 Call back</T> {new Date(event.callback_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          )}
          {event.callback_at && new Date(event.callback_at) <= new Date() && (
            <span style={{
              ...DANGER_CHIP, fontSize: 11, fontWeight: 700,
              borderRadius: 4, padding: '1px 7px', flexShrink: 0,
            }}>
              <T k="pages.myqueuepage.a465c6">⏰ Callback overdue</T>
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
              <T k="pages.myqueuepage.77b44f">⏸ Snoozed until</T> {new Date(event.snoozed_until).toLocaleDateString()}
              {event.snooze_count > 1 ? ` · ${event.snooze_count}×` : ''}
            </span>
          )}
        </div>

        {/* AI Transcript inline expand */}
        {expandedTranscript === event.id && event.ai_transcript && (
          <div style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 6,
            background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            fontSize: 14, color: 'var(--qs-dim)', lineHeight: 1.5,
            maxHeight: 160, overflowY: 'auto',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-dim)',
              textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
              <T k="pages.myqueuepage.ef283f">AI Transcript</T>
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
                background: 'var(--qs-info)', color: '#FFFFFF',
                border: '1px solid var(--qs-info)', textDecoration: 'none',
                fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
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
                  <T k="pages.myqueuepage.93e90c">🔒 Too close to snooze</T>
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
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
              color: 'var(--qs-text)', cursor: 'pointer', fontWeight: 600,
              marginLeft: 'auto',
            }}>
            <T k="pages.myqueuepage.33c277">Open case →</T>
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
            <T k="pages.myqueuepage.0edb75">My Queue</T>
          </div>
          <div style={{ fontSize: 15, color: 'var(--qs-subtle)' }}>
            {cancelCases.length} <T k="pages.myqueuepage.1512e0">pending cancel ·</T> {renewalCases.length} <T k="pages.myqueuepage.f9193b">renewals</T>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--qs-dim)' }}>
            <T k="pages.myqueuepage.ff0a3b">Updated</T> {relativeTime(new Date(lastRefreshed).toISOString())}
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
            color: focusStats.criticalCount > 0 ? 'var(--qs-danger)' : 'var(--qs-dim)',
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
            color: focusStats.attemptedToday > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)',
            sub:   'logged today',
          },
          {
            label: 'Untouched',
            value: focusStats.untouched,
            color: focusStats.untouched > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)',
            sub:   'never called',
            filter: 'never_called', isOn: cancelFilter === 'never_called',
            apply: () => setCancelFilter(f => f === 'never_called' ? 'all' : 'never_called'),
          },
        ] : [
          {
            label: closingMode === 'proactive' ? 'Proactive Window' : 'Closing Window',
            value: renewalStats.closingCount,
            color: renewalStats.closingCount > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)',
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
            color: renewalStats.rateShockCount > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)',
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
            color: renewalStats.untouched > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)',
            sub:   'never called',
            filter: 'untouched', isOn: renewalFilter === 'untouched',
            apply: () => setRenewalFilter(f => f === 'untouched' ? 'all' : 'untouched'),
          },
          {
            label: '📅 Callbacks',
            value: renewalCases.filter(r => r.callback_at).length,
            color: renewalCases.some(r => r.callback_at) ? 'var(--qs-bright)' : 'var(--qs-dim)',
            sub:   'scheduled',
            filter: 'callbacks', isOn: renewalFilter === 'callbacks',
            apply: () => setRenewalFilter(f => f === 'callbacks' ? 'all' : 'callbacks'),
          },
          {
            label: '⏳ Crossing 21d',
            value: renewalStats.crossingCount,
            // Today's must-calls (untouched, about to hit the bill) — the one
            // red tile on the renewal side.
            color: renewalStats.crossingCount > 0 ? 'var(--qs-danger)' : 'var(--qs-dim)',
            sub:   'untouched · call before the bill',
            filter: 'crossing', isOn: renewalFilter === 'crossing',
            apply: () => setRenewalFilter(f => f === 'crossing' ? 'all' : 'crossing'),
          },
          {
            label: '💡 Bundle pitch',
            value: renewalCases.filter(isBundleTarget).length,
            color: renewalCases.some(isBundleTarget) ? 'var(--qs-bright)' : 'var(--qs-dim)',
            sub:   'monoline · cross-sell gap',
            filter: 'bundle', isOn: renewalFilter === 'bundle',
            apply: () => setRenewalFilter(f => f === 'bundle' ? 'all' : 'bundle'),
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
                textAlign: 'center', background: stat.isOn ? 'var(--qs-info-subtle)' : 'transparent',
                border: '1px solid', borderColor: stat.isOn ? 'var(--qs-info)' : 'transparent',
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
                <T k="pages.myqueuepage.df98e1">Today's calls</T>
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800,
                fontFamily: "'DM Mono', monospace",
                color: targetHit ? 'var(--qs-success)' : 'var(--qs-bright)',
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
                background: targetHit ? 'var(--qs-success)' : 'var(--qs-info)',
                transition: 'width 0.4s ease',
              }} />
            </div>
            {targetHit && (
              <div style={{ fontSize: 11, color: 'var(--qs-success)', marginTop: 4, fontWeight: 600 }}>
                <T k="pages.myqueuepage.7556d5">✓ Daily target reached</T>
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
                borderColor: focusMode ? 'var(--qs-info)' : 'var(--qs-border)',
                background: focusMode ? 'var(--qs-info-subtle)' : 'var(--qs-card)',
                color: focusMode ? 'var(--qs-info)' : 'var(--qs-subtle)',
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
            <div style={{ color: 'var(--qs-subtle)', fontSize: 15 }}><T k="pages.myqueuepage.8524de">Loading...</T></div>
          )}

          {/* Empty state */}
          {!cancelLoading && cancelCases.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 16px' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
                <T k="pages.myqueuepage.85a989">Cancel queue is clear</T>
              </div>
              <div style={{ fontSize: 15, color: 'var(--qs-subtle)', maxWidth: 360, margin: '0 auto' }}>
                <T k="pages.myqueuepage.54c399">No active pending cancel cases assigned to you. Check back tomorrow or contact your principal if new cases need assignment.</T>
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
                        borderColor: cancelFilter === f.key ? 'var(--qs-info)' : 'var(--qs-border)',
                        background: cancelFilter === f.key ? 'var(--qs-info-subtle)' : 'var(--qs-elevated)',
                        color: cancelFilter === f.key ? 'var(--qs-info)' : 'var(--qs-dim)',
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
                    <T k="pages.myqueuepage.d35a5e">No leads match this filter.</T>
                  </div>
                )}

                {/* "X more cases" banner — focus mode only */}
                {focusMode && filteredCancelCases.length > dailyTarget && (
                  <div style={{
                    textAlign: 'center', padding: '12px 8px',
                    fontSize: 13, color: 'var(--qs-muted)',
                    borderTop: '1px solid var(--qs-border)', marginTop: 4,
                  }}>
                    {filteredCancelCases.length - dailyTarget} <T k="pages.myqueuepage.8539ef">more in full queue</T>
                    {' · '}
                    <button
                      onClick={toggleFocusMode}
                      className="qs-focusable"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--qs-info)', fontSize: 13, fontWeight: 600, padding: 0,
                      }}
                    >
                      <T k="pages.myqueuepage.0b4db2">View all</T>
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
                    <T k="pages.myqueuepage.1be558">Select a lead from the list to start the call.</T>
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
            <div style={{ color: 'var(--qs-subtle)', fontSize: 15 }}><T k="pages.myqueuepage.8524de">Loading...</T></div>
          )}

          {/* Empty state */}
          {!renewalLoading && renewalCases.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 16px' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
                <T k="pages.myqueuepage.100383">No renewals assigned</T>
              </div>
              <div style={{ fontSize: 15, color: 'var(--qs-subtle)', maxWidth: 360, margin: '0 auto' }}>
                <T k="pages.myqueuepage.cd2bb0">Upload a renewal report in the Retention Hub and assign cases to see them here.</T>
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
                    {filteredRenewalCases.length - dailyTarget} <T k="pages.myqueuepage.8539ef">more in full queue</T>
                    {' · '}
                    <button
                      onClick={toggleFocusMode}
                      className="qs-focusable"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--qs-info)', fontSize: 13, fontWeight: 600, padding: 0,
                      }}
                    >
                      <T k="pages.myqueuepage.0b4db2">View all</T>
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
                      <span>{selectedRenewalIdx + 1} <T k="pages.myqueuepage.8bf885">of</T> {displayRenewalCases.length}</span>
                      <span><T k="pages.myqueuepage.f452e2">↑↓ or j/k to move · C to call</T></span>
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
                    <T k="pages.myqueuepage.de6a0e">Select a renewal from the list to start the call.</T>
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
          key={selectedEvent.id}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateCancelCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={employees}
          canReassign={false}
          onOpenSibling={(row, kind) => kind === 'cancel'
            ? (setSelectedRenewal(null), setSelectedEvent(row))
            : (setSelectedEvent(null), setSelectedRenewal(row))}
        />,
        document.body
      )}
      {selectedRenewal && createPortal(
        <RenewalDetailModal
          key={selectedRenewal.id}
          event={selectedRenewal}
          onClose={() => setSelectedRenewal(null)}
          onUpdate={updateRenewalCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={employees}
          canReassign={false}
          onOpenSibling={(row, kind) => kind === 'cancel'
            ? (setSelectedRenewal(null), setSelectedEvent(row))
            : (setSelectedEvent(null), setSelectedRenewal(row))}
        />,
        document.body
      )}


    </div>
  );
}
