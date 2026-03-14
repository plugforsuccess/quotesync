// src/pages/AgencySettingsPage.jsx
// Agency settings page for agency owners to view and manage their agency profile

import { useState } from 'react';
import { Building2, Mail, Phone, Shield, Users, Save, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyDetail } from '../hooks/useAgencies';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import PageSpinner from '../components/PageSpinner';

const AgencySettingsPage = () => {
  const { currentAgencyId, currentAgencyRole, agencyMemberships } = useAuth();
  const { data: agency, isLoading, error } = useAgencyDetail(currentAgencyId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  // Fetch lead count for this agency
  const { data: leadCount = 0 } = useQuery({
    queryKey: ['agency_lead_count', currentAgencyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', currentAgencyId)
        .neq('status', 'partial');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentAgencyId,
  });

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

  if (isLoading) {
    return <PageSpinner />;
  }

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

  const startEditing = () => {
    setForm({
      brand_name: agency.brand_name || '',
      email: agency.email || '',
      phone: agency.phone || '',
      primary_contact_name: agency.primary_contact_name || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('agencies')
        .update({
          brand_name: form.brand_name || null,
          email: form.email,
          phone: form.phone || null,
          primary_contact_name: form.primary_contact_name || null,
        })
        .eq('id', currentAgencyId);

      if (updateError) throw updateError;
      setEditing(false);
      // Trigger refetch
      window.location.reload();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    suspended: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Building2 className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agency Settings</h1>
            <p className="text-gray-500">Manage your agency profile and information</p>
          </div>
        </div>

        {/* Agency Info Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Agency Profile</h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[agency.status]}`}>
                {agency.status}
              </span>
              {currentAgencyRole === 'agent' && !editing && (
                <button
                  onClick={startEditing}
                  className="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={form.brand_name}
                    onChange={(e) => setForm(f => ({ ...f, brand_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Display name for your agency"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={form.primary_contact_name}
                    onChange={(e) => setForm(f => ({ ...f, primary_contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Legal Name</label>
                <p className="text-gray-900">{agency.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Brand Name</label>
                <p className="text-gray-900">{agency.brand_name || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Contact Name</label>
                <p className="text-gray-900">{agency.primary_contact_name || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
                  <p className="text-gray-900">{agency.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Phone</label>
                  <p className="text-gray-900">{agency.phone || '-'}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Member Since</label>
                <p className="text-gray-900">{new Date(agency.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats Card */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Shield className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-lg font-semibold text-gray-900 capitalize">{agency.status}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Leads</p>
                <p className="text-lg font-semibold text-gray-900">{leadCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Lines of Business</p>
                <p className="text-lg font-semibold text-gray-900">
                  {agency.lines_of_business?.length || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Licensing Info */}
        {(agency.state_licenses?.length > 0 || agency.lines_of_business?.length > 0) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Licensing & Coverage</h2>
            <div className="space-y-4">
              {agency.state_licenses?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Licensed States</label>
                  <div className="flex flex-wrap gap-2">
                    {agency.state_licenses.map(s => (
                      <span key={s} className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {agency.lines_of_business?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Lines of Business</label>
                  <div className="flex flex-wrap gap-2">
                    {agency.lines_of_business.map(lob => (
                      <span key={lob} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm capitalize">{lob}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgencySettingsPage;
