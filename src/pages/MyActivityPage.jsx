// My Activity — a rep's own retention output, day by day. A self-scoped version
// of the principal's Activity panel (RepActivityPanel): same day-by-day timeline
// (calls, reached, saves, premium, tasks done) plus a personal "today" coverage
// strip, but locked to the logged-in employee — no rep selector, no coworker data.

import { useState, Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useRepActivity } from '../hooks/useRepActivity';
import { titleCaseName } from '../lib/names';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
function localDay(d = new Date()) { return d.toLocaleDateString('en-CA'); }
function dayLabel(k) {
  if (k === localDay()) return 'Today';
  if (k === localDay(new Date(Date.now() - 86400000))) return 'Yesterday';
  return new Date(k + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const CANCEL_TERMINAL = '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)';
const RENEWAL_TERMINAL = '(confirmed,lost,auto_resolved,unreachable)';

// My queue right now — active cases assigned to me, and how many are untouched
// (never called) or overdue (past deadline, never called). Self-scoped.
function useMyQueueSnapshot(agencyId, employeeId) {
  return useQuery({
    queryKey: ['my_queue_snapshot', agencyId, employeeId],
    enabled: !!agencyId && !!employeeId,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();

      const [{ data: cancels }, { data: renewals }] = await Promise.all([
        supabase.from('pending_cases')
          .select('attempt_count, cancel_effective_date')
          .eq('agency_id', agencyId).eq('assigned_to_id', employeeId)
          .not('status', 'in', CANCEL_TERMINAL)
          .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`),
        supabase.from('renewal_cases')
          .select('attempt_count, renewal_date')
          .eq('agency_id', agencyId).eq('assigned_to_id', employeeId)
          .not('status', 'in', RENEWAL_TERMINAL)
          .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`),
      ]);

      let queue = 0, untouched = 0, overdue = 0;
      for (const c of cancels || []) {
        queue++;
        const u = !(c.attempt_count > 0);
        if (u) { untouched++; if (c.cancel_effective_date && c.cancel_effective_date < todayStr) overdue++; }
      }
      for (const r of renewals || []) {
        queue++;
        const u = !(r.attempt_count > 0);
        if (u) { untouched++; if (r.renewal_date && r.renewal_date < todayStr) overdue++; }
      }
      return { queue, untouched, overdue };
    },
  });
}

// Live: when my own activity changes (a logged call, a save, a completed task),
// refresh the views within seconds instead of waiting for a manual reload.
function useLiveMyActivity(agencyId, employeeId) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!agencyId || !employeeId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['rep_activity', agencyId, employeeId] });
      qc.invalidateQueries({ queryKey: ['my_queue_snapshot', agencyId, employeeId] });
    };
    const ch = supabase.channel(`my-activity-${employeeId}`);
    for (const table of ['pending_cancel_attempts', 'renewal_attempts', 'pending_cases', 'renewal_cases', 'service_tasks']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `agency_id=eq.${agencyId}` }, refresh);
    }
    ch.subscribe();
    return () => supabase.removeChannel(ch);
  }, [agencyId, employeeId, qc]);
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--qs-elevated)', overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

// Cases I worked that day — saved ones tagged, others show the outcome. The
// customer name links into their full household.
function WorkedRows({ worked, k, onCustomer }) {
  return worked.map((w, i) => (
    <tr key={`${k}-${i}`} style={{ background: 'var(--qs-elevated)' }}>
      <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
          background: w.kind === 'cancel' ? '#EF444422' : '#3B82F622',
          color: w.kind === 'cancel' ? '#F87171' : '#60A5FA' }}>
          {w.kind === 'cancel' ? 'CANCEL' : 'RENEWAL'}
        </span>
        <button type="button" onClick={() => w.name && onCustomer?.(w.name)} title="Open customer"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, color: '#60A5FA', fontWeight: 600 }}>
          {titleCaseName(w.name) || '—'} ↗
        </button>
        {' · '}
        {w.saved
          ? <span style={{ color: '#34D399', fontWeight: 600 }}>✓ saved{w.premium ? ` · ${fmt$(w.premium)}` : ''}</span>
          : <span>{(w.result || 'attempt').replace(/_/g, ' ')}</span>}
        {w.note && <span style={{ fontStyle: 'italic', color: 'var(--qs-muted)', marginLeft: 8 }}>“{w.note}”</span>}
      </td>
    </tr>
  ));
}

// Service tasks I completed that day.
function TaskDoneRows({ tasks, k }) {
  return tasks.map((t, i) => (
    <tr key={`${k}-task-${i}`} style={{ background: 'var(--qs-elevated)' }}>
      <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
          background: '#10B98122', color: '#34D399' }}>TASK ✓</span>
        <span style={{ color: 'var(--qs-text)' }}>{t.title}</span>
        {t.customer_name ? ` · ${titleCaseName(t.customer_name)}` : ''}
      </td>
    </tr>
  ));
}

export default function MyActivityPage() {
  const { data: employee } = useCurrentEmployee();
  const employeeId = employee?.id;
  const orgId = employee?.org_id;
  const navigate = useNavigate();
  const onCustomer = (name) => navigate(`/my/customers?q=${encodeURIComponent(name)}`);

  useLiveMyActivity(orgId, employeeId);

  const { data, isLoading } = useRepActivity(orgId, employeeId, 14);
  const { data: snap } = useMyQueueSnapshot(orgId, employeeId);
  const [openDay, setOpenDay] = useState(null);

  if (!employee) {
    return (
      <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)' }}>My Activity</h1>
        <div style={{ marginTop: 16, padding: 20, borderRadius: 10,
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          color: 'var(--qs-dim)', fontSize: 14, maxWidth: 520 }}>
          You don't have a rep workspace set up yet.
        </div>
      </div>
    );
  }

  const target = employee?.daily_call_target ?? 8;
  const today = data?.series?.[0];
  const callsToday = today?.attempts ?? 0;
  const workedToday = today?.workedCount ?? 0;
  const queue = snap?.queue ?? 0;
  const targetPct = target ? Math.round((callsToday / target) * 100) : 0;
  const coverPct = queue ? Math.round((workedToday / queue) * 100) : 0;
  const targetHit = callsToday >= target;

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', margin: 0 }}>
          My Activity
        </h1>
        <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 2 }}>
          Your retention output, day by day — calls, reached, saves, premium preserved, and tasks done.
        </div>
      </div>

      {/* Today's queue coverage — a personal version of the principal's Queue tab */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: '0 0 12px' }}>
          Today
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
          <Stat label="In my queue" value={queue} />
          <Stat label="Untouched" value={snap?.untouched || 0}
            sub={snap?.overdue ? `${snap.overdue} overdue` : null}
            color={snap?.untouched ? '#FBBF24' : undefined} />
          <Stat label="Worked today" value={workedToday}
            color={workedToday ? '#10B981' : undefined} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
              color: 'var(--qs-dim)', marginBottom: 5 }}>
              <span>Calls vs target</span>
              <span style={{ color: targetHit ? '#10B981' : 'var(--qs-text)', fontWeight: 600 }}>
                {callsToday}/{target}
              </span>
            </div>
            <Bar pct={targetPct} color={targetHit ? '#10B981' : targetPct >= 50 ? '#3B82F6' : '#F59E0B'} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
              color: 'var(--qs-dim)', marginBottom: 5 }}>
              <span>Queue coverage</span>
              <span style={{ color: 'var(--qs-text)', fontWeight: 600 }}>{coverPct}%</span>
            </div>
            <Bar pct={coverPct} color={coverPct >= 80 ? '#10B981' : coverPct >= 40 ? '#3B82F6' : '#F59E0B'} />
          </div>
        </div>
      </div>

      {/* Last 14 days timeline */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Last 14 days</h3>
          {data && (
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)' }}>
              <strong style={{ color: '#10B981' }}>{data.totals.saves}</strong> saves ·{' '}
              <strong style={{ color: '#10B981' }}>{fmt$(data.totals.premium)}</strong> ·{' '}
              {data.totals.attempts} calls · {data.totals.tasksDone} tasks
            </div>
          )}
        </div>
        {isLoading || !data ? <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div> : (
          <table>
            <thead><tr><th>Day</th><th>Calls</th><th>Reached</th><th>Saves</th><th>Premium</th><th>Tasks done</th></tr></thead>
            <tbody>
              {data.series.map(d => {
                const saves = d.cancelSaves + d.renewalSaves;
                const idle = d.attempts + saves + d.tasksDone === 0;
                const expandable = d.worked.length > 0 || d.tasksList.length > 0;
                return (
                  <Fragment key={d.date}>
                    <tr onClick={() => expandable && setOpenDay(openDay === d.date ? null : d.date)}
                      style={{ cursor: expandable ? 'pointer' : 'default', opacity: idle ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{dayLabel(d.date)} {expandable ? (openDay === d.date ? '▾' : '▸') : ''}</td>
                      <td>{d.attempts || '—'}</td>
                      <td>{d.reached || '—'}</td>
                      <td style={{ fontWeight: 700, color: saves ? '#10B981' : 'var(--qs-muted)' }}>
                        {saves ? `${saves} (${d.cancelSaves}c/${d.renewalSaves}r)` : '—'}
                      </td>
                      <td style={{ color: d.premium ? '#10B981' : 'var(--qs-muted)' }}>{d.premium ? fmt$(d.premium) : '—'}</td>
                      <td>{d.tasksDone || '—'}</td>
                    </tr>
                    {openDay === d.date && <WorkedRows worked={d.worked} k={d.date} onCustomer={onCustomer} />}
                    {openDay === d.date && <TaskDoneRows tasks={d.tasksList} k={d.date} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
          Calls = attempts you logged (auto-logged dials excluded). Reached = customer answered.
          Saves = cancels saved + renewals confirmed, with the premium preserved. Tap a day to see the cases.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace",
        color: color || 'var(--qs-bright)', marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#F87171', fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}
