// src/pages/components/renewals/ContactLogModal.jsx
// Shared modal for logging contact attempts on renewal policies.
// Used from RenewalsPage row cards and RenewalDetailPage.

import { useState, useEffect } from 'react';
import { X, Phone, Mail, Bot, AlertTriangle, Shield } from 'lucide-react';
import { useLogContact } from '../../../hooks/useRenewalPolicies';
import { useCustomerConsent } from '../../../hooks/useCustomerConsent';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import { useAuth } from '../../../contexts/AuthContext';

const CHANNELS = [
  { value: 'human_call', label: 'Human Call', icon: Phone },
  { value: 'ai_voice', label: 'AI Voice', icon: Bot },
  { value: 'email', label: 'Email', icon: Mail },
];

const OUTCOMES = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'hesitant', label: 'Hesitant' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'left_voicemail', label: 'Left Voicemail' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'third_party_answer', label: 'Third Party Answer' },
];

const FOLLOWUP_REASONS = [
  { value: 'rate_shock', label: 'Rate Shock' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'no_response', label: 'No Response' },
  { value: 'eft_lapse', label: 'EFT Lapse' },
  { value: 'multi_policy', label: 'Multi-Policy' },
  { value: 'hesitant', label: 'Hesitant' },
  { value: 'address_discrepancy', label: 'Address Discrepancy' },
  { value: 'amount_due', label: 'Amount Due' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'manual', label: 'Manual' },
];

const CONSENT_OPTIONS = [
  { value: '', label: 'Did not ask' },
  { value: 'yes', label: 'Yes — customer consented to automated calls' },
  { value: 'no', label: 'No — customer declined automated calls' },
];

export default function ContactLogModal({ isOpen, onClose, policy, onSuccess }) {
  const { currentAgencyId, profile } = useAuth();
  const { data: employees = [] } = useActiveEmployees(currentAgencyId);
  const logContact = useLogContact();
  const { upsertConsent } = useCustomerConsent(currentAgencyId);

  const [channel, setChannel] = useState('human_call');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [escalate, setEscalate] = useState(false);
  const [followupReason, setFollowupReason] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [consentChoice, setConsentChoice] = useState('');
  const [error, setError] = useState(null);

  // Auto-toggle escalation for shopping/escalated outcomes
  useEffect(() => {
    if (outcome === 'shopping' || outcome === 'escalated') {
      setEscalate(true);
      if (outcome === 'shopping') setFollowupReason('shopping');
    }
  }, [outcome]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setChannel('human_call');
      setOutcome('');
      setNotes('');
      setEscalate(false);
      setFollowupReason('');
      setAssignedTo('');
      setConsentChoice('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !policy) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!outcome) {
      setError('Please select an outcome.');
      return;
    }
    setError(null);

    try {
      await logContact.mutateAsync({
        policyId: policy.id,
        channel,
        outcome,
        notes,
        escalate,
        followupReason: escalate ? followupReason : null,
        assignedTo: assignedTo || null,
      });

      // Consent capture — upsert if user selected yes or no
      if (consentChoice && policy.customer_phone && upsertConsent) {
        const consentData = {
          agency_id: currentAgencyId,
          customer_phone: policy.customer_phone,
          customer_name: policy.customer_name,
          autodial_consent: consentChoice === 'yes',
          consent_collected_by: profile?.id || null,
        };
        if (consentChoice === 'yes') {
          consentData.autodial_consent_date = new Date().toISOString();
          consentData.autodial_consent_source = channel === 'human_call' ? 'inbound_call' : 'service_interaction';
        } else {
          consentData.autodial_opt_out_date = new Date().toISOString();
          consentData.autodial_opt_out_channel = 'verbal';
        }
        try {
          await upsertConsent(consentData);
        } catch (consentErr) {
          console.error('Consent upsert error (non-fatal):', consentErr);
        }
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to log contact.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Log Contact</h3>
            <p className="text-sm text-gray-500">{policy.customer_name} — {policy.policy_number}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
            <div className="flex gap-2">
              {CHANNELS.map((ch) => {
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setChannel(ch.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      channel === ch.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select outcome...</option>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Any notes about the contact..."
            />
          </div>

          {/* Escalation toggle */}
          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={escalate}
                  onChange={(e) => setEscalate(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-amber-800">Trigger escalation</span>
              </label>
            </div>
          </div>

          {/* Followup reason — shown if escalation toggled */}
          {escalate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Followup Reason</label>
              <select
                value={followupReason}
                onChange={(e) => setFollowupReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select reason...</option>
                {FOLLOWUP_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Assign to */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Unassigned</option>
              {Array.isArray(employees) && employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.preferred_name || emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Consent capture */}
          {channel === 'human_call' && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-800">Consent (optional)</span>
              </div>
              <div className="space-y-1">
                {CONSENT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-blue-700">
                    <input
                      type="radio"
                      name="consent"
                      value={opt.value}
                      checked={consentChoice === opt.value}
                      onChange={() => setConsentChoice(opt.value)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={logContact.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
            >
              {logContact.isPending ? 'Saving...' : 'Log Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
