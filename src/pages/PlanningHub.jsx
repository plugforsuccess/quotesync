import { useState } from 'react';
import RevenueProjectionsDashboard from './components/revenue/RevenueProjectionsDashboard';
import ServiceStaffingTab from './components/planning/ServiceStaffingTab';
import ProducerCompIndexTab from './components/planning/ProducerCompIndexTab';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { key: 'revenue',   label: '💰 Revenue'          },
  { key: 'staffing',  label: '👥 Service Staffing'  },
  { key: 'producers', label: '🏆 Producer Comp'     },
];

export default function PlanningHub() {
  const [activeTab, setActiveTab] = useState('revenue');
  const { currentAgencyId } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#E2E8F0',
      fontFamily: "'DM Sans', sans-serif", padding: '32px 24px' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>Planning</h1>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
          Revenue · Staffing · Compensation
        </div>
      </div>

      {/* Tab bar */}
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
