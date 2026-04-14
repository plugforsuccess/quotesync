// src/pages/AgencySettingsPage.jsx
// MT-06: Agency settings with Profile / Notifications / Commission / Territory tabs

import { useState, useMemo, useCallback } from 'react';
import { Building2, Mail, Phone, Shield, Users, Save, AlertCircle, Bell, DollarSign, Map, PhoneCall, Target, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyDetail, useAgencyCarrierConfig, useAgencyCommissionRatesRaw, useUpsertCommissionRates, useUpdateRevenueGoals, useAgencyRoutingRulesForAgent, useCreateAgencyRoutingRule } from '../hooks/useAgencies';
import { useTrailingRevenueStats } from '../hooks/useTrailingRevenueStats';
import { useAgencyProductConfig } from '../hooks/useAgencyProductConfig';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useTeamAvailability, useSetTransferPhone, validateE164 } from '../hooks/useAgentAvailability';
import { useAllProducerTargets, useSaveProducerTargets, PRODUCER_DEFAULT_TARGETS } from '../hooks/useProducerTargets';
import { useActiveEmployees } from '../hooks/useEmployees';
import EmployeeInviteModal from './components/settings/EmployeeInviteModal';
import PageSpinner from '../components/PageSpinner';

const TABS = [
  { key: 'profile', label: 'Profile', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'transfers', label: 'Transfers', icon: PhoneCall },
  { key: 'commission', label: 'Commission', icon: DollarSign },
  { key: 'territory', label: 'Territory', icon: Map },
  { key: 'producer_goals', label: 'Producer Goals', icon: Target },
  { key: 'employees', label: 'Employees', icon: Users },
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
          {TABS.map(({ key, label, icon: Icon }) => (
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
        {activeTab === 'producer_goals' && <ProducerGoalsTab agencyId={currentAgencyId} isAgent={isAgent} />}
        {activeTab === 'employees' && <EmployeesTab agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
      </div>
    </div>
  );
};

// ─── Employees Tab ────────────────────────────────────────────────────────────
// Roster of active employees with their auth-link status. Principals can send
// a Supabase invite to any employee whose auth_user_id is null. Once linked,
// the employee can sign in and use /my/queue, /my/scorecard, /punch.

function EmployeesTab({ agencyId, isAgent, queryClient }) {
  const { data: employees = [], isLoading } = useActiveEmployees(agencyId);
  const [inviteTarget, setInviteTarget] = useState(null);

  if (isLoading) {
    return (
      <div className="dark-card text-center py-8">
        <p style={{ color: 'var(--qs-dim)' }}>Loading employees...</p>
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="dark-card text-center py-8">
        <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--qs-muted)' }} />
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--qs-bright)' }}>No Active Employees</h2>
        <p style={{ color: 'var(--qs-dim)' }}>Add employees from the Employee Roster to invite them to QuoteSync.</p>
      </div>
    );
  }

  const linkedCount = employees.filter(e => e.auth_user_id).length;

  return (
    <div className="space-y-4">
      <div className="dark-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Employee Access</h2>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>
            {linkedCount} of {employees.length} linked
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          Invite employees to QuoteSync so they can access their Queue, Scorecard,
          and Punch Clock. They'll receive an email with a link to set up their account.
        </p>
      </div>

      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-qs-elevated border-b border-qs-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>Role</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-qs-border">
              {employees.map((emp) => {
                const displayName = `${emp.preferred_name || emp.first_name} ${emp.last_name || ''}`.trim();
                const roleLabel = (emp.roles || []).join(', ') || '—';
                return (
                  <tr key={emp.id}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--qs-bright)' }}>
                      {displayName}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--qs-dim)' }}>
                      {roleLabel}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {emp.auth_user_id ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#10B981',
                          background: '#10B98111', padding: '3px 8px', borderRadius: 4 }}>
                          ● Active
                        </span>
                      ) : isAgent ? (
                        <button
                          onClick={() => setInviteTarget(emp)}
                          style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px',
                            borderRadius: 6, background: '#3B82F622',
                            border: '1px solid #3B82F633', color: '#3B82F6', cursor: 'pointer' }}>
                          Invite
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)' }}>
                          Not linked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {inviteTarget && (
        <EmployeeInviteModal
          employee={inviteTarget}
          agencyId={agencyId}
          onClose={() => setInviteTarget(null)}
          onSuccess={() => {
            setInviteTarget(null);
            queryClient.invalidateQueries({ queryKey: ['employees', 'active', agencyId] });
          }}
        />
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ agency, agencyId, isAgent, queryClient }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

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
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
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

function ProducerGoalsTab({ agencyId, isAgent }) {
  const { data: employees = [] } = useActiveEmployees(agencyId);
  const { data: allTargets = [] } = useAllProducerTargets(agencyId);
  const { mutate: saveTargets, isPending: savingTargets } = useSaveProducerTargets(agencyId);

  // Filter to sales/producer role employees
  const producers = useMemo(() =>
    employees.filter(e => e.roles?.includes('sales') || e.roles?.includes('producer')),
    [employees]
  );

  // Build targets map: employee auth_user_id → saved targets
  const targetsMap = useMemo(() => {
    const m = {};
    for (const t of allTargets) {
      m[t.employee_user_id] = t;
    }
    return m;
  }, [allTargets]);

  if (!producers.length) {
    return (
      <div className="dark-card text-center py-8">
        <Target className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--qs-muted)' }} />
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--qs-bright)' }}>No Producers Found</h2>
        <p style={{ color: 'var(--qs-dim)' }}>Add employees with the "sales" role to configure their performance goals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="dark-card">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>Producer Performance Goals</h2>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--qs-subtle)' }}>
          Configure performance targets for each producer. These thresholds determine the grade displayed on their scorecard.
        </p>
      </div>

      {producers.map(producer => {
        const userId = producer.auth_user_id || producer.id;
        const name = `${producer.preferred_name || producer.first_name} ${producer.last_name || ''}`.trim();
        const saved = targetsMap[userId] || {};
        return (
          <ProducerGoalCard
            key={userId}
            producerName={name}
            employeeUserId={userId}
            savedTargets={saved}
            onSave={(targets) => saveTargets({ employeeUserId: userId, targets })}
            saving={savingTargets}
            isAgent={isAgent}
          />
        );
      })}
    </div>
  );
}

function ProducerGoalCard({ producerName, employeeUserId, savedTargets, onSave, saving, isAgent }) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  const currentValues = useMemo(() => {
    const merged = { ...PRODUCER_DEFAULT_TARGETS };
    for (const f of TARGET_FIELDS) {
      if (savedTargets[f.key] != null) merged[f.key] = savedTargets[f.key];
    }
    return merged;
  }, [savedTargets]);

  const startEditing = useCallback(() => {
    setForm({ ...currentValues });
    setExpanded(true);
  }, [currentValues]);

  const handleSave = useCallback(() => {
    const targets = {};
    for (const f of TARGET_FIELDS) {
      targets[f.key] = parseFloat(form[f.key]) || 0;
    }
    onSave(targets);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    setForm(null);
  }, [form, onSave]);

  const handleCancel = useCallback(() => {
    setForm(null);
    setExpanded(false);
  }, []);

  const isEditing = form !== null;

  return (
    <div className="dark-card">
      <button
        onClick={() => isEditing ? null : setExpanded(e => !e)}
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
              {savedTargets.updated_at
                ? `Last updated ${new Date(savedTargets.updated_at).toLocaleDateString()}`
                : 'Using defaults'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {justSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {!isEditing && (
            expanded
              ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--qs-subtle)' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: 'var(--qs-subtle)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--qs-border)' }}>
          <div className="grid gap-3 md:grid-cols-2">
            {TARGET_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>
                  {f.label}
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="number"
                      min="0"
                      step={f.key === 'avg_calls_per_day' ? '0.5' : '1'}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="dark-input text-sm"
                    />
                    {f.hint && <p className="text-xs mt-0.5" style={{ color: 'var(--qs-muted)' }}>{f.hint}</p>}
                  </div>
                ) : (
                  <p className="text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>
                    {f.key === 'premium_monthly' && currentValues[f.key] > 0
                      ? `$${currentValues[f.key].toLocaleString()}`
                      : f.key === 'premium_monthly' && currentValues[f.key] === 0
                      ? 'Not tracked'
                      : currentValues[f.key]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {isAgent && (
            <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50 text-sm"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? 'Saving...' : 'Save Goals'}
                  </button>
                  <button onClick={handleCancel} className="btn-ghost text-sm">Cancel</button>
                </>
              ) : (
                <button
                  onClick={startEditing}
                  className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Edit Goals
                </button>
              )}
            </div>
          )}
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
