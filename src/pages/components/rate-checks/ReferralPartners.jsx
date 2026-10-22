// src/pages/components/rate-checks/ReferralPartners.jsx
// "Partners" tab: agencies we refer customers to for coverage Allstate can't
// write. Referrals are only possible for rate checks whose customer opted in
// (enforced in the database), and every referral is logged.

import { useState } from 'react';
import { useReferralPartners, useSaveReferralPartner } from '../../../hooks/useRateChecks';
import { thCls, thStyle, inputStyle, formatPhone } from './ui';

const EMPTY = { name: '', contact_name: '', phone: '', email: '', lines: '', notes: '' };

export default function ReferralPartners({ agencyId }) {
  const { data = [], isLoading, error } = useReferralPartners(agencyId);
  const save = useSaveReferralPartner();
  const [editing, setEditing] = useState(null); // null | 'new' | partner id
  const [form, setForm] = useState(EMPTY);

  const start = (p) => {
    setEditing(p ? p.id : 'new');
    setForm(p ? { ...EMPTY, ...p, lines: (p.lines || []).join(', '), contact_name: p.contact_name || '', phone: p.phone || '', email: p.email || '', notes: p.notes || '' } : EMPTY);
  };
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    save.mutate({
      id: editing === 'new' ? null : editing,
      agencyId,
      values: {
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.replace(/\D/g, '').slice(-10) || null,
        email: form.email.trim() || null,
        lines: form.lines.split(',').map(s => s.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      },
    }, { onSuccess: () => setEditing(null) });
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const field = 'w-full rounded px-2 py-1.5 text-sm';

  return (
    <div className="space-y-4">
      <div className="dark-card text-sm" style={{ padding: 12, color: 'var(--qs-subtle)' }}>
        You can only refer customers who said yes to referrals on the Rate Check page. Before paying or accepting a
        referral fee, check Georgia’s rules with your attorney.
      </div>

      <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
        <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--qs-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Agencies you refer to</span>
          <button onClick={() => start(null)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white">Add partner</button>
        </div>

        {editing && (
          <form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-3" style={{ borderBottom: '1px solid var(--qs-border)', background: 'var(--qs-elevated)' }}>
            <input className={field} style={inputStyle} placeholder="Agency name *" value={form.name} onChange={e => set('name', e.target.value)} required />
            <input className={field} style={inputStyle} placeholder="Contact name" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            <input className={field} style={inputStyle} placeholder="Phone" inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
            <input className={field} style={inputStyle} placeholder="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <input className={`${field} md:col-span-2`} style={inputStyle} placeholder="Lines they write (comma-separated, e.g. high-risk auto, commercial, flood)"
              value={form.lines} onChange={e => set('lines', e.target.value)} />
            <input className={`${field} md:col-span-2`} style={inputStyle} placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={save.isPending} className="rounded bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-sm" style={inputStyle}>Cancel</button>
              {save.isError && <span className="text-sm text-red-600">{save.error.message}</span>}
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">Error loading partners.</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No partners yet. Add an agency that writes what Allstate can’t, like SR-22 or commercial.</div>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr style={{ background: 'var(--qs-elevated)' }}>
                {['Partner', 'Contact', 'Lines', 'Status', ''].map(h => <th key={h} className={thCls} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--qs-border)', opacity: p.active ? 1 : 0.5 }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>{p.name}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>
                    {[p.contact_name, p.phone && formatPhone(p.phone), p.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{(p.lines || []).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{p.active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                    <button onClick={() => start(p)} className="text-primary-600 hover:underline">Edit</button>
                    <button onClick={() => save.mutate({ id: p.id, agencyId, values: { active: !p.active } })} className="ml-3 hover:underline" style={{ color: 'var(--qs-subtle)' }}>
                      {p.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
