import { T } from '../../../components/SiteCopy';
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

function MetricRow({ label, value, sub, color = 'var(--qs-text)', warn = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--qs-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--qs-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
        <T>{label}</T>
      </span>
      <div className="text-right">
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
        {sub && <p style={{ fontSize: 11, color: 'var(--qs-subtle)' }}><T>{sub}</T></p>}
      </div>
    </div>
  );
}

export default function RetentionScorecard({ metrics, isLoading }) {
  if (isLoading) {
    return (
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }} className="text-center text-qs-muted text-sm">
        <T k="pages.components.timeattendance.retentionscorecard.c3e640">Loading retention data...</T>
      </div>
    );
  }

  if (!metrics || (metrics.cancelTotal === 0 && metrics.renewalTotal === 0 && metrics.inboundClosures === 0)) {
    return (
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 20 }} className="text-center">
        <Shield className="w-10 h-10 text-qs-muted mx-auto mb-2" />
        <p className="text-qs-subtle text-sm"><T k="pages.components.timeattendance.retentionscorecard.b203dd">No retention cases assigned yet.</T></p>
        <p className="text-xs text-qs-muted mt-1">
          <T k="pages.components.timeattendance.retentionscorecard.07704c">Upload a Pending Cancellation or Renewal report and assign cases to see metrics.</T>
        </p>
      </div>
    );
  }

  const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (r) => r !== null && r !== undefined ? `${Math.round(r * 100)}%` : '—';

  const saveRateColor = metrics.cancelSaveRate === null ? 'var(--qs-dim)'
    : metrics.cancelSaveRate >= 0.7 ? 'var(--qs-success)'
    : metrics.cancelSaveRate >= 0.5 ? 'var(--qs-text)'
    : 'var(--qs-danger)';

  const promiseColor = metrics.promiseFollowThrough === null ? 'var(--qs-dim)'
    : metrics.promiseFollowThrough >= 0.8 ? 'var(--qs-success)'
    : metrics.promiseFollowThrough >= 0.6 ? 'var(--qs-text)'
    : 'var(--qs-danger)';

  // Days-before-renewal color: gold >=21 days (in window), plain 7-20, red <7
  const daysColor = metrics.avgDaysBeforeRenewal === null ? 'var(--qs-dim)'
    : metrics.avgDaysBeforeRenewal >= 21 ? 'var(--qs-success)'
    : metrics.avgDaysBeforeRenewal >= 7  ? 'var(--qs-text)'
    : 'var(--qs-danger)';

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
            <h4 className="text-sm font-semibold text-qs-bright"><T k="pages.components.timeattendance.retentionscorecard.f678b4">Pending Cancellations</T></h4>
            <span className="ml-auto text-xs text-qs-muted">
              {metrics.cancelTotal} <T k="pages.components.timeattendance.retentionscorecard.570ead">opened ·</T> {metrics.cancelWorkable} <T k="pages.components.timeattendance.retentionscorecard.c76a5e">active</T>
            </span>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.cancelContactRate)}
            sub={`${metrics.totalCancelAttempts} total attempts`}
            color={metrics.cancelContactRate >= 0.8 ? 'var(--qs-success)' : 'var(--qs-text)'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.cancelReachRate)}
            sub="cases where customer answered"
            color={metrics.cancelReachRate >= 0.5 ? 'var(--qs-success)' : 'var(--qs-text)'}
          />
          <MetricRow
            label="Save Rate"
            value={fmtPct(metrics.cancelSaveRate)}
            sub={`${metrics.cancelSaved} saved · ${metrics.cancelLost} lost${metrics.cancelReversed > 0 ? ` · ${metrics.cancelReversed} reversed` : ''}`}
            color={saveRateColor}
          />
          <MetricRow
            label="Premium Saved"
            value={fmt$(metrics.premiumSaved)}
            color="var(--qs-success)"
          />
          <MetricRow
            label="Premium Still at Risk"
            value={fmt$(metrics.premiumAtRisk)}
            color={metrics.premiumAtRisk > 0 ? 'var(--qs-bright)' : 'var(--qs-dim)'}
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
            <T k="pages.components.timeattendance.retentionscorecard.33b2c6">Save rate based on cases you originated (opener credit model).</T>
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
            <h4 className="text-sm font-semibold text-qs-bright"><T k="pages.components.timeattendance.retentionscorecard.61583c">Renewals</T></h4>
            <div className="ml-auto text-right">
              <span className="text-xs text-qs-muted">{metrics.renewalWorkable} <T k="pages.components.timeattendance.retentionscorecard.9de0ee">workable</T></span>
            </div>
          </div>

          <MetricRow
            label="Outreach Rate"
            value={fmtPct(metrics.renewalContactRate)}
            sub={`${metrics.totalRenewalAttempts} total attempts`}
            color={metrics.renewalContactRate >= 0.8 ? 'var(--qs-success)' : 'var(--qs-text)'}
          />
          <MetricRow
            label="Reach Rate"
            value={fmtPct(metrics.renewalReachRate)}
            sub="cases where customer answered"
            color={metrics.renewalReachRate >= 0.5 ? 'var(--qs-success)' : 'var(--qs-text)'}
          />
          <MetricRow
            label="Retention Rate"
            value={fmtPct(metrics.renewalRetainRate)}
            sub={`${metrics.renewalsConfirmed} confirmed · ${metrics.renewalsLost} lost`}
            color={metrics.renewalRetainRate >= 0.8 ? 'var(--qs-success)' : 'var(--qs-text)'}
          />
          <MetricRow
            label="Premium Retained"
            value={fmt$(metrics.renewalPremiumRetained)}
            color="var(--qs-success)"
          />
          <MetricRow
            label="Premium Saved"
            value={fmt$(metrics.renewalPremiumReduced)}
            sub="reduced off renewal offers"
            color="var(--qs-success)"
          />
          {metrics.renewalsShopping > 0 && (
            <MetricRow
              label="Shopping (Escalated)"
              value={`${metrics.renewalsShopping} policies`}
              sub={metrics.renewalsEscalated > 0 ? `${metrics.renewalsEscalated} escalated to agent` : 'awaiting escalation'}
              color="var(--qs-text)"
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
            <h4 className="text-sm font-semibold text-qs-bright"><T k="pages.components.timeattendance.retentionscorecard.458618">Inbound Closures</T></h4>
            <span className="ml-auto text-xs text-qs-muted"><T k="pages.components.timeattendance.retentionscorecard.bef55a">cases originated by others</T></span>
          </div>
          <MetricRow
            label="Callbacks Closed"
            value={metrics.inboundClosures}
            sub="cases opened by outbound rep, closed by you"
            color="var(--qs-bright)"
          />
          <MetricRow
            label="Premium Closed"
            value={fmt$(metrics.inboundPremiumClosed)}
            color="var(--qs-success)"
          />
          <p className="text-xs text-qs-muted mt-3">
            <T k="pages.components.timeattendance.retentionscorecard.e32566">These cases are credited to the outbound rep who originated them. This section reflects your service volume only.</T>
          </p>
        </div>
      )}

    </div>
  );
}
