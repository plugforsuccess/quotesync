// Employee's personal retention queue — cases assigned to them.
// Reuses EventDetailModal and RenewalDetailModal from RetentionCancels
// but scoped entirely to the current employee via RLS.

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees } from '../hooks/useEmployees';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { calcCancelPriority, daysUntilCancel, compareByTier } from '../lib/retentionPriority';
import { EventDetailModal, RenewalDetailModal } from './components/retention/RetentionCancels';
import AvailabilityToggle from '../components/AvailabilityToggle';

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

// Attempt result labels
const RESULT_LABELS = {
  no_answer:      'No Answer',
  left_voicemail: 'Left Voicemail',
  reached:        'Reached',
  wrong_number:   'Wrong Number',
  busy:           'Busy',
  disconnected:   'Disconnected',
};

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

  // Inline log-call popover
  const [logCallTarget, setLogCallTarget] = useState(null); // { type: 'cancel'|'renewal', event }
  const [logCallForm,   setLogCallForm]   = useState({ result: 'no_answer', note: '' });
  const [logCallSaving, setLogCallSaving] = useState(false);

  // Transcript expand
  const [expandedTranscript, setExpandedTranscript] = useState(null); // event.id

  // Stale refresh tracking
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());

  // Cancel filter bar — client-side filter of cancelCases
  // values: 'all' | 'lapsed' | 'pending' | 'never_called' | 'multi_policy' | 'snoozed'
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

  // Callback scheduling popover
  const [callbackTarget, setCallbackTarget] = useState(null); // { type, event }
  const [callbackForm,   setCallbackForm]   = useState({ time: '', note: '' });
  const [callbackSaving, setCallbackSaving] = useState(false);

  // Loss reason popover
  const [lostTarget, setLostTarget] = useState(null); // { type, event }
  const [lostReason, setLostReason] = useState('');

  const employeeId = employee?.id;
  const orgId      = employee?.org_id;

  // Fetch active employees for the Assigned To dropdown in the detail modals.
  const { data: employees = [] } = useActiveEmployees(orgId);

  // Pull cases assigned to this employee — RLS enforces they only see their own.
  // Snoozed cases (snoozed_until in the future) are hidden from the default view.
  const { data: cancelCases = [], isLoading: cancelLoading } = useQuery({
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

  const { data: renewalCases = [], isLoading: renewalLoading } = useQuery({
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

  // Scorecard metrics
  const roles     = employee?.roles || [];
  const scoreType = roles.includes('service_outbound') ? 'outbound'
    : roles.includes('service_inbound') ? 'inbound' : 'both';
  const { data: metrics } = useRetentionMetrics(employeeId, scoreType);

  // Track stale refresh
  useEffect(() => {
    if (!cancelLoading && !renewalLoading) setLastRefreshed(Date.now());
  }, [cancelLoading, renewalLoading]);

  // Today's Focus stats
  const todayStr = new Date().toISOString().slice(0, 10);
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
  const displayCancelCases = focusMode ? focusCases : filteredCancelCases;

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

  const BUCKETS = PRIORITY_BUCKETS
    .map(b => ({ ...b, cases: cancelBuckets[b.key] || [] }))
    .filter(b => b.cases.length > 0);

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

  async function handleInlineLogCall() {
    if (!logCallTarget || logCallSaving) return;
    setLogCallSaving(true);
    const { type, event } = logCallTarget;

    if (type === 'cancel') {
      await supabase.from('pending_cancel_attempts').insert({
        pending_case_id: event.id,
        agency_id:       orgId,
        employee_id:     employeeId,
        method:          'phone',
        result:          logCallForm.result,
        note:            logCallForm.note || null,
      });
      await supabase.from('pending_cases').update({
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: logCallForm.result,
        ...(event.status === 'pending'           ? { status: 'attempting'    } : {}),
        ...(logCallForm.result === 'left_voicemail' ? { status: 'left_voicemail' } : {}),
        ...(logCallForm.result === 'reached'     ? { contacted_at: new Date().toISOString() } : {}),
      }).eq('id', event.id);
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases', employeeId] });
    } else {
      await supabase.from('renewal_attempts').insert({
        renewal_case_id: event.id,
        agency_id:       orgId,
        employee_id:     employeeId,
        method:          'phone',
        result:          logCallForm.result,
        note:            logCallForm.note || null,
      });
      await supabase.from('renewal_cases').update({
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: logCallForm.result,
        ...(event.status === 'pending'           ? { status: 'attempting'    } : {}),
        ...(logCallForm.result === 'left_voicemail' ? { status: 'left_voicemail' } : {}),
        ...(logCallForm.result === 'reached'     ? { contacted_at: new Date().toISOString() } : {}),
      }).eq('id', event.id);
      queryClient.invalidateQueries({ queryKey: ['my_renewal_cases', employeeId] });
    }

    setLogCallSaving(false);
    setLogCallTarget(null);
    setLogCallForm({ result: 'no_answer', note: '' });
  }

  async function handleInlineResolve(type, event, resolution) {
    if (type === 'cancel') {
      await updateCancelCase(event.id, {
        status:          resolution, // 'saved' or 'lost'
        resolution_date: new Date().toISOString().slice(0, 10),
        closed_by_id:    employeeId,
      });
    } else {
      await updateRenewalCase(event.id, {
        status:          resolution, // 'confirmed' or 'lost'
        resolution_date: new Date().toISOString().slice(0, 10),
        closed_by_id:    employeeId,
      });
    }
  }

  // Schedule a callback — logs an attempt as "reached" + records callback time
  async function handleScheduleCallback() {
    if (!callbackTarget || !callbackForm.time || callbackSaving) return;
    setCallbackSaving(true);
    const { type, event } = callbackTarget;
    const callbackAt = new Date(callbackForm.time).toISOString();

    if (type === 'cancel') {
      await supabase.from('pending_cancel_attempts').insert({
        pending_case_id: event.id,
        agency_id:       orgId,
        employee_id:     employeeId,
        method:          'phone',
        result:          'reached',
        note:            `Callback scheduled: ${callbackForm.note || 'no details'}`,
      });
      await updateCancelCase(event.id, {
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: 'reached',
        contacted_at:        event.contacted_at || new Date().toISOString(),
        callback_at:         callbackAt,
        callback_note:       callbackForm.note || null,
        status: event.status === 'pending' ? 'contacted' : event.status,
      });
    } else {
      await supabase.from('renewal_attempts').insert({
        renewal_case_id: event.id,
        agency_id:       orgId,
        employee_id:     employeeId,
        method:          'phone',
        result:          'reached',
        note:            `Callback scheduled: ${callbackForm.note || 'no details'}`,
      });
      await updateRenewalCase(event.id, {
        attempt_count:       (event.attempt_count || 0) + 1,
        last_attempt_at:     new Date().toISOString(),
        last_attempt_result: 'reached',
        contacted_at:        event.contacted_at || new Date().toISOString(),
        callback_at:         callbackAt,
        callback_note:       callbackForm.note || null,
        status: event.status === 'pending' ? 'contacted' : event.status,
      });
    }

    setCallbackSaving(false);
    setCallbackTarget(null);
    setCallbackForm({ time: '', note: '' });
  }

  // Snooze a case for N days — hides it from the default queue
  async function handleSnooze(type, event, days, reason) {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    if (type === 'cancel') {
      await updateCancelCase(event.id, {
        snoozed_until: snoozeUntil.toISOString(),
        snooze_reason: reason,
      });
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases_snoozed', employeeId] });
    } else {
      await updateRenewalCase(event.id, {
        snoozed_until: snoozeUntil.toISOString(),
        snooze_reason: reason,
      });
    }
  }

  // Mark a case as lost — includes an optional reason
  async function handleMarkLost() {
    if (!lostTarget) return;
    const { type, event } = lostTarget;
    const updates = {
      status:              'lost',
      resolution_date:     new Date().toISOString().slice(0, 10),
      closed_by_id:        employeeId,
      termination_reason:  lostReason || null,
    };
    if (type === 'cancel') {
      await updateCancelCase(event.id, updates);
    } else {
      await updateRenewalCase(event.id, updates);
    }
    setLostTarget(null);
    setLostReason('');
  }

  function CancelCard({ event, policyCount = 1 }) {
    const days       = daysUntilCancel(event.cancel_effective_date);
    const urgent     = days !== null && days <= 3;
    const phone      = event.phone;
    const lastAtt    = lastAttemptSummary(event.last_attempt_result, event.last_attempt_at);
    const promisePast = event.promise_date && new Date(event.promise_date) < new Date();
    const promiseSoon = event.promise_date && !promisePast;
    const isLapsed   = event.stage === 'cancelled';

    // Attempt density color
    const attColor = !event.attempt_count
      ? (urgent ? '#F87171' : '#FBBF24')
      : event.attempt_count >= 3
      ? 'var(--qs-dim)'
      : '#FBBF24';

    // Talking-point script strip — primary purpose of the call.
    // NOTE: the 120-day rewrite window is an internal agent/VC business rule.
    // It must never appear in customer-facing call scripts.
    const firstName = event.customer_name?.split(' ')[0] || 'there';
    const scriptLine = isLapsed
      ? `"Hi ${firstName} — this is [your name] from Wiley-Wilson. Your ${
          event.product
        } policy lapsed on ${event.cancel_effective_date}.${
          event.amount_due
            ? ` We can reinstate your coverage today — the amount due is $${Number(event.amount_due).toLocaleString()}.`
            : ' I want to help you get your coverage reinstated.'
        } Are you in a position to take care of that today?"`
      : `"Hi ${firstName} — this is [your name] from Wiley-Wilson. I'm calling about your ${
          event.product
        } policy.${
          event.amount_due
            ? ` We're showing a payment of $${Number(event.amount_due).toLocaleString()} due by ${event.cancel_effective_date}.`
            : ` Your payment is due by ${event.cancel_effective_date}.`
        } I want to make sure you don't have a gap in coverage — can I help you take care of that today?"`;

    return (
      <div style={{
        background:  'var(--qs-card)',
        border: `1px solid ${
          isLapsed
            ? 'rgba(239,68,68,0.4)'
            : urgent
            ? 'rgba(239,68,68,0.3)'
            : 'var(--qs-border)'
        }`,
        borderLeft: `3px solid ${
          isLapsed
            ? '#EF4444'
            : urgent
            ? '#F87171'
            : days <= 7
            ? '#FBBF24'
            : 'var(--qs-border)'
        }`,
        borderRadius: 10,
        padding:     '18px 20px',
      }}>

        {/* Row 1: Name / badges / days */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--qs-bright)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {event.customer_name}
              </span>

              {event.ai_transcript && (
                <button
                  onClick={() => setExpandedTranscript(prev => prev === event.id ? null : event.id)}
                  style={{ fontSize: 13, background: 'rgba(99,102,241,0.15)', color: '#818CF8',
                    border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                    fontWeight: 600, flexShrink: 0 }}>
                  🤖 AI spoke
                </button>
              )}

              {event.amount_due > 0 && (
                <span style={{ fontSize: 13, background: 'rgba(239,68,68,0.15)', color: '#F87171',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>
                  Owes {fmt$(event.amount_due)}
                </span>
              )}

              {event.stage === 'cancelled' && (
                <span style={{ fontSize: 13, background: 'rgba(239,68,68,0.15)', color: '#F87171',
                  borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>
                  Lapsed
                </span>
              )}

              {policyCount > 1 && (
                <span style={{
                  fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#FBBF24',
                  borderRadius: 4, padding: '1px 6px', fontWeight: 700, flexShrink: 0,
                }}>
                  ⚠ {policyCount} policies
                </span>
              )}

              {event.has_active_renewal && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  color: '#60A5FA', flexShrink: 0,
                }}>
                  🔄 Also renewing
                </span>
              )}
              {event.cross_sell_opportunity && !event.has_active_renewal && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: '#34D399', flexShrink: 0,
                }}>
                  💡 X-sell: {event.cross_sell_product?.toUpperCase()}
                </span>
              )}
            </div>

            <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 3 }}>
              {event.policy_no} · {event.product}
            </div>
          </div>

          {/* Days + cancel date + amount due */}
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            {/* Days — large and color-coded */}
            <div style={{
              fontSize: 18, fontWeight: 800,
              color: urgent ? '#F87171' : days <= 7 ? '#FBBF24' : 'var(--qs-dim)',
              fontFamily: "'DM Mono', monospace", lineHeight: 1,
            }}>
              {days === null ? '—'
                : days === 0 ? 'TODAY'
                : days < 0 ? `${Math.abs(days)}d AGO`
                : `${days}d`}
            </div>
            {/* Cancel date — always visible */}
            <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 2 }}>
              {event.cancel_effective_date}
            </div>
            {/* Amount due — if present */}
            {event.amount_due > 0 && (
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: '#F87171',
                fontFamily: "'DM Mono', monospace",
                marginTop: 4,
              }}>
                ${Number(event.amount_due).toLocaleString()}
              </div>
            )}

            {isLapsed && (
              <div style={{
                marginTop: 6, fontSize: 10, fontWeight: 700,
                color: '#F87171',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                LAPSED
              </div>
            )}
          </div>
        </div>

        {/* Talking point script — primary call purpose */}
        <div style={{
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)',
          borderRadius: 6,
          padding: '7px 10px',
          marginBottom: 8,
          fontSize: 12,
          color: 'var(--qs-dim)',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          {scriptLine}
        </div>

        {/* Row 2: Promise / last attempt / callback */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {promisePast && (
            <span style={{ fontSize: 13, color: '#F87171', fontWeight: 600 }}>
              ⚠ Promise broken · {new Date(event.promise_date).toLocaleDateString()}
            </span>
          )}
          {promiseSoon && (
            <span style={{ fontSize: 13, color: '#FBBF24', fontWeight: 600 }}>
              Promised {new Date(event.promise_date).toLocaleDateString()}
            </span>
          )}
          {lastAtt && !promisePast && (
            <span style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
              {event.attempt_count || 0} attempts · {lastAtt}
            </span>
          )}
          {!lastAtt && !promisePast && (
            <span style={{ fontSize: 13, color: attColor }}>
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

          <button
            onClick={() => { setLogCallTarget({ type: 'cancel', event }); setLogCallForm({ result: 'no_answer', note: '' }); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
              color: 'var(--qs-dim)', cursor: 'pointer', fontWeight: 600,
            }}>
            Log Call
          </button>

          {/* Schedule callback */}
          <button
            onClick={() => { setCallbackTarget({ type: 'cancel', event }); setCallbackForm({ time: '', note: '' }); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
              color: '#60A5FA', cursor: 'pointer', fontWeight: 600,
            }}>
            📅 Callback
          </button>

          <button
            onClick={() => handleInlineResolve('cancel', event, 'saved')}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)',
              color: '#34D399', cursor: 'pointer', fontWeight: 600,
            }}>
            ✓ Saved
          </button>

          {/* Lost quick action — prompts for reason */}
          <button
            onClick={() => { setLostTarget({ type: 'cancel', event }); setLostReason(''); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(100,116,139,0.3)', background: 'rgba(100,116,139,0.08)',
              color: 'var(--qs-subtle)', cursor: 'pointer', fontWeight: 600,
            }}>
            ✗ Lost
          </button>

          {/* Wants to cancel quick action */}
          <button
            onClick={() => handleInlineResolve('cancel', event, 'requested_cancellation')}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)',
              color: '#F87171', cursor: 'pointer', fontWeight: 600,
            }}>
            Wants to Cancel
          </button>

          {/* Snooze — show only after 2+ attempts */}
          {event.attempt_count >= 2 && (
            <select
              className="dark-select"
              defaultValue=""
              onChange={e => {
                if (!e.target.value) return;
                const [days, reason] = e.target.value.split('|');
                handleSnooze('cancel', event, parseInt(days), reason);
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
              <option value="1|retry_tomorrow">1 day — retry tomorrow</option>
              <option value="2|retry_in_2_days">2 days — retry in 2 days</option>
              <option value="7|retry_next_week">1 week — retry next week</option>
            </select>
          )}

          <button
            onClick={() => setSelectedEvent(event)}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'none',
              color: 'var(--qs-subtle)', cursor: 'pointer', fontWeight: 600,
              marginLeft: 'auto',
            }}>
            View →
          </button>
        </div>
      </div>
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
                {event.customer_name}
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
                  💡 X-sell: {event.cross_sell_product?.toUpperCase()}
                </span>
              )}
            </div>

            <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 3 }}>
              {event.policy_no} · {event.product}
            </div>
          </div>

          {/* Days */}
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700,
              color: daysUntil <= 7 ? '#F87171' : daysUntil <= 14 ? '#FBBF24' : 'var(--qs-dim)' }}>
              {daysUntil === 0 ? 'Today' : daysUntil < 0 ? 'Overdue' : `${daysUntil}d`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>renewal</div>
          </div>
        </div>

        {/* Talking point script — primary call purpose */}
        {(() => {
          const firstName = event.customer_name?.split(' ')[0] || 'there';
          const scriptLine = rateShock
            ? `"Hi ${firstName} — calling about your ${event.product} renewal on ${event.renewal_date}. Your premium is going up ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%. Want to review options and make sure you're getting the best rate."`
            : `"Hi ${firstName} — calling about your ${event.product} renewal on ${event.renewal_date}. Just making sure everything still looks good and answering any questions."`;
          return (
            <div style={{
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 6,
              padding: '7px 10px',
              marginBottom: 8,
              fontSize: 12,
              color: 'var(--qs-dim)',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}>
              {scriptLine}
            </div>
          );
        })()}

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
              ({changePct > 0 ? '+' : ''}{fmt$(event.premium_change)}/yr)
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

          <button
            onClick={() => { setLogCallTarget({ type: 'renewal', event }); setLogCallForm({ result: 'no_answer', note: '' }); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
              color: 'var(--qs-dim)', cursor: 'pointer', fontWeight: 600,
            }}>
            Log Call
          </button>

          {/* Schedule callback */}
          <button
            onClick={() => { setCallbackTarget({ type: 'renewal', event }); setCallbackForm({ time: '', note: '' }); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
              color: '#60A5FA', cursor: 'pointer', fontWeight: 600,
            }}>
            📅 Callback
          </button>

          <button
            onClick={() => handleInlineResolve('renewal', event, 'confirmed')}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)',
              color: '#34D399', cursor: 'pointer', fontWeight: 600,
            }}>
            ✓ Confirmed
          </button>

          {/* Won't Renew quick action — prompts for reason */}
          <button
            onClick={() => { setLostTarget({ type: 'renewal', event }); setLostReason(''); }}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid rgba(100,116,139,0.3)', background: 'rgba(100,116,139,0.08)',
              color: 'var(--qs-subtle)', cursor: 'pointer', fontWeight: 600,
            }}>
            ✗ Won't Renew
          </button>

          {/* Snooze — show only after 2+ attempts */}
          {event.attempt_count >= 2 && (
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
              <option value="1|retry_tomorrow">1 day — retry tomorrow</option>
              <option value="2|retry_in_2_days">2 days — retry in 2 days</option>
              <option value="7|retry_next_week">1 week — retry next week</option>
            </select>
          )}

          <button
            onClick={() => setSelectedRenewal(event)}
            style={{
              fontSize: 13, padding: '7px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'none',
              color: 'var(--qs-subtle)', cursor: 'pointer', fontWeight: 600,
              marginLeft: 'auto',
            }}>
            View →
          </button>
        </div>
      </div>
    );
  }

  // Sales-only employees don't have a retention queue. Send them to the
  // scorecard rather than show an empty queue.
  const isServiceRole = roles.includes('service_inbound')
    || roles.includes('service_outbound');
  if (employee && !isServiceRole) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--qs-dim)', fontSize: 16 }}>
          Your role doesn't include a retention queue.
        </p>
        <a href="/my/scorecard" style={{ color: '#3B82F6', fontSize: 15 }}>
          Go to your scorecard →
        </a>
      </div>
    );
  }

  return (
    <div>

      {/* ── Availability Toggle ───────────────────────────────────────── */}
      <AvailabilityToggle />

      {/* ── Scorecard Preview Strip ───────────────────────────────────── */}
      {metrics && (
        <div style={{
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            This Month
          </span>
          {[
            { label: 'Save Rate', value: metrics.cancelSaveRate != null ? `${Math.round(metrics.cancelSaveRate * 100)}%` : '—' },
            { label: 'Saved',     value: metrics.cancelSaved     ?? '—' },
            { label: 'Renewals ✓',value: metrics.renewalsConfirmed ?? '—' },
            { label: 'Attempts',  value: metrics.totalCancelAttempts ?? '—' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)',
                fontFamily: "'DM Mono', monospace" }}>{stat.value}</div>
            </div>
          ))}
          {/* Daily call progress */}
          {(() => {
            const DAILY_TARGET = 8;
            const progressPct = Math.min(100, Math.round((focusStats.attemptedToday / DAILY_TARGET) * 100));
            return (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginBottom: 3 }}>
                    Today: {focusStats.attemptedToday}/{DAILY_TARGET} calls
                  </div>
                  <div style={{
                    width: 100, height: 6, background: 'var(--qs-elevated)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${progressPct}%`,
                      background: progressPct >= 100 ? '#10B981' : progressPct >= 50 ? '#3B82F6' : '#F59E0B',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
                <a href="/my/scorecard"
                  style={{ fontSize: 12, color: 'var(--qs-info)', textDecoration: 'none', fontWeight: 600 }}>
                  Full Scorecard →
                </a>
              </div>
            );
          })()}
        </div>
      )}

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
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['my_cancel_cases', employeeId] });
              queryClient.invalidateQueries({ queryKey: ['my_renewal_cases', employeeId] });
            }}
            style={{ fontSize: 13, padding: '6px 12px', borderRadius: 7,
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
              color: 'var(--qs-subtle)', cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Today's Focus ────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
      }}>
        {[
          {
            label: 'Critical',
            value: focusStats.criticalCount,
            color: focusStats.criticalCount > 0 ? '#F87171' : '#34D399',
            sub:   '≤ 3 days',
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
          },
        ].map(stat => (
          <div key={stat.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
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
      {activeTab === 'cancel' && !cancelLoading && cancelCases.length > 0 && (
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
              {focusMode
                ? `Focus: top ${Math.min(dailyTarget, filteredCancelCases.length)} cases`
                : `Full queue: ${filteredCancelCases.length} cases`}
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

      {/* ── Pending Cancel Tab ───────────────────────────────────────── */}
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

          {/* Filter bar */}
          {!cancelLoading && cancelCases.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { key: 'all',          label: `All (${cancelCases.length})` },
                { key: 'lapsed',       label: `Lapsed (${cancelCases.filter(e => e.stage === 'cancelled').length})` },
                { key: 'pending',      label: `Pending (${cancelCases.filter(e => e.stage === 'pending_cancel').length})` },
                { key: 'never_called', label: `Untouched (${cancelCases.filter(e => !e.attempt_count).length})` },
                { key: 'multi_policy', label: `Multi-policy (${cancelCases.filter(e => (customerPolicyCounts[e.customer_name] || 1) > 1).length})` },
                { key: 'snoozed',      label: `Snoozed${cancelFilter === 'snoozed' ? ` (${snoozedCancelCases.length})` : ''}` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setCancelFilter(f.key)}
                  style={{
                    fontSize: 12, padding: '5px 12px', borderRadius: 20,
                    border: '1px solid',
                    borderColor: cancelFilter === f.key ? '#3B82F6' : 'var(--qs-border)',
                    background: cancelFilter === f.key ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
                    color: cancelFilter === f.key ? '#3B82F6' : 'var(--qs-dim)',
                    cursor: 'pointer', fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Priority buckets */}
          {!cancelLoading && cancelCases.length > 0 && BUCKETS.map(bucket => (
            <div key={bucket.key} style={{ marginBottom: 24 }}>
              {/* Bucket header */}
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                marginBottom: 12, paddingBottom: 8,
                borderBottom: `1px solid ${bucket.color}33`,
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: bucket.color,
                  textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {bucket.label}
                </span>
                <span style={{ fontSize: 13, color: 'var(--qs-dim)',
                  background: 'var(--qs-elevated)', padding: '2px 8px',
                  borderRadius: 10, fontWeight: 600 }}>
                  {bucket.cases.length}
                </span>
                {bucket.sublabel && (
                  <span style={{ fontSize: 11, color: 'var(--qs-muted)', fontWeight: 500 }}>
                    {bucket.sublabel}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {bucket.cases.map(event => (
                  <CancelCard
                    key={event.id}
                    event={event}
                    policyCount={customerPolicyCounts[event.customer_name] || 1}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* "X more cases" banner — focus mode only, when queue extends past target */}
          {!cancelLoading && focusMode && filteredCancelCases.length > dailyTarget && (
            <div style={{
              textAlign: 'center', padding: '14px',
              fontSize: 13, color: 'var(--qs-muted)',
              borderTop: '1px solid var(--qs-border)',
              marginTop: 8,
            }}>
              {filteredCancelCases.length - dailyTarget} more cases in full queue
              {' · '}
              <button
                onClick={toggleFocusMode}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#3B82F6', fontSize: 13, fontWeight: 600, padding: 0,
                }}
              >
                View all
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Renewals Tab ─────────────────────────────────────────────── */}
      {activeTab === 'renewal' && (
        <div>
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

          {/* Renewal cards */}
          {!renewalLoading && renewalCases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {renewalCases.map(event => (
                <RenewalCard
                  key={event.id}
                  event={event}
                  policyCount={customerPolicyCounts[event.customer_name] || 1}
                />
              ))}
            </div>
          )}
        </div>
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
        />,
        document.body
      )}

      {/* ── Log Call Popover ───────────────────────────────────────── */}
      {logCallTarget && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setLogCallTarget(null); }}
        >
          <div style={{
            background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 24, width: '100%', maxWidth: 440,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 6 }}>
              Log Call — {logCallTarget.event.customer_name}
            </div>
            <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginBottom: 14 }}>
              {logCallTarget.event.policy_no}
            </div>

            {/* Quick-dial link in the popover itself */}
            {(() => {
              const dialPhone = logCallTarget.event.phone || logCallTarget.event.customer_phone;
              return dialPhone ? (
                <a
                  href={`tel:${dialPhone}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                    background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)',
                    color: '#34D399', textDecoration: 'none',
                    fontSize: 15, fontWeight: 700,
                  }}
                >
                  📞 {fmtPhone(dialPhone)}
                  <span style={{ fontSize: 11, color: 'var(--qs-muted)', fontWeight: 400, marginLeft: 4 }}>
                    tap to dial
                  </span>
                </a>
              ) : null;
            })()}

            {/* Key facts for the call */}
            <div style={{
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              {logCallTarget.type === 'cancel' && logCallTarget.event.amount_due > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 2 }}>Owes</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#F87171',
                    fontFamily: "'DM Mono', monospace" }}>
                    ${Number(logCallTarget.event.amount_due).toLocaleString()}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 2 }}>
                  {logCallTarget.type === 'cancel' ? 'Cancel Date' : 'Renewal Date'}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)',
                  fontFamily: "'DM Mono', monospace" }}>
                  {logCallTarget.type === 'cancel'
                    ? logCallTarget.event.cancel_effective_date
                    : logCallTarget.event.renewal_date}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--qs-subtle)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 2 }}>Product</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}>
                  {logCallTarget.event.product?.toUpperCase()}
                </div>
              </div>
            </div>

            {/* 6-outcome grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { value: 'no_answer',      label: 'No Answer'   },
                { value: 'left_voicemail', label: 'Voicemail'   },
                { value: 'reached',        label: 'Reached ✓'   },
                { value: 'wrong_number',   label: 'Wrong #'     },
                { value: 'busy',           label: 'Busy'        },
                { value: 'disconnected',   label: 'Disconnected'},
              ].map(opt => (
                <button key={opt.value}
                  onClick={() => setLogCallForm(f => ({ ...f, result: opt.value }))}
                  style={{
                    fontSize: 13, padding: '10px 6px', borderRadius: 7, cursor: 'pointer',
                    fontWeight: 600, border: '1px solid',
                    borderColor: logCallForm.result === opt.value ? 'var(--qs-info)' : 'var(--qs-border)',
                    background:  logCallForm.result === opt.value ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
                    color:       logCallForm.result === opt.value ? 'var(--qs-info)' : 'var(--qs-dim)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Optional note */}
            <input
              type="text"
              className="dark-input"
              placeholder="Optional note..."
              value={logCallForm.note}
              onChange={e => setLogCallForm(f => ({ ...f, note: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleInlineLogCall(); }}
              style={{ marginBottom: 16, fontSize: 15, padding: '10px 12px', width: '100%', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLogCallTarget(null)}
                style={{ fontSize: 15, padding: '9px 18px', borderRadius: 8,
                  border: '1px solid var(--qs-border)', background: 'none',
                  color: 'var(--qs-dim)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = logCallTarget;
                  setLogCallTarget(null);
                  setCallbackTarget({ type: target.type, event: target.event });
                  setCallbackForm({ time: '', note: '' });
                }}
                style={{
                  fontSize: 13, padding: '7px 12px', borderRadius: 8,
                  border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
                  color: '#60A5FA', cursor: 'pointer', fontWeight: 600,
                }}>
                📅 Callback
              </button>
              <button
                onClick={handleInlineLogCall}
                disabled={logCallSaving}
                style={{ fontSize: 15, padding: '9px 18px', borderRadius: 8,
                  border: 'none', background: 'var(--qs-primary, #3B82F6)',
                  color: '#fff', fontWeight: 600, cursor: 'pointer',
                  opacity: logCallSaving ? 0.6 : 1 }}>
                {logCallSaving ? 'Saving...' : 'Log Call'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Callback Popover ───────────────────────────────────────── */}
      {callbackTarget && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setCallbackTarget(null); }}
        >
          <div style={{
            background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 20, width: '100%', maxWidth: 340,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
              Schedule Callback
            </div>
            <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 16 }}>
              {callbackTarget.event.customer_name} · {callbackTarget.event.policy_no}
            </div>

            <label className="dark-label">Callback time</label>
            <input
              className="dark-input"
              type="datetime-local"
              value={callbackForm.time}
              onChange={e => setCallbackForm(f => ({ ...f, time: e.target.value }))}
              style={{ marginBottom: 10 }}
            />

            <label className="dark-label">What to discuss (optional)</label>
            <input
              className="dark-input"
              type="text"
              placeholder="e.g. Confirm payment, discuss rate..."
              value={callbackForm.note}
              onChange={e => setCallbackForm(f => ({ ...f, note: e.target.value }))}
              style={{ marginBottom: 14 }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCallbackTarget(null)}
                style={{
                  fontSize: 13, padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--qs-border)', background: 'none',
                  color: 'var(--qs-dim)', cursor: 'pointer',
                }}>
                Cancel
              </button>
              <button
                onClick={handleScheduleCallback}
                disabled={!callbackForm.time || callbackSaving}
                style={{
                  fontSize: 13, padding: '8px 14px', borderRadius: 8,
                  border: 'none', background: '#3B82F6',
                  color: '#fff', fontWeight: 600, cursor: 'pointer',
                  opacity: !callbackForm.time || callbackSaving ? 0.5 : 1,
                }}>
                {callbackSaving ? 'Saving...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Mark Lost Popover ─────────────────────────────────────── */}
      {lostTarget && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setLostTarget(null); }}
        >
          <div style={{
            background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 20, width: '100%', maxWidth: 320,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
              Mark as Lost
            </div>
            <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 14 }}>
              {lostTarget.event.customer_name}
            </div>

            <label className="dark-label">Reason (optional but helpful)</label>
            <select
              className="dark-select"
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              style={{ marginBottom: 14 }}
            >
              <option value="">— Select reason —</option>
              <option value="Price">Price / Too expensive</option>
              <option value="Service">Service issue</option>
              <option value="Claims">Claims experience</option>
              <option value="Moving">Moving / Relocating</option>
              <option value="Coverage no longer needed">Coverage no longer needed</option>
              <option value="Switched carrier">Switched to another carrier</option>
              <option value="No contact">Could not reach customer</option>
              <option value="Other">Other</option>
            </select>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLostTarget(null)}
                style={{
                  fontSize: 13, padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--qs-border)', background: 'none',
                  color: 'var(--qs-dim)', cursor: 'pointer',
                }}>
                Cancel
              </button>
              <button
                onClick={handleMarkLost}
                style={{
                  fontSize: 13, padding: '8px 14px', borderRadius: 8,
                  border: 'none', background: '#475569',
                  color: '#fff', fontWeight: 600, cursor: 'pointer',
                }}>
                Confirm Lost
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
