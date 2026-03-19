// src/pages/components/revenue/DailyEarningsTab.jsx
import { useMemo, useState } from 'react';
import { AreaChart, Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid,
         Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useRevenueEntries } from '../../../hooks/useRevenueEntries';

const COMMISSION_GOAL = 40000;
const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
const fmtFull$ = (n) => `$${Math.round(n).toLocaleString()}`;

// Inline commission calculation — same logic as dashboard
const COMMISSION = {
  auto:    { preferred: 0.25, bundled: 0.20, monoline: 0.15 },
  ho:      { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  condo:   { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  renters: { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  other:   { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
};
const COMMISSIONABLE_FACTORS = {
  auto: 0.998, ho: 0.935, condo: 0.959,
};
function calcCommission(premium, product, tier = 'monoline') {
  const rates = COMMISSION[product] ?? COMMISSION.other;
  const factor = COMMISSIONABLE_FACTORS[product] ?? 1.0;
  return premium * factor * (rates[tier] ?? rates.monoline);
}

export default function DailyEarningsTab({ agencyId }) {
  const today = new Date();
  const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const { entries, loading } = useRevenueEntries({ agencyId, rangeStart, rangeEnd });

  const { dailyCumulative, yesterdayEarned, mtdCommission, mtdAhead } = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const todayDay = today.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const byDay = {};
    entries.forEach(e => {
      const d = new Date(e.date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        if (!byDay[day]) byDay[day] = 0;
        byDay[day] += calcCommission(e.premium, e.product, e.tier ?? 'monoline');
      }
    });

    let running = 0;
    const data = Array.from({ length: todayDay }, (_, i) => {
      const day = i + 1;
      running += byDay[day] ?? 0;
      return {
        day,
        cumulative: running,
        idealPace: (COMMISSION_GOAL / daysInMonth) * day,
        isYesterday: day === todayDay - 1,
        isToday: day === todayDay,
        dailyEarned: byDay[day] ?? 0,
      };
    });

    const mtdCommission = running;
    const yesterdayEarned = data.find(d => d.isYesterday)?.dailyEarned ?? 0;
    const mtdAhead = mtdCommission > (data.at(-1)?.idealPace ?? 0);

    return { dailyCumulative: data, yesterdayEarned, mtdCommission, mtdAhead };
  }, [entries]);

  const [earningsMode, setEarningsMode] = useState('yesterday');
  const todayEarned    = dailyCumulative.find(d => d.isToday)?.dailyEarned ?? 0;
  const displayEarned  = earningsMode === 'yesterday' ? yesterdayEarned : todayEarned;
  const displayLabel   = earningsMode === 'yesterday' ? 'yesterday' : 'today';

  const mtdGap = COMMISSION_GOAL - mtdCommission;

  if (loading) return (
    <div style={{ color: 'var(--qs-subtle)', padding: 40, textAlign: 'center' }}>
      Loading earnings data...
    </div>
  );

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 2 }}>
          Daily Earnings — {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
          Cumulative commission vs. ideal pace to $40k goal
        </div>
      </div>

      {/* Chart card — dark theme */}
      <div className="card" style={{ marginBottom: 20 }}>
        {/* Card header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-text)' }}>
              Cumulative Commission
            </div>
            <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>
              Actual MTD vs. ideal pace
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {displayEarned > 0 && (
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-success)' }}>
                {fmtFull$(displayEarned)} {displayLabel}
              </div>
            )}
            <div style={{
              fontSize: 12, fontWeight: 600, marginTop: 2,
              color: mtdAhead ? 'var(--qs-success)' : 'var(--qs-warning)',
            }}>
              {mtdAhead
                ? `${fmtFull$(mtdCommission - (dailyCumulative.at(-1)?.idealPace ?? 0))} ahead of pace`
                : `${fmtFull$(Math.abs(mtdGap))} ${mtdGap > 0 ? 'to goal' : 'over goal'}`
              }
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={dailyCumulative} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dailyEarningsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--qs-border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: 'var(--qs-dim)' }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--qs-dim)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => fmt$(v)}
              width={48}
            />
            <Tooltip
              formatter={(value, name) => [
                fmtFull$(value),
                name === 'cumulative' ? 'Earned MTD' : 'Ideal Pace',
              ]}
              labelFormatter={day => `Day ${day}`}
              contentStyle={{
                fontSize: 12, borderRadius: 8,
                background: 'var(--qs-elevated)',
                border: '1px solid var(--qs-border)',
                color: 'var(--qs-text)',
              }}
            />
            <Line
              type="monotone"
              dataKey="idealPace"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              name="idealPace"
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#dailyEarningsGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#10b981' }}
              name="cumulative"
            />
            <ReferenceLine
              y={COMMISSION_GOAL}
              stroke="var(--qs-info)"
              strokeDasharray="6 3"
              strokeWidth={1}
              label={{ value: '$40k', position: 'right', fontSize: 9, fill: 'var(--qs-info)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {[
            { color: '#10b981', label: 'Actual MTD' },
            { color: 'rgba(255,255,255,0.5)', label: 'Ideal pace', dashed: true },
            { color: 'var(--qs-info)', label: '$40k goal', dashed: true },
          ].map(({ color, label, dashed }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 20, height: 2,
                background: dashed ? 'transparent' : color,
                borderTop: dashed ? `2px dashed ${color}` : 'none',
              }} />
              <span style={{ fontSize: 11, color: 'var(--qs-dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            MTD Commission
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-success)' }}>
            {fmtFull$(mtdCommission)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>
            of {fmtFull$(COMMISSION_GOAL)} goal
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Gap to $40k
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: mtdCommission >= COMMISSION_GOAL ? 'var(--qs-success)' : 'var(--qs-warning)' }}>
            {mtdCommission >= COMMISSION_GOAL ? 'Achieved' : fmtFull$(mtdGap)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>
            {mtdCommission >= COMMISSION_GOAL ? 'Goal exceeded' : 'remaining this month'}
          </div>
        </div>
        <div
          className="card"
          onClick={() => setEarningsMode(m => m === 'yesterday' ? 'today' : 'yesterday')}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title="Click to toggle Today / Yesterday"
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 6,
          }}>
            <div style={{
              fontSize: 11, color: 'var(--qs-subtle)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {earningsMode === 'yesterday' ? 'Yesterday' : 'Today'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--qs-info)', fontWeight: 600 }}>
              {earningsMode === 'yesterday' ? '→ Today' : '→ Yesterday'}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-text)' }}>
            {displayEarned > 0 ? fmtFull$(displayEarned) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>
            commission earned
          </div>
        </div>
      </div>
    </div>
  );
}
