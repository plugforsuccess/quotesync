import { useState, useEffect, useMemo, useCallback } from 'react';
import RevenueProjectionsDashboard from './components/revenue/RevenueProjectionsDashboard';
import ServiceStaffingTab from './components/planning/ServiceStaffingTab';
import ProducerCompIndexTab from './components/planning/ProducerCompIndexTab';
import CapacityPlanner from './components/dashboard/CapacityPlanner';
import StaffingCapacity from './components/dashboard/StaffingCapacity';
import { useAgencyCommissionRates } from '../hooks/useAgencyCommissionRates';
import { useYTDBlended } from '../hooks/useYTDBlended';
import { useAllProducerConfigs } from '../hooks/useProducerCompModel';
import { averageConfig } from '../utils/compModelCalculations';
import DailyEarningsTab from './components/revenue/DailyEarningsTab';
import { useAuth } from '../contexts/AuthContext';

const PLANNING_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--qs-elevated); }
  ::-webkit-scrollbar-thumb { background: var(--qs-muted); border-radius: 3px; }
  input, select { background: var(--qs-elevated) !important; color: var(--qs-text) !important; border: 1px solid var(--qs-border) !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; }
  input:focus, select:focus { border-color: var(--qs-info) !important; }
  .card { background: var(--qs-card); border: 1px solid var(--qs-border); border-radius: 12px; padding: 20px; }
  .btn-primary { background: var(--qs-info); color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
  .btn-primary:hover { background: #2563EB; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: var(--qs-dim); border: 1px solid var(--qs-border); border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .btn-ghost:hover, .btn-ghost.active { background: var(--qs-elevated); color: var(--qs-text); border-color: var(--qs-info); }
  .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: var(--qs-subtle); transition: all 0.15s; }
  .tab.active { background: var(--qs-elevated); color: var(--qs-text); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace; }
  .del-btn { background: transparent; border: none; color: var(--qs-danger); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; }
  .del-btn:hover { background: #2D1A1A; }
  .upload-zone { border: 2px dashed var(--qs-border); border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; }
  .upload-zone:hover { border-color: var(--qs-info); }
  label { font-size: 12px; color: var(--qs-subtle); font-weight: 500; display: block; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--qs-subtle); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--qs-border); }
  td { padding: 9px 12px; border-bottom: 1px solid var(--qs-elevated); color: var(--qs-text); }
  tr:hover td { background: var(--qs-card); }
  .clickable { cursor: pointer; transition: border-color 0.15s; }
  .clickable:hover { border-color: var(--qs-info); }
`;

const TABS = [
  { key: 'revenue',         label: '💰 Revenue'          },
  { key: 'daily_earnings',  label: '📈 Daily Earnings'   },
  { key: 'capacity',        label: '📊 Sales Capacity'   },
  { key: 'staffing',        label: '👥 Service Staffing' },
  { key: 'producers',       label: '🏆 Producer Comp'    },
];

// ── Sales Capacity tab constants ────────────────────────────────────────────────
const CS_STORAGE_KEY = 'quotesync_capacity_inputs';

const DEFAULT_PLANNER = {
  targetSubmissions: 700,
  avgCPC: 7.0,
  landingPageConvRate: 20,
  closeRate: 18,
};

const DEFAULT_STAFFING = {
  activeProducers: 1,
  avgQuoteTime: 45,
  workingHours: 8,
  quotingAllocation: 60,
  qualificationRate: 65,
  workingDays: 22,
};

const RENEWAL_INFO = {
  'Standard Auto': { cycleMonths: 6, renewalRates: null, renewalBase: 9 },
  'Homeowners / Condo': { cycleMonths: 12, renewalRates: { preferredBundled: 10, bundled: 9, monoline: 7 }, renewalBase: 7 },
  'Other Personal Lines': { cycleMonths: 12, renewalRates: { preferredBundled: 10, bundled: 9, monoline: 7 }, renewalBase: 7 },
};

const TIER_OPTIONS = [
  { key: 'preferredBundled', label: 'Preferred Bundled' },
  { key: 'bundled',          label: 'Bundled' },
  { key: 'monoline',         label: 'Monoline' },
];

export default function PlanningHubPage() {
  const [activeTab, setActiveTab] = useState('revenue');
  const { currentAgencyId } = useAuth();

  // ── Sales Capacity tab state ────────────────────────────────────────────────
  const agencyRates = useAgencyCommissionRates(currentAgencyId);
  const { data: ytdBlended } = useYTDBlended(currentAgencyId);
  const { data: producerConfigs = [] } = useAllProducerConfigs(currentAgencyId);
  const [selectedProducerConfigId, setSelectedProducerConfigId] = useState('none');

  const selectedProducerConfig = useMemo(() => {
    if (selectedProducerConfigId === 'none' || !producerConfigs.length) return null;
    if (selectedProducerConfigId === 'average') return averageConfig(producerConfigs);
    return producerConfigs.find(c => c.id === selectedProducerConfigId) || null;
  }, [selectedProducerConfigId, producerConfigs]);

  const [plannerInputs, setPlannerInputs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CS_STORAGE_KEY) || '{}');
      return saved?.planner || DEFAULT_PLANNER;
    } catch { return DEFAULT_PLANNER; }
  });

  const [staffingInputs, setStaffingInputs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CS_STORAGE_KEY) || '{}');
      return saved?.staffing || DEFAULT_STAFFING;
    } catch { return DEFAULT_STAFFING; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CS_STORAGE_KEY, JSON.stringify({
        planner: plannerInputs,
        staffing: staffingInputs,
      }));
    } catch {}
  }, [plannerInputs, staffingInputs]);

  const handlePlannerChange = useCallback((key, value) => {
    setPlannerInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleMixChange = useCallback((index, field, value) => {
    setPlannerInputs(prev => {
      const updated = [...prev.policyMix];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, policyMix: updated };
    });
  }, []);

  const handleMixAdd = useCallback(() => {
    setPlannerInputs(prev => ({
      ...prev,
      policyMix: [...prev.policyMix, {
        productLine: 'Standard Auto', tier: 'monoline', avgPremium: 1500, mixPct: 0,
      }],
    }));
  }, []);

  const handleMixRemove = useCallback((index) => {
    setPlannerInputs(prev => {
      if (prev.policyMix.length <= 1) return prev;
      return { ...prev, policyMix: prev.policyMix.filter((_, i) => i !== index) };
    });
  }, []);

  const handleStaffingChange = useCallback((key, value) => {
    setStaffingInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const effectivePlanner = useMemo(() => ({
    ...plannerInputs,
    policyMix: plannerInputs.policyMix?.length
      ? plannerInputs.policyMix
      : agencyRates.policyMix,
    commissionMatrix: agencyRates.commissionMatrix,
    baseCommission: agencyRates.baseCommission,
  }), [plannerInputs, agencyRates]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--qs-dark)', color: 'var(--qs-text)',
      fontFamily: "'DM Sans', sans-serif", padding: '32px 24px' }}>
      <style>{PLANNING_STYLES}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Planning</h1>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2 }}>
          Revenue · Staffing · Compensation
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {TABS.map(({ key, label }) => (
          <button key={key}
            className={`tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'revenue'        && <RevenueProjectionsDashboard />}
      {activeTab === 'daily_earnings' && <DailyEarningsTab agencyId={currentAgencyId} />}
      {activeTab === 'capacity'       && (
        <div style={{ marginTop: 8 }}>
          {/* Light-surface wrapper — capacity components are light-themed */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid var(--qs-border)',
            borderRadius: 12,
            padding: 24,
          }}>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                Sales Capacity Model
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Model producer capacity, quoting throughput, and new hire ROI
              </div>
            </div>
            <div className="space-y-6 mt-6">
              <CapacityPlanner
                plannerInputs={effectivePlanner}
                onInputChange={handlePlannerChange}
                onMixChange={handleMixChange}
                onMixAdd={handleMixAdd}
                onMixRemove={handleMixRemove}
                tierOptions={TIER_OPTIONS}
                productLines={Object.keys(agencyRates.commissionMatrix)}
                renewalInfo={RENEWAL_INFO}
              />
              <StaffingCapacity
                staffingInputs={staffingInputs}
                onStaffingChange={handleStaffingChange}
                plannerInputs={effectivePlanner}
                ytdAvgPremium={ytdBlended?.avgPremiumPerPolicy}
                ytdCommissionRate={ytdBlended ? ytdBlended.blendedCommissionRate * 100 : undefined}
                producerConfigs={producerConfigs}
                selectedProducerConfig={selectedProducerConfig}
                selectedProducerConfigId={selectedProducerConfigId}
                onProducerConfigChange={setSelectedProducerConfigId}
              />
            </div>
          </div>
        </div>
      )}
      {activeTab === 'staffing'  && <ServiceStaffingTab agencyId={currentAgencyId} />}
      {activeTab === 'producers' && <ProducerCompIndexTab agencyId={currentAgencyId} />}
    </div>
  );
}
