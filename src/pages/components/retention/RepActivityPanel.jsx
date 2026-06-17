// RepActivityPanel — monitor rep retention output. Two modes:
//   • By rep   — one rep, day-by-day over the last 14 days.
//   • Daily    — one day, every rep side by side (the daily standup).

import { useState, useEffect, Fragment } from 'react';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import { useRepActivity } from '../../../hooks/useRepActivity';
import { useDailyTeamActivity } from '../../../hooks/useDailyTeamActivity';
import { titleCaseName } from '../../../lib/names';

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
function empName(e) { return e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(); }

function SaveRows({ saves, date }) {
  return saves.map((s, i) => (
    <tr key={`${date}-${i}`} style={{ background: 'var(--qs-elevated)' }}>
      <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
          background: s.kind === 'cancel' ? '#EF444422' : '#3B82F622',
          color: s.kind === 'cancel' ? '#F87171' : '#60A5FA' }}>
          {s.kind === 'cancel' ? 'CANCEL SAVE' : 'RENEWAL'}
        </span>
        {titleCaseName(s.name) || '—'} · {fmt$(s.premium)}
      </td>
    </tr>
  ));
}

// ── By rep: one rep, last 14 days ───────────────────────────────────────────
function RepTimeline({ agencyId, employees }) {
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
        <table>
          <thead><tr><th>Day</th><th>Calls</th><th>Reached</th><th>Saves</th><th>Premium</th><th>Tasks done</th></tr></thead>
          <tbody>
            {data.series.map(d => {
              const saves = d.cancelSaves + d.renewalSaves;
              const idle = d.attempts + saves + d.tasksDone === 0;
              const expandable = d.saves.length > 0;
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
                  {openDay === d.date && <SaveRows saves={d.saves} date={d.date} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ── Daily: one day, all reps ────────────────────────────────────────────────
function DailyTeam({ agencyId, employees }) {
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
        <table>
          <thead><tr><th>Rep</th><th>Calls</th><th>Reached</th><th>Saves</th><th>Premium</th><th>Tasks done</th></tr></thead>
          <tbody>
            {rows.map(({ e, a }) => {
              const saves = a.cancelSaves + a.renewalSaves;
              const expandable = a.saves.length > 0;
              return (
                <Fragment key={e.id}>
                  <tr onClick={() => expandable && setOpenRep(openRep === e.id ? null : e.id)}
                    style={{ cursor: expandable ? 'pointer' : 'default' }}>
                    <td style={{ fontWeight: 600 }}>{empName(e)} {expandable ? (openRep === e.id ? '▾' : '▸') : ''}</td>
                    <td>{a.attempts || '—'}</td>
                    <td>{a.reached || '—'}</td>
                    <td style={{ fontWeight: 700, color: saves ? '#10B981' : 'var(--qs-muted)' }}>
                      {saves ? `${saves} (${a.cancelSaves}c/${a.renewalSaves}r)` : '—'}
                    </td>
                    <td style={{ color: a.premium ? '#10B981' : 'var(--qs-muted)' }}>{a.premium ? fmt$(a.premium) : '—'}</td>
                    <td>{a.tasksDone || '—'}</td>
                  </tr>
                  {openRep === e.id && <SaveRows saves={a.saves} date={e.id} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function RepActivityPanel({ agencyId }) {
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const [mode, setMode] = useState('daily'); // 'daily' (team) | 'rep'

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
        <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>
          <button style={tab(mode === 'daily')} onClick={() => setMode('daily')}>Daily — team</button>
          <button style={tab(mode === 'rep')} onClick={() => setMode('rep')}>By rep</button>
        </div>
      </div>
      {mode === 'daily'
        ? <DailyTeam agencyId={agencyId} employees={employees} />
        : <RepTimeline agencyId={agencyId} employees={employees} />}
    </div>
  );
}
