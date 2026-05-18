// src/pages/BookCompositionPage.jsx
import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBookSnapshot, computeBookAggregates } from '../hooks/useBookSnapshot';
import { generateMoves } from '../lib/bookPlaybook';
import BookEditorTab from './components/book/BookEditorTab';
import BookConcentrationTab from './components/book/BookConcentrationTab';
import BookBlastRadiusTab from './components/book/BookBlastRadiusTab';
import BookPlaybookTab from './components/book/BookPlaybookTab';
import PitchPDFButton from './components/book/PitchPDFButton';
import PageSpinner from '../components/PageSpinner';

const TABS = [
  { key: 'editor',        label: 'Composition Editor' },
  { key: 'concentration', label: 'Concentration' },
  { key: 'blast',         label: 'Blast Radius' },
  { key: 'playbook',      label: 'Multi-Carrier Playbook' },
];

const tabBtnStyle = (active) => ({
  padding: '10px 18px',
  background: active ? 'var(--qs-info)' : 'transparent',
  color: active ? 'white' : 'var(--qs-text)',
  fontSize: 14, fontWeight: active ? 600 : 500,
  borderRadius: 8, border: 'none', cursor: 'pointer',
});

export default function BookCompositionPage() {
  const { currentAgencyId, agencyMemberships } = useAuth();
  const { data: rows, isLoading } = useBookSnapshot(currentAgencyId);
  const [tab, setTab] = useState('editor');

  const agencyName = agencyMemberships
    ?.find(m => m.agency_id === currentAgencyId)?.agencies?.name ?? 'Agency';

  const aggregates = useMemo(() => computeBookAggregates(rows ?? []), [rows]);
  const moves = useMemo(() => generateMoves(aggregates), [aggregates]);

  if (isLoading) return <PageSpinner />;

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <header style={{
        marginBottom: 16, display: 'flex',
        justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>
            Book Composition
          </h1>
          <p style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 4 }}>
            Carrier and product mix, concentration risk, and blast-radius scenarios.
          </p>
        </div>
        <PitchPDFButton
          agencyName={agencyName}
          aggregates={aggregates}
          moves={moves}
        />
      </header>

      {/* Aggregate strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        <AggregateCard label="Total premium" value={`$${aggregates.totalPremium.toLocaleString()}`} />
        <AggregateCard label="Policies" value={aggregates.totalPolicies.toLocaleString()} />
        <AggregateCard label="Est. annual commission" value={`$${aggregates.totalCommission.toLocaleString()}`} />
        <AggregateCard label="Carriers" value={aggregates.byCarrier.length.toString()} />
        <AggregateCard label="Products" value={aggregates.byProduct.length.toString()} />
      </div>

      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
        borderRadius: 10, padding: 4, marginBottom: 16, overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button
            key={t.key} type="button"
            onClick={() => setTab(t.key)}
            style={tabBtnStyle(tab === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'editor' && (
        <BookEditorTab agencyId={currentAgencyId} rows={rows ?? []} />
      )}
      {tab === 'concentration' && (
        <BookConcentrationTab aggregates={aggregates} />
      )}
      {tab === 'blast' && (
        <BookBlastRadiusTab agencyId={currentAgencyId} aggregates={aggregates} />
      )}
      {tab === 'playbook' && (
        <BookPlaybookTab aggregates={aggregates} />
      )}
    </div>
  );
}

function AggregateCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        color: 'var(--qs-subtle)', fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)',
        marginTop: 4, lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}
