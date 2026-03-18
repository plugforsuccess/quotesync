// src/pages/RenewalDetailPage.jsx
// Full detail view for a single renewal with contact history and consent.

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, Bot, Clock, User, CheckCircle,
  XCircle, AlertTriangle, Shield, MapPin, Users, Flag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRenewalDetail, useUpdateRenewalStatus, useAssignFollowup } from '../hooks/useRenewalPolicies';
import { useCustomerConsent } from '../hooks/useCustomerConsent';
import { useActiveEmployees } from '../hooks/useEmployees';
import ContactLogModal from './components/renewals/ContactLogModal';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  standard: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  at_risk: 'bg-orange-100 text-orange-700',
  escalated: 'bg-red-100 text-red-700',
  lost: 'bg-red-200 text-red-800',
  renewed: 'bg-green-200 text-green-800',
};

const CHANNEL_ICONS = { ai_voice: Bot, human_call: Phone, email: Mail };
const CHANNEL_LABELS = { ai_voice: 'AI Voice', human_call: 'Human Call', email: 'Email' };

const OUTCOME_LABELS = {
  no_answer: 'No Answer', confirmed: 'Confirmed', hesitant: 'Hesitant',
  shopping: 'Shopping', escalated: 'Escalated', left_voicemail: 'Voicemail',
  wrong_number: 'Wrong #', third_party_answer: '3rd Party Answer',
};

const FOLLOWUP_LABELS = {
  rate_shock: 'Rate Shock', shopping: 'Shopping', no_response: 'No Response',
  eft_lapse: 'EFT Lapse', multi_policy: 'Multi-Policy', hesitant: 'Hesitant',
  address_discrepancy: 'Address Discrepancy', amount_due: 'Amount Due',
  wrong_number: 'Wrong Number', manual: 'Manual',
};

const CLAIM_FLAG_LABELS = { none: 'None', open: 'Open Claim', recent: 'Recent Claim' };
const CLAIM_FLAG_COLORS = { none: 'text-gray-500', open: 'text-red-700', recent: 'text-amber-700' };

// ── Page ────────────────────────────────────────────────────────────────────

export default function RenewalDetailPage() {
  const { policyId } = useParams();
  const { currentAgencyId } = useAuth();
  const { data: policy, isLoading, error, refetch } = useRenewalDetail(policyId);
  const { data: consentRecords } = useCustomerConsent(currentAgencyId);
  const { data: employees = [] } = useActiveEmployees(currentAgencyId);
  const updateStatus = useUpdateRenewalStatus();
  const assignFollowup = useAssignFollowup();

  const [showContactModal, setShowContactModal] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Clock className="w-6 h-6 text-primary-500 animate-spin" />
        <span className="ml-2 text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          {error?.message || 'Policy not found.'}
        </div>
      </div>
    );
  }

  // Find consent for this customer
  const consent = Array.isArray(consentRecords)
    ? consentRecords.find((c) => c.customer_phone === policy.customer_phone)
    : null;

  const pctChange = policy.premium_change_pct;
  const isIncrease = pctChange != null && pctChange > 0;

  const handleStatusChange = async (status, followupCompleted = false) => {
    try {
      await updateStatus.mutateAsync({ policyId: policy.id, status, followupCompleted });
      refetch();
    } catch (_) { /* error handled by mutation */ }
  };

  const handleAssignFollowup = async () => {
    if (!assignTo) return;
    try {
      await assignFollowup.mutateAsync({
        policyId: policy.id,
        assignedTo: assignTo,
        notes: followupNotes || null,
      });
      refetch();
      setFollowupNotes('');
    } catch (_) { /* error handled by mutation */ }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link to="/admin/renewals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to Renewals
      </Link>

      {/* Section 1: Policy Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{policy.customer_name}</h1>
            <p className="text-sm text-gray-500 font-mono">{policy.policy_number}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded text-xs font-semibold capitalize ${STATUS_COLORS[policy.renewal_status] || STATUS_COLORS.pending}`}>
              {policy.renewal_status}
            </span>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold capitalize ${PRIORITY_COLORS[policy.priority_tier] || PRIORITY_COLORS.standard}`}>
              {policy.priority_tier}
            </span>
            <span className="px-2.5 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
              {policy.policy_type}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Renewal Date</p>
            <p className="font-medium">{formatDate(policy.renewal_date)}</p>
          </div>
          <div>
            <p className="text-gray-500">Current Premium</p>
            <p className="font-medium">{formatCurrency(policy.current_premium)}</p>
          </div>
          <div>
            <p className="text-gray-500">Renewal Premium</p>
            <p className="font-medium">{formatCurrency(policy.renewal_premium)}</p>
          </div>
          <div>
            <p className="text-gray-500">Change</p>
            <p className={`font-bold ${isIncrease ? 'text-red-600' : pctChange != null && pctChange < 0 ? 'text-green-600' : 'text-gray-700'}`}>
              {pctChange != null ? `${pctChange > 0 ? '+' : ''}${pctChange}%` : '—'}
              {policy.rate_shock_flag && <AlertTriangle className="inline w-4 h-4 ml-1 text-red-500" />}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm border-t pt-4">
          {policy.customer_phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span>{policy.customer_phone}</span>
            </div>
          )}
          {policy.customer_email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <span>{policy.customer_email}</span>
            </div>
          )}
          {policy.customer_address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span>{policy.customer_address}</span>
            </div>
          )}
          {policy.mortgagee && (
            <div><span className="text-gray-500">Mortgagee:</span> {policy.mortgagee}</div>
          )}
          <div><span className="text-gray-500">EFT on File:</span> {policy.eft_on_file ? 'Yes' : policy.eft_on_file === false ? 'No' : '—'}</div>
          <div><span className="text-gray-500">Multi-Policy:</span> {policy.multi_policy ? 'Yes' : 'No'}</div>
          {policy.customer_tenure_years != null && (
            <div><span className="text-gray-500">Tenure:</span> <span className="font-medium">{policy.customer_tenure_years} year{policy.customer_tenure_years !== 1 ? 's' : ''}</span></div>
          )}
          {policy.amount_due != null && (
            <div><span className="text-gray-500">Amount Due:</span> <span className="font-medium">{formatCurrency(policy.amount_due)}</span></div>
          )}
        </div>

        {/* Claim Flag */}
        {policy.claim_flag && policy.claim_flag !== 'none' && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200 text-sm">
            <Flag className="w-4 h-4 text-red-500" />
            <span className={`font-medium ${CLAIM_FLAG_COLORS[policy.claim_flag] || ''}`}>
              {CLAIM_FLAG_LABELS[policy.claim_flag] || policy.claim_flag}
            </span>
            {policy.claim_flag_set_at && (
              <span className="text-gray-500">— flagged {formatDate(policy.claim_flag_set_at)}</span>
            )}
          </div>
        )}

        {/* Human Only flag */}
        {policy.human_only && (
          <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="font-medium text-orange-800">Human Only</span>
            {policy.human_only_reason && (
              <span className="text-orange-600">— {policy.human_only_reason.replace(/_/g, ' ')}</span>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Consent Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-600" />
          Consent Status
        </h2>
        {consent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <span className={`flex items-center gap-1 font-medium ${consent.autodial_consent ? 'text-green-700' : 'text-red-600'}`}>
                {consent.autodial_consent ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                Auto-dial: {consent.autodial_consent ? 'Consented' : 'Not Consented'}
              </span>
              {consent.autodial_consent_date && (
                <span className="text-gray-500">as of {formatDate(consent.autodial_consent_date)}</span>
              )}
              <Link
                to="/admin/renewals/consent"
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                Update
              </Link>
            </div>
            {consent.dnc && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-sm">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="font-medium text-red-700">DNC — Do Not Call</span>
                {consent.dnc_date && <span className="text-red-500">since {formatDate(consent.dnc_date)}</span>}
                {consent.dnc_source && <span className="text-red-400">({consent.dnc_source.replace(/_/g, ' ')})</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No consent record found for this customer.{' '}
            <Link to="/admin/renewals/consent" className="text-primary-600 hover:text-primary-700 font-medium">
              Add consent record
            </Link>
          </div>
        )}
      </div>

      {/* Section 2b: Household Group */}
      {policy.customer_group_id && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            Household Group
          </h2>
          <p className="text-sm text-gray-600">
            This policy is part of a multi-policy household group.
            Group ID: <span className="font-mono text-xs">{policy.customer_group_id}</span>
          </p>
        </div>
      )}

      {/* Section 3: Contact Log */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Contact Log</h2>
        {policy.contact_attempts > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
              {(() => {
                const Icon = CHANNEL_ICONS[policy.last_contact_channel] || Phone;
                return <Icon className="w-4 h-4 text-gray-500" />;
              })()}
              <div className="flex-1">
                <span className="font-medium">{CHANNEL_LABELS[policy.last_contact_channel] || 'Unknown'}</span>
                <span className="mx-2 text-gray-300">|</span>
                <span>{OUTCOME_LABELS[policy.last_contact_outcome] || policy.last_contact_outcome}</span>
              </div>
              <span className="text-gray-500">{formatDateTime(policy.last_contact_date)}</span>
            </div>
            <p className="text-sm text-gray-500">{policy.contact_attempts} total attempt{policy.contact_attempts !== 1 ? 's' : ''}</p>
            {policy.followup_notes && (
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{policy.followup_notes}</p>
            )}
            {policy.ai_transcript && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">AI Transcript</p>
                <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg whitespace-pre-wrap">{policy.ai_transcript}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No contact attempts recorded.</p>
        )}
      </div>

      {/* Section 4: Follow-up Assignment */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-600" />
          Follow-up Assignment
        </h2>
        {policy.human_followup_required && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-amber-700 font-medium">
              Follow-up required: {FOLLOWUP_LABELS[policy.followup_reason] || policy.followup_reason}
            </span>
            {policy.followup_completed_at && (
              <span className="text-green-600">— Completed {formatDateTime(policy.followup_completed_at)}</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-600 mb-1">Assign to</label>
            <select
              value={assignTo || policy.assigned_to || ''}
              onChange={(e) => setAssignTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {Array.isArray(employees) && employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.preferred_name || emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-gray-600 mb-1">Notes</label>
            <input
              type="text"
              value={followupNotes}
              onChange={(e) => setFollowupNotes(e.target.value)}
              placeholder="Follow-up notes..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleAssignFollowup}
            disabled={!assignTo || assignFollowup.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
          >
            {assignFollowup.isPending ? 'Saving...' : 'Assign'}
          </button>
        </div>
      </div>

      {/* Section 5: Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowContactModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
          >
            Log Contact Attempt
          </button>
          <button
            onClick={() => handleStatusChange('renewed')}
            disabled={updateStatus.isPending}
            className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg disabled:opacity-50"
          >
            Mark Renewed
          </button>
          <button
            onClick={() => handleStatusChange('lost')}
            disabled={updateStatus.isPending}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-50"
          >
            Mark Lost
          </button>
          <button
            onClick={() => handleStatusChange('escalated')}
            disabled={updateStatus.isPending}
            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg disabled:opacity-50"
          >
            Escalate
          </button>
          {policy.human_followup_required && !policy.followup_completed_at && (
            <button
              onClick={() => handleStatusChange(policy.renewal_status, true)}
              disabled={updateStatus.isPending}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg disabled:opacity-50"
            >
              Mark Follow-up Complete
            </button>
          )}
        </div>
      </div>

      <ContactLogModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        policy={policy}
        onSuccess={refetch}
      />
    </div>
  );
}
