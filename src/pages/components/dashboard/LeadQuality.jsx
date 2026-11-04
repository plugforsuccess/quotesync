// src/pages/components/dashboard/LeadQuality.jsx
// Section 3: Lead Quality & Scoring — histogram, splits, channel table

import Dismissible from '../../../components/Dismissible';
import { T } from '../../../components/SiteCopy';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import { useChartTheme } from '../../../lib/chartTheme';

const INTENT_LABELS = {
  auto: 'Auto',
  home: 'Home',
  bundle: 'Bundle',
  auto_renters: 'Auto + Renters',
  unsure: 'Unsure',
};

// ─── Score Distribution Histogram ────────────────────────────────────────────

function ScoreHistogram({ data }) {
  const ct = useChartTheme();
  const SCORE_COLORS = [ct.data.red, ct.data.amber, ct.data.amber, ct.data.green, ct.data.green];
  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.e04b83">Score Distribution</T></h3>
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
            cursor={ct.tooltipCursor}
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
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.b815dc">Owner vs. Renter</T></h3>
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
          <T k="pages.components.dashboard.leadquality.01acd2">Owners:</T> {owners} ({ownerPct}%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          <T k="pages.components.dashboard.leadquality.130d3b">Renters:</T> {renters} ({renterPct}%)
        </span>
      </div>
      {renterPct > 60 && (
        <p className="text-xs text-amber-600 mt-2"><T k="pages.components.dashboard.leadquality.35b37a">High renter ratio — consider adjusting ad targeting for homeowners.</T></p>
      )}
    </div>
  );
}

// ─── Product Intent Mix ─────────────────────────────────────────────────────

function IntentMixCard({ intentMix }) {
  const ct = useChartTheme();
  const INTENT_COLORS = {
    auto:         ct.data.blue,
    home:         ct.data.purple,
    bundle:       ct.data.green,
    auto_renters: ct.data.cyan,
    unsure:       ct.data.slate,
  };
  const total = Object.values(intentMix).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.03364c">Product Intent Mix</T></h3>
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}><T k="pages.components.dashboard.leadquality.42a7b2">No data</T></p>
      </div>
    );
  }

  const entries = Object.entries(intentMix)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.03364c">Product Intent Mix</T></h3>
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
                  style={{ width: `${pct}%`, backgroundColor: INTENT_COLORS[key] || ct.data.slate }}
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
  const ct = useChartTheme();
  const { cleanDriving, incidents12, incidents3plus, claims01, claims2plus } = riskProfile;
  const totalDriving = cleanDriving + incidents12 + incidents3plus;
  const totalClaims = claims01 + claims2plus;

  const drivingData = totalDriving > 0 ? [
    { name: 'Clean', value: cleanDriving, color: ct.data.green },
    { name: '1-2 Incidents', value: incidents12, color: ct.data.amber },
    { name: '3+ Incidents', value: incidents3plus, color: ct.data.red },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.52eb38">Risk Profile</T></h3>

      {totalDriving > 0 && (
        <div className="mb-3">
          <p className="text-xs mb-1" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.36e031">Driving Record</T></p>
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
          <p className="text-xs mb-1" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.b5d8f3">Home Claims</T></p>
          <div className="flex items-center gap-2 h-4 rounded-full overflow-hidden" style={{ background: 'var(--qs-elevated)' }}>
            <div
              className="h-full rounded-l-full"
              style={{ width: `${(claims01 / totalClaims) * 100}%`, backgroundColor: ct.data.green }}
            />
            <div
              className="h-full rounded-r-full"
              style={{ width: `${(claims2plus / totalClaims) * 100}%`, backgroundColor: ct.data.red }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--qs-subtle)' }}>
            <span><T k="pages.components.dashboard.leadquality.eba974">0-1 Claims:</T> {Math.round((claims01 / totalClaims) * 100)}%</span>
            <span><T k="pages.components.dashboard.leadquality.65140d">2+ Claims:</T> {Math.round((claims2plus / totalClaims) * 100)}%</span>
          </div>
        </div>
      )}

      {totalDriving === 0 && totalClaims === 0 && (
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}><T k="pages.components.dashboard.leadquality.305ba6">No risk data available</T></p>
      )}

      {incidents3plus > 0 && totalDriving > 0 && (incidents3plus / totalDriving) > 0.15 && (
        <p className="text-xs text-red-600 mt-2"><T k="pages.components.dashboard.leadquality.529b5e">High share of 3+ incident leads — ad targeting may be pulling high-risk profiles.</T></p>
      )}
    </div>
  );
}

// ─── Channel Performance Table ──────────────────────────────────────────────

function ChannelTable({ channels }) {
  if (!channels || channels.length === 0) {
    return (
      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.5f2ec5">Channel Performance</T></h3>
        <p className="text-sm" style={{ color: 'var(--qs-muted)' }}><T k="pages.components.dashboard.leadquality.e31115">No channel data available</T></p>
      </div>
    );
  }

  return (
    <div className="dark-card">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.5f2ec5">Channel Performance</T></h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--qs-border)' }}>
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.781dc9">Channel</T></th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.ae5361">Leads</T></th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.90788f">Conv Rate</T></th>
              <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.24b362">Avg Score</T></th>
              <th className="text-left py-2 pl-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.dashboard.leadquality.80d21b">Top Intent</T></th>
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
    <Dismissible id="dashboard.no-prior-insurance" version={`${autoPct}:${homePct}`}>
    <div className="rounded-lg p-4" style={{ background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }}>
      {autoPct > 15 && (
        <p className="text-xs" style={{ color: 'var(--qs-warning)' }}>
          {autoPct}<T k="pages.components.dashboard.leadquality.5cd19c">% of leads have no prior auto insurance — these are hard to place at standard rates. Consider routing to a non-standard market partner.</T>
        </p>
      )}
      {homePct > 15 && (
        <p className={`text-xs ${autoPct > 15 ? 'mt-1' : ''}`} style={{ color: 'var(--qs-warning)' }}>
          {homePct}<T k="pages.components.dashboard.leadquality.974d52">% of leads have no prior home insurance — limited carrier options for first-time buyers.</T>
        </p>
      )}
    </div>
    </Dismissible>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function LeadQuality({ quality, channels }) {
  if (!quality) return null;

  const { scoreDistribution, ownerRenterSplit, intentMix, riskProfile, noPriorInsurance } = quality;
  const totalCompleted = scoreDistribution.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.dashboard.leadquality.1b0751">Lead Quality & Scoring</T></h2>

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
