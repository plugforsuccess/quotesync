// Employee's personal retention queue — cases assigned to them.
// Reuses EventDetailModal and RenewalDetailModal from BookHealthPage
// but scoped entirely to the current employee via RLS.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { calcCancelPriority, daysUntilCancel } from '../lib/retentionPriority';
import { EventDetailModal, RenewalDetailModal } from './BookHealthPage';

export default function MyQueuePage() {
  const { data: employee } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [activeTab, setActiveTab] = useState('cancel'); // 'cancel' | 'renewal'

  const employeeId = employee?.id;
  const orgId      = employee?.org_id;

  // Pull cases assigned to this employee — RLS enforces they only see their own
  const { data: cancelCases = [], isLoading: cancelLoading } = useQuery({
    queryKey: ['my_cancel_cases', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('pending_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation)')
        .order('cancel_effective_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(e => ({
        ...e,
        _priority: calcCancelPriority(e),
      })).sort((a, b) => b._priority - a._priority);
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: renewalCases = [], isLoading: renewalLoading } = useQuery({
    queryKey: ['my_renewal_cases', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('renewal_cases')
        .select('*')
        .eq('assigned_to_id', employeeId)
        .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)')
        .order('renewal_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });

  async function updateCancelCase(id, updates) {
    const { error } = await supabase
      .from('pending_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases', employeeId] });
    }
    return error;
  }

  async function updateRenewalCase(id, updates) {
    const { error } = await supabase
      .from('renewal_cases')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['my_renewal_cases', employeeId] });
    }
    return error;
  }

  const fmt$ = n => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Math.round(n || 0)}`;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
          My Queue
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
          {cancelCases.length} pending cancel &middot; {renewalCases.length} renewals
        </div>
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { key: 'cancel',  label: `\u26A0 Pending Cancel (${cancelCases.length})`  },
          { key: 'renewal', label: `\uD83D\uDD04 Renewals (${renewalCases.length})` },
        ].map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: activeTab === t.key ? 'var(--qs-info)' : 'var(--qs-elevated)',
              color: activeTab === t.key ? '#FFFFFF' : 'var(--qs-subtle)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending Cancel cases */}
      {activeTab === 'cancel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cancelLoading && <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading...</div>}
          {!cancelLoading && cancelCases.length === 0 && (
            <div style={{ color: 'var(--qs-subtle)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
              No active pending cancel cases assigned to you.
            </div>
          )}
          {cancelCases.map(event => {
            const days = daysUntilCancel(event.cancel_effective_date);
            const urgent = days !== null && days <= 3;
            return (
              <div key={event.id}
                onClick={() => setSelectedEvent(event)}
                style={{ background: 'var(--qs-card)', border: `1px solid ${urgent ? '#EF444433' : 'var(--qs-border)'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)',
                    marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {event.customer_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
                    {event.policy_no} &middot; {event.product}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {/* Urgency color — dynamic style prop */}
                  <div style={{ fontSize: 13, fontWeight: 700,
                    color: urgent ? 'var(--qs-danger)' : days <= 7 ? 'var(--qs-warning)' : 'var(--qs-dim)' }}>
                    {days === null ? '\u2014' : days === 0 ? 'Today' : `${days}d`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>
                    {fmt$(event.premium_at_risk)}
                    {event.stage === 'cancelled' && (
                      <span style={{ color: 'var(--qs-danger)', marginLeft: 4 }}>Lapsed</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--qs-subtle)',
                  background: 'var(--qs-elevated)', borderRadius: 4, padding: '2px 6px' }}>
                  {event.attempt_count || 0} attempts
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Renewal cases */}
      {activeTab === 'renewal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {renewalLoading && <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading...</div>}
          {!renewalLoading && renewalCases.length === 0 && (
            <div style={{ color: 'var(--qs-subtle)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
              No active renewal cases assigned to you.
            </div>
          )}
          {renewalCases.map(event => (
            <div key={event.id}
              onClick={() => setSelectedRenewal(event)}
              style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)',
                  marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {event.customer_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
                  {event.policy_no} &middot; {event.product}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-dim)' }}>
                  {event.renewal_date}
                </div>
                <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>
                  {fmt$(event.premium)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)',
                background: 'var(--qs-elevated)', borderRadius: 4, padding: '2px 6px' }}>
                {event.attempt_count || 0} attempts
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modals — portaled to body to escape fixed bottom tab bar z-index */}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateCancelCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={[]}
        />,
        document.body
      )}
      {selectedRenewal && createPortal(
        <RenewalDetailModal
          event={selectedRenewal}
          onClose={() => setSelectedRenewal(null)}
          onUpdate={updateRenewalCase}
          agencyId={orgId}
          currentEmployeeId={employeeId}
          producers={[]}
        />,
        document.body
      )}
    </div>
  );
}
