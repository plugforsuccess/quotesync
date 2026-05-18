// src/pages/components/operating-review/ThisWeeksFocusSection.jsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../lib/queryKeys';

const sectionStyle = {
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  padding: 20,
};

const columnStyle = {
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const itemStyle = {
  padding: '10px 12px',
  background: 'var(--qs-card)',
  borderRadius: 6,
  border: '1px solid var(--qs-border)',
  fontSize: 13,
  color: 'var(--qs-text)',
  textDecoration: 'none',
  display: 'block',
  transition: 'border-color 0.15s',
};

const itemTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--qs-bright)',
  marginBottom: 2,
};

const itemDetailStyle = {
  fontSize: 12,
  color: 'var(--qs-subtle)',
};

export default function ThisWeeksFocusSection({ agencyId }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.operatingReview.focus(agencyId),
    queryFn: () => fetchFocus(agencyId),
    enabled: !!agencyId,
    staleTime: 60 * 1000,
  });

  return (
    <section style={sectionStyle}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
          This week's focus
        </h2>
        <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 0 }}>
          Top 5 in each lane. Assign or open. The list refreshes when work resolves.
        </p>
      </header>

      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', padding: 16 }}>Loading focus list…</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          <FocusColumn
            title="High-priority saves"
            subtitle={`${data?.saves.length ?? 0} of top P0/P1 cases`}
            items={data?.saves ?? []}
            emptyLabel="No urgent saves right now."
          />
          <FocusColumn
            title="Renewals needing outreach"
            subtitle={`${data?.renewals.length ?? 0} due in next 30 days`}
            items={data?.renewals ?? []}
            emptyLabel="No untouched renewals in the next 30 days."
          />
          <FocusColumn
            title="Cross-sell top opportunities"
            subtitle={`${data?.crossSell.length ?? 0} open tier-1/tier-2 cases`}
            items={data?.crossSell ?? []}
            emptyLabel="No open cross-sell opportunities."
          />
        </div>
      )}
    </section>
  );
}

function FocusColumn({ title, subtitle, items, emptyLabel }) {
  return (
    <div style={columnStyle}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
          {title}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 0 }}>
          {subtitle}
        </p>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', padding: 8 }}>
          {emptyLabel}
        </div>
      ) : (
        items.map((item) => (
          <a key={item.id} href={item.href} style={itemStyle}>
            <div style={itemTitleStyle}>{item.title}</div>
            <div style={itemDetailStyle}>{item.detail}</div>
          </a>
        ))
      )}
    </div>
  );
}

// ── Data fetcher ──────────────────────────────────────────────────────────

const CANCEL_TERMINAL = ['saved','lost','auto_resolved','cancelled','requested_cancellation','rewritten'];

async function fetchFocus(agencyId) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: saves, error: e1 },
    { data: renewals, error: e2 },
    { data: crossSell, error: e3 },
  ] = await Promise.all([
    supabase.from('pending_cases')
      .select('id, customer_name, policy_no, priority_tier, premium_at_risk, cancel_effective_date, assigned_to')
      .eq('agency_id', agencyId)
      .in('priority_tier', ['P0', 'P1'])
      .not('status', 'in', `(${CANCEL_TERMINAL.map(s => `"${s}"`).join(',')})`)
      .order('premium_at_risk', { ascending: false, nullsFirst: false })
      .limit(5),

    supabase.from('renewal_cases')
      .select('id, customer_name, policy_no, renewal_date, premium, premium_change_pct')
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .gte('renewal_date', today)
      .lte('renewal_date', thirtyDaysOut)
      .order('renewal_date', { ascending: true })
      .limit(5),

    supabase.from('cross_sell_entries')
      .select('id, customer_name, current_product, recommended_product, opportunity_tier, allstate_score')
      .eq('agency_id', agencyId)
      .eq('status', 'open')
      .order('opportunity_tier', { ascending: true })
      .order('allstate_score', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const firstError = [e1, e2, e3].find(Boolean);
  if (firstError) throw firstError;

  return {
    saves: (saves ?? []).map(s => ({
      id: s.id,
      title: s.customer_name || s.policy_no || s.id.slice(0, 8),
      detail: `${s.priority_tier} · $${s.premium_at_risk ?? 0} at risk · cancels ${s.cancel_effective_date}${s.assigned_to ? ` · ${s.assigned_to}` : ''}`,
      href: '/agency/retention',
    })),
    renewals: (renewals ?? []).map(r => ({
      id: r.id,
      title: r.customer_name || r.policy_no || r.id.slice(0, 8),
      detail: `Renews ${r.renewal_date}${r.premium_change_pct ? ` · ${r.premium_change_pct > 0 ? '+' : ''}${r.premium_change_pct}%` : ''}`,
      href: `/agency/renewals/${r.id}`,
    })),
    crossSell: (crossSell ?? []).map(c => ({
      id: c.id,
      title: c.customer_name || c.id.slice(0, 8),
      detail: `${c.current_product} → ${c.recommended_product} · tier ${c.opportunity_tier ?? '?'}${c.allstate_score ? ` · score ${c.allstate_score}` : ''}`,
      href: '/agency/cross-sell',
    })),
  };
}
