// src/pages/components/planning/CompScheduleAlertCard.jsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useComparisonPair } from '../../../hooks/useCompSchedules';
import { useAgencyCommissionRates } from '../../../hooks/useAgencyCommissionRates';
import { useAllProducerConfigs } from '../../../hooks/useProducerCompModel';
import { scenarioRow, DEFAULT_PRODUCT_MIX } from '../../../utils/compModelCalculations';
import { getBlendedValues } from '../../../lib/commissionUtils';

// Hardcoded state for now. When agency_carrier_config gains a state_code column,
// read it from there instead. See repository-conventions reference.
const PRIMARY_STATE = 'GA';
const PRIMARY_CARRIER = 'Allstate';

const PRODUCT_NAME_TO_LABEL = {
  'Auto':              'Standard Auto',
  'Home':              'Homeowners / Condo',
  'Condo':             'Homeowners / Condo',
  'Renters':           'Other Personal Lines',
  'Landlord':          'Other Personal Lines',
  'Personal Umbrella': 'Other Personal Lines',
  'Boat Owners':       'Other Personal Lines',
  'Manufactured Home': 'Other Personal Lines',
  'Specialty Auto':    'Standard Auto',
};

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function CompScheduleAlertCard() {
  const { currentAgencyId } = useAuth();
  const { data: pair } = useComparisonPair(currentAgencyId, PRIMARY_STATE, PRIMARY_CARRIER);

  const announced = pair?.announced ?? null;
  const current = pair?.current ?? null;

  const isInAlertWindow = useMemo(() => {
    if (!announced) return false;
    const today = new Date();
    const effDate = new Date(announced.effective_from + 'T00:00:00');
    const daysDiff = Math.floor((effDate - today) / (1000 * 60 * 60 * 24));
    return daysDiff <= 180 && daysDiff >= -180;
  }, [announced]);

  const currentRates = useAgencyCommissionRates(
    currentAgencyId,
    current ? { scheduleId: current.id } : undefined
  );
  const announcedRates = useAgencyCommissionRates(
    currentAgencyId,
    announced ? { scheduleId: announced.id, includeAnnouncedOnly: true } : undefined
  );
  const { data: allProducerConfigs = [] } = useAllProducerConfigs(currentAgencyId);

  const impact = useMemo(() => {
    if (!announced || !current) return null;
    if (!currentRates.isLoaded || !announcedRates.isLoaded) return null;

    const policyMixForBlend = DEFAULT_PRODUCT_MIX.map(p => ({
      productLine: PRODUCT_NAME_TO_LABEL[p.product_name] ?? 'Other Personal Lines',
      tier: 'bundled',
      avgPremium: Number(p.avg_prem_item),
      mixPct: Number(p.mix_pct) * 100,
    }));

    const currentBlend = getBlendedValues(
      policyMixForBlend, currentRates.commissionMatrix, currentRates.baseCommission
    );
    const announcedBlend = getBlendedValues(
      policyMixForBlend, announcedRates.commissionMatrix, announcedRates.baseCommission
    );

    let totalMonthlyDelta = 0;
    let included = 0;
    for (const pc of allProducerConfigs) {
      const target = pc.tp_band1_threshold;
      if (!target) continue;
      const cfgCurrent = { ...pc, vc_commission_rate: currentBlend.commissionRate / 100 };
      const cfgAnnounced = { ...pc, vc_commission_rate: announcedBlend.commissionRate / 100 };
      const rowCurrent = scenarioRow(target, cfgCurrent, currentBlend.avgPremium);
      const rowAnnounced = scenarioRow(target, cfgAnnounced, announcedBlend.avgPremium);
      totalMonthlyDelta += (rowAnnounced.agencyCommission - rowCurrent.agencyCommission);
      included++;
    }

    return {
      annual: totalMonthlyDelta * 12,
      producerCount: included,
    };
  }, [announced, current, currentRates, announcedRates, allProducerConfigs]);

  if (!isInAlertWindow || !announced || !current) return null;
  if (!impact) return null;

  const sign = impact.annual >= 0 ? '+' : '';
  const isPositive = impact.annual > 0;
  const isNegative = impact.annual < 0;
  const impactColor = isPositive ? 'var(--qs-success)' : isNegative ? 'var(--qs-danger)' : 'var(--qs-subtle)';

  const yearLabel = new Date(announced.effective_from + 'T00:00:00').getFullYear();

  return (
    <div
      className="rounded border p-4 mb-6 flex items-start gap-4"
      style={{
        backgroundColor: 'var(--qs-warning-subtle)',
        borderColor: 'var(--qs-warning-border)',
      }}
    >
      <AlertCircle
        size={24}
        style={{ color: 'var(--qs-warning)', flexShrink: 0, marginTop: 2 }}
      />
      <div className="flex-1">
        <h3 className="text-base font-semibold text-[var(--qs-bright)]">
          {announced.carrier_name} {announced.state_code} {yearLabel} compensation schedule announced
        </h3>
        <p className="text-sm text-[var(--qs-text)] mt-1">
          Effective <strong>{formatDate(announced.effective_from)}</strong>.{' '}
          Estimated agency-wide annual impact at current producer targets:{' '}
          <strong style={{ color: impactColor }}>
            {sign}${Math.abs(impact.annual).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </strong>
          {' '}across {impact.producerCount} active producer{impact.producerCount === 1 ? '' : 's'}.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to="/agency/comp-schedules"
          className="text-xs px-3 py-1.5 rounded bg-[var(--qs-card)] border border-[var(--qs-border)] text-[var(--qs-text)] hover:bg-[var(--qs-elevated)] text-center"
        >
          Edit Schedule
        </Link>
      </div>
    </div>
  );
}
