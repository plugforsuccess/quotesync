import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';

export default function ProducerCompIndexTab({ agencyId }) {
  const { data: producers = [], isLoading } = useQuery({
    queryKey: ['producers_index', agencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, roles, hire_date')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .contains('roles', ['sales'])
        .order('last_name');
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div style={{ color: '#64748B', padding: 24 }}>Loading...</div>;

  if (producers.length === 0) return (
    <div style={{ color: '#64748B', padding: 24, textAlign: 'center' }}>
      No active sales producers found.
      <div style={{ fontSize: 12, marginTop: 8 }}>
        Add producers with the 'sales' role in Employee Management.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
        Select a producer to configure or view their compensation model.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {producers.map(p => {
          const name = p.preferred_name
            ? `${p.preferred_name} ${p.last_name}`
            : `${p.first_name} ${p.last_name}`;
          return (
            <Link key={p.id}
              to={`/admin/producers/${p.id}/comp-model`}
              style={{ textDecoration: 'none' }}>
              <div style={{ background: '#161924', border: '1px solid #252A3A',
                borderRadius: 10, padding: '14px 18px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#3B82F6'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#252A3A'}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>{name}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {p.roles?.join(', ')} · Hired {p.hire_date || '—'}
                  </div>
                </div>
                <span style={{ color: '#3B82F6', fontSize: 18 }}>→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
