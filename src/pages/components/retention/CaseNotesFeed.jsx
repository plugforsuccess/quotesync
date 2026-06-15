// src/pages/components/retention/CaseNotesFeed.jsx
// Append-only, typed/tagged note feed for a single case. Each note is permanent
// and attributed (server-stamped) — the serious-logging replacement for the old
// single free-text notes field.
import { useState } from 'react';
import { useCaseNotes, NOTE_TYPES, NOTE_TYPE_COLOR } from '../../../hooks/useCaseNotes';
import CopyButton from '../../../components/CopyButton';
import { formatNoteForAllstate, formatNotesForAllstate } from '../../../lib/allstateClipboard';

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CaseNotesFeed({ caseType, caseId, agencyId, policyNo, customerName }) {
  const { data: notes = [], isLoading, add, togglePin } = useCaseNotes(caseType, caseId);
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [tagsRaw, setTagsRaw] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    if (!body.trim()) return;
    setErr('');
    try {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      await add.mutateAsync({ agencyId, policyNo, customerName, noteType, tags, body: body.trim() });
      setBody(''); setTagsRaw('');
    } catch (e) {
      setErr(e.message || 'Could not save note.');
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <label className="dark-label">
          Notes log <span style={{ fontWeight: 400, color: 'var(--qs-dim)', fontSize: 11 }}>· append-only, attributed</span>
        </label>
        {notes.length > 0 && (
          <CopyButton
            label="Copy all for Allstate"
            getText={() => formatNotesForAllstate(notes, { customerName, policyNo })}
          />
        )}
      </div>

      {/* Add */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <textarea className="dark-input" rows={2} value={body} onChange={e => setBody(e.target.value)}
          placeholder="Add a note (saved permanently, attributed to you)…" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dark-input" value={noteType} onChange={e => setNoteType(e.target.value)} style={{ maxWidth: 150 }}>
            {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input className="dark-input" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)}
            placeholder="tags, comma-separated" style={{ flex: 1, minWidth: 120 }} />
          <button onClick={submit} disabled={!body.trim() || add.isPending}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#3B82F6', color: '#fff',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (!body.trim() || add.isPending) ? 0.5 : 1 }}>
            {add.isPending ? 'Saving…' : 'Add note'}
          </button>
        </div>
        {err && <div style={{ fontSize: 12, color: '#EF4444' }}>{err}</div>}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>No notes yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: NOTE_TYPE_COLOR[n.note_type] || '#94A3B8' }}>
                    {NOTE_TYPES.find(t => t.value === n.note_type)?.label || n.note_type}
                  </span>
                  {(n.tags || []).map(tag => (
                    <span key={tag} style={{ fontSize: 10, color: 'var(--qs-subtle)', background: 'var(--qs-card)', borderRadius: 4, padding: '1px 6px' }}>#{tag}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CopyButton getText={() => formatNoteForAllstate(n)} label="Copy"
                    style={{ padding: '3px 8px', fontSize: 11 }} />
                  <button onClick={() => togglePin.mutate({ id: n.id, pinned: !n.pinned })} title={n.pinned ? 'Unpin' : 'Pin'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: n.pinned ? '#F59E0B' : 'var(--qs-dim)' }}>
                    {n.pinned ? '★' : '☆'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 4 }}>{n.author_name || '—'} · {fmtTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
