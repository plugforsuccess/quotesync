// Employee's personal scorecard and bonus verification.
// Reuses useRetentionMetrics, RetentionScorecard, and BonusVerificationAlert.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { useRetentionCallVerification } from '../hooks/useRetentionCallVerification';
import RetentionScorecard from './components/time-attendance/RetentionScorecard';
import { BonusVerificationAlert } from './components/time-attendance/DiscrepancyAlerts';
import { RETENTION_BONUS_THRESHOLD, RETENTION_BONUS_PER_SAVE } from '../config/staffPerformanceDefaults';

// Strip showing this employee's open commitments from cadence meetings.
// Renders above the scorecard so they see pending follow-ups at a glance.
function OpenCommitmentsStrip({ commitments }) {
  if (!commitments?.length) return null;
  return (
    <div style={{
      background: '#F59E0B11', border: '1px solid #F59E0B33',
      borderRadius: 10, padding: '12px 14px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Open Commitments
      </div>
      {commitments.map(c => {
        const isOverdue = new Date(c.due_date) < new Date();
        return (
          <div key={c.id} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12, padding: '5px 0',
            borderBottom: '1px solid #F59E0B22',
          }}>
            <span style={{ color: 'var(--qs-text)' }}>{c.description}</span>
            <span style={{ color: isOverdue ? '#EF4444' : 'var(--qs-muted)',
              flexShrink: 0, marginLeft: 12 }}>
              {isOverdue ? '⚠️ ' : ''}Due {c.due_date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

  // Open commitments from cadence meetings, shown as a strip above the scorecard
  const { data: openCommitments = [] } = useQuery({
    queryKey: ['my_commitments', employee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cadence_commitments')
        .select('id, description, due_date, cadence_events(cadence_type, conducted_at)')
        .eq('employee_id', employee.id)
        .eq('closed', false)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Sales-only employees don't have a retention scorecard yet. Show a
  // placeholder until the new business / commission view is built. This
  // sits below the hooks so React's hook order stays stable.
  if (scoreType === 'sales') {
    return (
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)',
          marginBottom: 4 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 24 }}>
          {employee?.preferred_name || employee?.first_name} · Sales Producer
        </div>
        <OpenCommitmentsStrip commitments={openCommitments} />
        <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
          borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--qs-muted)', fontSize: 14 }}>
            Sales producer scorecard coming soon.
          </p>
          <p style={{ color: 'var(--qs-subtle)', fontSize: 12, marginTop: 8 }}>
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
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
          {employee?.preferred_name || employee?.first_name} &middot;{' '}
          {scoreType === 'outbound' ? 'Outbound Retention'
            : scoreType === 'inbound' ? 'Inbound Service'
            : 'Service'}
        </div>
      </div>

      {/* Open commitments from cadence meetings */}
      <OpenCommitmentsStrip commitments={openCommitments} />

      {/* Retention scorecard */}
      <RetentionScorecard
        metrics={metrics}
        isLoading={metricsLoading}
      />

      {/* Bonus verification — outbound only */}
      {isOutbound && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Monthly Bonus</span>
            <input type="month" value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ fontSize: 12, background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                borderRadius: 6, padding: '4px 8px', color: 'var(--qs-text)' }} />
          </div>

          {/* Bonus summary */}
          <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {/* Bonus stat colors — used as inline style props */}
              {[
                ['Verified Saves',   bonusSaves,    'var(--qs-text)'],
                [`Above ${RETENTION_BONUS_THRESHOLD} threshold`, `\u00D7$${RETENTION_BONUS_PER_SAVE}`, 'var(--qs-dim)'],
                ['Bonus Earned',     `$${bonusAmount.toLocaleString()}`, bonusAmount > 0 ? 'var(--qs-success)' : 'var(--qs-subtle)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: 'var(--qs-elevated)', borderRadius: 8,
                  padding: '12px 14px', border: '1px solid var(--qs-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--qs-subtle)', marginBottom: 6,
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
