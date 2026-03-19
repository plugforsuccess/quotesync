// src/pages/components/dashboard/KPICards.jsx
// KPI card row: Submissions, Conversion Rate, Avg Lead Score, Run Rate Projection

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function TrendBadge({ current, prior, suffix = '' }) {
  if (prior == null || prior === 0) return null;
  const delta = current - prior;
  const pct = Math.round((delta / prior) * 100);
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${isUp ? 'text-green-600' : 'text-red-600'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct}%{suffix}
    </span>
  );
}

export default function KPICards({ kpis, priorPeriod }) {
  if (!kpis) return null;

  const {
    submissions, conversionRate, avgScore,
    projectedMonthly, gapTo700,
  } = kpis;

  // Score color
  const scoreColor = avgScore >= 60
    ? 'text-green-600'
    : avgScore >= 40
      ? 'text-yellow-600'
      : 'text-red-600';

  // Projection color
  const projColor = projectedMonthly >= 700
    ? 'text-green-600'
    : projectedMonthly >= 560
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Submissions */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Submissions</span>
          <TrendBadge current={submissions} prior={priorPeriod?.submissions} />
        </div>
        <div className="text-3xl font-bold" style={{ color: 'var(--qs-bright)' }}>{submissions.toLocaleString()}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>Target: 700/mo</div>
      </div>

      {/* Conversion Rate */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Conversion Rate</span>
          <TrendBadge current={conversionRate} prior={priorPeriod?.conversionRate} />
        </div>
        <div className="text-3xl font-bold" style={{ color: 'var(--qs-bright)' }}>{conversionRate}%</div>
        <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>Visits &rarr; Submissions</div>
      </div>

      {/* Avg Lead Score */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Avg Lead Score</span>
          <TrendBadge current={avgScore} prior={priorPeriod?.avgScore} />
        </div>
        <div className={`text-3xl font-bold ${scoreColor}`}>{avgScore}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>
          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${avgScore >= 60 ? 'bg-green-500' : avgScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} />
          {avgScore >= 60 ? 'Good' : avgScore >= 40 ? 'Fair' : 'Low'}
        </div>
      </div>

      {/* Run Rate Projection */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Projected This Month</span>
        </div>
        <div className={`text-3xl font-bold ${projColor}`}>{projectedMonthly.toLocaleString()}</div>
        <div className={`text-xs mt-1 ${projColor}`}>
          {gapTo700 >= 0
            ? `On pace for ${projectedMonthly} (+${gapTo700})`
            : `Tracking to ${projectedMonthly} (${gapTo700} short)`
          }
        </div>
      </div>
    </div>
  );
}
