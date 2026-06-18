// src/pages/AdminDashboardPage.jsx
// Platform Dashboard — cross-agency KPI overview
// Route: /admin (index)

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Eye } from 'lucide-react';
import DataIngestionHealth from './components/admin/DataIngestionHealth';

const KpiCard = ({ label, value, sub, color = 'var(--qs-bright)' }) => (
  <div className="dark-card" style={{ flex: 1 }}>
    <p style={{ fontSize: 12, color: 'var(--qs-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</p>
    <p style={{ fontSize: 28, fontWeight: 700, color }}>{value ?? '—'}</p>
    {sub && <p style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 4 }}>{sub}</p>}
  </div>
);

const STATUS_STYLES = {
  pending:   { background: 'rgba(245,158,11,0.15)',  color: '#FBBF24' },
  approved:  { background: 'rgba(52,211,153,0.15)',  color: '#34D399' },
  rejected:  { background: 'rgba(239,68,68,0.15)',   color: '#F87171' },
  suspended: { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
};

const AdminDashboardPage = () => {
  // Agencies by status
  const { data: agencyStats } = useQuery({
    queryKey: ['platform_agency_stats'],
    queryFn: async () => {
      const { data } = await supabase.from('agencies').select('status, is_active');
      return {
        total:     data.length,
        active:    data.filter(a => a.status === 'approved' && a.is_active).length,
        pending:   data.filter(a => a.status === 'pending').length,
        suspended: data.filter(a => a.status === 'suspended').length,
      };
    },
  });

  // Leads this month (cross-agency)
  const { data: leadStats } = useQuery({
    queryKey: ['platform_lead_stats'],
    queryFn: async () => {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count: thisMonth } = await supabase.from('leads').select('*', { count: 'exact', head: true })
        .gte('created_at', start);
      const { count: total } = await supabase.from('leads').select('*', { count: 'exact', head: true });
      return { thisMonth, total };
    },
  });

  // AI calls this month
  const { data: callStats } = useQuery({
    queryKey: ['platform_call_stats'],
    queryFn: async () => {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data } = await supabase.from('bland_call_logs')
        .select('transferred, qualified')
        .gte('created_at', start);
      return {
        total:       data?.length ?? 0,
        transferred: data?.filter(c => c.transferred).length ?? 0,
        qualified:   data?.filter(c => c.qualified).length ?? 0,
      };
    },
  });

  // All agencies for the table
  const { data: agencies = [] } = useQuery({
    queryKey: ['platform_all_agencies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agencies')
        .select('id, name, status, policy_state, is_active')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="dark-header rounded-xl mb-6">
          <h1 className="dark-heading">Platform Overview</h1>
          <p className="dark-subheading">Cross-agency health at a glance</p>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Active Agencies" value={agencyStats?.active} color={agencyStats?.active > 0 ? '#34D399' : 'var(--qs-bright)'} />
          <KpiCard label="Pending Review" value={agencyStats?.pending} color={agencyStats?.pending > 0 ? '#FBBF24' : '#34D399'} />
          <KpiCard label="Leads This Month" value={leadStats?.thisMonth} />
          <KpiCard
            label="AI Calls This Month"
            value={callStats?.total}
            sub={callStats ? `${callStats.transferred} transferred · ${callStats.qualified} qualified` : null}
          />
        </div>

        {/* Agencies table */}
        <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--qs-border)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>All Agencies</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>Agency</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>State</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>Status</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map(agency => (
                  <tr
                    key={agency.id}
                    style={{ borderBottom: '1px solid var(--qs-border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--qs-bright)' }}>{agency.name}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--qs-dim)' }}>{agency.policy_state || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        ...(STATUS_STYLES[agency.status] || STATUS_STYLES.pending),
                        display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                        borderRadius: 4, fontSize: 12, fontWeight: 600,
                      }}>
                        {agency.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <Link
                        to={`/admin/agencies/${agency.id}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 13, fontWeight: 500, color: 'var(--qs-primary, #3B82F6)',
                          textDecoration: 'none',
                        }}
                      >
                        View <span style={{ fontSize: 11 }}>&rarr;</span>
                      </Link>
                    </td>
                  </tr>
                ))}
                {agencies.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--qs-dim)', fontSize: 13 }}>
                      No agencies found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-agency upload cadence — catch a stale feed before it rots retention */}
        <DataIngestionHealth />
      </div>
    </div>
  );
};

export default AdminDashboardPage;
