// src/pages/components/renewals/AiPerformanceDashboard.jsx
// AI Performance metrics tab — agent only.
// Shows volume, conversion, cost, and webhook health metrics from ai_call_log.

import { useState } from 'react';
import { BarChart3, DollarSign, PhoneCall, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { useAiCallLog, useWebhookHealth } from '../../../hooks/useAiCallLog';

const OUTCOME_LABELS = {
  confirmed: 'Confirmed',
  hesitant: 'Hesitant',
  shopping: 'Shopping',
  rate_shock_escalated: 'Rate Shock',
  callback_scheduled: 'Callback Scheduled',
  address_discrepancy: 'Address Issue',
  eft_lapse: 'EFT Lapse',
  out_of_scope_escalated: 'Out of Scope',
  opt_out_requested: 'Opt-Out',
  wrong_number: 'Wrong Number',
  third_party_answer: '3rd Party',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
};

const OUTCOME_COLORS = {
  confirmed:     { background: 'rgba(52,211,153,0.15)',  color: '#34D399' },
  hesitant:      { background: 'rgba(245,158,11,0.15)',  color: '#FBBF24' },
  shopping:      { background: 'rgba(249,115,22,0.15)',  color: '#FB923C' },
  escalated:     { background: 'rgba(239,68,68,0.15)',   color: '#F87171' },
  left_voicemail:{ background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
  no_answer:     { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
  wrong_number:  { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
  voicemail:     { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
};

const METRIC_COLORS = {
  blue:  { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)',  text: '#60A5FA' },
  green: { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  text: '#34D399' },
  amber: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  text: '#FBBF24' },
  gray:  { bg: 'var(--qs-elevated)',    border: 'var(--qs-border)',       text: 'var(--qs-dim)' },
};

function MetricCard({ label, value, subtext, color, icon: Icon }) {
  const c = METRIC_COLORS[color] || METRIC_COLORS.gray;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${c.border}`, padding: 16, background: c.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={14} style={{ color: c.text, opacity: 0.8 }} />
        <p style={{ fontSize: 12, fontWeight: 500, color: c.text, opacity: 0.85 }}>{label}</p>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: c.text }}>{value}</p>
      {subtext && <p style={{ fontSize: 11, color: c.text, opacity: 0.65, marginTop: 2 }}>{subtext}</p>}
    </div>
  );
}

export default function AiPerformanceDashboard({ agencyId }) {
  const [daysBack, setDaysBack] = useState(30);
  const { metrics, isLoading, error } = useAiCallLog(agencyId, daysBack);
  const { data: healthData } = useWebhookHealth(agencyId);

  if (isLoading) {
    return <div style={{ fontSize: 13, color: 'var(--qs-dim)', padding: '32px 0', textAlign: 'center' }}>Loading AI metrics...</div>;
  }

  if (error) {
    return <div style={{ fontSize: 13, color: '#F87171', padding: '16px 0' }}>Failed to load AI metrics: {error.message}</div>;
  }

  const orphanedCount = healthData?.orphaned?.length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <BarChart3 className="w-5 h-5" />
          AI Performance
        </h2>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDaysBack(d)}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: `1px solid ${daysBack === d ? 'var(--qs-info)' : 'var(--qs-border)'}`,
                background: daysBack === d ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
                color: daysBack === d ? 'var(--qs-info)' : 'var(--qs-dim)',
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Webhook health warning */}
      {orphanedCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
          <span style={{ color: '#FBBF24' }}>
            <strong>{orphanedCount}</strong> AI call{orphanedCount !== 1 ? 's' : ''} with no webhook response — check Bland.ai dashboard
          </span>
        </div>
      )}

      {/* Volume metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={PhoneCall}
          label="Total Calls"
          value={metrics.totalCalls}
          subtext={`${metrics.completedCalls} completed`}
          color="blue"
        />
        <MetricCard
          icon={CheckCircle}
          label="Confirmed Rate"
          value={`${metrics.confirmedRate}%`}
          subtext="Without human follow-up"
          color="green"
        />
        <MetricCard
          icon={TrendingUp}
          label="Warm Escalation"
          value={`${metrics.warmEscalationRate}%`}
          subtext="Callback confirmed"
          color="amber"
        />
        <MetricCard
          icon={DollarSign}
          label="Total Cost"
          value={`$${metrics.totalCost.toFixed(2)}`}
          subtext={`${metrics.totalMinutes} min | $${metrics.costPerConfirmed.toFixed(2)}/confirmed`}
          color="gray"
        />
      </div>

      {/* Consent capture */}
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 8 }}>Consent Capture Rate</h3>
        <div className="flex items-center gap-2">
          <div style={{ flex: 1, background: 'var(--qs-elevated)', borderRadius: 99, height: 10 }}>
            <div
              className="bg-blue-500 rounded-full h-3 transition-all"
              style={{ width: `${Math.min(metrics.consentCaptureRate, 100)}%`, height: 10, borderRadius: 99 }}
            />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{metrics.consentCaptureRate}%</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 4 }}>% of completed calls where consent was captured</p>
      </div>

      {/* Outcome distribution */}
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 12 }}>Outcome Distribution</h3>
        {Object.keys(metrics.outcomeDistribution).length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--qs-muted)' }}>No call data yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(metrics.outcomeDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([outcome, count]) => {
                const pct = metrics.completedCalls > 0 ? (count / metrics.completedCalls * 100).toFixed(1) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, minWidth: 100, ...(OUTCOME_COLORS[outcome] || { background: 'var(--qs-elevated)', color: 'var(--qs-dim)' }) }}>
                      {OUTCOME_LABELS[outcome] || outcome}
                    </span>
                    <div style={{ flex: 1, background: 'var(--qs-elevated)', borderRadius: 99, height: 6 }}>
                      <div
                        className="bg-primary-400 rounded-full h-2 transition-all"
                        style={{ width: `${pct}%`, height: 6, borderRadius: 99 }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--qs-dim)', minWidth: 60, textAlign: 'right' }}>{count} ({pct}%)</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
