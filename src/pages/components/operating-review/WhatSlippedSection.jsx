// src/pages/components/operating-review/WhatSlippedSection.jsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../lib/queryKeys';
import { useDismissedSlips, useDismissSlip, useUndismissSlip } from '../../../hooks/useOperatingReview';
import { useAllProducerConfigs } from '../../../hooks/useProducerCompModel';
import { useUploadChecklist } from '../../../hooks/useUploadChecklist';
import { toSunday } from '../../../lib/weekUtils';

const sectionStyle = {
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  padding: 20,
};

const slipRowStyle = (severity, dismissed) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 14px',
  background: dismissed
    ? 'transparent'
    : severity === 'critical'
    ? 'rgba(239, 68, 68, 0.07)'
    : 'rgba(245, 158, 11, 0.07)',
  border: `1px solid ${
    dismissed
      ? 'var(--qs-border)'
      : severity === 'critical'
      ? 'rgba(239, 68, 68, 0.2)'
      : 'rgba(245, 158, 11, 0.2)'
  }`,
  borderRadius: 8,
  opacity: dismissed ? 0.5 : 1,
});

const slipIconStyle = (severity) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: severity === 'critical' ? 'var(--qs-danger)' : 'var(--qs-warning)',
  flexShrink: 0,
  marginTop: 6,
});

export default function WhatSlippedSection({ agencyId, reviewWeekStart, priorWeekStart }) {
  const { data: slips = {}, isLoading } = useQuery({
    queryKey: queryKeys.operatingReview.slips(agencyId, reviewWeekStart),
    queryFn: () => detectSlips(agencyId),
    enabled: !!agencyId && !!priorWeekStart,
    staleTime: 60 * 1000,
  });

  const { data: producerConfigs = [] } = useAllProducerConfigs(agencyId);
  const { data: uploadChecklist } = useUploadChecklist(agencyId);

  const { data: dismissed = [] } = useDismissedSlips(agencyId, reviewWeekStart);

  const dismissSlip = useDismissSlip();
  const undismissSlip = useUndismissSlip();

  // Per-producer weekly delivery for the prior week. Compared against
  // tp_band1_threshold / 4 in the component because thresholds live in
  // producer config (fetched here, not in detectSlips).
  const { data: producerWeeklyTotals = {} } = useQuery({
    queryKey: ['operating-review', 'producer-weekly-totals', agencyId, priorWeekStart],
    queryFn: async () => {
      const priorWeekEnd = toSunday(priorWeekStart);
      const { data, error } = await supabase
        .from('revenue_entries')
        .select('created_by, policy_count')
        .eq('agency_id', agencyId)
        .gte('issued_date', priorWeekStart)
        .lte('issued_date', priorWeekEnd);
      if (error) throw error;
      const totals = {};
      for (const row of data ?? []) {
        if (!row.created_by) continue;
        totals[row.created_by] = (totals[row.created_by] || 0) + (row.policy_count || 0);
      }
      return totals;
    },
    enabled: !!agencyId && !!priorWeekStart,
    staleTime: 60 * 1000,
  });

  const producerMisses = useMemo(() => {
    if (!producerConfigs.length) return [];
    return producerConfigs
      .map(pc => {
        const weeklyTarget = (pc.tp_band1_threshold || 0) / 4;
        if (weeklyTarget === 0) return null;
        const actual = producerWeeklyTotals[pc.employee_id] || 0;
        const ratio = actual / weeklyTarget;
        if (ratio >= 0.7) return null;
        const emp = pc.employees;
        const name = emp
          ? `${emp.preferred_name || emp.first_name} ${emp.last_name}`
          : pc.employee_id;
        return {
          slipType: 'producer_target_miss',
          slipRef: pc.employee_id,
          severity: 'warning',
          title: `${name} below 70% of weekly target`,
          detail: `Delivered ${actual} items vs. target of ${Math.round(weeklyTarget)} (${Math.round(ratio * 100)}%).`,
          cta: { label: 'Open comp model', href: `/agency/producers/${pc.employee_id}/comp-model` },
        };
      })
      .filter(Boolean);
  }, [producerConfigs, producerWeeklyTotals]);

  // Merge upload delays from useUploadChecklist into the slip list.
  // useUploadChecklist returns items with a `status` of 'overdue' for late
  // reports — map those to slips here.
  const allSlips = useMemo(() => {
    const uploadSlips = (uploadChecklist ?? [])
      .filter(item => item.status === 'overdue')
      .map(item => ({
        slipType: 'upload_delay',
        slipRef: item.key ?? item.label,
        severity: 'warning',
        title: `${item.label} is overdue`,
        detail: item.description || 'Upload past due.',
        cta: { label: 'Go to upload page', href: item.link || '/agency/retention' },
      }));

    return [
      ...(slips.pendingCancelSlips ?? []),
      ...(slips.renewalSlips ?? []),
      ...(slips.leadResponseSlips ?? []),
      ...producerMisses,
      ...uploadSlips,
    ];
  }, [slips, uploadChecklist, producerMisses]);

  // Build a set of dismissed (slipType, slipRef) pairs for filtering
  const dismissedKeys = useMemo(
    () => new Set(dismissed.map(d => `${d.slip_type}::${d.slip_ref ?? ''}`)),
    [dismissed]
  );

  const visibleSlips = allSlips.filter(s => !dismissedKeys.has(`${s.slipType}::${s.slipRef ?? ''}`));
  const dismissedSlips = allSlips.filter(s => dismissedKeys.has(`${s.slipType}::${s.slipRef ?? ''}`));

  const criticalCount = visibleSlips.filter(s => s.severity === 'critical').length;
  const warningCount = visibleSlips.filter(s => s.severity === 'warning').length;

  return (
    <section style={sectionStyle}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
              What slipped last week
            </h2>
            <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 0 }}>
              Variance checks against last week's expectations.
            </p>
          </div>
          <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
            {criticalCount > 0 && (
              <span style={{ color: 'var(--qs-danger)', fontWeight: 600 }}>{criticalCount} critical</span>
            )}
            {criticalCount > 0 && warningCount > 0 && <span> · </span>}
            {warningCount > 0 && (
              <span style={{ color: 'var(--qs-warning)', fontWeight: 600 }}>{warningCount} warning</span>
            )}
            {criticalCount === 0 && warningCount === 0 && !isLoading && (
              <span style={{ color: 'var(--qs-success)', fontWeight: 600 }}>Clean week ✓</span>
            )}
          </div>
        </div>
      </header>

      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', padding: 16 }}>Checking variance…</div>
      ) : visibleSlips.length === 0 && dismissedSlips.length === 0 ? (
        <div style={{ color: 'var(--qs-subtle)', padding: 16 }}>
          Nothing to flag. Last week ran clean.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleSlips.map((slip) => (
            <SlipRow
              key={`${slip.slipType}-${slip.slipRef}`}
              slip={slip}
              dismissed={false}
              onDismiss={() => dismissSlip.mutateAsync({
                agencyId,
                weekStart: reviewWeekStart,
                slipType: slip.slipType,
                slipRef: slip.slipRef,
              })}
              onUndismiss={null}
            />
          ))}
          {dismissedSlips.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--qs-subtle)', fontSize: 13 }}>
                {dismissedSlips.length} dismissed
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dismissedSlips.map((slip) => {
                  const dismissalRecord = dismissed.find(d =>
                    d.slip_type === slip.slipType && (d.slip_ref ?? '') === (slip.slipRef ?? '')
                  );
                  return (
                    <SlipRow
                      key={`${slip.slipType}-${slip.slipRef}-dismissed`}
                      slip={slip}
                      dismissed={true}
                      onDismiss={null}
                      onUndismiss={() => undismissSlip.mutateAsync({
                        id: dismissalRecord?.id,
                        agencyId,
                        weekStart: reviewWeekStart,
                      })}
                    />
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function SlipRow({ slip, dismissed, onDismiss, onUndismiss }) {
  return (
    <div style={slipRowStyle(slip.severity, dismissed)}>
      <div style={slipIconStyle(slip.severity)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
          {slip.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-text)', marginTop: 2 }}>
          {slip.detail}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {slip.cta && (
          <a
            href={slip.cta.href}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: 'var(--qs-card)',
              color: 'var(--qs-text)',
              border: '1px solid var(--qs-border)',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            {slip.cta.label}
          </a>
        )}
        {!dismissed && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: 'transparent',
              color: 'var(--qs-subtle)',
              border: '1px solid var(--qs-border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        )}
        {dismissed && onUndismiss && (
          <button
            type="button"
            onClick={onUndismiss}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              background: 'transparent',
              color: 'var(--qs-info)',
              border: '1px solid var(--qs-border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}

// ── Slip detection ─────────────────────────────────────────────────────────

async function detectSlips(agencyId) {
  const today = new Date();
  const twoBusinessDaysAgo = new Date(today);
  twoBusinessDaysAgo.setDate(today.getDate() - 4);  // approximate (handles weekend)
  const twoBusinessDaysAgoISO = twoBusinessDaysAgo.toISOString().slice(0, 10);

  const yesterdayISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  })();

  const sixtyDaysOut = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  })();
  const fourteenDaysOut = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: cancels, error: e1 },
    { data: renewals, error: e2 },
    { data: leads, error: e3 },
  ] = await Promise.all([
    supabase.from('pending_cases')
      .select('id, status, priority_tier, attempt_count, cancel_effective_date, premium_at_risk, opened_by_id')
      .eq('agency_id', agencyId)
      .in('priority_tier', ['P0', 'P1'])
      .eq('attempt_count', 0)
      .lte('updated_at', twoBusinessDaysAgoISO + 'T23:59:59Z'),

    supabase.from('renewal_cases')
      .select('id, customer_name, policy_no, renewal_date, status, premium_change_pct')
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .gte('renewal_date', fourteenDaysOut)
      .lte('renewal_date', sixtyDaysOut),

    supabase.from('leads')
      .select('id, first_name, created_at, first_contact_at, lead_score')
      .eq('agency_id', agencyId)
      .is('first_contact_at', null)
      .lt('created_at', yesterdayISO),
  ]);

  const firstError = [e1, e2, e3].find(Boolean);
  if (firstError) throw firstError;

  const pendingCancelSlips = (cancels ?? []).map(c => ({
    slipType: 'pending_cancel_unresolved',
    slipRef: c.id,
    severity: 'critical',
    title: `Pending cancel untouched · ${c.priority_tier}`,
    detail: `Case ${c.id.slice(0, 8)}: 0 attempts, $${c.premium_at_risk ?? 0} at risk, cancel ${c.cancel_effective_date}.`,
    cta: { label: 'Open case', href: `/agency/retention` },
  }));

  const renewalSlips = (renewals ?? []).map(r => ({
    slipType: 'renewal_slippage',
    slipRef: r.id,
    severity: 'warning',
    title: `Renewal not yet contacted · ${r.customer_name || r.policy_no}`,
    detail: `Renews ${r.renewal_date}${r.premium_change_pct ? ` · ${r.premium_change_pct > 0 ? '+' : ''}${r.premium_change_pct}% premium change` : ''}.`,
    cta: { label: 'Open renewal', href: `/agency/renewals/${r.id}` },
  }));

  const leadResponseSlips = (leads ?? []).map(l => ({
    slipType: 'lead_response_delay',
    slipRef: l.id,
    severity: 'critical',
    title: `Lead never contacted · ${l.first_name || l.id.slice(0, 8)}`,
    detail: `Created ${new Date(l.created_at).toLocaleDateString()} · score ${l.lead_score ?? '—'}.`,
    cta: { label: 'Open lead', href: `/agency/leads` },
  }));

  return {
    pendingCancelSlips,
    renewalSlips,
    leadResponseSlips,
  };
}
