// src/pages/ListsPage.jsx
// Lists (/agency/lists, principals only): make lists, choose the one producers see picked
// in Add to List, turn each list's automatic follow-up email on or off, import a
// spreadsheet, and see who's on each list. Lists are archived, never deleted.
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Archive, Download, Loader2, Plus, RotateCcw, Search, Star, Upload } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { useContactLists, useImportToList, useListMembers, useSaveList } from '../hooks/useContactLists';
import { parseImport } from '../lib/contactLists';

const card = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };
const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };
const bright = { color: 'var(--qs-bright)' };
const subtle = { color: 'var(--qs-subtle)' };
const btn = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold';
const fmtPhone = (d) => (d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || '');
const shortDate = (s) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const SOURCE = { quick_send: 'Quick Send', app: 'Lead workspace', import: 'Imported' };

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary-600' : 'bg-slate-400/50'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function NewList({ onMade }) {
  const [name, setName] = useState('');
  const save = useSaveList();
  const make = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate({ name: name.trim() }, { onSuccess: (r) => { setName(''); onMade(r.id); } });
  };
  return (
    <form onSubmit={make} className="flex gap-2" aria-label="New list">
      <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="New list name"
        aria-label="New list name" className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-base" style={field} />
      <button type="submit" disabled={!name.trim() || save.isPending} className={`${btn} bg-primary-600 text-white disabled:opacity-50`}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} <T k="lists.new">Create List</T>
      </button>
      {save.error && <p className="text-sm text-red-600" role="alert">{save.error.message}</p>}
    </form>
  );
}

function Importer({ list }) {
  const input = useRef(null);
  const [parsed, setParsed] = useState(null); // { people, skipped, columns, file }
  const [error, setError] = useState('');
  const imp = useImportToList();
  const read = async (file) => {
    setError(''); setParsed(null); imp.reset();
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
      const r = parseImport(rows);
      if (r.columns.email === undefined) { setError('No email column found. Name one column “Email”.'); return; }
      setParsed({ ...r, file: file.name });
    } catch {
      setError('Couldn’t read that file. Use a .csv or .xlsx spreadsheet.');
    }
  };
  const skippedText = parsed && [
    parsed.skipped.noEmail && `${parsed.skipped.noEmail} with no email`,
    parsed.skipped.badEmail && `${parsed.skipped.badEmail} with a bad email`,
    parsed.skipped.duplicate && `${parsed.skipped.duplicate} listed twice`,
  ].filter(Boolean).join(', ');
  return (
    <div>
      <input ref={input} type="file" accept=".csv,.xlsx,.xls" className="hidden" aria-label="Spreadsheet to import"
        onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      <button type="button" onClick={() => input.current?.click()} className={btn} style={{ ...card, ...bright }}>
        <Upload className="h-4 w-4" aria-hidden="true" /> <T k="lists.import">Import Spreadsheet</T>
      </button>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      {parsed && !imp.isSuccess && (
        <div className="mt-3 rounded-lg p-3 text-sm" style={card} role="status">
          <p style={bright}><b>{parsed.people.length.toLocaleString()}</b> {parsed.people.length === 1 ? 'person' : 'people'} ready from {parsed.file}{skippedText ? `; skipping ${skippedText}` : ''}.</p>
          <p className="mt-1" style={subtle}><T k="lists.import.note">Imported people never get the automatic follow-up. Anyone already on this list is skipped.</T></p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" disabled={!parsed.people.length || imp.isPending} onClick={() => imp.mutate({ list_id: list.id, people: parsed.people })}
              className={`${btn} bg-primary-600 text-white disabled:opacity-50`}>
              {imp.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Import to {list.name}
            </button>
            <button type="button" onClick={() => setParsed(null)} className={btn} style={subtle}><T k="lists.cancel">Cancel</T></button>
          </div>
          {imp.error && <p className="mt-2 text-red-600" role="alert">{imp.error.message}</p>}
        </div>
      )}
      {imp.isSuccess && (
        <p className="mt-2 text-sm" style={bright} role="status">
          Added {imp.data.added.toLocaleString()}{imp.data.already ? `; ${imp.data.already.toLocaleString()} were already on the list` : ''}.
        </p>
      )}
    </div>
  );
}

function download(list, people) {
  const rows = [['First Name', 'Last Name', 'Email', 'Phone', 'Notes', 'Added By', 'Added', 'Source', 'Unsubscribed'],
    ...people.map(m => [m.first_name, m.last_name || '', m.email, fmtPhone(m.phone), m.notes || '', m.added_by_name || '', m.created_at.slice(0, 10), SOURCE[m.source] || m.source, m.unsubscribed ? 'Yes' : ''])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${list.name.replace(/[^\w -]+/g, '').trim() || 'list'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ListDetail({ list, people }) {
  const save = useSaveList();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter(m => `${m.first_name} ${m.last_name || ''} ${m.email} ${m.phone || ''} ${m.notes || ''}`.toLowerCase().includes(t)) : people;
  }, [people, q]);
  const archived = !!list.archived_at;
  return (
    <section className="rounded-xl p-4" style={card} aria-label={list.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold" style={bright}>{list.name}</h2>
          <p className="text-sm" style={subtle}>{people.length.toLocaleString()} {people.length === 1 ? 'person' : 'people'}{archived ? ' · Archived' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {archived ? (
            <button type="button" onClick={() => save.mutate({ id: list.id, archived_at: null })} className={btn} style={{ ...card, ...bright }}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> <T k="lists.restore">Restore</T>
            </button>
          ) : (
            <>
              {!list.is_default && (
                <button type="button" onClick={() => save.mutate({ id: list.id, is_default: true })} className={btn} style={{ ...card, ...bright }}>
                  <Star className="h-4 w-4" aria-hidden="true" /> <T k="lists.make-default">Make Default</T>
                </button>
              )}
              <button type="button" onClick={() => save.mutate({ id: list.id, archived_at: new Date().toISOString() })} className={btn} style={{ ...card, ...subtle }}>
                <Archive className="h-4 w-4" aria-hidden="true" /> <T k="lists.archive">Archive</T>
              </button>
            </>
          )}
        </div>
      </div>

      {!archived && (
        <div className="mt-4 space-y-3">
          {list.is_default && (
            <p className="flex items-center gap-1.5 text-sm" style={bright}><Star className="h-4 w-4 fill-current text-amber-400" aria-hidden="true" /> <T k="lists.default-note">Default: picked for producers in Add to List.</T></p>
          )}
          <div className="flex items-start justify-between gap-4 rounded-lg p-3" style={field}>
            <div>
              <p className="text-sm font-semibold" style={bright}><T k="lists.followup">Send Automatic Follow-Up</T></p>
              <p className="text-xs" style={subtle}><T k="lists.followup-note">One email 3 days after a producer adds someone, with the Check My Rate link. Edit it on Texts & Scripts (Follow-Up After They Didn’t Upload).</T></p>
            </div>
            <Switch on={list.follow_up_enabled} label="Send automatic follow-up" onChange={(v) => save.mutate({ id: list.id, follow_up_enabled: v })} />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Importer list={list} />
            {people.length > 0 && (
              <button type="button" onClick={() => download(list, people)} className={btn} style={{ ...card, ...bright }}>
                <Download className="h-4 w-4" aria-hidden="true" /> <T k="lists.download">Download CSV</T>
              </button>
            )}
          </div>
        </div>
      )}
      {save.error && <p className="mt-2 text-sm text-red-600" role="alert">{save.error.message}</p>}

      {people.length > 0 && (
        <>
          <label className="mt-4 flex items-center gap-2 rounded-lg px-3" style={field}>
            <Search className="h-4 w-4 shrink-0" style={subtle} aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, phone" aria-label="Search this list"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none" style={bright} />
          </label>
          <ul className="mt-2 divide-y" style={{ borderColor: 'var(--qs-border)' }}>
            {shown.slice(0, 200).map(m => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5" style={{ borderColor: 'var(--qs-border)' }}>
                <div className="min-w-0">
                  <p className="truncate font-semibold" style={bright}>{[m.first_name, m.last_name].filter(Boolean).join(' ')}</p>
                  <p className="truncate text-sm" style={subtle}>{m.email}{m.phone ? ` · ${fmtPhone(m.phone)}` : ''}</p>
                </div>
                <p className="text-xs" style={subtle}>
                  {m.unsubscribed ? <span className="font-semibold text-red-600">Unsubscribed</span> : m.followup_sent_at ? `Followed up ${shortDate(m.followup_sent_at)}` : null}
                  {(m.unsubscribed || m.followup_sent_at) && ' · '}
                  {SOURCE[m.source] || m.source}{m.added_by_name && m.source !== 'import' ? `, ${m.added_by_name.split(' ')[0]}` : ''} · {shortDate(m.created_at)}
                </p>
              </li>
            ))}
          </ul>
          {shown.length > 200 && <p className="mt-2 text-sm" style={subtle}>Showing 200 of {shown.length.toLocaleString()}. Search to find someone, or download the CSV.</p>}
        </>
      )}
      {!people.length && !archived && <p className="mt-4 text-sm" style={subtle}><T k="lists.empty">No one yet. Producers add people from Quick Send and the lead workspace, or import a spreadsheet.</T></p>}
    </section>
  );
}

export default function ListsPage() {
  const { data: lists = [], isLoading } = useContactLists({ includeArchived: true });
  const { data: members = [] } = useListMembers();
  const [openId, setOpenId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const live = lists.filter(l => !l.archived_at);
  const archived = lists.filter(l => l.archived_at);
  const byList = useMemo(() => {
    const m = {};
    for (const p of members) (m[p.list_id] ||= []).push(p);
    return m;
  }, [members]);
  const current = lists.find(l => l.id === openId) || live[0] || null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold" style={bright}><T k="lists.title">Lists</T></h1>
        <p className="mt-1 text-sm" style={subtle}><T k="lists.intro">You make the lists; your team adds people who won’t upload yet (Add to List in Quick Send and the lead workspace). Only you can create, import, and email lists.</T></p>
      </div>
      <NewList onMade={setOpenId} />

      {isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" style={subtle} aria-label="Loading" />}
      {!isLoading && !lists.length && <p className="text-sm" style={subtle}><T k="lists.none">No lists yet. Create one above, like “Didn’t Upload”.</T></p>}

      {live.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Your lists">
          {live.map(l => (
            <button key={l.id} type="button" role="tab" aria-selected={current?.id === l.id} onClick={() => setOpenId(l.id)}
              className={`${btn} ${current?.id === l.id ? 'bg-primary-600 text-white' : ''}`} style={current?.id === l.id ? undefined : { ...card, ...bright }}>
              {l.is_default && <Star className="h-3.5 w-3.5 fill-current" aria-label="Default" />}{l.name}
              <span className={current?.id === l.id ? 'text-white/80' : ''} style={current?.id === l.id ? undefined : subtle}>{(byList[l.id] || []).length}</span>
            </button>
          ))}
        </div>
      )}

      {current && <ListDetail key={current.id} list={current} people={byList[current.id] || []} />}

      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived(v => !v)} className="text-sm font-semibold underline" style={subtle} aria-expanded={showArchived}>
            {showArchived ? 'Hide' : 'Show'} archived lists ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 flex flex-wrap gap-2">
              {archived.map(l => (
                <button key={l.id} type="button" onClick={() => setOpenId(l.id)} className={btn} style={{ ...card, ...subtle }}>{l.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
