// src/pages/components/retention/UploadReminderBanner.jsx
// Displays upload reminder banners on the Retention page.
// Shows due/overdue reminders with upload order guidance.

import { T } from '../../../components/SiteCopy';
import { Bell, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import Dismissible from '../../../components/Dismissible';

const STATUS_CONFIG = {
  current:  { color: '#B07A0E', bg: '#10B98111', border: '#10B98133', icon: CheckCircle, label: 'Uploaded' },
  due:      { color: '#F59E0B', bg: '#F59E0B11', border: '#F59E0B33', icon: Clock,       label: 'Due Now' },
  overdue:  { color: '#EF4444', bg: '#EF444411', border: '#EF444433', icon: AlertTriangle, label: 'Overdue' },
};

export default function UploadReminderBanner({ reminders }) {
  if (!reminders || reminders.length === 0) return null;

  const actionable = reminders.filter(r => r.status === 'due' || r.status === 'overdue');
  const current    = reminders.filter(r => r.status === 'current');

  // Don't show banner if everything is current
  if (actionable.length === 0) return null;

  const hasOverdue = actionable.some(r => r.status === 'overdue');

  return (
    <Dismissible id="retention.upload-reminder" version={actionable.map(r => `${r.key ?? r.label ?? r.uploadOrder}:${r.status}`).join('|')}>
    <div style={{
      background: hasOverdue ? '#EF444408' : '#F59E0B08',
      border: `1px solid ${hasOverdue ? '#EF444433' : '#F59E0B33'}`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell className="w-4 h-4" style={{ color: hasOverdue ? '#EF4444' : '#F59E0B' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>
            {hasOverdue ? 'Overdue uploads' : 'Uploads due'}
            {' — '}
            <span style={{ fontWeight: 400, color: 'var(--qs-subtle)' }}>
              <T k="pages.components.retention.uploadreminderbanner.a84aef">upload in the order shown below</T>
            </span>
          </span>
        </div>
      </div>

      {/* Actionable reminders — sorted by upload order */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {actionable
          .sort((a, b) => a.uploadOrder - b.uploadOrder)
          .map((r) => {
            const cfg = STATUS_CONFIG[r.status];
            return (
              <div key={r.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 6, padding: '8px 12px',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: cfg.color, color: '#000',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {r.uploadOrder}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>
                    {r.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--qs-dim)', marginLeft: 8 }}>
                    {r.description}
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: cfg.color,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  borderRadius: 4, padding: '2px 6px',
                }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
      </div>

      {/* Current uploads — shown as a compact footer if any */}
      {current.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--qs-muted)' }}>
          <CheckCircle className="w-3 h-3 inline mr-1 text-emerald-500" />
          <T k="pages.components.retention.uploadreminderbanner.27710b">Already uploaded this month:</T>{' '}
          {current.map(r => r.label).join(', ')}
        </div>
      )}

      {/* Upload sequence reminder */}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--qs-muted)', borderTop: '1px solid var(--qs-border)', paddingTop: 8 }}>
        <T k="pages.components.retention.uploadreminderbanner.e1df04">Correct upload order: ① Termination → ② Cancellation Audit → ③ Pending Cancel → ④ Renewal</T>
      </div>
    </div>
    </Dismissible>
  );
}
