import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

// Allstate renewal commission rates by product group and bundling tier.
// Preferred bundled cannot be determined from reports — use bundled as ceiling.
// motor_club and other are excluded (no renewal commission).
const RENEWAL_COMMISSION_RATES = {
  auto:           { bundled: 6, monoline: 4 },
  specialty_auto: { bundled: 6, monoline: 4 },
  ho:             { bundled: 9, monoline: 7 },
  condo:          { bundled: 9, monoline: 7 },
  renters:        { bundled: 9, monoline: 7 },
  landlord:       { bundled: 9, monoline: 7 },
  pup:            { bundled: 9, monoline: 7 },
  manufactured:   { bundled: 9, monoline: 7 },
  boat:           { bundled: 9, monoline: 7 },
  // motor_club and other: excluded
};

const EXCLUDED_PRODUCTS = new Set(['motor_club', 'other']);

// Employment type presets
const EMPLOYMENT_TYPES = [
  { key: 'full_time',  label: 'Full Time',  hours: 160, salaryFactor: 1.0,  description: '~160 hrs/mo' },
  { key: 'part_time',  label: 'Part Time',  hours: 65,  salaryFactor: 0.45, description: '~3 hrs/day'  },
  { key: 'custom',     label: 'Custom',     hours: null, salaryFactor: null, description: 'Set manually' },
];

export default function ServiceStaffingTab({ agencyId }) {

  // ── Employment type ──────────────────────────────────────────────────────
  const [employmentType, setEmploymentType] = useState('part_time');

  // ── Book & Commission ────────────────────────────────────────────────────
  const [monthlyPolicies,      setMonthlyPolicies]      = useState(104); // renewal queue
  const [pendingCancelPerMonth, setPendingCancelPerMonth] = useState(20);  // pending cancel queue
  const [avgPremium,        setAvgPremium]         = useState(2021);
  const [commissionRate,    setCommissionRate]     = useState(6.5);

  // ── Rep Performance ──────────────────────────────────────────────────────
  const [contactRate,       setContactRate]        = useState(55);
  const [saveRate,          setSaveRate]           = useState(50);
  const [handleTime,        setHandleTime]         = useState(18);

  // ── New Hire Capacity ────────────────────────────────────────────────────
  // Hours driven by employment type toggle; custom allows manual override
  const [customHours,       setCustomHours]        = useState(65);
  const [outboundPct,       setOutboundPct]        = useState(100); // new hire is 100% outbound

  // ── Tracy's Contribution ─────────────────────────────────────────────────
  const [tracyHoursOutbound, setTracyHoursOutbound] = useState(0); // currently near zero

  // ── New Hire Cost ────────────────────────────────────────────────────────
  const [baseSalary,        setBaseSalary]         = useState(42000); // full-time equivalent
  const [benefitsLoad,      setBenefitsLoad]       = useState(20);

  // ── Multi-Line Exposure ──────────────────────────────────────────────────
  const [bundledPct,        setBundledPct]         = useState(43);
  const [propertyFollowPct, setPropertyFollowPct]  = useState(60);

  const [liveData, setLiveData] = useState(false);

  // ── Live data pull ───────────────────────────────────────────────────────
  useQuery({
    queryKey: ['service_staffing_defaults', agencyId],
    queryFn: async () => {
      // Pull both queues in parallel
      const [{ data: renewals }, { data: cancels }] = await Promise.all([
        supabase
          .from('renewal_events')
          .select('premium, renewal_date, multi_line, product')
          .eq('agency_id', agencyId)
          .not('status', 'in', '(confirmed,lost,auto_resolved)'),
        supabase
          .from('pending_cancel_events')
          .select('cancel_effective_date')
          .eq('agency_id', agencyId)
          .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation)'),
      ]);

      if (!renewals || renewals.length === 0) return null;

      const dates = renewals.map(r => new Date(r.renewal_date)).filter(Boolean);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const months = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24 * 30.44));

      const totalPremium = renewals.reduce((s, r) => s + (r.premium || 0), 0);
      const avgPrem = Math.round(totalPremium / renewals.length);
      const renewalMonthly = Math.round(renewals.length / months);
      const cancelMonthly = cancels ? Math.round(cancels.length / months) : 20;
      const bundled = renewals.filter(r => r.multi_line === 'Yes').length;
      const bundledPortion = Math.round((bundled / renewals.length) * 100);

      // Compute premium-weighted blended commission rate from actual book mix
      const eligibleRenewals = renewals.filter(r =>
        r.product && !EXCLUDED_PRODUCTS.has(r.product) && r.premium > 0
      );

      let blendedRate = 6.5; // fallback if no eligible data
      if (eligibleRenewals.length > 0) {
        const totalWeightedCommission = eligibleRenewals.reduce((sum, r) => {
          const rates = RENEWAL_COMMISSION_RATES[r.product];
          if (!rates) return sum; // skip unknown products
          const tier = r.multi_line === 'Yes' ? 'bundled' : 'monoline';
          return sum + (r.premium * (rates[tier] / 100));
        }, 0);
        const totalEligiblePremium = eligibleRenewals.reduce((sum, r) => sum + r.premium, 0);
        blendedRate = totalEligiblePremium > 0
          ? Math.round((totalWeightedCommission / totalEligiblePremium) * 100 * 10) / 10
          : 6.5;
      }

      setMonthlyPolicies(renewalMonthly);
      setPendingCancelPerMonth(cancelMonthly);
      setAvgPremium(avgPrem);
      setBundledPct(bundledPortion);
      setCommissionRate(blendedRate);
      setLiveData(true);
      return { renewalMonthly, cancelMonthly, avgPrem, bundledPortion, blendedRate };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived values from employment type ──────────────────────────────────
  const preset = EMPLOYMENT_TYPES.find(t => t.key === employmentType);
  const hireHours = employmentType === 'custom' ? customHours : preset.hours;

  // Actual annual cost = base salary prorated by hours ratio
  // Part time at 65/160 hrs = 40.6% of full-time salary
  const hoursRatio = hireHours / 160;
  const annualCost = baseSalary * hoursRatio * (1 + benefitsLoad / 100);
  const monthlyCost = annualCost / 12;

  // ── Calculations ─────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    // Total queue = renewals + pending cancels
    const totalQueue = monthlyPolicies + pendingCancelPerMonth;

    // New hire outbound capacity
    const hireOutboundHours = hireHours * (outboundPct / 100);
    const hireWorkableCases = Math.floor((hireOutboundHours * 60) / handleTime);

    // Tracy's outbound contribution (additive)
    const tracyWorkableCases = Math.floor((tracyHoursOutbound * 60) / handleTime);

    // Total team capacity
    const totalWorkableCases = hireWorkableCases + tracyWorkableCases;
    const utilization = totalQueue > 0
      ? (totalQueue / totalWorkableCases) * 100
      : 0;

    // Contacted and saved (applied to total workable cases at rep performance rates)
    const contacted = Math.round(totalWorkableCases * (contactRate / 100));
    const saved = Math.round(contacted * (saveRate / 100));
    const premiumRetained = saved * avgPremium;
    const commSaved = premiumRetained * (commissionRate / 100);

    // ROI is measured against new hire cost only (Tracy's cost is sunk)
    const netROI = commSaved - monthlyCost;
    const annualNetROI = netROI * 12;
    const paybackMonths = commSaved > 0 ? monthlyCost / commSaved : Infinity;
    const roiPct = monthlyCost > 0 ? ((commSaved / monthlyCost) - 1) * 100 : 0;

    // Breakeven
    const breakevenSaves = monthlyCost / (avgPremium * (commissionRate / 100));
    const breakevenSaveRate = contacted > 0 ? (breakevenSaves / contacted) * 100 : 0;

    // Multi-line hidden exposure (based on total queue)
    const bundledAtRisk = Math.round(totalQueue * (bundledPct / 100));
    const propertyAtRisk = Math.round(bundledAtRisk * (propertyFollowPct / 100));
    // Property follow always earns property bundled rate (9%) since
    // multi-line customers with property are by definition bundled
    const PROPERTY_BUNDLED_RATE = 0.09;
    const hiddenComm = propertyAtRisk * avgPremium * PROPERTY_BUNDLED_RATE;
    const trueCommAtRisk = (totalQueue * avgPremium * (commissionRate / 100)) + hiddenComm;

    // Scenarios — vary contact + save rate, hold all else fixed
    const scenarios = [
      { label: 'Conservative', contact: 40, save: 30 },
      { label: 'Realistic',    contact: 55, save: 50 },
      { label: 'Optimistic',   contact: 70, save: 70 },
    ].map(s => {
      const c = Math.round(totalWorkableCases * (s.contact / 100));
      const sv = Math.round(c * (s.save / 100));
      const comm = sv * avgPremium * (commissionRate / 100);
      return {
        ...s,
        saved: sv,
        commission: comm,
        netROI: comm - monthlyCost,
        payback: comm > 0 ? monthlyCost / comm : Infinity,
      };
    });

    // Part-time vs full-time comparison (always compute both for the comparison card)
    const ftHours = 160;
    const ftWorkable = Math.floor((ftHours * (outboundPct / 100) * 60) / handleTime) + tracyWorkableCases;
    const ftContacted = Math.round(ftWorkable * (contactRate / 100));
    const ftSaved = Math.round(ftContacted * (saveRate / 100));
    const ftCommSaved = ftSaved * avgPremium * (commissionRate / 100);
    const ftMonthlyCost = (baseSalary * (1 + benefitsLoad / 100)) / 12;
    const ftNetROI = ftCommSaved - ftMonthlyCost;

    const ptHours = 65;
    const ptWorkable = Math.floor((ptHours * (outboundPct / 100) * 60) / handleTime) + tracyWorkableCases;
    const ptContacted = Math.round(ptWorkable * (contactRate / 100));
    const ptSaved = Math.round(ptContacted * (saveRate / 100));
    const ptCommSaved = ptSaved * avgPremium * (commissionRate / 100);
    const ptMonthlyCost = (baseSalary * (65 / 160) * (1 + benefitsLoad / 100)) / 12;
    const ptNetROI = ptCommSaved - ptMonthlyCost;

    return {
      hireOutboundHours, hireWorkableCases,
      tracyWorkableCases, totalWorkableCases,
      totalQueue,
      utilization, contacted, saved,
      premiumRetained, commSaved,
      netROI, annualNetROI, paybackMonths, roiPct,
      breakevenSaves: Math.ceil(breakevenSaves),
      breakevenSaveRate,
      bundledAtRisk, propertyAtRisk, hiddenComm, trueCommAtRisk,
      scenarios,
      ftVsPt: { ftNetROI, ftMonthlyCost, ftCommSaved, ptNetROI, ptMonthlyCost, ptCommSaved },
    };
  }, [
    hireHours, outboundPct, tracyHoursOutbound, handleTime,
    monthlyPolicies, pendingCancelPerMonth, avgPremium, commissionRate,
    contactRate, saveRate, monthlyCost, baseSalary, benefitsLoad,
    bundledPct, propertyFollowPct,
  ]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const fmt$ = n => `$${Math.round(n).toLocaleString()}`;
  const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt$(n);
  const roiColor = calc.netROI > 500 ? '#10B981'
    : calc.netROI > -500 ? '#F59E0B' : '#EF4444';

  function Field({ label, value, onChange, prefix = '', suffix = '', min = 0, max = 10000, step = 1, disabled = false }) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: disabled ? '#334155' : '#64748B', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {prefix && <span style={{ fontSize: 13, color: '#64748B' }}>{prefix}</span>}
          <input type="number" value={value} min={min} max={max} step={step}
            disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: 90, textAlign: 'right', opacity: disabled ? 0.4 : 1 }} />
          {suffix && <span style={{ fontSize: 13, color: '#64748B' }}>{suffix}</span>}
        </div>
      </div>
    );
  }

  function Stat({ label, value, sub, color = '#E2E8F0', large = false }) {
    return (
      <div style={{ background: '#1A1D27', borderRadius: 8, padding: '12px 14px', border: '1px solid #252A3A' }}>
        <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: large ? 22 : 15, fontWeight: 700, color,
          fontFamily: "'DM Mono', monospace" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{sub}</div>}
      </div>
    );
  }

  return (
    <div>
      {liveData && (
        <div style={{ fontSize: 12, color: '#10B981', marginBottom: 16,
          background: '#10B98111', borderRadius: 6, padding: '6px 12px', display: 'inline-block' }}>
          ✓ Using live book data — {monthlyPolicies} renewals + {pendingCancelPerMonth} pending cancels/mo · {commissionRate}% blended commission
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Inputs ── */}
        <div style={{ background: '#161924', border: '1px solid #252A3A', borderRadius: 12, padding: 20 }}>

          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
            textTransform: 'uppercase', marginBottom: 16 }}>Assumptions</div>

          {/* Employment Type Toggle */}
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>New Hire Type</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {EMPLOYMENT_TYPES.map(t => (
              <button key={t.key}
                className={`btn-ghost ${employmentType === t.key ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '5px 10px', flex: 1 }}
                onClick={() => setEmploymentType(t.key)}>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{t.description}</div>
              </button>
            ))}
          </div>

          {/* Show custom hours only when Custom is selected */}
          {employmentType === 'custom' && (
            <Field label="Hours per month" value={customHours}
              onChange={setCustomHours} suffix="hrs" min={10} max={200} />
          )}

          {/* Computed cost display */}
          <div style={{ background: '#1A1D27', borderRadius: 6, padding: '8px 12px',
            marginBottom: 14, fontSize: 12 }}>
            <div style={{ color: '#64748B', marginBottom: 2 }}>
              {Math.round(hoursRatio * 100)}% of full-time · {hireHours} hrs/mo
            </div>
            <div style={{ color: '#E2E8F0', fontWeight: 600 }}>
              Est. monthly cost: {fmtK(monthlyCost)}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Book & Commission</div>
          <Field label="Renewal queue/mo"          value={monthlyPolicies}      onChange={setMonthlyPolicies}      min={1} max={2000} />
          <Field label="Pending cancel queue/mo"   value={pendingCancelPerMonth} onChange={setPendingCancelPerMonth} min={0} max={200} />
          <div style={{ fontSize: 11, color: '#64748B', marginTop: -8, marginBottom: 14 }}>
            Total queue: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{monthlyPolicies + pendingCancelPerMonth} cases/mo</span>
          </div>
          <Field label="Avg premium per policy"    value={avgPremium}      onChange={setAvgPremium}      prefix="$" min={100} max={10000} step={100} />
          <Field label="Commission rate (blended)"   value={commissionRate}  onChange={setCommissionRate}  suffix="%" min={1} max={25} step={0.5} />
          <div style={{ fontSize: 11, color: '#64748B', marginTop: -8, marginBottom: 14 }}>
            Auto: ~4–6% · Property: ~7–9% · weighted by your book mix
          </div>

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Rep Performance</div>
          <Field label="Contact rate"  value={contactRate} onChange={setContactRate} suffix="%" min={1} max={100} />
          <Field label="Save rate"     value={saveRate}    onChange={setSaveRate}    suffix="%" min={1} max={100} />
          <Field label="Handle time"   value={handleTime}  onChange={setHandleTime}  suffix="min" min={5} max={60} />

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 4 }}>Workload Split</div>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
            How many outbound hours per month does each person contribute?
          </div>
          <Field label="New hire outbound %" value={outboundPct} onChange={setOutboundPct}
            suffix="%" min={1} max={100}
          />
          <div style={{ fontSize: 11, color: '#64748B', marginTop: -8, marginBottom: 14 }}>
            New hire outbound: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
              {calc.hireOutboundHours.toFixed(0)} hrs/mo → {calc.hireWorkableCases} cases workable
            </span>
          </div>
          <Field label="Tracy outbound hrs/mo" value={tracyHoursOutbound}
            onChange={setTracyHoursOutbound} suffix="hrs" min={0} max={80}
          />
          <div style={{ fontSize: 11, color: '#64748B', marginTop: -8, marginBottom: 14 }}>
            Tracy's contribution: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
              {calc.tracyWorkableCases} cases workable
            </span>
          </div>

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>New Hire Cost</div>
          <Field label="Base annual salary (FT equiv)" value={baseSalary}
            onChange={setBaseSalary} prefix="$" min={20000} max={120000} step={1000} />
          <Field label="Benefits load" value={benefitsLoad}
            onChange={setBenefitsLoad} suffix="%" min={0} max={50} />

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Multi-Line Exposure</div>
          <Field label="Bundled customers %"  value={bundledPct}        onChange={setBundledPct}        suffix="%" min={0} max={100} />
          <Field label="Property follow rate" value={propertyFollowPct} onChange={setPropertyFollowPct} suffix="%" min={0} max={100} />
        </div>

        {/* ── RIGHT: Outputs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ROI Summary */}
          <div style={{ background: '#161924', border: `2px solid ${roiColor}44`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
              textTransform: 'uppercase', marginBottom: 16 }}>ROI Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <Stat label="Commission Saved/mo" value={fmtK(calc.commSaved)} color="#10B981" />
              <Stat label="New Hire Cost/mo"    value={fmtK(monthlyCost)}    color="#94A3B8" />
              <Stat label="Net ROI/mo"          value={fmt$(calc.netROI)}    color={roiColor} large />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Stat label="Annual Net ROI"  value={fmtK(calc.annualNetROI)}          color={roiColor} />
              <Stat label="ROI %"           value={`${Math.round(calc.roiPct)}%`}    color={roiColor} />
              <Stat label="Payback Period"
                value={calc.paybackMonths === Infinity ? '∞' : `${calc.paybackMonths.toFixed(1)} mo`}
                color={calc.paybackMonths <= 12 ? '#10B981' : '#F59E0B'} />
            </div>
            <div style={{ marginTop: 14, background: '#1A1D27', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, color: '#94A3B8' }}>
              New hire needs to save{' '}
              <span style={{ color: '#F1F5F9', fontWeight: 700 }}>
                {calc.breakevenSaves} policies/month
              </span>{' '}
              to cover their cost ({Math.round(calc.breakevenSaveRate)}% save rate)
            </div>
          </div>

          {/* Part-Time vs Full-Time Comparison */}
          <div style={{ background: '#161924', border: '1px solid #3B82F633', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6',
              textTransform: 'uppercase', marginBottom: 16 }}>Part-Time vs Full-Time</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Part Time */}
              <div style={{ background: '#1A1D27', borderRadius: 8, padding: '14px 16px',
                border: `2px solid ${employmentType === 'part_time' ? '#3B82F6' : '#252A3A'}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9', marginBottom: 2 }}>
                  Part Time
                  {employmentType === 'part_time' && (
                    <span style={{ fontSize: 10, color: '#3B82F6', marginLeft: 6 }}>← current</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>65 hrs/mo · 3 hrs/day</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['Monthly cost',       fmtK(calc.ftVsPt.ptMonthlyCost)],
                    ['Commission saved',   fmtK(calc.ftVsPt.ptCommSaved)],
                    ['Net ROI/mo',         fmt$(calc.ftVsPt.ptNetROI)],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600,
                        color: label === 'Net ROI/mo'
                          ? (calc.ftVsPt.ptNetROI > 0 ? '#10B981' : '#EF4444')
                          : '#E2E8F0' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Full Time */}
              <div style={{ background: '#1A1D27', borderRadius: 8, padding: '14px 16px',
                border: `2px solid ${employmentType === 'full_time' ? '#3B82F6' : '#252A3A'}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9', marginBottom: 2 }}>
                  Full Time
                  {employmentType === 'full_time' && (
                    <span style={{ fontSize: 10, color: '#3B82F6', marginLeft: 6 }}>← current</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>160 hrs/mo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['Monthly cost',     fmtK(calc.ftVsPt.ftMonthlyCost)],
                    ['Commission saved', fmtK(calc.ftVsPt.ftCommSaved)],
                    ['Net ROI/mo',       fmt$(calc.ftVsPt.ftNetROI)],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600,
                        color: label === 'Net ROI/mo'
                          ? (calc.ftVsPt.ftNetROI > 0 ? '#10B981' : '#EF4444')
                          : '#E2E8F0' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Team Capacity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#161924', border: '1px solid #252A3A', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
                textTransform: 'uppercase', marginBottom: 12 }}>Team Capacity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Stat label="New hire outbound hrs"  value={`${calc.hireOutboundHours.toFixed(0)} hrs`} />
                <Stat label="New hire cases/mo"      value={calc.hireWorkableCases} />
                <Stat label="Tracy outbound cases"   value={calc.tracyWorkableCases}
                  sub={tracyHoursOutbound === 0 ? 'Currently 0 — set above to model' : undefined} />
                <Stat label="Total team cases/mo"    value={calc.totalWorkableCases} color="#3B82F6" />
                <Stat label="Renewal queue/mo"     value={monthlyPolicies} />
                <Stat label="Pending cancel/mo"    value={pendingCancelPerMonth} />
                <Stat label="Total queue/mo"       value={calc.totalQueue} color="#3B82F6" />
                <Stat label="Utilization"
                  value={`${Math.round(calc.utilization)}%`}
                  color={calc.utilization > 100 ? '#EF4444' : calc.utilization > 85 ? '#F59E0B' : '#10B981'}
                  sub={calc.utilization > 100 ? '⚠ Queue exceeds capacity' : 'Queue covered'} />
              </div>
            </div>

            <div style={{ background: '#161924', border: '1px solid #252A3A', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
                textTransform: 'uppercase', marginBottom: 12 }}>Revenue Impact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Stat label="Cases contacted/mo"  value={calc.contacted} />
                <Stat label="Cases saved/mo"      value={calc.saved}            color="#10B981" />
                <Stat label="Premium retained/mo" value={fmtK(calc.premiumRetained)} color="#10B981" />
                <Stat label="Commission saved/mo" value={fmtK(calc.commSaved)}  color="#10B981" />
              </div>
            </div>
          </div>

          {/* Multi-line hidden exposure */}
          <div style={{ background: '#161924', border: '1px solid #F59E0B33', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B',
              textTransform: 'uppercase', marginBottom: 12 }}>⚡ Multi-Line Hidden Exposure</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Stat label="Bundled at risk/mo"        value={calc.bundledAtRisk} />
              <Stat label="Property policies at risk"  value={calc.propertyAtRisk}      color="#F59E0B" />
              <Stat label="Hidden commission/mo"       value={fmtK(calc.hiddenComm)}    color="#F59E0B" />
              <Stat label="True exposure/mo"           value={fmtK(calc.trueCommAtRisk)} color="#EF4444"
                sub="direct + hidden" />
            </div>
          </div>

          {/* Scenario comparison */}
          <div style={{ background: '#161924', border: '1px solid #252A3A', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
              textTransform: 'uppercase', marginBottom: 16 }}>Scenario Comparison</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {calc.scenarios.map(s => (
                <div key={s.label} style={{ background: '#1A1D27', borderRadius: 8,
                  padding: '14px 16px', border: '1px solid #252A3A' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', marginBottom: 10 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                    Contact {s.contact}% · Save {s.save}%
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      ['Saved/mo',   s.saved,                        '#E2E8F0'],
                      ['Commission', `${fmtK(s.commission)}/mo`,     '#10B981'],
                      ['Net ROI',    `${fmt$(s.netROI)}/mo`,         s.netROI > 0 ? '#10B981' : s.netROI > -500 ? '#F59E0B' : '#EF4444'],
                      ['Payback',    s.payback === Infinity ? '∞' : `${s.payback.toFixed(1)} mo`, '#94A3B8'],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
