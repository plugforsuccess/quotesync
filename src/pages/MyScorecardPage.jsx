// Employee's personal scorecard and bonus verification.
// Reuses useRetentionMetrics, RetentionScorecard, and BonusVerificationAlert.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { usePersona } from '../hooks/usePersona';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { useRetentionCallVerification } from '../hooks/useRetentionCallVerification';
import RetentionScorecard from './components/time-attendance/RetentionScorecard';
import ProducerGoalProgress from './components/employee/ProducerGoalProgress';
import { BonusVerificationAlert } from './components/time-attendance/DiscrepancyAlerts';
import { useEmployeeBonusPlan } from '../hooks/useEmployeeBonusPlan';
import { useRetentionBonusLedger } from '../hooks/useRetentionBonusLedger';
import { unitMeta, computeBonus } from '../config/bonusPlan';

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

  // Which scorecard to show follows the active hat: a dual-role producer
  // toggles between the production (sales) and retention (service) views with
  // the persona pill; a single-role employee just gets their one view.
  const roles = employee?.roles || [];
  const hasService = roles.includes('service_inbound')
    || roles.includes('service_outbound')
    || roles.includes('service');
  const hasSales = roles.includes('sales');
  const [persona] = usePersona();
  const hat = (hasSales && hasService)
    ? (persona === 'service' ? 'service' : 'sales')
    : (hasSales ? 'sales' : 'service');

  // scoreType drives the retention (service) view's grading + bonus.
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

  // Live, editable plan terms + any frozen ledger row for the selected month.
  const { data: bonusPlan } = useEmployeeBonusPlan(employee?.id);
  const { data: bonusLedger } = useRetentionBonusLedger(employee?.id, selectedMonth);

  // Once a month is frozen to the ledger we show those numbers (and label the
  // month Finalized/Paid); otherwise we show the live estimate from the plan.
  const isFrozen = !!bonusLedger
    && (bonusLedger.status === 'finalized' || bonusLedger.status === 'paid');
  const verifiedCount = verificationData?.verified ?? 0;
  const liveBonus = computeBonus(bonusPlan, verifiedCount);

  const bonusUnitMeta = unitMeta(isFrozen ? bonusLedger.bonus_unit : bonusPlan?.bonus_unit);
  const bonusThreshold = isFrozen ? bonusLedger.threshold : (bonusPlan?.threshold ?? 0);
  const bonusPerUnit   = isFrozen
    ? Number(bonusLedger.per_unit_amount)
    : Number(bonusPlan?.per_unit_amount ?? 0);
  const bonusCount   = isFrozen ? bonusLedger.verified_count : verifiedCount;
  const bonusAmount  = isFrozen ? Number(bonusLedger.bonus_amount) : liveBonus.bonusAmount;
  const bonusStatusLabel = isFrozen
    ? (bonusLedger.status === 'paid' ? 'Paid' : 'Finalized')
    : 'Estimated';

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 6 }}>
          My Scorecard
        </div>
        <div style={{ fontSize: 15, color: 'var(--qs-subtle)' }}>
          {employee?.preferred_name || employee?.first_name} &middot;{' '}
          {hat === 'sales' ? 'Sales Producer'
            : scoreType === 'outbound' ? 'Outbound Retention'
            : scoreType === 'inbound' ? 'Inbound Service'
            : 'Service'}
        </div>
      </div>

      {/* Open commitments from cadence meetings */}
      <OpenCommitmentsStrip commitments={openCommitments} />

      {hat === 'sales' ? (
        /* Sales hat — production goal tracker */
        <ProducerGoalProgress orgId={employee?.org_id} employee={employee} />
      ) : (
      <>
      {/* Retention scorecard */}
      <RetentionScorecard
        metrics={metrics}
        isLoading={metricsLoading}
      />

      {/* Monthly bonus — only shown when a principal has enabled a plan */}
      {bonusPlan?.enabled && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Monthly Bonus
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                padding: '2px 8px', borderRadius: 999,
                color: isFrozen ? 'var(--qs-success)' : 'var(--qs-subtle)',
                background: isFrozen ? '#10B98122' : 'var(--qs-elevated)',
                border: `1px solid ${isFrozen ? '#10B98144' : 'var(--qs-border)'}` }}>
                {bonusStatusLabel}
              </span>
            </span>
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
                [bonusUnitMeta.verifiedLabel, bonusCount, 'var(--qs-text)'],
                [`Above ${bonusThreshold} threshold`, `\u00D7$${bonusPerUnit.toLocaleString()}`, 'var(--qs-dim)'],
                [isFrozen ? `Bonus ${bonusStatusLabel}` : 'Bonus (est.)', `$${bonusAmount.toLocaleString()}`, bonusAmount > 0 ? 'var(--qs-success)' : 'var(--qs-subtle)'],
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
      </>
      )}
    </div>
  );
}
