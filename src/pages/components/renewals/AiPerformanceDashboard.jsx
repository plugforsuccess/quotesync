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
  confirmed: 'bg-green-100 text-green-800',
  hesitant: 'bg-yellow-100 text-yellow-800',
  shopping: 'bg-orange-100 text-orange-800',
  rate_shock_escalated: 'bg-red-100 text-red-800',
  callback_scheduled: 'bg-blue-100 text-blue-800',
  voicemail: 'bg-gray-100 text-gray-700',
  no_answer: 'bg-gray-100 text-gray-600',
};

function MetricCard({ icon: Icon, label, value, subtext, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <p className="text-sm font-medium opacity-80">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && <p className="text-xs opacity-60 mt-1">{subtext}</p>}
    </div>
  );
}

export default function AiPerformanceDashboard({ agencyId }) {
  const [daysBack, setDaysBack] = useState(30);
  const { metrics, isLoading, error } = useAiCallLog(agencyId, daysBack);
  const { data: healthData } = useWebhookHealth(agencyId);

  if (isLoading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading AI metrics...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600 py-4">Failed to load AI metrics: {error.message}</div>;
  }

  const orphanedCount = healthData?.orphaned?.length || 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          AI Performance
        </h2>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDaysBack(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                daysBack === d
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Webhook health warning */}
      {orphanedCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <span className="text-yellow-800">
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
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Consent Capture Rate</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-3">
            <div
              className="bg-blue-500 rounded-full h-3 transition-all"
              style={{ width: `${Math.min(metrics.consentCaptureRate, 100)}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700">{metrics.consentCaptureRate}%</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">% of completed calls where consent was captured</p>
      </div>

      {/* Outcome distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Outcome Distribution</h3>
        {Object.keys(metrics.outcomeDistribution).length === 0 ? (
          <p className="text-sm text-gray-400">No call data yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(metrics.outcomeDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([outcome, count]) => {
                const pct = metrics.completedCalls > 0 ? (count / metrics.completedCalls * 100).toFixed(1) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium min-w-[100px] ${OUTCOME_COLORS[outcome] || 'bg-gray-100 text-gray-700'}`}>
                      {OUTCOME_LABELS[outcome] || outcome}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-primary-400 rounded-full h-2 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 min-w-[60px] text-right">{count} ({pct}%)</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
