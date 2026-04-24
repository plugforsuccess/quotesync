// src/pages/components/time-attendance/AttendanceFlagsBanner.jsx
// Collapsible banner that surfaces YTD attendance flags directly in the UI,
// so admins don't need to run the Excel export to see CRITICAL / WARNING /
// INFO issues.

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { computeAttendanceFlags } from '../../../lib/erraticHours';

const SEVERITY_STYLE = {
  CRITICAL: { icon: AlertCircle,   color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)' },
  WARNING:  { icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  INFO:     { icon: Info,          color: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
};

export default function AttendanceFlagsBanner({ ytdEntries, getEmployeeName, year }) {
  const [expanded, setExpanded] = useState(true);

  const flags = useMemo(() => {
    if (!ytdEntries || ytdEntries.length === 0) return [];
    return computeAttendanceFlags(ytdEntries, getEmployeeName, year);
  }, [ytdEntries, getEmployeeName, year]);

  if (flags.length === 0) return null;

  const critical = flags.filter((f) => f.severity === 'CRITICAL').length;
  const warning = flags.filter((f) => f.severity === 'WARNING').length;
  const info = flags.filter((f) => f.severity === 'INFO').length;
  const top = critical > 0 ? 'CRITICAL' : warning > 0 ? 'WARNING' : 'INFO';
  const style = SEVERITY_STYLE[top];
  const Icon = style.icon;

  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          width: '100%',
          cursor: 'pointer',
          color: style.color,
          padding: 0,
        }}
      >
        <Icon style={{ width: 20, height: 20, color: style.color }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {flags.length} attendance flag{flags.length === 1 ? '' : 's'} detected this year
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 2 }}>
            {critical > 0 && <span style={{ color: '#EF4444', fontWeight: 600 }}>{critical} critical</span>}
            {critical > 0 && (warning > 0 || info > 0) && <span style={{ color: 'var(--qs-subtle)' }}> · </span>}
            {warning > 0 && <span style={{ color: '#F59E0B', fontWeight: 600 }}>{warning} warning</span>}
            {warning > 0 && info > 0 && <span style={{ color: 'var(--qs-subtle)' }}> · </span>}
            {info > 0 && <span style={{ color: '#60A5FA', fontWeight: 600 }}>{info} info</span>}
          </div>
        </div>
        {expanded
          ? <ChevronUp style={{ width: 18, height: 18, color: 'var(--qs-subtle)' }} />
          : <ChevronDown style={{ width: 18, height: 18, color: 'var(--qs-subtle)' }} />}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {flags.map((f, i) => {
            const s = SEVERITY_STYLE[f.severity];
            const FIcon = s.icon;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'var(--qs-card)',
                  borderLeft: `3px solid ${s.color}`,
                  borderRadius: 6,
                }}
              >
                <FIcon style={{ width: 14, height: 14, color: s.color, marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12 }}>
                  <div style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>
                    {f.name} — {f.flag}
                  </div>
                  <div style={{ color: 'var(--qs-dim)', marginTop: 2 }}>{f.detail}</div>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: s.color,
                    background: s.bg,
                    padding: '2px 6px',
                    borderRadius: 4,
                    letterSpacing: '0.05em',
                  }}
                >
                  {f.severity}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
