// src/pages/components/settings/EmployeeInviteModal.jsx
// Modal for inviting an employee to QuoteSync — sends a magic link / invite
// email via the send-employee-invite edge function and links the resulting
// auth user to the employee record.

import { useState } from 'react';
import { X, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export default function EmployeeInviteModal({ employee, agencyId, onClose, onSuccess }) {
  const [email, setEmail] = useState(employee?.personal_email || '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // null | 'sent' | 'linked' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  async function handleInvite() {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-employee-invite', {
        body: {
          employee_id: employee.id,
          email: email.trim().toLowerCase(),
          agency_id: agencyId,
        },
      });

      if (error || data?.error) throw new Error(error?.message || data?.error);

      setResult(data.already_existed ? 'linked' : 'sent');
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMsg(err.message);
      setResult('error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#161924', border: '1px solid var(--qs-border)',
        borderRadius: 12, width: '100%', maxWidth: 440, padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)',
              margin: 0 }}>
              Invite {employee.first_name} to QuoteSync
            </h2>
            <p style={{ fontSize: 12, color: 'var(--qs-muted)', margin: '4px 0 0' }}>
              They'll receive an email with a link to set up their account.
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--qs-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {result === null && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600,
                color: 'var(--qs-subtle)', display: 'block', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tracy@example.com"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                  color: 'var(--qs-text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ background: 'var(--qs-elevated)', borderRadius: 8,
              padding: '10px 12px', marginBottom: 20, fontSize: 12,
              color: 'var(--qs-dim)' }}>
              <strong style={{ color: 'var(--qs-text)' }}>
                {employee.first_name} will have access to:
              </strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.8 }}>
                <li>My Queue — retention cases assigned to them</li>
                <li>My Scorecard — personal performance metrics</li>
                <li>Punch Clock — time entry</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: '10px', borderRadius: 8,
                  background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                  color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={sending || !email.trim()}
                style={{ flex: 2, padding: '10px', borderRadius: 8,
                  background: '#3B82F6', border: 'none',
                  color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  opacity: sending || !email.trim() ? 0.5 : 1 }}>
                <Mail size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {sending ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </>
        )}

        {result === 'sent' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={40} style={{ color: '#10B981', marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)',
              margin: '0 0 8px' }}>
              Invite sent to {email}
            </p>
            <p style={{ fontSize: 13, color: 'var(--qs-dim)', margin: '0 0 20px' }}>
              {employee.first_name} will receive an email with a link to set up
              their QuoteSync account. They'll land on their Queue automatically
              after signing in.
            </p>
            <button onClick={onClose}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#10B98122',
                border: '1px solid #10B98133', color: '#10B981',
                cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Done
            </button>
          </div>
        )}

        {result === 'linked' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircle size={40} style={{ color: '#3B82F6', marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)',
              margin: '0 0 8px' }}>
              Account linked
            </p>
            <p style={{ fontSize: 13, color: 'var(--qs-dim)', margin: '0 0 20px' }}>
              {email} already has a Supabase account. It's now linked to{' '}
              {employee.first_name}'s employee record. They can log in immediately.
            </p>
            <button onClick={onClose}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#3B82F622',
                border: '1px solid #3B82F633', color: '#3B82F6',
                cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Done
            </button>
          </div>
        )}

        {result === 'error' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <AlertCircle size={40} style={{ color: '#EF4444', marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)',
              margin: '0 0 8px' }}>
              Invite failed
            </p>
            <p style={{ fontSize: 13, color: '#EF4444', margin: '0 0 20px' }}>
              {errorMsg}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setResult(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8,
                  background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                  color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Try Again
              </button>
              <button onClick={onClose}
                style={{ flex: 1, padding: '10px', borderRadius: 8,
                  background: 'none', border: '1px solid var(--qs-border)',
                  color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13 }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
