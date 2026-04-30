// src/pages/components/cross-sell/CrossSellQueue.jsx
// Renders a list of cross-sell cases with inline outcome editing.

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', renters: 'Renters', condo: 'Condo',
  landlord: 'Landlord', pup: 'Umbrella', boat: 'Boat',
  specialty_auto: 'Specialty Auto', life: 'Life',
};

const OUTCOME_OPTIONS = [
  { value: 'pitched',     label: 'Pitched — awaiting decision' },
  { value: 'sold',        label: 'Sold ✓ — quote in progress' },
  { value: 'declined',    label: 'Declined — not interested' },
  { value: 'not_reached', label: 'Could not reach' },
];

export default function CrossSellQueue({ cases, tab, onUpdate, emptyLabel }) {
  if (!cases || cases.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--qs-muted)', padding: '48px 0' }}>
        {emptyLabel || 'No cases.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cases.map(c => (
        <CrossSellCard
          key={c.id}
          cs={c}
          tab={tab}
          onUpdate={(updates) => onUpdate(c.id, updates)}
        />
      ))}
    </div>
  );
}

function CrossSellCard({ cs, tab, onUpdate }) {
  const renewal = cs.renewal_cases;
  const cancel  = cs.pending_cases;

  return (
    <div style={{
      background: 'var(--qs-card)',
      border: '1px solid var(--qs-border)',
      borderLeft: `3px solid ${
        cs.status === 'sold' ? '#10B981'
        : cs.status === 'hold' ? '#F59E0B'
        : cs.status === 'declined' ? '#64748B'
        : '#3B82F6'
      }`,
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 3 }}>
            {cs.customer_name}
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.25)',
              color: '#60A5FA', borderRadius: 4, padding: '1px 6px',
            }}>
              Pitch: {PRODUCT_LABELS[cs.recommended_product] || cs.recommended_product}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
            Has: {PRODUCT_LABELS[cs.current_product] || cs.current_product || '—'}
            {cs.policy_no && ` · ${cs.policy_no}`}
            {cs.opportunity_tier && ` · Tier ${cs.opportunity_tier}`}
          </div>
        </div>

        {tab !== 'hold' && (
          <select
            className="dark-select"
            value={cs.status}
            onChange={e => onUpdate({ status: e.target.value, outcome_at: new Date().toISOString() })}
            style={{ fontSize: 12, padding: '5px 10px', minWidth: 160 }}
          >
            <option value="new">New — not yet pitched</option>
            {OUTCOME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {renewal && (
          <div style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            color: '#60A5FA',
          }}>
            🔄 Renewal: {renewal.product?.toUpperCase()} · {renewal.renewal_date}
          </div>
        )}
        {cancel && (
          <div style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#F87171',
          }}>
            ⚠ Cancel: {cancel.product?.toUpperCase()} · due {cancel.cancel_effective_date}
            {cancel.amount_due ? ` · $${Number(cancel.amount_due).toLocaleString()} owed` : ''}
          </div>
        )}
        {cs.match_type === 'new_lead' && cs.lead_id && (
          <div style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#34D399',
          }}>
            ✓ Lead created in Lead Manager
          </div>
        )}
      </div>
    </div>
  );
}
