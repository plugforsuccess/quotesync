// src/pages/components/retention/NotesSearch.jsx
// Cross-case note search: full-text over body/policy/customer, filterable by
// note type and tag. Read-only results with case context.
import { useState } from 'react';
import { useNotesSearch, NOTE_TYPES, NOTE_TYPE_COLOR } from '../../../hooks/useCaseNotes';

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function NotesSearch({ agencyId }) {
  const [text, setText] = useState('');
  const [noteType, setNoteType] = useState('');
  const [tag, setTag] = useState('');
  const [submitted, setSubmitted] = useState({ text: '', noteType: '', tag: '' });

  const { data: results = [], isLoading } = useNotesSearch(agencyId, submitted);

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 4 }}>Search notes</h2>
      <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
        Full-text search across every case note — by text, policy #, or customer name. Filter by type or tag.
      </p>

      <form onSubmit={e => { e.preventDefault(); setSubmitted({ text, noteType, tag }); }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input className="dark-input" value={text} onChange={e => setText(e.target.value)}
          placeholder="Search text, policy #, customer…" style={{ flex: 2, minWidth: 200 }} />
        <select className="dark-input" value={noteType} onChange={e => setNoteType(e.target.value)} style={{ minWidth: 130 }}>
          <option value="">All types</option>
          {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input className="dark-input" value={tag} onChange={e => setTag(e.target.value)} placeholder="tag" style={{ maxWidth: 120 }} />
        <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3B82F6', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Search
        </button>
      </form>

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>Searching…</div>
      ) : results.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>No notes match.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginBottom: 8 }}>{results.length} note{results.length === 1 ? '' : 's'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(n => (
              <div key={n.id} className="card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: n.case_type === 'cancel' ? '#EF4444' : '#3B82F6' }}>
                    {n.case_type === 'cancel' ? 'Cancel' : 'Renewal'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--qs-bright)', fontWeight: 600 }}>{n.customer_name || '—'}</span>
                  {n.policy_no && <span style={{ fontSize: 11, color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>{n.policy_no}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: NOTE_TYPE_COLOR[n.note_type] || '#94A3B8' }}>
                    {NOTE_TYPES.find(t => t.value === n.note_type)?.label || n.note_type}
                  </span>
                  {(n.tags || []).map(t => (
                    <span key={t} style={{ fontSize: 10, color: 'var(--qs-subtle)', background: 'var(--qs-elevated)', borderRadius: 4, padding: '1px 6px' }}>#{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: 'var(--qs-text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{n.body}</div>
                <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 4 }}>{n.author_name || '—'} · {fmtTime(n.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
