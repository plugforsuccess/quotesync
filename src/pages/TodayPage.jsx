// Today — unified daily call list combining cancels and renewals for the
// logged-in user. The single "what to dial next" view that ignores the
// persona switcher (cross-role by design).

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees } from '../hooks/useEmployees';
import { titleCaseName } from '../lib/names';
import { productLabel } from '../lib/productLabels';
import { useServiceTasks } from '../hooks/useServiceTasks';
import { usePersona } from '../hooks/usePersona';
import { hatForRoles } from '../config/navConfig';
import ProducerGoalProgress from './components/employee/ProducerGoalProgress';
import { TIER_ORDER } from '../lib/retentionPriority';
import { EventDetailModal, RenewalDetailModal } from './components/retention/RetentionCancels';

function fmt$(n) {
  if (n == null || isNaN(n)) return '—';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

// Unified rank (lower = call first). Combines cancel priority_tier and
// renewal days-until so a "renewal due in 2 days" beats a "P3 cancel".
function rankOf(item) {
  if (item._kind === 'cancel') {
    const tier = TIER_ORDER[item.priority_tier] ?? 4;
    // P0=0 P1=10 P2=20 P3=30  (room for renewals to slot between tiers)
    return tier * 10;
  }
  // renewal: convert days-until to a rank score
  const d = daysUntil(item.renewal_date);
  if (d == null)        return 50;
  if (d <= 3)           return 12;  // beats P2 cancels
  if (d <= 7)           return 22;  // beats P3 cancels
  if (d <= 14)          return 32;
  if (d <= 30)          return 40;
  return 60;
}

const TYPE_BADGE = {
  cancel:  { label: 'CANCEL',  bg: '#EF444422', color: '#F87171' },
  renewal: { label: 'RENEWAL', bg: '#3B82F622', color: '#60A5FA' },
};

const TIER_BADGE = {
  P0: { label: 'LAPSED', bg: '#EF444433', color: '#FCA5A5' },
  P1: { label: 'P1',     bg: '#F59E0B33', color: '#FCD34D' },
  P2: { label: 'P2',     bg: '#64748B33', color: '#CBD5E1' },
  P3: { label: 'P3',     bg: '#33415533', color: '#94A3B8' },
};

export default function TodayPage() {
  const { data: employee } = useCurrentEmployee();
  const employeeId = employee?.id;
  const orgId      = employee?.org_id;
  // Needed so the detail modal can resolve the rep's name for the script
  // (agent name) and the assignee — mirrors My Queue.
  const { data: employees = [] } = useActiveEmployees(orgId);
  // The dial list is cross-role by design, but the production goal strip is a
  // sales overlay — only show it when the sales hat is active (a dual-role
  // producer wearing Service shouldn't see it).
  const [persona] = usePersona();
  const isSalesHat = hatForRoles(employee?.roles || [], persona) === 'sales';
  const queryClient = useQueryClient();

  const [selectedCancel,  setSelectedCancel]  = useState(null);
  const [selectedRenewal, setSelectedRenewal] = useState(null);

  // Service-batch glance — open admin tasks waiting for the afternoon block.
  const { tasks: serviceTasks = [], overdue: serviceOverdue = 0 } = useServiceTasks(orgId);

  // Persist outcomes from the detail modals and refresh the list — without
  // these, the modal Save button silently no-ops, the case stays in the queue,
  // and the principal can never clear "what to dial next".
  async function updateCancel(id, updates) {
    if (updates && Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('pending_cases')
        .update(updates)
        .eq('id', id);
      if (error) return error;
    }
    queryClient.invalidateQueries({ queryKey: ['today_cancels', employeeId] });
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', orgId] });
    }
    return null;
  }

  async function updateRenewal(id, updates) {
    if (updates && Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('renewal_cases')
        .update(updates)
        .eq('id', id);
      if (error) return error;
    }
    queryClient.invalidateQueries({ queryKey: ['today_renewals', employeeId] });
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', orgId] });
    }
    return null;
  }

  // Realtime: when something changes on a case assigned to me — a new
  // assignment, a reassignment, a status flip from another tab/agent — refetch
  // the relevant list so the queue stays in sync without a manual refresh.
  // Mirrors the auto-reconnect pattern used in AgencyLeadDetailPage so a
  // backgrounded tab heals on return instead of going silent.
  useEffect(() => {
    if (!employeeId) return;

    let reconnectTimer = null;
    let isReconnecting = false;
    let currentChannel = null;

    function subscribe() {
      const channel = supabase
        .channel(`today-cases-${employeeId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pending_cases',
          filter: `assigned_to_id=eq.${employeeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['today_cancels', employeeId] });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'renewal_cases',
          filter: `assigned_to_id=eq.${employeeId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['today_renewals', employeeId] });
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

  const { data: cancels = [], isLoading: cancelsLoading } = useQuery({
    queryKey: ['today_cancels', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('pending_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)')
        .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
    staleTime: 60_000,
  });

  const { data: renewals = [], isLoading: renewalsLoading } = useQuery({
    queryKey: ['today_renewals', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('renewal_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)')
        .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
    staleTime: 60_000,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyTarget = employee?.daily_call_target ?? 8;

  const callsToday = useMemo(() => {
    const c = cancels.filter(x  => x.last_attempt_at?.slice(0, 10) === todayStr).length;
    const r = renewals.filter(x => x.last_attempt_at?.slice(0, 10) === todayStr).length;
    return c + r;
  }, [cancels, renewals, todayStr]);

  const targetHit   = callsToday >= dailyTarget;
  const progressPct = Math.min(100, Math.round((callsToday / dailyTarget) * 100));

  const ranked = useMemo(() => {
    const items = [
      ...cancels.map(c  => ({ ...c, _kind: 'cancel'  })),
      ...renewals.map(r => ({ ...r, _kind: 'renewal' })),
    ];
    return items.sort((a, b) => {
      const ra = rankOf(a), rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      const pa = parseFloat(a._kind === 'cancel' ? a.premium_at_risk : a.premium) || 0;
      const pb = parseFloat(b._kind === 'cancel' ? b.premium_at_risk : b.premium) || 0;
      if (pa !== pb) return pb - pa;
      const da = a._kind === 'cancel' ? a.cancel_effective_date : a.renewal_date;
      const db = b._kind === 'cancel' ? b.cancel_effective_date : b.renewal_date;
      return (da || '').localeCompare(db || '');
    });
  }, [cancels, renewals]);

  const focused = ranked.slice(0, dailyTarget);
  const remainder = ranked.length - focused.length;

  // Waiting to hear back — voicemails left + scheduled callbacks, so the
  // follow-up Tracy is owed isn't buried in the ranked dial list. Soonest
  // callback first; overdue callbacks float to the top.
  const waiting = useMemo(() => {
    return [
      ...cancels.map(c  => ({ ...c, _kind: 'cancel'  })),
      ...renewals.map(r => ({ ...r, _kind: 'renewal' })),
    ]
      .filter(x => x.awaiting_callback || x.callback_at)
      .sort((a, b) => {
        const ca = a.callback_at ? new Date(a.callback_at).getTime() : Infinity;
        const cb = b.callback_at ? new Date(b.callback_at).getTime() : Infinity;
        return ca - cb;
      });
  }, [cancels, renewals]);

  // Never-worked alarm: cases on her plate that hit (or are about to hit) their
  // deadline with zero attempts. These are how policies lapse unworked — surface
  // them loudly so they get called before the deadline passes.
  const untouched = useMemo(() => {
    const all = [
      ...cancels.map(c  => ({ ...c, _date: c.cancel_effective_date })),
      ...renewals.map(r => ({ ...r, _date: r.renewal_date })),
    ].filter(x => !(x.attempt_count > 0));
    let dueSoon = 0, lapsed = 0;
    for (const x of all) {
      const d = daysUntil(x._date);
      if (d == null) continue;
      if (d < 0) lapsed++;
      else if (d < 7) dueSoon++;
    }
    return { dueSoon, lapsed };
  }, [cancels, renewals]);

  const isLoading = cancelsLoading || renewalsLoading;

  if (!employee) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}>Today</h1>
        <div style={{ marginTop: 16, padding: 20, borderRadius: 10,
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          color: 'var(--qs-dim)', fontSize: 14, maxWidth: 520,
        }}>
          You don't have a rep workspace set up. Open <strong>Settings → Profile</strong>
          and use "Work cases as a rep" to start receiving assigned cases.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', margin: 0 }}>
          Today
        </h1>
        <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 2 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {' · '}what to dial next, ranked across cancels and renewals
        </div>
      </div>

      {/* Sales hat only: monthly premium goal progress at a glance */}
      {isSalesHat && (
        <ProducerGoalProgress compact orgId={orgId} employee={employee} />
      )}

      {/* Progress */}
      <div style={{
        background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 18,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-dim)' }}>
            Today's calls
          </div>
          <div style={{
            fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace",
            color: targetHit ? '#10B981' : 'var(--qs-bright)',
          }}>
            {callsToday}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--qs-muted)', marginLeft: 3 }}>
              / {dailyTarget}
            </span>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--qs-card)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progressPct}%`, borderRadius: 3,
            background: targetHit ? '#10B981' : progressPct >= 50 ? '#3B82F6' : '#F59E0B',
            transition: 'width 0.4s ease',
          }} />
        </div>
        {targetHit && (
          <div style={{ fontSize: 11, color: '#10B981', marginTop: 6, fontWeight: 600 }}>
            ✓ Daily target reached — you can stop here or work ahead.
          </div>
        )}
      </div>

      {/* Service Batch glance — admin tasks for the afternoon block */}
      {serviceTasks.length > 0 && (
        <a href="/my/service-batch" style={{
          display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 18,
        }}>
          <span style={{ fontSize: 18 }}>🗂️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)' }}>
              {serviceTasks.length} service {serviceTasks.length === 1 ? 'task' : 'tasks'} to batch
            </div>
            <div style={{ fontSize: 12, color: serviceOverdue > 0 ? '#F87171' : 'var(--qs-muted)' }}>
              {serviceOverdue > 0 ? `${serviceOverdue} past due · ` : ''}clear in one block, grouped by type
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>Open Service Batch →</span>
        </a>
      )}

      {/* Never-worked alarm — call these before they lapse */}
      {(untouched.dueSoon > 0 || untouched.lapsed > 0) && (
        <div style={{
          background: untouched.lapsed > 0 ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
          border: `1px solid ${untouched.lapsed > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 18,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700,
            color: untouched.lapsed > 0 ? '#F87171' : '#FBBF24' }}>
            ⚠ Call these before they lapse
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>
            {untouched.dueSoon > 0 && (
              <span><strong>{untouched.dueSoon}</strong> due this week you haven't called yet. </span>
            )}
            {untouched.lapsed > 0 && (
              <span><strong style={{ color: '#F87171' }}>{untouched.lapsed}</strong> already past due, never called — try a reinstatement/rewrite now. </span>
            )}
            They're in your ranked list below — work them first.
          </div>
        </div>
      )}

      {/* Waiting to hear back — voicemails + scheduled callbacks */}
      {waiting.length > 0 && (
        <div style={{
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-dim)', marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⏳ Waiting to hear back ({waiting.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {waiting.map(item => {
              const cb = item.callback_at ? new Date(item.callback_at) : null;
              const overdue = cb && cb < new Date();
              const label = cb
                ? `${overdue ? '📅 Callback due' : '📅 Call back'} ${cb.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : '📞 Left voicemail — awaiting callback';
              return (
                <button
                  key={`${item._kind}-${item.id}`}
                  onClick={() => item._kind === 'cancel' ? setSelectedCancel(item) : setSelectedRenewal(item)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', width: '100%',
                    background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                    borderRadius: 8, padding: '8px 12px', display: 'flex',
                    alignItems: 'center', gap: 10, fontFamily: 'inherit', color: 'var(--qs-text)',
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: TYPE_BADGE[item._kind].bg, color: TYPE_BADGE[item._kind].color,
                    letterSpacing: '0.05em', flexShrink: 0,
                  }}>{TYPE_BADGE[item._kind].label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
                    {titleCaseName(item.customer_name) || '—'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, flexShrink: 0,
                    color: overdue ? '#F87171' : 'var(--qs-muted)', fontWeight: overdue ? 700 : 500 }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranked list */}
      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 14 }}>Loading…</div>
      ) : ranked.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 20px',
          background: 'var(--qs-elevated)', borderRadius: 10,
          border: '1px solid var(--qs-border)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>
            Nothing on your plate today
          </div>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>
            No active cancel or renewal cases assigned to you.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {focused.map((item, idx) => (
              <TodayRow
                key={`${item._kind}-${item.id}`}
                index={idx + 1}
                item={item}
                todayStr={todayStr}
                onOpen={() => {
                  if (item._kind === 'cancel') setSelectedCancel(item);
                  else setSelectedRenewal(item);
                }}
              />
            ))}
          </div>

          {remainder > 0 && (
            <div style={{
              textAlign: 'center', padding: 14, marginTop: 8,
              fontSize: 12, color: 'var(--qs-muted)',
              borderTop: '1px solid var(--qs-border)',
            }}>
              {remainder} more {remainder === 1 ? 'case' : 'cases'} beyond today's target
              {' · '}
              <a href="/my/queue" style={{ color: '#3B82F6', fontWeight: 600 }}>
                Open full queue
              </a>
            </div>
          )}
        </>
      )}

      {selectedCancel && createPortal(
        <EventDetailModal
          event={selectedCancel}
          onClose={() => setSelectedCancel(null)}
          onUpdate={updateCancel}
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
          onUpdate={updateRenewal}
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

function TodayRow({ index, item, todayStr, onOpen }) {
  const touched = item.last_attempt_at?.slice(0, 10) === todayStr;

  const isCancel = item._kind === 'cancel';
  const typeBadge = TYPE_BADGE[item._kind];
  const tierBadge = isCancel ? TIER_BADGE[item.priority_tier] : null;

  const premium = isCancel ? item.premium_at_risk : item.premium;
  const date = isCancel ? item.cancel_effective_date : item.renewal_date;
  const days = daysUntil(date);
  const dateLabel =
    days == null ? '—'
    : days < 0    ? `${Math.abs(days)}d past due`
    : days === 0  ? 'today'
    : days === 1  ? 'tomorrow'
    : `${days}d`;

  return (
    <button
      onClick={onOpen}
      style={{
        textAlign: 'left', cursor: 'pointer', width: '100%',
        background: touched ? 'rgba(16,185,129,0.06)' : 'var(--qs-elevated)',
        border: '1px solid',
        borderColor: touched ? '#10B98133' : 'var(--qs-border)',
        borderRadius: 10, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'inherit', color: 'var(--qs-text)',
        transition: 'all 0.12s',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 14, flexShrink: 0,
        background: 'var(--qs-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: 'var(--qs-muted)',
        fontFamily: "'DM Mono', monospace",
      }}>{index}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: typeBadge.bg, color: typeBadge.color, letterSpacing: '0.05em',
          }}>{typeBadge.label}</span>
          {tierBadge && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: tierBadge.bg, color: tierBadge.color, letterSpacing: '0.05em',
            }}>{tierBadge.label}</span>
          )}
          {touched && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: '#10B98122', color: '#34D399', letterSpacing: '0.05em',
            }}>CALLED TODAY</span>
          )}
          {isCancel && item.promise_date && new Date(item.promise_date) < new Date() && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: '#EF444433', color: '#FCA5A5', letterSpacing: '0.05em',
            }}>⚠ PAY PROMISE OVERDUE</span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {titleCaseName(item.customer_name) || '—'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
          {dateLabel} · {fmt$(premium)}
          {item.product ? ` · ${productLabel(item.product)}` : ''}
        </div>
      </div>

      <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--qs-dim)' }}>
        Open →
      </div>
    </button>
  );
}
