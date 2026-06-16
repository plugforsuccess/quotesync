// Service Batch — the Operating Playbook's "Afternoon — SERVICE BATCH" surface.
// Cold service requests (the ones not resolved live on a renewal call) logged as
// service_tasks, grouped by type and sorted by due date so they clear in one
// protected block. Each task copies a paste-ready block for Allstate.

import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees, useAssignableMembers } from '../hooks/useEmployees';
import {
  useServiceTasks, useUpdateServiceTask, useCreateServiceTask,
  useExpectedCallbacks, useLogCallback, useServiceTaskVelocity, slaMsLeft,
  TASK_TYPES, TASK_TYPE_MAP, LANES, LANE_MAP, SCOPES, PRODUCTS, productShort,
  SLA_HOURS,
} from '../hooks/useServiceTasks';
import CopyButton from '../components/CopyButton';
import { formatTaskForAllstate } from '../lib/allstateClipboard';

const fmtShortDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

// Completing one of these without recording what was done loses the audit trail
// the agency cares about most — so a completion note is required.
const NOTE_REQUIRED_TYPES = new Set(['billing', 'coverage', 'premium', 'insurance_review']);

const PRIORITY_BADGE = {
  urgent: { label: 'URGENT', bg: '#EF444433', color: '#FCA5A5' },
  high:   { label: 'HIGH',   bg: '#F59E0B33', color: '#FCD34D' },
  normal: null,
  low:    { label: 'LOW',    bg: '#33415533', color: '#94A3B8' },
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

// 24h SLA countdown from creation — the goal is to clear every service task
// within a day, faster when possible. Tiers carry a real color at every stage
// (no dead grey): healthy emerald → amber as it ages → red in the final hour
// and past breach. `frac` is the share of the 24h window already consumed.
function slaState(createdAt) {
  const ms = slaMsLeft(createdAt);
  if (ms == null) return null;
  const total = SLA_HOURS * 3600000;
  const frac = Math.min(1, Math.max(0, (total - ms) / total));
  const hrs = ms / 3600000;
  let color, label;
  if (ms < 0)        { color = '#F87171'; label = `Overdue ${fmtDur(-ms)}`; }
  else if (hrs < 1)  { color = '#FB7185'; label = `${fmtDur(ms)} left`; }
  else if (hrs < 4)  { color = '#FBBF24'; label = `${fmtDur(ms)} left`; }
  else if (hrs < 12) { color = '#38BDF8'; label = `${fmtDur(ms)} left`; }
  else               { color = '#34D399'; label = `${fmtDur(ms)} left`; }
  return { ms, frac, color, label, overdue: ms < 0 };
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
  const { groups, tasks, overdue, isLoading } = useServiceTasks(agencyId, { scope, employeeId });
  const createTask = useCreateServiceTask();
  const updateTask = useUpdateServiceTask();

  // Flat, most-overdue-first list for the Overdue view.
  const overdueTasks = useMemo(() =>
    tasks.filter(t => { const ms = slaMsLeft(t.created_at); return ms != null && ms < 0; })
         .sort((a, b) => (slaMsLeft(a.created_at) ?? 0) - (slaMsLeft(b.created_at) ?? 0)),
  [tasks]);

  // Resolve ids → names for "logged by" / assignee on each task. Employees power
  // "logged by" (created_by_id is always an employee); the assignable-members
  // list is the full active roster — incl. sales producers and unlicensed staff
  // with a membership but no employee row — so they can be assigned tasks too.
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const { data: assignable = [] } = useAssignableMembers(agencyId);
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
  function claim(id) {
    updateTask.mutate({ id, updates: { status: 'in_progress', assigned_to_id: employeeId } });
  }

  if (!employee) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}>Service Batch</h1>
        <div style={{ marginTop: 16, padding: 20, borderRadius: 10, background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)', color: 'var(--qs-dim)', fontSize: 14, maxWidth: 520 }}>
          You don't have a rep workspace set up. Open <strong>Settings → Profile</strong> to start
          receiving cases and service tasks.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', margin: 0 }}>
            Service Batch
          </h1>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 2 }}>
            Clear admin work in one protected block · grouped by type, sorted by due date
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{
            flexShrink: 0, cursor: 'pointer', border: '1px solid var(--qs-border)',
            background: showAdd ? 'var(--qs-card)' : '#3B82F6', color: showAdd ? 'var(--qs-text)' : '#fff',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {showAdd ? 'Close' : '+ Log task'}
        </button>
      </div>

      {showAdd && (
        <AddTaskForm
          agencyId={agencyId}
          busy={createTask.isPending}
          onSubmit={(t) => createTask.mutate({ agencyId, ...t }, { onSuccess: () => setShowAdd(false) })}
        />
      )}

      <ExpectedCallbacks agencyId={agencyId} />

      <CompletionPace agencyId={agencyId} />

      {/* Scope filter — route the licensed lane to the rep it's assigned to */}
      <div style={{ display: 'flex', gap: 6, margin: '14px 0 0', flexWrap: 'wrap' }}>
        {SCOPES.map(s => (
          <button key={s.value} onClick={() => setScope(s.value)} style={{
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            borderRadius: 999, padding: '5px 14px', border: '1px solid',
            borderColor: scope === s.value ? '#3B82F6' : 'var(--qs-border)',
            background: scope === s.value ? '#3B82F6' : 'var(--qs-card)',
            color: scope === s.value ? '#fff' : 'var(--qs-muted)',
          }}>{s.label}</button>
        ))}
        {/* Overdue — pull up only breached tasks, most overdue first */}
        <button onClick={() => setOverdueOnly(v => !v)} style={{
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          borderRadius: 999, padding: '5px 14px', border: '1px solid', marginLeft: 'auto',
          borderColor: overdueOnly ? '#EF4444' : (overdue > 0 ? '#EF444466' : 'var(--qs-border)'),
          background: overdueOnly ? '#EF4444' : 'var(--qs-card)',
          color: overdueOnly ? '#fff' : (overdue > 0 ? '#F87171' : 'var(--qs-muted)'),
        }}>⚠ Overdue ({overdue})</button>
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
          background: '#EF444411', border: '1px solid #EF444433', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#FCA5A5', fontWeight: 600,
        }}>
          ⚠ {overdue} {overdue === 1 ? 'task is' : 'tasks are'} past the 24h SLA — work these first.
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 14 }}>Loading…</div>
      ) : overdueOnly ? (
        overdueTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--qs-elevated)',
            borderRadius: 10, border: '1px solid var(--qs-border)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}>No overdue tasks</div>
            <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>Everything's within the 24h SLA.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdueTasks.map(task => (
              <TaskRow key={task.id} task={task}
                empName={empName} employees={assignable}
                onAssign={(toId) => assign(task.id, toId)}
                onCustomer={(t) => navigate(t.household_id ? `${customersBase}/${t.household_id}` : `${customersBase}?q=${encodeURIComponent(t.customer_name || '')}`)}
                onDone={(note) => markDone(task.id, note)} onClaim={() => claim(task.id)} />
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--qs-elevated)',
          borderRadius: 10, border: '1px solid var(--qs-border)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>Service queue is clear</div>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>
            No open admin tasks in this view. Log one with “+ Log task” as calls come in.
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
                    background: '#8B5CF622', color: '#C4B5FD', letterSpacing: '0.05em' }}>LICENSED</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task}
                    empName={empName} employees={assignable}
                    onAssign={(toId) => assign(task.id, toId)}
                    onCustomer={(t) => navigate(t.household_id ? `${customersBase}/${t.household_id}` : `${customersBase}?q=${encodeURIComponent(t.customer_name || '')}`)}
                    onDone={(note) => markDone(task.id, note)} onClaim={() => claim(task.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, empName = {}, employees = [], onAssign, onCustomer, onDone, onClaim }) {
  const prio = PRIORITY_BADGE[task.priority];
  const product = productShort(task.product);
  const inProgress = task.status === 'in_progress';
  const needsNote = NOTE_REQUIRED_TYPES.has(task.task_type);

  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  function handleDone() {
    if (needsNote) { setConfirming(true); return; }
    onDone(null);
  }

  return (
    <div style={{
      background: inProgress ? 'rgba(59,130,246,0.06)' : 'var(--qs-elevated)',
      border: '1px solid', borderColor: inProgress ? '#3B82F633' : 'var(--qs-border)',
      borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'stretch',
    }}>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          {prio && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: prio.bg, color: prio.color, letterSpacing: '0.05em' }}>{prio.label}</span>
          )}
          {product && (
            <span title="Line of business" style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px',
              borderRadius: 4, background: '#22D3EE1f', border: '1px solid #22D3EE40', color: '#67E8F9',
              letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace" }}>{product}</span>
          )}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)' }}>{task.title}</span>
        </div>

        {(task.customer_name || task.policy_no) && (
          <div style={{ fontSize: 12.5, color: 'var(--qs-muted)', marginBottom: 4 }}>
            {task.customer_name && (
              <button onClick={() => onCustomer?.(task)} title="Open customer"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, color: '#60A5FA', fontWeight: 600 }}>
                {task.customer_name}{task.household_id ? ' ↗' : ''}
              </button>
            )}
            {task.customer_name && task.policy_no ? ' · ' : ''}
            {task.policy_no && <span style={{ fontFamily: "'DM Mono', monospace" }}>{task.policy_no}</span>}
          </div>
        )}

        {task.detail && (
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 4, lineHeight: 1.5 }}>{task.detail}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap',
          fontSize: 11, color: 'var(--qs-subtle)' }}>
          <span>📝 Logged by {empName[task.created_by_id] || 'Unknown'} · {fmtShortDate(task.created_at)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span>👤</span>
            <select value={task.assigned_to_id || ''} onChange={e => onAssign?.(e.target.value)}
              style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 6,
                color: 'var(--qs-dim)', fontSize: 11, padding: '2px 4px', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{empName[e.id]}</option>)}
            </select>
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <CopyButton getText={() => formatTaskForAllstate(task)} title="Copy for Allstate" />
          {!inProgress && (
            <button onClick={onClaim} style={btnStyle('var(--qs-card)', 'var(--qs-text)')}>Start</button>
          )}
          <button onClick={handleDone} style={btnStyle('#10B981', '#fff')}>Done</button>
        </div>

        {confirming && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input autoFocus value={note} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && note.trim()) onDone(note.trim()); }}
              placeholder="What was done? (required for billing/coverage/premium)"
              style={{ flex: 1, minWidth: 200, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }} />
            <button onClick={() => note.trim() && onDone(note.trim())} disabled={!note.trim()}
              style={btnStyle(note.trim() ? '#10B981' : 'var(--qs-card)', note.trim() ? '#fff' : 'var(--qs-muted)')}>
              Confirm
            </button>
            <button onClick={() => { setConfirming(false); setNote(''); }} style={btnStyle('var(--qs-card)', 'var(--qs-muted)')}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Full-height live SLA timer — far right, ticks to the second */}
      <SlaTimer createdAt={task.created_at} />
    </div>
  );
}

// Live, self-contained SLA timer. Owns its own 1s tick so only this panel
// re-renders each second, not the whole task body. A conic progress ring fills
// as the 24h window burns down and the digits count to the second — the agency
// watches these complete fast, so the clock is the loudest thing on the row.
function SlaTimer({ createdAt }) {
  useTick(1000);
  const sla = slaState(createdAt);
  if (!sla) {
    return <div style={{ minWidth: 132, borderLeft: '1px solid var(--qs-border)' }} />;
  }
  const pct = Math.round(sla.frac * 100);
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 8, minWidth: 132, padding: '0 16px', textAlign: 'center',
      background: `${sla.color}14`, borderLeft: `1px solid ${sla.color}55`, color: sla.color,
    }}>
      <div style={{
        position: 'relative', width: 56, height: 56, borderRadius: '50%',
        background: `conic-gradient(${sla.color} ${pct}%, ${sla.color}22 ${pct}% 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: sla.overdue ? `0 0 0 1px ${sla.color}, 0 0 14px ${sla.color}66` : `0 0 10px ${sla.color}33`,
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
      marginTop: 16, border: '1px solid #F59E0B33', borderRadius: 10,
      background: '#F59E0B0D', padding: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#FBBF24', marginBottom: 10 }}>
        📞 Expected callbacks · {callbacks.length}
        <span style={{ fontWeight: 400, color: 'var(--qs-muted)', marginLeft: 6 }}>
          customers a rep is waiting to hear back from
        </span>
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
                {cb.customer_phone || 'no phone'} · {cb.reason}
                {cb.rep_name ? ` · ask for ${cb.rep_name}` : ''}
              </div>
            </div>
            {cb.customer_phone && (
              <CopyButton getText={() => cb.customer_phone} label="Phone" style={{ padding: '5px 9px' }} />
            )}
            <button
              onClick={() => logCallback.mutate({ caseType: cb.case_type, caseId: cb.case_id })}
              disabled={logCallback.isPending}
              style={btnStyle('#3B82F6', '#fff')}
            >
              {cb.rep_name ? `Route to ${cb.rep_name.split(' ')[0]}` : 'Log callback'}
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
      const mins = (new Date(t.completed_at) - new Date(t.created_at)) / 60000;
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
  const trendColor = trendGood == null ? 'var(--qs-muted)' : trendGood ? '#34D399' : '#FBBF24';

  return (
    <div style={{
      marginTop: 16, borderRadius: 12, padding: '14px 16px',
      background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(52,211,153,0.05))',
      border: '1px solid var(--qs-border)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em' }}>Completion pace · {days}d</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--qs-bright)',
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{fmtMins(stats.overallMedian)}</span>
          <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>median time to done</span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 44, display: 'block' }}>
          <defs>
            <linearGradient id="qs-pace-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill="url(#qs-pace-fill)" />}
          {line && <path d={line} fill="none" stroke="#34D399" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />}
          {pts.length === 1 && <circle cx={X(pts[0].x)} cy={Y(pts[0].median)} r="3" fill="#34D399" />}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--qs-bright)',
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{stats.todayCount}</div>
          <div style={{ fontSize: 10.5, color: 'var(--qs-muted)', marginTop: 3 }}>done today</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: trendColor,
            fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {stats.trend == null ? '—' : `${stats.trend <= 0 ? '▼' : '▲'} ${fmtMins(Math.abs(stats.trend))}`}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--qs-muted)', marginTop: 3 }}>vs. window start</div>
        </div>
      </div>
    </div>
  );
}

function AddTaskForm({ agencyId, busy, onSubmit }) {
  const [taskType, setTaskType] = useState('mortgagee');
  const [product, setProduct] = useState('');
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [priority, setPriority] = useState('normal');
  const [detail, setDetail] = useState('');

  // Customer name + policy number identify who the task is for and drive
  // household/policy linking + search, so both are required alongside the title.
  const canSubmit = !!agencyId && title.trim().length > 0
    && customerName.trim().length > 0 && policyNo.trim().length > 0 && !busy;

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      taskType,
      product: product || null,
      title: title.trim(),
      customerName: customerName.trim() || null,
      policyNo: policyNo.trim() || null,
      priority,
      detail: detail.trim() || null,
    });
    setTitle(''); setCustomerName(''); setPolicyNo(''); setDetail(''); setProduct('');
  }

  const input = {
    background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', width: '100%',
  };

  return (
    <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: 16, marginBottom: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Who it's for goes first — it's what links the task to a household. */}
        <label style={{ ...lbl, gridColumn: '1 / -1' }}><span>Customer <span style={{ color: '#F87171' }}>*</span></span>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={input} placeholder="Customer name" />
        </label>
        <label style={lbl}><span>Policy # <span style={{ color: '#F87171' }}>*</span></span>
          <input value={policyNo} onChange={e => setPolicyNo(e.target.value)} style={input} placeholder="Policy number" />
        </label>
        <label style={lbl}>Product
          <select value={product} onChange={e => setProduct(e.target.value)} style={input}>
            <option value="">— Line of business —</option>
            {PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label style={lbl}>Type
          <select value={taskType} onChange={e => setTaskType(e.target.value)} style={input}>
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={lbl}>Priority
          <select value={priority} onChange={e => setPriority(e.target.value)} style={input}>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}><span>What's needed <span style={{ color: '#F87171' }}>*</span></span>
          <input value={title} onChange={e => setTitle(e.target.value)} style={input}
            placeholder="e.g. Update mortgagee to ABC Bank" />
        </label>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}>Detail
          <input value={detail} onChange={e => setDetail(e.target.value)} style={input} placeholder="Optional notes" />
        </label>
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={submit} disabled={!canSubmit} style={{
          cursor: canSubmit ? 'pointer' : 'not-allowed', border: 'none',
          background: canSubmit ? '#3B82F6' : 'var(--qs-card)', color: canSubmit ? '#fff' : 'var(--qs-muted)',
          borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}>{busy ? 'Saving…' : 'Add to batch'}</button>
      </div>
    </div>
  );
}

const lbl = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.04em',
};
