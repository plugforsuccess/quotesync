import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function MFASettingsPage() {
  const [factors, setFactors]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactors(data?.totp || []);
      setLoading(false);
    });
  }, []);

  async function handleRemove(factorId) {
    if (!confirm('Remove this authenticator? You will need to set up MFA again on next login.')) return;
    setRemoving(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMsg(error.message);
    } else {
      setFactors(prev => prev.filter(f => f.id !== factorId));
      setMsg('Authenticator removed. You will be prompted to set up MFA on next login.');
    }
    setRemoving(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>
        Two-Factor Authentication
      </div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>
        Manage your authenticator app for this account.
      </div>

      {msg && (
        <div style={{ background: '#10B98111', border: '1px solid #10B98133',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#10B981' }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748B' }}>Loading…</div>
      ) : factors.length === 0 ? (
        <div style={{ background: '#F59E0B11', border: '1px solid #F59E0B33',
          borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#F59E0B' }}>
          No authenticator enrolled. You will be prompted to set one up on next login.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {factors.map(f => (
            <div key={f.id} style={{ background: '#161924', border: '1px solid #252A3A',
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>
                  {f.friendly_name || 'Google Authenticator'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Enrolled {new Date(f.created_at).toLocaleDateString()}
                  {' · '}
                  <span style={{ color: f.status === 'verified' ? '#10B981' : '#F59E0B' }}>
                    {f.status === 'verified' ? 'Active' : 'Unverified'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRemove(f.id)}
                disabled={removing}
                style={{ fontSize: 12, color: '#EF4444', background: 'none',
                  border: '1px solid #EF444433', borderRadius: 6,
                  padding: '6px 12px', cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
