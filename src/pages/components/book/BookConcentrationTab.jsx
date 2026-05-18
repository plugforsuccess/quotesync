// src/pages/components/book/BookConcentrationTab.jsx
import ConcentrationPieChart from './ConcentrationPieChart';
import CarrierProductMatrix from './CarrierProductMatrix';

const cardStyle = {
  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
  borderRadius: 12, padding: 20,
};

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'Homeowners', condo: 'Condo', renters: 'Renters',
  landlord: 'Landlord', specialty_auto: 'Specialty Auto',
  pup: 'Umbrella', manufactured: 'Mfd Home',
  boat: 'Boat', motor_club: 'Motor Club', other: 'Other',
};

export default function BookConcentrationTab({ aggregates }) {
  const { byCarrier, byProduct, byCarrierProduct, totalPremium } = aggregates;

  const topCarrierShare = byCarrier[0]?.premiumShare ?? 0;
  const topProductShare = byProduct[0]?.premiumShare ?? 0;
  const carrierCount = byCarrier.length;

  // Risk classification
  const riskLevel =
    topCarrierShare >= 80 ? 'critical' :
    topCarrierShare >= 60 ? 'warning' :
    'ok';

  const bannerBg =
    riskLevel === 'critical' ? 'var(--qs-danger-subtle)' :
    riskLevel === 'warning'  ? 'var(--qs-warning-subtle)' :
    'rgba(16, 185, 129, 0.07)';
  const bannerBorder =
    riskLevel === 'critical' ? 'var(--qs-danger-border)' :
    riskLevel === 'warning'  ? 'var(--qs-warning-border)' :
    'rgba(16, 185, 129, 0.2)';

  const bannerTitle =
    riskLevel === 'critical' ? '🚨 Single-carrier concentration risk' :
    carrierCount === 1       ? '⚠️ Single-carrier book' :
    riskLevel === 'warning'  ? '⚠️ Heavy carrier concentration' :
    '✓ Multi-carrier book';

  // Carriers needed to reach 80% of premium
  const sortedShares = [...byCarrier].sort((a, b) => b.premiumShare - a.premiumShare);
  let cumulative = 0;
  let count80 = 0;
  for (const c of sortedShares) {
    cumulative += c.premiumShare;
    count80++;
    if (cumulative >= 80) break;
  }

  // Carrier-product max concentration cell
  const topCell = [...byCarrierProduct].sort((a, b) => b.premium - a.premium)[0];
  const topCellShare = totalPremium > 0 && topCell ? (topCell.premium / totalPremium) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Risk summary banner */}
      <div style={{
        ...cardStyle,
        background: bannerBg, borderColor: bannerBorder, padding: 16,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
          {bannerTitle}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--qs-text)', marginTop: 8, marginBottom: 0 }}>
          Your top carrier ({byCarrier[0]?.carrier_name ?? 'n/a'}) holds{' '}
          <strong>{topCarrierShare.toFixed(1)}%</strong> of total premium across{' '}
          {carrierCount} carrier{carrierCount === 1 ? '' : 's'}.
          Your top product ({PRODUCT_LABELS[byProduct[0]?.product_key] ?? '—'}) is{' '}
          <strong>{topProductShare.toFixed(1)}%</strong> of book.
          {topCell && (
            <> The largest single carrier×product cell is {topCell.carrier_name}{' '}
            {PRODUCT_LABELS[topCell.product_key] ?? topCell.product_key} at{' '}
            <strong>{topCellShare.toFixed(1)}%</strong>.</>
          )}
          {riskLevel === 'critical' && (
            <> A carrier pullback, comp change, or non-renewal in this carrier directly hits{' '}
            {topCarrierShare.toFixed(0)}% of revenue.</>
          )}
        </p>
      </div>

      {/* Diversification stat strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
      }}>
        <StatBlock label="Top carrier share" value={`${topCarrierShare.toFixed(1)}%`} subline={byCarrier[0]?.carrier_name} />
        <StatBlock label="Top product share" value={`${topProductShare.toFixed(1)}%`} subline={PRODUCT_LABELS[byProduct[0]?.product_key] ?? '—'} />
        <StatBlock label="Carriers to 80%" value={count80.toString()} subline={`of ${carrierCount} active carrier${carrierCount === 1 ? '' : 's'}`} />
      </div>

      {/* Charts row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 16,
      }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
            Premium share by carrier
          </h3>
          <ConcentrationPieChart
            data={byCarrier.map(c => ({ name: c.carrier_name, value: c.premium, share: c.premiumShare }))}
          />
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
            Premium share by product
          </h3>
          <ConcentrationPieChart
            data={byProduct.map(p => ({ name: PRODUCT_LABELS[p.product_key] ?? p.product_key, value: p.premium, share: p.premiumShare }))}
          />
        </div>
      </div>

      {/* Carrier × product matrix */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
          Carrier × product matrix
        </h3>
        <CarrierProductMatrix rows={byCarrierProduct} totalPremium={totalPremium} />
      </div>
    </div>
  );
}

function StatBlock({ label, value, subline }) {
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
      {subline && (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{subline}</div>
      )}
    </div>
  );
}
