// src/components/ImpersonationBanner.jsx
// Banner shown when admin is impersonating a user
// Displays prominent warning and provides quick exit

import { useAuth } from '../contexts/AuthContext';

export function ImpersonationBanner() {
  const {
    isImpersonating,
    impersonationSession,
    endImpersonation,
    agencyMemberships
  } = useAuth();

  if (!isImpersonating || !impersonationSession) {
    return null;
  }

  // Find the target agency name
  const targetAgency = agencyMemberships.find(
    m => m.agency_id === impersonationSession.target_agency_id
  );

  const handleEndImpersonation = async () => {
    try {
      await endImpersonation();
    } catch (error) {
      console.error('Failed to end impersonation:', error);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#dc2626',
        color: 'white',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <strong>IMPERSONATING</strong>
      </span>

      <span>
        Viewing as agency: <strong>{targetAgency?.agencies?.name || 'Unknown'}</strong>
      </span>

      {impersonationSession.actions_disabled && (
        <span
          style={{
            backgroundColor: 'rgba(0,0,0,0.2)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px'
          }}
        >
          READ-ONLY MODE
        </span>
      )}

      <span style={{ opacity: 0.8, fontSize: '12px' }}>
        All actions are being logged
      </span>

      <button
        onClick={handleEndImpersonation}
        style={{
          backgroundColor: 'white',
          color: '#dc2626',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '4px',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        Exit Impersonation
      </button>
    </div>
  );
}

export default ImpersonationBanner;
