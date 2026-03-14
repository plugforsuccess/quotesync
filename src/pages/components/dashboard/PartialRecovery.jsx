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
        <h2 className="text-lg font-semibold text-gray-900">Partial Lead Recovery</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Partials */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">Total Partials</div>
          <div className="text-3xl font-bold text-gray-900">{total.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">In selected period</div>
        </div>

        {/* Recoverable */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">Recoverable</div>
          <div className="text-3xl font-bold text-amber-600">{recoverableCount}</div>
          <div className="text-xs text-gray-400 mt-1">Have ZIP + less than 7 days old</div>
        </div>

        {/* Recovery Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">Recovery Rate</div>
          <div className={`text-3xl font-bold ${recoveryRate > 10 ? 'text-green-600' : recoveryRate > 5 ? 'text-yellow-600' : 'text-gray-600'}`}>
            {recoveryRate}%
          </div>
          <div className="text-xs text-gray-400 mt-1">Partials that later completed</div>
        </div>
      </div>

      {/* Drop-off Breakdown */}
      {dropOffByStep.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Where Partials Dropped Off</h3>
          <div className="space-y-2">
            {dropOffByStep.slice(0, 6).map(({ step, count }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={step}>
                  <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                    <span>{step}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Recent Recoverable Partials
            <span className="ml-2 text-xs text-gray-400 font-normal">Top {recentRecoverable.length} by data completeness</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">ZIP</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Own/Rent</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Intent</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Carrier</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Last Step</th>
                  <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="py-2 pl-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentRecoverable.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-600">{formatTimeAgo(p.createdAt)}</td>
                    <td className="py-2 px-4 font-medium text-gray-900">{p.zip || '-'}</td>
                    <td className="py-2 px-4 text-gray-600">
                      {p.ownsHome === true ? 'Owner' : p.ownsHome === false ? 'Renter' : '-'}
                    </td>
                    <td className="py-2 px-4 text-gray-600 capitalize">{p.intent || '-'}</td>
                    <td className="py-2 px-4 text-gray-600">{p.carrier || '-'}</td>
                    <td className="py-2 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        {p.lastStep}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      {p.score != null ? (
                        <span className={`font-medium ${p.score >= 60 ? 'text-green-600' : p.score >= 40 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {p.score}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-2 pl-4">
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No recoverable partials found (all partials are older than 7 days or lack ZIP data)</p>
        </div>
      )}
    </div>
  );
}
