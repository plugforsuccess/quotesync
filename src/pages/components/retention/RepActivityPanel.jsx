// RepActivityPanel — monitor rep retention output. Two modes:
//   • By rep   — one rep, day-by-day over the last 14 days.
//   • Daily    — one day, every rep side by side (the daily standup).

import { T } from '../../../components/SiteCopy';
import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import { useRepActivity } from '../../../hooks/useRepActivity';
import { useDailyTeamActivity } from '../../../hooks/useDailyTeamActivity';
import { useQueueCoverage } from '../../../hooks/useQueueCoverage';
import { titleCaseName, displayName } from '../../../lib/names';
import { NEUTRAL_CHIP, SUCCESS_CHIP } from '../../../lib/statusChips';

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
// Call-outcome color: red = negative, plain text = reached, dim = tried but
// missed / deferred / unknown. (Saves render separately in gold.)
function outcomeColor(result) {
  const r = String(result || '').toLowerCase();
  if (/(lost|wrong|disconnect|declin|refus|dead)/.test(r)) return 'var(--qs-danger)';
  if (/(reach|answered|spoke|contacted|connected)/.test(r)) return 'var(--qs-text)';
  return 'var(--qs-dim)';
}
function localDay(d = new Date()) { return d.toLocaleDateString('en-CA'); }
function dayLabel(k) {
  if (k === localDay()) return 'Today';
  if (k === localDay(new Date(Date.now() - 86400000))) return 'Yesterday';
  return new Date(k + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
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
          ...NEUTRAL_CHIP, color: w.kind === 'cancel' ? 'var(--qs-text)' : 'var(--qs-dim)' }}>
          {w.kind === 'cancel' ? <T k="pages.components.retention.repactivitypanel.1507c4">{'CANCEL'}</T> : <T k="pages.components.retention.repactivitypanel.23cbf4">{'RENEWAL'}</T>}
        </span>
        {nm
          ? <button type="button" onClick={() => onCustomer?.(w.name)} title="Open customer"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, color: 'var(--qs-info)', fontWeight: 600 }}>
              {nm} ↗
            </button>
          : <span style={{ color: 'var(--qs-muted)' }} title="No customer name on this case">—</span>}
        {' · '}
        {w.saved
          ? <span style={{ color: 'var(--qs-success)', fontWeight: 600 }}><T k="pages.components.retention.repactivitypanel.a02001">✓ saved</T>{w.premium ? ` · ${fmt$(w.premium)}` : ''}</span>
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
      <T k="pages.components.retention.repactivitypanel.67d015">Saves shows the day's total, split as</T> <strong><T k="pages.components.retention.repactivitypanel.3320bb">cancels saved (c)</T></strong> /{' '}
      <strong><T k="pages.components.retention.repactivitypanel.464cd9">renewals confirmed (r)</T></strong> <T k="pages.components.retention.repactivitypanel.0e8c89">— e.g. “1 (1c/0r)” is one save, a rescued cancellation. Tap a row to see the cases worked.</T>
    </p>
  );
}

// Service tasks the rep completed that day.
function TaskDoneRows({ tasks, k }) {
  return tasks.map((t, i) => (
    <tr key={`${k}-task-${i}`} style={{ background: 'var(--qs-elevated)' }}>
      <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
          ...SUCCESS_CHIP }}><T k="pages.components.retention.repactivitypanel.1e9906">TASK ✓</T></span>
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
            <T k="pages.components.retention.repactivitypanel.d6928a">last 14 days ·</T> <strong style={{ color: 'var(--qs-success)' }}>{data.totals.saves}</strong> <T k="pages.components.retention.repactivitypanel.c94a10">saves ·</T>{' '}
            <strong style={{ color: 'var(--qs-success)' }}>{fmt$(data.totals.premium)}</strong> · {data.totals.attempts} <T k="pages.components.retention.repactivitypanel.f2bb91">calls</T>{data.totals.attempts ? <>{" ("}{Math.round((data.totals.reached / data.totals.attempts) * 100)}<T k="pages.components.retention.repactivitypanel.8a5546">{"% reached)"}</T></> : ''} · {data.totals.tasksDone} <T k="pages.components.retention.repactivitypanel.2cb1ad">tasks</T>
          </div>
        )}
      </div>
      {isLoading || !data ? <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.repactivitypanel.5f02f0">Loading…</T></div> : (
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}><T k="pages.components.retention.repactivitypanel.03727a">Day</T></th>
            <th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.b21c39">Calls</T></th><th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.94c326">Reached</T></th>
            <th style={{ textAlign: 'right' }}
              title="Total saves that day, split as cancels saved (c) / renewals confirmed (r) — e.g. 1 (1c/0r)"><T k="pages.components.retention.repactivitypanel.e25296">Saves</T></th>
            <th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.8d5e7e">Premium</T></th><th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.f38a5e">Tasks Done</T></th></tr></thead>
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
                    <td style={{ ...NUM, fontWeight: 700, color: saves ? 'var(--qs-success)' : 'var(--qs-muted)' }}>
                      {saves ? `${saves} (${d.cancelSaves}c/${d.renewalSaves}r)` : '—'}
                    </td>
                    <td style={{ ...NUM, color: d.premium ? 'var(--qs-success)' : 'var(--qs-muted)' }}>{d.premium ? fmt$(d.premium) : '—'}</td>
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
          <T k="pages.components.retention.repactivitypanel.617d1d">team:</T> <strong style={{ color: 'var(--qs-success)' }}>{totals.saves}</strong> <T k="pages.components.retention.repactivitypanel.c94a10">saves ·</T> <strong style={{ color: 'var(--qs-success)' }}>{fmt$(totals.premium)}</strong> · {totals.attempts} <T k="pages.components.retention.repactivitypanel.f2bb91">calls</T>{totals.attempts ? <>{" ("}{Math.round((totals.reached / totals.attempts) * 100)}<T k="pages.components.retention.repactivitypanel.8a5546">{"% reached)"}</T></> : ''} · {totals.tasksDone} <T k="pages.components.retention.repactivitypanel.2cb1ad">tasks</T>
        </div>
      </div>
      {isLoading ? <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.repactivitypanel.5f02f0">Loading…</T></div>
        : rows.length === 0 ? <div style={{ color: 'var(--qs-muted)', fontSize: 13 }}><T k="pages.components.retention.repactivitypanel.01821a">No recorded activity on</T> {dayLabel(date)}.</div> : (
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}><T k="pages.components.retention.repactivitypanel.608033">Rep</T></th>
            <th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.b21c39">Calls</T></th><th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.94c326">Reached</T></th>
            <th style={{ textAlign: 'right' }}
              title="Total saves that day, split as cancels saved (c) / renewals confirmed (r) — e.g. 1 (1c/0r)"><T k="pages.components.retention.repactivitypanel.e25296">Saves</T></th>
            <th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.8d5e7e">Premium</T></th><th style={{ textAlign: 'right' }}><T k="pages.components.retention.repactivitypanel.f38a5e">Tasks Done</T></th></tr></thead>
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
                    <td style={{ ...NUM, fontWeight: 700, color: saves ? 'var(--qs-success)' : 'var(--qs-muted)' }}>
                      {saves ? `${saves} (${a.cancelSaves}c/${a.renewalSaves}r)` : '—'}
                    </td>
                    <td style={{ ...NUM, color: a.premium ? 'var(--qs-success)' : 'var(--qs-muted)' }}>{a.premium ? fmt$(a.premium) : '—'}</td>
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
  if (isLoading) return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.repactivitypanel.5f02f0">Loading…</T></div>;
  if (rows.length === 0) return <div style={{ color: 'var(--qs-muted)', fontSize: 13 }}><T k="pages.components.retention.repactivitypanel.196572">No cases assigned to any rep right now.</T></div>;
  return (
    <>
      <table>
        <thead><tr>
          <th><T k="pages.components.retention.repactivitypanel.608033">Rep</T></th><th><T k="pages.components.retention.repactivitypanel.722ad2">Queue</T></th><th><T k="pages.components.retention.repactivitypanel.e3b5c4">Untouched</T></th><th><T k="pages.components.retention.repactivitypanel.8fedbc">Worked Today</T></th><th><T k="pages.components.retention.repactivitypanel.a0c76c">Calls vs Target</T></th><th><T k="pages.components.retention.repactivitypanel.f7a42e">Queue Coverage</T></th>
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
                <td style={{ color: r.untouched ? 'var(--qs-text)' : 'var(--qs-muted)', fontWeight: r.untouched ? 700 : 400 }}>
                  {r.untouched || '—'}{r.overdue ? <>{" · "}{r.overdue}{" "}<T k="pages.components.retention.repactivitypanel.ba2fff">{"overdue"}</T></> : ''}
                </td>
                <td style={{ color: r.touchedToday ? 'var(--qs-text)' : 'var(--qs-muted)', fontWeight: 700 }}>{r.touchedToday || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 44, color: hit ? 'var(--qs-success)' : 'var(--qs-text)', fontWeight: 600 }}>{r.callsToday}/{r.target}</span>
                    <Bar pct={targetPct} color={hit ? 'var(--qs-success)' : 'var(--qs-info)'} />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 36, color: 'var(--qs-dim)' }}>{cover}%</span>
                    <Bar pct={cover} color={cover >= 80 ? 'var(--qs-success)' : 'var(--qs-info)'} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
        <T k="pages.components.retention.repactivitypanel.e5c067">Queue = active cases assigned to the rep (not snoozed). Untouched = never called; “overdue” = past their deadline and never called. Worked today / coverage = distinct cases they've touched today. Calls vs target uses each rep's daily call target.</T>
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
    background: active ? 'var(--qs-info-subtle)' : 'var(--qs-elevated)',
    color: active ? 'var(--qs-info)' : 'var(--qs-dim)', fontFamily: 'inherit',
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}><T k="pages.components.retention.repactivitypanel.ecfc2d">Activity</T></h3>
        <span title="Updates live as reps work" style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: 'var(--qs-success)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--qs-success)' }} />
          <T k="pages.components.retention.repactivitypanel.f35d25">LIVE</T>
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>
          <button style={tab(mode === 'queue')} onClick={() => setMode('queue')}><T k="pages.components.retention.repactivitypanel.1d55af">Queue — Today</T></button>
          <button style={tab(mode === 'daily')} onClick={() => setMode('daily')}><T k="pages.components.retention.repactivitypanel.296863">Daily — Team</T></button>
          <button style={tab(mode === 'rep')} onClick={() => setMode('rep')}><T k="pages.components.retention.repactivitypanel.bd805c">By Rep</T></button>
        </div>
      </div>
      {mode === 'queue' ? <QueueCoverage agencyId={agencyId} />
        : mode === 'daily' ? <DailyTeam agencyId={agencyId} employees={employees} />
        : <RepTimeline agencyId={agencyId} employees={employees} />}
    </div>
  );
}
