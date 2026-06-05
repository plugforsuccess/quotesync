// src/pages/components/retention/TerminationReasonTab.jsx
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { useChartTheme } from '../../../lib/chartTheme';
import { useAgencyDetail } from '../../../hooks/useAgencies';
import { useSopGoLiveDate } from '../../../hooks/useSopGoLiveDate';
import {
  useTerminationCategories,
  useTrendByCategory,
  buildMonthlySeries,
  aggregateByCategory,
  compareWithPrior,
} from '../../../hooks/useTerminationReasonAnalytics';
import TerminationReasonPDF from './TerminationReasonPDF';

const cardStyle = {
  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
  borderRadius: 12, padding: 20,
};

const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString();

export default function TerminationReasonTab({ agencyId }) {
  const [windowMonths, setWindowMonths] = useState(12);
  const [sinceLaunch, setSinceLaunch] = useState(false);
  const theme = useChartTheme();
  const { data: goLive } = useSopGoLiveDate(agencyId);

  const { data: agency } = useAgencyDetail(agencyId);
  const { data: categories = [] } = useTerminationCategories();
  const { data: currentRows = [], isLoading: loadingCurrent } = useTrendByCategory(agencyId, windowMonths, sinceLaunch ? goLive : null);
  const { data: priorRowsRaw = [], isLoading: loadingPrior } = useTrendByCategory(agencyId, windowMonths * 2);

  // Build series for current and prior windows
  const currentSeries = useMemo(
    () => buildMonthlySeries(currentRows, categories),
    [currentRows, categories]
  );

  // Prior period = the older half of (windowMonths * 2). Slice the series.
  const priorSeries = useMemo(() => {
    // No meaningful "prior period" in since-launch mode — drop the comparison.
    const rows = sinceLaunch ? [] : priorRowsRaw;
    const fullSeries = buildMonthlySeries(rows, categories);
    // fullSeries covers 2× the window. Take the first half (older).
    const half = Math.floor(fullSeries.length / 2);
    return fullSeries.slice(0, half);
  }, [priorRowsRaw, sinceLaunch, categories]);

  const currentAgg = useMemo(() => aggregateByCategory(currentSeries, categories), [currentSeries, categories]);
  const priorAgg   = useMemo(() => aggregateByCategory(priorSeries, categories),   [priorSeries, categories]);
  const compared   = useMemo(() => compareWithPrior(currentAgg, priorAgg),         [currentAgg, priorAgg]);

  // Headline figures
  const totalCount = currentAgg.reduce((s, c) => s + c.count, 0);
  const totalPremium = currentAgg.reduce((s, c) => s + c.premium, 0);
  const priorCount = priorAgg.reduce((s, c) => s + c.count, 0);
  const totalDeltaPct = priorCount > 0 ? ((totalCount - priorCount) / priorCount) * 100 : null;

  // Top preventable driver
  const topPreventable = compared
    .filter(c => c.action_class === 'preventable' && c.count > 0)
    .sort((a, b) => b.premium - a.premium)[0];

  const pdfProps = {
    agencyName: agency?.name ?? agency?.brand_name ?? 'Agency',
    windowMonths,
    compared,
    totalCount,
    totalPremium,
    totalDeltaPct,
    preventablePct: computePreventablePct(currentAgg),
    topPreventable,
    actionCopy: topPreventable ? actionCopy(topPreventable.code, topPreventable.deltaPct) : '',
  };

  if (loadingCurrent && loadingPrior) {
    return <div style={{ color: 'var(--qs-subtle)' }}>Loading reason analytics…</div>;
  }

  if (currentAgg.every(c => c.count === 0)) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
        <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
          No termination data yet. Upload an Allstate Termination Report on the Import tab.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Download + window selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <PDFDownloadLink
          document={<TerminationReasonPDF {...pdfProps} />}
          fileName={`termination-analysis-${new Date().toISOString().slice(0, 10)}.pdf`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', background: 'transparent', color: 'var(--qs-text)',
            fontSize: 13, fontWeight: 500, borderRadius: 6,
            border: '1px solid var(--qs-border)', cursor: 'pointer', textDecoration: 'none',
          }}
        >
          {({ loading }) => (
            <>
              <Download size={14} />
              {loading ? 'Generating…' : 'Download Report'}
            </>
          )}
        </PDFDownloadLink>

        <div style={{ display: 'flex', gap: 8 }}>
          {[3, 6, 12, 24].map(m => (
            <button
              key={m} type="button"
              onClick={() => { setSinceLaunch(false); setWindowMonths(m); }}
              style={{
                padding: '6px 12px',
                background: (!sinceLaunch && windowMonths === m) ? 'var(--qs-info)' : 'transparent',
                color: (!sinceLaunch && windowMonths === m) ? 'white' : 'var(--qs-text)',
                fontSize: 13, fontWeight: 500,
                border: '1px solid var(--qs-border)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {m === 24 ? '2 years' : `${m} months`}
            </button>
          ))}
          {goLive && (
            <button
              type="button"
              onClick={() => setSinceLaunch(v => !v)}
              title={`Clean SOP era — terminations on/after ${goLive}`}
              style={{
                padding: '6px 12px',
                background: sinceLaunch ? 'var(--qs-info)' : 'transparent',
                color: sinceLaunch ? 'white' : 'var(--qs-text)',
                fontSize: 13, fontWeight: 500,
                border: '1px solid var(--qs-border)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Since SOP launch
            </button>
          )}
        </div>
      </div>

      {/* Headline stat strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        <StatCard
          label="Terminations"
          value={totalCount.toLocaleString()}
          delta={totalDeltaPct}
          deltaLabel={totalDeltaPct != null ? `${totalDeltaPct >= 0 ? '+' : ''}${totalDeltaPct.toFixed(1)}% vs prior ${windowMonths}mo` : null}
          deltaDirection="bad-when-positive"
        />
        <StatCard
          label="Premium lost"
          value={fmt$(totalPremium)}
          subline={`Annualized exposure`}
        />
        <StatCard
          label="Top preventable driver"
          value={topPreventable?.display_name ?? '—'}
          subline={topPreventable ? `${topPreventable.count} terminations · ${fmt$(topPreventable.premium)}` : 'No preventable losses'}
          valueStyle={{ color: 'var(--qs-danger)', fontSize: 18 }}
        />
        <StatCard
          label="Preventable %"
          value={`${computePreventablePct(currentAgg).toFixed(0)}%`}
          subline="of terminations were preventable"
        />
      </div>

      {/* Action-class callout */}
      {topPreventable && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.07)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--qs-danger)', fontWeight: 700, marginBottom: 4 }}>
            🎯 What to focus on this week
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 6 }}>
            {topPreventable.display_name}: {topPreventable.count} terminations, {fmt$(topPreventable.premium)} in lost premium
          </h3>
          <p style={{ fontSize: 13, color: 'var(--qs-text)', margin: 0 }}>
            {actionCopy(topPreventable.code, topPreventable.deltaPct)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--qs-info)', marginTop: 8 }}>
            Seeing wrong categorizations?{' '}
            <a
              href="/agency/settings/termination-aliases"
              style={{ color: 'var(--qs-info)', textDecoration: 'underline' }}
            >
              Manage reason aliases →
            </a>
          </p>
        </div>
      )}

      {/* Stacked bar chart by month */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
          Terminations by month and category
        </h3>
        <MonthlyStackedChart series={currentSeries} categories={categories} theme={theme} />
      </div>

      {/* Category breakdown table */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
          By category — {windowMonths} months vs. prior {windowMonths} months
        </h3>
        <CategoryBreakdownTable compared={compared} totalCount={totalCount} totalPremium={totalPremium} />
      </div>
    </div>
  );
}

function StatCard({ label, value, subline, delta, deltaLabel, deltaDirection, valueStyle }) {
  const deltaColor =
    delta == null ? 'var(--qs-subtle)' :
    deltaDirection === 'bad-when-positive'
      ? (delta > 0 ? 'var(--qs-danger)' : delta < 0 ? 'var(--qs-success)' : 'var(--qs-subtle)')
      : (delta > 0 ? 'var(--qs-success)' : delta < 0 ? 'var(--qs-danger)' : 'var(--qs-subtle)');

  return (
    <div style={{
      background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        color: 'var(--qs-subtle)', fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)',
        marginTop: 4, lineHeight: 1.1, ...valueStyle,
      }}>{value}</div>
      {deltaLabel && (
        <div style={{ fontSize: 12, color: deltaColor, marginTop: 4, fontWeight: 500 }}>
          {deltaLabel}
        </div>
      )}
      {subline && !deltaLabel && (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{subline}</div>
      )}
    </div>
  );
}

function MonthlyStackedChart({ series, categories, theme }) {
  // Recharts wants array-of-objects: { month, [code1]: count, [code2]: count, ... }
  const data = series.map(m => {
    const row = { month: formatMonthLabel(m.month) };
    for (const cat of categories) {
      row[cat.code] = m.byCategory[cat.code]?.count ?? 0;
    }
    return row;
  });

  if (data.length === 0) {
    return <div style={{ color: 'var(--qs-subtle)' }}>No data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.structural.grid} />
        <XAxis dataKey="month" tick={{ fill: theme.structural.axisTick, fontSize: 11 }} />
        <YAxis tick={{ fill: theme.structural.axisTick, fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={theme.tooltipStyle}
          labelStyle={theme.tooltipLabelStyle}
          itemStyle={theme.tooltipItemStyle}
          cursor={theme.tooltipCursor}
          formatter={(value, name) => {
            const cat = categories.find(c => c.code === name);
            return [value, cat?.display_name ?? name];
          }}
        />
        <Legend
          formatter={(value) => {
            const cat = categories.find(c => c.code === value);
            return <span style={{ color: theme.structural.tooltipText, fontSize: 11 }}>{cat?.display_name ?? value}</span>;
          }}
        />
        {categories.map(cat => (
          <Bar key={cat.code} dataKey={cat.code} stackId="a" fill={cat.color_token} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryBreakdownTable({ compared, totalCount, totalPremium }) {
  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--qs-subtle)', fontWeight: 600,
  };
  const tdStyle = { padding: '10px 12px', color: 'var(--qs-text)', fontSize: 13 };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--qs-elevated)' }}>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Action class</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Premium</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Share</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>vs prior</th>
          </tr>
        </thead>
        <tbody>
          {compared.filter(c => c.count > 0 || c.priorCount > 0).map(c => {
            const deltaColor = c.deltaPct == null
              ? 'var(--qs-subtle)'
              : c.deltaPct > 0 ? 'var(--qs-danger)' : c.deltaPct < 0 ? 'var(--qs-success)' : 'var(--qs-subtle)';
            return (
              <tr key={c.code} style={{ borderTop: '1px solid var(--qs-border)' }}>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                    background: c.color_token, marginRight: 8, verticalAlign: 'middle',
                  }} />
                  <strong style={{ color: 'var(--qs-bright)' }}>{c.display_name}</strong>
                </td>
                <td style={tdStyle}>
                  <ActionClassBadge actionClass={c.action_class} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{c.count}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt$(c.premium)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{c.premiumShare.toFixed(1)}%</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: deltaColor, fontWeight: 600 }}>
                  {c.deltaPct == null
                    ? '—'
                    : `${c.deltaPct >= 0 ? '+' : ''}${c.deltaPct.toFixed(0)}%`}
                </td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid var(--qs-border)', background: 'var(--qs-elevated)' }}>
            <td style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
            <td style={tdStyle}></td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{totalCount}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt$(totalPremium)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>100%</td>
            <td style={tdStyle}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ActionClassBadge({ actionClass }) {
  const config = {
    preventable: { label: 'Preventable', color: 'var(--qs-danger)', bg: 'rgba(239, 68, 68, 0.10)' },
    partial:     { label: 'Partial',     color: 'var(--qs-warning)', bg: 'rgba(245, 158, 11, 0.12)' },
    external:    { label: 'External',    color: 'var(--qs-subtle)', bg: 'var(--qs-elevated)' },
  }[actionClass] ?? { label: actionClass, color: 'var(--qs-subtle)', bg: 'var(--qs-elevated)' };

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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatMonthLabel(yyyymm) {
  if (!yyyymm) return '';
  const [year, month] = yyyymm.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function computePreventablePct(agg) {
  const preventable = agg.filter(c => c.action_class === 'preventable').reduce((s, c) => s + c.count, 0);
  const total = agg.reduce((s, c) => s + c.count, 0);
  if (total === 0) return 0;
  return (preventable / total) * 100;
}

function actionCopy(code, deltaPct) {
  const trend = deltaPct == null
    ? '' : deltaPct > 10
      ? ` Up ${deltaPct.toFixed(0)}% vs prior period — this is getting worse.`
      : deltaPct < -10
      ? ` Down ${Math.abs(deltaPct).toFixed(0)}% vs prior period — recent intervention is working.`
      : '';

  const playbook = {
    price:        'Identify accounts within 30 days of renewal where premium increased >10%. Proactively remarket before they shop.',
    non_payment:  'Audit your bill-pay follow-up cadence. Every NSF / late notice should trigger a same-day call. EFT signup at point of sale prevents most of this.',
    switched:     'Run a save audit on the last 30 days of switched terminations. Were they contacted before bind? If not, your retention process broke upstream.',
    service:      'Review the specific complaints. Pattern matches across producers signal training gaps; isolated complaints signal individual coaching needs.',
  };

  return (playbook[code] ?? 'Review the underlying cases and identify the intervention point that would have prevented the loss.') + trend;
}
