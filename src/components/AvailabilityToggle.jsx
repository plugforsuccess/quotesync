// AvailabilityToggle — prominent availability toggle for producer dashboard.
// Shows green when active, grey when inactive. Prompts for transfer phone
// if not yet set. Auto-reset info shown when available.

import { useState, useCallback } from 'react';
import { Phone } from 'lucide-react';
import { useMyAvailability, useToggleAvailability, useSetTransferPhone, validateE164 } from '../hooks/useAgentAvailability';
import { useAuth } from '../contexts/AuthContext';

export default function AvailabilityToggle() {
  const { currentAgencyId } = useAuth();
  const { data: availability, isLoading } = useMyAvailability();
  const toggleMutation = useToggleAvailability();
  const setPhoneMutation = useSetTransferPhone();

  const [optimisticAvailable, setOptimisticAvailable] = useState(null);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const isAvailable = optimisticAvailable !== null ? optimisticAvailable : availability?.available;

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  const handleToggle = async () => {
    if (!currentAgencyId) return;

    const newState = !isAvailable;

    // If turning ON and no transfer_phone, prompt first
    if (newState && !availability?.transfer_phone) {
      setShowPhonePrompt(true);
      return;
    }

    // Optimistic update
    setOptimisticAvailable(newState);

    try {
      await toggleMutation.mutateAsync({
        available: newState,
        agencyId: currentAgencyId,
      });
      setOptimisticAvailable(null); // let query take over
    } catch (err) {
      // Revert
      setOptimisticAvailable(!newState);
      showToast('Failed to update availability. Please try again.');
      console.error('[AvailabilityToggle] Toggle failed:', err);
    }
  };

  const handlePhoneSubmit = async () => {
    const phone = phoneInput.trim();
    if (!validateE164(phone)) {
      setPhoneError('Enter a valid US number in E.164 format (e.g. +14045551234)');
      return;
    }
    setPhoneError('');

    // Optimistic
    setOptimisticAvailable(true);
    setShowPhonePrompt(false);

    try {
      await toggleMutation.mutateAsync({
        available: true,
        agencyId: currentAgencyId,
        transferPhone: phone,
      });
      setOptimisticAvailable(null);
      setPhoneInput('');
    } catch (err) {
      setOptimisticAvailable(false);
      showToast('Failed to set phone and activate. Please try again.');
      console.error('[AvailabilityToggle] Phone + toggle failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>Loading availability...</div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        background: isAvailable ? 'rgba(34, 197, 94, 0.08)' : 'var(--qs-card)',
        border: `2px solid ${isAvailable ? '#22C55E' : 'var(--qs-border)'}`,
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 16,
        transition: 'all 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: isAvailable ? '#22C55E' : '#6B7280',
              boxShadow: isAvailable ? '0 0 8px rgba(34, 197, 94, 0.5)' : 'none',
              transition: 'all 0.2s ease',
            }} />
            <div>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: isAvailable ? '#22C55E' : 'var(--qs-dim)',
              }}>
                {isAvailable ? 'Available for Transfers' : 'Unavailable'}
              </div>
              {isAvailable && availability?.auto_reset_at && (
                <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 2 }}>
                  Auto-resets at 8:00 PM ET
                </div>
              )}
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
            style={{
              width: 56,
              height: 30,
              borderRadius: 15,
              border: 'none',
              background: isAvailable ? '#22C55E' : '#4B5563',
              cursor: toggleMutation.isPending ? 'wait' : 'pointer',
              position: 'relative',
              transition: 'background 0.2s ease',
              opacity: toggleMutation.isPending ? 0.7 : 1,
              flexShrink: 0,
            }}
            aria-label={isAvailable ? 'Set unavailable' : 'Set available'}
          >
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#FFFFFF',
              position: 'absolute',
              top: 3,
              left: isAvailable ? 29 : 3,
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>

        {availability?.transfer_phone && (
          <div style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--qs-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <Phone style={{ width: 12, height: 12 }} />
            Transfer line: {maskPhone(availability.transfer_phone)}
          </div>
        )}
      </div>

      {/* Phone number prompt modal */}
      {showPhonePrompt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}>
          <div style={{
            background: 'var(--qs-card)',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '100%',
            border: '1px solid var(--qs-border)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
              Set Your Transfer Number
            </h3>
            <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
              Enter your direct phone number for live call transfers. This is the number Bland AI will transfer qualified leads to.
            </p>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
              placeholder="+14045551234"
              className="dark-input"
              style={{ width: '100%', marginBottom: phoneError ? 4 : 16, fontSize: 16 }}
              autoFocus
            />
            {phoneError && (
              <div style={{ fontSize: 12, color: 'var(--qs-danger)', marginBottom: 12 }}>
                {phoneError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowPhonePrompt(false); setPhoneInput(''); setPhoneError(''); }}
                className="btn-ghost"
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handlePhoneSubmit}
                disabled={!phoneInput.trim() || setPhoneMutation.isPending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#22C55E',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  opacity: !phoneInput.trim() ? 0.5 : 1,
                }}
              >
                Save & Go Available
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#EF4444',
          color: '#FFFFFF',
          padding: '10px 20px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toastMessage}
        </div>
      )}
    </>
  );
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone;
  const last4 = phone.slice(-4);
  return `••• ••• ${last4}`;
}
