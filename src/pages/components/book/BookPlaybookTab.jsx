// src/pages/components/book/BookPlaybookTab.jsx
import { useMemo } from 'react';
import { generateMoves } from '../../../lib/bookPlaybook';

const cardStyle = {
  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
  borderRadius: 12, padding: 20,
};

export default function BookPlaybookTab({ aggregates }) {
  const moves = useMemo(() => generateMoves(aggregates), [aggregates]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...cardStyle }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
          Multi-Carrier Playbook
        </h3>
        <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 6, marginBottom: 0 }}>
          Personalized diversification moves based on your current book composition.
          These are starting points, not prescriptions — apply with your context.
        </p>
      </div>

      {moves.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
            Add book composition rows in the Editor tab to generate recommendations.
          </p>
        </div>
      ) : (
        moves.map((m, i) => (
          <MoveCard key={m.id} move={m} priority={i + 1} />
        ))
      )}
    </div>
  );
}

function MoveCard({ move, priority }) {
  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 12, padding: 20,
      display: 'flex', gap: 16, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22,
        background: move.severity === 'critical' ? 'var(--qs-danger-subtle)' :
                    move.severity === 'high'     ? 'var(--qs-warning-subtle)' :
                                                   'rgba(59, 130, 246, 0.10)',
        color:      move.severity === 'critical' ? 'var(--qs-danger)' :
                    move.severity === 'high'     ? 'var(--qs-warning)' :
                                                   'var(--qs-info)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 18, flexShrink: 0,
      }}>
        {priority}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
        }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
            {move.title}
          </h4>
          <SeverityBadge severity={move.severity} />
        </div>
        <p style={{ fontSize: 14, color: 'var(--qs-text)', marginTop: 4, marginBottom: 8 }}>
          {move.description}
        </p>
        {move.evidence && (
          <p style={{ fontSize: 12, color: 'var(--qs-subtle)', margin: 0 }}>
            <strong>Why this matters:</strong> {move.evidence}
          </p>
        )}
        {move.nextStep && (
          <p style={{ fontSize: 12, color: 'var(--qs-info)', marginTop: 8, marginBottom: 0, fontWeight: 500 }}>
            → {move.nextStep}
          </p>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const config = {
    critical: { label: 'Critical', color: 'var(--qs-danger)', bg: 'var(--qs-danger-subtle)' },
    high:     { label: 'High',     color: 'var(--qs-warning)', bg: 'var(--qs-warning-subtle)' },
    medium:   { label: 'Medium',   color: 'var(--qs-info)', bg: 'rgba(59, 130, 246, 0.12)' },
  }[severity] ?? { label: severity, color: 'var(--qs-subtle)', bg: 'var(--qs-elevated)' };

  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 4, color: config.color, background: config.bg,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {config.label}
    </span>
  );
}
