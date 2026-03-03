// src/pages/components/time-attendance/TeamComparisonView.jsx
// Side-by-side team comparison table for all CS reps in a selected week.

import { useState, useMemo } from 'react';
import { Users, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { GRADE_CONFIG, calculateGrade, computeMetrics, DEFAULT_TARGETS } from '../../../config/csPerformanceDefaults';

function GradeBadge({ grade }) {
  const config = GRADE_CONFIG[grade] || GRADE_CONFIG.C;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${config.bg} ${config.color} ${config.border} border`}>
      {grade}
    </span>
  );
}

export default function TeamComparisonView({ teamData, onSelectEmployee }) {
  const [sortKey, setSortKey] = useState('grade');
  const [sortDir, setSortDir] = useState('desc');

  const rows = useMemo(() => {
    if (!teamData?.rcData) return [];

    return teamData.rcData.map((rc) => {
      const targets = teamData.targets?.[rc.employee_user_id] || DEFAULT_TARGETS;
      const metrics = computeMetrics(rc, 5);
      const grade = calculateGrade(rc.outbound_calls, metrics.answerRate, metrics.hasZeroCallDays, targets);

      // Count discrepancy flags (simplified — missed + low answer rate + high hold)
      let flagCount = 0;
      if (metrics.answerRate < (targets.answer_rate_pct || 95)) flagCount++;
      if ((rc.avg_hold_time_minutes || 0) > (targets.avg_hold_time_min || 2)) flagCount++;
      if (metrics.missedCallRate > (targets.missed_call_rate_pct || 5)) flagCount++;

      return {
        employeeId: rc.employee_user_id,
        name: rc.employee_name || rc.employee_user_id.substring(0, 8),
        grade,
        gradeNumeric: GRADE_CONFIG[grade]?.numeric || 0,
        outbound: rc.outbound_calls || 0,
        answerRate: metrics.answerRate,
        avgHandle: rc.avg_handle_time_minutes || 0,
        avgHold: rc.avg_hold_time_minutes || 0,
        missed: rc.missed_calls || 0,
        flagCount,
      };
    });
  }, [teamData]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'grade': aVal = a.gradeNumeric; bVal = b.gradeNumeric; break;
        case 'outbound': aVal = a.outbound; bVal = b.outbound; break;
        case 'answerRate': aVal = a.answerRate; bVal = b.answerRate; break;
        case 'avgHandle': aVal = a.avgHandle; bVal = b.avgHandle; break;
        case 'avgHold': aVal = a.avgHold; bVal = b.avgHold; break;
        case 'missed': aVal = a.missed; bVal = b.missed; break;
        case 'flags': aVal = a.flagCount; bVal = b.flagCount; break;
        default: aVal = a.gradeNumeric; bVal = b.gradeNumeric;
      }
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [rows, sortKey, sortDir]);

  // Team averages
  const teamAvg = useMemo(() => {
    if (rows.length === 0) return null;
    const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
    const avg = (key) => sum(key) / rows.length;
    const gradeAvg = avg('gradeNumeric');
    const gradeMap = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'F' };
    const nearestGrade = gradeMap[Math.round(gradeAvg)] || 'C';

    return {
      grade: nearestGrade,
      outbound: avg('outbound'),
      answerRate: avg('answerRate'),
      avgHandle: avg('avgHandle'),
      avgHold: avg('avgHold'),
      missed: avg('missed'),
    };
  }, [rows]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No team data</h2>
        <p className="text-gray-600">Upload RingCentral data for this week to see team comparison.</p>
      </div>
    );
  }

  const headers = [
    { key: 'name', label: 'Employee' },
    { key: 'grade', label: 'Grade' },
    { key: 'outbound', label: 'Outbound' },
    { key: 'answerRate', label: 'Answer Rate' },
    { key: 'avgHandle', label: 'Avg Handle' },
    { key: 'avgHold', label: 'Avg Hold' },
    { key: 'missed', label: 'Missed' },
    { key: 'flags', label: 'Flags' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Team Comparison</h4>
        <span className="text-xs text-gray-500 ml-auto">{rows.length} reps</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleSort(h.key)}
                  className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none"
                >
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    <ArrowUpDown className={`w-3 h-3 ${sortKey === h.key ? 'text-blue-600' : 'text-gray-300'}`} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((row) => (
              <tr
                key={row.employeeId}
                onClick={() => onSelectEmployee?.(row.employeeId)}
                className="hover:bg-blue-50/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
                <td className="px-4 py-3"><GradeBadge grade={row.grade} /></td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.outbound}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.answerRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.avgHandle.toFixed(1)} min</td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.avgHold.toFixed(1)} min</td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.missed}</td>
                <td className="px-4 py-3 text-sm">
                  {row.flagCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {row.flagCount}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Team Averages */}
          {teamAvg && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">Team Average</td>
                <td className="px-4 py-3"><GradeBadge grade={teamAvg.grade} /></td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{teamAvg.outbound.toFixed(0)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{teamAvg.answerRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{teamAvg.avgHandle.toFixed(1)} min</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{teamAvg.avgHold.toFixed(1)} min</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{teamAvg.missed.toFixed(0)}</td>
                <td className="px-4 py-3 text-sm text-gray-400">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
