// src/pages/components/book/BlastRadiusResults.jsx
import { useMemo } from 'react';
import { getBuyoutTerms, estimateBookValue } from '../../../lib/carrierBuyoutTerms';

export default function BlastRadiusResults({ scenario, aggregates }) {
  const result = useMemo(() => computeBlastRadius(scenario, aggregates), [scenario, aggregates]);

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 16 }}>
        Result
      </h3>

      {/* Headline figure */}
      <div style={{
        padding: 20, marginBottom: 16,
        background: result.headlineBg, border: `1px solid ${result.headlineBorder}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--qs-subtle)', fontWeight: 600 }}>
          {result.headlineLabel}
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, color: result.headlineColor, marginTop: 4, lineHeight: 1.1 }}>
          {result.headlineValue}
        </div>
        {result.headlineSubline && (
          <div style={{ fontSize: 13, color: 'var(--qs-text)', marginTop: 8 }}>
            {result.headlineSubline}
          </div>
        )}
      </div>

      {/* Detail rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {result.detailRows.map(row => (
          <DetailRow key={row.label} {...row} />
        ))}
      </div>

      {/* Carrier-specific note */}
      {result.contextNote && (
        <div style={{
          marginTop: 16, padding: 12,
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--qs-subtle)', fontWeight: 600 }}>
            Context
          </div>
          <p style={{ fontSize: 13, color: 'var(--qs-text)', marginTop: 4, marginBottom: 0 }}>
            {result.contextNote}
          </p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px',
      background: 'var(--qs-elevated)',
      border: '1px solid var(--qs-border)',
      borderRadius: 8,
    }}>
      <span style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--qs-bright)' }}>
        {value}
      </span>
    </div>
  );
}

// ── Scenario math ─────────────────────────────────────────────────────────

function computeBlastRadius(scenario, aggregates) {
  const carrier = aggregates.byCarrier.find(c => c.carrier_code === scenario.carrierCode);
  if (!carrier) {
    return defaultResult('Select a carrier to see impact.');
  }

  const totalCommission = aggregates.totalCommission;
  const carrierCommission = carrier.commission;
  const carrierPremium = carrier.premium;

  if (scenario.type === 'comp_cut') {
    const pctChange = scenario.compChangePct / 100;
    const dollarChange = carrierCommission * pctChange;
    const newTotalCommission = totalCommission + dollarChange;
    const totalPctChange = totalCommission > 0 ? (dollarChange / totalCommission) * 100 : 0;

    return {
      headlineLabel: 'Annual commission change',
      headlineValue: `${dollarChange >= 0 ? '+' : ''}$${Math.round(dollarChange).toLocaleString()}`,
      headlineColor: dollarChange >= 0 ? 'var(--qs-success)' : 'var(--qs-danger)',
      headlineBg: dollarChange >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'var(--qs-danger-subtle)',
      headlineBorder: dollarChange >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'var(--qs-danger-border)',
      headlineSubline: `${totalPctChange >= 0 ? '+' : ''}${totalPctChange.toFixed(1)}% of total agency commission`,
      detailRows: [
        { label: `${carrier.carrier_name} current commission`, value: `$${Math.round(carrierCommission).toLocaleString()}` },
        { label: `Cut applied`, value: `${scenario.compChangePct}%` },
        { label: `New ${carrier.carrier_name} commission`, value: `$${Math.round(carrierCommission + dollarChange).toLocaleString()}` },
        { label: `Agency total commission (new)`, value: `$${Math.round(newTotalCommission).toLocaleString()}` },
      ],
      contextNote: 'Comp cuts apply at next plan year. Renewal rate is typically unaffected; new business rate cuts compound over 2–3 years as the book turns over.',
    };
  }

  if (scenario.type === 'carrier_exit') {
    const retention = scenario.retentionPct / 100;
    const retainedPremium = carrierPremium * retention;
    const lostPremium = carrierPremium - retainedPremium;
    const lostCommission = carrierCommission * (1 - retention);
    const remainingCommission = carrierCommission - lostCommission;
    const totalPctImpact = totalCommission > 0 ? (lostCommission / totalCommission) * 100 : 0;

    return {
      headlineLabel: 'Annual commission lost',
      headlineValue: `-$${Math.round(lostCommission).toLocaleString()}`,
      headlineColor: 'var(--qs-danger)',
      headlineBg: 'var(--qs-danger-subtle)',
      headlineBorder: 'var(--qs-danger-border)',
      headlineSubline: `${totalPctImpact.toFixed(1)}% of total agency commission`,
      detailRows: [
        { label: `${carrier.carrier_name} premium at risk`, value: `$${Math.round(carrierPremium).toLocaleString()}` },
        { label: `Premium retained (re-written)`, value: `$${Math.round(retainedPremium).toLocaleString()}` },
        { label: `Premium lost`, value: `$${Math.round(lostPremium).toLocaleString()}` },
        { label: `Commission retained`, value: `$${Math.round(remainingCommission).toLocaleString()}` },
        { label: `Commission lost`, value: `-$${Math.round(lostCommission).toLocaleString()}`, color: 'var(--qs-danger)' },
      ],
      contextNote: `Retention through a forced re-write to a replacement carrier typically lands in the 50–80% range. Higher retention requires existing relationships (re-quotes faster) and same-state appointed alternatives.`,
    };
  }

  if (scenario.type === 'forced_termination') {
    const terms = getBuyoutTerms(scenario.carrierCode);
    const buyoutValue = estimateBookValue(carrierCommission, scenario.carrierCode, scenario.buyoutVariant);
    const ongoingLost = carrierCommission;  // 100% of ongoing commission stops

    return {
      headlineLabel: 'Estimated buyout payout',
      headlineValue: `$${Math.round(buyoutValue).toLocaleString()}`,
      headlineColor: 'var(--qs-warning)',
      headlineBg: 'var(--qs-warning-subtle)',
      headlineBorder: 'var(--qs-warning-border)',
      headlineSubline: `One-time. ${terms.tppMultiplierTypical}× typical multiplier on trailing 12mo commission.`,
      detailRows: [
        { label: `${carrier.carrier_name} trailing 12mo commission`, value: `$${Math.round(carrierCommission).toLocaleString()}` },
        { label: `Multiplier (${scenario.buyoutVariant})`, value: `${carrierCommission > 0 ? (buyoutValue / carrierCommission).toFixed(2) : '0.00'}×` },
        { label: `One-time payout`, value: `$${Math.round(buyoutValue).toLocaleString()}` },
        { label: `Ongoing commission lost (yr 1)`, value: `-$${Math.round(ongoingLost).toLocaleString()}`, color: 'var(--qs-danger)' },
        { label: `Non-compete window`, value: terms.hasNonCompete ? `${terms.nonCompeteYears} year(s)` : 'None', color: terms.hasNonCompete ? 'var(--qs-danger)' : 'var(--qs-success)' },
        { label: `Net year-1 (payout − lost comm)`, value: `${buyoutValue - ongoingLost >= 0 ? '+' : ''}$${Math.round(buyoutValue - ongoingLost).toLocaleString()}` },
      ],
      contextNote: `${terms.structureNote} Multipliers are ranges, not guarantees. ${terms.sourceNote}`,
    };
  }

  return defaultResult('Unknown scenario type');
}

function defaultResult(message) {
  return {
    headlineLabel: 'No result',
    headlineValue: '—',
    headlineColor: 'var(--qs-subtle)',
    headlineBg: 'var(--qs-elevated)',
    headlineBorder: 'var(--qs-border)',
    headlineSubline: message,
    detailRows: [],
    contextNote: null,
  };
}
