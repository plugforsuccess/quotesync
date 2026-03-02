// src/hooks/useAgencyLeads.js
// React Query hooks for agency lead management with tenant isolation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { computeLeadScore } from '../lib/leadScoring';

// Fetch current user's agency ID
export const useCurrentAgency = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current_agency', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('agency_users')
        .select('agency_id, role, agencies(id, name, brand_name)')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });
};

// Fetch agency leads with filters
export const useAgencyLeads = (agencyId, filters = {}) => {
  return useQuery({
    queryKey: ['agency_leads', agencyId, filters],
    queryFn: async () => {
      if (!agencyId) return [];

      let query = supabase
        .from('leads')
        .select(`
          id,
          pull_id,
          state,
          zip,
          status,
          product_intent,
          auto_driving_record,
          home_claims_history,
          risk_flag,
          lead_score,
          score_factors,
          first_contact_at,
          utm_source,
          referral_code,
          created_at,
          updated_at,
          lead_quotes (
            has_documents,
            enrichment_status,
            quote_summary
          )
        `)
        .eq('agency_id', agencyId);

      // Apply filters
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.zip) {
        query = query.ilike('zip', `${filters.zip}%`);
      }
      if (filters.source && filters.source !== 'all') {
        if (filters.source === 'referral') {
          query = query.not('referral_code', 'is', null);
        } else if (filters.source === 'direct') {
          query = query.is('utm_source', null).is('referral_code', null);
        } else {
          query = query.eq('utm_source', filters.source);
        }
      }
      if (filters.hasDocuments !== undefined && filters.hasDocuments !== 'all') {
        // Filter via lead_quotes relationship handled client-side
      }
      if (filters.minScore !== undefined) {
        query = query.gte('lead_score', filters.minScore);
      }
      if (filters.maxScore !== undefined) {
        query = query.lte('lead_score', filters.maxScore);
      }

      // Default sort: highest score, then oldest uncontacted
      query = query
        .order('lead_score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      // Client-side filter for hasDocuments (from joined table)
      let filteredData = data;
      if (filters.hasDocuments === 'yes') {
        filteredData = data.filter(l => l.lead_quotes?.[0]?.has_documents === true);
      } else if (filters.hasDocuments === 'no') {
        filteredData = data.filter(l => !l.lead_quotes?.[0]?.has_documents);
      }

      return filteredData;
    },
    enabled: !!agencyId
  });
};

// Fetch single lead with full details
export const useLeadDetail = (leadId, agencyId) => {
  return useQuery({
    queryKey: ['lead_detail', leadId],
    queryFn: async () => {
      if (!leadId || !agencyId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          lead_quotes (
            id,
            quote_summary,
            has_documents,
            enrichment_status,
            enriched_at
          )
        `)
        .eq('id', leadId)
        .eq('agency_id', agencyId) // Enforce tenant isolation
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!leadId && !!agencyId
  });
};

// Fetch audit log for a specific lead
export const useLeadAuditLog = (leadId) => {
  return useQuery({
    queryKey: ['lead_audit_log', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!leadId
  });
};

// Update lead status mutation
export const useUpdateLeadStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, agencyId, newStatus, oldStatus }) => {
      // Update lead status
      const { error: updateError } = await supabase
        .from('leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('agency_id', agencyId);

      if (updateError) throw updateError;

      // Log status change
      const { error: logError } = await supabase
        .from('audit_log')
        .insert({
          agency_id: agencyId,
          lead_id: leadId,
          event_type: 'LEAD_STATUS_UPDATED',
          metadata: {
            old_status: oldStatus,
            new_status: newStatus,
            actor_user_id: user?.id
          }
        });

      if (logError) console.error('Failed to log status change:', logError);

      return { success: true };
    },
    onSuccess: (_, { leadId, agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agency_leads', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['lead_detail', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead_audit_log', leadId] });
    }
  });
};

// Set first contact timestamp
export const useSetFirstContact = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, agencyId }) => {
      const now = new Date().toISOString();

      // Update first_contact_at
      const { error: updateError } = await supabase
        .from('leads')
        .update({ first_contact_at: now, updated_at: now })
        .eq('id', leadId)
        .eq('agency_id', agencyId)
        .is('first_contact_at', null); // Only set if not already set

      if (updateError) throw updateError;

      // Log first contact
      const { error: logError } = await supabase
        .from('audit_log')
        .insert({
          agency_id: agencyId,
          lead_id: leadId,
          event_type: 'LEAD_FIRST_CONTACT_SET',
          metadata: {
            first_contact_at: now,
            actor_user_id: user?.id
          }
        });

      if (logError) console.error('Failed to log first contact:', logError);

      return { success: true, timestamp: now };
    },
    onSuccess: (_, { leadId, agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agency_leads', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['lead_detail', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead_audit_log', leadId] });
    }
  });
};

// Recompute lead score
export const useRecomputeLeadScore = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, agencyId, lead, quoteSummary }) => {
      const { score, factors } = computeLeadScore(lead, quoteSummary);

      const { error } = await supabase
        .from('leads')
        .update({
          lead_score: score,
          score_factors: factors,
          score_updated_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .eq('agency_id', agencyId);

      if (error) throw error;

      return { score, factors };
    },
    onSuccess: (_, { leadId, agencyId }) => {
      queryClient.invalidateQueries({ queryKey: ['agency_leads', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['lead_detail', leadId] });
    }
  });
};

// SLA metrics computation
export const useAgencySLAMetrics = (agencyId) => {
  return useQuery({
    queryKey: ['agency_sla_metrics', agencyId],
    queryFn: async () => {
      if (!agencyId) return null;

      // Fetch leads for computing metrics
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, status, created_at, first_contact_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Uncontacted backlog
      const uncontactedBacklog = leads.filter(
        l => !l.first_contact_at && l.status !== 'inactive'
      ).length;

      // Time to first contact calculations
      const contactedLeads7d = leads.filter(l => {
        if (!l.first_contact_at) return false;
        const created = new Date(l.created_at);
        return created >= sevenDaysAgo;
      });

      const contactedLeads30d = leads.filter(l => {
        if (!l.first_contact_at) return false;
        const created = new Date(l.created_at);
        return created >= thirtyDaysAgo;
      });

      const avgTimeToContact7d = contactedLeads7d.length > 0
        ? contactedLeads7d.reduce((sum, l) => {
            const created = new Date(l.created_at);
            const contacted = new Date(l.first_contact_at);
            return sum + (contacted - created);
          }, 0) / contactedLeads7d.length / (1000 * 60 * 60) // hours
        : null;

      const avgTimeToContact30d = contactedLeads30d.length > 0
        ? contactedLeads30d.reduce((sum, l) => {
            const created = new Date(l.created_at);
            const contacted = new Date(l.first_contact_at);
            return sum + (contacted - created);
          }, 0) / contactedLeads30d.length / (1000 * 60 * 60) // hours
        : null;

      return {
        uncontactedBacklog,
        avgTimeToContact7d: avgTimeToContact7d ? Math.round(avgTimeToContact7d * 10) / 10 : null,
        avgTimeToContact30d: avgTimeToContact30d ? Math.round(avgTimeToContact30d * 10) / 10 : null,
        totalLeads: leads.length,
        contactedCount: leads.filter(l => l.first_contact_at).length
      };
    },
    enabled: !!agencyId,
    staleTime: 60 * 1000 // Refresh every minute
  });
};
