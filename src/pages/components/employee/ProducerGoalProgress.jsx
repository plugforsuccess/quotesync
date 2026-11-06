// src/pages/components/employee/ProducerGoalProgress.jsx
// Producer-facing monthly premium goal tracker for My Scorecard.
// Mirrors the agency revenue "zoom" gauge, scoped to the logged-in producer:
// their monthly premium goal (set by the principal in Planning) vs their
// month-to-date new-business production, with a pace projection.
//
// Producers run their book in Allstate's CRM, so this is a read-only progress
// mirror — it never writes production, only reflects it back against the goal.

import { T } from '../../../components/SiteCopy';
import { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown } from 'lucide-react';
import { useProducerTargets } from '../../../hooks/useProducerTargets';
import { useMyProduction } from '../../../hooks/useMyProduction';
import { usePromoters, usePromoterScans, usePartnerRules, useFloorSettings } from '../../../hooks/useRateChecks';
import { rulesFrom, currentMonth } from '../rate-checks/partnerPay';
import { activations, activatedCount } from '../rate-checks/partnerRecruiting';

const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;

// Schedule B partner floor: partners this producer recruited who signed the agreement
// and sent a qualified household, this month, against the agency's floor.
function PartnerFloor({ orgId, userId }) {
  const { data: promoters = [] } = usePromoters(orgId);
  const { data: scans = [] } = usePromoterScans(orgId);
  const { data: rulesRow } = usePartnerRules(orgId);
  const { data: floors } = useFloorSettings(orgId);
  const floor = floors?.partners_floor ?? 2;
  const count = useMemo(
    () => activatedCount(activations(promoters, scans, Date.now(), rulesFrom(rulesRow)), userId, currentMonth()),
    [promoters, scans, rulesRow, userId]
  );
  if (!userId || !floor) return null;
  const met = count >= floor;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 4 }}>
        <span><T k="scorecard.partners">Partners Activated</T></span>
        <span style={{ fontFamily: "'DM Mono', monospace", color: met ? 'var(--qs-success)' : 'var(--qs-text)' }}>{count} / {floor}</span>
      </div>
      <Bar pct={count / floor} color={met ? 'var(--qs-success)' : 'var(--qs-info)'} />
    </div>
  );
}

// Mon–Fri business days elapsed (incl. today) and total for the current month.
function businessDays() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let total = 0;
  let elapsed = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(y, m, d).getDay();
    if (wd >= 1 && wd <= 5) {
      total += 1;
      if (d <= today) elapsed += 1;
    }
  }
  return { total, elapsed: Math.max(elapsed, 1), remaining: Math.max(total - elapsed, 0) };
}

function Ring({ pct, color, label, sub }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const dash = Math.min(Math.max(pct, 0), 1) * C;
  return (
    <div style={{ position: 'relative', width: 136, height: 136, flexShrink: 0 }}>
      <svg width="136" height="136">
        <circle cx="68" cy="68" r={R} fill="none" stroke="var(--qs-elevated)" strokeWidth="12" />
        <circle
          cx="68" cy="68" r={R} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 68 68)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: 'var(--qs-elevated)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(Math.max(pct, 0), 1) * 100}%`,
        borderRadius: 4, background: color, transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

function Sparkline({ values, width = 120, height = 28 }) {
  const max = Math.max(...values, 1);
  const n = values.length || 1;
  const barW = width / n;
  return (
    <svg width={width} height={height} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        return (
          <rect
            key={i} x={i * barW + 0.5} y={height - h}
            width={Math.max(1, barW - 2)} height={h} rx="1"
            fill="var(--qs-info)" opacity={i === n - 1 ? 1 : 0.4}
          />
        );
      })}
    </svg>
  );
}

export default function ProducerGoalProgress({ orgId, employee, compact = false }) {
  const authUserId = employee?.auth_user_id || employee?.id;
  const { data: targets } = useProducerTargets(orgId, authUserId);
  const { data: series, isLoading } = useMyProduction(orgId, employee, { months: 6 });

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    []
  );

  const mtd = series?.mtd || { premium: 0, items: 0, policies: 0 };
  const spark = (series?.months || []).map((m) => m.premium);
  const premiumGoal = Number(targets?.premium_monthly) || 0;
  const itemsGoal = Number(targets?.vc_items_monthly) || 0;

  const { total, elapsed, remaining } = businessDays();
  const projected = (mtd.premium / elapsed) * total;
  const pct = premiumGoal > 0 ? mtd.premium / premiumGoal : 0;
  const projectedPct = premiumGoal > 0 ? projected / premiumGoal : 0;
  const onPace = projectedPct >= 1;
  const ringColor = pct >= 1 ? 'var(--qs-success)' : onPace ? 'var(--qs-info)' : 'var(--qs-warning)';

  const card = {
    background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
    borderRadius: 12, padding: 24,
  };

  // Compact banner — a slim one-row progress strip for Today / Cross-Sell.
  if (compact) {
    return (
      <div style={{ ...card, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <Target className="w-4 h-4" style={{ color: 'var(--qs-info)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)' }}><T k="pages.components.employee.producergoalprogress.1b8e91">Production Goal</T></span>
          </div>
          {premiumGoal > 0 ? (
            <>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>
                    {money(mtd.premium)} <T k="pages.components.employee.producergoalprogress.8bf885">of</T> {money(premiumGoal)}
                  </span>
                  <span style={{ color: ringColor, fontWeight: 700 }}>{Math.round(pct * 100)}%</span>
                </div>
                <Bar pct={pct} color={ringColor} />
              </div>
              <span style={{ fontSize: 12, color: onPace ? 'var(--qs-success)' : 'var(--qs-warning)', fontWeight: 600, flexShrink: 0 }}>
                {onPace ? 'On pace' : 'Behind'} · {remaining}<T k="pages.components.employee.producergoalprogress.d26339">d left</T>
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--qs-dim)', marginLeft: 'auto' }}>
              {money(mtd.premium)} <T k="pages.components.employee.producergoalprogress.308de7">written this month · no goal set yet</T>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Target className="w-5 h-5" style={{ color: 'var(--qs-info)' }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>
          <T k="pages.components.employee.producergoalprogress.1b8e91">Production Goal</T>
        </h3>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-subtle)' }}>{monthLabel}</span>
      </div>

      {premiumGoal <= 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--qs-bright)', fontFamily: "'DM Mono', monospace" }}>
              {money(mtd.premium)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2 }}>
              <T k="pages.components.employee.producergoalprogress.c64be1">written this month ·</T> {mtd.items} <T k="pages.components.employee.producergoalprogress.366b47">VC items ·</T> {mtd.policies} <T k="pages.components.employee.producergoalprogress.94422f">policies</T>
            </div>
          </div>
          <div style={{
            marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)', maxWidth: 260, textAlign: 'right',
          }}>
            <T k="pages.components.employee.producergoalprogress.fd33e6">No monthly premium goal set yet. Your principal can set one in Planning → Production Goals.</T>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <Ring
            pct={pct}
            color={ringColor}
            label={`${Math.round(pct * 100)}%`}
            sub={`of ${money(premiumGoal)}`}
          />

          <div style={{ flex: 1, minWidth: 220 }}>
            {/* Premium written / remaining */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--qs-bright)', fontFamily: "'DM Mono', monospace" }}>
                {money(mtd.premium)}
              </span>
              <span style={{ fontSize: 14, color: 'var(--qs-subtle)' }}>
                <T k="pages.components.employee.producergoalprogress.8bf885">of</T> {money(premiumGoal)}
              </span>
              {pct < 1 && (
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--qs-dim)' }}>
                  {money(premiumGoal - mtd.premium)} <T k="pages.components.employee.producergoalprogress.f8d7aa">to go</T>
                </span>
              )}
            </div>
            <Bar pct={pct} color={ringColor} />

            {/* Pace projection */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              {onPace
                ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--qs-success)' }} />
                : <TrendingDown className="w-4 h-4" style={{ color: 'var(--qs-warning)' }} />}
              <span style={{ fontSize: 13, color: onPace ? 'var(--qs-success)' : 'var(--qs-warning)', fontWeight: 600 }}>
                {onPace ? 'On pace' : 'Behind pace'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
                <T k="pages.components.employee.producergoalprogress.09e397">· projected</T> {money(projected)} ({Math.round(projectedPct * 100)}%) · {remaining} <T k="pages.components.employee.producergoalprogress.b101dd">workday</T>{remaining === 1 ? '' : 's'} <T k="pages.components.employee.producergoalprogress.811882">left</T>
              </span>
            </div>

            {/* VC items secondary goal */}
            {itemsGoal > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 4 }}>
                  <span><T k="pages.components.employee.producergoalprogress.7aceec">VC items</T></span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--qs-text)' }}>
                    {mtd.items} / {itemsGoal}
                  </span>
                </div>
                <Bar pct={itemsGoal > 0 ? mtd.items / itemsGoal : 0} color="var(--qs-info)" />
              </div>
            )}
          </div>

          {/* Trailing trend */}
          <div style={{ textAlign: 'center' }}>
            <Sparkline values={spark} />
            <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 4 }}><T k="pages.components.employee.producergoalprogress.f742dd">6-mo premium</T></div>
          </div>
        </div>
      )}

      <PartnerFloor orgId={orgId} userId={authUserId} />

      {isLoading && (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 12 }}><T k="pages.components.employee.producergoalprogress.8817c9">Loading production…</T></div>
      )}
    </div>
  );
}
