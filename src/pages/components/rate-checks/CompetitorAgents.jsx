// src/pages/components/rate-checks/CompetitorAgents.jsx
// "Competing agents" tab: the agents/agencies printed on uploaded dec pages,
// with how often we see them, where, what their customers pay, and how often
// we beat them. Internal market intel only — never contact a competitor about
// a specific customer, never share pricing with competitors.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Lock, SlidersHorizontal, Star } from 'lucide-react';
import { useCompetitorAgents, useUpdateCompetitorAgent } from '../../../hooks/useRateChecks';
import { thCls, thStyle, inputStyle, money, formatPhone, formatDate, BOOK_OWNERSHIP } from './ui';
import { isSelectingText } from './format';
import { Field } from './Copyable';
import { caps } from './policyView';
import AgentsMap from './AgentsMap';

export function OwnershipChip({ value }) {
  const o = BOOK_OWNERSHIP[value] || BOOK_OWNERSHIP.check;
  return <span title={o.hint} className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${o.cls}`}>{o.label}</span>;
}

export default function CompetitorAgents({ agencyId, scans = [] }) {
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
  // Every filter but ZIP feeds the map; the map's ZIP then narrows the list.
  const unzipped = useMemo(() => data
    .filter(r => !carrier || r.carrier === carrier)
    .filter(r => Number(r.rate_checks) >= minSeen)
    .filter(r => !acquirableOnly || ['acquirable', 'allstate'].includes(r.book_ownership))
    .filter(r => !starredOnly || r.starred),
  [data, carrier, minSeen, acquirableOnly, starredOnly]);
  const rows = useMemo(() => unzipped
    .filter(r => !zip || (r.zips || []).some(z => z.startsWith(zip)))
    .sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0)),
  [unzipped, zip, sort]);

  const SortTh = ({ k, children }) => (
    <th className={thCls} style={thStyle}>
      <button onClick={() => setSort(k)} className="uppercase">{children}{sort === k ? ' ↓' : ''}</button>
    </th>
  );

  const wide = useWide();
  const filterCount = (minSeen > 1 ? 1 : 0) + (acquirableOnly ? 1 : 0) + (starredOnly ? 1 : 0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
      <p className="flex items-center gap-1.5 px-4 pt-3 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Internal only — never mention a customer to their agent.
      </p>
      <div className="flex flex-wrap items-center gap-2 p-3 text-sm" style={{ borderBottom: '1px solid var(--qs-border)', color: 'var(--qs-subtle)' }}>
        <select value={carrier} onChange={e => setCarrier(e.target.value)} className="dark-select min-w-0 flex-1 sm:w-auto sm:flex-none" style={inputStyle} aria-label="Carrier">
          <option value="">Carrier</option>
          {carriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="ZIP" aria-label="ZIP"
          className="w-[4.5rem] rounded px-2 py-2" style={inputStyle} inputMode="numeric" />
        <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 font-semibold" style={{ ...inputStyle, color: 'var(--qs-bright)' }}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
          {filterCount > 0 && <span className="rounded-full bg-primary-600 px-1.5 text-xs text-white">{filterCount}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen && (
          <div className="flex w-full flex-col gap-3 rounded-lg p-3" style={{ background: 'var(--qs-elevated)' }}>
            <label className="flex items-center justify-between gap-3">At least this many customers
              <input type="number" min={1} value={minSeen} onChange={e => setMinSeen(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded px-2 py-1.5" style={inputStyle} />
            </label>
            <label className="flex min-h-[32px] items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={acquirableOnly} onChange={e => setAcquirableOnly(e.target.checked)} /> Books we could buy</label>
            <label className="flex min-h-[32px] items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={starredOnly} onChange={e => setStarredOnly(e.target.checked)} /> Starred only</label>
            <label className="flex items-center justify-between gap-3 md:hidden">Sort by
              <select value={sort} onChange={e => setSort(e.target.value)} className="dark-select" style={{ width: 'auto', ...inputStyle }}>
                <option value="rate_checks">Most customers</option>
                <option value="avg_annual_premium">Highest premium</option>
                <option value="win_rate_pct">Best win rate</option>
                <option value="avg_savings_when_won">Biggest savings</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Wide screens: map on the left (tall, stays put while the list scrolls), agents on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
      {!isLoading && !error && data.length > 0 && (
        <div className="border-b xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)] xl:border-b-0 xl:border-r" style={{ borderColor: 'var(--qs-border)' }}>
          <AgentsMap agents={unzipped} scans={scans} zip={zip} onPickZip={setZip} tall={wide} />
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">Error loading competing agents.</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
          {data.length === 0 ? 'No agents yet. They show up here when a policy lists the customer’s agent.' : 'No agents match these filters.'}
        </div>
      ) : (
        <>
          <ul className="md:hidden xl:block">
            {rows.map(r => <AgentCard key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} update={update} />)}
          </ul>
          <div className="hidden overflow-x-auto md:block xl:hidden">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: 'var(--qs-elevated)' }}>
                  <th className={thCls} style={thStyle}></th>
                  <th className={thCls} style={thStyle}>Agency</th>
                  <th className={thCls} style={thStyle}>Carrier</th>
                  <th className={`${thCls} whitespace-nowrap`} style={thStyle}>Book</th>
                  <th className={thCls} style={thStyle}>ZIPs</th>
                  <SortTh k="rate_checks">Customers</SortTh>
                  <SortTh k="avg_annual_premium">Avg premium</SortTh>
                  <SortTh k="win_rate_pct">We win</SortTh>
                  <SortTh k="avg_savings_when_won">Avg savings</SortTh>
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
        </>
      )}
      </div>
    </div>
  );
}

// Computer-width screens get the side-by-side map.
function useWide() {
  const query = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

// Phones: one card per agent; tap to open the same details as the table row.
function AgentCard({ r, open, onToggle, update }) {
  const name = r.agency_name || r.agent_name || 'Unknown agent';
  const o = BOOK_OWNERSHIP[r.book_ownership] || BOOK_OWNERSHIP.check;
  return (
    <li style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex items-start gap-1 py-2 pl-1 pr-4" onClick={() => { if (!isSelectingText()) onToggle(); }} aria-expanded={open}>
        <StarButton r={r} update={update} />
        <div className="min-w-0 flex-1 pt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words font-semibold" style={{ color: 'var(--qs-bright)' }}>{name}</span>
            <span className="max-w-[45%] shrink-0 text-right text-sm" style={{ color: 'var(--qs-text)' }}>{r.carrier}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
            {o.label}{(r.zips || []).length ? ` · ${r.zips.join(', ')}` : ''} · <b style={{ color: 'var(--qs-bright)' }}>{plural(r.rate_checks, 'customer')}</b>
          </p>
          {(Number(r.quoted) > 0 || r.avg_annual_premium != null) && (
            <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
              {r.avg_annual_premium != null && `Avg ${money(r.avg_annual_premium)}/yr`}
              {Number(r.quoted) > 0 && ` · We win ${r.wins} of ${r.quoted}`}
              {r.avg_savings_when_won != null && <span className="text-green-600"> · saves {money(r.avg_savings_when_won)}</span>}
            </p>
          )}
        </div>
      </div>
      {open && <div className="px-4 pb-4 text-sm" style={{ background: 'var(--qs-elevated)' }}><AgentDetails r={r} update={update} /></div>}
    </li>
  );
}

function StarButton({ r, update }) {
  return (
    <button aria-label={r.starred ? 'Remove from watchlist' : 'Add to watchlist'} className="flex h-11 w-11 shrink-0 items-center justify-center"
      onClick={e => { e.stopPropagation(); update.mutate({ id: r.id, updates: { starred: !r.starred } }); }}>
      <Star className={`w-5 h-5 ${r.starred ? 'fill-yellow-400 text-yellow-400' : ''}`} style={r.starred ? undefined : { color: 'var(--qs-subtle)' }} />
    </button>
  );
}

function FragmentRow({ r, open, onToggle, update }) {
  const name = r.agency_name || r.agent_name || 'Unknown agent';
  return (
    <>
      <tr className="cursor-pointer" style={{ borderTop: '1px solid var(--qs-border)' }} onClick={() => { if (!isSelectingText()) onToggle(); }} aria-expanded={open}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-elevated)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
        <td className="px-2 py-1"><StarButton r={r} update={update} /></td>
        <td className="px-4 py-3 text-sm">
          <div className="font-medium" style={{ color: 'var(--qs-bright)' }}>{name}</div>
          {r.agency_name && r.agent_name && <div className="text-xs" style={{ color: 'var(--qs-subtle)' }}>{r.agent_name}</div>}
        </td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.carrier}</td>
        <td className="px-4 py-3 whitespace-nowrap"><OwnershipChip value={r.book_ownership} /></td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{(r.zips || []).join(', ') || '—'}</td>
        <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.rate_checks}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{money(r.avg_annual_premium)}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>
          {r.win_rate_pct != null ? `${r.win_rate_pct}%` : '—'}
          {Number(r.quoted) > 0 && <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}> ({r.wins}/{r.quoted})</span>}
        </td>
        <td className="px-4 py-3 text-sm text-green-600">{r.avg_savings_when_won != null ? `${money(r.avg_savings_when_won)}/yr` : '—'}</td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{formatDate(r.last_seen_at)}</td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--qs-elevated)' }}>
          <td></td>
          <td colSpan={9} className="px-4 py-4 text-sm"><AgentDetails r={r} update={update} /></td>
        </tr>
      )}
    </>
  );
}

function AgentDetails({ r, update }) {
  const [notes, setNotes] = useState(r.notes || '');
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <dl>
          {r.agency_name && r.agent_name && <Field label="Agent" value={r.agent_name} />}
          <Field label="Phone" value={r.phone ? formatPhone(r.phone) : null} copy />
          {r.email && <Field label="Email" value={r.email} copy />}
          {r.address && <Field label="Address" value={caps(r.address)} copy />}
          {r.agent_code && <Field label="Agent code" value={r.agent_code} copy mono />}
        </dl>
        <p className="mt-2" style={{ color: 'var(--qs-subtle)' }}>
          Writes {(r.policy_types || []).join(' and ') || '—'}. Their customers we&apos;ve seen pay {money(r.total_annual_premium_seen)}/yr in total. First seen {formatDate(r.first_seen_at)}.
        </p>
      </div>
      <label className="space-y-1">
        <span style={{ color: 'var(--qs-subtle)' }}>Book</span>
        <select value={r.book_ownership} onChange={e => update.mutate({ id: r.id, updates: { book_ownership: e.target.value } })}
          className="w-full rounded px-2 py-1.5" style={inputStyle}>
          {Object.entries(BOOK_OWNERSHIP).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
        </select>
        <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{(BOOK_OWNERSHIP[r.book_ownership] || BOOK_OWNERSHIP.check).hint}</span>
      </label>
      <div className="space-y-1">
        <span style={{ color: 'var(--qs-subtle)' }}>Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full rounded px-2 py-1.5" style={inputStyle}
          placeholder="e.g. met at a chamber event; may retire in 2027" />
        <button onClick={() => update.mutate({ id: r.id, updates: { notes: notes.trim() || null } })}
          disabled={update.isPending || notes === (r.notes || '')}
          className="rounded bg-primary-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save notes</button>
      </div>
    </div>
  );
}
