// src/pages/CrossSellPage.jsx
import { useState } from 'react';
import { useCrossSellCases, useCrossSellUploads, useUpdateCrossSellCase } from '../hooks/useCrossSell';
import CrossSellUploadModal from './components/cross-sell/CrossSellUploadModal';
import CrossSellQueue from './components/cross-sell/CrossSellQueue';
import ProducerGoalProgress from './components/employee/ProducerGoalProgress';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';

export default function CrossSellPage() {
  const { currentAgencyId, user } = useAuth();
  const { data: employee } = useCurrentEmployee();
  const [tab, setTab] = useState('renewal');
  const [showUpload, setShowUpload] = useState(false);

  const { data: allCases = [], isLoading } = useCrossSellCases(currentAgencyId);
  const { data: uploads = [] } = useCrossSellUploads(currentAgencyId);
  const updateCase = useUpdateCrossSellCase(currentAgencyId);

  const renewalCases  = allCases.filter(c => c.match_type === 'renewal_only' && c.status !== 'hold');
  const onHoldCases   = allCases.filter(c => c.status === 'hold');
  const outboundCases = allCases.filter(c => c.match_type === 'new_lead');

  const tabs = [
    { key: 'renewal',  label: `Renewal Matches (${renewalCases.length})` },
    { key: 'hold',     label: `On Hold (${onHoldCases.length})` },
    { key: 'outbound', label: `Outbound Leads (${outboundCases.length})` },
  ];

  const activeCases = tab === 'renewal'  ? renewalCases
                    : tab === 'hold'     ? onHoldCases
                    : outboundCases;

  const emptyLabel = tab === 'renewal'
    ? 'No renewal matches. Upload a cross-sell audit report to get started.'
    : tab === 'hold'
    ? 'No cases on hold.'
    : 'No outbound leads. Unmatched rows from the audit will appear here.';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 24,
      }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)' }}>
            Cross-Sell
          </div>
          <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 2 }}>
            {allCases.length} opportunities from {uploads.length} upload{uploads.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: '#3B82F6', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Upload Audit Report
        </button>
      </div>

      {/* Sales producers: monthly premium goal progress at a glance */}
      {employee?.roles?.includes('sales') && (
        <ProducerGoalProgress compact orgId={employee?.org_id} employee={employee} />
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 13,
            fontWeight: 600, cursor: 'pointer', border: '1px solid',
            borderColor: tab === t.key ? '#3B82F6' : 'var(--qs-border)',
            background: tab === t.key ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
            color: tab === t.key ? '#3B82F6' : 'var(--qs-dim)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hold' && (
        <div style={{
          background: 'rgba(245,158,11,0.07)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--qs-dim)',
        }}>
          ⚠ These customers have an active pending cancel or both a renewal and cancel.
          Resolve the cancel first. These cases will be re-evaluated on next upload.
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', color: 'var(--qs-muted)', padding: '48px 0' }}>
          Loading…
        </div>
      ) : (
        <CrossSellQueue
          cases={activeCases}
          tab={tab}
          emptyLabel={emptyLabel}
          onUpdate={(id, updates) => updateCase.mutate({ id, updates })}
        />
      )}

      {showUpload && (
        <CrossSellUploadModal
          agencyId={currentAgencyId}
          uploadedBy={user?.id}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
