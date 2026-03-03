// src/pages/AdminAgencyDetailPage.jsx
// Admin detail view for reviewing, approving, and configuring agencies

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, CheckCircle, XCircle, Ban, Clock, Plus, Trash2,
  MapPin, Users, FileText, History, Save, AlertCircle, UserPlus
} from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import {
  useAgencyDetail,
  useAgencyRoutingRules,
  useAgencyUsers,
  useAgencyAuditLog,
  useUpdateAgencyStatus,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
  useInviteAgencyUser,
  useDeleteAgencyUser
} from '../hooks/useAgencies';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const AdminAgencyDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role: userRole } = useAuth();

  const [activeTab, setActiveTab] = useState('application');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);

  // Data fetching
  const { data: agency, isLoading: agencyLoading, error: agencyError } = useAgencyDetail(id);
  const { data: routingRules = [], isLoading: rulesLoading } = useAgencyRoutingRules(id);
  const { data: agencyUsers = [], isLoading: usersLoading } = useAgencyUsers(id);
  const { data: auditLog = [], isLoading: auditLoading } = useAgencyAuditLog(id);

  // Mutations
  const updateStatus = useUpdateAgencyStatus();
  const createRule = useCreateRoutingRule();
  const updateRule = useUpdateRoutingRule();
  const deleteRule = useDeleteRoutingRule();
  const inviteUser = useInviteAgencyUser();
  const deleteUser = useDeleteAgencyUser();

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    state: '',
    zip: '',
    exclusivity_level: 'none',
    priority_tier: 0,
    capacity_enabled: true,
    rule_type: 'geographic',
    min_score: '',
    max_score: '',
    carrier_filter: ''
  });

  // User form state
  const [userForm, setUserForm] = useState({
    email: '',
    role: 'producer'
  });

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (agencyError || !agency) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Agency Not Found</h2>
          <Link to="/admin/agencies" className="text-blue-600 hover:underline">Back to Agencies</Link>
        </div>
      </div>
    );
  }

  const handleStatusChange = async (newStatus) => {
    const confirmMsg = {
      approved: 'Approve this agency? They will be able to receive leads.',
      rejected: 'Reject this application? The agency will be notified.',
      suspended: 'Suspend this agency? Their routing rules will be deactivated.'
    };

    if (!confirm(confirmMsg[newStatus])) return;

    try {
      await updateStatus.mutateAsync({ agencyId: id, status: newStatus, userId: user?.id });
      alert(`Agency ${newStatus} successfully`);
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const handleSaveRule = async () => {
    try {
      const rulePayload = {
        ...ruleForm,
        min_score: ruleForm.min_score !== '' ? parseInt(ruleForm.min_score) : null,
        max_score: ruleForm.max_score !== '' ? parseInt(ruleForm.max_score) : null,
        carrier_filter: ruleForm.carrier_filter || null,
      };
      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, agencyId: id, ...rulePayload });
      } else {
        await createRule.mutateAsync({ agency_id: id, ...rulePayload });
      }
      setShowRuleForm(false);
      setEditingRule(null);
      setRuleForm({ state: '', zip: '', exclusivity_level: 'none', priority_tier: 0, capacity_enabled: true, rule_type: 'geographic', min_score: '', max_score: '', carrier_filter: '' });
    } catch (err) {
      alert('Failed to save rule: ' + err.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Delete this routing rule?')) return;
    try {
      await deleteRule.mutateAsync({ id: ruleId, agencyId: id });
    } catch (err) {
      alert('Failed to delete rule: ' + err.message);
    }
  };

  const handleInviteUser = async () => {
    if (!userForm.email) {
      alert('Please enter an email address');
      return;
    }
    try {
      const result = await inviteUser.mutateAsync({
        email: userForm.email,
        role: userForm.role,
        agencyId: id,
        actorUserId: user?.id
      });
      if (result.invited) {
        alert(result.message);
      } else {
        alert('User added to agency successfully');
      }
      setShowUserForm(false);
      setUserForm({ email: '', role: 'producer' });
    } catch (err) {
      alert('Failed to add user: ' + err.message);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!confirm('Remove this user from the agency?')) return;
    try {
      await deleteUser.mutateAsync({ userId, agencyId: id });
    } catch (err) {
      alert('Failed to remove user: ' + err.message);
    }
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    suspended: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/admin/agencies')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">{agency.name}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[agency.status]}`}>
                  {agency.status}
                </span>
              </div>
              {agency.brand_name && (
                <p className="text-gray-500 mt-1">DBA: {agency.brand_name}</p>
              )}
            </div>
          </div>

          {/* Status Actions */}
          <div className="flex gap-2 flex-wrap">
            {agency.status !== 'approved' && (
              <button
                onClick={() => handleStatusChange('approved')}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
            )}
            {agency.status !== 'rejected' && agency.status === 'pending' && (
              <button
                onClick={() => handleStatusChange('rejected')}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            )}
            {agency.status === 'approved' && (
              <button
                onClick={() => handleStatusChange('suspended')}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                Suspend
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'application', label: 'Application', icon: FileText },
              { id: 'territories', label: 'Territories', icon: MapPin },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'audit', label: 'Audit Log', icon: History }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Application Tab */}
        {activeTab === 'application' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Application Details</h2>
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
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
                <p className="text-gray-900">{agency.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Phone</label>
                <p className="text-gray-900">{agency.phone || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Applied</label>
                <p className="text-gray-900">{new Date(agency.created_at).toLocaleString()}</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-500 mb-1">States Licensed</label>
                <div className="flex flex-wrap gap-2">
                  {agency.state_licenses?.length > 0 ? (
                    agency.state_licenses.map(s => (
                      <span key={s} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{s}</span>
                    ))
                  ) : <span className="text-gray-400">-</span>}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-500 mb-1">Lines of Business</label>
                <div className="flex flex-wrap gap-2">
                  {agency.lines_of_business?.length > 0 ? (
                    agency.lines_of_business.map(lob => (
                      <span key={lob} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm capitalize">{lob}</span>
                    ))
                  ) : <span className="text-gray-400">-</span>}
                </div>
              </div>
              {agency.application_data?.license_identifiers && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">License Identifiers</label>
                  <pre className="text-gray-900 whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                    {agency.application_data.license_identifiers}
                  </pre>
                </div>
              )}
              {agency.application_data?.desired_territories && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Desired Territories</label>
                  <pre className="text-gray-900 whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                    {agency.application_data.desired_territories}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Territories Tab */}
        {activeTab === 'territories' && (
          <div className="space-y-6">
            {agency.status !== 'approved' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-800 text-sm">
                  Routing rules can be configured, but will only be active when the agency is approved.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Routing Rules</h2>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setRuleForm({ state: '', zip: '', exclusivity_level: 'none', priority_tier: 0, capacity_enabled: true, rule_type: 'geographic', min_score: '', max_score: '', carrier_filter: '' });
                  setShowRuleForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </div>

            {showRuleForm && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">{editingRule ? 'Edit Rule' : 'New Routing Rule'}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
                    <select
                      value={ruleForm.rule_type}
                      onChange={(e) => setRuleForm(f => ({ ...f, rule_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="geographic">Geographic (State/ZIP)</option>
                      <option value="quality">Quality (Score/Carrier)</option>
                      <option value="combined">Combined (Both)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      value={ruleForm.state}
                      onChange={(e) => setRuleForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">All States</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {(ruleForm.rule_type === 'geographic' || ruleForm.rule_type === 'combined') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Prefix</label>
                      <input
                        type="text"
                        value={ruleForm.zip}
                        onChange={(e) => setRuleForm(f => ({ ...f, zip: e.target.value }))}
                        placeholder="303 (matches 303xx)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}
                  {(ruleForm.rule_type === 'quality' || ruleForm.rule_type === 'combined') && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Min Score</label>
                        <input
                          type="number"
                          value={ruleForm.min_score}
                          onChange={(e) => setRuleForm(f => ({ ...f, min_score: e.target.value }))}
                          placeholder="0"
                          min="0"
                          max="100"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
                        <input
                          type="number"
                          value={ruleForm.max_score}
                          onChange={(e) => setRuleForm(f => ({ ...f, max_score: e.target.value }))}
                          placeholder="100"
                          min="0"
                          max="100"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Carrier Filter</label>
                        <select
                          value={ruleForm.carrier_filter}
                          onChange={(e) => setRuleForm(f => ({ ...f, carrier_filter: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">Any Carrier</option>
                          <option value="none">No Prior Insurance</option>
                          <option value="allstate">Allstate</option>
                          <option value="state_farm">State Farm</option>
                          <option value="geico">GEICO</option>
                          <option value="progressive">Progressive</option>
                          <option value="usaa">USAA</option>
                          <option value="nationwide">Nationwide</option>
                          <option value="liberty_mutual">Liberty Mutual</option>
                          <option value="farmers">Farmers</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exclusivity</label>
                    <select
                      value={ruleForm.exclusivity_level}
                      onChange={(e) => setRuleForm(f => ({ ...f, exclusivity_level: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="none">None</option>
                      <option value="zip">ZIP Exclusive</option>
                      <option value="state">State Exclusive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority Tier</label>
                    <input
                      type="number"
                      value={ruleForm.priority_tier}
                      onChange={(e) => setRuleForm(f => ({ ...f, priority_tier: parseInt(e.target.value) || 0 }))}
                      min="0"
                      max="10"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="capacity_enabled"
                      checked={ruleForm.capacity_enabled}
                      onChange={(e) => setRuleForm(f => ({ ...f, capacity_enabled: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="capacity_enabled" className="text-sm text-gray-700">Enabled</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleSaveRule}
                    disabled={createRule.isPending || updateRule.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={() => { setShowRuleForm(false); setEditingRule(null); }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {rulesLoading ? (
              <div className="text-center py-8 text-gray-500">Loading rules...</div>
            ) : routingRules.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No routing rules configured</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">State</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ZIP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Score Range</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Carrier</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {routingRules.map(rule => (
                      <tr key={rule.id} className={`hover:bg-gray-50 ${!rule.capacity_enabled ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            rule.rule_type === 'quality' ? 'bg-purple-100 text-purple-700' :
                            rule.rule_type === 'combined' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {rule.rule_type || 'geographic'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{rule.state || 'All'}</td>
                        <td className="px-4 py-3 text-sm">{rule.zip_prefix || rule.zip || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {rule.min_score != null || rule.max_score != null
                            ? `${rule.min_score ?? 0} - ${rule.max_score ?? 100}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">{rule.carrier_filter?.replace('_', ' ') || '-'}</td>
                        <td className="px-4 py-3 text-sm">{rule.priority_tier}</td>
                        <td className="px-4 py-3 text-sm">{rule.capacity_enabled ? 'Active' : 'Disabled'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Agency Users</h2>
              <button
                onClick={() => setShowUserForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                <UserPlus className="w-4 h-4" />
                Invite User
              </button>
            </div>

            {showUserForm && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Invite Agency User</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="producer">Producer</option>
                      <option value="manager">Manager</option>
                      <option value="agent">Agent (Principal)</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleInviteUser}
                    disabled={inviteUser.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    Invite
                  </button>
                  <button
                    onClick={() => setShowUserForm(false)}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  If the user exists, they will be added immediately. Otherwise, an invitation will be logged.
                </p>
              </div>
            )}

            {usersLoading ? (
              <div className="text-center py-8 text-gray-500">Loading users...</div>
            ) : agencyUsers.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No users assigned to this agency</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Added</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {agencyUsers.map(au => (
                      <tr key={au.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono">{au.user_id.slice(0, 8)}...</td>
                        <td className="px-4 py-3 text-sm capitalize">{au.role}</td>
                        <td className="px-4 py-3 text-sm">{new Date(au.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveUser(au.user_id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
            {auditLoading ? (
              <div className="text-center py-8 text-gray-500">Loading audit log...</div>
            ) : auditLog.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No audit events recorded</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
                {auditLog.map(entry => (
                  <div key={entry.id} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{entry.event_type}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.metadata && (
                      <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2 overflow-x-auto">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgencyDetailPage;
