// src/pages/CrossSellPage.jsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCrossSellCases, useCrossSellUploads, useUpdateCrossSellCase } from '../hooks/useCrossSell';
import CrossSellUploadModal from './components/cross-sell/CrossSellUploadModal';
import CrossSellQueue from './components/cross-sell/CrossSellQueue';
import ProducerGoalProgress from './components/employee/ProducerGoalProgress';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';

// Household key for matching a customer across policies (no customer ID yet):
// normalized name + 5-digit ZIP. ZIP disambiguates common names.
const householdKey = (name, zip) =>
  `${(name || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()}|${(zip || '').slice(0, 5)}`;

// Terminations we would NOT try to win back (no asset / out of territory).
const NON_WINNABLE_RX = /\b(moved|sold|deceased|death|total loss|no longer|relocat)\b/i;

export default function CrossSellPage() {
  const { currentAgencyId, user } = useAuth();
  const { data: employee } = useCurrentEmployee();
  const [tab, setTab] = useState('renewal');
  const [showUpload, setShowUpload] = useState(false);
  const [showWorked, setShowWorked] = useState(false);

  const { data: rawCases = [], isLoading } = useCrossSellCases(currentAgencyId);
  const { data: uploads = [] } = useCrossSellUploads(currentAgencyId);
  const updateCase = useUpdateCrossSellCase(currentAgencyId);

  // Recent terminations (last 18 months) — used to flag a cross-sell customer
  // who is still active on one line but LOST another. That's a warm re-add (the
  // bundle discount lowers their remaining premium), so it ranks above cold
  // cross-sells. Matched by household key on a line different from what they hold.
  const { data: recentLapses = [] } = useQuery({
    queryKey: ['winback_lapses', currentAgencyId],
    enabled: !!currentAgencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 18);
      const { data, error } = await supabase
        .from('lapse_events')
        .select('customer_name, zip, product, lapse_date, termination_reason')
        .eq('agency_id', currentAgencyId)
        .gte('lapse_date', since.toISOString().slice(0, 10));
      if (error) throw error;
      return data || [];
    },
  });

  const lapseByHousehold = useMemo(() => {
    const m = new Map();
    for (const l of recentLapses) {
      if (l.termination_reason && NON_WINNABLE_RX.test(l.termination_reason)) continue;
      const k = householdKey(l.customer_name, l.zip);
      const prev = m.get(k);
      if (!prev || (l.lapse_date || '') > (prev.lapse_date || '')) m.set(k, l);
    }
    return m;
  }, [recentLapses]);

  // Annotate each case with a lost-line winback flag (different product, recent).
  const allCases = useMemo(() => rawCases.map(c => {
    const lost = lapseByHousehold.get(householdKey(c.customer_name, c.zip));
    const isLostLine = lost && lost.product && lost.product !== c.current_product;
    if (!isLostLine) return c;
    const months = Math.max(0, Math.round(
      (Date.now() - new Date(lost.lapse_date + 'T00:00:00')) / (1000 * 60 * 60 * 24 * 30.44)
    ));
    return { ...c, lostLine: { product: lost.product, months, reason: lost.termination_reason } };
  }), [rawCases, lapseByHousehold]);

  // Closed outcomes — hidden from the active tabs unless "show worked" is on.
  // 'not_reached' stays active (it needs another attempt).
  const TERMINAL = ['sold', 'declined', 'converted', 'closed'];
  const isActive = c => showWorked || !TERMINAL.includes(c.status);

  // Soonest-deadline first, so reps work the most time-sensitive call in each
  // tab before the rest. Outbound has no deadline — newest upload first.
  const byRenewalDate = (a, b) =>
    (a.renewal_cases?.renewal_date || '9999').localeCompare(b.renewal_cases?.renewal_date || '9999');
  const byCancelDate = (a, b) =>
    (a.pending_cases?.cancel_effective_date || '9999').localeCompare(b.pending_cases?.cancel_effective_date || '9999');

  // Warm re-adds (customer still active, lost another line) rank first in every
  // tab — they convert best and the bundle discount is a live lever.
  const warmFirst = (sortFn) => (a, b) => {
    if (!!a.lostLine !== !!b.lostLine) return a.lostLine ? -1 : 1;
    return sortFn ? sortFn(a, b) : 0;
  };

  const renewalCases  = allCases
    .filter(c => c.match_type === 'renewal_only' && c.status !== 'hold' && isActive(c))
    .sort(warmFirst(byRenewalDate));
  const onHoldCases   = allCases
    .filter(c => c.status === 'hold')
    .sort(warmFirst(byCancelDate));
  const outboundCases = allCases
    .filter(c => c.match_type === 'new_lead' && isActive(c))
    .sort(warmFirst());

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

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignItems: 'center' }}>
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
        <label style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--qs-subtle)', cursor: 'pointer',
        }}>
          <input type="checkbox" checked={showWorked} onChange={e => setShowWorked(e.target.checked)} />
          Show worked (sold / declined)
        </label>
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
