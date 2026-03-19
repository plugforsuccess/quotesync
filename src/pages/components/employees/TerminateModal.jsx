// src/pages/components/employees/TerminateModal.jsx
// Confirmation dialog for terminating an employee.
// Redesigned with inline styles to bypass the global :not(.dark-page)
// CSS cascade that forces white backgrounds on form controls.

import { useState, useEffect, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';

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
        maxWidth: 520,
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
              background: 'rgba(220,38,38,0.15)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--qs-danger)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
                Terminate Employee
              </h2>
              <p style={{ fontSize: 12, color: 'var(--qs-dim)', margin: 0 }}>
                {displayName} {employee.last_name}
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

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--qs-dim)', margin: 0 }}>
              You are about to terminate <span style={{ fontWeight: 600, color: 'var(--qs-bright)' }}>{displayName} {employee.last_name}</span>.
              This will mark them as terminated but preserve all historical data.
            </p>

            <div>
              <label style={labelStyle}>Termination Date</label>
              <input
                type="date"
                required
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--qs-danger)'}
                onBlur={e => e.target.style.borderColor = 'var(--qs-border)'}
              />
            </div>

            <div>
              <label style={labelStyle}>Reason (optional)</label>
              <textarea
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                rows={3}
                placeholder="Optional notes on departure..."
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--qs-danger)'}
                onBlur={e => e.target.style.borderColor = 'var(--qs-border)'}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 24px',
            borderTop: '1px solid var(--qs-border)',
            background: 'var(--qs-elevated)',
          }}>
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
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: saving ? 'var(--qs-muted)' : '#dc2626',
                border: 'none',
                borderRadius: 8,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Terminating...' : 'Confirm Termination'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
