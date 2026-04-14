// src/pages/CadenceAgendaPage.jsx
// Live meeting agenda page. Auto-pulls data modules for the cadence type.
// Principal logs notes + commitments, marks meeting complete.

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Sentiment config ──────────────────────────────────────────
const SENTIMENT_OPTIONS = [
  { value: 'on_track',        label: '✅ On Track',         color: '#10B981' },
  { value: 'needs_attention', label: '⚠️ Needs Attention',  color: '#F59E0B' },
  { value: 'at_risk',         label: '🔴 At Risk',          color: '#EF4444' },
];

// ── Data module renderers ─────────────────────────────────────
// Each module key maps to a component that fetches and renders
// the relevant live data for that section of the agenda.
// Add new modules here as the platform grows.

function OutboundYesterdayModule({ employeeId, agencyId }) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];

  const { data, isLoading } = useQuery({
    queryKey: ['cadence_outbound_yesterday', employeeId, yStr],
    queryFn: async () => {
      // Get employee auth_user_id for call log lookup
      const { data: emp } = await supabase
        .from('employees')
        .select('auth_user_id')
        .eq('id', employeeId)
        .single();

      if (!emp?.auth_user_id) return { count: 0, target: 8 };

      const { count } = await supabase
        .from('rc_call_log')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', agencyId)
        .eq('employee_user_id', emp.auth_user_id)
        .eq('call_direction', 'Outbound')
        .eq('call_date', yStr);

      return { count: count ?? 0, target: 8 };
    },
    enabled: !!employeeId,
  });

  if (isLoading) return <ModuleSkeleton />;
  const { count = 0, target = 8 } = data || {};
  const met = count >= target;

  return (
    <ModuleCard label="Outbound Calls Yesterday">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 32, fontWeight: 700,
          color: met ? '#10B981' : '#EF4444',
          fontFamily: "'DM Mono', monospace",
        }}>
          {count}
        </span>
        <span style={{ fontSize: 14, color: 'var(--qs-muted)' }}>
          / {target} target
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px',
          borderRadius: 4, marginLeft: 4,
          color: met ? '#10B981' : '#EF4444',
          background: met ? '#10B98111' : '#EF444411',
        }}>
          {met ? 'MET' : `${target - count} short`}
        </span>
      </div>
    </ModuleCard>
  );
}

function OpenPendingCasesModule({ employeeId, agencyId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cadence_pending_cases', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_cases')
        .select('id, customer_name, cancel_date, days_until_cancel, priority_score')
        .eq('agency_id', agencyId)
        .eq('assigned_to_id', employeeId)
        .in('status', ['open', 'in_progress'])
        .order('cancel_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  if (isLoading) return <ModuleSkeleton />;

  return (
    <ModuleCard label="Open Pending Cancel Cases">
      {data?.length === 0 ? (
        <p style={{ fontSize: 13, color: '#10B981' }}>✅ No open cases</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data?.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, padding: '6px 10px', borderRadius: 6,
              background: 'var(--qs-elevated)',
              border: `1px solid ${c.days_until_cancel <= 3 ? '#EF444433' : 'var(--qs-border)'}`,
            }}>
              <span style={{ color: 'var(--qs-text)' }}>{c.customer_name}</span>
              <span style={{ color: c.days_until_cancel <= 3 ? '#EF4444' : 'var(--qs-muted)' }}>
                {c.days_until_cancel}d remaining
              </span>
            </div>
          ))}
        </div>
      )}
    </ModuleCard>
  );
}

function PTOBalanceModule({ employeeId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cadence_pto_balance', employeeId],
    queryFn: async () => {
      const { data: emp } = await supabase
        .from('employees')
        .select('pto_days_per_year, sick_days_per_year')
        .eq('id', employeeId)
        .single();

      const { count: ptoUsed } = await supabase
        .from('employee_time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('employee_user_id', employeeId)
        .eq('code', 'PTO')
        .gte('work_date', `${new Date().getFullYear()}-01-01`);

      const allotment = emp?.pto_days_per_year ?? 10;
      const used = ptoUsed ?? 0;
      const remaining = allotment - used;
      return { allotment, used, remaining };
    },
    enabled: !!employeeId,
  });

  if (isLoading) return <ModuleSkeleton />;
  const { allotment = 10, used = 0, remaining = 10 } = data || {};
  const isLow = remaining <= 2;

  return (
    <ModuleCard label="PTO Balance">
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          ['Used', used, isLow ? '#EF4444' : 'var(--qs-text)'],
          ['Remaining', remaining, isLow ? '#EF4444' : '#10B981'],
          ['Allotment', allotment, 'var(--qs-muted)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color,
              fontFamily: "'DM Mono', monospace" }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--qs-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>
      {isLow && (
        <p style={{ fontSize: 11, color: '#EF4444', marginTop: 8 }}>
          ⚠️ Only {remaining} PTO day{remaining !== 1 ? 's' : ''} remaining
          for the rest of the year.
        </p>
      )}
    </ModuleCard>
  );
}

function OpenCommitmentsModule({ employeeId, agencyId }) {
  // Shows commitments from PREVIOUS events (not the current one being logged)
  const { data: commitments = [], isLoading } = useQuery({
    queryKey: ['cadence_commitments_open', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cadence_commitments')
        .select('*, cadence_events(conducted_at, cadence_type)')
        .eq('agency_id', agencyId)
        .eq('employee_id', employeeId)
        .eq('closed', false)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  if (isLoading) return <ModuleSkeleton />;

  return (
    <ModuleCard label="Open Commitments from Previous Meetings">
      {commitments.length === 0 ? (
        <p style={{ fontSize: 13, color: '#10B981' }}>✅ No open commitments</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {commitments.map(c => {
            const isOverdue = new Date(c.due_date) < new Date();
            return (
              <div key={c.id} style={{
                padding: '8px 10px', borderRadius: 6,
                background: isOverdue ? '#EF444411' : 'var(--qs-elevated)',
                border: `1px solid ${isOverdue ? '#EF444433' : 'var(--qs-border)'}`,
              }}>
                <div style={{ fontSize: 12, color: 'var(--qs-text)', marginBottom: 3 }}>
                  {c.description}
                </div>
                <div style={{ fontSize: 11, color: isOverdue ? '#EF4444' : 'var(--qs-muted)' }}>
                  Due {c.due_date}
                  {isOverdue && ' · OVERDUE'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModuleCard>
  );
}

// ── Module registry ────────────────────────────────────────────
const MODULE_COMPONENTS = {
  outbound_yesterday:        OutboundYesterdayModule,
  open_pending_cases:        OpenPendingCasesModule,
  promise_dates_today:       null, // placeholder — add when promise date tracking ships
  pto_balance_warning:       PTOBalanceModule,
  pto_balance:               PTOBalanceModule,
  open_commitments:          OpenCommitmentsModule,
  weekly_outbound_vs_target: OutboundYesterdayModule, // reuses same component
  cases_resolved_vs_opened:  OpenPendingCasesModule,  // reuses same component
  pto_used_this_week:        PTOBalanceModule,
  monthly_scorecard:         null, // placeholder
  bonus_calculation:         null, // placeholder
  attendance_summary:        PTOBalanceModule, // close enough for now
  quarterly_performance:     null, // placeholder
  comp_earned:               null, // placeholder
  goal_attainment:           null, // placeholder
  annual_performance:        null, // placeholder
  comp_review:               null, // placeholder
};

// ── Shared UI primitives ──────────────────────────────────────
function ModuleCard({ label, children }) {
  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ModuleSkeleton() {
  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 12,
      height: 80, opacity: 0.5,
    }} />
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function CadenceAgendaPage() {
  const { cadenceType, employeeId } = useParams();
  const { user, currentAgencyId } = useAuth();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [sentiment, setSentiment] = useState('on_track');
  const [commitments, setCommitments] = useState([
    { description: '', due_date: '' },
  ]);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Fetch template for this cadence type
  const { data: template } = useQuery({
    queryKey: ['cadence_template', cadenceType],
    queryFn: async () => {
      const { data } = await supabase
        .from('cadence_templates')
        .select('*')
        .eq('cadence_type', cadenceType)
        .single();
      return data;
    },
  });

  // Fetch employee info
  const { data: employee } = useQuery({
    queryKey: ['employee_detail', employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, roles')
        .eq('id', employeeId)
        .single();
      return data;
    },
    enabled: !!employeeId,
  });

  // Fetch agency cadence config for this employee + type
  const { data: agencyCadence } = useQuery({
    queryKey: ['agency_cadence_detail', currentAgencyId, cadenceType, employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('agency_cadences')
        .select('*')
        .eq('agency_id', currentAgencyId)
        .eq('cadence_type', cadenceType)
        .eq('employee_id', employeeId)
        .maybeSingle();
      return data;
    },
    enabled: !!currentAgencyId,
  });

  // Filter agenda modules applicable to this employee's roles
  const empRoles = employee?.roles || [];
  const agendaModules = (template?.agenda_modules || []).filter(m =>
    m.roles.some(r => empRoles.includes(r))
  );

  // Complete meeting — creates cadence_event, logs commitments, updates next_due_at
  async function handleComplete() {
    if (!user || !currentAgencyId) return;
    setCompleting(true);

    try {
      // 1. Create cadence_event
      const { data: event, error: eventError } = await supabase
        .from('cadence_events')
        .insert({
          agency_cadence_id: agencyCadence?.id || null,
          agency_id: currentAgencyId,
          cadence_type: cadenceType,
          employee_id: employeeId,
          conducted_by: user.id,
          conducted_at: new Date().toISOString(),
          duration_mins: agencyCadence?.duration_mins || template?.default_duration_mins || 15,
          notes: notes || null,
          sentiment,
          next_meeting_at: null,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 2. Log commitments (skip blank ones)
      const validCommitments = commitments.filter(
        c => c.description.trim() && c.due_date
      );

      if (validCommitments.length > 0) {
        const { error: commitError } = await supabase
          .from('cadence_commitments')
          .insert(validCommitments.map(c => ({
            cadence_event_id: event.id,
            agency_id: currentAgencyId,
            employee_id: employeeId,
            description: c.description.trim(),
            due_date: c.due_date,
            closed: false,
          })));
        if (commitError) throw commitError;
      }

      // 3. Update agency_cadence last_conducted_at + next_due_at
      if (agencyCadence?.id) {
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + (agencyCadence.frequency_days || 7));
        await supabase
          .from('agency_cadences')
          .update({
            last_conducted_at: new Date().toISOString(),
            next_due_at: nextDue.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', agencyCadence.id);
      }

      queryClient.invalidateQueries({ queryKey: ['agency_cadences', currentAgencyId] });
      queryClient.invalidateQueries({ queryKey: ['cadence_commitments_open', employeeId] });
      setCompleted(true);
    } catch (err) {
      console.error('Failed to complete meeting:', err);
    } finally {
      setCompleting(false);
    }
  }

  const empName = employee
    ? `${employee.first_name} ${employee.last_name}`
    : '...';

  if (completed) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright)',
          marginBottom: 8 }}>
          Meeting logged
        </h2>
        <p style={{ fontSize: 14, color: 'var(--qs-muted)' }}>
          {template?.label} with {empName} has been recorded.
          {commitments.filter(c => c.description.trim()).length > 0 &&
            ` ${commitments.filter(c => c.description.trim()).length} commitment(s) tracked.`}
        </p>
        <button
          onClick={() => window.history.back()}
          style={{ marginTop: 24, padding: '10px 24px', borderRadius: 8,
            background: '#3B82F6', border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 4,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {template?.label || cadenceType}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)',
          margin: 0 }}>
          {empName}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </div>
      </div>

      {/* Agenda modules */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Agenda
        </div>
        {agendaModules.map(module => {
          const Component = MODULE_COMPONENTS[module.key];
          if (!Component) return null;
          return (
            <Component
              key={module.key}
              employeeId={employeeId}
              agencyId={currentAgencyId}
            />
          );
        })}
        {agendaModules.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--qs-muted)' }}>
            No agenda modules configured for this meeting type.
          </p>
        )}
      </div>

      {/* Sentiment */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Overall Assessment
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {SENTIMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSentiment(opt.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
                background: sentiment === opt.value ? `${opt.color}22` : 'var(--qs-elevated)',
                border: `1px solid ${sentiment === opt.value ? `${opt.color}44` : 'var(--qs-border)'}`,
                color: sentiment === opt.value ? opt.color : 'var(--qs-dim)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Meeting Notes
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What was discussed? Any concerns or wins to note?"
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            color: 'var(--qs-text)', fontSize: 13, resize: 'vertical',
            boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Commitments */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Commitments
        </div>
        <p style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 10 }}>
          Log 1–2 specific commitments with due dates. Keep it meaningful — not every
          task needs to be tracked here.
        </p>
        {commitments.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8,
            alignItems: 'flex-start' }}>
            <input
              type="text"
              value={c.description}
              onChange={e => {
                const updated = [...commitments];
                updated[i] = { ...updated[i], description: e.target.value };
                setCommitments(updated);
              }}
              placeholder={`Commitment ${i + 1}...`}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                color: 'var(--qs-text)',
              }}
            />
            <input
              type="date"
              value={c.due_date}
              onChange={e => {
                const updated = [...commitments];
                updated[i] = { ...updated[i], due_date: e.target.value };
                setCommitments(updated);
              }}
              style={{
                padding: '8px 10px', borderRadius: 8, fontSize: 13,
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                color: 'var(--qs-text)', width: 140,
              }}
            />
            {commitments.length > 1 && (
              <button
                onClick={() => setCommitments(commitments.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--qs-muted)',
                  cursor: 'pointer', padding: '8px 4px', fontSize: 16 }}>
                ×
              </button>
            )}
          </div>
        ))}
        {commitments.length < 3 && (
          <button
            onClick={() => setCommitments([...commitments, { description: '', due_date: '' }])}
            style={{
              fontSize: 12, color: '#3B82F6', background: 'none',
              border: 'none', cursor: 'pointer', padding: '4px 0',
            }}>
            + Add commitment
          </button>
        )}
      </div>

      {/* Complete button */}
      <button
        onClick={handleComplete}
        disabled={completing}
        style={{
          width: '100%', padding: '14px', borderRadius: 10,
          background: '#10B981', border: 'none', color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          opacity: completing ? 0.6 : 1,
        }}>
        {completing ? 'Logging meeting...' : 'Complete Meeting'}
      </button>
    </div>
  );
}
