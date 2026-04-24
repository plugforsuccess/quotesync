// src/pages/components/time-attendance/PunchAuditLog.jsx
// Viewer for time_entry_audit — shows every manual edit a manager made to
// a selected employee's time entries. Read-only. Hidden behind a toggle so
// it doesn't clutter the main flow.

import { useEffect, useMemo, useState } from 'react';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const TRACKED_FIELDS = ['start_time', 'lunch_out', 'lunch_in', 'end_time', 'code', 'location', 'unpaid_break_minutes', 'notes'];

function diffRow(oldV, newV) {
  const out = [];
  if (!oldV && newV) return TRACKED_FIELDS
    .filter((f) => newV[f] != null && newV[f] !== '' && newV[f] !== 0)
    .map((f) => ({ field: f, before: null, after: newV[f] }));
  if (oldV && !newV) return [{ field: '(row deleted)', before: null, after: null }];
  if (!oldV || !newV) return out;
  for (const f of TRACKED_FIELDS) {
    if ((oldV[f] ?? null) !== (newV[f] ?? null)) {
      out.push({ field: f, before: oldV[f] ?? '—', after: newV[f] ?? '—' });
    }
  }
  return out;
}

export default function PunchAuditLog({ employeeId, employeeName }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState([]);
  const [editorNames, setEditorNames] = useState({});

  useEffect(() => {
    if (!expanded || !employeeId) return;
    const run = async () => {
      const { data } = await supabase
        .from('time_entry_audit')
        .select('id, work_date, changed_by, change_type, old_values, new_values, changed_at')
        .eq('employee_user_id', employeeId)
        .order('changed_at', { ascending: false })
        .limit(50);
      setRows(data ?? []);

      const editorIds = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))];
      if (editorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', editorIds);
        const map = {};
        for (const p of (profiles ?? [])) map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
        setEditorNames(map);
      }
    };
    run();
  }, [expanded, employeeId]);

  const grouped = useMemo(() => {
    // Only surface edits (UPDATE/DELETE) and manual inserts that change anything meaningful.
    return rows.filter((r) => {
      if (r.change_type === 'DELETE' || r.change_type === 'UPDATE') return true;
      // skip auto-insert of empty skeleton rows
      if (r.change_type === 'INSERT') {
        const v = r.new_values || {};
        return v.start_time || v.end_time || v.code !== 'REG' || v.notes;
      }
      return true;
    });
  }, [rows]);

  if (!employeeId) return null;

  return (
    <div className="dark-card-elevated" style={{ padding: 0 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--qs-text)',
        }}
      >
        <History style={{ width: 16, height: 16, color: 'var(--qs-muted)' }} />
        <div style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600 }}>
          Edit History{employeeName ? ` — ${employeeName}` : ''}
        </div>
        {expanded
          ? <ChevronUp style={{ width: 16, height: 16, color: 'var(--qs-subtle)' }} />
          : <ChevronDown style={{ width: 16, height: 16, color: 'var(--qs-subtle)' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 14px' }}>
          {grouped.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--qs-dim)', padding: '8px 0' }}>
              No manual edits recorded for this employee.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grouped.map((r) => {
                const diffs = diffRow(r.old_values, r.new_values);
                const editor = editorNames[r.changed_by] || 'Unknown';
                return (
                  <div
                    key={r.id}
                    style={{
                      background: 'var(--qs-card)',
                      border: '1px solid var(--qs-border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>
                        {r.change_type} · {r.work_date}
                      </div>
                      <div style={{ color: 'var(--qs-subtle)', fontSize: 10 }}>
                        by {editor} · {new Date(r.changed_at).toLocaleString()}
                      </div>
                    </div>
                    {diffs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {diffs.map((d, i) => (
                          <div key={i} style={{ fontSize: 11, color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace" }}>
                            <span style={{ color: 'var(--qs-subtle)' }}>{d.field}:</span>{' '}
                            <span style={{ color: '#EF4444' }}>{String(d.before ?? '—')}</span>
                            {' → '}
                            <span style={{ color: '#10B981' }}>{String(d.after ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>(no tracked field changed)</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
