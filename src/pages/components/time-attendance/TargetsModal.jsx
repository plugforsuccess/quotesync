// src/pages/components/time-attendance/TargetsModal.jsx
// Modal for editing per-employee performance targets with effective dating.
// Redesigned with dark-theme-correct inputs, section cards, and inline styles
// to bypass the global :not(.dark-page) CSS cascade that forces white backgrounds.

import { useState, useEffect, useCallback } from 'react';
import { X, Target, RotateCcw, Save, Activity, Gauge, Award, BarChart3 } from 'lucide-react';
import { DEFAULT_TARGETS } from '../../../config/staffPerformanceDefaults';

// Full field groups for service reps
const SERVICE_FIELD_GROUPS = [
  {
    title: 'Activity Targets',
    icon: Activity,
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
    icon: Gauge,
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
    icon: Award,
    fields: [
      { key: 'grade_a_outbound', label: 'A Grade ≥', type: 'int' },
      { key: 'grade_b_outbound', label: 'B Grade ≥', type: 'int' },
      { key: 'grade_c_outbound', label: 'C Grade ≥', type: 'int' },
    ],
  },
  {
    title: 'Grade Thresholds (Answer Rate %)',
    icon: BarChart3,
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
    icon: Activity,
    fields: [
      { key: 'outbound_calls_weekly', label: 'Outbound Calls / Week', type: 'int' },
      { key: 'total_calls_weekly', label: 'Total Calls / Week', type: 'int' },
      { key: 'avg_calls_per_day', label: 'Avg Calls / Day', type: 'int' },
    ],
  },
];

// Shared input style — explicitly overrides the global white-bg cascade
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  color: 'var(--qs-text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--qs-dim)',
  marginBottom: 6,
};

// Section card wrapper
function Section({ icon: Icon, title, children }) {
  return (
    <div style={{
      background: 'var(--qs-elevated)',
      border: '1px solid var(--qs-border)',
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28, height: 28,
          background: 'rgba(99,102,241,0.12)',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={14} style={{ color: 'var(--qs-info)' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', step, placeholder }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      step={step}
      placeholder={placeholder}
      style={inputStyle}
      onFocus={e => e.target.style.borderColor = 'var(--qs-info)'}
      onBlur={e => e.target.style.borderColor = 'var(--qs-border)'}
    />
  );
}

export default function TargetsModal({ open, onClose, employeeName, employeeId, orgId, currentTargets, onSave, saving, roleType = 'service' }) {
  const [form, setForm] = useState({ ...DEFAULT_TARGETS });
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

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

  const fieldGroups = roleType === 'sales' ? PRODUCER_FIELD_GROUPS : SERVICE_FIELD_GROUPS;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '24px 16px',
      overflowY: 'auto',
    }}>
      {/* Backdrop dismiss */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />

      {/* Modal panel */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'rgba(99,102,241,0.15)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Target size={16} style={{ color: 'var(--qs-info)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
                Performance Goals
              </h2>
              <p style={{ fontSize: 12, color: 'var(--qs-dim)', margin: 0 }}>
                {employeeName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              background: 'var(--qs-card)',
              border: '1px solid var(--qs-border)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--qs-dim)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-border)'; e.currentTarget.style.color = 'var(--qs-bright)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--qs-card)'; e.currentTarget.style.color = 'var(--qs-dim)'; }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Effective Date */}
          <div style={{
            background: 'var(--qs-elevated)',
            border: '1px solid var(--qs-border)',
            borderRadius: 12,
            padding: '20px 24px',
          }}>
            <label style={labelStyle}>Effective Date</label>
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 6 }}>
              Targets apply from this date forward. Historical weeks before this date keep their original targets.
            </p>
          </div>

          {/* Field group sections */}
          {fieldGroups.map((group) => (
            <Section key={group.title} icon={group.icon} title={group.title}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {group.fields.map((field) => (
                  <div key={field.key}>
                    <label style={labelStyle}>{field.label}</label>
                    <Input
                      type="number"
                      step={field.type === 'float' ? '0.1' : '1'}
                      value={form[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                    />
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '16px 24px',
          borderTop: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
        }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--qs-text)',
              background: 'var(--qs-card)',
              border: '1px solid var(--qs-border)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-border)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--qs-card)'}
          >
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--qs-text)',
                background: 'var(--qs-card)',
                border: '1px solid var(--qs-border)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--qs-card)'}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: saving ? 'var(--qs-muted)' : 'var(--qs-info)',
                border: 'none',
                borderRadius: 8,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Targets'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
