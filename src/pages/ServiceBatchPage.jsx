// Service Batch — the Operating Playbook's "Afternoon — SERVICE BATCH" surface.
// Cold service requests (the ones not resolved live on a renewal call) logged as
// service_tasks, grouped by type and sorted by due date so they clear in one
// protected block. Each task copies a paste-ready block for Allstate.

import { T } from '../components/SiteCopy';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees, useAssignableMembers } from '../hooks/useEmployees';
import {
  useServiceTasks, useUpdateServiceTask, useCreateServiceTask,
  useExpectedCallbacks, useLogCallback, useServiceTaskVelocity, slaMsLeft,
  useLogServiceTaskAttempt, useSetServiceTaskWaiting, useSetServiceTaskFollowUp, useServiceActivity,
  TASK_ATTEMPT_METHODS, TASK_ATTEMPT_RESULTS, TASK_ATTEMPT_RESULT_MAP,
  TASK_TYPES, TASK_TYPE_MAP, LANES, LANE_MAP, SCOPES, PRODUCTS, PRODUCT_MAP, productShort,
  SLA_HOURS, ATTEMPT_CAP, PARK_CAP_MS, isParkExpired, parkedBusinessMs,
  FOLLOW_UP_QUICK_DAYS, followUpInDays,
} from '../hooks/useServiceTasks';
import { usePolicyAutocomplete } from '../hooks/useCustomerSearch';
import { businessMsBetween } from '../lib/businessHours';
import { titleCaseName } from '../lib/names';
import CopyButton from '../components/CopyButton';
import ServiceTaskDetailModal from '../components/ServiceTaskDetailModal';
import { formatTaskForAllstate } from '../lib/allstateClipboard';
import { NEUTRAL_CHIP, DANGER_CHIP } from '../lib/statusChips';

const fmtShortDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '—';

// Compact "how long ago" for a timestamp — d / h / m, coarsest unit that fits.
function fmtAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h ago`;
  return `${Math.max(1, Math.floor(ms / 60000))}m ago`;
}

// Completing one of these without recording what was done loses the audit trail
// the agency cares about most — so a completion note is required.
const NOTE_REQUIRED_TYPES = new Set(['billing', 'coverage', 'premium', 'insurance_review', 'reinstatement', 'terminate', 'claim', 'payment']);

// Only URGENT is red; HIGH/LOW are neutral chips (see lib/statusChips).
const PRIORITY_BADGE = {
  urgent: { label: 'URGENT', ...DANGER_CHIP },
  high:   { label: 'HIGH',   ...NEUTRAL_CHIP, color: 'var(--qs-text)' },
  normal: null,
  low:    { label: 'LOW',    ...NEUTRAL_CHIP },
};

// Break a millisecond span into h/m/s parts for the live readout.
function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
// Compact "Xh Ym" / "Ym Zs" / "Ym" — the unit shown adapts to the magnitude.
function fmtDur(ms) {
  const { h, m, s } = parts(ms);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// SLA countdown in business hours — the goal is to clear every service task
// within one open day, faster when possible. The ring fills as the budget is
// consumed; it turns red only in the final hour and past breach, so the one
// red thing on the page is the task that needs attention now. `frac` is the
// share already consumed.
function slaState(createdAt) {
  const ms = slaMsLeft(createdAt);
  if (ms == null) return null;
  const total = SLA_HOURS * 3600000;
  const frac = Math.min(1, Math.max(0, (total - ms) / total));
  const hrs = ms / 3600000;
  const overdue = ms < 0;
  const label = overdue ? `Overdue ${fmtDur(-ms)}` : `${fmtDur(ms)} left`;
  const hot = overdue || hrs < 1;
  return {
    ms, frac, label, overdue,
    color:  hot ? 'var(--qs-danger)' : 'var(--qs-text)',
    tint:   hot ? 'var(--qs-danger-subtle)' : 'var(--qs-elevated)',
    border: hot ? 'var(--qs-danger-border)' : 'var(--qs-border)',
    track:  'var(--qs-border)',
  };
}

// Shared 1s heartbeat so every live timer on the page ticks in lockstep with a
// single interval, instead of one timer per row.
function useTick(intervalMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(n => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export default function ServiceBatchPage() {
  const { data: employee } = useCurrentEmployee();
  const agencyId = employee?.org_id;
  const employeeId = employee?.id;
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const customersBase = useLocation().pathname.startsWith('/my') ? '/my/customers' : '/agency/customers';

  const [scope, setScope] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // How the open batch is ordered. 'type' keeps the default lane-grouped view
  // (work-order); the others flatten into a single ordered list.
  const [sortBy, setSortBy] = useState('type');
  const { groups, tasks, overdue, isLoading } = useServiceTasks(agencyId, { scope, employeeId });

  // Flat, sorted list for the non-grouped sort modes. 'overdue' floats the most
  // time-critical (least SLA left) to the top; created sorts are by log time.
  const sortedTasks = useMemo(() => {
    const arr = [...tasks];
    if (sortBy === 'created_desc') return arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (sortBy === 'created_asc') return arr.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    if (sortBy === 'overdue') return arr.sort((a, b) => (slaMsLeft(a) ?? Infinity) - (slaMsLeft(b) ?? Infinity));
    return arr;
  }, [tasks, sortBy]);

  // Recently completed tasks — the "Done" view, so a cleared task is visible
  // (and auditable) instead of just vanishing from the batch.
  const { data: doneTasks = [] } = useQuery({
    queryKey: ['service_tasks_done', agencyId],
    enabled: !!agencyId && showDone,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 14);
      const { data, error } = await supabase.from('service_tasks').select('*')
        .eq('agency_id', agencyId).eq('status', 'done')
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const createTask = useCreateServiceTask();
  const updateTask = useUpdateServiceTask();

  // Flat, most-overdue-first list for the Overdue view. Parked tasks stay out
  // until their wait blows past the cap, then they resurface here too.
  const overdueTasks = useMemo(() =>
    tasks.filter(t => { if (t.status === 'blocked' && !isParkExpired(t)) return false; const ms = slaMsLeft(t); return ms != null && ms < 0; })
         .sort((a, b) => (slaMsLeft(a) ?? 0) - (slaMsLeft(b) ?? 0)),
  [tasks]);

  // Resolve ids → names for "logged by" / assignee on each task. Employees power
  // "logged by" (created_by_id is always an employee); the assignable-members
  // list is the full active roster — incl. sales producers and unlicensed staff
  // with a membership but no employee row — so they can be assigned tasks too.
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const { data: assignable = [] } = useAssignableMembers(agencyId);
  // The Expected-Callbacks strip is a front-desk INBOUND tool. Hide it until the
  // agency actually has a front desk (an active unlicensed member); it auto-
  // appears once one is hired, and can't confuse a no-front-desk shop until then.
  const hasFrontDesk = employees.some(e => (e.roles || []).includes('unlicensed'));
  const empName = useMemo(() => {
    const m = {};
    for (const e of employees) m[e.id] = e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim();
    for (const a of assignable) m[a.id] = a.name; // includes sales/unlicensed members
    return m;
  }, [employees, assignable]);
  function assign(id, toId) {
    updateTask.mutate({ id, updates: { assigned_to_id: toId || null } });
  }

  const [showAdd, setShowAdd] = useState(false);
  // Open a task in the detail modal (full attempt history + all actions) when
  // its card is clicked.
  const [openTaskId, setOpenTaskId] = useState(null);

  // Realtime — a task logged by the front desk (or another rep) shows up live
  // while the batch is open, instead of waiting for a refetch.
  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`service-tasks-${agencyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'service_tasks',
        filter: `agency_id=eq.${agencyId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['service_tasks'] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [agencyId, queryClient]);

  const laneCounts = useMemo(() => {
    const c = { licensed: 0, portal: 0, clerical: 0 };
    for (const t of tasks) {
      const lane = TASK_TYPE_MAP[t.task_type]?.lane;
      if (lane) c[lane] += 1;
    }
    return c;
  }, [tasks]);

  function markDone(id, completionNote) {
    updateTask.mutate({
      id,
      updates: { status: 'done', completed_by_id: employeeId, completion_note: completionNote || null },
    });
  }

  if (!employee) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.servicebatchpage.d13a01">Service Batch</T></h1>
        <div style={{ marginTop: 16, padding: 20, borderRadius: 10, background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)', color: 'var(--qs-dim)', fontSize: 14, maxWidth: 520 }}>
          <T k="pages.servicebatchpage.3b88db">You don't have a rep workspace set up. Open</T> <strong><T k="pages.servicebatchpage.a8e1b4">Settings → Profile</T></strong> <T k="pages.servicebatchpage.e028d0">to start receiving cases and service tasks.</T>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', margin: 0 }}>
            <T k="pages.servicebatchpage.d13a01">Service Batch</T>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 2 }}>
            <T k="pages.servicebatchpage.58d13b">Clear admin work in one protected block · grouped by type, sorted by due date</T>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{
            flexShrink: 0, cursor: 'pointer', border: '1px solid var(--qs-border)',
            background: showAdd ? 'var(--qs-card)' : 'var(--qs-info)', color: showAdd ? 'var(--qs-text)' : '#fff',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {showAdd ? <T k="pages.servicebatchpage.bbfa77">{'Close'}</T> : <T k="pages.servicebatchpage.c8c8d7">{'+ Log Task'}</T>}
        </button>
      </div>

      {showAdd && (
        <AddTaskForm
          agencyId={agencyId}
          busy={createTask.isPending}
          error={createTask.isError ? (createTask.error?.message || 'Could not save the task') : null}
          onSubmit={(t) => createTask.mutate({ agencyId, ...t }, { onSuccess: () => setShowAdd(false) })}
        />
      )}

      {hasFrontDesk && <ExpectedCallbacks agencyId={agencyId} />}

      <CompletionPace agencyId={agencyId} />

      {/* Scope filter — route the licensed lane to the rep it's assigned to */}
      <div style={{ display: 'flex', gap: 6, margin: '14px 0 0', flexWrap: 'wrap' }}>
        {SCOPES.map(s => (
          <button key={s.value} onClick={() => setScope(s.value)} style={{
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            borderRadius: 999, padding: '5px 14px', border: '1px solid',
            borderColor: scope === s.value ? 'var(--qs-info)' : 'var(--qs-border)',
            background: scope === s.value ? 'var(--qs-info)' : 'var(--qs-card)',
            color: scope === s.value ? '#fff' : 'var(--qs-muted)',
          }}>{s.label}</button>
        ))}
        {/* Sort — group by type (work-order) or flatten by log time / urgency */}
        <label title="Sort the open batch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 700, color: 'var(--qs-muted)' }}>
          <span style={{ opacity: 0.8 }}><T k="pages.servicebatchpage.6b46ae">Sort</T></span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            borderRadius: 999, padding: '5px 12px', border: '1px solid var(--qs-border)',
            background: 'var(--qs-card)', color: sortBy === 'type' ? 'var(--qs-muted)' : 'var(--qs-bright)',
          }}>
            <option value="type">By type</option>
            <option value="overdue">Most overdue first</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
          </select>
        </label>
        {/* Overdue — pull up only breached tasks, most overdue first */}
        <button onClick={() => { setOverdueOnly(v => !v); setShowDone(false); }} style={{
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          borderRadius: 999, padding: '5px 14px', border: '1px solid', marginLeft: 'auto',
          borderColor: overdueOnly ? 'var(--qs-danger)' : (overdue > 0 ? 'var(--qs-danger-border)' : 'var(--qs-border)'),
          background: overdueOnly ? 'var(--qs-danger)' : 'var(--qs-card)',
          color: overdueOnly ? '#fff' : (overdue > 0 ? 'var(--qs-danger)' : 'var(--qs-muted)'),
        }}><T k="pages.servicebatchpage.748b5d">⚠ Overdue (</T>{overdue})</button>
        {/* Done — recently completed tasks (last 14 days) */}
        <button onClick={() => { setShowDone(v => !v); setOverdueOnly(false); }} style={{
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          borderRadius: 999, padding: '5px 14px', border: '1px solid',
          borderColor: showDone ? 'var(--qs-info)' : 'var(--qs-border)',
          background: showDone ? 'var(--qs-info)' : 'var(--qs-card)',
          color: showDone ? '#fff' : 'var(--qs-muted)',
        }}><T k="pages.servicebatchpage.2f68af">✓ Done</T></button>
      </div>

      {/* Lane summary — the work-order for the block */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {LANES.map((lane, i) => (
          <div key={lane.value} title={lane.hint} style={{
            flex: 1, background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {i + 1}. {lane.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--qs-bright)', marginTop: 4 }}>
              {laneCounts[lane.value]}
            </div>
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <div style={{
          background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--qs-danger)', fontWeight: 600,
        }}>
          ⏰ {overdue} {overdue === 1 ? <T k="pages.servicebatchpage.3d5deb">{'task has'}</T> : <T k="pages.servicebatchpage.2ef775">{'tasks have'}</T>} <T k="pages.servicebatchpage.eccf1b">been waiting more than a day — let's clear</T> {overdue === 1 ? <T k="pages.servicebatchpage.6c5522">{'it'}</T> : <T k="pages.servicebatchpage.98910a">{'them'}</T>} <T k="pages.servicebatchpage.1b242e">first.</T>
        </div>
      )}

      <ServiceActivityPanel agencyId={agencyId} empName={empName} />

      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 14 }}><T k="pages.servicebatchpage.5f02f0">Loading…</T></div>
      ) : showDone ? (
        doneTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--qs-elevated)',
            borderRadius: 10, border: '1px solid var(--qs-border)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.servicebatchpage.1ea90b">Nothing completed yet</T></div>
            <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}><T k="pages.servicebatchpage.681dbc">No tasks marked done in the last 14 days.</T></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 2 }}>{doneTasks.length} <T k="pages.servicebatchpage.4388d5">completed · last 14 days</T></div>
            {doneTasks.map(task => {
              const cfg = TASK_TYPE_MAP[task.task_type] || { label: task.task_type, icon: '📌' };
              return (
                <div key={task.id} style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderLeft: '3px solid var(--qs-success)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{cfg.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      ...NEUTRAL_CHIP }}>{cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)', textDecoration: 'line-through', opacity: 0.85 }}>{task.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--qs-dim)' }}>
                      ✓ {empName[task.completed_by_id] || <T k="pages.servicebatchpage.bc7819">{'Unknown'}</T>} · {fmtShortDate(task.completed_at)}
                    </span>
                  </div>
                  {(task.customer_name || task.policy_no) && (
                    <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginTop: 4 }}>
                      {task.customer_name || '—'}{task.policy_no ? ` · ${task.policy_no}` : ''}
                    </div>
                  )}
                  {task.completion_note && (
                    <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4, fontStyle: 'italic' }}>“{task.completion_note}”</div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : overdueOnly ? (
        overdueTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--qs-elevated)',
            borderRadius: 10, border: '1px solid var(--qs-border)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.servicebatchpage.70a567">No overdue tasks</T></div>
            <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}><T k="pages.servicebatchpage.0769b7">Everything's within the SLA.</T></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdueTasks.map(task => (
              <TaskRow key={task.id} task={task}
                agencyId={agencyId} empName={empName} employees={assignable}
                onAssign={(toId) => assign(task.id, toId)}
                onCustomer={(t) => navigate(t.household_id ? `${customersBase}/${t.household_id}` : `${customersBase}?q=${encodeURIComponent(t.customer_name || '')}`)}
                onOpen={() => setOpenTaskId(task.id)}
                onDone={(note) => markDone(task.id, note)} />
            ))}
          </div>
        )
      ) : sortBy !== 'type' ? (
        sortedTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--qs-elevated)',
            borderRadius: 10, border: '1px solid var(--qs-border)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.servicebatchpage.430653">Service queue is clear</T></div>
            <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>
              <T k="pages.servicebatchpage.68a007">No open admin tasks in this view. Log one with “+ Log task” as calls come in.</T>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 2 }}>
              {sortedTasks.length} <T k="pages.servicebatchpage.8c4526">open ·</T> {sortBy === 'overdue' ? <T k="pages.servicebatchpage.5896e9">{'most overdue first'}</T>
                : sortBy === 'created_desc' ? <T k="pages.servicebatchpage.a21da8">{'newest first'}</T> : <T k="pages.servicebatchpage.b560d3">{'oldest first'}</T>}
            </div>
            {sortedTasks.map(task => (
              <TaskRow key={task.id} task={task}
                agencyId={agencyId} empName={empName} employees={assignable}
                onAssign={(toId) => assign(task.id, toId)}
                onCustomer={(t) => navigate(t.household_id ? `${customersBase}/${t.household_id}` : `${customersBase}?q=${encodeURIComponent(t.customer_name || '')}`)}
                onOpen={() => setOpenTaskId(task.id)}
                onDone={(note) => markDone(task.id, note)} />
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--qs-elevated)',
          borderRadius: 10, border: '1px solid var(--qs-border)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.servicebatchpage.430653">Service queue is clear</T></div>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>
            <T k="pages.servicebatchpage.68a007">No open admin tasks in this view. Log one with “+ Log task” as calls come in.</T>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(group => (
            <div key={group.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{group.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)' }}>{group.label}</span>
                <span style={{ fontSize: 12, color: 'var(--qs-muted)' }}>· {group.tasks.length}</span>
                {LANE_MAP[group.lane]?.licensed && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    ...NEUTRAL_CHIP, letterSpacing: '0.05em' }}><T k="pages.servicebatchpage.565523">LICENSED</T></span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task}
                    agencyId={agencyId} empName={empName} employees={assignable}
                    onAssign={(toId) => assign(task.id, toId)}
                    onCustomer={(t) => navigate(t.household_id ? `${customersBase}/${t.household_id}` : `${customersBase}?q=${encodeURIComponent(t.customer_name || '')}`)}
                    onOpen={() => setOpenTaskId(task.id)}
                    onDone={(note) => markDone(task.id, note)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openTaskId && (
        <ServiceTaskDetailModal
          taskId={openTaskId}
          agencyId={agencyId}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['service_tasks'] })}
        />
      )}
    </div>
  );
}

// Principal's "is the desk being worked today" panel — per-person attempts,
// active load, cleared count, and median time-to-done. Collapsed by default.
function ServiceActivityPanel({ agencyId, empName }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: byRep = {} } = useServiceActivity(agencyId, today);
  const [open, setOpen] = useState(false);
  const rows = Object.entries(byRep)
    .map(([id, r]) => ({ id, name: empName[id] || 'Unknown', ...r }))
    .filter(r => r.attempts || r.cleared || r.inProgress)
    .sort((a, b) => (b.attempts + b.cleared) - (a.attempts + a.cleared));
  if (rows.length === 0) return null;
  const dur = ms => { const h = Math.floor(ms / 3600000); const m = Math.round((ms % 3600000) / 60000); return h ? `${h}h ${m}m` : `${m}m`; };
  const totAtt = rows.reduce((s, r) => s + r.attempts, 0);
  const totClr = rows.reduce((s, r) => s + r.cleared, 0);
  const th = { textAlign: 'left', fontWeight: 700, color: 'var(--qs-subtle)', padding: '4px 8px' };
  const td = { padding: '5px 8px', color: 'var(--qs-text)' };
  return (
    <div style={{ marginBottom: 16, border: '1px solid var(--qs-border)', borderRadius: 10, background: 'var(--qs-elevated)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', background: 'none', border: 'none', padding: '11px 14px', cursor: 'pointer',
        fontFamily: 'inherit', color: 'var(--qs-bright)' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}><T k="pages.servicebatchpage.3754bb">📊 Team Activity Today</T></span>
        <span style={{ fontSize: 12, color: 'var(--qs-muted)' }}>{totAtt} <T k="pages.servicebatchpage.1db222">attempt</T>{totAtt === 1 ? '' : 's'} · {totClr} <T k="pages.servicebatchpage.b04ea2">cleared ·</T> {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 10px 12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}><T k="pages.servicebatchpage.40bed7">Person</T></th><th style={th}><T k="pages.servicebatchpage.7ba3b8">Attempts</T></th><th style={th}><T k="pages.servicebatchpage.94c326">Reached</T></th>
              <th style={th}><T k="pages.servicebatchpage.b6e0b0">In Progress</T></th><th style={th}><T k="pages.servicebatchpage.a3b087">Cleared</T></th><th style={th}><T k="pages.servicebatchpage.699633">Median Time</T></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={td}>{r.attempts}</td>
                  <td style={td}>{r.reached}</td>
                  <td style={td}>{r.inProgress}</td>
                  <td style={td}>{r.cleared}</td>
                  <td style={td}>{r.medianMs ? dur(r.medianMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, agencyId, empName = {}, employees = [], onAssign, onCustomer, onOpen, onDone }) {
  const prio = PRIORITY_BADGE[task.priority];
  const product = productShort(task.product);
  const inProgress = task.status === 'in_progress';
  const needsNote = NOTE_REQUIRED_TYPES.has(task.task_type);

  // Treat as waiting only while the park is within the cap — past it the task
  // has resurfaced, so the body should read active to match the live timer.
  const waiting = task.status === 'blocked' && !isParkExpired(task);
  // Hard to reach: hit the attempt cap and still never actually reached them —
  // time to send the final notice and close it out rather than keep dialing.
  const hardToReach = (task.attempt_count || 0) >= ATTEMPT_CAP && task.last_attempt_result && task.last_attempt_result !== 'reached';

  const { data: me } = useCurrentEmployee();
  const logAttempt = useLogServiceTaskAttempt();
  const setWaiting = useSetServiceTaskWaiting();
  const setFollowUp = useSetServiceTaskFollowUp();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [att, setAtt] = useState({ method: 'phone', result: 'left_voicemail', note: '', followUp: '', waiting: false });

  function submitAttempt() {
    if (logAttempt.isPending) return;
    logAttempt.mutate(
      { taskId: task.id, agencyId, employeeId: me?.id ?? null, method: att.method, result: att.result,
        note: att.note, prevCount: task.attempt_count ?? 0, prevStatus: task.status, task,
        followUpAt: att.followUp ? new Date(att.followUp).toISOString() : undefined, waiting: att.waiting },
      { onSuccess: () => { setLogging(false); setAtt({ method: 'phone', result: 'left_voicemail', note: '', followUp: '', waiting: false }); } }
    );
  }

  function handleDone() {
    if (needsNote) { setConfirming(true); return; }
    onDone(null);
  }

  // Give-up path: after the attempt cap with no contact, the rep sends the final
  // "we tried to reach you" email themselves, then closes the task as
  // unreachable — leaving a standardized audit note instead of a silent drop.
  function handleFinalNotice() {
    const n = (task.attempt_count || 0);
    onDone(`Final notice sent — unreachable after ${n} attempt${n === 1 ? '' : 's'}`);
  }

  return (
    <div style={{
      background: inProgress ? 'var(--qs-info-subtle)' : 'var(--qs-elevated)',
      border: '1px solid', borderColor: inProgress ? 'var(--qs-info-border)' : 'var(--qs-border)',
      borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'stretch',
    }}>
      {/* Content — click anywhere (outside the controls below) to open the
          task's full detail + attempt history in a modal. */}
      <div onClick={onOpen} title="Open task details"
        style={{ flex: 1, minWidth: 0, padding: '16px 18px', cursor: onOpen ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          {prio && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: prio.background, border: prio.border, color: prio.color, letterSpacing: '0.05em' }}>{prio.label}</span>
          )}
          {product && (
            <span title="Line of business" style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px',
              borderRadius: 4, ...NEUTRAL_CHIP, color: 'var(--qs-text)',
              letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace" }}>{product}</span>
          )}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)' }}>{task.title}</span>
          {waiting && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-muted)' }}>
              <T k="pages.servicebatchpage.1ea981">⏸️ WAITING ON CUSTOMER</T>
            </span>
          )}
          {hardToReach && (
            <span title="3+ attempts, never reached — try another channel or escalate"
              style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                ...NEUTRAL_CHIP, color: 'var(--qs-text)' }}>
              <T k="pages.servicebatchpage.d40404">⚠ HARD TO REACH</T>
            </span>
          )}
        </div>

        {(task.customer_name || task.policy_no) && (
          <div style={{ fontSize: 12.5, color: 'var(--qs-muted)', marginBottom: 4 }}>
            {task.customer_name && (
              <button onClick={e => { e.stopPropagation(); onCustomer?.(task); }} title="Open customer"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, color: 'var(--qs-info)', fontWeight: 600 }}>
                {task.customer_name}{task.household_id ? ' ↗' : ''}
              </button>
            )}
            {task.customer_name && task.policy_no ? ' · ' : ''}
            {(() => {
              const pols = (task.policy_nos && task.policy_nos.length) ? task.policy_nos
                : (task.policy_no ? [task.policy_no] : []);
              return pols.length
                ? <span style={{ fontFamily: "'DM Mono', monospace" }}>{pols.join(' · ')}</span>
                : null;
            })()}
          </div>
        )}

        {task.detail && (
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 4, lineHeight: 1.5 }}>{task.detail}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap',
          fontSize: 11, color: 'var(--qs-subtle)' }}>
          <span><T k="pages.servicebatchpage.4adcbd">📝 Logged by</T> {empName[task.created_by_id] || <T k="pages.servicebatchpage.bc7819">{'Unknown'}</T>} · {fmtShortDate(task.created_at)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>👤</span>
            <select value={task.assigned_to_id || ''} onClick={e => e.stopPropagation()} onChange={e => onAssign?.(e.target.value)}
              style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 6,
                color: 'var(--qs-dim)', fontSize: 11, padding: '2px 4px', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{empName[e.id]}</option>)}
            </select>
          </span>
        </div>

        {/* Last contact attempt — so the team sees the task is being worked */}
        {task.attempt_count > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--qs-subtle)', display: 'flex',
            gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--qs-dim)' }}>
              📞 {task.attempt_count} <T k="pages.servicebatchpage.1db222">attempt</T>{task.attempt_count > 1 ? 's' : ''}
            </span>
            {task.last_attempt_result && (
              <span><T k="pages.servicebatchpage.151615">· last:</T> {TASK_ATTEMPT_RESULT_MAP[task.last_attempt_result] || task.last_attempt_result}
                {task.last_attempt_at ? ` · ${new Date(task.last_attempt_at).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</span>
            )}
          </div>
        )}

        {/* Next follow-up — set after a voicemail so it resurfaces when due */}
        {task.follow_up_at && (
          <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700,
            color: new Date(task.follow_up_at) <= new Date() ? 'var(--qs-danger)' : 'var(--qs-dim)',
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span><T k="pages.servicebatchpage.1a534c">⏰ Follow up</T> {new Date(task.follow_up_at) <= new Date() ? <T k="pages.servicebatchpage.1beefa">{'due ·'}</T> : '·'} {new Date(task.follow_up_at).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <button onClick={e => { e.stopPropagation(); setFollowUp.mutate({ id: task.id, followUpAt: null }); }}
              style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}><T k="pages.servicebatchpage.01bc6f">Clear</T></button>
          </div>
        )}

        {/* Actions */}
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <CopyButton getText={() => formatTaskForAllstate(task)} title="Copy for Allstate" />
          <button onClick={() => setLogging(v => !v)} style={btnStyle('var(--qs-card)', 'var(--qs-dim)')}><T k="pages.servicebatchpage.492b72">📞 Log Call</T></button>
          {waiting
            ? <button onClick={() => setWaiting.mutate({ id: task.id, waiting: false, task })} style={btnStyle('var(--qs-card)', 'var(--qs-text)')}><T k="pages.servicebatchpage.d4529a">▶ Resume</T></button>
            : <button onClick={() => setWaiting.mutate({ id: task.id, waiting: true, task })} style={btnStyle('var(--qs-card)', 'var(--qs-dim)')}><T k="pages.servicebatchpage.08ecb1">⏸ Wait on Customer</T></button>}
          {hardToReach && (
            <button onClick={handleFinalNotice}
              title={`Sent the final email after ${ATTEMPT_CAP}+ tries? Close it out as unreachable.`}
              style={btnStyle('var(--qs-card)', 'var(--qs-text)')}><T k="pages.servicebatchpage.cc7aac">✉ Final Notice → Close</T></button>
          )}
          <button onClick={handleDone} style={btnStyle('var(--qs-info)', '#fff')}><T k="pages.servicebatchpage.f92965">Done</T></button>
        </div>

        {logging && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={att.method} onChange={e => setAtt(a => ({ ...a, method: e.target.value }))}
              style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
                padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
              {TASK_ATTEMPT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={att.result} onChange={e => setAtt(a => ({ ...a, result: e.target.value }))}
              style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
                padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', cursor: 'pointer' }}>
              {TASK_ATTEMPT_RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input value={att.note} onChange={e => setAtt(a => ({ ...a, note: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') submitAttempt(); }}
              placeholder="Note (optional)"
              style={{ flex: 1, minWidth: 140, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }} />
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Quick follow-up — N days from now">
              {FOLLOW_UP_QUICK_DAYS.map(days => (
                <button key={days} type="button" onClick={() => setAtt(a => ({ ...a, followUp: followUpInDays(days) }))}
                  style={{ cursor: 'pointer', border: '1px solid var(--qs-border)', background: 'var(--qs-card)',
                    color: 'var(--qs-dim)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}>
                  +{days}d
                </button>
              ))}
            </span>
            <input type="datetime-local" value={att.followUp} onChange={e => setAtt(a => ({ ...a, followUp: e.target.value }))}
              title="Schedule the next try" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--qs-text)', fontFamily: 'inherit' }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--qs-dim)', cursor: 'pointer' }}>
              <input type="checkbox" checked={att.waiting} onChange={e => setAtt(a => ({ ...a, waiting: e.target.checked }))} />
              <T k="pages.servicebatchpage.ed68d8">Waiting on customer</T>
            </label>
            <button onClick={submitAttempt} disabled={logAttempt.isPending} style={btnStyle('var(--qs-info)', '#fff')}>
              {logAttempt.isPending ? <T k="pages.servicebatchpage.89805f">{'Logging…'}</T> : <T k="pages.servicebatchpage.8bf95e">{'Log'}</T>}
            </button>
            <button onClick={() => setLogging(false)} style={btnStyle('var(--qs-card)', 'var(--qs-muted)')}><T k="pages.servicebatchpage.ea4788">Cancel</T></button>
          </div>
        )}

        {confirming && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input autoFocus value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && note.trim()) onDone(note.trim()); }}
              placeholder="What was done? (required for billing/coverage/premium)"
              style={{ flex: 1, minWidth: 200, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }} />
            <button onClick={() => note.trim() && onDone(note.trim())} disabled={!note.trim()}
              style={btnStyle(note.trim() ? 'var(--qs-info)' : 'var(--qs-card)', note.trim() ? '#fff' : 'var(--qs-muted)')}>
              <T k="pages.servicebatchpage.70d9be">Confirm</T>
            </button>
            <button onClick={() => { setConfirming(false); setNote(''); }} style={btnStyle('var(--qs-card)', 'var(--qs-muted)')}>
              <T k="pages.servicebatchpage.ea4788">Cancel</T>
            </button>
          </div>
        )}
      </div>

      {/* Full-height live SLA timer — far right, ticks to the second */}
      <SlaTimer task={task} />
    </div>
  );
}

// Live, self-contained SLA timer. Owns its own 1s tick so only this panel
// re-renders each second, not the whole task body. A conic progress ring fills
// as the SLA window burns down and the digits count to the second — the agency
// watches these complete fast, so the clock is the loudest thing on the row.
function SlaTimer({ task }) {
  useTick(1000);
  // Parked 'waiting on customer' → the clock is paused; show that instead of a
  // countdown so the row doesn't look neglected. Once the wait blows past the
  // cap the task resurfaces, so we stop showing the pause and fall through to
  // the live (now-overdue) countdown below.
  if (task?.status === 'blocked' && !isParkExpired(task)) {
    const parked = parkedBusinessMs(task);
    const untilBack = Math.max(0, PARK_CAP_MS - parked);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, minWidth: 132, padding: '0 16px', textAlign: 'center',
        background: 'var(--qs-elevated)', borderLeft: '1px solid var(--qs-border)', color: 'var(--qs-muted)' }}>
        <div style={{ fontSize: 18 }}>⏸️</div>
        <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}><T k="pages.servicebatchpage.5706de">Waiting</T><br/><T k="pages.servicebatchpage.2c9439">on customer</T></div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>
          <T k="pages.servicebatchpage.8fc4a7">parked</T> {fmtDur(parked)}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--qs-subtle)' }} title="Auto-resurfaces into the queue if still unanswered">
          <T k="pages.servicebatchpage.f5816b">back in</T> {fmtDur(untilBack)}
        </div>
      </div>
    );
  }
  const sla = slaState(task);
  if (!sla) {
    return <div style={{ minWidth: 132, borderLeft: '1px solid var(--qs-border)' }} />;
  }
  const pct = Math.round(sla.frac * 100);
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 8, minWidth: 132, padding: '0 16px', textAlign: 'center',
      background: sla.tint, borderLeft: `1px solid ${sla.border}`, color: sla.color,
    }}>
      <div style={{
        position: 'relative', width: 56, height: 56, borderRadius: '50%',
        background: `conic-gradient(${sla.color} ${pct}%, ${sla.track} ${pct}% 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: sla.overdue ? 'qs-pulse 1.4s ease-in-out infinite' : 'none',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--qs-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>{sla.overdue ? '⚠' : '⏱'}</div>
      </div>
      <div style={{
        fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, letterSpacing: '0.01em',
        fontFamily: "'DM Mono', monospace", fontVariantNumeric: 'tabular-nums',
      }}>{sla.label}</div>
      <style>{'@keyframes qs-pulse{0%,100%{opacity:1}50%{opacity:0.55}}'}</style>
    </div>
  );
}

function btnStyle(bg, color) {
  return {
    cursor: 'pointer', border: '1px solid var(--qs-border)', background: bg, color,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  };
}

// Front-desk callback intake. When a rep leaves a voicemail, the customer is
// flagged "awaiting callback"; when they ring the main line, the front desk
// matches them here (name/phone/rep/reason only — no coverage) and routes a
// callback task to the rep with one click.
function ExpectedCallbacks({ agencyId }) {
  const { data: callbacks = [] } = useExpectedCallbacks(agencyId);
  const logCallback = useLogCallback();
  if (!callbacks.length) return null;

  return (
    <div style={{
      marginTop: 16, border: '1px solid var(--qs-border)', borderRadius: 10,
      background: 'var(--qs-card)', padding: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
        <T k="pages.servicebatchpage.34e119">📞 If one of these customers calls in ·</T> {callbacks.length}
      </div>
      <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--qs-muted)', marginBottom: 10 }}>
        <T k="pages.servicebatchpage.6802f9">A rep left them a voicemail.</T> <strong><T k="pages.servicebatchpage.12e4aa">Only when they call back</T></strong><T k="pages.servicebatchpage.1a7128">, hand the live call to that rep with the button. (Reps see their own scheduled callbacks on their Today page — no routing needed.)</T>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {callbacks.map(cb => (
          <div key={`${cb.case_type}-${cb.case_id}`} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                {cb.customer_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
                {cb.customer_phone || <T k="pages.servicebatchpage.8ae9fc">{'no phone'}</T>} · {cb.reason}
                {cb.rep_name ? <>{" "}<T k="pages.servicebatchpage.c82c70">{"· ask for"}</T>{" "}{cb.rep_name}</> : ''}
              </div>
              {/* How long we've been waiting to hear back + how many tries — so a
                  stale, over-contacted callback is visible, not silently aging. */}
              <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cb.since
                  ? <span><T k="pages.servicebatchpage.f5551f">⏳ waiting</T> {fmtAgo(cb.since)} <T k="pages.servicebatchpage.d8e829">· last tried</T> {fmtShortDate(cb.since)}</span>
                  : <span><T k="pages.servicebatchpage.3d6cbc">⏳ no attempt logged yet</T></span>}
                {cb.attempt_count != null && (
                  <span>· {cb.attempt_count} <T k="pages.servicebatchpage.1db222">attempt</T>{cb.attempt_count === 1 ? '' : 's'}</span>
                )}
              </div>
            </div>
            {cb.customer_phone && (
              <CopyButton getText={() => cb.customer_phone} label="Phone" style={{ padding: '5px 9px' }} />
            )}
            <button
              onClick={() => logCallback.mutate({ caseType: cb.case_type, caseId: cb.case_id })}
              disabled={logCallback.isPending}
              style={btnStyle('var(--qs-info)', '#fff')}
            >
              {cb.rep_name ? <><T k="pages.servicebatchpage.53db8a">{"📞 On the Line →"}</T>{" "}{cb.rep_name.split(' ')[0]}</> : <T k="pages.servicebatchpage.140eeb">{'📞 They Called — Log It'}</T>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function fmtMins(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Completion-pace strip — the curve of how fast service tasks get cleared.
// Each bar is a day's median time-to-done; reps watch this bend downward as the
// live SLA timers push the batch to clear faster. Hidden until there's data.
function CompletionPace({ agencyId, days = 14 }) {
  const { data: done = [], isLoading } = useServiceTaskVelocity(agencyId, days);

  const stats = useMemo(() => {
    const byDay = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(new Date()); d.setDate(d.getDate() - i);
      byDay.set(d.toDateString(), { date: d, mins: [] });
    }
    const allMins = [];
    for (const t of done) {
      if (!t.completed_at || !t.created_at) continue;
      // Business minutes only — a task that sat over a closed weekend shouldn't
      // read as a multi-day clear, matching the SLA timer's business-hours clock.
      const mins = businessMsBetween(t.created_at, t.completed_at) / 60000;
      if (!(mins >= 0)) continue;
      allMins.push(mins);
      const b = byDay.get(startOfDay(t.completed_at).toDateString());
      if (b) b.mins.push(mins);
    }
    const buckets = [...byDay.values()].map(b => ({
      date: b.date, count: b.mins.length, median: median(b.mins),
    }));
    const today = byDay.get(startOfDay(new Date()).toDateString());
    const withData = buckets.filter(b => b.median != null);
    const half = Math.floor(withData.length / 2);
    const firstMed = median(withData.slice(0, half).map(b => b.median));
    const lastMed = median(withData.slice(half).map(b => b.median));
    return {
      buckets,
      todayCount: today ? today.mins.length : 0,
      todayMedian: today ? median(today.mins) : null,
      overallMedian: median(allMins),
      trend: (firstMed != null && lastMed != null) ? lastMed - firstMed : null,
      total: allMins.length,
    };
  }, [done, days]);

  if (isLoading || stats.total === 0) return null;

  // Sparkline over days-with-data; faster (lower median) sits lower on the curve.
  const pts = stats.buckets.map((b, i) => ({ x: i, median: b.median })).filter(p => p.median != null);
  const W = 280, H = 44, maxMed = Math.max(1, ...pts.map(p => p.median));
  const X = i => (days <= 1 ? 0 : (i / (days - 1)) * W);
  const Y = m => H - 4 - (m / maxMed) * (H - 8);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.median).toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${X(pts[pts.length - 1].x).toFixed(1)},${H} L${X(pts[0].x).toFixed(1)},${H} Z` : '';

  // Down is good (we got faster): green. Up is slower: amber.
  const trendGood = stats.trend == null ? null : stats.trend <= 0;
  const trendColor = trendGood == null ? 'var(--qs-muted)' : trendGood ? 'var(--qs-success)' : 'var(--qs-text)';

  return (
    <div style={{
      marginTop: 16, borderRadius: 12, padding: '14px 16px',
      background: 'var(--qs-card)',
      border: '1px solid var(--qs-border)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em' }}><T k="pages.servicebatchpage.e04a1a">Completion pace ·</T> {days}d</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--qs-bright)',
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{fmtMins(stats.overallMedian)}</span>
          <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}><T k="pages.servicebatchpage.eb827f">median time to done</T></span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 44, display: 'block' }}>
          <defs>
            <linearGradient id="qs-pace-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--qs-info)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--qs-info)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill="url(#qs-pace-fill)" />}
          {line && <path d={line} fill="none" stroke="var(--qs-info)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />}
          {pts.length === 1 && <circle cx={X(pts[0].x)} cy={Y(pts[0].median)} r="3" fill="var(--qs-info)" />}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--qs-bright)',
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{stats.todayCount}</div>
          <div style={{ fontSize: 10.5, color: 'var(--qs-muted)', marginTop: 3 }}><T k="pages.servicebatchpage.620e27">done today</T></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: trendColor,
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {stats.trend == null ? '—' : `${stats.trend <= 0 ? '▼' : '▲'} ${fmtMins(Math.abs(stats.trend))}`}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--qs-muted)', marginTop: 3 }}><T k="pages.servicebatchpage.3603db">vs. window start</T></div>
        </div>
      </div>
    </div>
  );
}

// Group per-policy autocomplete rows under one customer, so a multi-line
// customer (e.g. auto + home) shows as a single result with a row per policy
// instead of the same name repeated. Suggestions arrive ordered by name.
function groupSuggestionsByCustomer(list) {
  const groups = [];
  const byName = {};
  for (const s of list) {
    const key = (s.customer_name || '').trim().toLowerCase();
    if (byName[key]) { byName[key].policies.push(s); continue; }
    const g = { name: s.customer_name, policies: [s] };
    byName[key] = g;
    groups.push(g);
  }
  return groups;
}

function AddTaskForm({ agencyId, busy, error, onSubmit }) {
  const [taskType, setTaskType] = useState('mortgagee');
  const [product, setProduct] = useState('');
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [priority, setPriority] = useState('normal');
  const [detail, setDetail] = useState('');

  // Directory autocomplete: the focused field drives the search (a name OR a
  // policy #); picking a suggestion fills both fields + the product line.
  const [focused, setFocused] = useState(null); // 'customer' | 'policy' | null
  const term = focused === 'customer' ? customerName : focused === 'policy' ? policyNo : '';
  const { data: suggestions = [] } = usePolicyAutocomplete(agencyId, term);
  function selectSuggestion(s) {
    setCustomerName(s.customer_name);
    setPolicyNo(s.policy_no);
    if (s.product && PRODUCT_MAP[s.product]) setProduct(s.product);
    setFocused(null);
  }

  // Multi-policy: a task can cover several of the customer's policies (e.g. an
  // insurance review across auto + home). The primary policy stays in the field
  // above; these are the extras. We pull the customer's other policies from the
  // same directory search so the rep just clicks to add them.
  const [extraPolicies, setExtraPolicies] = useState([]); // [{ policy_no, product }]
  const [addingPolicy, setAddingPolicy] = useState(false);
  const { data: custPolicies = [] } = usePolicyAutocomplete(agencyId, addingPolicy ? customerName : '');
  const addablePolicies = custPolicies.filter(
    p => p.policy_no !== policyNo && !extraPolicies.some(e => e.policy_no === p.policy_no)
  );
  function addExtraPolicy(p) {
    setExtraPolicies(prev => prev.some(e => e.policy_no === p.policy_no)
      ? prev : [...prev, { policy_no: p.policy_no, product: p.product }]);
  }
  function removeExtraPolicy(pn) {
    setExtraPolicies(prev => prev.filter(e => e.policy_no !== pn));
  }

  // Customer name + policy number identify who the task is for and drive
  // household/policy linking + search, so both are required alongside the title.
  const canSubmit = !!agencyId && title.trim().length > 0
    && customerName.trim().length > 0 && policyNo.trim().length > 0 && !busy;

  function submit() {
    if (!canSubmit) return;
    const policyNos = [policyNo.trim(), ...extraPolicies.map(p => p.policy_no)].filter(Boolean);
    onSubmit({
      taskType,
      product: product || null,
      title: title.trim(),
      customerName: customerName.trim() || null,
      policyNo: policyNo.trim() || null,
      policyNos,
      priority,
      detail: detail.trim() || null,
    });
    setTitle(''); setCustomerName(''); setPolicyNo(''); setDetail(''); setProduct('');
    setExtraPolicies([]); setAddingPolicy(false);
  }

  const input = {
    background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', width: '100%',
  };

  return (
    <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: 16, marginBottom: 4 }}>
      {/* Who it's for goes first — type a name to fill the policy # (or a policy #
          to fill the name) from the directory. */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={lbl}><span><T k="pages.servicebatchpage.ce2660">Customer</T> <span style={{ color: 'var(--qs-danger)' }}>*</span></span>
            <input value={customerName} autoComplete="off"
              onChange={e => { setCustomerName(e.target.value); setFocused('customer'); }}
              onFocus={() => setFocused('customer')}
              onBlur={() => setTimeout(() => setFocused(f => (f === 'customer' ? null : f)), 150)}
              style={input} placeholder="Start typing a name…" />
          </label>
          <label style={lbl}><span><T k="pages.servicebatchpage.c70c2b">Policy #</T> <span style={{ color: 'var(--qs-danger)' }}>*</span></span>
            <input value={policyNo} autoComplete="off"
              onChange={e => { setPolicyNo(e.target.value); setFocused('policy'); }}
              onFocus={() => setFocused('policy')}
              onBlur={() => setTimeout(() => setFocused(f => (f === 'policy' ? null : f)), 150)}
              style={input} placeholder="…or a policy #" />
          </label>
        </div>
        {focused && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
            background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
            maxHeight: 240, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            {groupSuggestionsByCustomer(suggestions).map((grp, gi) => grp.policies.length === 1 ? (
              <button type="button" key={`${grp.policies[0].policy_no}-${gi}`}
                onMouseDown={e => { e.preventDefault(); selectSuggestion(grp.policies[0]); }}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '8px 10px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--qs-elevated)', color: 'var(--qs-text)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{titleCaseName(grp.name)}</span>
                <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace",
                  color: 'var(--qs-muted)', fontSize: 12 }}>
                  {grp.policies[0].policy_no}{grp.policies[0].product ? ` · ${productShort(grp.policies[0].product)}` : ''}
                </span>
              </button>
            ) : (
              <div key={`${grp.name}-${gi}`} style={{ borderBottom: '1px solid var(--qs-elevated)' }}>
                <div style={{ padding: '7px 10px 3px', fontSize: 13, fontWeight: 700, color: 'var(--qs-text)' }}>
                  {titleCaseName(grp.name)}
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)' }}>
                    · {grp.policies.length} <T k="pages.servicebatchpage.94422f">policies</T>
                  </span>
                </div>
                {grp.policies.map((s, i) => (
                  <button type="button" key={`${s.policy_no}-${i}`}
                    onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '6px 10px 6px 20px', background: 'transparent', border: 'none',
                      color: 'var(--qs-text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--qs-muted)', fontSize: 12 }}>
                      {s.policy_no}
                    </span>
                    {s.product && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)' }}>
                        {productShort(s.product)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Also on this task — extra policies for a multi-policy task (e.g. an
          insurance review across auto + home). */}
      {customerName.trim() && policyNo.trim() && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...lbl, marginBottom: 6 }}><T k="pages.servicebatchpage.1a11bd">Also on this task</T> <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}><T k="pages.servicebatchpage.f53d1c">(optional)</T></span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {extraPolicies.map(p => (
              <span key={p.policy_no} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 14, background: 'var(--qs-card)',
                border: '1px solid var(--qs-border)', fontSize: 12 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--qs-text)' }}>{p.policy_no}</span>
                {p.product && <span style={{ color: 'var(--qs-muted)' }}>{productShort(p.product)}</span>}
                <button type="button" onClick={() => removeExtraPolicy(p.policy_no)}
                  style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
              </span>
            ))}
            {!addingPolicy ? (
              <button type="button" onClick={() => setAddingPolicy(true)}
                style={{ padding: '4px 10px', borderRadius: 14, border: '1px dashed var(--qs-border)',
                  background: 'transparent', color: 'var(--qs-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <T k="pages.servicebatchpage.cecf19">+ Add Policy</T>
              </button>
            ) : (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {addablePolicies.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--qs-muted)' }}><T k="pages.servicebatchpage.66026d">No other policies found for this customer.</T></span>
                ) : addablePolicies.map(p => (
                  <button key={p.policy_no} type="button" onClick={() => addExtraPolicy(p)}
                    style={{ padding: '4px 8px', borderRadius: 14, border: '1px solid var(--qs-info)',
                      background: 'var(--qs-info-subtle)', color: 'var(--qs-info)', fontSize: 12, cursor: 'pointer',
                      fontFamily: 'inherit' }}>
                    + {p.policy_no}{p.product ? ` · ${productShort(p.product)}` : ''}
                  </button>
                ))}
                <button type="button" onClick={() => setAddingPolicy(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 12 }}><T k="pages.servicebatchpage.6b2ded">Done</T></button>
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={lbl}><T k="pages.servicebatchpage.deb105">Product</T>
          <select value={product} onChange={e => setProduct(e.target.value)} style={input}>
            <option value="">— Line of business —</option>
            {PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label style={lbl}><T k="pages.servicebatchpage.a1fa27">Type</T>
          <select value={taskType} onChange={e => setTaskType(e.target.value)} style={input}>
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={lbl}><T k="pages.servicebatchpage.502996">Priority</T>
          <select value={priority} onChange={e => setPriority(e.target.value)} style={input}>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}><span><T k="pages.servicebatchpage.2b679f">What's Needed</T> <span style={{ color: 'var(--qs-danger)' }}>*</span></span>
          <input value={title} onChange={e => setTitle(e.target.value)} style={input}
            placeholder="e.g. Update mortgagee to ABC Bank" />
        </label>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}><T k="pages.servicebatchpage.a254c2">Detail</T>
          <input value={detail} onChange={e => setDetail(e.target.value)} style={input} placeholder="Optional notes" />
        </label>
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={submit} disabled={!canSubmit} style={{
          cursor: canSubmit ? 'pointer' : 'not-allowed', border: 'none',
          background: canSubmit ? 'var(--qs-info)' : 'var(--qs-card)', color: canSubmit ? '#fff' : 'var(--qs-muted)',
          borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}>{busy ? <T k="pages.servicebatchpage.56a228">{'Saving…'}</T> : <T k="pages.servicebatchpage.0ed766">{'Add to Batch'}</T>}</button>
      </div>
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--qs-danger)', background: 'var(--qs-danger-subtle)',
          border: '1px solid var(--qs-danger-border)', borderRadius: 8, padding: '8px 10px' }}>
          <T k="pages.servicebatchpage.da1a84">Couldn't save:</T> {error}
        </div>
      )}
    </div>
  );
}

const lbl = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.04em',
};
