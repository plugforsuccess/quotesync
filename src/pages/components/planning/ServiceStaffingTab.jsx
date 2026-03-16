import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export default function ServiceStaffingTab({ agencyId }) {

  // ── Inputs ──────────────────────────────────────────────────────────────
  const [monthlyPolicies,   setMonthlyPolicies]   = useState(104);
  const [avgPremium,        setAvgPremium]         = useState(2021);
  const [commissionRate,    setCommissionRate]     = useState(6.5);
  const [contactRate,       setContactRate]        = useState(55);
  const [saveRate,          setSaveRate]           = useState(50);
  const [handleTime,        setHandleTime]         = useState(18);
  const [hoursPerMonth,     setHoursPerMonth]      = useState(160);
  const [outboundPct,       setOutboundPct]        = useState(35);
  const [annualSalary,      setAnnualSalary]       = useState(42000);
  const [benefitsLoad,      setBenefitsLoad]       = useState(20);
  const [bundledPct,        setBundledPct]         = useState(43);
  const [propertyFollowPct, setPropertyFollowPct]  = useState(60);
  const [liveData,          setLiveData]           = useState(false);

  // ── Pull live defaults from renewal_events ───────────────────────────────
  useQuery({
    queryKey: ['service_staffing_defaults', agencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('renewal_events')
        .select('premium, renewal_date, multi_line')
        .eq('agency_id', agencyId)
        .not('status', 'in', '(confirmed,lost,auto_resolved)');
      if (!data || data.length === 0) return null;

      // Compute date range in months
      const dates = data.map(r => new Date(r.renewal_date)).filter(Boolean);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const months = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24 * 30.44));

      const totalPremium = data.reduce((s, r) => s + (r.premium || 0), 0);
      const avgPrem = Math.round(totalPremium / data.length);
      const monthlyCount = Math.round(data.length / months);
      const bundled = data.filter(r => r.multi_line === 'Yes').length;
      const bundledPortion = Math.round((bundled / data.length) * 100);

      setMonthlyPolicies(monthlyCount);
      setAvgPremium(avgPrem);
      setBundledPct(bundledPortion);
      setLiveData(true);
      return { monthlyCount, avgPrem, bundledPortion };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Calculations ─────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const outboundHours   = hoursPerMonth * (outboundPct / 100);
    const workableCases   = Math.floor((outboundHours * 60) / handleTime);
    const utilization     = monthlyPolicies > 0 ? (monthlyPolicies / workableCases) * 100 : 0;
    const monthlyCost     = (annualSalary * (1 + benefitsLoad / 100)) / 12;

    const contacted       = Math.round(workableCases * (contactRate / 100));
    const saved           = Math.round(contacted * (saveRate / 100));
    const premiumRetained = saved * avgPremium;
    const commSaved       = premiumRetained * (commissionRate / 100);

    // Hidden multi-line exposure
    const bundledAtRisk      = Math.round(monthlyPolicies * (bundledPct / 100));
    const propertyAtRisk     = Math.round(bundledAtRisk * (propertyFollowPct / 100));
    const hiddenPremium      = propertyAtRisk * avgPremium;
    const hiddenComm         = hiddenPremium * (commissionRate / 100);
    const trueCommAtRisk     = (monthlyPolicies * avgPremium * (commissionRate / 100)) + hiddenComm;

    const netROI             = commSaved - monthlyCost;
    const annualNetROI       = netROI * 12;
    const paybackMonths      = commSaved > 0 ? monthlyCost / commSaved : Infinity;
    const roiPct             = monthlyCost > 0 ? ((commSaved / monthlyCost) - 1) * 100 : 0;

    // Breakeven: how many saves needed to cover cost
    const breakevenSaves     = monthlyCost / (avgPremium * (commissionRate / 100));
    const breakevenSaveRate  = contacted > 0 ? (breakevenSaves / contacted) * 100 : 0;

    // Scenarios
    const scenarios = [
      { label: 'Conservative', contact: 40, save: 30 },
      { label: 'Realistic',    contact: 55, save: 50 },
      { label: 'Optimistic',   contact: 70, save: 70 },
    ].map(s => {
      const c = Math.round(workableCases * (s.contact / 100));
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

    return {
      outboundHours, workableCases, utilization, monthlyCost,
      contacted, saved, premiumRetained, commSaved,
      bundledAtRisk, propertyAtRisk, hiddenComm, trueCommAtRisk,
      netROI, annualNetROI, paybackMonths, roiPct,
      breakevenSaves: Math.ceil(breakevenSaves),
      breakevenSaveRate,
      scenarios,
    };
  }, [
    monthlyPolicies, avgPremium, commissionRate, contactRate, saveRate,
    handleTime, hoursPerMonth, outboundPct, annualSalary, benefitsLoad,
    bundledPct, propertyFollowPct,
  ]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt$  = n => `$${Math.round(n).toLocaleString()}`;
  const fmtK  = n => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : fmt$(n);
  const roiColor = calc.netROI > 500 ? '#10B981'
                 : calc.netROI > -500 ? '#F59E0B'
                 : '#EF4444';

  // ── Input helper ──────────────────────────────────────────────────────────
  function Field({ label, value, onChange, prefix = '', suffix = '', min = 0, max = 10000, step = 1 }) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: '#64748B', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {prefix && <span style={{ fontSize: 13, color: '#64748B' }}>{prefix}</span>}
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: 90, textAlign: 'right' }} />
          {suffix && <span style={{ fontSize: 13, color: '#64748B' }}>{suffix}</span>}
        </div>
      </div>
    );
  }

  // ── Stat card helper ──────────────────────────────────────────────────────
  function Stat({ label, value, sub, color = '#E2E8F0', large = false }) {
    return (
      <div style={{ background: '#1A1D27', borderRadius: 8, padding: '12px 14px',
        border: '1px solid #252A3A' }}>
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
          ✓ Using live book data from renewal queue
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Inputs ── */}
        <div style={{ background: '#161924', border: '1px solid #252A3A',
          borderRadius: 12, padding: 20 }}>

          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
            textTransform: 'uppercase', marginBottom: 16 }}>Assumptions</div>

          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Book & Commission</div>
          <Field label="Monthly policies at risk" value={monthlyPolicies} onChange={setMonthlyPolicies} min={1} max={2000} />
          <Field label="Avg premium per policy"   value={avgPremium}      onChange={setAvgPremium}      prefix="$" min={100} max={10000} step={100} />
          <Field label="Commission rate"           value={commissionRate}  onChange={setCommissionRate}  suffix="%" min={1} max={25} step={0.5} />

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Rep Performance</div>
          <Field label="Contact rate"    value={contactRate} onChange={setContactRate} suffix="%" min={1} max={100} />
          <Field label="Save rate"       value={saveRate}    onChange={setSaveRate}    suffix="%" min={1} max={100} />
          <Field label="Handle time"     value={handleTime}  onChange={setHandleTime}  suffix="min" min={5} max={60} />

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Capacity</div>
          <Field label="Hours per month"        value={hoursPerMonth} onChange={setHoursPerMonth} suffix="hrs" min={40} max={200} />
          <Field label="Outbound retention %"   value={outboundPct}   onChange={setOutboundPct}   suffix="%" min={5} max={100} />

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Rep Cost</div>
          <Field label="Annual salary"    value={annualSalary}  onChange={setAnnualSalary}  prefix="$" min={20000} max={120000} step={1000} />
          <Field label="Benefits load"    value={benefitsLoad}  onChange={setBenefitsLoad}  suffix="%" min={0} max={50} />
          <div style={{ fontSize: 12, color: '#64748B', marginTop: -8, marginBottom: 14 }}>
            Monthly cost: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{fmt$(calc.monthlyCost)}</span>
          </div>

          <div style={{ borderTop: '1px solid #252A3A', margin: '14px 0' }} />
          <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10 }}>Multi-Line Exposure</div>
          <Field label="Bundled customers %" value={bundledPct}        onChange={setBundledPct}        suffix="%" min={0} max={100} />
          <Field label="Property follow rate" value={propertyFollowPct} onChange={setPropertyFollowPct} suffix="%" min={0} max={100} />
        </div>

        {/* ── RIGHT: Outputs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ROI Summary — hero card */}
          <div style={{ background: '#161924', border: `2px solid ${roiColor}44`,
            borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
              textTransform: 'uppercase', marginBottom: 16 }}>ROI Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <Stat label="Commission Saved/mo" value={fmtK(calc.commSaved)} color="#10B981" />
              <Stat label="Rep Cost/mo"         value={fmtK(calc.monthlyCost)} color="#94A3B8" />
              <Stat label="Net ROI/mo"          value={fmt$(calc.netROI)}
                color={roiColor} large />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Stat label="Annual Net ROI"  value={fmtK(calc.annualNetROI)}  color={roiColor} />
              <Stat label="ROI %"           value={`${Math.round(calc.roiPct)}%`} color={roiColor} />
              <Stat label="Payback Period"
                value={calc.paybackMonths === Infinity ? '∞' : `${calc.paybackMonths.toFixed(1)} mo`}
                color={calc.paybackMonths <= 12 ? '#10B981' : '#F59E0B'} />
            </div>
            <div style={{ marginTop: 14, background: '#1A1D27', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, color: '#94A3B8' }}>
              Rep needs to save <span style={{ color: '#F1F5F9', fontWeight: 700 }}>
              {calc.breakevenSaves} policies/month</span> to cover her cost
              {' '}({Math.round(calc.breakevenSaveRate)}% save rate on contacted customers)
            </div>
          </div>

          {/* Capacity + Revenue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#161924', border: '1px solid #252A3A',
              borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
                textTransform: 'uppercase', marginBottom: 12 }}>Capacity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Stat label="Outbound hours/mo"    value={`${calc.outboundHours.toFixed(0)} hrs`} />
                <Stat label="Cases workable/mo"    value={calc.workableCases} />
                <Stat label="Cases assigned/mo"    value={monthlyPolicies} />
                <Stat label="Utilization"
                  value={`${Math.round(calc.utilization)}%`}
                  color={calc.utilization > 100 ? '#EF4444' : calc.utilization > 85 ? '#F59E0B' : '#10B981'}
                  sub={calc.utilization > 100 ? '⚠ Overloaded — add staff' : 'Within capacity'} />
              </div>
            </div>

            <div style={{ background: '#161924', border: '1px solid #252A3A',
              borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
                textTransform: 'uppercase', marginBottom: 12 }}>Revenue Impact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Stat label="Cases contacted/mo"   value={calc.contacted} />
                <Stat label="Cases saved/mo"       value={calc.saved} color="#10B981" />
                <Stat label="Premium retained/mo"  value={fmtK(calc.premiumRetained)} color="#10B981" />
                <Stat label="Commission saved/mo"  value={fmtK(calc.commSaved)} color="#10B981" />
              </div>
            </div>
          </div>

          {/* Multi-line hidden exposure */}
          <div style={{ background: '#161924', border: '1px solid #F59E0B33',
            borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B',
              textTransform: 'uppercase', marginBottom: 12 }}>⚡ Multi-Line Hidden Exposure</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Stat label="Bundled at risk/mo"       value={calc.bundledAtRisk} />
              <Stat label="Property policies at risk" value={calc.propertyAtRisk} color="#F59E0B" />
              <Stat label="Hidden commission/mo"      value={fmtK(calc.hiddenComm)} color="#F59E0B" />
              <Stat label="True exposure/mo"          value={fmtK(calc.trueCommAtRisk)} color="#EF4444"
                sub="direct + hidden" />
            </div>
          </div>

          {/* Scenario comparison */}
          <div style={{ background: '#161924', border: '1px solid #252A3A',
            borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B',
              textTransform: 'uppercase', marginBottom: 16 }}>Scenario Comparison</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {calc.scenarios.map(s => (
                <div key={s.label} style={{ background: '#1A1D27', borderRadius: 8,
                  padding: '14px 16px', border: '1px solid #252A3A' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9',
                    marginBottom: 10 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                    Contact {s.contact}% · Save {s.save}%
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Saved/mo</span>
                      <span style={{ fontSize: 12, color: '#E2E8F0', fontWeight: 600 }}>{s.saved}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Commission</span>
                      <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>{fmtK(s.commission)}/mo</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Net ROI</span>
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: s.netROI > 0 ? '#10B981' : s.netROI > -500 ? '#F59E0B' : '#EF4444' }}>
                        {fmt$(s.netROI)}/mo
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Payback</span>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>
                        {s.payback === Infinity ? '∞' : `${s.payback.toFixed(1)} mo`}
                      </span>
                    </div>
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
