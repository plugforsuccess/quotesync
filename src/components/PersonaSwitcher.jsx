// Three-way segmented switcher: Principal · Service · Sales.
// Visible only to a principal who has linked an employee record with rep roles
// (otherwise switching hats is meaningless). Selection persists in localStorage
// and changes the default landing page; it does NOT change permissions.

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePersona, PERSONA_HOME } from '../hooks/usePersona';

const PERSONA_OPTIONS = [
  { key: 'principal', label: 'Principal', requiresRole: null },
  { key: 'service',   label: 'Service',   requiresRole: ['service_outbound', 'service_inbound', 'service'] },
  { key: 'sales',     label: 'Sales',     requiresRole: ['sales'] },
];

export default function PersonaSwitcher({ compact = false, fullWidth = false }) {
  const { user, currentAgencyRole, currentAgencyId } = useAuth();
  const [persona, setPersona] = usePersona(currentAgencyRole === 'principal' ? 'principal' : 'service');
  const navigate = useNavigate();

  // Only principals get a switcher — employees only have one hat by definition.
  const showSwitcher = currentAgencyRole === 'principal';

  // Fetch the principal's own employee record to determine which rep personas
  // they're actually opted into. Employees without a rep workspace see only
  // the Principal option.
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
    enabled: !!user?.id && !!currentAgencyId && showSwitcher,
    staleTime: 60 * 1000,
  });

  if (!showSwitcher) return null;

  const empRoles = emp?.roles || [];
  const visibleOptions = PERSONA_OPTIONS.filter(opt =>
    !opt.requiresRole || opt.requiresRole.some(r => empRoles.includes(r))
  );

  // If only one option (just Principal — they haven't opted into rep work yet)
  // hide the switcher entirely; it would just be a static label.
  if (visibleOptions.length < 2) return null;

  function handleSelect(next) {
    if (next === persona) return;
    setPersona(next);
    const home = PERSONA_HOME[next];
    if (home) navigate(home);
  }

  return (
    <div style={{
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : undefined,
      alignItems: 'center',
      background: 'var(--qs-elevated)',
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
              background: active ? '#1d4ed8' : 'transparent',
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
