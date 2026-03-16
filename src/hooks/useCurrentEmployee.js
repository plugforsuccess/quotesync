import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Resolves the logged-in user's employee record by matching auth_user_id.
// Returns null if the user is not an employee (e.g. platform admin).
export function useCurrentEmployee() {
  return useQuery({
    queryKey: ['current_employee_self'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, roles, org_id, auth_user_id')
        .eq('auth_user_id', user.id)
        .eq('employment_status', 'active')
        .maybeSingle();

      return data || null;
    },
    staleTime: 10 * 60 * 1000,
  });
}
