// Employee's personal scorecard and bonus verification.
// Reuses useRetentionMetrics, RetentionScorecard, and BonusVerificationAlert.

import { useState } from 'react';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { useRetentionCallVerification } from '../hooks/useRetentionCallVerification';
import RetentionScorecard from './components/time-attendance/RetentionScorecard';
import { BonusVerificationAlert } from './components/time-attendance/DiscrepancyAlerts';
import { RETENTION_BONUS_THRESHOLD, RETENTION_BONUS_PER_SAVE } from '../config/staffPerformanceDefaults';

export default function MyScorecardPage() {
  const { data: employee } = useCurrentEmployee();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Derive scoreType from employee role.
  // employees.roles describes the functional job — the scorecard rendered
  // depends on whether the employee handles service work, sales work, or both.
  const roles = employee?.roles || [];
  const isService = roles.includes('service_inbound')
    || roles.includes('service_outbound');
  const isSales = roles.includes('sales');
  const isSalesOnly = isSales && !isService;
  const scoreType = isSalesOnly
    ? 'sales'
    : roles.includes('service_outbound') && roles.includes('service_inbound')
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

  // Sales-only employees don't have a retention scorecard yet. Show a
  // placeholder until the new business / commission view is built. This
  // sits below the hooks so React's hook order stays stable.
  if (scoreType === 'sales') {
    return (
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--qs-bright)',
          marginBottom: 6 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 15, color: 'var(--qs-subtle)', marginBottom: 28 }}>
          {employee?.preferred_name || employee?.first_name} · Sales Producer
        </div>
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
          borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--qs-dim)', fontSize: 16 }}>
            Sales producer scorecard coming soon.
          </p>
          <p style={{ color: 'var(--qs-subtle)', fontSize: 14, marginTop: 10 }}>
            New business metrics and commission tracking will appear here.
          </p>
        </div>
      </div>
    );
  }

  const bonusSaves  = verificationData?.verified ?? 0;
  const bonusAmount = Math.max(0, bonusSaves - RETENTION_BONUS_THRESHOLD) * RETENTION_BONUS_PER_SAVE;

  const isOutbound = scoreType === 'outbound' || scoreType === 'both';

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 6 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 15, color: 'var(--qs-subtle)' }}>
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
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Monthly Bonus</span>
            <input type="month" value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ fontSize: 14, background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                borderRadius: 6, padding: '6px 10px', color: 'var(--qs-text)' }} />
          </div>

          {/* Bonus summary */}
          <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 24, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {/* Bonus stat colors — used as inline style props */}
              {[
                ['Verified Saves',   bonusSaves,    'var(--qs-text)'],
                [`Above ${RETENTION_BONUS_THRESHOLD} threshold`, `\u00D7$${RETENTION_BONUS_PER_SAVE}`, 'var(--qs-dim)'],
                ['Bonus Earned',     `$${bonusAmount.toLocaleString()}`, bonusAmount > 0 ? 'var(--qs-success)' : 'var(--qs-subtle)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: 'var(--qs-elevated)', borderRadius: 8,
                  padding: '20px 24px', border: '1px solid var(--qs-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 8,
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color,
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
