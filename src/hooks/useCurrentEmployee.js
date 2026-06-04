import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Resolves the logged-in user's employee record by matching auth_user_id.
// Returns null if the user is not an employee (e.g. platform admin).
// Waits for auth to resolve before querying — prevents race condition where
// the query fires before the session is ready and returns null prematurely.
export function useCurrentEmployee() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['current_employee_self', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, rc_display_name, roles, org_id, auth_user_id, must_reset_password, daily_call_target')
        .eq('auth_user_id', user.id)
        .eq('employment_status', 'active')
        .maybeSingle();

      return data || null;
    },
    enabled: !authLoading && !!user?.id,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
  });
}
