// src/pages/components/dashboard/StaffingCapacity.jsx
// Section 5: Staffing & Quoting Capacity — calculator, daily timeline, scenarios, peak alert

import { useMemo } from 'react';
import { Users, Clock, Zap, AlertTriangle } from 'lucide-react';
import { getBlendedValues } from '../../../lib/commissionUtils';

function InputRow({ label, value, onChange, suffix, min, max, step = 1 }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
      <label className="text-sm text-gray-600">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-20 text-right text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

function OutputRow({ label, value, color }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${color || 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

export default function StaffingCapacity({
  staffingInputs,
  onStaffingChange,
  plannerInputs,
  ytdAvgPremium,       // from useYTDBlended — overrides planner default when set
  ytdCommissionRate,   // from useYTDBlended — overrides planner default when set
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
    ? 'border-red-500 bg-red-50'
    : outputs.minutesBetween <= 20
      ? 'border-amber-500 bg-amber-50'
      : 'border-green-500 bg-green-50';

  // Scenarios table
  const scenarios = useMemo(() => {
    return [1, 2, 3, 4, 5].map(producers => {
      const qpm = Math.round(outputs.quotesPerProducerMonthRaw * producers);
      const canHandle = outputs.qualPct > 0 ? Math.round(qpm / outputs.qualPct) : 0;
      const monthlyRevenue = (qpm * outputs.closePct * avgPremium * outputs.commPct) / 12;

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

      return { producers, qpm, canHandle, monthlyRevenue, status, statusColor };
    });
  }, [outputs, avgPremium, targetSubmissions]);

  // Daily breakdown bar widths
  const nonQuotingPct = (1 - outputs.allocPct) * 100;
  const quotingPct = outputs.allocPct * 100;
  const callsInNonQuoting = Math.round(workingHours * 60 * (1 - outputs.allocPct) / 5);
  const quotesInQuoting = outputs.quotesPerProducerDay;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-gray-900">Staffing & Quoting Capacity</h2>
      </div>

      {/* Row 1: Staffing Calculator */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Staffing Calculator</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="bg-primary-50 rounded-lg p-4">
            <InputRow label="Active Producers" value={activeProducers} onChange={(v) => onStaffingChange('activeProducers', v)} min={1} max={50} />
            <InputRow label="Avg Quote Time" value={avgQuoteTime} onChange={(v) => onStaffingChange('avgQuoteTime', v)} suffix="min" min={5} max={120} />
            <InputRow label="Working Hours/Day" value={workingHours} onChange={(v) => onStaffingChange('workingHours', v)} suffix="hrs" min={1} max={16} />
            <InputRow label="Quoting Allocation" value={quotingAllocation} onChange={(v) => onStaffingChange('quotingAllocation', v)} suffix="%" min={10} max={100} />
            <InputRow label="Qualification Rate" value={qualificationRate} onChange={(v) => onStaffingChange('qualificationRate', v)} suffix="%" min={1} max={100} />
            <InputRow label="Working Days/Month" value={workingDays} onChange={(v) => onStaffingChange('workingDays', v)} min={1} max={31} />
          </div>

          {/* Outputs */}
          <div className="bg-gray-50 rounded-lg p-4">
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Staffing Scenarios</h3>
        <p className="text-xs text-gray-400 mb-3">
          {ytdAvgPremium
            ? `Using YTD actuals: $${Math.round(ytdAvgPremium).toLocaleString()} avg premium · ${ytdCommissionRate.toFixed(1)}% blended rate`
            : 'Using planner estimates — add revenue entries for actual rates'}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Producers</th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Quotes/Mo</th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Lead Capacity</th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Max Monthly Rev</th>
                <th className="text-left py-2 pl-4 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scenarios.map(s => (
                <tr
                  key={s.producers}
                  className={s.producers === activeProducers
                    ? 'border-l-4 border-l-primary-500 bg-primary-50'
                    : ''
                  }
                >
                  <td className="py-2 pr-4 font-medium text-gray-900">
                    {s.producers}
                    {s.producers === activeProducers && <span className="ml-2 text-xs text-primary-600">(current)</span>}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-700">{s.qpm.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-gray-700">{s.canHandle.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-gray-700">
                    ${s.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`py-2 pl-4 font-medium ${s.statusColor}`}>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Peak Hour Alert */}
      <div className={`rounded-lg border-l-4 p-4 ${peakBorderColor}`}>
        <div className="flex items-start gap-3">
          <Zap className={`w-5 h-5 mt-0.5 flex-shrink-0 ${outputs.minutesBetween < 10 ? 'text-red-500' : outputs.minutesBetween <= 20 ? 'text-amber-500' : 'text-green-500'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-900">Peak Hours</p>
            <p className="text-sm text-gray-700 mt-1">
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
