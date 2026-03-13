// src/hooks/useProducerCompModel.js
// React Query hooks for Producer Compensation Model config and product mix.
// All reads/writes scoped to agency_id via RLS.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DEFAULT_CONFIG, DEFAULT_PRODUCT_MIX } from '../utils/compModelCalculations';

// ── Query key factories ─────────────────────────────────────────────────────

export const compModelKeys = {
  config: (agencyId, producerId) => ['comp-model', 'config', agencyId, producerId],
  productMix: (configId) => ['comp-model', 'product-mix', configId],
  producer: (producerId) => ['comp-model', 'producer', producerId],
  carrier: (carrierId) => ['comp-model', 'carrier', carrierId],
};

// ── Fetch producer info ─────────────────────────────────────────────────────

export function useProducerInfo(producerId) {
  return useQuery({
    queryKey: compModelKeys.producer(producerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, org_id')
        .eq('id', producerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!producerId,
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

// ── Fetch active comp config for a producer ─────────────────────────────────

export function useCompConfig(agencyId, producerId) {
  return useQuery({
    queryKey: compModelKeys.config(agencyId, producerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_comp_configs')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('producer_id', producerId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data; // null if no config exists yet
    },
    enabled: !!agencyId && !!producerId,
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
    mutationFn: async ({ agencyId, producerId, carrierId }) => {
      // 1. Create config
      const { data: config, error: configError } = await supabase
        .from('producer_comp_configs')
        .insert({
          agency_id: agencyId,
          producer_id: producerId,
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
        queryKey: compModelKeys.config(data.agency_id, data.producer_id),
      });
    },
  });
}

// ── Update config fields ────────────────────────────────────────────────────

export function useUpdateCompConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, agencyId, producerId, ...updates }) => {
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
        queryKey: compModelKeys.config(data.agency_id, data.producer_id),
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
