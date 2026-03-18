// src/pages/components/renewals/FinalOutcomeModal.jsx
// Required modal before Tracy can set followup_completed_at on escalated records.
// Captures final_outcome (renewed / lost / unknown) and optional notes.

import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuth } from '../../../contexts/AuthContext';

const OUTCOMES = [
  { value: 'renewed', label: 'Renewed', description: 'Customer is staying', icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100' },
  { value: 'lost', label: 'Lost', description: 'Customer is leaving or cancelled', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' },
  { value: 'unknown', label: 'Unknown', description: "Couldn't reach / inconclusive", icon: HelpCircle, color: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100' },
];

function useSetFinalOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ policyId, finalOutcome, notes, employeeId }) => {
      const now = new Date().toISOString();

      const renewalStatus = finalOutcome === 'renewed' ? 'renewed'
        : finalOutcome === 'lost' ? 'lost'
        : undefined; // unknown doesn't change renewal_status

      const updates = {
        final_outcome: finalOutcome,
        final_outcome_notes: notes || null,
        final_outcome_set_by: employeeId,
        final_outcome_set_at: now,
        followup_completed_at: now,
      };

      if (renewalStatus) {
        updates.renewal_status = renewalStatus;
      }

      const { data, error } = await supabase
        .from('renewal_policies')
        .update(updates)
        .eq('id', policyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.detail(data.id) });
    },
  });
}

export default function FinalOutcomeModal({ isOpen, onClose, policy, onSuccess }) {
  const { profile } = useAuth();
  const setFinalOutcome = useSetFinalOutcome();

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedOutcome('');
      setNotes('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !policy) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOutcome) {
      setError('Please select an outcome before completing.');
      return;
    }
    setError(null);

    try {
      await setFinalOutcome.mutateAsync({
        policyId: policy.id,
        finalOutcome: selectedOutcome,
        notes,
        employeeId: profile?.id || null,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to set outcome.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">How did this call go?</h3>
            <p className="text-sm text-gray-500">{policy.customer_name} — {policy.policy_number}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Outcome selection */}
          <div className="space-y-2">
            {OUTCOMES.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSelectedOutcome(o.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selectedOutcome === o.value
                      ? o.color + ' border-2 font-medium'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{o.label}</span>
                    <span className="text-sm text-gray-500 ml-2">— {o.description}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Any notes about the outcome..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              disabled={!selectedOutcome || setFinalOutcome.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
            >
              {setFinalOutcome.isPending ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
