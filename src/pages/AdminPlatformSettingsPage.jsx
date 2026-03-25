// src/pages/AdminPlatformSettingsPage.jsx
// Platform Settings — Feature flags, role permissions, and CAT factor management
// Route: /admin/settings (platform_admin and above)

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings, ToggleLeft, ToggleRight, Shield, Table2, Save, RefreshCw } from 'lucide-react';

const FEATURE_KEYS = [
  { key: 'bland_ai',          label: 'Bland AI',          description: 'AI voice calling for leads and renewals' },
  { key: 'retention_hub',     label: 'Retention Hub',     description: 'Renewal and cancel queue management' },
  { key: 'comp_model',        label: 'Comp Model',        description: 'Producer compensation projections' },
  { key: 'revenue_dashboard', label: 'Revenue Dashboard', description: 'NB revenue tracking and projections' },
  { key: 'planning',          label: 'Planning',          description: 'Staffing and capacity planning' },
  { key: 'newsroom',          label: 'Newsroom',          description: 'Content and news management' },
  { key: 'canopy_connect',    label: 'Canopy Connect',    description: 'Policy data import via Canopy' },
  { key: 'time_attendance',   label: 'Time & Attendance', description: 'Employee punch clock and hours' },
];

const ROLE_OPTIONS = ['producer', 'manager', 'principal'];

// ── Feature Flags Tab ────────────────────────────────────────────────────────

function FeatureFlagsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: agencies = [] } = useQuery({
    queryKey: ['platform_settings_agencies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agencies').select('id, name, status').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['platform_feature_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('feature_permissions').select('*');
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ agency_id, feature_key, enabled }) => {
      const { error } = await supabase.from('feature_permissions')
        .upsert(
          { agency_id, feature_key, enabled, updated_by: user.id },
          { onConflict: 'agency_id,feature_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform_feature_permissions'] }),
  });

  const getPermission = (agencyId, featureKey) =>
    permissions.find(p => p.agency_id === agencyId && p.feature_key === featureKey);

  return (
    <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--qs-border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>Feature Flags by Agency</h2>
        <p style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 2 }}>Toggle features on/off per agency</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
              <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--qs-elevated)', zIndex: 1 }}>Agency</th>
              {FEATURE_KEYS.map(f => (
                <th key={f.key} className="dark-section-label" style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }} title={f.description}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agencies.map(agency => (
              <tr key={agency.id} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--qs-bright)', position: 'sticky', left: 0, background: 'var(--qs-card)', zIndex: 1 }}>
                  {agency.name}
                  <span style={{ fontSize: 11, color: 'var(--qs-subtle)', marginLeft: 8 }}>{agency.status}</span>
                </td>
                {FEATURE_KEYS.map(f => {
                  const perm = getPermission(agency.id, f.key);
                  const enabled = perm?.enabled ?? false;
                  return (
                    <td key={f.key} style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button
                        onClick={() => toggleMutation.mutate({ agency_id: agency.id, feature_key: f.key, enabled: !enabled })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                      >
                        {enabled
                          ? <ToggleRight size={22} style={{ color: '#34D399' }} />
                          : <ToggleLeft size={22} style={{ color: 'var(--qs-subtle)' }} />
                        }
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Role Permissions Tab ─────────────────────────────────────────────────────

function RolePermissionsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: agencies = [] } = useQuery({
    queryKey: ['platform_settings_agencies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agencies').select('id, name, status').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['platform_feature_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('feature_permissions').select('*');
      if (error) throw error;
      return data;
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ agency_id, feature_key, min_role }) => {
      const { error } = await supabase.from('feature_permissions')
        .upsert(
          { agency_id, feature_key, min_role, updated_by: user.id },
          { onConflict: 'agency_id,feature_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform_feature_permissions'] }),
  });

  const getPermission = (agencyId, featureKey) =>
    permissions.find(p => p.agency_id === agencyId && p.feature_key === featureKey);

  return (
    <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--qs-border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>Role Permissions by Agency</h2>
        <p style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 2 }}>Set minimum role required for each feature per agency</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
              <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--qs-elevated)', zIndex: 1 }}>Agency</th>
              {FEATURE_KEYS.map(f => (
                <th key={f.key} className="dark-section-label" style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }} title={f.description}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agencies.map(agency => (
              <tr key={agency.id} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--qs-bright)', position: 'sticky', left: 0, background: 'var(--qs-card)', zIndex: 1 }}>
                  {agency.name}
                </td>
                {FEATURE_KEYS.map(f => {
                  const perm = getPermission(agency.id, f.key);
                  const currentRole = perm?.min_role || 'principal';
                  return (
                    <td key={f.key} style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <select
                        className="dark-select"
                        value={currentRole}
                        onChange={e => updateRoleMutation.mutate({ agency_id: agency.id, feature_key: f.key, min_role: e.target.value })}
                        style={{ fontSize: 12, padding: '4px 6px', minWidth: 90 }}
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CAT Factors Tab ──────────────────────────────────────────────────────────

function CatFactorsTab() {
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  const { data: catFactors = [], isLoading } = useQuery({
    queryKey: ['platform_cat_factors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cat_reinsurance_factors')
        .select('*')
        .eq('effective_date', '2026-01-01')
        .order('policy_state');
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ policy_state, product_key, cat_pct }) => {
      const { error } = await supabase.from('cat_reinsurance_factors')
        .upsert(
          { policy_state, product_key, cat_pct, factor: 1 - cat_pct, effective_date: '2026-01-01', carrier: 'allstate' },
          { onConflict: 'policy_state,product_key,effective_date,carrier' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform_cat_factors'] }),
  });

  const handleBlur = (row) => {
    const newPct = parseFloat(editValue);
    if (!isNaN(newPct) && newPct >= 0 && newPct <= 1 && newPct !== row.cat_pct) {
      upsertMutation.mutate({ policy_state: row.policy_state, product_key: row.product_key, cat_pct: newPct });
    }
    setEditingCell(null);
  };

  const filtered = stateFilter
    ? catFactors.filter(r => r.policy_state === stateFilter)
    : catFactors;

  const uniqueStates = [...new Set(catFactors.map(r => r.policy_state))].sort();

  return (
    <div>
      {/* Filter */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 13, color: 'var(--qs-dim)' }}>Filter by state:</label>
        <select
          className="dark-select"
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          style={{ minWidth: 120 }}
        >
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
          {filtered.length} row{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--qs-border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>CAT Reinsurance Factors</h2>
          <p style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 2 }}>Click a CAT % cell to edit inline. Factor = 1 - CAT %.</p>
        </div>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--qs-dim)' }}>Loading CAT factors...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>State</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>Product</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'right' }}>CAT %</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'right' }}>Factor</th>
                  <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}>Effective Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const cellKey = `${row.policy_state}-${row.product_key}`;
                  const isEditing = editingCell === cellKey;
                  return (
                    <tr key={cellKey} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                      <td style={{ padding: '8px 16px', fontSize: 13, color: 'var(--qs-bright)', fontWeight: 500 }}>{row.policy_state}</td>
                      <td style={{ padding: '8px 16px', fontSize: 13, color: 'var(--qs-dim)' }}>{row.product_key}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            max="1"
                            className="dark-input"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleBlur(row)}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCell(null); }}
                            autoFocus
                            style={{ width: 90, textAlign: 'right', fontSize: 13, padding: '4px 8px' }}
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingCell(cellKey); setEditValue(String(row.cat_pct)); }}
                            style={{ cursor: 'pointer', fontSize: 13, color: 'var(--qs-bright)', padding: '2px 6px', borderRadius: 4, border: '1px solid transparent' }}
                            onMouseEnter={e => e.target.style.borderColor = 'var(--qs-border)'}
                            onMouseLeave={e => e.target.style.borderColor = 'transparent'}
                          >
                            {row.cat_pct?.toFixed(4) ?? '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: 13, color: 'var(--qs-dim)' }}>
                        {row.cat_pct != null ? (1 - row.cat_pct).toFixed(4) : '—'}
                      </td>
                      <td style={{ padding: '8px 16px', fontSize: 13, color: 'var(--qs-subtle)' }}>{row.effective_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

const AdminPlatformSettingsPage = () => {
  const [activeTab, setActiveTab] = useState('features');

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="dark-header rounded-xl mb-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings size={22} style={{ color: 'var(--qs-primary)' }} />
            <div>
              <h1 className="dark-heading">Platform Settings</h1>
              <p className="dark-subheading">Feature flags, role permissions, and carrier schedules</p>
            </div>
          </div>
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--qs-border)', paddingBottom: 0 }}>
          {[
            { id: 'features',     label: 'Feature Flags',     icon: ToggleRight },
            { id: 'permissions',  label: 'Role Permissions',  icon: Shield },
            { id: 'cat_factors',  label: 'CAT Factors',       icon: Table2 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', fontSize: 13, fontWeight: 600,
                border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? 'var(--qs-primary)' : 'transparent'}`,
                background: 'none', cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--qs-bright)' : 'var(--qs-dim)',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'features'    && <FeatureFlagsTab />}
        {activeTab === 'permissions' && <RolePermissionsTab />}
        {activeTab === 'cat_factors' && <CatFactorsTab />}
      </div>
    </div>
  );
};

export default AdminPlatformSettingsPage;
