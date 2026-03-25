// src/pages/AdminAgencyDetailPage.jsx
// Admin detail view for reviewing, approving, and configuring agencies — dark theme

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, CheckCircle, XCircle, Ban, Clock, Plus, Trash2,
  MapPin, Users, FileText, History, Save, ShieldOff, UserPlus, Eye, LogOut
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageSpinner from '../components/PageSpinner';
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

const STATUS_STYLES = {
  pending:   { background: 'rgba(245,158,11,0.15)',  color: '#FBBF24' },
  approved:  { background: 'rgba(52,211,153,0.15)',  color: '#34D399' },
  rejected:  { background: 'rgba(239,68,68,0.15)',   color: '#F87171' },
  suspended: { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
};

const RULE_TYPE_STYLES = {
  quality:    { background: 'rgba(168,85,247,0.15)', color: '#C084FC' },
  combined:   { background: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
  geographic: { background: 'var(--qs-elevated)',    color: 'var(--qs-dim)' },
};

const AdminAgencyDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role: userRole, startImpersonation, isImpersonating, hasPlatformRole } = useAuth();

  const [activeTab, setActiveTab] = useState('application');
  const [impersonationReason, setImpersonationReason] = useState('');
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState('');
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
    state: '', zip: '', exclusivity_level: 'none', priority_tier: 0,
    capacity_enabled: true, rule_type: 'geographic', min_score: '', max_score: '', carrier_filter: ''
  });

  // User form state
  const [userForm, setUserForm] = useState({ email: '', role: 'producer' });

  if (userRole !== 'admin') {
    return (
      <div className="dark-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <ShieldOff style={{ width: 64, height: 64, color: '#F87171', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (agencyLoading) return <PageSpinner />;

  if (agencyError || !agency) {
    return (
      <div className="dark-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>Agency Not Found</h2>
          <Link to="/admin/agencies" style={{ color: 'var(--qs-primary, #3B82F6)', textDecoration: 'none' }}>Back to Agencies</Link>
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
    if (!userForm.email) { alert('Please enter an email address'); return; }
    try {
      const result = await inviteUser.mutateAsync({ email: userForm.email, role: userForm.role, agencyId: id, actorUserId: user?.id });
      alert(result.invited ? result.message : 'User added to agency successfully');
      setShowUserForm(false);
      setUserForm({ email: '', role: 'producer' });
    } catch (err) {
      alert('Failed to add user: ' + err.message);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!confirm('Remove this user from the agency?')) return;
    try { await deleteUser.mutateAsync({ userId, agencyId: id }); } catch (err) { alert('Failed to remove user: ' + err.message); }
  };

  const handleImpersonate = async () => {
    if (!impersonationReason.trim()) { setImpersonateError('Reason is required.'); return; }
    const principal = agencyUsers.find(u => u.agency_role === 'principal');
    if (!principal) { setImpersonateError('No principal user found for this agency.'); return; }
    setImpersonating(true);
    setImpersonateError('');
    try {
      await startImpersonation(principal.user_id, impersonationReason, false);
      setShowImpersonateModal(false);
      navigate('/agency/dashboard');
    } catch (err) {
      setImpersonateError(err.message || 'Failed to start impersonation.');
    } finally {
      setImpersonating(false);
    }
  };

  const statusStyle = STATUS_STYLES[agency.status] || STATUS_STYLES.pending;

  // Shared inline style helpers
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--qs-subtle)', marginBottom: 4 };
  const valueStyle = { fontSize: 13, color: 'var(--qs-bright)' };
  const sectionHeadingStyle = { fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)' };
  const thStyle = { padding: '10px 16px', textAlign: 'left' };
  const tdStyle = { padding: '10px 16px', fontSize: 13 };
  const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: 'var(--qs-primary, #3B82F6)', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
  const btnSecondary = {
    padding: '8px 16px', borderRadius: 8,
    border: '1px solid var(--qs-border)', background: 'none',
    color: 'var(--qs-dim)', fontSize: 13, cursor: 'pointer',
  };

  return (
    <div className="dark-page">
      {/* Header */}
      <div style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)' }}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <button
              onClick={() => navigate('/admin/agencies')}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--qs-border)', background: 'none', color: 'var(--qs-dim)', cursor: 'pointer' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Building2 size={22} style={{ color: 'var(--qs-primary, #3B82F6)' }} />
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}>{agency.name}</h1>
                <span style={{
                  ...statusStyle, display: 'inline-flex', alignItems: 'center',
                  padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                }}>
                  {agency.status}
                </span>
              </div>
              {agency.brand_name && (
                <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 4 }}>DBA: {agency.brand_name}</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasPlatformRole('platform_admin') && (
              <button
                onClick={() => setShowImpersonateModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--qs-border)',
                  background: 'var(--qs-elevated)', color: 'var(--qs-bright)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Eye size={14} />
                View as Agent
              </button>
            )}
            {agency.status !== 'approved' && (
              <button onClick={() => handleStatusChange('approved')} disabled={updateStatus.isPending}
                style={{ ...btnPrimary, background: '#059669', opacity: updateStatus.isPending ? 0.5 : 1 }}>
                <CheckCircle size={14} /> Approve
              </button>
            )}
            {agency.status !== 'rejected' && agency.status === 'pending' && (
              <button onClick={() => handleStatusChange('rejected')} disabled={updateStatus.isPending}
                style={{ ...btnPrimary, background: '#DC2626', opacity: updateStatus.isPending ? 0.5 : 1 }}>
                <XCircle size={14} /> Reject
              </button>
            )}
            {agency.status === 'approved' && (
              <button onClick={() => handleStatusChange('suspended')} disabled={updateStatus.isPending}
                style={{ ...btnPrimary, background: 'var(--qs-elevated)', color: 'var(--qs-dim)', border: '1px solid var(--qs-border)', opacity: updateStatus.isPending ? 0.5 : 1 }}>
                <Ban size={14} /> Suspend
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)' }}>
        <div className="max-w-4xl mx-auto px-4">
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'application', label: 'Application', icon: FileText },
              { id: 'territories', label: 'Territories', icon: MapPin },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'audit', label: 'Audit Log', icon: History }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', fontSize: 13, fontWeight: 600,
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--qs-primary)' : 'transparent'}`,
                  background: 'none', cursor: 'pointer',
                  color: activeTab === tab.id ? 'var(--qs-bright)' : 'var(--qs-dim)',
                }}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Application Tab */}
        {activeTab === 'application' && (
          <div className="dark-card" style={{ padding: 24 }}>
            <h2 style={{ ...sectionHeadingStyle, marginBottom: 24 }}>Application Details</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {[
                ['Legal Name', agency.name],
                ['Brand Name', agency.brand_name || '-'],
                ['Contact Name', agency.primary_contact_name || '-'],
                ['Email', agency.email],
                ['Phone', agency.phone || '-'],
                ['Applied', new Date(agency.created_at).toLocaleString()],
              ].map(([label, val]) => (
                <div key={label}>
                  <label style={labelStyle}>{label}</label>
                  <p style={valueStyle}>{val}</p>
                </div>
              ))}
              <div className="md:col-span-2">
                <label style={labelStyle}>States Licensed</label>
                <div className="flex flex-wrap gap-2">
                  {agency.state_licenses?.length > 0 ? (
                    agency.state_licenses.map(s => (
                      <span key={s} style={{ padding: '2px 8px', background: 'rgba(59,130,246,0.15)', color: '#60A5FA', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{s}</span>
                    ))
                  ) : <span style={{ color: 'var(--qs-subtle)' }}>-</span>}
                </div>
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>Lines of Business</label>
                <div className="flex flex-wrap gap-2">
                  {agency.lines_of_business?.length > 0 ? (
                    agency.lines_of_business.map(lob => (
                      <span key={lob} style={{ padding: '2px 8px', background: 'var(--qs-elevated)', color: 'var(--qs-dim)', borderRadius: 4, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{lob}</span>
                    ))
                  ) : <span style={{ color: 'var(--qs-subtle)' }}>-</span>}
                </div>
              </div>
              {agency.application_data?.license_identifiers && (
                <div className="md:col-span-2">
                  <label style={labelStyle}>License Identifiers</label>
                  <pre style={{ color: 'var(--qs-bright)', whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--qs-elevated)', padding: 12, borderRadius: 8 }}>
                    {agency.application_data.license_identifiers}
                  </pre>
                </div>
              )}
              {agency.application_data?.desired_territories && (
                <div className="md:col-span-2">
                  <label style={labelStyle}>Desired Territories</label>
                  <pre style={{ color: 'var(--qs-bright)', whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--qs-elevated)', padding: 12, borderRadius: 8 }}>
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
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Clock size={18} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 13, color: '#FBBF24' }}>
                  Routing rules can be configured, but will only be active when the agency is approved.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={sectionHeadingStyle}>Routing Rules</h2>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setRuleForm({ state: '', zip: '', exclusivity_level: 'none', priority_tier: 0, capacity_enabled: true, rule_type: 'geographic', min_score: '', max_score: '', carrier_filter: '' });
                  setShowRuleForm(true);
                }}
                style={btnPrimary}
              >
                <Plus size={14} /> Add Rule
              </button>
            </div>

            {showRuleForm && (
              <div className="dark-card" style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 500, color: 'var(--qs-bright)', marginBottom: 16 }}>{editingRule ? 'Edit Rule' : 'New Routing Rule'}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label style={labelStyle}>Rule Type</label>
                    <select value={ruleForm.rule_type} onChange={e => setRuleForm(f => ({ ...f, rule_type: e.target.value }))} className="dark-select" style={{ width: '100%' }}>
                      <option value="geographic">Geographic (State/ZIP)</option>
                      <option value="quality">Quality (Score/Carrier)</option>
                      <option value="combined">Combined (Both)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>State</label>
                    <select value={ruleForm.state} onChange={e => setRuleForm(f => ({ ...f, state: e.target.value }))} className="dark-select" style={{ width: '100%' }}>
                      <option value="">All States</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {(ruleForm.rule_type === 'geographic' || ruleForm.rule_type === 'combined') && (
                    <div>
                      <label style={labelStyle}>ZIP Prefix</label>
                      <input type="text" value={ruleForm.zip} onChange={e => setRuleForm(f => ({ ...f, zip: e.target.value }))} placeholder="303 (matches 303xx)" className="dark-input" style={{ width: '100%' }} />
                    </div>
                  )}
                  {(ruleForm.rule_type === 'quality' || ruleForm.rule_type === 'combined') && (
                    <>
                      <div>
                        <label style={labelStyle}>Min Score</label>
                        <input type="number" value={ruleForm.min_score} onChange={e => setRuleForm(f => ({ ...f, min_score: e.target.value }))} placeholder="0" min="0" max="100" className="dark-input" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Max Score</label>
                        <input type="number" value={ruleForm.max_score} onChange={e => setRuleForm(f => ({ ...f, max_score: e.target.value }))} placeholder="100" min="0" max="100" className="dark-input" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Carrier Filter</label>
                        <select value={ruleForm.carrier_filter} onChange={e => setRuleForm(f => ({ ...f, carrier_filter: e.target.value }))} className="dark-select" style={{ width: '100%' }}>
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
                    <label style={labelStyle}>Exclusivity</label>
                    <select value={ruleForm.exclusivity_level} onChange={e => setRuleForm(f => ({ ...f, exclusivity_level: e.target.value }))} className="dark-select" style={{ width: '100%' }}>
                      <option value="none">None</option>
                      <option value="zip">ZIP Exclusive</option>
                      <option value="state">State Exclusive</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Priority Tier</label>
                    <input type="number" value={ruleForm.priority_tier} onChange={e => setRuleForm(f => ({ ...f, priority_tier: parseInt(e.target.value) || 0 }))} min="0" max="10" className="dark-input" style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="capacity_enabled" checked={ruleForm.capacity_enabled} onChange={e => setRuleForm(f => ({ ...f, capacity_enabled: e.target.checked }))} />
                    <label htmlFor="capacity_enabled" style={{ fontSize: 13, color: 'var(--qs-dim)' }}>Enabled</label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={handleSaveRule} disabled={createRule.isPending || updateRule.isPending}
                    style={{ ...btnPrimary, opacity: (createRule.isPending || updateRule.isPending) ? 0.5 : 1 }}>
                    <Save size={14} /> Save
                  </button>
                  <button onClick={() => { setShowRuleForm(false); setEditingRule(null); }} style={btnSecondary}>Cancel</button>
                </div>
              </div>
            )}

            {rulesLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--qs-dim)' }}>Loading rules...</div>
            ) : routingRules.length === 0 ? (
              <div className="dark-card" style={{ padding: 32, textAlign: 'center' }}>
                <MapPin size={48} style={{ color: 'var(--qs-subtle)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>No routing rules configured</p>
              </div>
            ) : (
              <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                      {['Type', 'State', 'ZIP', 'Score Range', 'Carrier', 'Priority', 'Status', ''].map((h, i) => (
                        <th key={h || i} className="dark-section-label" style={{ ...thStyle, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {routingRules.map(rule => {
                      const rts = RULE_TYPE_STYLES[rule.rule_type] || RULE_TYPE_STYLES.geographic;
                      return (
                        <tr key={rule.id} style={{ borderBottom: '1px solid var(--qs-border)', opacity: rule.capacity_enabled ? 1 : 0.5 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={tdStyle}>
                            <span style={{ ...rts, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                              {rule.rule_type || 'geographic'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--qs-bright)' }}>{rule.state || 'All'}</td>
                          <td style={{ ...tdStyle, color: 'var(--qs-dim)' }}>{rule.zip_prefix || rule.zip || '-'}</td>
                          <td style={{ ...tdStyle, color: 'var(--qs-dim)' }}>
                            {rule.min_score != null || rule.max_score != null ? `${rule.min_score ?? 0} - ${rule.max_score ?? 100}` : '-'}
                          </td>
                          <td style={{ ...tdStyle, color: 'var(--qs-dim)', textTransform: 'capitalize' }}>{rule.carrier_filter?.replace('_', ' ') || '-'}</td>
                          <td style={{ ...tdStyle, color: 'var(--qs-dim)' }}>{rule.priority_tier}</td>
                          <td style={{ ...tdStyle, color: rule.capacity_enabled ? '#34D399' : 'var(--qs-subtle)' }}>{rule.capacity_enabled ? 'Active' : 'Disabled'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <button onClick={() => handleDeleteRule(rule.id)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'none', color: '#F87171', cursor: 'pointer' }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={sectionHeadingStyle}>Agency Users</h2>
              <button onClick={() => setShowUserForm(true)} style={btnPrimary}>
                <UserPlus size={14} /> Invite User
              </button>
            </div>

            {showUserForm && (
              <div className="dark-card" style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 500, color: 'var(--qs-bright)', marginBottom: 16 }}>Invite Agency User</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" className="dark-input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className="dark-select" style={{ width: '100%' }}>
                      <option value="producer">Producer</option>
                      <option value="manager">Manager</option>
                      <option value="principal">Principal</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={handleInviteUser} disabled={inviteUser.isPending}
                    style={{ ...btnPrimary, opacity: inviteUser.isPending ? 0.5 : 1 }}>
                    <UserPlus size={14} /> Invite
                  </button>
                  <button onClick={() => setShowUserForm(false)} style={btnSecondary}>Cancel</button>
                </div>
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--qs-subtle)' }}>
                  If the user exists, they will be added immediately. Otherwise, an invitation will be logged.
                </p>
              </div>
            )}

            {usersLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--qs-dim)' }}>Loading users...</div>
            ) : agencyUsers.length === 0 ? (
              <div className="dark-card" style={{ padding: 32, textAlign: 'center' }}>
                <Users size={48} style={{ color: 'var(--qs-subtle)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>No users assigned to this agency</p>
              </div>
            ) : (
              <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                      <th className="dark-section-label" style={thStyle}>User ID</th>
                      <th className="dark-section-label" style={thStyle}>Role</th>
                      <th className="dark-section-label" style={thStyle}>Added</th>
                      <th className="dark-section-label" style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencyUsers.map(au => (
                      <tr key={au.user_id} style={{ borderBottom: '1px solid var(--qs-border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--qs-bright)' }}>{au.user_id.slice(0, 8)}...</td>
                        <td style={{ ...tdStyle, color: 'var(--qs-dim)', textTransform: 'capitalize' }}>{au.role}</td>
                        <td style={{ ...tdStyle, color: 'var(--qs-dim)' }}>{new Date(au.created_at).toLocaleDateString()}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button onClick={() => handleRemoveUser(au.user_id)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'none', color: '#F87171', cursor: 'pointer' }}>
                            <Trash2 size={14} />
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
            <h2 style={sectionHeadingStyle}>Audit Log</h2>
            {auditLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--qs-dim)' }}>Loading audit log...</div>
            ) : auditLog.length === 0 ? (
              <div className="dark-card" style={{ padding: 32, textAlign: 'center' }}>
                <History size={48} style={{ color: 'var(--qs-subtle)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>No audit events recorded</p>
              </div>
            ) : (
              <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
                {auditLog.map((entry, idx) => (
                  <div key={entry.id} style={{ padding: 16, borderBottom: idx < auditLog.length - 1 ? '1px solid var(--qs-border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--qs-bright)' }}>{entry.event_type}</span>
                      <span style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.metadata && (
                      <pre style={{ fontSize: 11, color: 'var(--qs-dim)', background: 'var(--qs-elevated)', padding: 8, borderRadius: 6, marginTop: 8, overflowX: 'auto' }}>
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

      {/* Impersonation confirmation modal */}
      {showImpersonateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
            borderRadius: 12, padding: 24, width: '100%', maxWidth: 440,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
              View as Agent
            </h3>
            <p style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 16 }}>
              You will be placed in <strong>read-only impersonation mode</strong> for{' '}
              <strong>{agency.name}</strong>. All actions are logged. Enter a reason to continue.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--qs-dim)', marginBottom: 6 }}>
              Reason <span style={{ color: '#F87171' }}>*</span>
            </label>
            <input
              type="text"
              className="dark-input"
              placeholder="e.g. QA review, support investigation..."
              value={impersonationReason}
              onChange={e => { setImpersonationReason(e.target.value); setImpersonateError(''); }}
              style={{ marginBottom: 8 }}
            />
            {impersonateError && (
              <p style={{ fontSize: 12, color: '#F87171', marginBottom: 8 }}>{impersonateError}</p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setShowImpersonateModal(false); setImpersonationReason(''); setImpersonateError(''); }}
                style={btnSecondary}
              >
                Cancel
              </button>
              <button
                onClick={handleImpersonate}
                disabled={impersonating}
                style={{ ...btnPrimary, opacity: impersonating ? 0.6 : 1 }}
              >
                {impersonating ? 'Starting...' : 'Enter Agency View'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAgencyDetailPage;
