// src/pages/components/time-attendance/PunchNotifications.jsx
// Real-time punch feed. Polls the punch_events table every 30s and
// surfaces a bell icon with unread count + a dropdown list showing the
// latest clock-in / lunch / clock-out events. Admin-only (enforced by RLS).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, MapPin, Globe } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const ACTION_LABELS = {
  clock_in: 'Clocked in',
  lunch_out: 'Started lunch',
  lunch_in: 'Back from lunch',
  clock_out: 'Clocked out',
};
const ACTION_COLORS = {
  clock_in: '#10B981',
  lunch_out: '#F59E0B',
  lunch_in: '#60A5FA',
  clock_out: '#64748B',
};

function formatRelative(ts) {
  const d = new Date(ts);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleString();
}

export default function PunchNotifications({ employees = [] }) {
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => {
    try { return localStorage.getItem('punch_notifs_last_seen') || new Date().toISOString(); }
    catch { return new Date().toISOString(); }
  });
  const menuRef = useRef(null);

  const nameById = useMemo(() => {
    const m = new Map();
    for (const e of employees) {
      const id = e.auth_user_id || e.id;
      m.set(id, e.preferred_name || e.first_name || 'Unknown');
    }
    return m;
  }, [employees]);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from('punch_events')
        .select('id, employee_user_id, action, event_time, work_date, punch_time, source_ip, lat, lng, accuracy_m')
        .order('event_time', { ascending: false })
        .limit(50);
      setEvents(data ?? []);
    };
    run();
    const int = setInterval(run, 30 * 1000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = events.filter((e) => e.event_time > lastSeenAt).length;

  function markAllRead() {
    const now = new Date().toISOString();
    setLastSeenAt(now);
    try { localStorage.setItem('punch_notifs_last_seen', now); } catch { /* ignore */ }
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markAllRead(); }}
        className="p-2 text-qs-dim hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors"
        title="Recent punch activity"
        style={{ position: 'relative' }}
      >
        <Bell style={{ width: 20, height: 20 }} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: '#EF4444',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            width: 360,
            maxHeight: 480,
            overflowY: 'auto',
            background: 'var(--qs-card)',
            border: '1px solid var(--qs-border)',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            zIndex: 50,
          }}
        >
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--qs-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--qs-bright)' }}>
              Punch Activity
            </div>
            <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>
              live · 30s refresh
            </div>
          </div>

          {events.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--qs-dim)' }}>
              No punch activity yet.
            </div>
          ) : (
            <div>
              {events.map((e) => {
                const name = nameById.get(e.employee_user_id) || 'Unknown';
                const color = ACTION_COLORS[e.action] || 'var(--qs-subtle)';
                const label = ACTION_LABELS[e.action] || e.action;
                const isNew = e.event_time > lastSeenAt;
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--qs-border)',
                      background: isNew ? 'rgba(96,165,250,0.04)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--qs-bright)', fontWeight: 600 }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--qs-subtle)' }}>
                        {formatRelative(e.event_time)}
                      </div>
                    </div>
                    <div style={{ marginLeft: 16, marginTop: 2, fontSize: 12, color: 'var(--qs-dim)' }}>
                      <span style={{ color }}>{label}</span>
                      <span style={{ color: 'var(--qs-subtle)' }}> at </span>
                      <span style={{ fontFamily: "'DM Mono', monospace" }}>{e.punch_time}</span>
                    </div>
                    {(e.source_ip || e.lat != null) && (
                      <div style={{ marginLeft: 16, marginTop: 4, display: 'flex', gap: 10, fontSize: 10, color: 'var(--qs-subtle)' }}>
                        {e.source_ip && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Globe style={{ width: 10, height: 10 }} />
                            {e.source_ip}
                          </span>
                        )}
                        {e.lat != null && e.lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              color: 'var(--qs-info)',
                              textDecoration: 'none',
                            }}
                          >
                            <MapPin style={{ width: 10, height: 10 }} />
                            {Number(e.lat).toFixed(4)}, {Number(e.lng).toFixed(4)}
                            {e.accuracy_m != null && ` (±${Math.round(e.accuracy_m)}m)`}
                          </a>
                        )}
                      </div>
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
