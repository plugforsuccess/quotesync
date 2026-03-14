// src/pages/AgencySettingsPage.jsx
// MT-06: Agency settings with Profile / Notifications / Commission / Territory tabs

import { useState, useMemo } from 'react';
import { Building2, Mail, Phone, Shield, Users, Save, AlertCircle, Bell, DollarSign, Map } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyDetail, useAgencyCarrierConfig, useAgencyCommissionRatesRaw, useUpsertCommissionRates, useAgencyRoutingRulesForAgent, useCreateAgencyRoutingRule } from '../hooks/useAgencies';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import PageSpinner from '../components/PageSpinner';

const TABS = [
  { key: 'profile', label: 'Profile', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'commission', label: 'Commission', icon: DollarSign },
  { key: 'territory', label: 'Territory', icon: Map },
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
  const isAgent = currentAgencyRole === 'agent';

  if (!currentAgencyId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Agency Found</h2>
          <p className="text-gray-600">You are not currently associated with an agency.</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <PageSpinner />;
  if (error || !agency) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Agency</h2>
          <p className="text-gray-600">{error?.message || 'Agency not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agency Settings</h1>
            <p className="text-gray-500">Manage your agency profile and configuration</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && <ProfileTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
        {activeTab === 'notifications' && <NotificationsTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
        {activeTab === 'commission' && <CommissionTab agencyId={currentAgencyId} isAgent={isAgent} />}
        {activeTab === 'territory' && <TerritoryTab agency={agency} agencyId={currentAgencyId} isAgent={isAgent} queryClient={queryClient} />}
      </div>
    </div>
  );
};

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
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Agency Profile</h2>
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
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
          {isAgent && !editing && (
            <button onClick={startEditing} className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <Field label="Your Cell Number" type="tel" value={form.agent_cell_number} onChange={(v) => setForm(f => ({ ...f, agent_cell_number: v }))} placeholder="(404) 555-1234" />
            <p className="text-xs text-gray-500">This is where speed-to-call will ring and where forwarded SMS messages will go.</p>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ReadOnly label="Your Cell Number" value={agency.agent_cell_number || 'Not set'} />
            <ReadOnly label="Twilio SMS Number" value={agency.twilio_from_number || 'Using platform default'} />
            <p className="text-xs text-gray-500">Contact platform support to configure a dedicated Twilio number.</p>
          </div>
        )}
      </div>

      {/* SMS Preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">SMS Preview</h3>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-700 leading-relaxed">
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
  const upsertRates = useUpsertCommissionRates(agencyId);
  const [editRates, setEditRates] = useState(null);
  const [saving, setSaving] = useState(false);

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

  if (isLoading) return <div className="py-8 text-center text-gray-500">Loading commission data...</div>;

  const tiers = ['preferred', 'bundled', 'monoline'];
  const tierLabels = { preferred: 'Preferred', bundled: 'Bundled', monoline: 'Monoline' };

  return (
    <div className="space-y-6">
      {/* Carrier Config */}
      {carrierConfig && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Carrier Configuration</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <ReadOnly label="Carrier" value={carrierConfig.carrier_name || 'Allstate'} />
            <ReadOnly label="Commissionable Factor" value={carrierConfig.commissionable_factor ? `${(carrierConfig.commissionable_factor * 100).toFixed(1)}%` : '-'} />
            <ReadOnly label="Commission Goal" value={carrierConfig.commission_goal ? `$${Number(carrierConfig.commission_goal).toLocaleString()}` : '-'} />
          </div>
        </div>
      )}

      {/* Commission Rates Grid */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Commission Rates</h2>
          {isAgent && hasRates && !editRates && (
            <button onClick={startEditing} className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              Edit
            </button>
          )}
        </div>

        {!hasRates ? (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">No commission rates configured yet.</p>
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
                  <th className="text-left py-2 text-gray-500 font-medium">Product</th>
                  {tiers.map(t => <th key={t} className="text-center py-2 text-gray-500 font-medium">{tierLabels[t]}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.keys(editRates).map(product => (
                  <tr key={product} className="border-t border-gray-100">
                    <td className="py-2 font-medium text-gray-900 capitalize">{product}</td>
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
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">Enter rates as decimals (e.g. 0.25 = 25%)</p>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Rates'}
              </button>
              <button onClick={() => setEditRates(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 text-gray-500 font-medium">Product</th>
                {tiers.map(t => <th key={t} className="text-center py-2 text-gray-500 font-medium">{tierLabels[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(rateGrid).map(product => (
                <tr key={product} className="border-t border-gray-100">
                  <td className="py-2 font-medium text-gray-900 capitalize">{product}</td>
                  {tiers.map(tier => (
                    <td key={tier} className="py-2 text-center text-gray-700">
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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Licensed States</h2>
        <p className="text-sm text-gray-500 mb-4">Select all states where your agency is licensed to sell insurance.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {US_STATES.map(state => (
            <button
              key={state}
              onClick={() => isAgent && toggleState(state)}
              disabled={!isAgent}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                licensedStates.includes(state)
                  ? 'bg-primary-100 text-primary-700 border border-primary-300'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300'
              } ${!isAgent ? 'cursor-default' : 'cursor-pointer'}`}
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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Routing Rules</h2>
          {isAgent && (
            <button
              onClick={() => setShowAddRule(!showAddRule)}
              className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              + Add Rule
            </button>
          )}
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 mb-4">
          Territory rules require platform approval before going live. Existing approved rules remain active.
        </div>

        {showAddRule && (
          <form onSubmit={handleAddRule} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select value={newRule.state} onChange={(e) => setNewRule(r => ({ ...r, state: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" required>
                  <option value="">Select...</option>
                  {licensedStates.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Prefix (optional)</label>
                <input type="text" value={newRule.zip_prefix} onChange={(e) => setNewRule(r => ({ ...r, zip_prefix: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g. 303" maxLength={3} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input type="number" value={newRule.priority_tier} onChange={(e) => setNewRule(r => ({ ...r, priority_tier: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" min={1} max={10} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createRule.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50 text-sm">
                {createRule.isPending ? 'Creating...' : 'Create Rule'}
              </button>
              <button type="button" onClick={() => setShowAddRule(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        )}

        {rulesLoading ? (
          <p className="text-gray-500 text-sm py-4">Loading rules...</p>
        ) : rules && rules.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ZIP Prefix</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{rule.state}</td>
                  <td className="px-4 py-3 text-gray-700">{rule.zip_prefix || 'All'}</td>
                  <td className="px-4 py-3 text-gray-700">{rule.priority_tier}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      rule.status === 'active' ? 'bg-green-100 text-green-700' :
                      rule.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {rule.status === 'pending_approval' ? 'Pending' : rule.status || 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm py-4">No routing rules configured.</p>
        )}
      </div>
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        placeholder={placeholder}
      />
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
      <p className="text-gray-900">{value || '-'}</p>
    </div>
  );
}

export default AgencySettingsPage;
