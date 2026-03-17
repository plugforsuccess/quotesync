// src/pages/components/time-attendance/TeamComparisonView.jsx
// Role-aware team comparison table. Supports services (full scorecard),
// producers (outbound effort), and a combined "all" view.

import { useState, useMemo } from 'react';
import { Users, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { GRADE_CONFIG, calculateGrade, computeMetrics, DEFAULT_TARGETS } from '../../../config/staffPerformanceDefaults';

// ── Role labels ─────────────────────────────────────────────────────────────

const ROLE_LABELS = { service: 'Service', sales: 'Sales', admin: 'Admin' };

// ── Column configurations per role filter ───────────────────────────────────

const SERVICE_COLUMNS = [
  { key: 'name', label: 'Employee', sortable: true },
  { key: 'grade', label: 'Grade', sortable: true },
  { key: 'outbound', label: 'Outbound', sortable: true },
  { key: 'answerRate', label: 'Answer Rate', sortable: true, format: 'pct' },
  { key: 'avgHandle', label: 'Avg Handle', sortable: true, format: 'time' },
  { key: 'avgHold', label: 'Avg Hold', sortable: true, format: 'time' },
  { key: 'missed', label: 'Missed', sortable: true },
  { key: 'flags', label: 'Flags', sortable: true },
];

const TEAM_COLUMNS = {
  service: SERVICE_COLUMNS,
  service_inbound: SERVICE_COLUMNS,
  service_outbound: SERVICE_COLUMNS,
  sales: [
    { key: 'name', label: 'Employee', sortable: true },
    { key: 'outbound', label: 'Outbound', sortable: true },
    { key: 'avgCallsDay', label: 'Avg Calls/Day', sortable: true, format: 'decimal' },
    { key: 'totalCalls', label: 'Total Calls', sortable: true },
    { key: 'inbound', label: 'Inbound', sortable: true },
    { key: 'missed', label: 'Missed', sortable: true },
    { key: 'avgHandleOut', label: 'Avg Handle (Out)', sortable: true, format: 'time' },
  ],
  all: [
    { key: 'name', label: 'Employee', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'outbound', label: 'Outbound', sortable: true },
    { key: 'totalCalls', label: 'Total Calls', sortable: true },
    { key: 'avgCallsDay', label: 'Avg Calls/Day', sortable: true, format: 'decimal' },
    { key: 'missed', label: 'Missed', sortable: true },
    { key: 'grade', label: 'Grade', sortable: true, roleSpecific: 'service' },
  ],
};

const DEFAULT_SORT = {
  service: { key: 'grade', dir: 'desc' },
  service_inbound: { key: 'grade', dir: 'desc' },
  service_outbound: { key: 'grade', dir: 'desc' },
  sales: { key: 'outbound', dir: 'desc' },
  all: { key: 'role', dir: 'asc' },
};

// ── GradeBadge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }) {
  if (!grade || grade === '—') {
    return <span className="text-qs-muted">—</span>;
  }
  const config = GRADE_CONFIG[grade] || GRADE_CONFIG.C;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${config.bg} ${config.color} ${config.border} border`}>
      {grade}
    </span>
  );
}

// ── Cell renderer ───────────────────────────────────────────────────────────

function CellValue({ col, row }) {
  const val = row[col.key];

  // Role-specific columns show dash for non-matching roles
  if (col.roleSpecific && row.roleType !== col.roleSpecific) {
    return <span className="text-qs-muted">—</span>;
  }

  if (col.key === 'grade') return <GradeBadge grade={val} />;

  if (col.key === 'role') {
    return <span className="text-sm text-qs-text">{ROLE_LABELS[val] || val}</span>;
  }

  if (col.key === 'flags') {
    return val > 0 ? (
      <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {val}
      </span>
    ) : (
      <span className="text-qs-muted">—</span>
    );
  }

  if (col.format === 'pct') {
    return <span className="text-sm text-qs-text">{isFinite(val) ? `${val.toFixed(1)}%` : '—'}</span>;
  }
  if (col.format === 'time') {
    return <span className="text-sm text-qs-text">{(val || 0).toFixed(1)} min</span>;
  }
  if (col.format === 'decimal') {
    return <span className="text-sm text-qs-text">{(val || 0).toFixed(1)}</span>;
  }

  if (col.key === 'name') {
    return <span className="text-sm font-medium text-qs-bright">{val}</span>;
  }

  return <span className="text-sm text-qs-text">{val ?? '—'}</span>;
}

// ── Average cell renderer ───────────────────────────────────────────────────

function AvgCellValue({ col, teamAvg }) {
  const val = teamAvg[col.key];

  if (col.key === 'name') {
    return <span className="text-sm font-semibold text-qs-text">Team Average</span>;
  }
  if (col.key === 'role') {
    return <span className="text-sm text-qs-muted">—</span>;
  }
  if (col.key === 'grade') {
    return val ? <GradeBadge grade={val} /> : <span className="text-qs-muted">—</span>;
  }
  if (col.key === 'flags') {
    return <span className="text-sm text-qs-muted">—</span>;
  }
  if (col.format === 'pct') {
    return <span className="text-sm font-semibold text-qs-text">{isFinite(val) ? `${val.toFixed(1)}%` : '—'}</span>;
  }
  if (col.format === 'time') {
    return <span className="text-sm font-semibold text-qs-text">{(val || 0).toFixed(1)} min</span>;
  }
  if (col.format === 'decimal') {
    return <span className="text-sm font-semibold text-qs-text">{(val || 0).toFixed(1)}</span>;
  }

  return <span className="text-sm font-semibold text-qs-text">{typeof val === 'number' ? val.toFixed(0) : (val ?? '—')}</span>;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TeamComparisonView({ teamData, roleFilter = 'service_inbound', onSelectEmployee }) {
  const defaultSort = DEFAULT_SORT[roleFilter] || DEFAULT_SORT.service;
  const [sortKey, setSortKey] = useState(defaultSort.key);
  const [sortDir, setSortDir] = useState(defaultSort.dir);
  const [prevRoleFilter, setPrevRoleFilter] = useState(roleFilter);

  // Reset sort when role filter changes
  if (roleFilter !== prevRoleFilter) {
    const newDefault = DEFAULT_SORT[roleFilter] || DEFAULT_SORT.service;
    setSortKey(newDefault.key);
    setSortDir(newDefault.dir);
    setPrevRoleFilter(roleFilter);
  }

  const columns = TEAM_COLUMNS[roleFilter] || TEAM_COLUMNS.service;

  const rows = useMemo(() => {
    if (!teamData?.rcData) return [];
    const employeesMap = teamData.employees || {};

    return teamData.rcData
      .map((rc) => {
        const emp = employeesMap[rc.employee_user_id];
        const empRoles = emp?.roles || [];
        const empRoleType = empRoles[0] || 'service';

        // Filter by role — match new split service roles
        if (roleFilter !== 'all') {
          if (!empRoles.includes(roleFilter)) return null;
        }

        const targets = teamData.targets?.[rc.employee_user_id] || DEFAULT_TARGETS;
        const metrics = computeMetrics(rc, 5);

        // Grade only for service reps (any service role)
        const isServiceRep = empRoles.some(r => r === 'service_inbound' || r === 'service_outbound' || r === 'service');
        const grade = isServiceRep
          ? calculateGrade(rc.outbound_calls, metrics.answerRate, metrics.hasZeroCallDays, targets)
          : null;

        // Discrepancy flags — only for services
        let flagCount = 0;
        if (isServiceRep) {
          if (metrics.answerRate < (targets.answer_rate_pct || 95)) flagCount++;
          if ((rc.avg_hold_time_minutes || 0) > (targets.avg_hold_time_min || 2)) flagCount++;
          if (metrics.missedCallRate > (targets.missed_call_rate_pct || 5)) flagCount++;
        }

        const empName = emp
          ? `${emp.preferred_name || emp.first_name} ${emp.last_name}`
          : (rc.employee_name || rc.employee_user_id.substring(0, 8));

        return {
          employeeId: rc.employee_user_id,
          roleType: empRoleType,
          name: empName,
          grade: grade || '—',
          gradeNumeric: grade ? (GRADE_CONFIG[grade]?.numeric || 0) : 0,
          outbound: rc.outbound_calls || 0,
          answerRate: metrics.answerRate,
          avgHandle: rc.avg_handle_time_minutes || 0,
          avgHold: rc.avg_hold_time_minutes || 0,
          missed: rc.missed_calls || 0,
          flags: flagCount,
          totalCalls: rc.total_calls || 0,
          inbound: rc.inbound_calls || 0,
          avgCallsDay: rc.avg_calls_per_day || 0,
          avgHandleOut: rc.avg_handle_time_out_minutes || 0,
          role: empRoleType,
        };
      })
      .filter(Boolean);
  }, [teamData, roleFilter]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      // Special cases
      if (sortKey === 'grade') { aVal = a.gradeNumeric; bVal = b.gradeNumeric; }
      if (sortKey === 'name') { aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });
  }, [rows, sortKey, sortDir]);

  // Team averages
  const teamAvg = useMemo(() => {
    if (rows.length === 0) return null;
    const avg = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length;

    // Grade average only makes sense for services
    const serviceRows = rows.filter((r) =>
      ['service', 'service_inbound', 'service_outbound'].includes(r.roleType)
    );
    let gradeLabel = null;
    if (serviceRows.length > 0) {
      const gradeAvg = serviceRows.reduce((s, r) => s + r.gradeNumeric, 0) / serviceRows.length;
      const gradeMap = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'F' };
      gradeLabel = gradeMap[Math.round(gradeAvg)] || 'C';
    }

    return {
      name: 'Team Average',
      grade: gradeLabel,
      outbound: avg('outbound'),
      answerRate: avg('answerRate'),
      avgHandle: avg('avgHandle'),
      avgHold: avg('avgHold'),
      missed: avg('missed'),
      totalCalls: avg('totalCalls'),
      inbound: avg('inbound'),
      avgCallsDay: avg('avgCallsDay'),
      avgHandleOut: avg('avgHandleOut'),
      flags: 0,
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
    const filterLabel = roleFilter === 'service_inbound' ? 'inbound service' : roleFilter === 'service_outbound' ? 'outbound service' : roleFilter === 'sales' ? 'sales' : '';
    return (
      <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
        <Users className="w-16 h-16 text-qs-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-qs-bright mb-2">No team data</h2>
        <p className="text-qs-dim">
          {filterLabel
            ? `No ${filterLabel} data for this week. Upload RingCentral data to see team comparison.`
            : 'Upload RingCentral data for this week to see team comparison.'}
        </p>
      </div>
    );
  }

  const countLabel = roleFilter === 'service_inbound' || roleFilter === 'service_outbound' ? 'reps' : roleFilter === 'sales' ? 'sales reps' : 'employees';

  return (
    <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
      <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
        <Users className="w-5 h-5 text-primary-400" />
        <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Team Comparison</h4>
        <span className="text-xs text-qs-subtle ml-auto">{rows.length} {countLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-qs-elevated/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className={`px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase select-none ${col.sortable ? 'cursor-pointer hover:text-qs-text' : ''}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === col.key ? 'text-primary-400' : 'text-qs-muted'}`} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            {sorted.map((row) => (
              <tr
                key={row.employeeId}
                onClick={() => onSelectEmployee?.(row.employeeId, row.roleType)}
                className="hover:bg-primary-900/20 cursor-pointer transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <CellValue col={col} row={row} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {/* Team Averages */}
          {teamAvg && (
            <tfoot className="bg-qs-elevated border-t-2 border-qs-border">
              <tr>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <AvgCellValue col={col} teamAvg={teamAvg} />
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
