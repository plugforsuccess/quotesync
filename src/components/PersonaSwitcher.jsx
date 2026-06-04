// Segmented switcher: Principal · Service · Sales.
// Shown to anyone who wears more than one hat — a principal with rep roles, or
// a dual-role (sales + service) employee. Selection persists in localStorage
// and changes the default landing page; it does NOT change permissions.

import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePersona, PERSONA_HOME } from '../hooks/usePersona';

export default function PersonaSwitcher({ compact = false, fullWidth = false }) {
  const { user, currentAgencyRole, currentAgencyId } = useAuth();
  const isPrincipal = currentAgencyRole === 'principal';
  const [persona, setPersona] = usePersona(isPrincipal ? 'principal' : 'service');
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch the user's own employee record to determine which rep hats they're
  // opted into. Runs for any agency user (a principal checking their rep roles,
  // or a rep employee).
  const { data: emp } = useQuery({
    queryKey: ['my_employee_record', currentAgencyId, user?.id],
    queryFn: async () => {
      if (!user?.id || !currentAgencyId) return null;
      const { data } = await supabase
        .from('employees')
        .select('id, roles')
        .eq('org_id', currentAgencyId)
        .eq('auth_user_id', user.id)
        .eq('employment_status', 'active')
        .maybeSingle();
      return data || null;
    },
    enabled: !!user?.id && !!currentAgencyId,
    staleTime: 60 * 1000,
  });

  const empRoles = emp?.roles || [];
  const hasService = empRoles.some(r => ['service_outbound', 'service_inbound', 'service'].includes(r));
  const hasSales = empRoles.includes('sales');

  // Build the hats this user can wear. Principal is only for actual principals;
  // Service / Sales come from rep roles.
  const visibleOptions = [
    ...(isPrincipal ? [{ key: 'principal', label: 'Principal' }] : []),
    ...(hasService ? [{ key: 'service', label: 'Service' }] : []),
    ...(hasSales ? [{ key: 'sales', label: 'Sales' }] : []),
  ];

  // Fewer than two hats — nothing to switch between, so hide the switcher.
  if (visibleOptions.length < 2) return null;

  function handleSelect(next) {
    if (next === persona) return;
    setPersona(next);
    // The scorecard renders both the sales and service views, so toggling
    // between those two hats there swaps the view in place. Switching to
    // Principal (which has no scorecard view) always navigates to its home.
    if (next !== 'principal' && location.pathname.startsWith('/my/scorecard')) return;
    const home = PERSONA_HOME[next];
    if (home) navigate(home);
  }

  return (
    <div style={{
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      background: 'rgb(var(--qs-muted-rgb) / 0.12)',
      borderRadius: 999,
      padding: 3,
      border: '1px solid var(--qs-border)',
    }}>
      {visibleOptions.map(opt => {
        const active = opt.key === persona;
        return (
          <button
            key={opt.key}
            onClick={() => handleSelect(opt.key)}
            style={{
              flex: fullWidth ? 1 : undefined,
              padding: compact ? '4px 8px' : '4px 12px',
              borderRadius: 999,
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: active ? '#3B82F6' : 'transparent',
              color: active ? '#fff' : 'var(--qs-dim)',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
