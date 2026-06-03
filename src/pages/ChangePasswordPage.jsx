// src/pages/ChangePasswordPage.jsx
// Forced password reset on first login. EmployeeRoute redirects here whenever
// the current employee row has must_reset_password = true. After a successful
// password update the flag is cleared and the user is sent to /my/queue.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { refetch } = useCurrentEmployee();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      // Update password via Supabase Auth
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      // Clear the must_reset_password flag via a SECURITY DEFINER RPC.
      // A plain employee has no UPDATE policy on their own employees row, so a
      // direct table update silently affects 0 rows and traps them in a
      // redirect loop. The RPC clears only this flag for the calling user.
      const { data: cleared, error: flagError } = await supabase
        .rpc('clear_my_must_reset_password');
      if (flagError) throw flagError;
      if (!cleared) {
        throw new Error(
          "Your password was updated, but we couldn't finish setting up your account. Please contact your agency administrator."
        );
      }

      // Refetch employee record so EmployeeRoute sees the cleared flag
      await refetch();

      navigate('/my/queue', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--qs-dark)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 14, padding: 32,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logos/allstate.svg" alt="Allstate" style={{ height: 36 }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 8 }}>
            Wiley-Wilson Agency
          </p>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)',
          margin: '0 0 8px', textAlign: 'center' }}>
          Set Your Password
        </h2>
        <p style={{ fontSize: 13, color: 'var(--qs-dim)', textAlign: 'center',
          margin: '0 0 24px' }}>
          You're using a temporary password. Please set a new one before continuing.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)',
            display: 'block', marginBottom: 6 }}>
            New password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              color: 'var(--qs-text)', fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-subtle)',
            display: 'block', marginBottom: 6 }}>
            Confirm password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your new password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              color: 'var(--qs-text)', fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 14 }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving || !password || !confirm}
          style={{
            width: '100%', padding: '12px', borderRadius: 8,
            background: '#3B82F6', border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            opacity: saving || !password || !confirm ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Set Password & Continue'}
        </button>
      </div>
    </div>
  );
}
