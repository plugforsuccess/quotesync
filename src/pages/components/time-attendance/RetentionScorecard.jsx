import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

function MetricRow({ label, value, sub, color = 'var(--qs-text)', warn = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--qs-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--qs-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
        {label}
      </span>
      <div className="text-right">
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
        {sub && <p style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function RetentionScorecard({ metrics, isLoading }) {
  if (isLoading) {
    return (
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }} className="text-center text-qs-muted text-sm">
        Loading retention data...
      </div>
    );
  }

  if (!metrics || (metrics.cancelTotal === 0 && metrics.renewalTotal === 0 && metrics.inboundClosures === 0)) {
    return (
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }} className="text-center">
        <Shield className="w-10 h-10 text-qs-muted mx-auto mb-2" />
        <p className="text-qs-subtle text-sm">No retention cases assigned yet.</p>
        <p className="text-xs text-qs-muted mt-1">
          Upload a Pending Cancellation or Renewal report and assign cases to see metrics.
        </p>
      </div>
    );
  }

  const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (r) => r !== null && r !== undefined ? `${Math.round(r * 100)}%` : '—';

  const saveRateColor = metrics.cancelSaveRate === null ? '#94A3B8'
    : metrics.cancelSaveRate >= 0.7 ? '#10B981'
    : metrics.cancelSaveRate >= 0.5 ? '#F59E0B'
    : '#EF4444';

  const promiseColor = metrics.promiseFollowThrough === null ? '#94A3B8'
    : metrics.promiseFollowThrough >= 0.8 ? '#10B981'
    : metrics.promiseFollowThrough >= 0.6 ? '#F59E0B'
    : '#EF4444';

  // Days-before-renewal color: green >=21 days (in window), amber 7-20, red <7
  const daysColor = metrics.avgDaysBeforeRenewal === null ? '#94A3B8'
    : metrics.avgDaysBeforeRenewal >= 21 ? '#10B981'
    : metrics.avgDaysBeforeRenewal >= 7  ? '#F59E0B'
    : '#EF4444';

  const isOutbound = metrics.scoreType === 'outbound' || metrics.scoreType === 'both';
  const isInbound  = metrics.scoreType === 'inbound'  || metrics.scoreType === 'both';

  return (
    <div className="space-y-4">

      {/* Outbound section — Pending Cancellations */}
      {isOutbound && metrics.cancelTotal > 0 && (
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-amber-900/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h4 className="text-sm font-semibold text-qs-bright">Pending Cancellations</h4>
            <span className="ml-auto text-xs text-qs-muted">
              {metrics.cancelTotal} opened · {metrics.cancelWorkable} active
            </span>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.cancelContactRate)}
            sub={`${metrics.totalCancelAttempts} total attempts`}
            color={metrics.cancelContactRate >= 0.8 ? '#10B981' : '#F59E0B'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.cancelReachRate)}
            sub="cases where customer answered"
            color={metrics.cancelReachRate >= 0.5 ? '#10B981' : '#F59E0B'}
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
            color="#10B981"
          />
          <MetricRow
            label="Premium Still at Risk"
            value={fmt$(metrics.premiumAtRisk)}
            color={metrics.premiumAtRisk > 0 ? '#F59E0B' : '#94A3B8'}
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
          <p className="text-xs text-qs-muted mt-3">
            Save rate based on cases you originated (opener credit model).
          </p>
        </div>
      )}

      {/* Outbound section — Renewals */}
      {isOutbound && metrics.renewalTotal > 0 && (
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-blue-900/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="text-sm font-semibold text-qs-bright">Renewals</h4>
            <div className="ml-auto text-right">
              <span className="text-xs text-qs-muted">{metrics.renewalWorkable} workable</span>
            </div>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.renewalContactRate)}
            sub={`${metrics.totalRenewalAttempts} total attempts`}
            color={metrics.renewalContactRate >= 0.8 ? '#10B981' : '#F59E0B'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.renewalReachRate)}
            sub="cases where customer answered"
            color={metrics.renewalReachRate >= 0.5 ? '#10B981' : '#F59E0B'}
          />
          <MetricRow
            label="Retention Rate"
            value={fmtPct(metrics.renewalRetainRate)}
            sub={`${metrics.renewalsConfirmed} confirmed · ${metrics.renewalsLost} lost`}
            color={metrics.renewalRetainRate >= 0.8 ? '#10B981' : '#F59E0B'}
          />
          <MetricRow
            label="Premium Retained"
            value={fmt$(metrics.renewalPremiumRetained)}
            color="#10B981"
          />
          {metrics.renewalsShopping > 0 && (
            <MetricRow
              label="Shopping (Escalated)"
              value={`${metrics.renewalsShopping} policies`}
              sub={metrics.renewalsEscalated > 0 ? `${metrics.renewalsEscalated} escalated to agent` : 'awaiting escalation'}
              color="#F59E0B"
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

      {/* Inbound section — Tracy's metrics */}
      {isInbound && metrics.inboundClosures > 0 && (
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-blue-900/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="text-sm font-semibold text-qs-bright">Inbound Closures</h4>
            <span className="ml-auto text-xs text-qs-muted">cases originated by others</span>
          </div>
          <MetricRow
            label="Callbacks Closed"
            value={metrics.inboundClosures}
            sub="cases opened by outbound rep, closed by you"
            color="#60A5FA"
          />
          <MetricRow
            label="Premium Closed"
            value={fmt$(metrics.inboundPremiumClosed)}
            color="#10B981"
          />
          <p className="text-xs text-qs-muted mt-3">
            These cases are credited to the outbound rep who originated them.
            This section reflects your service volume only.
          </p>
        </div>
      )}

    </div>
  );
}
