// RepActivityPanel — "what did this rep do each day": pick a rep, see a day-by-day
// breakdown of calls logged, customers reached, saves (with premium preserved),
// and service tasks completed. The principal's daily monitor for a rep.

import { useState, useEffect, Fragment } from 'react';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import { useRepActivity } from '../../../hooks/useRepActivity';
import { titleCaseName } from '../../../lib/names';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
function dayLabel(k) {
  const d = new Date(k + 'T00:00:00');
  const today = new Date().toLocaleDateString('en-CA');
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RepActivityPanel({ agencyId }) {
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const [repId, setRepId] = useState('');
  useEffect(() => {
    if (!repId && employees.length) {
      const svc = employees.find(e => (e.roles || []).some(r => String(r).startsWith('service'))) || employees[0];
      setRepId(svc.id);
    }
  }, [employees, repId]);

  const { data, isLoading } = useRepActivity(agencyId, repId, 14);
  const [openDay, setOpenDay] = useState(null);
  const repName = (() => {
    const e = employees.find(x => x.id === repId);
    return e ? (e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()) : '';
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Daily activity</h3>
          <select value={repId} onChange={e => { setRepId(e.target.value); setOpenDay(null); }}
            style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }}>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()}</option>
            ))}
          </select>
          {data && (
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)' }}>
              last 14 days · <strong style={{ color: '#10B981' }}>{data.totals.saves}</strong> saves ·{' '}
              <strong style={{ color: '#10B981' }}>{fmt$(data.totals.premium)}</strong> ·{' '}
              {data.totals.attempts} calls · {data.totals.tasksDone} tasks
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div>
      ) : !data ? null : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Day</th><th>Calls</th><th>Reached</th><th>Saves</th><th>Premium</th><th>Tasks done</th></tr>
            </thead>
            <tbody>
              {data.series.map(d => {
                const saves = d.cancelSaves + d.renewalSaves;
                const idle = d.attempts + saves + d.tasksDone === 0;
                const expandable = d.saves.length > 0;
                return (
                  <Fragment key={d.date}>
                    <tr
                      onClick={() => expandable && setOpenDay(openDay === d.date ? null : d.date)}
                      style={{ cursor: expandable ? 'pointer' : 'default', opacity: idle ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>
                        {dayLabel(d.date)} {expandable ? (openDay === d.date ? '▾' : '▸') : ''}
                      </td>
                      <td>{d.attempts || '—'}</td>
                      <td>{d.reached || '—'}</td>
                      <td style={{ fontWeight: 700, color: saves ? '#10B981' : 'var(--qs-muted)' }}>
                        {saves || '—'}{saves ? ` (${d.cancelSaves}c/${d.renewalSaves}r)` : ''}
                      </td>
                      <td style={{ color: d.premium ? '#10B981' : 'var(--qs-muted)' }}>{d.premium ? fmt$(d.premium) : '—'}</td>
                      <td>{d.tasksDone || '—'}</td>
                    </tr>
                    {openDay === d.date && d.saves.map((s, i) => (
                      <tr key={`${d.date}-${i}`} style={{ background: 'var(--qs-elevated)' }}>
                        <td colSpan={6} style={{ fontSize: 12, color: 'var(--qs-dim)', paddingLeft: 24 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 8,
                            background: s.kind === 'cancel' ? '#EF444422' : '#3B82F622',
                            color: s.kind === 'cancel' ? '#F87171' : '#60A5FA' }}>
                            {s.kind === 'cancel' ? 'CANCEL SAVE' : 'RENEWAL'}
                          </span>
                          {titleCaseName(s.name) || '—'} · {fmt$(s.premium)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
            {repName ? `${repName}'s ` : ''}calls = real logged attempts (auto-records excluded). Click a day to see the saves.
          </p>
        </div>
      )}
    </div>
  );
}
