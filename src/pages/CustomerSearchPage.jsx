// src/pages/CustomerSearchPage.jsx
// Producer customer lookup — type a name, see the household's full picture:
// active lines, lost lines (winback openings), open cancel/renewal work, contact.
import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCustomerSearch, useReconcileHouseholds, useMergeHouseholds } from '../hooks/useCustomerSearch';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', renters: 'Renters', condo: 'Condo', landlord: 'Landlord',
  pup: 'Umbrella', boat: 'Boat', specialty_auto: 'Specialty Auto', life: 'Life',
  manufactured: 'Manufactured',
};
const label = p => (PRODUCT_LABELS[p] || p || '—').toUpperCase();

function Chip({ children, color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: `${color}1a`, border: `1px solid ${color}40`, color,
    }}>{children}</span>
  );
}

export default function CustomerSearchPage() {
  const { currentAgencyId, user } = useAuth();
  const { agency } = usePermissions();
  const canManage = !!agency?.isPrincipal;
  // Keep household links inside whichever shell we're in (employee /my or
  // agency), so a rep searching from their workspace stays in their workspace.
  const detailBase = useLocation().pathname.startsWith('/my') ? '/my/customers' : '/agency/customers';
  // ?q= lets other surfaces (cross-sell cards, queue links) deep-link straight
  // into a pre-run search for a specific customer.
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState(() => searchParams.get('q') || '');
  const [selected, setSelected] = useState([]); // household_ids picked to merge
  const { data: results = [], isLoading, isError } = useCustomerSearch(currentAgencyId, term);
  const reconcile = useReconcileHouseholds(currentAgencyId);
  const merge = useMergeHouseholds(currentAgencyId);
  const ready = term.trim().length >= 2;

  // Recent searches / viewed customers, scoped to THIS user so a shared machine
  // doesn't show one rep's history to another. Kept in localStorage so they
  // persist across sign-out / log back in on the same device.
  const RECENT_KEY = `qs_recent_customer_searches_${user?.id || 'anon'}`;
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  });
  function recordSearch(q) {
    const t = (q || '').trim();
    if (t.length < 2) return;
    setRecent(prev => {
      const next = [t, ...prev.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  // Last 8 customers opened — jump straight back to someone you just worked.
  const VIEWED_KEY = `qs_recent_viewed_customers_${user?.id || 'anon'}`;
  const [viewed, setViewed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'); } catch { return []; }
  });

  // Auth resolves a tick after mount, so re-read once the user id is known
  // (the initial render may have used the 'anon' key).
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); } catch { /* noop */ }
    try { setViewed(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RECENT_KEY, VIEWED_KEY]);
  function recordViewed(id, name) {
    if (!id) return;
    setViewed(prev => {
      const next = [{ id, name: name || '—' }, ...prev.filter(x => x.id !== id)].slice(0, 8);
      try { localStorage.setItem(VIEWED_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  const navigate = useNavigate();
  function openHousehold(c) {
    recordSearch(term);
    recordViewed(c.household_id, c.display_name);
    navigate(`${detailBase}/${c.household_id}`);
  }

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  async function mergeSelected() {
    if (selected.length < 2) return;
    const [target, ...sources] = selected; // first stays, rest fold in
    for (const source of sources) await merge.mutateAsync({ source, target });
    setSelected([]);
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', marginBottom: 4 }}>
            Customer Search
          </div>
          <div style={{ fontSize: 14, color: 'var(--qs-subtle)', marginBottom: 16 }}>
            Look up any customer across active, pending, and lapsed policies.
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => reconcile.mutate()}
            disabled={reconcile.isPending}
            title="Rebuild the customer directory from the latest uploads."
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid var(--qs-border)',
              background: 'var(--qs-elevated)', color: 'var(--qs-dim)',
            }}>
            {reconcile.isPending ? 'Rebuilding…' : '↻ Rebuild directory'}
          </button>
        )}
      </div>

      {canManage && selected.length >= 2 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--qs-dim)',
        }}>
          {selected.length} selected — merge into one customer?
          <button onClick={mergeSelected} disabled={merge.isPending} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 600,
          }}>{merge.isPending ? 'Merging…' : 'Merge'}</button>
          <button onClick={() => setSelected([])} style={{
            padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--qs-border)', background: 'transparent', color: 'var(--qs-subtle)', fontSize: 12,
          }}>Cancel</button>
        </div>
      )}

      <input
        autoFocus
        value={term}
        onChange={e => setTerm(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') recordSearch(term); }}
        placeholder="Search by name, phone, or policy #…"
        style={{
          width: '100%', padding: '12px 16px', fontSize: 15,
          borderRadius: 10, border: '1px solid var(--qs-border)',
          background: 'var(--qs-card)', color: 'var(--qs-text)', marginBottom: 20,
        }}
      />

      {!ready && (
        (viewed.length > 0 || recent.length > 0) ? (
          <div style={{ padding: '8px 0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {viewed.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Recently viewed
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {viewed.map(v => (
                    <Link key={v.id} to={`${detailBase}/${v.id}`} style={{
                      padding: '6px 12px', borderRadius: 999, fontSize: 13, textDecoration: 'none',
                      border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
                      color: '#60A5FA', fontWeight: 600,
                    }}>👤 {v.name}</Link>
                  ))}
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Recent searches
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {recent.map(t => (
                    <button key={t} onClick={() => setTerm(t)} style={{
                      padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                      fontFamily: 'inherit', border: '1px solid var(--qs-border)',
                      background: 'var(--qs-elevated)', color: 'var(--qs-dim)',
                    }}>🔎 {t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--qs-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
            Type at least 2 characters to search.
          </div>
        )
      )}
      {ready && isLoading && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Searching…</div>
      )}
      {ready && isError && (
        <div style={{ color: 'var(--qs-danger)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Search failed — try again.</div>
      )}
      {ready && !isLoading && results.length === 0 && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
          No customers match “{term}”.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map(c => {
          const winback = (c.active_policies > 0) && (c.lost_products?.length > 0);
          const picked = selected.includes(c.household_id);
          return (
            <div key={c.household_id} onClick={() => openHousehold(c)} style={{
              background: 'var(--qs-card)',
              border: `1px solid ${picked ? '#3B82F6' : 'var(--qs-border)'}`,
              borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0, display: 'flex', gap: 10 }}>
                  {canManage && (
                    <input type="checkbox" checked={picked} onChange={() => toggle(c.household_id)}
                      onClick={e => e.stopPropagation()}
                      title="Select to merge duplicate customers" style={{ marginTop: 3 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    <Link to={`${detailBase}/${c.household_id}`} style={{ color: 'var(--qs-bright)', textDecoration: 'none' }}
                      onClick={e => { e.stopPropagation(); recordSearch(term); recordViewed(c.household_id, c.display_name); }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                      {c.display_name}
                    </Link>
                    {winback && <span style={{ marginLeft: 8 }}><Chip color="#34D399">♻ Win-back opening</Chip></span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 3 }}>
                    {[c.phone, c.email, c.zip].filter(Boolean).join(' · ') || 'No contact on file'}
                  </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                  {c.cancel_open > 0 && <Chip color="#EF4444">⚠ {c.cancel_open} cancel</Chip>}
                  {c.renewal_open > 0 && <Chip color="#FBBF24">🔄 {c.renewal_open} renewal</Chip>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--qs-muted)' }}>Active: </span>
                  {c.active_products?.length
                    ? <span style={{ color: '#34D399', fontWeight: 600 }}>{c.active_products.map(label).join(', ')}</span>
                    : <span style={{ color: 'var(--qs-muted)' }}>none</span>}
                </div>
                {c.lost_products?.length > 0 && (
                  <div>
                    <span style={{ color: 'var(--qs-muted)' }}>Lost: </span>
                    <span style={{ color: '#F87171' }}>{c.lost_products.map(label).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
