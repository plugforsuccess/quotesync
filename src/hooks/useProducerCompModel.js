// src/hooks/useProducerCompModel.js
// React Query hooks for Producer Compensation Model config, product mix, and actuals.
// All reads/writes scoped to agency_id via RLS.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DEFAULT_CONFIG, DEFAULT_PRODUCT_MIX } from '../utils/compModelCalculations';

// ── Query key factories ─────────────────────────────────────────────────────

export const compModelKeys = {
  config: (agencyId, employeeId) => ['comp-model', 'config', agencyId, employeeId],
  productMix: (configId) => ['comp-model', 'product-mix', configId],
  producer: (employeeId) => ['comp-model', 'producer', employeeId],
  carrier: (carrierId) => ['comp-model', 'carrier', carrierId],
  actuals: (agencyId, employeeId, month) => ['comp-model', 'actuals', agencyId, employeeId, month],
  vcProducts: (agencyId) => ['comp-model', 'vc-products', agencyId],
};

// ── Fetch producer info ─────────────────────────────────────────────────────

export function useProducerInfo(employeeId) {
  return useQuery({
    queryKey: compModelKeys.producer(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, org_id')
        .eq('id', employeeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}

// ── Fetch carrier info ──────────────────────────────────────────────────────

export function useCarrierInfo(carrierId) {
  return useQuery({
    queryKey: compModelKeys.carrier(carrierId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_carrier_config')
        .select('id, carrier_name, carrier_code')
        .eq('id', carrierId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!carrierId,
  });
}

// ── Fetch active comp config for an employee ────────────────────────────────

export function useCompConfig(agencyId, employeeId) {
  return useQuery({
    queryKey: compModelKeys.config(agencyId, employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_comp_configs')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data; // null if no config exists yet
    },
    enabled: !!agencyId && !!employeeId,
  });
}

// ── Fetch product mix for a config ──────────────────────────────────────────

export function useProductMix(configId) {
  return useQuery({
    queryKey: compModelKeys.productMix(configId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_comp_product_mix')
        .select('*')
        .eq('config_id', configId)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: !!configId,
  });
}

// ── Create initial config with default values ───────────────────────────────

export function useCreateCompConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agencyId, employeeId, carrierId }) => {
      // 1. Create config
      const { data: config, error: configError } = await supabase
        .from('producer_comp_configs')
        .insert({
          agency_id: agencyId,
          employee_id: employeeId,
          carrier_id: carrierId || null,
          ...DEFAULT_CONFIG,
        })
        .select()
        .single();
      if (configError) throw configError;

      // 2. Create default product mix rows
      const mixRows = DEFAULT_PRODUCT_MIX.map((p) => ({
        config_id: config.id,
        agency_id: agencyId,
        ...p,
      }));

      const { error: mixError } = await supabase
        .from('producer_comp_product_mix')
        .insert(mixRows);
      if (mixError) throw mixError;

      return config;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: compModelKeys.config(data.agency_id, data.employee_id),
      });
    },
  });
}

// ── Update config fields ────────────────────────────────────────────────────

export function useUpdateCompConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, agencyId, employeeId, ...updates }) => {
      const { data, error } = await supabase
        .from('producer_comp_configs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: compModelKeys.config(data.agency_id, data.employee_id),
      });
    },
  });
}

// ── Save entire product mix (delete + re-insert) ────────────────────────────

export function useSaveProductMix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ configId, agencyId, products }) => {
      // Delete existing rows
      const { error: delError } = await supabase
        .from('producer_comp_product_mix')
        .delete()
        .eq('config_id', configId);
      if (delError) throw delError;

      // Insert new rows
      if (products.length > 0) {
        const rows = products.map((p, i) => ({
          config_id: configId,
          agency_id: agencyId,
          product_name: p.product_name,
          mix_pct: Number(p.mix_pct) || 0,
          avg_prem_item: Number(p.avg_prem_item) || 0,
          sort_order: i,
        }));

        const { error: insError } = await supabase
          .from('producer_comp_product_mix')
          .insert(rows);
        if (insError) throw insError;
      }

      return { configId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: compModelKeys.productMix(data.configId),
      });
    },
  });
}

// ── Fetch all active producer comp configs for the agency ────────────────────
// Used by staffing model to let the user select whose cost structure to model.

export function useAllProducerConfigs(agencyId) {
  return useQuery({
    queryKey: ['producer_comp_configs_all', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_comp_configs')
        .select(`
          id, employee_id, base_salary_annual, employer_burden_monthly,
          vc_base_comp_pct, vc_commission_rate, non_vc_bonus_monthly,
          tp_band1_threshold, tp_band1_addon, tp_band2_threshold, tp_band2_addon,
          employees(id, first_name, last_name, preferred_name)
        `)
        .eq('agency_id', agencyId)
        .eq('is_active', true)
        .order('employees(last_name)');
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Actuals: Fetch VC-eligible product keys from agency_products ─────────────

export function useVcProductKeys(agencyId) {
  return useQuery({
    queryKey: compModelKeys.vcProducts(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_products')
        .select('product_key')
        .eq('agency_id', agencyId)
        .eq('is_vc_eligible', true);
      if (error) throw error;
      return (data || []).map((r) => r.product_key);
    },
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000, // 10 min — product config rarely changes
  });
}

// ── Actuals: Fetch revenue entries for a producer in a given month ───────────

export function useProducerActuals(agencyId, employeeId, monthStart, monthEnd) {
  return useQuery({
    queryKey: compModelKeys.actuals(agencyId, employeeId, monthStart),
    queryFn: async () => {
      // Fetch entries attributed to this producer
      const { data: entries, error: entriesError } = await supabase
        .from('revenue_entries')
        .select('id, issued_date, policy_no, product, premium, item_count, customer_name, producer_id, producer_name')
        .eq('agency_id', agencyId)
        .eq('producer_id', employeeId)
        .is('charged_back_at', null)
        .gte('issued_date', monthStart)
        .lte('issued_date', monthEnd)
        .order('issued_date', { ascending: false });
      if (entriesError) throw entriesError;

      // Also count unattributed entries for the warning banner
      const { count: unattributedCount, error: countError } = await supabase
        .from('revenue_entries')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .is('producer_id', null)
        .gte('issued_date', monthStart)
        .lte('issued_date', monthEnd);

      return {
        entries: (entries || []).map((r) => ({
          id: r.id,
          date: r.issued_date,
          policyNo: r.policy_no,
          product: r.product,
          premium: parseFloat(r.premium),
          itemCount: r.item_count ?? 1,
          customerName: r.customer_name,
          producerId: r.producer_id,
          producerName: r.producer_name,
        })),
        unattributedCount: countError ? 0 : (unattributedCount || 0),
      };
    },
    enabled: !!agencyId && !!employeeId && !!monthStart && !!monthEnd,
  });
}
