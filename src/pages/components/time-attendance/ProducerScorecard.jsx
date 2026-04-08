// src/pages/components/time-attendance/ProducerScorecard.jsx
// Graded producer performance scorecard.
// Actuals: from revenue_entries (production) + RC call log (activity).
// Targets: from producer_performance_targets, editable by principal.

import { TrendingUp, TrendingDown, Award, Phone, Target } from 'lucide-react';
import { PRODUCER_DEFAULT_TARGETS } from '../../../hooks/useProducerTargets';

const GRADE_CONFIG = {
  A: { color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700', desc: 'Excellent' },
  B: { color: 'text-blue-400',    bg: 'bg-blue-900/20',    border: 'border-blue-700',    desc: 'On Track' },
  C: { color: 'text-amber-400',   bg: 'bg-amber-900/20',   border: 'border-amber-700',   desc: 'Needs Improvement' },
  D: { color: 'text-orange-400',  bg: 'bg-orange-900/20',  border: 'border-orange-700',  desc: 'Below Target' },
  F: { color: 'text-red-400',     bg: 'bg-red-900/20',     border: 'border-red-700',     desc: 'Critical' },
};

function calcGrade(vcItems, outbound, targets) {
  const t = { ...PRODUCER_DEFAULT_TARGETS, ...targets };

  // VC items grade (monthly — weight 60%)
  let vcGrade;
  if (vcItems >= t.grade_a_vc_items)      vcGrade = 5;
  else if (vcItems >= t.grade_b_vc_items)  vcGrade = 4;
  else if (vcItems >= t.grade_c_vc_items)  vcGrade = 3;
  else if (vcItems >= t.grade_c_vc_items * 0.7) vcGrade = 2;
  else                                     vcGrade = 1;

  // Outbound grade (weekly — weight 40%)
  let callGrade;
  if (outbound >= t.grade_a_outbound)      callGrade = 5;
  else if (outbound >= t.grade_b_outbound) callGrade = 4;
  else if (outbound >= t.grade_c_outbound) callGrade = 3;
  else if (outbound >= t.grade_c_outbound * 0.7) callGrade = 2;
  else                                     callGrade = 1;

  const composite = (vcGrade * 0.6) + (callGrade * 0.4);
  if (composite >= 4.5) return 'A';
  if (composite >= 3.5) return 'B';
  if (composite >= 2.5) return 'C';
  if (composite >= 1.5) return 'D';
  return 'F';
}

function MetricRow({ label, target, actual, unit = '', inverse = false, fmt }) {
  const a = typeof actual === 'number' ? actual : parseFloat(actual) || 0;
  const t = typeof target === 'number' ? target : parseFloat(target) || 0;
  const met = inverse ? a <= t : a >= t;
  const pct = t > 0 ? Math.min((a / t) * 100, 100) : 0;

  const display = fmt ? fmt(a) : `${typeof a === 'number' && !Number.isInteger(a) ? a.toFixed(1) : a}${unit}`;
  const targetDisplay = fmt ? fmt(t) : `${t}${unit}`;

  return (
    <tr className="hover:bg-qs-elevated transition-colors">
      <td className="px-4 py-3 text-sm text-qs-bright font-medium">{label}</td>
      <td className="px-4 py-3 text-sm text-qs-subtle">{targetDisplay}</td>
      <td className={`px-4 py-3 text-sm font-semibold ${met ? 'text-emerald-400' : 'text-red-400'}`}>
        {display}
      </td>
      <td className="px-4 py-3 w-24">
        <div className="h-1.5 bg-qs-elevated rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${met ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </td>
      <td className="px-4 py-3 w-8">
        {met
          ? <TrendingUp className="w-4 h-4 text-emerald-400" />
          : <TrendingDown className="w-4 h-4 text-red-400" />
        }
      </td>
    </tr>
  );
}

export default function ProducerScorecard({
  employeeName,
  targets,
  // Weekly call actuals (from RC call log / rc_performance_data)
  weeklyOutbound,
  weeklyTotalCalls,
  weeklyAvgPerDay,
  // Monthly production actuals (from revenue_entries filtered to current month)
  monthlyVcItems,
  monthlyPremium,
  monthlyPolicies,
  // Period labels
  weekLabel,
  monthLabel,
}) {
  const t = { ...PRODUCER_DEFAULT_TARGETS, ...targets };
  const grade = calcGrade(monthlyVcItems ?? 0, weeklyOutbound ?? 0, t);
  const gradeConfig = GRADE_CONFIG[grade];
  const fmt$ = (n) => `$${Math.round(n || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">

      {/* Grade Banner */}
      <div className={`flex items-center justify-between p-6 rounded-lg border-2 ${gradeConfig.bg} ${gradeConfig.border}`}>
        <div>
          <h3 className="text-lg font-semibold text-qs-bright">Producer Performance Grade</h3>
          <p className={`text-sm ${gradeConfig.color}`}>{gradeConfig.desc}</p>
          {employeeName && <p className="text-xs text-qs-subtle mt-1">{employeeName}</p>}
          <p className="text-xs text-qs-muted mt-0.5">
            Composite: 60% monthly production · 40% weekly call activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Award className={`w-8 h-8 ${gradeConfig.color}`} />
          <span className={`text-5xl font-bold ${gradeConfig.color}`}>{grade}</span>
        </div>
      </div>

      {/* Section A — Monthly Production */}
      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
          <Target className="w-5 h-5 text-primary-400" />
          <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">
            Section A — Production
          </h4>
          {monthLabel && (
            <span className="text-xs text-qs-muted ml-auto">{monthLabel}</span>
          )}
        </div>
        <table className="w-full">
          <thead className="bg-qs-elevated/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Actual</th>
              <th className="px-4 py-2 w-24" />
              <th className="px-4 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            <MetricRow
              label="VC Items (Month)"
              target={t.vc_items_monthly}
              actual={monthlyVcItems ?? 0}
              unit=" items"
            />
            {t.premium_monthly > 0 && (
              <MetricRow
                label="Premium Written (Month)"
                target={t.premium_monthly}
                actual={monthlyPremium ?? 0}
                fmt={fmt$}
              />
            )}
            <tr className="hover:bg-qs-elevated transition-colors">
              <td className="px-4 py-3 text-sm text-qs-bright font-medium">Policies Bound (Month)</td>
              <td className="px-4 py-3 text-sm text-qs-subtle">Track only</td>
              <td className="px-4 py-3 text-sm font-semibold text-qs-text">{monthlyPolicies ?? 0}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section B — Weekly Call Activity */}
      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary-400" />
          <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">
            Section B — Call Activity
          </h4>
          {weekLabel && (
            <span className="text-xs text-qs-muted ml-auto">{weekLabel}</span>
          )}
        </div>
        <table className="w-full">
          <thead className="bg-qs-elevated/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Actual</th>
              <th className="px-4 py-2 w-24" />
              <th className="px-4 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            <MetricRow
              label="Outbound Calls (Week)"
              target={t.outbound_calls_weekly}
              actual={weeklyOutbound ?? 0}
              unit=" calls"
            />
            <MetricRow
              label="Avg Calls / Day"
              target={t.avg_calls_per_day}
              actual={weeklyAvgPerDay ?? 0}
              unit="/day"
            />
            <tr className="hover:bg-qs-elevated transition-colors">
              <td className="px-4 py-3 text-sm text-qs-bright font-medium">Total Calls (Week)</td>
              <td className="px-4 py-3 text-sm text-qs-subtle">Track only</td>
              <td className="px-4 py-3 text-sm font-semibold text-qs-text">{weeklyTotalCalls ?? 0}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Grade thresholds reference */}
      <div className="bg-qs-card rounded-lg border border-qs-border p-4">
        <h4 className="text-sm font-semibold text-qs-bright mb-3">Grade Thresholds</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-qs-subtle uppercase font-medium mb-2">VC Items / Month</p>
            <div className="space-y-1">
              {[
                { grade: 'A', value: t.grade_a_vc_items, color: 'text-emerald-400' },
                { grade: 'B', value: t.grade_b_vc_items, color: 'text-blue-400' },
                { grade: 'C', value: t.grade_c_vc_items, color: 'text-amber-400' },
              ].map(({ grade: g, value, color }) => (
                <div key={g} className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${color}`}>{g}</span>
                  <span className="text-xs text-qs-dim">&ge; {value} items</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-qs-subtle uppercase font-medium mb-2">Outbound / Week</p>
            <div className="space-y-1">
              {[
                { grade: 'A', value: t.grade_a_outbound, color: 'text-emerald-400' },
                { grade: 'B', value: t.grade_b_outbound, color: 'text-blue-400' },
                { grade: 'C', value: t.grade_c_outbound, color: 'text-amber-400' },
              ].map(({ grade: g, value, color }) => (
                <div key={g} className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${color}`}>{g}</span>
                  <span className="text-xs text-qs-dim">&ge; {value} calls</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
