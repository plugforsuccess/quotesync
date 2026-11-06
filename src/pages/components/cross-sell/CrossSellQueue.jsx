// src/pages/components/cross-sell/CrossSellQueue.jsx
// Renders a list of cross-sell cases with inline outcome editing.
import { T } from '../../../components/SiteCopy';
import { Link } from 'react-router-dom';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', renters: 'Renters', condo: 'Condo',
  landlord: 'Landlord', pup: 'Umbrella', boat: 'Boat',
  specialty_auto: 'Specialty Auto', life: 'Life',
};

const OUTCOME_OPTIONS = [
  { value: 'pitched',     label: 'Pitched — Awaiting Decision' },
  { value: 'sold',        label: 'Sold ✓ — Quote in Progress' },
  { value: 'declined',    label: 'Declined — Not Interested' },
  { value: 'not_reached', label: 'Could Not Reach' },
];

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '8px 2px 2px',
    }}>
      {children}
    </div>
  );
}

export default function CrossSellQueue({ cases, tab, onUpdate, onOpenCase, emptyLabel }) {
  if (!cases || cases.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--qs-muted)', padding: '48px 0' }}>
        {emptyLabel || <T k="pages.components.crosssell.crosssellqueue.8026a5">{'No cases.'}</T>}
      </div>
    );
  }

  // Win-backs sort first; give the two groups visible headers so the list
  // reads as "work these, then these" instead of one undifferentiated wall.
  const winbacks = cases.filter(c => c.lostLine);
  const standard = cases.filter(c => !c.lostLine);

  const renderCards = (list) => list.map(c => (
    <CrossSellCard key={c.id} cs={c} tab={tab} onUpdate={(updates) => onUpdate(c.id, updates)} onOpenCase={onOpenCase} />
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {winbacks.length > 0 && (
        <>
          <SectionHeader><T k="pages.components.crosssell.crosssellqueue.867f3d">♻ Win-backs — lost a line, best conversion (</T>{winbacks.length})</SectionHeader>
          {renderCards(winbacks)}
        </>
      )}
      {standard.length > 0 && (
        <>
          {winbacks.length > 0 && <SectionHeader><T k="pages.components.crosssell.crosssellqueue.aa40bb">Standard opportunities (</T>{standard.length})</SectionHeader>}
          {renderCards(standard)}
        </>
      )}
    </div>
  );
}

function CrossSellCard({ cs, tab, onUpdate, onOpenCase }) {
  const renewal = cs.renewal_cases;
  const cancel  = cs.pending_cases;
  const chipBtn = {
    fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 600, textAlign: 'left',
  };

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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>
            <Link
              to={`/agency/customers?q=${encodeURIComponent(cs.customer_name || '')}`}
              title="Open this customer's household view"
              style={{ color: 'var(--qs-bright)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {cs.customer_name}
            </Link>
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.25)',
              color: '#60A5FA', borderRadius: 4, padding: '1px 6px',
            }}>
              <T k="pages.components.crosssell.crosssellqueue.d7943c">Pitch:</T> {PRODUCT_LABELS[cs.recommended_product] || cs.recommended_product}
            </span>
            {cs.lostLine && (
              <span
                title={`Active customer who lost their ${PRODUCT_LABELS[cs.lostLine.product] || cs.lostLine.product} ${cs.lostLine.months} month(s) ago${cs.lostLine.reason ? ` (${cs.lostLine.reason})` : ''}. Warm re-add — the bundle discount lowers their remaining premium.`}
                style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: 'rgba(16,185,129,0.14)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  color: '#34D399', borderRadius: 4, padding: '1px 6px', cursor: 'help',
                }}>
                <T k="pages.components.crosssell.crosssellqueue.0a06b1">♻ Win back</T> {PRODUCT_LABELS[cs.lostLine.product] || cs.lostLine.product} <T k="pages.components.crosssell.crosssellqueue.b606d3">· lost</T> {cs.lostLine.months}<T k="pages.components.crosssell.crosssellqueue.8ac38b">mo ago</T>
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
            <T k="pages.components.crosssell.crosssellqueue.5d4303">Has:</T> {PRODUCT_LABELS[cs.current_product] || cs.current_product || '—'}
            {cs.policy_no && ` · ${cs.policy_no}`}
            {cs.opportunity_tier && <>{" "}<T k="pages.components.crosssell.crosssellqueue.dcfd5f">{"· Tier"}</T>{" "}{cs.opportunity_tier}</>}
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
          <button
            type="button"
            onClick={() => onOpenCase?.('renewal', renewal.id)}
            title="Open and work this renewal case — log the call and pitch the win-back"
            style={{ ...chipBtn,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.35)',
              color: '#60A5FA',
            }}
          >
            <T k="pages.components.crosssell.crosssellqueue.5cafd4">🔄 Open Renewal:</T> {renewal.product?.toUpperCase()} · {renewal.renewal_date} →
          </button>
        )}
        {cancel && (
          <button
            type="button"
            onClick={() => onOpenCase?.('cancel', cancel.id)}
            title="Open and work this pending-cancel case"
            style={{ ...chipBtn,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#F87171',
            }}
          >
            <T k="pages.components.crosssell.crosssellqueue.de3c52">⚠ Open Cancel:</T> {cancel.product?.toUpperCase()} <T k="pages.components.crosssell.crosssellqueue.9a1ee9">· Due</T> {cancel.cancel_effective_date}
            {cancel.amount_due ? <>{" · $"}{Number(cancel.amount_due).toLocaleString()}{" "}<T k="pages.components.crosssell.crosssellqueue.89e255">{"Owed"}</T></> : ''} →
          </button>
        )}
        {cs.match_type === 'new_lead' && cs.lead_id && (
          <div style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#34D399',
          }}>
            <T k="pages.components.crosssell.crosssellqueue.1567dd">✓ Lead created in Lead Manager</T>
          </div>
        )}
      </div>
    </div>
  );
}
