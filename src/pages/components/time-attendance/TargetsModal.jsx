// src/pages/components/time-attendance/TargetsModal.jsx
// Modal for editing per-employee performance targets with effective dating.

import { useState, useEffect, useCallback } from 'react';
import { X, Target, RotateCcw, Save } from 'lucide-react';
import { DEFAULT_TARGETS } from '../../../config/csPerformanceDefaults';

// Full field groups for service reps
const SERVICE_FIELD_GROUPS = [
  {
    title: 'Activity Targets',
    fields: [
      { key: 'outbound_calls_weekly', label: 'Outbound Calls / Week', type: 'int' },
      { key: 'total_calls_weekly', label: 'Total Calls / Week', type: 'int' },
      { key: 'avg_handle_time_min_low', label: 'Avg Handle Time (min low)', type: 'float' },
      { key: 'avg_handle_time_min_high', label: 'Avg Handle Time (min high)', type: 'float' },
      { key: 'avg_calls_per_day', label: 'Avg Calls / Day', type: 'int' },
    ],
  },
  {
    title: 'Efficiency & Quality Targets',
    fields: [
      { key: 'answer_rate_pct', label: 'Answer Rate %', type: 'float' },
      { key: 'avg_speed_of_answer_sec', label: 'Avg Speed of Answer (sec)', type: 'int' },
      { key: 'avg_hold_time_min', label: 'Avg Hold Time (min)', type: 'float' },
      { key: 'transfer_rate_pct', label: 'Transfer Rate %', type: 'float' },
      { key: 'missed_call_rate_pct', label: 'Missed Call Rate %', type: 'float' },
    ],
  },
  {
    title: 'Grade Thresholds (Outbound)',
    fields: [
      { key: 'grade_a_outbound', label: 'A Grade ≥', type: 'int' },
      { key: 'grade_b_outbound', label: 'B Grade ≥', type: 'int' },
      { key: 'grade_c_outbound', label: 'C Grade ≥', type: 'int' },
    ],
  },
  {
    title: 'Grade Thresholds (Answer Rate %)',
    fields: [
      { key: 'grade_a_answer_rate', label: 'A Grade ≥', type: 'float' },
      { key: 'grade_b_answer_rate', label: 'B Grade ≥', type: 'float' },
      { key: 'grade_c_answer_rate', label: 'C Grade ≥', type: 'float' },
    ],
  },
];

// Slimmed-down fields for producers — activity targets only
const PRODUCER_FIELD_GROUPS = [
  {
    title: 'Activity Targets',
    fields: [
      { key: 'outbound_calls_weekly', label: 'Outbound Calls / Week', type: 'int' },
      { key: 'total_calls_weekly', label: 'Total Calls / Week', type: 'int' },
      { key: 'avg_calls_per_day', label: 'Avg Calls / Day', type: 'int' },
    ],
  },
];

export default function TargetsModal({ open, onClose, employeeName, employeeId, orgId, currentTargets, onSave, saving, roleType = 'service' }) {
  const [form, setForm] = useState({ ...DEFAULT_TARGETS });
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (currentTargets) {
      const vals = {};
      for (const key of Object.keys(DEFAULT_TARGETS)) {
        vals[key] = currentTargets[key] ?? DEFAULT_TARGETS[key];
      }
      setForm(vals);
      if (currentTargets.effective_date) {
        setEffectiveDate(currentTargets.effective_date);
      }
    } else {
      setForm({ ...DEFAULT_TARGETS });
    }
  }, [currentTargets]);

  const handleEsc = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, handleEsc]);

  if (!open) return null;

  function handleChange(key, value, type) {
    const parsed = type === 'int' ? parseInt(value, 10) : parseFloat(value);
    setForm((prev) => ({ ...prev, [key]: isNaN(parsed) ? 0 : parsed }));
  }

  function handleReset() {
    setForm({ ...DEFAULT_TARGETS });
  }

  function handleSave() {
    onSave({
      org_id: orgId,
      employee_user_id: employeeId,
      effective_date: effectiveDate,
      ...form,
    });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Performance Goals</h3>
                  <p className="text-sm text-gray-500">{employeeName}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500 transition" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-6">
            {/* Effective Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Targets apply from this date forward. Historical weeks before this date keep their original targets.
              </p>
            </div>

            {(roleType === 'producer' ? PRODUCER_FIELD_GROUPS : SERVICE_FIELD_GROUPS).map((group) => (
              <div key={group.title}>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">{group.title}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {group.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                      <input
                        type="number"
                        step={field.type === 'float' ? '0.1' : '1'}
                        value={form[field.key]}
                        onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-between">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Targets'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
