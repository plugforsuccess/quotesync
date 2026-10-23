// src/pages/components/rate-checks/WinMapTab.jsx
// "Where we win": how often Allstate beats each carrier, by ZIP. Until a carrier
// and ZIP has enough quotes to mean anything, shows progress toward the first one
// over a blurred preview instead of a blank screen. Cards on phones, a table above.

import { useMemo, useState } from 'react';
import { useRateCheckWinMap } from '../../../hooks/useRateChecks';
import { policyTypeLabel } from './format';
import { thCls, thStyle, inputStyle, money } from './ui';

const MIN_QUOTES = 3;
const PREVIEW = [
  ['State Farm', 'Auto', '30044', '72%'], ['Progressive', 'Auto', '30024', '61%'],
  ['GEICO', 'Auto', '30097', '55%'], ['State Farm', 'Home', '30019', '48%'],
];

export default function WinMap({ agencyId }) {
  const { data = [], isLoading, error } = useRateCheckWinMap(agencyId);
  const [minQuoted, setMinQuoted] = useState(MIN_QUOTES);
  const [sortDir, setSortDir] = useState('desc');

  const ready = useMemo(() => data.filter(r => Number(r.quoted) >= MIN_QUOTES), [data]);
  const rows = useMemo(() => data
    .filter(r => Number(r.quoted) >= minQuoted)
    .sort((a, b) => {
      const d = (Number(a.win_rate_pct) || 0) - (Number(b.win_rate_pct) || 0);
      return sortDir === 'desc' ? -d : d;
    }), [data, minQuoted, sortDir]);
  // The carrier and ZIP closest to having enough quotes.
  const closest = useMemo(() => [...data].filter(r => r.zip5 && Number(r.quoted) < MIN_QUOTES)
    .sort((a, b) => Number(b.quoted) - Number(a.quoted))[0] || null, [data]);

  if (isLoading) return <div className="dark-card p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>;
  if (error) return <div className="dark-card p-8 text-center text-red-600">Error loading this report.</div>;

  if (!ready.length) {
    const have = closest ? Number(closest.quoted) : 0;
    return (
      <div className="dark-card relative overflow-hidden" style={{ padding: 0 }}>
        <div className="p-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>Building your win map</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>
            {closest
              ? <>{have} of {MIN_QUOTES} quotes toward your first ZIP <span className="whitespace-nowrap" style={{ color: 'var(--qs-subtle)' }}>({closest.zip5} · {closest.carrier || 'Unknown'}{closest.policy_type ? ` ${policyTypeLabel(closest.policy_type).toLowerCase()}` : ''})</span></>
              : <>Enter Allstate&apos;s price on {MIN_QUOTES} rate checks from the same carrier and ZIP to see your first win rate.</>}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--qs-elevated)' }} role="progressbar" aria-valuemin={0} aria-valuemax={MIN_QUOTES} aria-valuenow={have}>
            <div className="h-full rounded-full bg-primary-600" style={{ width: `${(have / MIN_QUOTES) * 100}%` }} />
          </div>
        </div>
        <ul className="pointer-events-none select-none px-5 pb-5 blur-[3px]" aria-hidden="true">
          {PREVIEW.map(([c, t, z, w]) => (
            <li key={c + z} className="flex items-center justify-between rounded-lg px-3 py-2.5 mb-2" style={{ background: 'var(--qs-elevated)' }}>
              <span style={{ color: 'var(--qs-text)' }}>{c} {t} · {z}</span><span className="font-bold" style={{ color: 'var(--qs-success)' }}>{w}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm" style={{ borderBottom: '1px solid var(--qs-border)', color: 'var(--qs-subtle)' }}>
        <span>How often Allstate beats each carrier, by ZIP.</span>
        <label className="whitespace-nowrap sm:ml-auto">
          At least
          <input type="number" min={1} value={minQuoted} onChange={e => setMinQuoted(Math.max(1, Number(e.target.value) || 1))}
            className="mx-1.5 w-14 rounded px-2 py-1" style={inputStyle} aria-label="Minimum quotes" />
          quotes
        </label>
        <button type="button" onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))} className="whitespace-nowrap font-semibold text-primary-600 md:hidden">
          Win rate {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No carrier and ZIP has {minQuoted}+ quotes yet.</div>
      ) : (
        <>
          <ul className="md:hidden">
            {rows.map(r => (
              <li key={`${r.carrier}-${r.policy_type}-${r.zip5}`} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
                <span className="min-w-0">
                  <span className="block font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.carrier || '—'} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>{policyTypeLabel(r.policy_type)}</span></span>
                  <span className="block text-sm" style={{ color: 'var(--qs-subtle)' }}>{r.zip5 || '—'} · {r.wins} of {r.quoted} won{r.avg_savings_when_won != null ? ` · saves ${money(r.avg_savings_when_won)}` : ''}</span>
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{r.win_rate_pct != null ? `${Math.round(r.win_rate_pct)}%` : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: 'var(--qs-elevated)' }}>
                  {['Their carrier', 'Policy', 'ZIP', 'Quotes', 'Wins'].map(h => <th key={h} className={thCls} style={thStyle}>{h}</th>)}
                  <th className={thCls} style={thStyle}>
                    <button onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))} className="uppercase">Win rate {sortDir === 'desc' ? '↓' : '↑'}</button>
                  </th>
                  <th className={thCls} style={thStyle}>Avg savings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.carrier}-${r.policy_type}-${r.zip5}`} style={{ borderTop: '1px solid var(--qs-border)' }}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-bright)' }}>{r.carrier || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{policyTypeLabel(r.policy_type) || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.zip5 || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.quoted}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.wins}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.win_rate_pct != null ? `${r.win_rate_pct}%` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{money(r.avg_savings_when_won)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
