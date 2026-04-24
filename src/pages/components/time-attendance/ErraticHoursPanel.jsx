// src/pages/components/time-attendance/ErraticHoursPanel.jsx
// Rolling 14-day erratic-hours view. Flags drift from each employee's
// default schedule, missed lunch punches, short days, weekend work, and
// "never clocked out" situations. Uses data already on employee_time_entries
// and the employees default_* schedule fields — no new data required.

import { useEffect, useMemo, useState } from 'react';
import { Clock, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { detectErraticHours } from '../../../lib/erraticHours';

const SEVERITY_STYLE = {
  CRITICAL: { icon: AlertCircle,   color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)' },
  WARNING:  { icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  INFO:     { icon: Info,          color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)' },
};

function toLocalDateStr(d) {
  return d.toLocaleDateString('en-CA');
}

export default function ErraticHoursPanel({ employees = [], windowDays = 14 }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!employees.length) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = toLocalDateStr(cutoff);

    const run = async () => {
      const { data } = await supabase
        .from('employee_time_entries')
        .select('employee_user_id, work_date, start_time, lunch_out, lunch_in, end_time, code, location, hours_worked, unpaid_break_minutes')
        .gte('work_date', cutoffStr);
      setEntries(data ?? []);
    };
    run();
    const int = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(int);
  }, [employees, windowDays]);

  const flagged = useMemo(
    () => detectErraticHours(entries, employees, windowDays),
    [entries, employees, windowDays]
  );

  const byEmployee = useMemo(() => {
    const map = new Map();
    for (const f of flagged) {
      if (!map.has(f.employeeId)) map.set(f.employeeId, { name: f.name, items: [], severity: f.severity });
      const bucket = map.get(f.employeeId);
      bucket.items.push(f);
      // Promote to most severe seen
      if (f.severity === 'CRITICAL') bucket.severity = 'CRITICAL';
      else if (f.severity === 'WARNING' && bucket.severity !== 'CRITICAL') bucket.severity = 'WARNING';
    }
    return Array.from(map.values());
  }, [flagged]);

  if (flagged.length === 0) {
    return (
      <div className="dark-card-elevated" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Clock style={{ width: 18, height: 18, color: '#10B981' }} />
          <div style={{ fontWeight: 600, color: 'var(--qs-bright)' }}>Erratic Hours — Last {windowDays} days</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
          No erratic patterns detected. All employees punching within 30 min of their default schedule.
        </div>
      </div>
    );
  }

  return (
    <div className="dark-card-elevated" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Clock style={{ width: 18, height: 18, color: '#F59E0B' }} />
        <div style={{ fontWeight: 600, color: 'var(--qs-bright)' }}>
          Erratic Hours — Last {windowDays} days
        </div>
        <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
          {flagged.length} issue{flagged.length === 1 ? '' : 's'} across {byEmployee.length} employee{byEmployee.length === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {byEmployee.map((emp) => {
          const s = SEVERITY_STYLE[emp.severity];
          return (
            <div
              key={emp.name}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{emp.name}</span>
                <span style={{ fontSize: 10, color: 'var(--qs-subtle)' }}>
                  · {emp.items.length} issue{emp.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {emp.items.map((item, i) => {
                  const is = SEVERITY_STYLE[item.severity];
                  const IIcon = is.icon;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                      <IIcon style={{ width: 12, height: 12, color: is.color, marginTop: 2, flexShrink: 0 }} />
                      <div style={{ fontFamily: "'DM Mono', monospace", color: 'var(--qs-subtle)', minWidth: 72 }}>
                        {item.date}
                      </div>
                      <div style={{ color: 'var(--qs-text)' }}>
                        {item.issues.join(' · ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
