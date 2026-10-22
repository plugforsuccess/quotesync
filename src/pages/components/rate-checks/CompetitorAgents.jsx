// src/pages/components/rate-checks/CompetitorAgents.jsx
// "Competing agents" tab: the agents/agencies printed on uploaded dec pages,
// with how often we see them, where, what their customers pay, and how often
// we beat them. Internal market intel only — never contact a competitor about
// a specific customer, never share pricing with competitors.

import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { useCompetitorAgents, useUpdateCompetitorAgent } from '../../../hooks/useRateChecks';
import { thCls, thStyle, inputStyle, money, formatPhone, formatDate, BOOK_OWNERSHIP } from './ui';

export function OwnershipChip({ value }) {
  const o = BOOK_OWNERSHIP[value] || BOOK_OWNERSHIP.check;
  return <span title={o.hint} className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${o.cls}`}>{o.label}</span>;
}

export default function CompetitorAgents({ agencyId }) {
  const { data = [], isLoading, error } = useCompetitorAgents(agencyId);
  const update = useUpdateCompetitorAgent();
  const [carrier, setCarrier] = useState('');
  const [zip, setZip] = useState('');
  const [minSeen, setMinSeen] = useState(1);
  const [acquirableOnly, setAcquirableOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [sort, setSort] = useState('rate_checks');
  const [openId, setOpenId] = useState(null);

  const carriers = useMemo(() => [...new Set(data.map(r => r.carrier))].sort(), [data]);
  const rows = useMemo(() => data
    .filter(r => !carrier || r.carrier === carrier)
    .filter(r => !zip || (r.zips || []).some(z => z.startsWith(zip)))
    .filter(r => Number(r.rate_checks) >= minSeen)
    .filter(r => !acquirableOnly || ['acquirable', 'allstate'].includes(r.book_ownership))
    .filter(r => !starredOnly || r.starred)
    .sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0)),
  [data, carrier, zip, minSeen, acquirableOnly, starredOnly, sort]);

  const SortTh = ({ k, children }) => (
    <th className={thCls} style={thStyle}>
      <button onClick={() => setSort(k)} className="uppercase">{children}{sort === k ? ' ↓' : ''}</button>
    </th>
  );

  return (
    <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
      <div className="flex flex-wrap items-center gap-3 p-3 text-sm" style={{ borderBottom: '1px solid var(--qs-border)', color: 'var(--qs-subtle)' }}>
        <select value={carrier} onChange={e => setCarrier(e.target.value)} className="dark-select" style={{ width: 'auto', ...inputStyle }}>
          <option value="">All carriers</option>
          {carriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="ZIP"
          className="w-20 rounded px-2 py-1" style={inputStyle} inputMode="numeric" />
        <label>Seen at least{' '}
          <input type="number" min={1} value={minSeen} onChange={e => setMinSeen(Math.max(1, Number(e.target.value) || 1))}
            className="ml-1 w-14 rounded px-2 py-1" style={inputStyle} />
        </label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={acquirableOnly} onChange={e => setAcquirableOnly(e.target.checked)} /> Acquirable only</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={starredOnly} onChange={e => setStarredOnly(e.target.checked)} /> Watchlist</label>
        <span className="ml-auto text-xs">Internal only — never contact an agent about a specific customer.</span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">Error loading competing agents.</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
          {data.length === 0 ? 'No agents yet — they appear as dec pages with an agent block come in.' : 'No agents match these filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ background: 'var(--qs-elevated)' }}>
                <th className={thCls} style={thStyle}></th>
                <th className={thCls} style={thStyle}>Agent / agency</th>
                <th className={thCls} style={thStyle}>Carrier</th>
                <th className={thCls} style={thStyle}>Book</th>
                <th className={thCls} style={thStyle}>ZIPs</th>
                <SortTh k="rate_checks">Seen</SortTh>
                <SortTh k="avg_annual_premium">Avg $/yr</SortTh>
                <SortTh k="win_rate_pct">Win rate</SortTh>
                <SortTh k="avg_savings_when_won">Avg save</SortTh>
                <th className={thCls} style={thStyle}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <FragmentRow key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} update={update} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ r, open, onToggle, update }) {
  const [notes, setNotes] = useState(r.notes || '');
  const name = r.agency_name || r.agent_name || 'Unknown agent';
  return (
    <>
      <tr className="cursor-pointer" style={{ borderTop: '1px solid var(--qs-border)' }} onClick={onToggle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-elevated)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
        <td className="px-4 py-3">
          <button aria-label={r.starred ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={e => { e.stopPropagation(); update.mutate({ id: r.id, updates: { starred: !r.starred } }); }}>
            <Star className={`w-4 h-4 ${r.starred ? 'fill-yellow-400 text-yellow-400' : ''}`} style={r.starred ? undefined : { color: 'var(--qs-subtle)' }} />
          </button>
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="font-medium" style={{ color: 'var(--qs-bright)' }}>{name}</div>
          {r.agency_name && r.agent_name && <div className="text-xs" style={{ color: 'var(--qs-subtle)' }}>{r.agent_name}</div>}
        </td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.carrier}</td>
        <td className="px-4 py-3"><OwnershipChip value={r.book_ownership} /></td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{(r.zips || []).join(', ') || '—'}</td>
        <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.rate_checks}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{money(r.avg_annual_premium)}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>
          {r.win_rate_pct != null ? `${r.win_rate_pct}%` : '—'}
          {Number(r.quoted) > 0 && <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}> ({r.wins}/{r.quoted})</span>}
        </td>
        <td className="px-4 py-3 text-sm text-green-600">{money(r.avg_savings_when_won)}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{formatDate(r.last_seen_at)}</td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--qs-elevated)' }}>
          <td></td>
          <td colSpan={9} className="px-4 py-4 text-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1" style={{ color: 'var(--qs-text)' }}>
                {r.phone && <div>📞 {formatPhone(r.phone)}</div>}
                {r.email && <div>✉️ {r.email}</div>}
                {r.address && <div>📍 {r.address}</div>}
                {r.agent_code && <div>Agent code: <span className="font-mono">{r.agent_code}</span></div>}
                <div style={{ color: 'var(--qs-subtle)' }}>
                  Lines: {(r.policy_types || []).join(', ') || '—'} · Premium seen: {money(r.total_annual_premium_seen)}/yr · First seen {formatDate(r.first_seen_at)}
                </div>
              </div>
              <label className="space-y-1">
                <span style={{ color: 'var(--qs-subtle)' }}>Book ownership</span>
                <select value={r.book_ownership} onChange={e => update.mutate({ id: r.id, updates: { book_ownership: e.target.value } })}
                  className="w-full rounded px-2 py-1.5" style={inputStyle}>
                  {Object.entries(BOOK_OWNERSHIP).map(([k, o]) => <option key={k} value={k}>{o.label} — {o.hint}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span style={{ color: 'var(--qs-subtle)' }}>Notes</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5" style={inputStyle}
                  placeholder="e.g. met at chamber event; retiring in 2027?" />
                <button onClick={() => update.mutate({ id: r.id, updates: { notes: notes.trim() || null } })}
                  disabled={update.isPending || notes === (r.notes || '')}
                  className="rounded bg-primary-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save notes</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
