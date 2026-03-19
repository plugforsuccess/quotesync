// src/pages/components/dashboard/LeadQuality.jsx
// Section 3: Lead Quality & Scoring — histogram, splits, channel table

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';

const SCORE_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#16a34a'];

const INTENT_COLORS = {
  auto: '#3b82f6',
  home: '#8b5cf6',
  bundle: '#22c55e',
  auto_renters: '#06b6d4',
  unsure: '#9ca3af',
};

const INTENT_LABELS = {
  auto: 'Auto',
  home: 'Home',
  bundle: 'Bundle',
  auto_renters: 'Auto + Renters',
  unsure: 'Unsure',
};

// ─── Score Distribution Histogram ────────────────────────────────────────────

function ScoreHistogram({ data }) {
  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Score Distribution</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'var(--qs-dim)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--qs-dim)' }} allowDecimals={false} />
          <Tooltip
            formatter={(v) => [`${v} leads`, 'Count']}
            contentStyle={{
              background: 'var(--qs-card)',
              border: '1px solid var(--qs-border)',
              borderRadius: 8,
              padding: '8px 12px',
            }}
            labelStyle={{ color: 'var(--qs-bright)', fontWeight: 600, fontSize: 13 }}
            itemStyle={{ color: 'var(--qs-dim)', fontSize: 12 }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={36}>
            {data.map((entry, i) => (
              <Cell key={entry.bucket} fill={SCORE_COLORS[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Owner vs Renter Split ──────────────────────────────────────────────────

function OwnerRenterCard({ owners, renters }) {
  const total = owners + renters;
  const ownerPct = total > 0 ? Math.round((owners / total) * 100) : 0;
  const renterPct = total > 0 ? 100 - ownerPct : 0;

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Owner vs. Renter</h3>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-4 rounded-full overflow-hidden flex" style={{ background: 'var(--qs-elevated)' }}>
          <div
            className="h-full bg-primary-500 transition-all"
            style={{ width: `${ownerPct}%` }}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${renterPct}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-xs" style={{ color: 'var(--qs-dim)' }}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary-500 inline-block" />
          Owners: {owners} ({ownerPct}%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Renters: {renters} ({renterPct}%)
        </span>
      </div>
      {renterPct > 60 && (
        <p className="text-xs text-amber-600 mt-2">High renter ratio — consider adjusting ad targeting for homeowners.</p>
      )}
    </div>
  );
}

// ─── Product Intent Mix ─────────────────────────────────────────────────────

function IntentMixCard({ intentMix }) {
  const total = Object.values(intentMix).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Product Intent Mix</h3>
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}>No data</p>
      </div>
    );
  }

  const entries = Object.entries(intentMix)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Product Intent Mix</h3>
      <div className="space-y-2">
        {entries.map(([key, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-0.5" style={{ color: 'var(--qs-dim)' }}>
                <span>{INTENT_LABELS[key] || key}</span>
                <span>{count} ({pct}%)</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--qs-elevated)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: INTENT_COLORS[key] || '#9ca3af' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Risk Profile Card ──────────────────────────────────────────────────────

function RiskProfileCard({ riskProfile }) {
  const { cleanDriving, incidents12, incidents3plus, claims01, claims2plus } = riskProfile;
  const totalDriving = cleanDriving + incidents12 + incidents3plus;
  const totalClaims = claims01 + claims2plus;

  const drivingData = totalDriving > 0 ? [
    { name: 'Clean', value: cleanDriving, color: '#22c55e' },
    { name: '1-2 Incidents', value: incidents12, color: '#f59e0b' },
    { name: '3+ Incidents', value: incidents3plus, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Risk Profile</h3>

      {totalDriving > 0 && (
        <div className="mb-3">
          <p className="text-xs mb-1" style={{ color: 'var(--qs-subtle)' }}>Driving Record</p>
          <div className="flex items-center gap-2 h-4 rounded-full overflow-hidden" style={{ background: 'var(--qs-elevated)' }}>
            {drivingData.map(d => (
              <div
                key={d.name}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(d.value / totalDriving) * 100}%`, backgroundColor: d.color }}
                title={`${d.name}: ${d.value}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--qs-subtle)' }}>
            {drivingData.map(d => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                {d.name}: {Math.round((d.value / totalDriving) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {totalClaims > 0 && (
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--qs-subtle)' }}>Home Claims</p>
          <div className="flex items-center gap-2 h-4 rounded-full overflow-hidden" style={{ background: 'var(--qs-elevated)' }}>
            <div
              className="h-full rounded-l-full"
              style={{ width: `${(claims01 / totalClaims) * 100}%`, backgroundColor: '#22c55e' }}
            />
            <div
              className="h-full rounded-r-full"
              style={{ width: `${(claims2plus / totalClaims) * 100}%`, backgroundColor: '#ef4444' }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--qs-subtle)' }}>
            <span>0-1 Claims: {Math.round((claims01 / totalClaims) * 100)}%</span>
            <span>2+ Claims: {Math.round((claims2plus / totalClaims) * 100)}%</span>
          </div>
        </div>
      )}

      {totalDriving === 0 && totalClaims === 0 && (
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}>No risk data available</p>
      )}

      {incidents3plus > 0 && totalDriving > 0 && (incidents3plus / totalDriving) > 0.15 && (
        <p className="text-xs text-red-600 mt-2">High share of 3+ incident leads — ad targeting may be pulling high-risk profiles.</p>
      )}
    </div>
  );
}

// ─── Channel Performance Table ──────────────────────────────────────────────

function ChannelTable({ channels }) {
  if (!channels || channels.length === 0) {
    return (
      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Channel Performance</h3>
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}>No channel data available</p>
      </div>
    );
  }

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Channel Performance</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--qs-border)' }}>
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Channel</th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Leads</th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Conv Rate</th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Avg Score</th>
              <th className="text-left py-2 pl-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Top Intent</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(ch => (
              <tr key={ch.channel} style={{ borderTop: '1px solid var(--qs-border)' }}>
                <td className="py-2 pr-4 font-medium capitalize" style={{ color: 'var(--qs-bright)' }}>{ch.channel}</td>
                <td className="py-2 px-4 text-right" style={{ color: 'var(--qs-text)' }}>{ch.leads}</td>
                <td className="py-2 px-4 text-right" style={{ color: 'var(--qs-text)' }}>{ch.conversionRate}%</td>
                <td className="py-2 px-4 text-right">
                  <span className={`${ch.avgScore >= 60 ? 'text-green-600' : ch.avgScore >= 40 ? 'text-yellow-600' : ''} font-medium`}
                    style={ch.avgScore < 40 ? { color: 'var(--qs-dim)' } : undefined}
                  >
                    {ch.avgScore}
                  </span>
                </td>
                <td className="py-2 pl-4 capitalize" style={{ color: 'var(--qs-dim)' }}>{ch.topIntent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── No Prior Insurance Callout (NEW-3) ──────────────────────────────────────

function NoPriorInsuranceCallout({ noPriorInsurance, totalCompleted }) {
  if (!noPriorInsurance || totalCompleted === 0) return null;

  const autoPct = Math.round((noPriorInsurance.auto / totalCompleted) * 100);
  const homePct = Math.round((noPriorInsurance.home / totalCompleted) * 100);

  // Only show callout if either exceeds 15% threshold
  if (autoPct <= 15 && homePct <= 15) return null;

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }}>
      {autoPct > 15 && (
        <p className="text-xs" style={{ color: 'var(--qs-warning)' }}>
          {autoPct}% of leads have no prior auto insurance — these are hard to place at standard rates. Consider routing to a non-standard market partner.
        </p>
      )}
      {homePct > 15 && (
        <p className={`text-xs ${autoPct > 15 ? 'mt-1' : ''}`} style={{ color: 'var(--qs-warning)' }}>
          {homePct}% of leads have no prior home insurance — limited carrier options for first-time buyers.
        </p>
      )}
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function LeadQuality({ quality, channels }) {
  if (!quality) return null;

  const { scoreDistribution, ownerRenterSplit, intentMix, riskProfile, noPriorInsurance } = quality;
  const totalCompleted = scoreDistribution.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Lead Quality & Scoring</h2>

      {/* Score Histogram — full width */}
      <ScoreHistogram data={scoreDistribution} />

      {/* 3-card row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <OwnerRenterCard owners={ownerRenterSplit.owners} renters={ownerRenterSplit.renters} />
        <IntentMixCard intentMix={intentMix} />
        <RiskProfileCard riskProfile={riskProfile} />
      </div>

      {/* NEW-3: No prior insurance callout */}
      <NoPriorInsuranceCallout noPriorInsurance={noPriorInsurance} totalCompleted={totalCompleted} />

      {/* Channel table */}
      <ChannelTable channels={channels} />
    </div>
  );
}
