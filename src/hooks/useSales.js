// src/hooks/useSales.js
// Quotes and binds producers log on a lead (Producer Command Center, step 1).
// Credit goes to whoever is signed in (the database fills employee_id from the
// login). Premiums are saved as typed, for their term (6-month auto, 12-month
// home); totals are annualized in the database.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const salesKey = (leadId) => ['sales', 'lead', leadId];

/** A lead's quotes (newest first) and binds with their items. */
export function useLeadSales(leadId) {
  return useQuery({
    queryKey: salesKey(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const [quotes, binds] = await Promise.all([
        supabase.from('sales_quotes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
        supabase.from('sales_binds').select('*, bound_items(*)').eq('lead_id', leadId).order('created_at', { ascending: false }),
      ]);
      if (quotes.error) throw quotes.error;
      if (binds.error) throw binds.error;
      return { quotes: quotes.data || [], binds: binds.data || [] };
    },
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return (leadId) => {
    qc.invalidateQueries({ queryKey: salesKey(leadId) });
    qc.invalidateQueries({ queryKey: ['agency_leads'] });
    qc.invalidateQueries({ queryKey: ['lead_detail'] });
    qc.invalidateQueries({ queryKey: ['producer_queue'] });
  };
}

const premiumOf = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** Log a quote: lines = [{ product, premium, term_months }]. */
export function useLogQuote() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ agencyId, lead, lines }) => {
      const clean = lines.map(l => ({ product: l.product, premium: premiumOf(l.premium), term_months: Number(l.term_months) || 12 }));
      const { data, error } = await supabase.from('sales_quotes').insert({
        agency_id: agencyId, lead_id: lead.id,
        customer_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
        products: clean.map(l => l.product), lines: clean,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => refresh(v.lead.id),
  });
}

/** Log a bind: lines = [{ product, items, premium, term_months, policy_number }]. */
export function useLogBind() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ agencyId, lead, quoteId, lines, bundleType, bundleOverridden }) => {
      const { data: bind, error } = await supabase.from('sales_binds').insert({
        agency_id: agencyId, lead_id: lead.id, quote_id: quoteId || null,
        customer_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
        bundle_type: bundleType, bundle_type_overridden: !!bundleOverridden,
      }).select().single();
      if (error) throw error;
      const { error: itemsError } = await supabase.from('bound_items').insert(lines.map(l => ({
        agency_id: agencyId, bind_id: bind.id, product: l.product,
        item_count: Math.max(1, Number(l.items) || 1), premium: premiumOf(l.premium),
        term_months: Number(l.term_months) || 12, policy_number: (l.policy_number || '').trim() || null,
      })));
      if (itemsError) {
        await supabase.from('sales_binds').delete().eq('id', bind.id);
        throw itemsError;
      }
      if (quoteId) {
        await supabase.from('sales_quotes').update({ status: 'bound', closed_at: new Date().toISOString() }).eq('id', quoteId);
      }
      return bind;
    },
    onSuccess: (_d, v) => refresh(v.lead.id),
  });
}

/** Mark a lead's open quotes Lost with one of the three reasons. */
export function useMarkLost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ quoteIds, reason }) => {
      const { error } = await supabase.from('sales_quotes')
        .update({ status: 'lost', lost_reason: reason, closed_at: new Date().toISOString() })
        .in('id', quoteIds);
      if (error) throw error;
    },
    onSuccess: (_d, v) => refresh(v.lead.id),
  });
}

// ── Sales workspace: Close ──────────────────────────────────────────────────
const refreshAll = (qc, leadId) => {
  qc.invalidateQueries({ queryKey: ['rate_checks'] });
  qc.invalidateQueries({ queryKey: ['agency_leads'] });
  qc.invalidateQueries({ queryKey: salesKey(leadId) });
};

/**
 * Bound with Allstate: each policy written is marked bound on its rate check. The
 * database turns that into the household's bind (items, bundle type, first auto
 * renewal) and closes the lead as Won. Policy numbers go on the bound items.
 */
export function useBindHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const at = new Date().toISOString();
      for (const r of rows) {
        const { error } = await supabase.from('rate_checks')
          .update({ status: 'bound', bound_carrier: 'Allstate', bound_premium: r.annualPremium, bound_at: at, bound_by: user?.id ?? null })
          .eq('id', r.id);
        if (error) throw error;
        if (r.policyNumber) {
          await supabase.from('bound_items').update({ policy_number: r.policyNumber }).eq('rate_check_id', r.id);
        }
      }
    },
    onSuccess: (_d, v) => refreshAll(qc, v.leadId),
  });
}

/** Not ready yet: a callback date (and why) on the lead; it comes back up on that day. */
export function useScheduleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, at, note }) => {
      const { error } = await supabase.from('leads')
        .update({ next_followup_at: at, callback_note: note?.trim() || null })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => refreshAll(qc, v.leadId),
  });
}

/** Lost: the household's open quotes close with the reason; the lead closes as Lost. */
export function useLoseHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, reason }) => {
      const { data, error } = await supabase.from('sales_quotes')
        .update({ status: 'lost', lost_reason: reason, closed_at: new Date().toISOString() })
        .eq('lead_id', leadId).eq('status', 'open').select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No open quote on this household. Save the quote first.');
    },
    onSuccess: (_d, v) => refreshAll(qc, v.leadId),
  });
}
