// src/pages/components/comp-schedule/ScheduleFormModal.jsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useCreateSchedule, useUpdateSchedule } from '../../../hooks/useCompSchedules';

// Style constants (see "Component patterns" section of this spec)
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  color: 'var(--qs-text)',
  fontSize: 14,
  outline: 'none',
};

const btnPrimary = {
  padding: '8px 16px',
  background: 'var(--qs-info)',
  color: 'white',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 16px',
  background: 'transparent',
  color: 'var(--qs-text)',
  fontWeight: 500,
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--qs-border)',
  cursor: 'pointer',
};

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia'],
];

export default function ScheduleFormModal({ mode, schedule, existingSchedules, onClose }) {
  const { currentAgencyId } = useAuth();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const isCreate = mode === 'create';

  const [form, setForm] = useState(() => ({
    schedule_label:           schedule?.schedule_label ?? '',
    carrier_name:             schedule?.carrier_name ?? 'Allstate',
    state_code:               schedule?.state_code ?? 'GA',
    effective_from:           schedule?.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to:             schedule?.effective_to ?? '',
    is_announced_only:        schedule?.is_announced_only ?? false,
    notes:                    schedule?.notes ?? '',
    copy_rates_from_schedule_id: '',
  }));

  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.schedule_label.trim()) e.schedule_label = 'Schedule label is required';
    else if (form.schedule_label.length > 80) e.schedule_label = 'Max 80 characters';

    if (!form.carrier_name.trim()) e.carrier_name = 'Carrier is required';
    if (!/^[A-Z]{2}$/.test(form.state_code)) e.state_code = 'Must be 2-letter state code';
    if (!form.effective_from) e.effective_from = 'Effective From is required';
    if (form.effective_to && form.effective_to <= form.effective_from) {
      e.effective_to = 'Must be after Effective From';
    }

    if (isCreate) {
      const dup = existingSchedules.find(s =>
        s.carrier_name === form.carrier_name &&
        s.state_code === form.state_code &&
        s.schedule_label.trim().toLowerCase() === form.schedule_label.trim().toLowerCase()
      );
      if (dup) e.schedule_label = 'A schedule with this label already exists for this carrier and state';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;

    try {
      const payload = {
        agency_id:         currentAgencyId,
        schedule_label:    form.schedule_label.trim(),
        carrier_name:      form.carrier_name.trim(),
        state_code:        form.state_code,
        effective_from:    form.effective_from,
        effective_to:      form.effective_to || null,
        is_announced_only: form.is_announced_only,
        notes:             form.notes.trim() || null,
      };

      if (isCreate) {
        await create.mutateAsync({
          ...payload,
          copy_rates_from_schedule_id: form.copy_rates_from_schedule_id || undefined,
        });
      } else {
        const { agency_id: _omit, ...updates } = payload;
        await update.mutateAsync({ id: schedule.id, ...updates });
      }
      onClose();
    } catch (err) {
      setErrors({ submit: err.message ?? 'Save failed' });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <ModalShell title={isCreate ? 'Add Schedule' : 'Edit Schedule'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField label="Schedule Label" error={errors.schedule_label} required>
          <input
            type="text"
            value={form.schedule_label}
            onChange={(e) => setForm({ ...form, schedule_label: e.target.value })}
            placeholder="e.g. Allstate GA 2027 (Announced)"
            maxLength={80}
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="Carrier" error={errors.carrier_name} required>
            <input
              type="text"
              value={form.carrier_name}
              onChange={(e) => setForm({ ...form, carrier_name: e.target.value })}
              style={inputStyle}
            />
          </FormField>
          <FormField label="State" error={errors.state_code} required>
            <select
              value={form.state_code}
              onChange={(e) => setForm({ ...form, state_code: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="Effective From" error={errors.effective_from} required>
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              style={inputStyle}
            />
          </FormField>
          <FormField
            label="Effective To"
            error={errors.effective_to}
            helpText="Leave blank for open-ended"
          >
            <input
              type="date"
              value={form.effective_to}
              onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
              style={inputStyle}
            />
          </FormField>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, color: 'var(--qs-text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={form.is_announced_only}
            onChange={(e) => setForm({ ...form, is_announced_only: e.target.checked })}
          />
          Announced only — carrier has published but rates are not yet in force
        </label>

        <FormField label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Optional context for this schedule"
          />
        </FormField>

        {isCreate && existingSchedules.length > 0 && (
          <FormField
            label="Copy rates from"
            helpText="Optional. Pre-populates the rate matrix from an existing schedule."
          >
            <select
              value={form.copy_rates_from_schedule_id}
              onChange={(e) => setForm({ ...form, copy_rates_from_schedule_id: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">(Start with empty rate matrix)</option>
              {existingSchedules.map(s => (
                <option key={s.id} value={s.id}>
                  {s.schedule_label} — {s.state_code} {s.is_announced_only ? '(Announced)' : ''}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {errors.submit && (
          <div style={{ fontSize: 14, color: 'var(--qs-danger)' }}>{errors.submit}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...btnPrimary, opacity: isPending ? 0.5 : 1 }}
          >
            {isPending ? 'Saving…' : isCreate ? 'Create Schedule' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// Inline modal shell — see "Component patterns" section of this spec.
function ModalShell({ title, onClose, children }) {
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
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 640,
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--qs-bright)', fontWeight: 600 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--qs-subtle)', padding: 4,
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, error, helpText, required, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 14, fontWeight: 500,
        color: 'var(--qs-text)', marginBottom: 4,
      }}>
        {label} {required && <span style={{ color: 'var(--qs-danger)' }}>*</span>}
      </label>
      {children}
      {helpText && !error && (
        <p style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{helpText}</p>
      )}
      {error && (
        <p style={{ fontSize: 12, color: 'var(--qs-danger)', marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}
