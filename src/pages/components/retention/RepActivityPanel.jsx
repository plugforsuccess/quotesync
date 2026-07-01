// RepActivityPanel — monitor rep retention output. Two modes:
//   • By rep   — one rep, day-by-day over the last 14 days.
//   • Daily    — one day, every rep side by side (the daily standup).

import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import { useRepActivity } from '../../../hooks/useRepActivity';
import { useDailyTeamActivity } from '../../../hooks/useDailyTeamActivity';
import { useQueueCoverage } from '../../../hooks/useQueueCoverage';
import { titleCaseName, displayName } from '../../../lib/names';

// Live: when a rep logs a call, saves a case, or completes a task, refresh the
// activity views within seconds — a live action feed, not a manual refresh.
function useLiveActivity(agencyId) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!agencyId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['rep_activity'] });
      qc.invalidateQueries({ queryKey: ['daily_team_activity'] });
    };
    const ch = supabase.channel(`live-activity-${agencyId}`);
    for (const table of ['pending_cancel_attempts', 'renewal_attempts', 'pending_cases', 'renewal_cases', 'service_tasks']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `agency_id=eq.${agencyId}` }, refresh);
    }
    ch.subscribe();
    return () => supabase.removeChannel(ch);
  }, [agencyId, qc]);
}

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
// Right-aligned tabular figures so numeric columns line up down the table.
const NUM = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" };
// Call-outcome color: blue = reached, amber = tried but missed / deferred,
// red = negative, muted = neutral/unknown. (Saves render separately in green.)
function outcomeColor(result) {
  const r = String(result || '').toLowerCase();
  if (/(lost|wrong|disconnect|declin|refus|dead)/.test(r)) return '#F87171';
  if (/(no[_ ]?answer|voicemail|\bvm\b|left|busy|callback|call[_ ]?back|scheduled|snooz)/.test(r)) return '#FBBF24';
  if (/(reach|answered|spoke|contacted|connected)/.test(r)) return '#60A5FA';
  return 'var(--qs-dim)';
}
function localDay(d = new Date()) { return d.toLocaleDateString('en-CA'); }
function dayLabel(k) {
  if (k === localDay()) return 'Today';
  if (k === localDay(new Date(Date.now() - 86400000))) return 'Yesterday';
  return new Date(k + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function empName(e) { return e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(); }

// Cases the rep worked (touched) — saved ones tagged, others show the outcome.
// The customer name links into their full household (all cases, touches, notes).
function WorkedRows({ worked, k, onCustomer }) {
  return worked.map((w, i) => {
    const nm = displayName(w.name);
    return (
    <tr key={`${k}-${i}`} style={{ background: 'var(--qs-elevated)' }}>
      <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
          background: w.kind === 'cancel' ? '#EF444422' : '#3B82F622',
          color: w.kind === 'cancel' ? '#F87171' : '#60A5FA' }}>
          {w.kind === 'cancel' ? 'CANCEL' : 'RENEWAL'}
        </span>
        {nm
          ? <button type="button" onClick={() => onCustomer?.(w.name)} title="Open customer"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, color: '#60A5FA', fontWeight: 600 }}>
              {nm} ↗
            </button>
          : <span style={{ color: 'var(--qs-muted)' }} title="No customer name on this case">—</span>}
        {' · '}
        {w.saved
          ? <span style={{ color: '#34D399', fontWeight: 600 }}>✓ saved{w.premium ? ` · ${fmt$(w.premium)}` : ''}</span>
          : <span style={{ color: outcomeColor(w.result), fontWeight: 600 }}>{(w.result || 'attempt').replace(/_/g, ' ')}</span>}
        {w.note && <span style={{ fontStyle: 'italic', color: 'var(--qs-muted)', marginLeft: 8 }}>“{w.note}”</span>}
      </td>
    </tr>
    );
  });
}

// One-line explainer for the Saves column's "N (Xc/Yr)" coding, shared by both
// timeline tables so the notation isn't a mystery.
function SavesLegend() {
  return (
    <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
      Saves shows the day's total, split as <strong>cancels saved (c)</strong> /{' '}
      <strong>renewals confirmed (r)</strong> — e.g. “1 (1c/0r)” is one save, a rescued cancellation.
      Tap a row to see the cases worked.
    </p>
  );
}

// Service tasks the rep completed that day.
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

// ── By rep: one rep, last 14 days ───────────────────────────────────────────
function RepTimeline({ agencyId, employees }) {
  const navigate = useNavigate();
  const onCustomer = (name) => navigate(`/agency/customers?q=${encodeURIComponent(name)}`);
  const [repId, setRepId] = useState('');
  const [openDay, setOpenDay] = useState(null);
  useEffect(() => {
    if (!repId && employees.length) {
      const svc = employees.find(e => (e.roles || []).some(r => String(r).startsWith('service'))) || employees[0];
      setRepId(svc.id);
    }
  }, [employees, repId]);

  const { data, isLoading } = useRepActivity(agencyId, repId, 14);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={repId} onChange={e => { setRepId(e.target.value); setOpenDay(null); }}
          style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8,
            padding: '7px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }}>
          {employees.map(e => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        {data && (
          <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)' }}>
            last 14 days · <strong style={{ color: '#10B981' }}>{data.totals.saves}</strong> saves ·{' '}
            <strong style={{ color: '#10B981' }}>{fmt$(data.totals.premium)}</strong> · {data.totals.attempts} calls · {data.totals.tasksDone} tasks
          </div>
        )}
      </div>
      {isLoading || !data ? <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div> : (
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Day</th>
            <th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Reached</th>
            <th style={{ textAlign: 'right' }}
              title="Total saves that day, split as cancels saved (c) / renewals confirmed (r) — e.g. 1 (1c/0r)">Saves</th>
            <th style={{ textAlign: 'right' }}>Premium</th><th style={{ textAlign: 'right' }}>Tasks done</th></tr></thead>
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
                    <td style={NUM}>{d.attempts || '—'}</td>
                    <td style={NUM}>{d.reached || '—'}</td>
                    <td style={{ ...NUM, fontWeight: 700, color: saves ? '#10B981' : 'var(--qs-muted)' }}>
                      {saves ? `${saves} (${d.cancelSaves}c/${d.renewalSaves}r)` : '—'}
                    </td>
                    <td style={{ ...NUM, color: d.premium ? '#10B981' : 'var(--qs-muted)' }}>{d.premium ? fmt$(d.premium) : '—'}</td>
                    <td style={NUM}>{d.tasksDone || '—'}</td>
                  </tr>
                  {openDay === d.date && <WorkedRows worked={d.worked} k={d.date} onCustomer={onCustomer} />}
                  {openDay === d.date && <TaskDoneRows tasks={d.tasksList} k={d.date} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {data && <SavesLegend />}
    </>
  );
}

// ── Daily: one day, all reps ────────────────────────────────────────────────
function DailyTeam({ agencyId, employees }) {
  const navigate = useNavigate();
  const onCustomer = (name) => navigate(`/agency/customers?q=${encodeURIComponent(name)}`);
  const [date, setDate] = useState(localDay());
  const [openRep, setOpenRep] = useState(null);
  const { data: byRep = {}, isLoading } = useDailyTeamActivity(agencyId, date);

  const shiftDay = (n) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); setDate(localDay(d)); setOpenRep(null); };
  const rows = employees
    .map(e => ({ e, a: byRep[e.id] }))
    .filter(({ a }) => a) // only reps with activity that day
    .sort((x, y) => ((y.a.cancelSaves + y.a.renewalSaves) - (x.a.cancelSaves + x.a.renewalSaves)) || (y.a.attempts - x.a.attempts));
  const totals = rows.reduce((t, { a }) => ({
    attempts: t.attempts + a.attempts, reached: t.reached + a.reached,
    saves: t.saves + a.cancelSaves + a.renewalSaves, premium: t.premium + a.premium, tasksDone: t.tasksDone + a.tasksDone,
  }), { attempts: 0, reached: 0, saves: 0, premium: 0, tasksDone: 0 });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => shiftDay(-1)} className="btn-ghost" style={{ padding: '6px 10px' }}>‹</button>
        <input type="date" value={date} max={localDay()} onChange={e => { setDate(e.target.value); setOpenRep(null); }}
          style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8,
            padding: '6px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }} />
        <button onClick={() => shiftDay(1)} disabled={date >= localDay()} className="btn-ghost" style={{ padding: '6px 10px' }}>›</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)' }}>{dayLabel(date)}</span>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)' }}>
          team: <strong style={{ color: '#10B981' }}>{totals.saves}</strong> saves · <strong style={{ color: '#10B981' }}>{fmt$(totals.premium)}</strong> · {totals.attempts} calls · {totals.tasksDone} tasks
        </div>
      </div>
      {isLoading ? <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: 'var(--qs-muted)', fontSize: 13 }}>No recorded activity on {dayLabel(date)}.</div> : (
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Rep</th>
            <th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Reached</th>
            <th style={{ textAlign: 'right' }}
              title="Total saves that day, split as cancels saved (c) / renewals confirmed (r) — e.g. 1 (1c/0r)">Saves</th>
            <th style={{ textAlign: 'right' }}>Premium</th><th style={{ textAlign: 'right' }}>Tasks done</th></tr></thead>
          <tbody>
            {rows.map(({ e, a }) => {
              const saves = a.cancelSaves + a.renewalSaves;
              const expandable = a.worked.length > 0 || a.tasksList.length > 0;
              return (
                <Fragment key={e.id}>
                  <tr onClick={() => expandable && setOpenRep(openRep === e.id ? null : e.id)}
                    style={{ cursor: expandable ? 'pointer' : 'default' }}>
                    <td style={{ fontWeight: 600 }}>{empName(e)} {expandable ? (openRep === e.id ? '▾' : '▸') : ''}</td>
                    <td style={NUM}>{a.attempts || '—'}</td>
                    <td style={NUM}>{a.reached || '—'}</td>
                    <td style={{ ...NUM, fontWeight: 700, color: saves ? '#10B981' : 'var(--qs-muted)' }}>
                      {saves ? `${saves} (${a.cancelSaves}c/${a.renewalSaves}r)` : '—'}
                    </td>
                    <td style={{ ...NUM, color: a.premium ? '#10B981' : 'var(--qs-muted)' }}>{a.premium ? fmt$(a.premium) : '—'}</td>
                    <td style={NUM}>{a.tasksDone || '—'}</td>
                  </tr>
                  {openRep === e.id && <WorkedRows worked={a.worked} k={e.id} onCustomer={onCustomer} />}
                  {openRep === e.id && <TaskDoneRows tasks={a.tasksList} k={e.id} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <SavesLegend />}
    </>
  );
}

// ── Queue: each rep's assigned queue + how well they're burning it down today ─
function Bar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--qs-elevated)', overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}
function QueueCoverage({ agencyId }) {
  const { data: rows = [], isLoading } = useQueueCoverage(agencyId);
  if (isLoading) return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ color: 'var(--qs-muted)', fontSize: 13 }}>No cases assigned to any rep right now.</div>;
  return (
    <>
      <table>
        <thead><tr>
          <th>Rep</th><th>Queue</th><th>Untouched</th><th>Worked today</th><th>Calls vs target</th><th>Queue coverage</th>
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const cover = r.queue ? Math.round((r.touchedToday / r.queue) * 100) : 0;
            const targetPct = r.target ? Math.round((r.callsToday / r.target) * 100) : 0;
            const hit = r.callsToday >= r.target;
            return (
              <tr key={r.empId}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ fontWeight: 700 }}>{r.queue}</td>
                <td style={{ color: r.untouched ? '#FBBF24' : 'var(--qs-muted)', fontWeight: r.untouched ? 700 : 400 }}>
                  {r.untouched || '—'}{r.overdue ? ` · ${r.overdue} overdue` : ''}
                </td>
                <td style={{ color: r.touchedToday ? '#10B981' : 'var(--qs-muted)', fontWeight: 700 }}>{r.touchedToday || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 44, color: hit ? '#10B981' : 'var(--qs-text)', fontWeight: 600 }}>{r.callsToday}/{r.target}</span>
                    <Bar pct={targetPct} color={hit ? '#10B981' : targetPct >= 50 ? '#3B82F6' : '#F59E0B'} />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 36, color: 'var(--qs-dim)' }}>{cover}%</span>
                    <Bar pct={cover} color={cover >= 80 ? '#10B981' : cover >= 40 ? '#3B82F6' : '#F59E0B'} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
        Queue = active cases assigned to the rep (not snoozed). Untouched = never called; “overdue” = past their deadline
        and never called. Worked today / coverage = distinct cases they've touched today. Calls vs target uses each rep's daily call target.
      </p>
    </>
  );
}

export default function RepActivityPanel({ agencyId }) {
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const [mode, setMode] = useState('queue'); // 'queue' | 'daily' (team) | 'rep'
  useLiveActivity(agencyId);

  const tab = (active) => ({
    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: '1px solid', borderColor: active ? 'var(--qs-info)' : 'var(--qs-border)',
    background: active ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
    color: active ? 'var(--qs-info)' : 'var(--qs-dim)', fontFamily: 'inherit',
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Activity</h3>
        <span title="Updates live as reps work" style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: '#34D399' }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: '#34D399',
            boxShadow: '0 0 0 0 rgba(52,211,153,0.6)', animation: 'pulse 2s infinite' }} />
          LIVE
        </span>
        <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,0.5)}70%{box-shadow:0 0 0 6px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}`}</style>
        <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>
          <button style={tab(mode === 'queue')} onClick={() => setMode('queue')}>Queue — today</button>
          <button style={tab(mode === 'daily')} onClick={() => setMode('daily')}>Daily — team</button>
          <button style={tab(mode === 'rep')} onClick={() => setMode('rep')}>By rep</button>
        </div>
      </div>
      {mode === 'queue' ? <QueueCoverage agencyId={agencyId} />
        : mode === 'daily' ? <DailyTeam agencyId={agencyId} employees={employees} />
        : <RepTimeline agencyId={agencyId} employees={employees} />}
    </div>
  );
}
