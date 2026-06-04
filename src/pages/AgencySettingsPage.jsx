// src/pages/AgencySettingsPage.jsx
// MT-06: Agency settings with Profile / Notifications / Commission / Territory tabs

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, Phone, Shield, Users, Save, AlertCircle, Bell, DollarSign, Map, PhoneCall, Target, ChevronDown, ChevronUp, Check, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyDetail, useAgencyCarrierConfig, useAgencyCommissionRatesRaw, useUpsertCommissionRates, useUpdateRevenueGoals, useAgencyRoutingRulesForAgent, useCreateAgencyRoutingRule } from '../hooks/useAgencies';
import { useTrailingRevenueStats } from '../hooks/useTrailingRevenueStats';
import { useAgencyProductConfig } from '../hooks/useAgencyProductConfig';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useTeamAvailability, useSetTransferPhone, validateE164 } from '../hooks/useAgentAvailability';
import { useAllProducerTargets, PRODUCER_DEFAULT_TARGETS } from '../hooks/useProducerTargets';
import { useActiveEmployees } from '../hooks/useEmployees';
import EmployeeInviteModal from './components/settings/EmployeeInviteModal';
import CadenceSettingsTab from './components/settings/CadenceSettingsTab';
import PageSpinner from '../components/PageSpinner';

const TABS = [
  { key: 'profile', label: 'Profile', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'transfers', label: 'Transfers', icon: PhoneCall },
  { key: 'commission', label: 'Commission', icon: DollarSign },
  { key: 'territory', label: 'Territory', icon: Map },
  { key: 'producer_goals', label: 'Producer Goals', icon: Target },
  { key: 'cadence', label: 'Cadence', icon: Activity },
  { key: 'team', label: 'Team', icon: Users },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const AgencySettingsPage = () => {
  const { currentAgencyId, currentAgencyRole } = useAuth();
  const { data: agency, isLoading, error } = useAgencyDetail(currentAgencyId);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('profile');
  const isAgent = currentAgencyRole === 'principal';

  if (!currentAgencyId) {
    return (
      <div className="dark-page flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--qs-subtle)' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--qs-bright)' }}>No Agency Found</h2>
          <p style={{ color: 'var(--qs-dim)' }}>You are not currently associated with an agency.</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <PageSpinner />;
  if (error || !agency) {
    return (
      <div className="dark-page flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--qs-bright)' }}>Error Loading Agency</h2>
          <p style={{ color: 'var(--qs-dim)' }}>{error?.message || 'Agency not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-page">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="dark-header rounded-xl mb-6 flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>Agency Settings</h1>
            <p style={{ color: 'var(--qs-subtle)' }}>Manage your agency profile and configuration</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--qs-border)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent hover:border-white/30'
              }`}
              style={activeTab !== key ? { color: 'var(--qs-subtle)' } : undefined}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && <ProfileTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
        {activeTab === 'notifications' && <NotificationsTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
        {activeTab === 'transfers' && <TransferPhoneTab agencyId={currentAgencyId} isAgent={isAgent} />}
        {activeTab === 'commission' && <CommissionTab agencyId={currentAgencyId} isAgent={isAgent} />}
        {activeTab === 'territory' && <TerritoryTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
        {activeTab === 'producer_goals' && <ProducerGoalsTab agencyId={currentAgencyId} />}
        {activeTab === 'cadence' && (
          <CadenceSettingsTab agencyId={currentAgencyId} isAgent={isAgent} />
        )}
        {activeTab === 'team' && (
          <TeamTab agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />
        )}
      </div>
    </div>
  );
};

// ─── Team Tab ─────────────────────────────────────────────────────────────────
// Single-pane summary of every account connected to the agency: their email,
// agency role, employee record (if any), and login status. Employees without
// an auth_user_id surface in a separate section with an Invite button so the
// principal can finish account setup without leaving Settings.

const TEAM_ROLE_CONFIG = {
  principal: { label: 'Principal',  color: '#10B981', bg: '#10B98111' },
  employee:  { label: 'Employee',   color: '#3B82F6', bg: '#3B82F611' },
  producer:  { label: 'Producer',   color: '#8B5CF6', bg: '#8B5CF611' },
  manager:   { label: 'Manager',    color: '#F59E0B', bg: '#F59E0B11' },
  owner:     { label: 'Owner',      color: '#EF4444', bg: '#EF444411' },
};

function EmployeeCallTarget({ employee, agencyId }) {
  const queryClient = useQueryClient();
  const initial = employee.daily_call_target ?? 8;
  const [target, setTarget] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const next = parseInt(target) || 8;
    if (next === (employee.daily_call_target ?? 8)) return;
    setSaving(true);
    await supabase
      .from('employees')
      .update({ daily_call_target: next })
      .eq('id', employee.id);
    queryClient.invalidateQueries({ queryKey: ['team_access_summary', agencyId] });
    setSaving(false);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        min={1}
        max={50}
        value={target}
        onChange={e => setTarget(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{
          width: 60, textAlign: 'center', padding: '4px 8px',
          background: 'var(--qs-elevated)', color: 'var(--qs-text)',
          border: '1px solid var(--qs-border)', borderRadius: 6,
          fontSize: 13, fontFamily: 'inherit',
        }}
      />
      {saving && (
        <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>Saving…</span>
      )}
    </div>
  );
}

function TeamTab({ agencyId, isAgent }) {
  const [inviteTarget, setInviteTarget] = useState(null);

  // Fetch all agency memberships with profile + employee linkage
  const { data: members, isLoading, refetch } = useQuery({
    queryKey: ['team_access_summary', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_memberships')
        .select(`
          user_id,
          agency_role,
          status,
          profiles (
            id,
            email,
            full_name
          )
        `)
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .order('agency_role');

      if (error) throw error;

      // For each member, check if they have an employee record
      const { data: employees } = await supabase
        .from('employees')
        .select('id, first_name, last_name, auth_user_id, roles, must_reset_password, daily_call_target')
        .eq('org_id', agencyId);

      const empByAuthId = {};
      for (const e of employees || []) {
        if (e.auth_user_id) empByAuthId[e.auth_user_id] = e;
      }

      // Also find unlinked employees (auth_user_id is null)
      const unlinkedEmployees = (employees || []).filter(e => !e.auth_user_id);

      return {
        members: (data || []).map(m => ({
          ...m,
          employee: empByAuthId[m.user_id] || null,
        })),
        unlinkedEmployees,
      };
    },
    enabled: !!agencyId,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--qs-muted)' }}>
        Loading team...
      </div>
    );
  }

  const { members: teamMembers = [], unlinkedEmployees = [] } = members || {};

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>
          Team Access
        </h2>
        <p style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 4 }}>
          All accounts connected to this agency. Employees with no login account
          can be invited from this page.
        </p>
      </div>

      {/* Active accounts table */}
      <div style={{
        border: '1px solid var(--qs-border)', borderRadius: 10,
        overflow: 'hidden', marginBottom: 24,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--qs-elevated)' }}>
              {['Email', 'Agency Role', 'Employee Record', 'Daily Calls', 'Login Status', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11,
                  fontWeight: 600, color: 'var(--qs-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--qs-border)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teamMembers.map((member, i) => {
              const roleCfg = TEAM_ROLE_CONFIG[member.agency_role] || TEAM_ROLE_CONFIG.producer;
              const emp = member.employee;
              const needsReset = emp?.must_reset_password;
              const hasLogin = !!member.profiles?.email;

              return (
                <tr key={member.user_id}
                  style={{
                    borderBottom: i < teamMembers.length - 1
                      ? '1px solid var(--qs-border)' : 'none',
                  }}>

                  {/* Email */}
                  <td style={{ padding: '12px 14px', color: 'var(--qs-text)',
                    fontWeight: 500 }}>
                    {member.profiles?.email || '—'}
                  </td>

                  {/* Agency Role badge */}
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px',
                      borderRadius: 4, color: roleCfg.color, background: roleCfg.bg,
                    }}>
                      {roleCfg.label}
                    </span>
                  </td>

                  {/* Employee Record */}
                  <td style={{ padding: '12px 14px', color: 'var(--qs-dim)' }}>
                    {emp ? (
                      <span>
                        <span style={{ color: 'var(--qs-text)', fontWeight: 500 }}>
                          {emp.first_name} {emp.last_name}
                        </span>
                        {emp.roles?.length > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--qs-muted)',
                            marginLeft: 6 }}>
                            ({emp.roles.join(', ')})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--qs-muted)', fontSize: 12 }}>
                        No employee record
                      </span>
                    )}
                  </td>

                  {/* Daily Calls target */}
                  <td style={{ padding: '12px 14px' }}>
                    {emp ? (
                      <EmployeeCallTarget employee={emp} agencyId={agencyId} />
                    ) : (
                      <span style={{ color: 'var(--qs-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Login Status */}
                  <td style={{ padding: '12px 14px' }}>
                    {needsReset ? (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px',
                        borderRadius: 4, color: '#F59E0B', background: '#F59E0B11',
                      }}>
                        ⏳ Pending password reset
                      </span>
                    ) : hasLogin ? (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px',
                        borderRadius: 4, color: '#10B981', background: '#10B98111',
                      }}>
                        ● Active
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px',
                        borderRadius: 4, color: 'var(--qs-muted)',
                        background: 'var(--qs-elevated)',
                      }}>
                        No login
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    {/* Placeholder for future actions e.g. remove, change role */}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unlinked employees — need inviting */}
      {unlinkedEmployees.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-text)',
            marginBottom: 12 }}>
            Employees without a login account
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unlinkedEmployees.map(emp => (
              <div key={emp.id} style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 8,
                background: 'var(--qs-elevated)',
                border: '1px solid var(--qs-border)',
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600,
                    color: 'var(--qs-bright)', margin: 0 }}>
                    {emp.first_name} {emp.last_name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--qs-muted)',
                    margin: '2px 0 0' }}>
                    {emp.roles?.length > 0 ? emp.roles.join(', ') : 'No roles assigned'}
                    {' · '}No QuoteSync login
                  </p>
                </div>
                {isAgent && (
                  <button
                    onClick={() => setInviteTarget(emp)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 14px',
                      borderRadius: 6, background: '#3B82F622',
                      border: '1px solid #3B82F633', color: '#3B82F6',
                      cursor: 'pointer',
                    }}>
                    Invite
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteTarget && (
        <EmployeeInviteModal
          employee={inviteTarget}
          agencyId={agencyId}
          onClose={() => setInviteTarget(null)}
          onSuccess={() => {
            setInviteTarget(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ─── My Rep Workspace (principal opts into working cases as a rep) ────────────

const REP_ROLE_OPTIONS = [
  { key: 'service_outbound', label: 'Service · Outbound', desc: 'Pending cancel callbacks, save calls' },
  { key: 'service_inbound',  label: 'Service · Inbound',  desc: 'Inbound service queue and transfers' },
  { key: 'sales',            label: 'Sales',              desc: 'New business follow-ups and quotes' },
];

function MyRepWorkspace({ agencyId }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: emp, isLoading } = useQuery({
    queryKey: ['my_employee_record', agencyId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, roles, employment_status, daily_call_target, auth_user_id')
        .eq('org_id', agencyId)
        .eq('auth_user_id', user.id)
        .eq('employment_status', 'active')
        .maybeSingle();
      return data || null;
    },
    enabled: !!agencyId && !!user?.id,
    staleTime: 30 * 1000,
  });

  const [setupForm, setSetupForm] = useState({ first_name: '', last_name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['my_employee_record', agencyId, user?.id] });
    queryClient.invalidateQueries({ queryKey: ['current_employee_self', user?.id] });
  }

  async function toggleRole(role, on) {
    if (!emp) return;
    setError('');
    const next = on
      ? Array.from(new Set([...(emp.roles || []), role]))
      : (emp.roles || []).filter(r => r !== role);
    setSaving(true);
    const { error: err } = await supabase
      .from('employees')
      .update({ roles: next })
      .eq('id', emp.id);
    if (err) setError(err.message);
    invalidate();
    setSaving(false);
  }

  async function handleSetup() {
    if (!setupForm.first_name.trim() || !setupForm.last_name.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    setError('');
    setSaving(true);
    const { error: err } = await supabase.from('employees').insert({
      org_id: agencyId,
      auth_user_id: user.id,
      first_name: setupForm.first_name.trim(),
      last_name:  setupForm.last_name.trim(),
      roles: ['service_outbound'],
    });
    if (err) setError(err.message);
    invalidate();
    setSaving(false);
  }

  return (
    <div style={{
      marginBottom: 24, padding: 16, borderRadius: 10,
      background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
        Work cases as a rep
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 14 }}>
        Wearing more than one hat? Opt into rep roles to receive cases from the round-robin
        and unlock the My Queue view for those cases.
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>Loading…</div>
      ) : !emp ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
            You don't have a rep workspace yet. Set one up to start receiving assigned cases.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="First name"
              value={setupForm.first_name}
              onChange={e => setSetupForm(f => ({ ...f, first_name: e.target.value }))}
              style={{
                flex: '1 1 120px', padding: '6px 10px', fontSize: 13,
                background: 'var(--qs-card)', color: 'var(--qs-text)',
                border: '1px solid var(--qs-border)', borderRadius: 6,
              }}
            />
            <input
              placeholder="Last name"
              value={setupForm.last_name}
              onChange={e => setSetupForm(f => ({ ...f, last_name: e.target.value }))}
              style={{
                flex: '1 1 120px', padding: '6px 10px', fontSize: 13,
                background: 'var(--qs-card)', color: 'var(--qs-text)',
                border: '1px solid var(--qs-border)', borderRadius: 6,
              }}
            />
            <button
              onClick={handleSetup}
              disabled={saving}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#3B82F6', color: '#fff', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Setting up…' : 'Set up rep workspace'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginBottom: 2 }}>
            Linked to <strong style={{ color: 'var(--qs-text)' }}>{emp.first_name} {emp.last_name}</strong>
            {' · '}daily call target {emp.daily_call_target}
          </div>
          {REP_ROLE_OPTIONS.map(opt => {
            const on = (emp.roles || []).includes(opt.key);
            return (
              <label key={opt.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                background: on ? 'rgba(59,130,246,0.08)' : 'var(--qs-card)',
                border: '1px solid',
                borderColor: on ? '#3B82F633' : 'var(--qs-border)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={saving}
                  onChange={e => toggleRole(opt.key, e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-text)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 1 }}>
                    {opt.desc}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 10 }}>{error}</div>
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ agency, agencyId, isAgent, queryClient }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  function invalidateAgencyQueries() {
    queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['agency_detail', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['employee_agency', agencyId] });
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected after an error
    e.target.value = '';

    if (file.size > 512000) {
      setLogoError('Logo must be under 500KB.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      setLogoError('PNG, JPG, SVG, or WebP only.');
      return;
    }

    setLogoUploading(true);
    setLogoError('');

    // Upload to storage: agency-logos/{agencyId}/logo.{ext}
    const ext = file.name.split('.').pop();
    const path = `${agencyId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('agency-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setLogoError('Upload failed. Try again.');
      setLogoUploading(false);
      return;
    }

    // Cache-bust the public URL so the new logo shows immediately after upsert
    const { data: { publicUrl } } = supabase.storage
      .from('agency-logos')
      .getPublicUrl(path);
    const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('agencies')
      .update({ logo_url: cacheBustedUrl })
      .eq('id', agencyId);

    if (updateError) {
      setLogoError('Saved to storage but failed to update agency. Try again.');
    } else {
      invalidateAgencyQueries();
    }

    setLogoUploading(false);
  }

  async function handleLogoRemove() {
    setLogoError('');
    const { error } = await supabase
      .from('agencies')
      .update({ logo_url: null })
      .eq('id', agencyId);
    if (error) {
      setLogoError('Failed to remove logo. Try again.');
      return;
    }
    invalidateAgencyQueries();
  }

  const startEditing = () => {
    setForm({
      brand_name: agency.brand_name || '',
      email: agency.email || '',
      phone: agency.phone || '',
      primary_contact_name: agency.primary_contact_name || '',
      agent_first_name: agency.agent_first_name || '',
      site_url: agency.site_url || '',
      canopy_slug: agency.canopy_slug || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .update({
          brand_name: form.brand_name || null,
          email: form.email,
          phone: form.phone || null,
          primary_contact_name: form.primary_contact_name || null,
          agent_first_name: form.agent_first_name || null,
          site_url: form.site_url || null,
          canopy_slug: form.canopy_slug || null,
        })
        .eq('id', agencyId);
      if (error) throw error;
      setEditing(false);
      invalidateAgencyQueries();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dark-card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Agency Profile</h2>
        {isAgent && !editing && (
          <button onClick={startEditing} className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
            Edit
          </button>
        )}
      </div>

      {isAgent && <MyRepWorkspace agencyId={agencyId} />}

      {/* Agency Logo — available to principals; shown in the employee sidebar. */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-dim)', marginBottom: 8 }}>
          Agency Logo
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Preview */}
          <div style={{
            width: 64, height: 64, borderRadius: 10,
            background: 'var(--qs-elevated)',
            border: '1px solid var(--qs-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {agency?.logo_url ? (
              <img
                src={agency.logo_url}
                alt="Agency logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>No logo</span>
            )}
          </div>

          <div>
            {isAgent ? (
              <>
                <label style={{
                  display: 'inline-block', padding: '8px 16px', borderRadius: 8,
                  background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                  color: 'var(--qs-dim)', fontSize: 13, fontWeight: 600,
                  cursor: logoUploading ? 'not-allowed' : 'pointer',
                  opacity: logoUploading ? 0.6 : 1,
                }}>
                  {logoUploading ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                    disabled={logoUploading}
                  />
                </label>

                {agency?.logo_url && (
                  <button
                    onClick={handleLogoRemove}
                    style={{
                      marginLeft: 8, fontSize: 12, color: 'var(--qs-muted)',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
                Only the principal can change the agency logo.
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 6 }}>
              PNG, JPG, SVG or WebP · max 500KB · appears in employee sidebar
            </div>

            {logoError && (
              <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>
                {logoError}
              </div>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Brand Name" value={form.brand_name} onChange={(v) => setForm(f => ({ ...f, brand_name: v }))} placeholder="Display name for your agency" />
            <Field label="Agent First Name" value={form.agent_first_name} onChange={(v) => setForm(f => ({ ...f, agent_first_name: v }))} placeholder="e.g. Cam" />
            <Field label="Contact Name" value={form.primary_contact_name} onChange={(v) => setForm(f => ({ ...f, primary_contact_name: v }))} />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm(f => ({ ...f, email: v }))} />
            <Field label="Phone" type="tel" value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} />
            <Field label="Website URL" value={form.site_url} onChange={(v) => setForm(f => ({ ...f, site_url: v }))} placeholder="https://..." />
            <Field label="Canopy Slug" value={form.canopy_slug} onChange={(v) => setForm(f => ({ ...f, canopy_slug: v }))} placeholder="e.g. insuredbycam" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <ReadOnly label="Legal Name" value={agency.name} />
          <ReadOnly label="Brand Name" value={agency.brand_name} />
          <ReadOnly label="Agent First Name" value={agency.agent_first_name} />
          <ReadOnly label="Contact Name" value={agency.primary_contact_name} />
          <ReadOnly label="Email" value={agency.email} />
          <ReadOnly label="Phone" value={agency.phone} />
          <ReadOnly label="Website" value={agency.site_url} />
          <ReadOnly label="Canopy Slug" value={agency.canopy_slug} />
        </div>
      )}
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab({ agency, agencyId, isAgent, queryClient }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const startEditing = () => {
    setForm({
      agent_cell_number: agency.agent_cell_number || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .update({ agent_cell_number: form.agent_cell_number || null })
        .eq('id', agencyId);
      if (error) throw error;
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const agentName = agency.agent_first_name || 'Your agent';
  const brandName = agency.brand_name || 'your insurance agency';

  return (
    <div className="space-y-6">
      <div className="dark-card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Notification Settings</h2>
          {isAgent && !editing && (
            <button onClick={startEditing} className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <Field label="Your Cell Number" type="tel" value={form.agent_cell_number} onChange={(v) => setForm(f => ({ ...f, agent_cell_number: v }))} placeholder="(404) 555-1234" />
            <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>This is where speed-to-call will ring and where forwarded SMS messages will go.</p>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ReadOnly label="Your Cell Number" value={agency.agent_cell_number || 'Not set'} />
            <ReadOnly label="Twilio SMS Number" value={agency.twilio_from_number || 'Using platform default'} />
            <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Contact platform support to configure a dedicated Twilio number.</p>
          </div>
        )}
      </div>

      {/* SMS Preview */}
      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--qs-dim)' }}>SMS Preview</h3>
        <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: '8px', padding: '16px' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--qs-dim)' }}>
            Hey [Name]! This is <span className="font-semibold">{agentName}</span> from <span className="font-semibold">{brandName}</span>. I'm pulling up your personalized quotes right now. I'll call you in about 30 seconds to walk you through your options. Talk soon!
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Commission Tab ───────────────────────────────────────────────────────────

function CommissionTab({ agencyId, isAgent }) {
  const { data: rates, isLoading: ratesLoading } = useAgencyCommissionRatesRaw(agencyId);
  const { data: carrierConfig, isLoading: configLoading } = useAgencyCarrierConfig(agencyId);
  const { data: trailingStats } = useTrailingRevenueStats(agencyId, 12);
  const { config: productConfig } = useAgencyProductConfig(agencyId);
  const upsertRates = useUpsertCommissionRates(agencyId);
  const updateGoals = useUpdateRevenueGoals(agencyId);
  const [editRates, setEditRates] = useState(null);
  const [editGoals, setEditGoals] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);

  const isLoading = ratesLoading || configLoading;

  const hasRates = rates && rates.length > 0;

  // Organize rates into a grid
  const rateGrid = useMemo(() => {
    if (!rates || rates.length === 0) return null;
    const grid = {};
    for (const r of rates) {
      if (!grid[r.product_key]) grid[r.product_key] = {};
      grid[r.product_key][r.tier_key] = r.rate;
    }
    return grid;
  }, [rates]);

  const startEditing = () => {
    if (!rateGrid) return;
    setEditRates(JSON.parse(JSON.stringify(rateGrid)));
  };

  const handleSave = async () => {
    if (!editRates) return;
    setSaving(true);
    try {
      const rows = [];
      for (const [product_key, tiers] of Object.entries(editRates)) {
        for (const [tier_key, rate] of Object.entries(tiers)) {
          rows.push({ product_key, tier_key, rate: parseFloat(rate) || 0 });
        }
      }
      await upsertRates.mutateAsync(rows);
      setEditRates(null);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDefaults = async () => {
    // Seed with Wiley-Wilson defaults
    const defaultRates = [
      { product_key: 'auto', tier_key: 'preferred', rate: 0.25 },
      { product_key: 'auto', tier_key: 'bundled', rate: 0.20 },
      { product_key: 'auto', tier_key: 'monoline', rate: 0.15 },
      { product_key: 'ho', tier_key: 'preferred', rate: 0.29 },
      { product_key: 'ho', tier_key: 'bundled', rate: 0.25 },
      { product_key: 'ho', tier_key: 'monoline', rate: 0.16 },
      { product_key: 'renters', tier_key: 'preferred', rate: 0.26 },
      { product_key: 'renters', tier_key: 'bundled', rate: 0.21 },
      { product_key: 'renters', tier_key: 'monoline', rate: 0.15 },
    ];
    try {
      await upsertRates.mutateAsync(defaultRates);
    } catch (err) {
      alert('Failed to seed rates: ' + err.message);
    }
  };

  if (isLoading) return <div className="py-8 text-center" style={{ color: 'var(--qs-subtle)' }}>Loading commission data...</div>;

  const tiers = ['preferred', 'bundled', 'monoline'];
  const tierLabels = { preferred: 'Preferred', bundled: 'Bundled', monoline: 'Monoline' };

  return (
    <div className="space-y-6">
      {/* Carrier Config */}
      {carrierConfig && (
        <div className="dark-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Carrier Configuration</h2>
            {isAgent && !editGoals && (
              <button
                onClick={() => setEditGoals({
                  commission_goal: carrierConfig.commission_goal || 40000,
                  premium_goal: carrierConfig.premium_goal || 160000,
                })}
                className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                Edit Goals
              </button>
            )}
          </div>
          {editGoals ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Commission Goal ($/mo)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={editGoals.commission_goal}
                    onChange={(e) => setEditGoals(g => ({ ...g, commission_goal: e.target.value }))}
                    className="dark-input"
                    placeholder="40000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Premium Goal ($/mo)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={editGoals.premium_goal}
                    onChange={(e) => setEditGoals(g => ({ ...g, premium_goal: e.target.value }))}
                    className="dark-input"
                    placeholder="160000"
                  />
                </div>
              </div>

              {/* ── Implied blended rate + gap vs trailing ── */}
              <GoalConsistencyPanel
                commissionGoal={parseFloat(editGoals.commission_goal) || 0}
                premiumGoal={parseFloat(editGoals.premium_goal) || 0}
                trailingStats={trailingStats}
                productConfig={productConfig}
                onApplyTrailing={() => {
                  if (!trailingStats?.trailingBlendedRate) return;
                  const comm = parseFloat(editGoals.commission_goal) || 0;
                  if (comm <= 0) return;
                  const suggested = Math.round(comm / trailingStats.trailingBlendedRate / 1000) * 1000;
                  setEditGoals(g => ({ ...g, premium_goal: String(suggested) }));
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSavingGoals(true);
                    try {
                      await updateGoals.mutateAsync({
                        commission_goal: parseFloat(editGoals.commission_goal) || 0,
                        premium_goal: parseFloat(editGoals.premium_goal) || 0,
                      });
                      setEditGoals(null);
                    } catch (err) {
                      alert('Failed to save goals: ' + err.message);
                    } finally {
                      setSavingGoals(false);
                    }
                  }}
                  disabled={savingGoals}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />{savingGoals ? 'Saving...' : 'Save Goals'}
                </button>
                <button onClick={() => setEditGoals(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <ReadOnly label="Carrier" value={carrierConfig.carrier_name || 'Allstate'} />
              <ReadOnly label="Commission Goal" value={carrierConfig.commission_goal ? `$${Number(carrierConfig.commission_goal).toLocaleString()}/mo` : '-'} />
              <ReadOnly label="Premium Goal" value={carrierConfig.premium_goal ? `$${Number(carrierConfig.premium_goal).toLocaleString()}/mo` : '-'} />
            </div>
          )}
        </div>
      )}

      {/* Commission Rates Grid */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Commission Rates</h2>
          {isAgent && hasRates && !editRates && (
            <button onClick={startEditing} className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              Edit
            </button>
          )}
        </div>

        {!hasRates ? (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--qs-muted)' }} />
            <p className="mb-4" style={{ color: 'var(--qs-dim)' }}>No commission rates configured yet.</p>
            {isAgent && (
              <button
                onClick={handleSeedDefaults}
                disabled={upsertRates.isPending}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {upsertRates.isPending ? 'Setting up...' : 'Set Up Commission Rates'}
              </button>
            )}
          </div>
        ) : editRates ? (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 font-medium" style={{ color: 'var(--qs-subtle)' }}>Product</th>
                  {tiers.map(t => <th key={t} className="text-center py-2 font-medium" style={{ color: 'var(--qs-subtle)' }}>{tierLabels[t]}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.keys(editRates).map(product => (
                  <tr key={product} style={{ borderTop: '1px solid var(--qs-border)' }}>
                    <td className="py-2 font-medium capitalize" style={{ color: 'var(--qs-bright)' }}>{product}</td>
                    {tiers.map(tier => (
                      <td key={tier} className="py-2 text-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={editRates[product]?.[tier] || ''}
                          onChange={(e) => {
                            setEditRates(prev => ({
                              ...prev,
                              [product]: { ...prev[product], [tier]: e.target.value },
                            }));
                          }}
                          className="dark-input w-20 text-center"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs mt-2" style={{ color: 'var(--qs-subtle)' }}>Enter rates as decimals (e.g. 0.25 = 25%)</p>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Rates'}
              </button>
              <button onClick={() => setEditRates(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 font-medium" style={{ color: 'var(--qs-subtle)' }}>Product</th>
                {tiers.map(t => <th key={t} className="text-center py-2 font-medium" style={{ color: 'var(--qs-subtle)' }}>{tierLabels[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(rateGrid).map(product => (
                <tr key={product} style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <td className="py-2 font-medium capitalize" style={{ color: 'var(--qs-bright)' }}>{product}</td>
                  {tiers.map(tier => (
                    <td key={tier} className="py-2 text-center" style={{ color: 'var(--qs-dim)' }}>
                      {rateGrid[product]?.[tier] != null
                        ? `${Math.round(rateGrid[product][tier] * 100)}%`
                        : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Territory Tab ────────────────────────────────────────────────────────────

function TerritoryTab({ agency, agencyId, isAgent, queryClient }) {
  const { data: rules, isLoading: rulesLoading } = useAgencyRoutingRulesForAgent(agencyId);
  const createRule = useCreateAgencyRoutingRule(agencyId);
  const [licensedStates, setLicensedStates] = useState(agency.licensed_states || []);
  const [savingStates, setSavingStates] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ state: '', zip_prefix: '', priority_tier: 1 });

  const toggleState = (state) => {
    setLicensedStates(prev =>
      prev.includes(state) ? prev.filter(s => s !== state) : [...prev, state]
    );
  };

  const handleSaveStates = async () => {
    setSavingStates(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .update({ licensed_states: licensedStates })
        .eq('id', agencyId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSavingStates(false);
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!newRule.state) return;
    try {
      await createRule.mutateAsync({
        state: newRule.state,
        zip_prefix: newRule.zip_prefix || null,
        priority_tier: parseInt(newRule.priority_tier) || 1,
        exclusivity_level: 'none',
        capacity_enabled: true,
      });
      setShowAddRule(false);
      setNewRule({ state: '', zip_prefix: '', priority_tier: 1 });
    } catch (err) {
      alert('Failed to create rule: ' + err.message);
    }
  };

  const statesChanged = JSON.stringify(licensedStates.sort()) !== JSON.stringify((agency.licensed_states || []).sort());

  return (
    <div className="space-y-6">
      {/* Licensed States */}
      <div className="dark-card">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--qs-bright)' }}>Licensed States</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--qs-subtle)' }}>Select all states where your agency is licensed to sell insurance.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {US_STATES.map(state => (
            <button
              key={state}
              onClick={() => isAgent && toggleState(state)}
              disabled={!isAgent}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                licensedStates.includes(state)
                  ? 'bg-primary-100 text-primary-700 border border-primary-300'
                  : 'border'
              } ${!isAgent ? 'cursor-default' : 'cursor-pointer'}`}
              style={!licensedStates.includes(state) ? { background: 'var(--qs-elevated)', color: 'var(--qs-subtle)', borderColor: 'var(--qs-border)' } : undefined}
            >
              {state}
            </button>
          ))}
        </div>
        {isAgent && statesChanged && (
          <button
            onClick={handleSaveStates}
            disabled={savingStates}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />{savingStates ? 'Saving...' : 'Save Licensed States'}
          </button>
        )}
      </div>

      {/* Routing Rules */}
      <div className="dark-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Routing Rules</h2>
          {isAgent && (
            <button
              onClick={() => setShowAddRule(!showAddRule)}
              className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              + Add Rule
            </button>
          )}
        </div>

        <div className="text-sm mb-4" style={{ background: 'var(--qs-info-subtle)', border: '1px solid var(--qs-info-border)', borderRadius: '8px', padding: '12px', color: 'var(--qs-info)' }}>
          Territory rules require platform approval before going live. Existing approved rules remain active.
        </div>

        {showAddRule && (
          <form onSubmit={handleAddRule} className="mb-4 space-y-3" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: '8px', padding: '16px' }}>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>State</label>
                <select value={newRule.state} onChange={(e) => setNewRule(r => ({ ...r, state: e.target.value }))} className="dark-select" required>
                  <option value="">Select...</option>
                  {licensedStates.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>ZIP Prefix (optional)</label>
                <input type="text" value={newRule.zip_prefix} onChange={(e) => setNewRule(r => ({ ...r, zip_prefix: e.target.value }))} className="dark-input" placeholder="e.g. 303" maxLength={3} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Priority</label>
                <input type="number" value={newRule.priority_tier} onChange={(e) => setNewRule(r => ({ ...r, priority_tier: e.target.value }))} className="dark-input" min={1} max={10} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createRule.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50 text-sm">
                {createRule.isPending ? 'Creating...' : 'Create Rule'}
              </button>
              <button type="button" onClick={() => setShowAddRule(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </form>
        )}

        {rulesLoading ? (
          <p className="text-sm py-4" style={{ color: 'var(--qs-subtle)' }}>Loading rules...</p>
        ) : rules && rules.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--qs-elevated)' }}>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>State</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>ZIP Prefix</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Priority</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--qs-subtle)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--qs-bright)' }}>{rule.state}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--qs-text)' }}>{rule.zip_prefix || 'All'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--qs-text)' }}>{rule.priority_tier}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rule.status === 'active' ? 'bg-green-100 text-green-700' :
                        rule.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' : ''
                      }`}
                      style={rule.status !== 'active' && rule.status !== 'pending_approval' ? {
                        background: 'var(--qs-elevated)', color: 'var(--qs-subtle)'
                      } : undefined}
                    >
                      {rule.status === 'pending_approval' ? 'Pending' : rule.status || 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm py-4" style={{ color: 'var(--qs-subtle)' }}>No routing rules configured.</p>
        )}
      </div>
    </div>
  );
}

// ─── Transfer Phone Tab ───────────────────────────────────────────────────────

function TransferPhoneTab({ agencyId, isAgent }) {
  const { data: team = [], isLoading } = useTeamAvailability(agencyId);
  const setPhoneMutation = useSetTransferPhone();
  const [editingUserId, setEditingUserId] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const startEditing = (member) => {
    setEditingUserId(member.user_id);
    setPhoneInput(member.transfer_phone || '');
    setPhoneError('');
  };

  const handleSave = async (userId) => {
    const phone = phoneInput.trim();
    if (!phone) {
      setPhoneError('Phone number is required');
      return;
    }
    if (!validateE164(phone)) {
      setPhoneError('Enter a valid US number in E.164 format (e.g. +14045551234)');
      return;
    }

    try {
      await setPhoneMutation.mutateAsync({
        agencyId,
        userId,
        transferPhone: phone,
      });
      setEditingUserId(null);
      setPhoneInput('');
    } catch (err) {
      setPhoneError('Failed to save: ' + err.message);
    }
  };

  function maskPhone(phone) {
    if (!phone || phone.length < 4) return 'Not set';
    return `••• ••• ${phone.slice(-4)}`;
  }

  if (isLoading) {
    return <div className="py-8 text-center" style={{ color: 'var(--qs-subtle)' }}>Loading transfer settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="dark-card">
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--qs-bright)' }}>Transfer Phone Numbers</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--qs-subtle)' }}>
          Set direct phone numbers for each producer. These numbers are used by Bland AI for live call transfers when agents are available.
        </p>

        {team.length === 0 ? (
          <div className="text-center py-8">
            <PhoneCall className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--qs-muted)' }} />
            <p style={{ color: 'var(--qs-dim)' }}>No team members have set up availability yet.</p>
            <p className="text-sm mt-1" style={{ color: 'var(--qs-subtle)' }}>
              Producers can toggle their availability from their My Queue page to create their record.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.map((member) => (
              <div
                key={member.user_id}
                style={{
                  padding: '12px 16px',
                  background: 'var(--qs-elevated)',
                  borderRadius: 10,
                  border: '1px solid var(--qs-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editingUserId === member.user_id ? 12 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: member.available ? '#22C55E' : '#6B7280',
                      flexShrink: 0,
                    }} />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                        {member.profiles?.full_name || 'Unknown'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--qs-subtle)', marginLeft: 8 }}>
                        {member.priority_tier === 0 ? 'Principal' : 'Producer'}
                      </span>
                    </div>
                  </div>

                  {editingUserId !== member.user_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
                        {maskPhone(member.transfer_phone)}
                      </span>
                      {isAgent && (
                        <button
                          onClick={() => startEditing(member)}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingUserId === member.user_id && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="tel"
                          value={phoneInput}
                          onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
                          placeholder="+14045551234"
                          className="dark-input"
                          style={{ width: '100%', fontSize: 14 }}
                          autoFocus
                        />
                        {phoneError && (
                          <div style={{ fontSize: 12, color: 'var(--qs-danger)', marginTop: 4 }}>
                            {phoneError}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSave(member.user_id)}
                        disabled={setPhoneMutation.isPending}
                        className="flex items-center gap-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50 text-sm"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingUserId(null); setPhoneError(''); }}
                        className="btn-ghost text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dark-card">
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--qs-dim)' }}>How Transfers Work</h3>
        <ul className="text-sm space-y-1" style={{ color: 'var(--qs-subtle)' }}>
          <li>When a lead submits the quote funnel, Bland AI calls them within seconds.</li>
          <li>If an agent is available and it's business hours, Bland offers a live transfer.</li>
          <li>The principal (priority 0) always routes first when available.</li>
          <li>Other producers route in round-robin order behind the principal.</li>
          <li>Each producer manages their own availability toggle from their My Queue page.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Producer Goals Tab ──────────────────────────────────────────────────────

const TARGET_FIELDS = [
  { key: 'outbound_calls_weekly', label: 'Outbound Calls / Week',        type: 'number' },
  { key: 'avg_calls_per_day',    label: 'Avg Calls / Day',              type: 'number' },
  { key: 'vc_items_monthly',     label: 'VC Items / Month',             type: 'number' },
  { key: 'premium_monthly',      label: 'Premium Target / Month ($)',   type: 'number', hint: '0 = not tracked' },
  { key: 'grade_a_vc_items',     label: 'Grade A VC Threshold',         type: 'number' },
  { key: 'grade_b_vc_items',     label: 'Grade B VC Threshold',         type: 'number' },
  { key: 'grade_c_vc_items',     label: 'Grade C VC Threshold',         type: 'number' },
  { key: 'grade_a_outbound',     label: 'Grade A Outbound Threshold',   type: 'number' },
  { key: 'grade_b_outbound',     label: 'Grade B Outbound Threshold',   type: 'number' },
  { key: 'grade_c_outbound',     label: 'Grade C Outbound Threshold',   type: 'number' },
];

// Read-only snapshot. Producer goals are now set in Planning → Production Goals
// (effective-dated, with trailing context, suggestions, and agency-goal
// reconciliation). Keeping a second editor here would mean two write paths
// against the same effective-dated table, so this surface only displays the
// current in-force goals and links out to the editor.
function ProducerGoalsTab({ agencyId }) {
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const { data: allTargets = [] } = useAllProducerTargets(agencyId);

  const producers = useMemo(() =>
    employees.filter(e => e.roles?.includes('sales') || e.roles?.includes('producer')),
    [employees]
  );

  const targetsMap = useMemo(() => {
    const m = {};
    for (const t of allTargets) m[t.employee_user_id] = t;
    return m;
  }, [allTargets]);

  return (
    <div className="space-y-4">
      <div className="dark-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Producer Performance Goals</h2>
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                Goals are set in Planning → Production Goals, with trailing production, suggestions, and agency-goal reconciliation. This view is read-only.
              </p>
            </div>
          </div>
          <Link
            to="/agency/planning?tab=goals"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg text-sm whitespace-nowrap"
          >
            Edit in Planning →
          </Link>
        </div>
      </div>

      {!producers.length ? (
        <div className="dark-card text-center py-8">
          <Target className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--qs-muted)' }} />
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--qs-bright)' }}>No Producers Found</h2>
          <p style={{ color: 'var(--qs-dim)' }}>Add employees with the "sales" role to configure their performance goals.</p>
        </div>
      ) : (
        producers.map(producer => {
          const userId = producer.auth_user_id || producer.id;
          const name = `${producer.preferred_name || producer.first_name} ${producer.last_name || ''}`.trim();
          return (
            <ProducerGoalCard
              key={userId}
              producerName={name}
              savedTargets={targetsMap[userId] || {}}
            />
          );
        })
      )}
    </div>
  );
}

function ProducerGoalCard({ producerName, savedTargets }) {
  const [expanded, setExpanded] = useState(false);

  const currentValues = useMemo(() => {
    const merged = { ...PRODUCER_DEFAULT_TARGETS };
    for (const f of TARGET_FIELDS) {
      if (savedTargets[f.key] != null) merged[f.key] = savedTargets[f.key];
    }
    return merged;
  }, [savedTargets]);

  return (
    <div className="dark-card">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-900/30 flex items-center justify-center">
            <span className="text-sm font-bold text-primary-400">
              {producerName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{producerName}</h3>
            <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
              {savedTargets.premium_monthly > 0
                ? `Premium goal $${Number(savedTargets.premium_monthly).toLocaleString()}/mo`
                : savedTargets.updated_at
                ? `Last updated ${new Date(savedTargets.updated_at).toLocaleDateString()}`
                : 'Using defaults'}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--qs-subtle)' }} />
          : <ChevronDown className="w-4 h-4" style={{ color: 'var(--qs-subtle)' }} />}
      </button>

      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--qs-border)' }}>
          <div className="grid gap-3 md:grid-cols-2">
            {TARGET_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>
                  {f.label}
                </label>
                <p className="text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>
                  {f.key === 'premium_monthly' && currentValues[f.key] > 0
                    ? `$${currentValues[f.key].toLocaleString()}`
                    : f.key === 'premium_monthly' && currentValues[f.key] === 0
                    ? 'Not tracked'
                    : currentValues[f.key]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="dark-input"
        placeholder={placeholder}
      />
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--qs-subtle)' }}>{label}</label>
      <p style={{ color: 'var(--qs-bright)' }}>{value || '-'}</p>
    </div>
  );
}

// ─── Goal Consistency Panel ──────────────────────────────────────────────────
// Shown under the Commission / Premium goal inputs to surface (1) the implied
// blended rate of the chosen pair, (2) how far it sits from the trailing-12
// realized rate, (3) a one-click suggestion that back-solves premium goal
// from commission goal at the trailing rate, and (4) the trailing product
// mix so the principal can see which product lines drive the blended rate.
//
// Goals are NOT auto-linked — the panel is informational. See the dev brief
// in the PR description for the reasoning.
function GoalConsistencyPanel({ commissionGoal, premiumGoal, trailingStats, productConfig, onApplyTrailing }) {
  const impliedRate = premiumGoal > 0 ? commissionGoal / premiumGoal : null;
  const trailing    = trailingStats?.trailingBlendedRate ?? null;
  const gapPts      = impliedRate != null && trailing != null
    ? (impliedRate - trailing) * 100
    : null;

  // Trailing mix rows, sorted by premium share descending
  const mixRows = trailingStats?.hasData
    ? Object.entries(trailingStats.byProduct)
        .map(([key, v]) => ({
          key,
          label: productConfig?.productLabels?.[key] ?? key,
          premium: v.premium,
          commission: v.commission,
          share: v.share,
          effectiveRate: v.effectiveRate,
        }))
        .sort((a, b) => b.share - a.share)
    : [];

  const fmt$ = (n) => `$${Math.round(n).toLocaleString()}`;
  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

  // Classify the gap. Wider than 2pt is the threshold where the principal
  // should actively consider mix changes rather than rounding noise.
  let gapClass = 'neutral';
  if (gapPts != null) {
    if (gapPts >  2) gapClass = 'stretch';
    else if (gapPts < -2) gapClass = 'conservative';
  }
  const gapColor = gapClass === 'stretch'      ? 'var(--qs-warning)'
                 : gapClass === 'conservative' ? 'var(--qs-info)'
                 : 'var(--qs-success)';

  return (
    <div
      style={{
        background: 'var(--qs-elevated)',
        border: '1px solid var(--qs-border)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      {/* Row 1: Implied rate · Trailing · Gap */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            Implied Blended Rate
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)', fontFamily: "'DM Mono', monospace" }}>
            {impliedRate != null ? fmtPct(impliedRate) : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)' }}>
            {commissionGoal > 0 && premiumGoal > 0
              ? `${fmt$(commissionGoal)} ÷ ${fmt$(premiumGoal)}`
              : 'Set both goals'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            Trailing 12mo Realized
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)', fontFamily: "'DM Mono', monospace" }}>
            {trailing != null ? fmtPct(trailing) : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)' }}>
            {trailingStats?.hasData
              ? `${trailingStats.totalPolicies} policies · ${fmt$(trailingStats.totalPremium)} premium`
              : 'No historical data yet'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            Gap
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: gapColor, fontFamily: "'DM Mono', monospace" }}>
            {gapPts != null ? `${gapPts >= 0 ? '+' : ''}${gapPts.toFixed(1)}pt` : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--qs-muted)' }}>
            {gapClass === 'stretch'      ? 'Stretch — requires mix shift'
           : gapClass === 'conservative' ? 'Conservative vs history'
           : gapPts != null              ? 'In line with history'
                                         : ''}
          </div>
        </div>
      </div>

      {/* Row 2: Suggest button */}
      {trailing != null && commissionGoal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: mixRows.length > 0 ? 14 : 0 }}>
          <button
            type="button"
            onClick={onApplyTrailing}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            Suggest premium goal from trailing rate
          </button>
          <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
            At {fmtPct(trailing)} → premium goal ≈ {fmt$(commissionGoal / trailing)}
          </span>
        </div>
      )}

      {/* Row 3: Trailing mix table */}
      {mixRows.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Trailing 12mo Product Mix
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, minWidth: 480 }}>
              <thead>
                <tr style={{ color: 'var(--qs-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>Product</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>Premium</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>Mix %</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500, textAlign: 'right' }}>Eff. Rate</th>
                  <th style={{ padding: '4px 8px', fontWeight: 500 }}>vs Blended</th>
                </tr>
              </thead>
              <tbody>
                {mixRows.map(row => {
                  const liftPts = trailing != null ? (row.effectiveRate - trailing) * 100 : null;
                  const liftColor = liftPts == null        ? 'var(--qs-muted)'
                                  : liftPts >  0.5         ? 'var(--qs-success)'
                                  : liftPts < -0.5         ? 'var(--qs-danger)'
                                                           : 'var(--qs-muted)';
                  return (
                    <tr key={row.key} style={{ borderTop: '1px solid var(--qs-border)' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--qs-dim)' }}>{row.label}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace" }}>
                        {fmt$(row.premium)}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace" }}>
                        {fmtPct(row.share)}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace" }}>
                        {fmtPct(row.effectiveRate)}
                      </td>
                      <td style={{ padding: '4px 8px', color: liftColor, fontFamily: "'DM Mono', monospace" }}>
                        {liftPts != null ? `${liftPts >= 0 ? '+' : ''}${liftPts.toFixed(1)}pt` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {gapClass === 'stretch' && (() => {
            // Highlight the highest-rate product as the lever to close the gap
            const topLever = [...mixRows].sort((a, b) => b.effectiveRate - a.effectiveRate)[0];
            if (!topLever || topLever.effectiveRate <= trailing) return null;
            return (
              <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 8, lineHeight: 1.5 }}>
                To close the {gapPts.toFixed(1)}pt gap, shift mix toward{' '}
                <span style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>{topLever.label}</span>
                {' '}({fmtPct(topLever.effectiveRate)} effective rate, currently {fmtPct(topLever.share)} of premium).
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default AgencySettingsPage;
