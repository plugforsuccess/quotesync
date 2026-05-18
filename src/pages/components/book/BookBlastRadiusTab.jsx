// src/pages/components/book/BookBlastRadiusTab.jsx
import { useState } from 'react';
import BlastRadiusScenarioForm from './BlastRadiusScenarioForm';
import BlastRadiusResults from './BlastRadiusResults';

const cardStyle = {
  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
  borderRadius: 12, padding: 20,
};

export default function BookBlastRadiusTab({ aggregates }) {
  // Default scenario: comp cut of -10% against the largest carrier
  const defaultCarrier = aggregates.byCarrier[0]?.carrier_code ?? 'allstate';

  const [scenario, setScenario] = useState({
    type: 'comp_cut',
    carrierCode: defaultCarrier,
    compChangePct: -10,
    retentionPct: 60,
    buyoutVariant: 'typical',
  });

  if (aggregates.byCarrier.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
        <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
          Add book composition rows in the Editor tab to run scenarios.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
      <div style={cardStyle}>
        <BlastRadiusScenarioForm
          scenario={scenario}
          onChange={setScenario}
          carriers={aggregates.byCarrier}
        />
      </div>

      <div style={cardStyle}>
        <BlastRadiusResults
          scenario={scenario}
          aggregates={aggregates}
        />
      </div>
    </div>
  );
}
