// src/pages/components/dashboard/StaffingCapacity.jsx
// Section 5: Staffing & Quoting Capacity — calculator, daily timeline, scenarios, peak alert

import { useMemo } from 'react';
import { Users, Clock, Zap, AlertTriangle } from 'lucide-react';
import { getBlendedValues } from '../../../lib/commissionUtils';
import { totalCostMonthly } from '../../../utils/compModelCalculations';

function InputRow({ label, value, onChange, suffix, min, max, step = 1 }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
      <label className="text-sm" style={{ color: 'var(--qs-dim)' }}>{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="dark-input w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function OutputRow({ label, value, color }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
      <span className="text-sm" style={{ color: 'var(--qs-dim)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: color || 'var(--qs-bright)' }}>{value}</span>
    </div>
  );
}

export default function StaffingCapacity({
  staffingInputs,
  onStaffingChange,
  plannerInputs,
  ytdAvgPremium,       // from useYTDBlended — overrides planner default when set
  ytdCommissionRate,   // from useYTDBlended — overrides planner default when set
  producerConfigs,          // array from useAllProducerConfigs
  selectedProducerConfig,   // the chosen config object (or null = no cost data)
  selectedProducerConfigId, // 'none' | 'average' | uuid string
  onProducerConfigChange,   // callback(configId: string | 'none')
}) {
  const {
    activeProducers, avgQuoteTime, workingHours,
    quotingAllocation, qualificationRate, workingDays,
  } = staffingInputs;

  const { targetSubmissions, closeRate, policyMix, commissionMatrix, baseCommission } = plannerInputs;

  // Derive blended avgPremium and commissionRate from policy mix
  const { avgPremium: plannerAvgPremium, commissionRate: plannerCommissionRate } = useMemo(
    () => getBlendedValues(policyMix, commissionMatrix, baseCommission),
    [policyMix, commissionMatrix, baseCommission]
  );

  // Use YTD actuals when available, fall back to planner hypotheticals
  const avgPremium     = ytdAvgPremium     ?? plannerAvgPremium;
  const commissionRate = ytdCommissionRate ?? plannerCommissionRate;

  // Computed outputs
  const outputs = useMemo(() => {
    const allocPct = quotingAllocation / 100;
    const qualPct = qualificationRate / 100;
    const closePct = closeRate / 100;
    const commPct = commissionRate / 100;

    const quotesPerProducerDay = avgQuoteTime > 0
      ? (workingHours * 60 * allocPct) / avgQuoteTime
      : 0;
    const quotesPerProducerMonth = quotesPerProducerDay * workingDays;
    const totalCapacity = quotesPerProducerMonth * activeProducers;
    const quotableLeads = targetSubmissions * qualPct;
    const capacityGap = totalCapacity - quotableLeads;
    const producersNeeded = quotesPerProducerMonth > 0
      ? Math.ceil(quotableLeads / quotesPerProducerMonth)
      : 0;

    // Speed to call
    const speedToCallMinutes = workingHours * 60 * (1 - allocPct);
    const speedToCallCapacity = speedToCallMinutes / 5; // 5 min per initial call
    const leadsPerDay = targetSubmissions / 30;
    const speedToCallHeadroom = speedToCallCapacity - leadsPerDay;

    // Peak hour
    const peakLeads = Math.ceil(leadsPerDay * 0.40);
    const peakPerProducer = activeProducers > 0 ? Math.ceil(peakLeads / activeProducers) : 0;
    const minutesBetween = peakPerProducer > 0 ? Math.floor(240 / peakPerProducer) : 999;

    return {
      quotesPerProducerDay,
      quotesPerProducerMonth: Math.round(quotesPerProducerMonth),
      totalCapacity: Math.round(totalCapacity),
      quotableLeads: Math.round(quotableLeads),
      capacityGap: Math.round(capacityGap),
      producersNeeded,
      speedToCallCapacity: Math.round(speedToCallCapacity * 10) / 10,
      leadsPerDay: Math.round(leadsPerDay * 10) / 10,
      speedToCallHeadroom: Math.round(speedToCallHeadroom * 10) / 10,
      peakLeads,
      peakPerProducer,
      minutesBetween,
      // For scenarios table
      quotesPerProducerMonthRaw: quotesPerProducerMonth,
      qualPct,
      closePct,
      commPct,
      allocPct,
    };
  }, [
    activeProducers, avgQuoteTime, workingHours,
    quotingAllocation, qualificationRate, workingDays,
    targetSubmissions, closeRate, avgPremium, commissionRate,
  ]);

  // Gap colors
  const gapColor = outputs.capacityGap >= 0 ? 'text-green-600' : 'text-red-600';
  const producerColor = outputs.producersNeeded > activeProducers ? 'text-red-600' : 'text-green-600';
  const headroomColor = outputs.speedToCallHeadroom < 5
    ? 'text-red-600'
    : outputs.speedToCallHeadroom < 10
      ? 'text-yellow-600'
      : 'text-green-600';

  // Peak alert colors
  const peakBorderColor = outputs.minutesBetween < 10
    ? 'border-red-500'
    : outputs.minutesBetween <= 20
      ? 'border-amber-500'
      : 'border-green-500';

  // Scenarios table
  const scenarios = useMemo(() => {
    const commPct = commissionRate / 100;
    return [1, 2, 3, 4, 5].map(producers => {
      const qpm = Math.round(outputs.quotesPerProducerMonthRaw * producers);
      const canHandle = outputs.qualPct > 0 ? Math.round(qpm / outputs.qualPct) : 0;
      const grossRevenue = qpm * outputs.closePct * avgPremium * commPct;

      // Net profit calculation — requires a selected producer config
      let netProfit    = null;
      let producerCost = null;

      if (selectedProducerConfig) {
        const itemsPerProducer = producers > 0
          ? Math.round(qpm * outputs.closePct / producers)
          : 0;
        const costPerProducer = totalCostMonthly(
          itemsPerProducer,
          selectedProducerConfig,
          avgPremium
        );
        producerCost = costPerProducer * producers;
        netProfit    = grossRevenue - producerCost;
      }

      let status, statusColor;
      if (canHandle < targetSubmissions * 0.8) {
        status = 'Understaffed';
        statusColor = 'text-red-600';
      } else if (canHandle <= targetSubmissions * 1.1) {
        status = canHandle < targetSubmissions ? 'Tight' : 'Near capacity';
        statusColor = 'text-yellow-600';
      } else {
        status = canHandle > targetSubmissions * 1.5 ? 'Room to grow' : 'Comfortable';
        statusColor = 'text-green-600';
      }

      return { producers, qpm, canHandle, grossRevenue, producerCost, netProfit, status, statusColor };
    });
  }, [outputs, avgPremium, commissionRate, targetSubmissions, selectedProducerConfig]);

  // Daily breakdown bar widths
  const nonQuotingPct = (1 - outputs.allocPct) * 100;
  const quotingPct = outputs.allocPct * 100;
  const callsInNonQuoting = Math.round(workingHours * 60 * (1 - outputs.allocPct) / 5);
  const quotesInQuoting = outputs.quotesPerProducerDay;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5" style={{ color: 'var(--qs-info)' }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>Staffing & Quoting Capacity</h2>
      </div>

      {/* Row 1: Staffing Calculator */}
      <div className="dark-card">
        <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-3">Staffing Calculator</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
            <InputRow label="Active Producers" value={activeProducers} onChange={(v) => onStaffingChange('activeProducers', v)} min={1} max={50} />
            <InputRow label="Avg Quote Time" value={avgQuoteTime} onChange={(v) => onStaffingChange('avgQuoteTime', v)} suffix="min" min={5} max={120} />
            <InputRow label="Working Hours/Day" value={workingHours} onChange={(v) => onStaffingChange('workingHours', v)} suffix="hrs" min={1} max={16} />
            <InputRow label="Quoting Allocation" value={quotingAllocation} onChange={(v) => onStaffingChange('quotingAllocation', v)} suffix="%" min={10} max={100} />
            <InputRow label="Qualification Rate" value={qualificationRate} onChange={(v) => onStaffingChange('qualificationRate', v)} suffix="%" min={1} max={100} />
            <InputRow label="Working Days/Month" value={workingDays} onChange={(v) => onStaffingChange('workingDays', v)} min={1} max={31} />
            {/* Producer Cost Template */}
            {producerConfigs?.length > 0 && (
              <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--qs-border)' }}>
                <label className="text-sm" style={{ color: 'var(--qs-dim)' }}>Cost Based On</label>
                <select
                  value={selectedProducerConfigId || 'none'}
                  onChange={(e) => onProducerConfigChange(e.target.value)}
                  className="dark-select text-sm font-semibold"
                >
                  <option value="none">Gross only (no cost)</option>
                  {producerConfigs.map(cfg => {
                    const emp = cfg.employees;
                    const name = emp?.preferred_name || `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() || 'Unknown';
                    return (
                      <option key={cfg.id} value={cfg.id}>
                        {name}
                      </option>
                    );
                  })}
                  {producerConfigs.length > 1 && (
                    <option value="average">Average of all producers</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Outputs */}
          <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
            <OutputRow label="Quotes/Producer/Day" value={outputs.quotesPerProducerDay.toFixed(1)} />
            <OutputRow label="Quotes/Producer/Month" value={outputs.quotesPerProducerMonth} />
            <OutputRow label="Team Capacity/Month" value={outputs.totalCapacity} />
            <OutputRow label="Quotable Leads/Month" value={outputs.quotableLeads} />
            <OutputRow label="Capacity Gap" value={outputs.capacityGap >= 0 ? `+${outputs.capacityGap}` : outputs.capacityGap} color={gapColor} />
            <OutputRow label="Producers Needed" value={outputs.producersNeeded} color={producerColor} />
            <OutputRow label="Speed-to-Call Cap./Day" value={outputs.speedToCallCapacity} />
            <OutputRow label="Leads Per Day" value={outputs.leadsPerDay} />
            <OutputRow label="Speed-to-Call Headroom" value={outputs.speedToCallHeadroom >= 0 ? `+${outputs.speedToCallHeadroom}` : outputs.speedToCallHeadroom} color={headroomColor} />
          </div>
        </div>
      </div>

      {/* Row 2: Daily Capacity Timeline */}
      <div className="dark-card">
        <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-3">
          <Clock className="w-4 h-4 inline mr-1" />
          Producer Day Breakdown (per producer)
        </h3>
        <div className="flex rounded-lg overflow-hidden h-14 text-xs font-medium">
          <div
            className="bg-amber-100 border-r border-amber-200 flex flex-col items-center justify-center px-2 text-amber-800"
            style={{ width: `${nonQuotingPct}%`, minWidth: '80px' }}
          >
            <span>Calls & Follow-ups ({Math.round(nonQuotingPct)}%)</span>
            <span className="text-amber-600">~{callsInNonQuoting} calls @ 5 min</span>
          </div>
          <div
            className="bg-primary-100 flex flex-col items-center justify-center px-2 text-primary-800"
            style={{ width: `${quotingPct}%`, minWidth: '80px' }}
          >
            <span>Quoting ({Math.round(quotingPct)}%)</span>
            <span className="text-primary-600">~{quotesInQuoting.toFixed(1)} quotes @ {avgQuoteTime} min</span>
          </div>
        </div>
      </div>

      {/* Row 3: Staffing Scenarios Table */}
      <div className="dark-card">
        <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mb-1">Staffing Scenarios</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--qs-subtle)' }}>
          {ytdAvgPremium
            ? `Using YTD actuals: $${Math.round(ytdAvgPremium).toLocaleString()} avg premium · ${ytdCommissionRate.toFixed(1)}% blended rate`
            : 'Using planner estimates — add revenue entries for actual rates'}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--qs-border)' }}>
                <th className="text-left py-2 pr-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Producers</th>
                <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Quotes/Mo</th>
                <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Lead Capacity</th>
                <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Gross Revenue</th>
                {selectedProducerConfig && (
                  <th className="text-right py-2 px-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Producer Cost</th>
                )}
                {selectedProducerConfig && (
                  <th className="text-right py-2 px-4 text-xs font-medium text-green-700 uppercase">Net Profit</th>
                )}
                <th className="text-left py-2 pl-4 text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => (
                <tr
                  key={s.producers}
                  className={s.producers === activeProducers
                    ? 'border-l-4 border-l-primary-500'
                    : ''
                  }
                  style={s.producers === activeProducers
                    ? { background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }
                    : { borderBottom: '1px solid var(--qs-border)' }
                  }
                >
                  <td className="py-2 pr-4 font-medium" style={{ color: 'var(--qs-bright)' }}>
                    {s.producers}
                    {s.producers === activeProducers && <span className="ml-2 text-xs text-primary-600">(current)</span>}
                  </td>
                  <td className="py-2 px-4 text-right" style={{ color: 'var(--qs-text)' }}>{s.qpm.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right" style={{ color: 'var(--qs-text)' }}>{s.canHandle.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right" style={{ color: 'var(--qs-text)' }}>
                    ${Math.round(s.grossRevenue).toLocaleString()}
                  </td>
                  {selectedProducerConfig && (
                    <td className="py-2 px-4 text-right text-red-600">
                      −${Math.round(s.producerCost).toLocaleString()}
                    </td>
                  )}
                  {selectedProducerConfig && (
                    <td className={`py-2 px-4 text-right font-semibold ${s.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {s.netProfit >= 0 ? '+' : ''}${Math.round(s.netProfit).toLocaleString()}
                    </td>
                  )}
                  <td className={`py-2 pl-4 font-medium ${s.statusColor}`}>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Peak Hour Alert */}
      <div className={`rounded-lg border-l-4 p-4 ${peakBorderColor}`} style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
        <div className="flex items-start gap-3">
          <Zap className={`w-5 h-5 mt-0.5 flex-shrink-0 ${outputs.minutesBetween < 10 ? 'text-red-500' : outputs.minutesBetween <= 20 ? 'text-amber-500' : 'text-green-500'}`} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Peak Hours</p>
            <p className="text-sm mt-1" style={{ color: 'var(--qs-text)' }}>
              Based on typical ad traffic patterns, ~40% of daily leads arrive between 5-9 PM.
              At {outputs.leadsPerDay} leads/day, that&apos;s ~{outputs.peakLeads} leads in a 4-hour window.
              With {activeProducers} producer{activeProducers !== 1 ? 's' : ''}, each would need to handle {outputs.peakPerProducer} initial
              calls during peak &mdash; that&apos;s one every {outputs.minutesBetween} minutes while also quoting.
            </p>
            {outputs.minutesBetween < 10 && (
              <p className="text-sm text-red-700 font-medium mt-2">
                Under 10 minutes between calls during peak means no quoting gets done &mdash; producers can only answer the phone.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
