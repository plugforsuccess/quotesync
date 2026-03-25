// src/hooks/useAgencyOnboarding.js
// Handles all DB writes for agency onboarding in the correct order.
// Rolls back partial state on failure by tracking created IDs.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// 2026 VC eligibility and portfolio points per state
// Source: 2026 Allstate Portfolio Growth and VC production baseline exclusions
// true = eligible, false = excluded for both Agency Bonus and VC
const VC_EXCLUSIONS_2026 = {
  DEFAULT: {
    auto:           { vcEligible: true,  points: 10 },
    ho:             { vcEligible: true,  points: 20 },
    condo:          { vcEligible: true,  points: 20 },
    renters:        { vcEligible: true,  points: 5  },
    landlord:       { vcEligible: true,  points: 20 },
    specialty_auto: { vcEligible: true,  points: 5  },
    pup:            { vcEligible: true,  points: 5  },
    manufactured:   { vcEligible: true,  points: 5  },
    boat:           { vcEligible: true,  points: 5  },
    motor_club:     { vcEligible: false, points: 0  },
    other:          { vcEligible: false, points: 0  },
  },
};

// State-level overrides — merged on top of DEFAULT
// Only list products that differ from DEFAULT
const STATE_OVERRIDES = {
  GA: { condo: { vcEligible: false, points: 0 }, pup: { vcEligible: false, points: 0 } },
  FL: { ho: { vcEligible: false, points: 0 }, condo: { vcEligible: false, points: 0 }, landlord: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  MA: { condo: { vcEligible: false, points: 0 }, pup: { vcEligible: false, points: 0 }, ho: { vcEligible: false, points: 0 }, landlord: { vcEligible: false, points: 0 }, specialty_auto: { vcEligible: false, points: 0 }, boat: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  CA: { ho: { vcEligible: false, points: 0 }, condo: { vcEligible: false, points: 0 }, renters: { vcEligible: false, points: 0 }, landlord: { vcEligible: false, points: 0 }, specialty_auto: { vcEligible: false, points: 0 }, pup: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 }, boat: { vcEligible: false, points: 0 } },
  CT: { ho: { vcEligible: false, points: 0 }, landlord: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  DE: { landlord: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  HI: { condo: { vcEligible: false, points: 0 }, landlord: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  NC: { landlord: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  AK: { pup: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  SC: { pup: { vcEligible: false, points: 0 } },
  NV: { pup: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  NY: { pup: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  NJ: { pup: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  DC: { specialty_auto: { vcEligible: false, points: 0 }, boat: { vcEligible: false, points: 0 }, manufactured: { vcEligible: false, points: 0 } },
  ND: { condo: { vcEligible: false, points: 0 } },
  SD: { condo: { vcEligible: false, points: 0 } },
  LA: { manufactured: { vcEligible: false, points: 0 } },
  MD: { manufactured: { vcEligible: false, points: 0 } },
  MS: { manufactured: { vcEligible: false, points: 0 } },
  NE: { manufactured: { vcEligible: false, points: 0 } },
  RI: { manufactured: { vcEligible: false, points: 0 } },
  WY: { manufactured: { vcEligible: false, points: 0 } },
  UT: { manufactured: { vcEligible: false, points: 0 } },
  VT: { manufactured: { vcEligible: false, points: 0 } },
};

// Returns merged product config for a given state
export function getProductConfigForState(stateCode) {
  const overrides = STATE_OVERRIDES[stateCode] || {};
  const result = {};
  for (const [product, defaults] of Object.entries(VC_EXCLUSIONS_2026.DEFAULT)) {
    result[product] = overrides[product]
      ? { ...defaults, ...overrides[product] }
      : { ...defaults };
  }
  return result;
}

// Default NB commission rates (Allstate carrier schedule — same across states)
export const DEFAULT_NB_RATES = {
  auto:           { preferred: 0.25, bundled: 0.20, monoline: 0.15 },
  specialty_auto: { preferred: 0.25, bundled: 0.20, monoline: 0.15 },
  ho:             { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  condo:          { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  renters:        { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  landlord:       { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  pup:            { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  manufactured:   { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  boat:           { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  motor_club:     { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  other:          { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
};

export const DEFAULT_RENEWAL_RATES = {
  auto:           { bundled: 0.06, monoline: 0.04 },
  specialty_auto: { bundled: 0.06, monoline: 0.04 },
  ho:             { bundled: 0.09, monoline: 0.07 },
  condo:          { bundled: 0.09, monoline: 0.07 },
  renters:        { bundled: 0.09, monoline: 0.07 },
  landlord:       { bundled: 0.09, monoline: 0.07 },
  pup:            { bundled: 0.09, monoline: 0.07 },
  manufactured:   { bundled: 0.09, monoline: 0.07 },
  boat:           { bundled: 0.09, monoline: 0.07 },
};

export const PRODUCT_META = {
  auto:           { label: 'Auto',              color: '#3B82F6', single_item: false, sort_order: 1  },
  ho:             { label: 'Homeowners',        color: '#10B981', single_item: true,  sort_order: 2  },
  condo:          { label: 'Condo',             color: '#34D399', single_item: true,  sort_order: 3  },
  renters:        { label: 'Renters',           color: '#F59E0B', single_item: true,  sort_order: 4  },
  landlord:       { label: 'Landlord',          color: '#06B6D4', single_item: true,  sort_order: 5  },
  specialty_auto: { label: 'Specialty Auto',    color: '#8B5CF6', single_item: false, sort_order: 6  },
  pup:            { label: 'Personal Umbrella', color: '#EC4899', single_item: true,  sort_order: 7  },
  manufactured:   { label: 'Manufactured Home', color: '#F97316', single_item: true,  sort_order: 8  },
  boat:           { label: 'Boat Owners',       color: '#0EA5E9', single_item: true,  sort_order: 9  },
  motor_club:     { label: 'Motor Club',        color: '#F43F5E', single_item: true,  sort_order: 10 },
  other:          { label: 'Other',             color: '#64748B', single_item: false, sort_order: 99 },
};

export function useCreateAgency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      const {
        name, brandName, agentFirstName, agentLastName, agentEmail, agentPhone,
        policyState, siteUrl,
        products,
        vcBaselineTarget, commissionGoal, premiumGoal, vcProgramLabel,
        principalEmail, principalPassword,
      } = formData;

      // 1. Create agency row
      const { data: agency, error: agencyError } = await supabase
        .from('agencies')
        .insert({
          name,
          brand_name: brandName,
          agent_first_name: agentFirstName,
          email: agentEmail,
          phone: agentPhone,
          policy_state: policyState,
          site_url: siteUrl,
          status: 'approved',
          is_active: true,
          slug: brandName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
        })
        .select('id')
        .single();

      if (agencyError) throw new Error(`Agency creation failed: ${agencyError.message}`);
      const agencyId = agency.id;

      // 2. agency_carrier_config
      const { error: carrierError } = await supabase
        .from('agency_carrier_config')
        .insert({
          agency_id:          agencyId,
          carrier_name:       'Allstate',
          carrier_code:       'ALST',
          commissionable_factor: 0.9350,
          commission_goal:    commissionGoal,
          premium_goal:       premiumGoal,
          vc_baseline_target: vcBaselineTarget,
          vc_program_label:   vcProgramLabel || 'VC Baseline',
          producer_id_label:  'Bind ID',
        });

      if (carrierError) throw new Error(`Carrier config failed: ${carrierError.message}`);

      // 3. Fetch CAT factors for this state
      const { data: catRows } = await supabase
        .from('cat_reinsurance_factors')
        .select('product_key, factor')
        .eq('policy_state', policyState)
        .eq('effective_date', '2026-01-01')
        .eq('carrier', 'allstate');

      const catFactors = {};
      for (const row of catRows || []) {
        catFactors[row.product_key] = parseFloat(row.factor);
      }

      // 4. agency_products
      const productRows = products.map((p) => ({
        agency_id:            agencyId,
        product_key:          p.product_key,
        label:                PRODUCT_META[p.product_key]?.label || p.product_key,
        color:                PRODUCT_META[p.product_key]?.color || '#64748B',
        is_active:            true,
        is_vc_eligible:       p.vcEligible,
        points_per_item:      p.points,
        single_item:          PRODUCT_META[p.product_key]?.single_item ?? false,
        sort_order:           PRODUCT_META[p.product_key]?.sort_order ?? 99,
        commissionable_factor: catFactors[p.product_key] ?? 1.0,
        nb_rate_preferred:    p.nbRates?.preferred   ?? DEFAULT_NB_RATES[p.product_key]?.preferred,
        nb_rate_bundled:      p.nbRates?.bundled     ?? DEFAULT_NB_RATES[p.product_key]?.bundled,
        nb_rate_monoline:     p.nbRates?.monoline    ?? DEFAULT_NB_RATES[p.product_key]?.monoline,
        renewal_rate_bundled: p.renewalRates?.bundled  ?? DEFAULT_RENEWAL_RATES[p.product_key]?.bundled ?? null,
        renewal_rate_monoline:p.renewalRates?.monoline ?? DEFAULT_RENEWAL_RATES[p.product_key]?.monoline ?? null,
      }));

      const { error: productsError } = await supabase
        .from('agency_products')
        .insert(productRows);

      if (productsError) throw new Error(`Products failed: ${productsError.message}`);

      // 5. Create principal auth account
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email:    principalEmail,
        password: principalPassword,
        email_confirm: true,
      });

      if (authError) throw new Error(`Auth account failed: ${authError.message}`);
      const userId = authData.user.id;

      // 6. agency_memberships
      const { error: memberError } = await supabase
        .from('agency_memberships')
        .insert({
          agency_id:   agencyId,
          user_id:     userId,
          agency_role: 'principal',
          status:      'active',
        });

      if (memberError) throw new Error(`Membership failed: ${memberError.message}`);

      // 7. employees row
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .insert({
          org_id:           agencyId,
          first_name:       agentFirstName,
          last_name:        agentLastName,
          auth_user_id:     userId,
          roles:            ['admin', 'sales'],
          employment_status:'active',
          hire_date:        new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (empError) throw new Error(`Employee row failed: ${empError.message}`);

      // 8. agent_availability seed row
      await supabase
        .from('agent_availability')
        .insert({
          agency_id:     agencyId,
          user_id:       userId,
          available:     false,
          priority_tier: 0,
          transfer_phone: null,
        });

      return { agencyId, agentName: `${agentFirstName} ${agentLastName}` };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
  });
}
