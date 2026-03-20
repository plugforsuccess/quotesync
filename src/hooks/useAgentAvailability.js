import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const E164_REGEX = /^\+1[2-9]\d{9}$/;

export function validateE164(phone) {
  return E164_REGEX.test(phone);
}

/**
 * Get the current user's availability record.
 * staleTime: 0 — always fresh (spec: live query, never cache).
 */
export function useMyAvailability() {
  return useQuery({
    queryKey: ['my_availability'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('agent_availability')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Toggle availability on/off with optimistic update.
 */
export function useToggleAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ available, agencyId, transferPhone }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Compute auto_reset_at: today at 8pm Eastern
      let auto_reset_at = null;
      if (available) {
        const now = new Date();
        const year = now.getUTCFullYear();

        // Determine Eastern offset (DST-aware)
        const marchSecondSunday = new Date(Date.UTC(year, 2, 1));
        marchSecondSunday.setUTCDate(marchSecondSunday.getUTCDate() + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7);
        const novFirstSunday = new Date(Date.UTC(year, 10, 1));
        novFirstSunday.setUTCDate(novFirstSunday.getUTCDate() + ((7 - novFirstSunday.getUTCDay()) % 7));
        const dstStart = new Date(marchSecondSunday.getTime() + 7 * 60 * 60 * 1000);
        const dstEnd = new Date(novFirstSunday.getTime() + 6 * 60 * 60 * 1000);
        const isDST = now >= dstStart && now < dstEnd;
        const offsetHours = isDST ? 4 : 5;

        // 8pm Eastern = (20 + offsetHours) UTC
        const resetHourUtc = 20 + offsetHours;
        auto_reset_at = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          resetHourUtc, 0, 0
        ));
        // If 8pm ET has already passed today, set for tomorrow
        if (auto_reset_at <= now) {
          auto_reset_at.setUTCDate(auto_reset_at.getUTCDate() + 1);
        }
      }

      const upsertData = {
        agency_id: agencyId,
        user_id: user.id,
        available,
        last_toggled_at: new Date().toISOString(),
        auto_reset_at: available ? auto_reset_at.toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      // If transfer_phone is provided (first-time set), include it
      if (transferPhone) {
        upsertData.transfer_phone = transferPhone;
      }

      const { data, error } = await supabase
        .from('agent_availability')
        .upsert(upsertData, { onConflict: 'agency_id,user_id' })
        .select()
        .single();

      if (error) throw error;

      // Log audit event
      const eventType = available ? 'AGENT_AVAILABILITY_ON' : 'AGENT_AVAILABILITY_OFF';
      await supabase.from('audit_log').insert({
        event_type: eventType,
        metadata: { user_id: user.id, agency_id: agencyId },
      }).catch(() => {}); // don't fail on audit

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_availability'] });
      queryClient.invalidateQueries({ queryKey: ['team_availability'] });
    },
  });
}

/**
 * Set transfer phone number.
 */
export function useSetTransferPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agencyId, userId, transferPhone }) => {
      const { data, error } = await supabase
        .from('agent_availability')
        .upsert({
          agency_id: agencyId,
          user_id: userId,
          transfer_phone: transferPhone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agency_id,user_id' })
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await supabase.from('audit_log').insert({
        event_type: 'AGENT_TRANSFER_PHONE_SET',
        metadata: { user_id: userId, agency_id: agencyId },
      }).catch(() => {});

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_availability'] });
      queryClient.invalidateQueries({ queryKey: ['team_availability'] });
    },
  });
}

/**
 * Get all team availability for an agency (admin view).
 * staleTime: 0 — always fresh.
 */
export function useTeamAvailability(agencyId) {
  return useQuery({
    queryKey: ['team_availability', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from('agent_availability')
        .select(`
          user_id,
          available,
          priority_tier,
          last_toggled_at,
          transfer_phone,
          auto_reset_at,
          profiles ( full_name )
        `)
        .eq('agency_id', agencyId)
        .order('priority_tier', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 0,
    gcTime: 0,
  });
}
