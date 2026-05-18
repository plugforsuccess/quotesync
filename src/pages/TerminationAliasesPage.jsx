// src/pages/TerminationAliasesPage.jsx
import { Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useTerminationCategories,
  useAliases,
  useUncategorizedReasons,
} from '../hooks/useTerminationReasonAnalytics';
import { useSetAlias, useDeleteAlias } from '../hooks/useTerminationAliasManagement';
import PageSpinner from '../components/PageSpinner';

const cardStyle = {
  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
  borderRadius: 12, padding: 20,
};

const inputStyle = {
  width: '100%', padding: '6px 10px', background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)', borderRadius: 6,
  color: 'var(--qs-text)', fontSize: 13, outline: 'none',
};

export default function TerminationAliasesPage() {
  const { currentAgencyId } = useAuth();
  const { data: categories = [], isLoading: loadingCats } = useTerminationCategories();
  const { data: aliases = [], isLoading: loadingAliases } = useAliases(currentAgencyId);
  const { data: uncategorized = [], isLoading: loadingUncat } = useUncategorizedReasons(currentAgencyId);

  if (loadingCats || loadingAliases || loadingUncat) return <PageSpinner />;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>
          Termination Reason Aliases
        </h1>
        <p style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 4 }}>
          Map raw Allstate report values to canonical categories. After mapping, existing
          terminations with that reason are recategorized immediately.
        </p>
      </header>

      {/* Uncategorized panel */}
      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
          Needs review: {uncategorized.length} raw reason{uncategorized.length === 1 ? '' : 's'}
        </h2>
        {uncategorized.length === 0 ? (
          <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
            All termination reasons are categorized. New raw values will appear here after the next report import.
          </p>
        ) : (
          <UncategorizedTable
            uncategorized={uncategorized}
            categories={categories}
            agencyId={currentAgencyId}
          />
        )}
      </section>

      {/* Existing aliases panel */}
      <section style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', margin: 0, marginBottom: 12 }}>
          Active aliases: {aliases.length}
        </h2>
        {aliases.length === 0 ? (
          <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
            No aliases yet. Categorize reasons above to start building your mapping.
          </p>
        ) : (
          <AliasTable
            aliases={aliases}
            categories={categories}
            agencyId={currentAgencyId}
          />
        )}
      </section>
    </div>
  );
}

function UncategorizedTable({ uncategorized, categories, agencyId }) {
  const setAlias = useSetAlias();

  const handleAssign = async (rawReason, categoryCode) => {
    try {
      await setAlias.mutateAsync({ agencyId, rawReason, categoryCode });
    } catch (err) {
      window.alert(`Failed to set alias: ${err.message ?? err}`);
    }
  };

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--qs-subtle)', fontWeight: 600,
  };
  const tdStyle = { padding: '10px 12px', color: 'var(--qs-text)', fontSize: 13 };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--qs-elevated)' }}>
          <th style={thStyle}>Raw reason</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Latest</th>
          <th style={thStyle}>Assign category</th>
        </tr>
      </thead>
      <tbody>
        {uncategorized.map(u => (
          <tr key={u.raw_reason} style={{ borderTop: '1px solid var(--qs-border)' }}>
            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
              {u.raw_reason || '(empty)'}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{u.count}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {u.latest_date ? new Date(u.latest_date + 'T00:00:00').toLocaleDateString() : '—'}
            </td>
            <td style={tdStyle}>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleAssign(u.raw_reason, e.target.value);
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
                disabled={setAlias.isPending}
              >
                <option value="">— Choose category —</option>
                {categories.filter(c => c.code !== 'other').map(c => (
                  <option key={c.code} value={c.code}>{c.display_name}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AliasTable({ aliases, categories, agencyId }) {
  const deleteAlias = useDeleteAlias();

  const handleDelete = async (alias) => {
    const confirmed = window.confirm(
      `Remove alias "${alias.raw_reason}" → ${alias.category_code}?\n\n` +
      `Existing terminations with this reason will fall back to the built-in heuristic.`
    );
    if (!confirmed) return;
    try {
      await deleteAlias.mutateAsync({ id: alias.id, agencyId, rawReason: alias.raw_reason });
    } catch (err) {
      window.alert(`Delete failed: ${err.message ?? err}`);
    }
  };

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--qs-subtle)', fontWeight: 600,
  };
  const tdStyle = { padding: '10px 12px', color: 'var(--qs-text)', fontSize: 13 };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--qs-elevated)' }}>
          <th style={thStyle}>Raw reason</th>
          <th style={thStyle}>Maps to</th>
          <th style={thStyle}>Source</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {aliases.map(a => {
          const cat = categories.find(c => c.code === a.category_code);
          return (
            <tr key={a.id} style={{ borderTop: '1px solid var(--qs-border)' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{a.raw_reason}</td>
              <td style={tdStyle}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  background: cat?.color_token ?? '#94A3B8', marginRight: 6, verticalAlign: 'middle',
                }} />
                {cat?.display_name ?? a.category_code}
              </td>
              <td style={{ ...tdStyle, color: 'var(--qs-subtle)', fontSize: 12 }}>{a.source}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--qs-danger)', padding: 4,
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
