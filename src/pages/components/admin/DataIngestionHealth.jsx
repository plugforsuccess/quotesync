// src/pages/components/admin/DataIngestionHealth.jsx
// Platform-admin view: which agencies are keeping their Allstate report uploads
// current. A stale feed silently rots retention + the ROI story, so overdue /
// never-uploaded sources surface here per agency. Backed by the
// admin_data_ingestion_health() RPC (platform-admin gated server-side).
import { T } from '../../../components/SiteCopy';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

const SOURCES = [
  'Premium & Profitability', 'Policy Audit', 'Termination',
  'Pending Cancel', 'Renewal', 'Cross-Sell',
];

const CELL = {
  current: { background: 'rgba(52,211,153,0.15)', color: '#34D399' },
  overdue: { background: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  never:   { background: 'rgba(245,158,11,0.15)', color: '#FBBF24' },
};

function cellLabel(row) {
  if (!row) return '—';
  if (row.status === 'never') return 'never';
  if (row.status === 'overdue') return `${row.days_since}d ⚠`;
  return `${row.days_since}d`;
}

export default function DataIngestionHealth() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['admin_data_ingestion_health'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_data_ingestion_health');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  // Pivot flat rows → { agency_id, name, cells: { source: row }, riskCount }
  const agencies = (() => {
    const byAgency = new Map();
    for (const r of data) {
      if (!byAgency.has(r.agency_id)) {
        byAgency.set(r.agency_id, { id: r.agency_id, name: r.agency_name, cells: {}, riskCount: 0 });
      }
      const a = byAgency.get(r.agency_id);
      a.cells[r.source] = r;
      if (r.status === 'overdue' || r.status === 'never') a.riskCount++;
    }
    // Most-behind agencies first.
    return [...byAgency.values()].sort((a, b) => b.riskCount - a.riskCount || a.name.localeCompare(b.name));
  })();

  const atRisk = agencies.filter(a => a.riskCount > 0).length;

  return (
    <div className="dark-card" style={{ padding: 0, overflow: 'hidden', marginTop: 24 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--qs-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}><T k="pages.components.admin.dataingestionhealth.d34648">Data Ingestion Health</T></h2>
        <span style={{ fontSize: 12, color: atRisk > 0 ? '#F87171' : 'var(--qs-subtle)' }}>
          {isLoading ? <T k="pages.components.admin.dataingestionhealth.33ce41">{'Loading…'}</T> : atRisk > 0 ? <>{atRisk}{" "}<T k="pages.components.admin.dataingestionhealth.fb7725">{"agenc"}</T>{atRisk === 1 ? 'y' : 'ies'}{" "}<T k="pages.components.admin.dataingestionhealth.cccee4">{"behind on uploads"}</T></> : <T k="pages.components.admin.dataingestionhealth.ad3681">{'All agencies current'}</T>}
        </span>
      </div>

      {error ? (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--qs-dim)' }}>
          {String(error.message || error).includes('platform admin')
            ? <T k="pages.components.admin.dataingestionhealth.8ed5cd">{'Platform admin access required.'}</T>
            : <T k="pages.components.admin.dataingestionhealth.2b4e39">{'Could not load ingestion health.'}</T>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                <th className="dark-section-label" style={{ padding: '10px 16px', textAlign: 'left' }}><T k="pages.components.admin.dataingestionhealth.75ec3e">Agency</T></th>
                {SOURCES.map(s => (
                  <th key={s} className="dark-section-label" style={{ padding: '10px 10px', textAlign: 'center', fontSize: 11 }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agencies.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--qs-bright)' }}>{a.name}</td>
                  {SOURCES.map(s => {
                    const row = a.cells[s];
                    const style = row ? CELL[row.status] : {};
                    return (
                      <td key={s} style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span title={row?.last_upload ? `Last: ${row.last_upload.slice(0,10)}` : 'No upload on record'}
                          style={{ ...style, display: 'inline-block', minWidth: 48, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                          {cellLabel(row)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!isLoading && agencies.length === 0 && (
                <tr><td colSpan={SOURCES.length + 1} style={{ padding: 32, textAlign: 'center', color: 'var(--qs-dim)', fontSize: 13 }}><T k="pages.components.admin.dataingestionhealth.1b42d9">No agencies found</T></td></tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--qs-dim)', borderTop: '1px solid var(--qs-border)' }}>
            <T k="pages.components.admin.dataingestionhealth.93ae62">Green = current · Red = overdue for its cadence · Amber = never uploaded. Hover a cell for the last upload date.</T>
          </div>
        </div>
      )}
    </div>
  );
}
