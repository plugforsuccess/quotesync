// src/pages/components/book/BookRowFormModal.jsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { useCarriers, useAddBookRow, useUpdateBookRow } from '../../../hooks/useBookSnapshot';

const inputStyle = {
  width: '100%', padding: '8px 12px', background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)', borderRadius: 8,
  color: 'var(--qs-text)', fontSize: 14, outline: 'none',
};
const btnPrimary = {
  padding: '8px 16px', background: 'var(--qs-info)', color: 'white',
  fontWeight: 600, fontSize: 14, borderRadius: 8, border: 'none', cursor: 'pointer',
};
const btnSecondary = {
  padding: '8px 16px', background: 'transparent', color: 'var(--qs-text)',
  fontWeight: 500, fontSize: 14, borderRadius: 8,
  border: '1px solid var(--qs-border)', cursor: 'pointer',
};

const PRODUCTS = [
  { key: 'auto', label: 'Auto' }, { key: 'ho', label: 'Homeowners' },
  { key: 'condo', label: 'Condo' }, { key: 'renters', label: 'Renters' },
  { key: 'landlord', label: 'Landlord' },
  { key: 'specialty_auto', label: 'Specialty Auto' },
  { key: 'pup', label: 'Personal Umbrella' },
  { key: 'manufactured', label: 'Manufactured Home' },
  { key: 'boat', label: 'Boat' },
  { key: 'motor_club', label: 'Motor Club' },
  { key: 'other', label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

export default function BookRowFormModal({ mode, agencyId, row, onClose }) {
  const { data: carriers = [] } = useCarriers();
  const addRow = useAddBookRow();
  const updateRow = useUpdateBookRow();
  const isCreate = mode === 'create';

  const [form, setForm] = useState(() => ({
    carrier_code:        row?.carrier_code        ?? 'allstate',
    product_key:         row?.product_key         ?? 'auto',
    state_code:          row?.state_code          ?? 'GA',
    policy_count:        row?.policy_count        ?? '',
    total_premium:       row?.total_premium       ?? '',
    avg_commission_rate: row?.avg_commission_rate != null
      ? (row.avg_commission_rate * 100).toFixed(1)
      : '',
    notes:               row?.notes               ?? '',
  }));
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.carrier_code) e.carrier_code = 'Required';
    if (!form.product_key) e.product_key = 'Required';
    if (!/^[A-Z]{2}$/.test(form.state_code)) e.state_code = '2-letter code required';

    const pc = Number(form.policy_count);
    if (!Number.isFinite(pc) || pc < 0) e.policy_count = 'Must be 0 or greater';

    const pm = Number(form.total_premium);
    if (!Number.isFinite(pm) || pm < 0) e.total_premium = 'Must be 0 or greater';

    if (form.avg_commission_rate !== '') {
      const rate = Number(form.avg_commission_rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
        e.avg_commission_rate = 'Must be 0 < x ≤ 100';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;

    const payload = {
      carrier_code:        form.carrier_code,
      product_key:         form.product_key,
      state_code:          form.state_code,
      policy_count:        Number(form.policy_count),
      total_premium:       Number(form.total_premium),
      avg_commission_rate: form.avg_commission_rate !== ''
        ? Number(form.avg_commission_rate) / 100
        : null,
      notes: form.notes.trim() || null,
    };

    try {
      if (isCreate) {
        await addRow.mutateAsync({ agency_id: agencyId, ...payload });
      } else {
        await updateRow.mutateAsync({ id: row.id, agencyId, changes: payload });
      }
      onClose();
    } catch (err) {
      setErrors({ submit: err.message ?? 'Save failed' });
    }
  };

  const isPending = addRow.isPending || updateRow.isPending;

  return (
    <ModalShell title={isCreate ? 'Add Book Row' : 'Edit Book Row'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Carrier" error={errors.carrier_code}>
            <select
              value={form.carrier_code}
              onChange={(e) => setForm({ ...form, carrier_code: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
              disabled={!isCreate}
            >
              {carriers.map(c => (
                <option key={c.code} value={c.code}>{c.display_name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Product" error={errors.product_key}>
            <select
              value={form.product_key}
              onChange={(e) => setForm({ ...form, product_key: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
              disabled={!isCreate}
            >
              {PRODUCTS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="State" error={errors.state_code}>
          <select
            value={form.state_code}
            onChange={(e) => setForm({ ...form, state_code: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
            disabled={!isCreate}
          >
            {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Policy count" error={errors.policy_count}>
            <input
              type="number" min="0"
              value={form.policy_count}
              onChange={(e) => setForm({ ...form, policy_count: e.target.value })}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Total annual premium ($)" error={errors.total_premium}>
            <input
              type="number" min="0" step="0.01"
              value={form.total_premium}
              onChange={(e) => setForm({ ...form, total_premium: e.target.value })}
              style={inputStyle}
            />
          </FormField>
        </div>

        <FormField
          label="Average commission rate (%)"
          error={errors.avg_commission_rate}
          helpText="Optional. Leave blank if you don't know."
        >
          <input
            type="number" min="0" max="100" step="0.1"
            value={form.avg_commission_rate}
            onChange={(e) => setForm({ ...form, avg_commission_rate: e.target.value })}
            style={inputStyle}
            placeholder="e.g., 12.5"
          />
        </FormField>

        <FormField label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Any context about this slice of the book"
          />
        </FormField>

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
            {isPending ? 'Saving…' : isCreate ? 'Add Row' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function FormField({ label, error, helpText, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 500,
        color: 'var(--qs-text)', marginBottom: 4,
      }}>{label}</label>
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

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      zIndex: 50, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px', overflowY: 'auto',
    }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 640,
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--qs-bright)', fontWeight: 600 }}>
            {title}
          </h2>
          <button
            type="button" onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--qs-subtle)', padding: 4,
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}
