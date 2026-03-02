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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Score Distribution</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} leads`, 'Count']} />
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Owner vs. Renter</h3>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden flex">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${ownerPct}%` }}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${renterPct}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Product Intent Mix</h3>
        <p className="text-sm text-gray-400">No data</p>
      </div>
    );
  }

  const entries = Object.entries(intentMix)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Product Intent Mix</h3>
      <div className="space-y-2">
        {entries.map(([key, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span>{INTENT_LABELS[key] || key}</span>
                <span>{count} ({pct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Risk Profile</h3>

      {totalDriving > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">Driving Record</p>
          <div className="flex items-center gap-2 h-4 rounded-full bg-gray-100 overflow-hidden">
            {drivingData.map(d => (
              <div
                key={d.name}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(d.value / totalDriving) * 100}%`, backgroundColor: d.color }}
                title={`${d.name}: ${d.value}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
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
          <p className="text-xs text-gray-500 mb-1">Home Claims</p>
          <div className="flex items-center gap-2 h-4 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-l-full"
              style={{ width: `${(claims01 / totalClaims) * 100}%`, backgroundColor: '#22c55e' }}
            />
            <div
              className="h-full rounded-r-full"
              style={{ width: `${(claims2plus / totalClaims) * 100}%`, backgroundColor: '#ef4444' }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0-1 Claims: {Math.round((claims01 / totalClaims) * 100)}%</span>
            <span>2+ Claims: {Math.round((claims2plus / totalClaims) * 100)}%</span>
          </div>
        </div>
      )}

      {totalDriving === 0 && totalClaims === 0 && (
        <p className="text-sm text-gray-400">No risk data available</p>
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Channel Performance</h3>
        <p className="text-sm text-gray-400">No channel data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Channel Performance</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Channel</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Leads</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Conv Rate</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Avg Score</th>
              <th className="text-left py-2 pl-4 text-xs font-medium text-gray-500 uppercase">Top Intent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {channels.map(ch => (
              <tr key={ch.channel}>
                <td className="py-2 pr-4 font-medium text-gray-900 capitalize">{ch.channel}</td>
                <td className="py-2 px-4 text-right text-gray-700">{ch.leads}</td>
                <td className="py-2 px-4 text-right text-gray-700">{ch.conversionRate}%</td>
                <td className="py-2 px-4 text-right">
                  <span className={`${ch.avgScore >= 60 ? 'text-green-600' : ch.avgScore >= 40 ? 'text-yellow-600' : 'text-gray-600'} font-medium`}>
                    {ch.avgScore}
                  </span>
                </td>
                <td className="py-2 pl-4 text-gray-600 capitalize">{ch.topIntent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function LeadQuality({ quality, channels }) {
  if (!quality) return null;

  const { scoreDistribution, ownerRenterSplit, intentMix, riskProfile } = quality;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Lead Quality & Scoring</h2>

      {/* Score Histogram — full width */}
      <ScoreHistogram data={scoreDistribution} />

      {/* 3-card row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <OwnerRenterCard owners={ownerRenterSplit.owners} renters={ownerRenterSplit.renters} />
        <IntentMixCard intentMix={intentMix} />
        <RiskProfileCard riskProfile={riskProfile} />
      </div>

      {/* Channel table */}
      <ChannelTable channels={channels} />
    </div>
  );
}
