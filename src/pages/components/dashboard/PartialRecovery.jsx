// src/pages/components/dashboard/PartialRecovery.jsx
// Section 6: Partial Lead Recovery — summary, table, recovery rate

import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';

function formatTimeAgo(date) {
  if (!date) return '-';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  return diffMins > 0 ? `${diffMins}m ago` : 'Just now';
}

export default function PartialRecovery({ partials }) {
  if (!partials) return null;

  const { total, recoverableCount, dropOffByStep, recentRecoverable, recoveryRate } = partials;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Partial Lead Recovery</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Partials */}
        <div className="dark-card">
          <div className="text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>Total Partials</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--qs-bright)' }}>{total.toLocaleString()}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>In selected period</div>
        </div>

        {/* Recoverable */}
        <div className="dark-card">
          <div className="text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>Recoverable</div>
          <div className="text-3xl font-bold text-amber-600">{recoverableCount}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>Have ZIP + less than 7 days old</div>
        </div>

        {/* Recovery Rate */}
        <div className="dark-card">
          <div className="text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>Recovery Rate</div>
          <div className={`text-3xl font-bold ${recoveryRate > 10 ? 'text-green-600' : recoveryRate > 5 ? 'text-yellow-600' : ''}`}
            style={recoveryRate <= 5 ? { color: 'var(--qs-dim)' } : undefined}
          >
            {recoveryRate}%
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--qs-muted)' }}>Partials that later completed</div>
        </div>
      </div>

      {/* Drop-off Breakdown */}
      {dropOffByStep.length > 0 && (
        <div className="dark-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>Where Partials Dropped Off</h3>
          <div className="space-y-2">
            {dropOffByStep.slice(0, 6).map(({ step, count }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={step}>
                  <div className="flex justify-between text-xs mb-0.5" style={{ color: 'var(--qs-dim)' }}>
                    <span>{step}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--qs-elevated)' }}>
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Recoverable Partials Table */}
      {recentRecoverable.length > 0 && (
        <div className="dark-card" style={{ padding: 0 }}>
          <div style={{ padding: '20px 20px 0' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-bright)' }}>
              Recent Recoverable Partials
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--qs-muted)' }}>Top {recentRecoverable.length} by data completeness</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                  <th className="text-left py-2 pr-4 pl-5 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Created</th>
                  <th className="text-left py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>ZIP</th>
                  <th className="text-left py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Own/Rent</th>
                  <th className="text-left py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Intent</th>
                  <th className="text-left py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Carrier</th>
                  <th className="text-left py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Last Step</th>
                  <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Score</th>
                  <th className="py-2 pl-4 pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {recentRecoverable.map(p => (
                  <tr
                    key={p.id}
                    style={{ borderTop: '1px solid var(--qs-border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--qs-elevated)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <td className="py-2 pr-4 pl-5" style={{ color: 'var(--qs-dim)' }}>{formatTimeAgo(p.createdAt)}</td>
                    <td className="py-2 px-4 font-medium" style={{ color: 'var(--qs-bright)' }}>{p.zip || '-'}</td>
                    <td className="py-2 px-4" style={{ color: 'var(--qs-dim)' }}>
                      {p.ownsHome === true ? 'Owner' : p.ownsHome === false ? 'Renter' : '-'}
                    </td>
                    <td className="py-2 px-4 capitalize" style={{ color: 'var(--qs-dim)' }}>{p.intent || '-'}</td>
                    <td className="py-2 px-4" style={{ color: 'var(--qs-dim)' }}>{p.carrier || '-'}</td>
                    <td className="py-2 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        {p.lastStep}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      {p.score != null ? (
                        <span className={`font-medium ${p.score >= 60 ? 'text-green-600' : p.score >= 40 ? 'text-yellow-600' : ''}`}
                          style={p.score < 40 ? { color: 'var(--qs-dim)' } : undefined}
                        >
                          {p.score}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-2 pl-4 pr-5">
                      <Link
                        to={`/agency/leads/${p.id}`}
                        className="text-primary-600 hover:text-primary-800 inline-flex items-center gap-1 text-xs"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentRecoverable.length === 0 && total > 0 && (
        <div className="dark-card text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--qs-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>No recoverable partials found (all partials are older than 7 days or lack ZIP data)</p>
        </div>
      )}
    </div>
  );
}
