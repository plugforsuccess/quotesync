// src/pages/components/shared/UploadChecklistModal.jsx
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Clock, ChevronRight, X } from 'lucide-react';

const STATUS_CONFIG = {
  current:  { color: '#10B981', bg: '#10B98111', icon: CheckCircle, label: 'Done' },
  due:      { color: '#F59E0B', bg: '#F59E0B11', icon: Clock,        label: 'Due' },
  overdue:  { color: '#EF4444', bg: '#EF444411', icon: AlertTriangle, label: 'Overdue' },
  upcoming: { color: '#64748B', bg: 'transparent', icon: null,        label: 'Upcoming' },
};

export default function UploadChecklistModal({
  items,
  onDismiss,
  onLogCadence,
  agencyId,
  overdueCadences = [],
  overdueCommitments = [],
}) {
  const navigate = useNavigate();

  const actionable = items.filter(i => i.status === 'due' || i.status === 'overdue');
  const current    = items.filter(i => i.status === 'current');

  const performanceItems = items.filter(i => i.category === 'performance');
  const bobItems         = items.filter(i => i.category === 'book_of_business');
  const mgmtItems        = items.filter(i => i.category === 'management');

  const totalActionable = actionable.length + overdueCadences.length + overdueCommitments.length;
  const hasOverdue = actionable.some(i => i.status === 'overdue')
    || overdueCadences.length > 0
    || overdueCommitments.length > 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div style={{
        background: '#161924',
        border: `1px solid ${hasOverdue ? '#EF444433' : '#F59E0B33'}`,
        borderRadius: 14,
        width: '100%', maxWidth: 560,
        maxHeight: '88vh', overflow: 'auto',
        padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--qs-bright)',
              margin: 0, marginBottom: 4 }}>
              {totalActionable > 0
                ? `${totalActionable} item${totalActionable > 1 ? 's' : ''} need${totalActionable === 1 ? 's' : ''} your attention`
                : 'All reports current ✓'
              }
            </h2>
            <p style={{ fontSize: 12, color: 'var(--qs-muted)', margin: 0 }}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--qs-muted)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Performance Section */}
        <Section
          title="📊 Performance Reports"
          subtitle="RC Analytics — daily & weekly"
          items={performanceItems}
          navigate={navigate}
          onDismiss={onDismiss}
        />

        {/* Book of Business Section */}
        <Section
          title="📋 Book of Business Reports"
          subtitle="Allstate — monthly cadence"
          items={bobItems}
          navigate={navigate}
          onDismiss={onDismiss}
        />

        {/* Management Cadence Section */}
        {mgmtItems.length > 0 && (
          <Section
            title="👥 Management Cadence"
            subtitle="Staff touchpoints — log when completed"
            items={mgmtItems}
            navigate={navigate}
            onDismiss={onDismiss}
            onLogCadence={onLogCadence}
            agencyId={agencyId}
          />
        )}

        {/* Overdue per-employee cadences + commitments — deep-link into agenda */}
        {(overdueCadences.length > 0 || overdueCommitments.length > 0) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-text)',
                margin: 0 }}>🎯 Overdue Meetings & Commitments</p>
              <p style={{ fontSize: 11, color: 'var(--qs-muted)', margin: 0 }}>
                Per-employee cadences past their next scheduled time
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {overdueCadences.map(c => {
                const empName = c.employees
                  ? `${c.employees.first_name} ${c.employees.last_name}`
                  : 'Employee';
                const label = c.cadence_templates?.label || c.cadence_type;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      navigate(`/agency/cadence/${c.cadence_type}/${c.employee_id}`);
                      onDismiss();
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8,
                      background: '#EF444411',
                      border: '1px solid #EF444433',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
                      <AlertTriangle size={16} style={{ color: '#EF4444' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600,
                        color: 'var(--qs-bright)' }}>
                        {label} — {empName}
                      </div>
                      <p style={{ fontSize: 11, color: '#EF4444', margin: 0, marginTop: 1 }}>
                        Due {c.next_due_at ? new Date(c.next_due_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0,
                      color: '#EF4444', minWidth: 52, textAlign: 'right' }}>
                      Overdue
                    </span>
                  </div>
                );
              })}

              {overdueCommitments.map(c => {
                const empName = c.employees
                  ? `${c.employees.first_name} ${c.employees.last_name}`
                  : 'Employee';
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8,
                      background: '#EF444411',
                      border: '1px solid #EF444433',
                    }}
                  >
                    <div style={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
                      <AlertTriangle size={16} style={{ color: '#EF4444' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600,
                        color: 'var(--qs-bright)' }}>
                        Commitment: {c.description}
                      </div>
                      <p style={{ fontSize: 11, color: '#EF4444', margin: 0, marginTop: 1 }}>
                        {empName} · Due {c.due_date}
                      </p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0,
                      color: '#EF4444', minWidth: 52, textAlign: 'right' }}>
                      Overdue
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--qs-border)', paddingTop: 16,
          marginTop: 8, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
            {current.length} of {items.filter(i => i.status !== 'upcoming').length} reports current
          </span>
          <button
            onClick={onDismiss}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 20px',
              borderRadius: 8, cursor: 'pointer',
              background: totalActionable > 0 ? 'var(--qs-elevated)' : '#10B98122',
              border: `1px solid ${totalActionable > 0 ? 'var(--qs-border)' : '#10B98133'}`,
              color: totalActionable > 0 ? 'var(--qs-text)' : '#10B981',
            }}
          >
            {totalActionable > 0 ? 'Dismiss' : 'All clear — close'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, items, navigate, onDismiss, onLogCadence, agencyId }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-text)',
          margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--qs-muted)', margin: 0 }}>
          {subtitle}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => {
          const cfg = STATUS_CONFIG[item.status];
          const Icon = cfg.icon;
          const isActionable = item.status === 'due' || item.status === 'overdue';

          return (
            <div
              key={item.key}
              onClick={isActionable ? () => { navigate(item.link); onDismiss(); } : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8,
                background: cfg.bg,
                border: `1px solid ${isActionable ? cfg.color + '33' : 'var(--qs-border)'}`,
                cursor: isActionable ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
            >
              {/* Status icon */}
              <div style={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
                {Icon ? (
                  <Icon size={16} style={{ color: cfg.color }} />
                ) : (
                  <span style={{ fontSize: 10, color: cfg.color }}>—</span>
                )}
              </div>

              {/* Label + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600,
                    color: isActionable ? 'var(--qs-bright)' : 'var(--qs-dim)' }}>
                    {item.label}
                  </span>
                  {item.optional && (
                    <span style={{ fontSize: 9, color: 'var(--qs-muted)',
                      background: 'var(--qs-elevated)', padding: '1px 5px',
                      borderRadius: 3 }}>
                      OPTIONAL
                    </span>
                  )}
                  {item.uploadOrder && item.status !== 'current' && item.status !== 'upcoming' && (
                    <span style={{ fontSize: 9, color: cfg.color,
                      background: cfg.bg, border: `1px solid ${cfg.color}33`,
                      padding: '1px 5px', borderRadius: 3 }}>
                      UPLOAD ORDER {item.uploadOrder}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: cfg.color, margin: 0,
                  marginTop: 1 }}>
                  {item.description}
                </p>
                {item.detail && (
                  <p style={{ fontSize: 10, color: 'var(--qs-muted)',
                    margin: 0, marginTop: 2 }}>
                    {item.detail}
                  </p>
                )}
              </div>

              {/* Mark Done button for loggable (management cadence) items */}
              {item.loggable && item.status !== 'current' && onLogCadence && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await onLogCadence(item.key);
                  }}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    background: '#10B98122', border: '1px solid #10B98133',
                    color: '#10B981',
                  }}
                >
                  ✓ Mark Done
                </button>
              )}

              {/* Arrow for actionable items */}
              {isActionable && (
                <ChevronRight size={14} style={{ color: cfg.color, flexShrink: 0 }} />
              )}

              {/* Status badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                color: cfg.color, minWidth: 52, textAlign: 'right',
              }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
