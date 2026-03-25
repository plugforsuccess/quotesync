// src/hooks/useAgencies.js
// React Query hooks for agency management (admin only)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Fetch all agencies (admin only)
export const useAgencies = (statusFilter = null) => {
  return useQuery({
    queryKey: ['agencies', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('agencies')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });
};

// Fetch single agency with routing rules and users
export const useAgencyDetail = (agencyId) => {
  return useQuery({
    queryKey: ['agency', agencyId],
    queryFn: async () => {
      if (!agencyId) return null;

      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!agencyId
  });
};

// Fetch routing rules for an agency
export const useAgencyRoutingRules = (agencyId) => {
  return useQuery({
    queryKey: ['routing_rules', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from('routing_rules')
        .select('*')
        .eq('agency_id', agencyId)
        .order('priority_tier', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!agencyId
  });
};

// Fetch agency members (from agency_memberships, the authoritative source)
export const useAgencyUsers = (agencyId) => {
  return useQuery({
    queryKey: ['agency_users', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from('agency_memberships')
        .select(`
          user_id,
          agency_id,
          agency_role,
          status,
          created_at
        `)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Map agency_role to role for backward compat with AdminAgencyDetailPage
      return (data || []).map(m => ({ ...m, role: m.agency_role }));
    },
    enabled: !!agencyId
  });
};

// Fetch audit log for an agency
export const useAgencyAuditLog = (agencyId) => {
  return useQuery({
    queryKey: ['audit_log', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!agencyId
  });
};

// Update agency status mutation
export const useUpdateAgencyStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agencyId, status, userId }) => {
      // Update agency status
      const { error: updateError } = await supabase
        .from('agencies')
        .update({ status })
        .eq('id', agencyId);

      if (updateError) throw updateError;

      // Log the action
      const eventType = status === 'approved' ? 'AGENCY_APPROVED'
        : status === 'rejected' ? 'AGENCY_REJECTED'
        : status === 'suspended' ? 'AGENCY_SUSPENDED'
        : 'AGENCY_STATUS_CHANGED';

      const { error: logError } = await supabase
        .from('audit_log')
        .insert({
          agency_id: agencyId,
          event_type: eventType,
          metadata: { actor_user_id: userId, new_status: status }
        });

      if (logError) console.error('Failed to log action:', logError);

      return { success: true };
    },
    onSuccess: (_, { agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['audit_log', agencyId] });
    }
  });
};

// Create routing rule mutation
export const useCreateRoutingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule) => {
      const { data, error } = await supabase
        .from('routing_rules')
        .insert(rule)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, rule) => {
      queryClient.invalidateQueries({ queryKey: ['routing_rules', rule.agency_id] });
    }
  });
};

// Update routing rule mutation
export const useUpdateRoutingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, agencyId, ...updates }) => {
      const { data, error } = await supabase
        .from('routing_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['routing_rules', agencyId] });
    }
  });
};

// Delete routing rule mutation
export const useDeleteRoutingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, agencyId }) => {
      const { error } = await supabase
        .from('routing_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, { agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['routing_rules', agencyId] });
    }
  });
};

// Invite/create agency user mutation (writes to agency_memberships)
export const useInviteAgencyUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role, agencyId, actorUserId }) => {
      // First check if user exists
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .single();

      if (profiles) {
        // User exists, add to agency via agency_memberships
        const { error } = await supabase
          .from('agency_memberships')
          .insert({
            user_id: profiles.id,
            agency_id: agencyId,
            agency_role: role,
            status: 'active'
          });

        if (error) throw error;

        // Link employee record to this auth user (if an employee with matching email exists)
        await supabase
          .from('employees')
          .update({ auth_user_id: profiles.id })
          .eq('org_id', agencyId)
          .eq('personal_email', email)
          .is('auth_user_id', null);

        // Log the action
        await supabase.from('audit_log').insert({
          agency_id: agencyId,
          event_type: 'AGENCY_USER_CREATED',
          metadata: { actor_user_id: actorUserId, new_user_email: email, role }
        });

        return { success: true, created: true };
      } else {
        // User doesn't exist - log invitation (actual invite would need backend)
        await supabase.from('audit_log').insert({
          agency_id: agencyId,
          event_type: 'AGENCY_USER_INVITED',
          metadata: { actor_user_id: actorUserId, invited_email: email, role }
        });

        return { success: true, invited: true, message: 'Invitation logged. User will be added when they create an account.' };
      }
    },
    onSuccess: (_, { agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agency_users', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['agency_team', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['agency_team_full', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['audit_log', agencyId] });
    }
  });
};

// Delete agency user mutation (removes from agency_memberships)
export const useDeleteAgencyUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, agencyId }) => {
      const { error } = await supabase
        .from('agency_memberships')
        .delete()
        .eq('user_id', userId)
        .eq('agency_id', agencyId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, { agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agency_users', agencyId] });
    }
  });
};

// MT-04: Mark agency setup as complete
export function useMarkSetupComplete(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('agencies')
        .update({ setup_completed_at: new Date().toISOString() })
        .eq('id', agencyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
    },
  });
}

// MT-05: Fetch team members for an agency
export function useAgencyTeam(agencyId) {
  return useQuery({
    queryKey: ['agency_team', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_memberships')
        .select('id, agency_role, status, created_at, user_id, profiles(id, email, full_name)')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

// MT-05: Remove team member (soft delete)
export function useRemoveTeamMember(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId) => {
      const { error } = await supabase
        .from('agency_memberships')
        .update({ status: 'removed' })
        .eq('id', membershipId)
        .eq('agency_id', agencyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agency_team', agencyId] }),
  });
}

// Update an existing member's agency role
export function useUpdateMemberRole(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, newRole }) => {
      const { error } = await supabase
        .from('agency_memberships')
        .update({ agency_role: newRole })
        .eq('id', membershipId)
        .eq('agency_id', agencyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agency_team_full', agencyId] }),
  });
}

// MT-05: Fetch team from employee_platform_access view (employees + membership status)
export function useAgencyTeamWithEmployees(agencyId) {
  return useQuery({
    queryKey: ['agency_team_full', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_platform_access')
        .select('*')
        .eq('agency_id', agencyId)
        .order('last_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });
}

// MT-06: Fetch agency carrier config
export function useAgencyCarrierConfig(agencyId) {
  return useQuery({
    queryKey: ['agency_carrier_config', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_carrier_config')
        .select('*')
        .eq('agency_id', agencyId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
    enabled: !!agencyId,
  });
}

// MT-06: Update revenue goals (commission_goal + premium_goal)
export function useUpdateRevenueGoals(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ commission_goal, premium_goal }) => {
      const { error } = await supabase
        .from('agency_carrier_config')
        .update({ commission_goal, premium_goal, updated_at: new Date().toISOString() })
        .eq('agency_id', agencyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_carrier_config', agencyId] });
    },
  });
}

// MT-06: Fetch agency commission rates
export function useAgencyCommissionRatesRaw(agencyId) {
  return useQuery({
    queryKey: ['agency_commission_rates_raw', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_commission_rates')
        .select('*')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

// MT-06: Bulk upsert commission rates
export function useUpsertCommissionRates(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rates) => {
      // Delete existing and re-insert (simpler than individual upserts)
      const { error: deleteError } = await supabase
        .from('agency_commission_rates')
        .delete()
        .eq('agency_id', agencyId);
      if (deleteError) throw deleteError;

      if (rates.length > 0) {
        const rows = rates.map(r => ({ ...r, agency_id: agencyId }));
        const { error: insertError } = await supabase
          .from('agency_commission_rates')
          .insert(rows);
        if (insertError) throw insertError;
      }

      // Update setup_steps.commission
      const { error: stepError } = await supabase
        .from('agencies')
        .update({
          setup_steps: supabase.rpc ? undefined : undefined,
        })
        .eq('id', agencyId);
      // Use raw SQL approach for jsonb_set
      await supabase.rpc('update_setup_step', { p_agency_id: agencyId, p_step: 'commission', p_value: true }).catch(() => {
        // Fallback: direct update
        supabase.from('agencies')
          .update({ setup_steps: { commission: true } })
          .eq('id', agencyId);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_commission_rates_raw', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['agency_commission_rates', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['agency', agencyId] });
    },
  });
}

// MT-06: Fetch routing rules for agent self-service
export function useAgencyRoutingRulesForAgent(agencyId) {
  return useQuery({
    queryKey: ['agency_routing_rules_agent', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routing_rules')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

// MT-06: Create routing rule with pending_approval status
export function useCreateAgencyRoutingRule(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule) => {
      const { data, error } = await supabase
        .from('routing_rules')
        .insert({ ...rule, agency_id: agencyId, status: 'pending_approval' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_routing_rules_agent', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['routing_rules', agencyId] });
    },
  });
}

// Submit agency application (public)
export const submitAgencyApplication = async (applicationData) => {
  const { data, error } = await supabase
    .from('agencies')
    .insert({
      name: applicationData.legalName,
      brand_name: applicationData.brandName || null,
      email: applicationData.email,
      primary_contact_name: applicationData.contactName,
      phone: applicationData.phone,
      state_licenses: applicationData.statesLicensed || [],
      lines_of_business: applicationData.linesOfBusiness || [],
      status: 'pending',
      application_data: {
        license_identifiers: applicationData.licenseIdentifiers,
        desired_territories: applicationData.desiredTerritories,
        submitted_at: new Date().toISOString()
      }
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};
