// src/pages/components/retention/RetentionAIPerformance.jsx

import { useState } from 'react';
import AiPerformanceDashboard from '../renewals/AiPerformanceDashboard';

const CALL_TYPE_TABS = [
  { key: 'all',     label: 'All Calls' },
  { key: 'renewal', label: 'Renewals'  },
  { key: 'cancel',  label: 'Cancels'   },
];

export default function RetentionAIPerformance({ agencyId }) {
  const [callType, setCallType] = useState('all');

  return (
    <div>
      {/* Call type toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {CALL_TYPE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCallType(key)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${callType === key ? 'var(--qs-info)' : 'var(--qs-border)'}`,
              background: callType === key ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
              color: callType === key ? 'var(--qs-info)' : 'var(--qs-dim)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <AiPerformanceDashboard
        agencyId={agencyId}
        callType={callType === 'all' ? null : callType}
      />
    </div>
  );
}
