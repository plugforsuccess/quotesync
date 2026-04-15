// src/pages/components/employees/TerminateModal.jsx
// Confirmation dialog for terminating an employee.

import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export default function TerminateModal({ open, onClose, onConfirm, saving, employee }) {
  const [terminationDate, setTerminationDate] = useState('');
  const [terminationReason, setTerminationReason] = useState('');

  useEffect(() => {
    if (open) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      setTerminationDate(`${y}-${m}-${d}`);
      setTerminationReason('');
    }
  }, [open]);

  const handleEsc = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, handleEsc]);

  if (!open || !employee) return null;

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm({
      id: employee.id,
      termination_date: terminationDate,
      termination_reason: terminationReason || null,
    });
  }

  const displayName = employee.preferred_name || employee.first_name;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-2">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full rounded-2xl max-w-[98vw] h-[96vh] overflow-y-auto p-5 sm:p-7" style={{ background: 'var(--qs-card)' }}>
          <div className="border-b border-qs-border pb-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold text-qs-bright">Terminate Employee</h3>
            </div>
            <button onClick={onClose} className="text-qs-muted hover:text-qs-subtle min-w-[44px] min-h-[44px] inline-flex items-center justify-center" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <p className="text-sm text-qs-dim">
                You are about to terminate <span className="font-semibold text-qs-bright">{displayName} {employee.last_name}</span>.
                This will mark them as terminated but preserve all historical data.
              </p>

              <div>
                <label className="dark-label">Termination Date</label>
                <input
                  type="date"
                  required
                  value={terminationDate}
                  onChange={(e) => setTerminationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-qs-elevated border border-qs-border rounded-lg text-sm text-qs-text focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="dark-label">Reason (optional)</label>
                <textarea
                  value={terminationReason}
                  onChange={(e) => setTerminationReason(e.target.value)}
                  rows={3}
                  placeholder="Optional notes on departure..."
                  className="w-full px-3 py-2 bg-qs-elevated border border-qs-border rounded-lg text-sm text-qs-text focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-qs-border pt-4 mt-4 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-qs-text bg-qs-elevated border border-qs-border rounded-lg hover:bg-qs-card transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Terminating...' : 'Confirm Termination'}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}
