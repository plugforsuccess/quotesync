import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

function MetricRow({ label, value, sub, color = 'text-gray-900', warn = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600 flex items-center gap-1">
        {warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
        {label}
      </span>
      <div className="text-right">
        <span className={`text-sm font-semibold ${color}`}>{value}</span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function RetentionScorecard({ metrics, isLoading }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-sm">
        Loading retention data...
      </div>
    );
  }

  if (!metrics || (metrics.cancelTotal === 0 && metrics.renewalTotal === 0)) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <Shield className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No retention cases assigned yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Upload a Pending Cancellation or Renewal report and assign cases to see metrics.
        </p>
      </div>
    );
  }

  const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (r) => r !== null && r !== undefined ? `${Math.round(r * 100)}%` : '—';

  const saveRateColor = metrics.cancelSaveRate === null ? 'text-gray-400'
    : metrics.cancelSaveRate >= 0.7 ? 'text-green-600'
    : metrics.cancelSaveRate >= 0.5 ? 'text-yellow-600'
    : 'text-red-600';

  const promiseColor = metrics.promiseFollowThrough === null ? 'text-gray-400'
    : metrics.promiseFollowThrough >= 0.8 ? 'text-green-600'
    : metrics.promiseFollowThrough >= 0.6 ? 'text-yellow-600'
    : 'text-red-600';

  // Days-before-renewal color: green >=21 days (in window), amber 7-20, red <7
  const daysColor = metrics.avgDaysBeforeRenewal === null ? 'text-gray-400'
    : metrics.avgDaysBeforeRenewal >= 21 ? 'text-green-600'
    : metrics.avgDaysBeforeRenewal >= 7  ? 'text-yellow-600'
    : 'text-red-600';

  return (
    <div className="space-y-4">

      {/* Pending Cancellations */}
      {metrics.cancelTotal > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-amber-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Pending Cancellations</h4>
            <span className="ml-auto text-xs text-gray-400">{metrics.cancelTotal} assigned</span>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.cancelContactRate)}
            sub={`${metrics.totalCancelAttempts} total attempts`}
            color={metrics.cancelContactRate >= 0.8 ? 'text-green-600' : 'text-yellow-600'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.cancelReachRate)}
            sub="cases where customer answered"
            color={metrics.cancelReachRate >= 0.5 ? 'text-green-600' : 'text-yellow-600'}
          />
          <MetricRow
            label="Save Rate"
            value={fmtPct(metrics.cancelSaveRate)}
            sub={`${metrics.cancelSaved} saved · ${metrics.cancelLost} lost`}
            color={saveRateColor}
          />
          <MetricRow
            label="Premium Saved"
            value={fmt$(metrics.premiumSaved)}
            color="text-green-600"
          />
          <MetricRow
            label="Premium Still at Risk"
            value={fmt$(metrics.premiumAtRisk)}
            color={metrics.premiumAtRisk > 0 ? 'text-amber-600' : 'text-gray-400'}
          />
          {metrics.promisesDue > 0 && (
            <MetricRow
              label="Promise Follow-Through"
              value={fmtPct(metrics.promiseFollowThrough)}
              sub={`${metrics.promisesKept} of ${metrics.promisesDue} kept`}
              color={promiseColor}
              warn={metrics.promiseFollowThrough !== null && metrics.promiseFollowThrough < 0.6}
            />
          )}
        </div>
      )}

      {/* Renewals */}
      {metrics.renewalTotal > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-blue-600" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Renewals</h4>
            <span className="ml-auto text-xs text-gray-400">{metrics.renewalTotal} assigned</span>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.renewalContactRate)}
            sub={`${metrics.totalRenewalAttempts} total attempts`}
            color={metrics.renewalContactRate >= 0.8 ? 'text-green-600' : 'text-yellow-600'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.renewalReachRate)}
            sub="cases where customer answered"
            color={metrics.renewalReachRate >= 0.5 ? 'text-green-600' : 'text-yellow-600'}
          />
          <MetricRow
            label="Retention Rate"
            value={fmtPct(metrics.renewalRetainRate)}
            sub={`${metrics.renewalsConfirmed} confirmed · ${metrics.renewalsLost} lost`}
            color={metrics.renewalRetainRate >= 0.8 ? 'text-green-600' : 'text-yellow-600'}
          />
          <MetricRow
            label="Premium Retained"
            value={fmt$(metrics.renewalPremiumRetained)}
            color="text-green-600"
          />
          {metrics.renewalsShopping > 0 && (
            <MetricRow
              label="Shopping (Escalated)"
              value={`${metrics.renewalsShopping} policies`}
              sub={metrics.renewalsEscalated > 0 ? `${metrics.renewalsEscalated} escalated to agent` : 'awaiting escalation'}
              color="text-amber-600"
              warn={metrics.renewalsShopping > 0 && metrics.renewalsEscalated === 0}
            />
          )}
          {metrics.avgDaysBeforeRenewal !== null && (
            <MetricRow
              label="Avg Days Before Renewal"
              value={`${metrics.avgDaysBeforeRenewal} days`}
              sub="at first contact attempt"
              color={daysColor}
              warn={metrics.avgDaysBeforeRenewal < 7}
            />
          )}
        </div>
      )}
    </div>
  );
}
