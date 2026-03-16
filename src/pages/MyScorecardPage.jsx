// Employee's personal scorecard and bonus verification.
// Reuses useRetentionMetrics, RetentionScorecard, and BonusVerificationAlert.

import { useState } from 'react';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { useRetentionCallVerification } from '../hooks/useRetentionCallVerification';
import RetentionScorecard from './components/time-attendance/RetentionScorecard';
import { BonusVerificationAlert } from './components/time-attendance/DiscrepancyAlerts';
import { RETENTION_BONUS_THRESHOLD, RETENTION_BONUS_PER_SAVE } from '../config/csPerformanceDefaults';

export default function MyScorecardPage() {
  const { data: employee } = useCurrentEmployee();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Derive scoreType from employee role
  const roles = employee?.roles || [];
  const scoreType = roles.includes('service_outbound') && roles.includes('service_inbound')
    ? 'both'
    : roles.includes('service_outbound')
    ? 'outbound'
    : 'inbound';

  const { data: metrics, isLoading: metricsLoading } = useRetentionMetrics(
    employee?.id,
    scoreType,
  );

  const { data: verificationData } = useRetentionCallVerification({
    employeeId: employee?.id,
    agencyId:   employee?.org_id,
    month:      selectedMonth,
  });

  const bonusSaves  = verificationData?.verified ?? 0;
  const bonusAmount = Math.max(0, bonusSaves - RETENTION_BONUS_THRESHOLD) * RETENTION_BONUS_PER_SAVE;

  const isOutbound = scoreType === 'outbound' || scoreType === 'both';

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          {employee?.preferred_name || employee?.first_name} &middot;{' '}
          {scoreType === 'outbound' ? 'Outbound Retention'
            : scoreType === 'inbound' ? 'Inbound Service'
            : 'Service'}
        </div>
      </div>

      {/* Retention scorecard */}
      <RetentionScorecard
        metrics={metrics}
        isLoading={metricsLoading}
      />

      {/* Bonus verification — outbound only */}
      {isOutbound && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Monthly Bonus</span>
            <input type="month" value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ fontSize: 12, background: '#1A1D27', border: '1px solid #252A3A',
                borderRadius: 6, padding: '4px 8px', color: '#E2E8F0' }} />
          </div>

          {/* Bonus summary */}
          <div style={{ background: '#161924', border: '1px solid #252A3A',
            borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                ['Verified Saves',   bonusSaves,    '#E2E8F0'],
                [`Above ${RETENTION_BONUS_THRESHOLD} threshold`, `\u00D7$${RETENTION_BONUS_PER_SAVE}`, '#94A3B8'],
                ['Bonus Earned',     `$${bonusAmount.toLocaleString()}`, bonusAmount > 0 ? '#10B981' : '#64748B'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: '#1A1D27', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid #252A3A', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6,
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color,
                    fontFamily: "'DM Mono', monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <BonusVerificationAlert
            verificationData={verificationData}
            month={selectedMonth}
          />
        </div>
      )}
    </div>
  );
}
