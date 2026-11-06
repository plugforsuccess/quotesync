import { T } from '../../components/SiteCopy';
import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const CLOSE_REASONS = [
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'unreachable', label: 'Unreachable After All Attempts' },
  { value: 'bad_risk', label: 'Bad Risk (Driving Record / Claims)' },
  { value: 'wrong_territory', label: 'Wrong Territory' },
  { value: 'already_insured_elsewhere', label: 'Already Insured Elsewhere' },
  { value: 'other', label: 'Other' },
];

export default function DispositionModal({ lead, agencyId, onClose, onConfirm, isPending }) {
  const [outcome, setOutcome] = useState(null); // 'quoted_in_lm' | 'close'
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const handleConfirm = () => {
    if (outcome === 'quoted_in_lm') {
      onConfirm({ outcome: 'quoted_in_lm', reason: null, note: null });
    } else if (outcome === 'close' && reason) {
      onConfirm({ outcome: 'close', reason, note: note.trim() || null });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                <T k="pages.components.dispositionmodal.7dd847">Close or Convert Lead</T>
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 transition"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {/* Section 1: Outcome */}
            {!outcome && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4"><T k="pages.components.dispositionmodal.1e9d48">What happened with this lead?</T></p>
                <button
                  onClick={() => {
                    setOutcome('quoted_in_lm');
                  }}
                  className="w-full flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                >
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900"><T k="pages.components.dispositionmodal.6bf316">Quoted in Lead Manager</T></p>
                    <p className="text-sm text-gray-500"><T k="pages.components.dispositionmodal.4ddd85">Lead Converted to a Serious Quote</T></p>
                  </div>
                </button>
                <button
                  onClick={() => setOutcome('close')}
                  className="w-full flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
                >
                  <XCircle className="w-6 h-6 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900"><T k="pages.components.dispositionmodal.b4e191">Close Lead</T></p>
                    <p className="text-sm text-gray-500"><T k="pages.components.dispositionmodal.52b03e">Not Interested, Unreachable, or Disqualified</T></p>
                  </div>
                </button>
              </div>
            )}

            {/* Quoted in LM confirmation */}
            {outcome === 'quoted_in_lm' && (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-gray-900 font-semibold mb-1"><T k="pages.components.dispositionmodal.0409bf">Mark as Converted</T></p>
                <p className="text-sm text-gray-500">
                  <T k="pages.components.dispositionmodal.b90939">Lead will be marked as converted. Drip sequence stopped.</T>
                </p>
              </div>
            )}

            {/* Section 2: Close reason */}
            {outcome === 'close' && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700"><T k="pages.components.dispositionmodal.06b574">Why are you closing this lead?</T></p>
                <div className="space-y-2">
                  {CLOSE_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        reason === r.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="disposition_reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900">{r.label}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          {outcome && (
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (outcome) {
                    setOutcome(null);
                    setReason('');
                    setNote('');
                  } else {
                    onClose();
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                {outcome === 'close' ? <T k="pages.components.dispositionmodal.b52b36">{'Back'}</T> : <T k="pages.components.dispositionmodal.77dfd2">{'Cancel'}</T>}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || (outcome === 'close' && !reason)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  outcome === 'quoted_in_lm'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isPending ? <T k="pages.components.dispositionmodal.ae7e88">{'Saving...'}</T> : outcome === 'quoted_in_lm' ? <T k="pages.components.dispositionmodal.a8c660">{'Confirm Conversion'}</T> : <T k="pages.components.dispositionmodal.148a97">{'Confirm Close'}</T>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
