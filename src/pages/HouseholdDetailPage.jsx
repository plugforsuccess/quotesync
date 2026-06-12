// src/pages/HouseholdDetailPage.jsx
// The household view — every policy-bearing record for one customer, across
// new business, renewals, pending cancels, and terminations. Reached by
// clicking a result in Customer Search.
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', renters: 'Renters', condo: 'Condo', landlord: 'Landlord',
  pup: 'Umbrella', boat: 'Boat', specialty_auto: 'Specialty Auto', life: 'Life',
  manufactured: 'Manufactured',
};
const SOURCE_CONFIG = {
  new_business: { label: 'New Business', color: '#10B981' },
  renewal:      { label: 'Renewal',      color: '#3B82F6' },
  cancel:       { label: 'Cancel',       color: '#EF4444' },
  termination:  { label: 'Termination',  color: '#94A3B8' },
};
const fmt$ = n => (n == null || isNaN(n)) ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const label = p => PRODUCT_LABELS[p] || (p ? p.toUpperCase() : '—');

export default function HouseholdDetailPage() {
  const { householdId } = useParams();
  const { currentAgencyId } = useAuth();

  const { data: household } = useQuery({
    queryKey: ['household_header', householdId],
    enabled: !!householdId && !!currentAgencyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_directory')
        .select('*')
        .eq('agency_id', currentAgencyId)
        .eq('household_id', householdId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['household_records', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_records', { p_household: householdId });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 0' }}>
      <Link to="/agency/customers" style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'none' }}>
        ← Customer Search
      </Link>

      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)' }}>
          {household?.display_name || 'Household'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 4 }}>
          {[household?.phone, household?.email, household?.zip].filter(Boolean).join(' · ') || 'No contact on file'}
        </div>
        {household && (
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
            <span>
              <span style={{ color: 'var(--qs-muted)' }}>Active: </span>
              {household.active_products?.length
                ? household.active_products.map(label).join(', ')
                : <span style={{ color: 'var(--qs-muted)' }}>none</span>}
            </span>
            {household.lost_products?.length > 0 && (
              <span>
                <span style={{ color: 'var(--qs-muted)' }}>Lost: </span>
                <span style={{ color: '#F87171' }}>{household.lost_products.map(label).join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
      )}
      {!isLoading && records.length === 0 && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          No records found for this household.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {records.map((r, i) => {
          const cfg = SOURCE_CONFIG[r.source] || { label: r.source, color: 'var(--qs-dim)' };
          return (
            <div key={i} style={{
              background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
              borderLeft: `3px solid ${cfg.color}`, borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40`, color: cfg.color,
                }}>{cfg.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{label(r.product)}</span>
                <span style={{ fontSize: 12, color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>
                  {r.policy_no}
                </span>
                <span style={{ fontSize: 12, color: 'var(--qs-dim)' }}>{r.status}</span>
                {r.detail && (
                  <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>{r.detail}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--qs-dim)', flexShrink: 0 }}>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt$(r.premium)}</span>
                <span>{r.record_date || '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
