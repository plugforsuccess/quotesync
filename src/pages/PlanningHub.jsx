import { useState } from 'react';
import RevenueProjectionsDashboard from './components/revenue/RevenueProjectionsDashboard';
import ServiceStaffingTab from './components/planning/ServiceStaffingTab';
import ProducerCompIndexTab from './components/planning/ProducerCompIndexTab';
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
  { key: 'revenue',   label: '💰 Revenue'          },
  { key: 'staffing',  label: '👥 Service Staffing'  },
  { key: 'producers', label: '🏆 Producer Comp'     },
];

export default function PlanningHub() {
  const [activeTab, setActiveTab] = useState('revenue');
  const { currentAgencyId } = useAuth();

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

      {activeTab === 'revenue'   && <RevenueProjectionsDashboard />}
      {activeTab === 'staffing'  && <ServiceStaffingTab agencyId={currentAgencyId} />}
      {activeTab === 'producers' && <ProducerCompIndexTab agencyId={currentAgencyId} />}
    </div>
  );
}
