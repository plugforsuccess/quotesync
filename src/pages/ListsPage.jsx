// src/pages/ListsPage.jsx
// Lists (/agency/lists, principals only): make lists, choose the one producers see picked
// in Add to List, set each list's follow-up emails (up to 3, each on its own day; shared
// wording or the list's own), import a spreadsheet, and see who's on each list and where
// they are in the follow-ups. Lists are archived, never deleted.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Archive, Download, Loader2, PenLine, Plus, RotateCcw, Search, Star, Upload } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { useContactLists, useImportToList, useListMembers, useSaveList } from '../hooks/useContactLists';
import { parseImport } from '../lib/contactLists';
import { copyValue } from '../lib/copyValues';
import { TEXT_TEMPLATES } from '../lib/textTemplates';
import { SendTest } from './components/rate-checks/TextsTab';

const card = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };
const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };
const bright = { color: 'var(--qs-bright)' };
const subtle = { color: 'var(--qs-subtle)' };
const btn = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold';
const fmtPhone = (d) => (d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || '');
const shortDate = (s) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const SOURCE = { quick_send: 'Quick Send', app: 'Lead workspace', import: 'Imported' };
const STOPPED = { uploaded: 'Uploaded', quoted: 'Quoted', unsubscribed: 'Unsubscribed' };
const DEFAULT_SEQUENCE = [{ day: 3, on: true }, { day: 10, on: true }, { day: 30, on: true }];
const STEP_TEMPLATES = [1, 2, 3].map(n => TEXT_TEMPLATES.find(t => t.id === `listStep${n}`));
const PER_DAY = 80; // list-followups sends at most this many a day (LIST_EMAILS_PER_DAY)

// One email of a customized list: its own lines (the copy-editor pencil edits them), each
// starting from the shared wording until it's changed.
function ListEmail({ list, n }) {
  const t = STEP_TEMPLATES[n - 1];
  const key = `email.list.${list.id}.step${n}`;
  const shared = (part, d) => copyValue(`${t.key}.${part}`, d);
  return (
    <article className="rounded-lg p-3 text-[15px] leading-relaxed" style={field} aria-label={`${list.name} email ${n}`}>
      <p className="pb-2 font-semibold" style={{ ...bright, borderBottom: '1px solid var(--qs-border)' }}>
        <span className="font-normal" style={subtle}>Email {n} · </span><T k={`${key}.subject`}>{shared('subject', t.subject)}</T>
      </p>
      <div className="mt-2 space-y-2" style={bright}>
        {t.paragraphs.map((d, i) => <p key={i}><T k={`${key}.${i + 1}`}>{shared(i + 1, d)}</T></p>)}
        <p><span className="inline-flex min-h-[36px] items-center rounded-full px-4 text-sm font-bold" style={{ background: '#F5D061', color: '#0F2D6B' }}><T k={`${key}.button`}>{shared('button', t.button.label)}</T></span></p>
      </div>
      <div className="mt-2 flex justify-end"><SendTest id={`listStep${n}`} listId={list.id} /></div>
    </article>
  );
}

function DayInput({ value, onSave, label }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const d = Math.min(365, Math.max(0, Math.round(Number(v))));
    if (Number.isFinite(d) && d !== value) onSave(d); else setV(String(value));
  };
  return (
    <input inputMode="numeric" value={v} aria-label={label} onChange={e => setV(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-14 rounded-lg px-2 py-1.5 text-center text-base font-semibold tabular-nums" style={field} />
  );
}

// The list's follow-up emails: on/off, which emails and on what day, whose wording, and how it's going.
function FollowUps({ list, people }) {
  const save = useSaveList();
  const seq = (list.sequence?.length ? list.sequence : DEFAULT_SEQUENCE).slice(0, 3);
  const setStep = (i, patch) => save.mutate({ id: list.id, sequence: seq.map((st, j) => (j === i ? { ...st, ...patch } : st)) });
  const sentAt = (i) => people.filter(m => m.steps_sent > i).length;
  const stopped = Object.keys(STOPPED).map(r => [r, people.filter(m => m.stopped_reason === r).length]).filter(([, c]) => c);
  return (
    <div className="rounded-lg p-3" style={field}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold" style={bright}><T k="lists.followup">Send Follow-Up Emails</T></p>
          <p className="text-xs" style={subtle}><T k="lists.followup-note2">Days count from when someone is added. It stops when they upload, get quoted, or unsubscribe.</T></p>
        </div>
        <Switch on={list.follow_up_enabled} label="Send follow-up emails" onChange={(v) => save.mutate({ id: list.id, follow_up_enabled: v })} />
      </div>

      <ol className="mt-3 space-y-2" aria-label="Follow-up emails">
        {seq.map((st, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Switch on={st.on} label={`Email ${i + 1}`} onChange={(v) => setStep(i, { on: v })} />
            <span className="text-sm font-semibold" style={st.on ? bright : subtle}>Email {i + 1}</span>
            <span className="flex items-center gap-1.5 text-sm" style={subtle}>Day <DayInput value={Number(st.day) || 0} label={`Email ${i + 1} day`} onSave={(d) => setStep(i, { day: d })} /></span>
            {sentAt(i) > 0 && <span className="text-xs" style={subtle}>Sent to {sentAt(i).toLocaleString()}</span>}
          </li>
        ))}
      </ol>
      {stopped.length > 0 && (
        <p className="mt-2 text-xs" style={subtle}>Stopped: {stopped.map(([r, c]) => `${c} ${STOPPED[r].toLowerCase()}`).join(', ')}.</p>
      )}
      {list.follow_up_enabled && people.some(m => m.source === 'import') && (
        <p className="mt-2 text-xs" style={subtle}>Up to {PER_DAY} emails go out a day, oldest first, so a big imported list takes a few days to get through.</p>
      )}

      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--qs-border)' }}>
        {list.custom_emails ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={bright}><T k="lists.own-emails">This List’s Own Emails</T></p>
              <button type="button" onClick={() => save.mutate({ id: list.id, custom_emails: false })} className="text-sm font-semibold underline" style={subtle}>
                <T k="lists.use-shared">Use Shared Emails</T>
              </button>
            </div>
            <p className="mt-0.5 text-xs" style={subtle}><T k="lists.own-note">Turn on the pencil to edit any line. Lines you don’t change stay the same as the shared emails.</T></p>
            <div className="mt-3 space-y-3">{[1, 2, 3].map(n => <ListEmail key={n} list={list} n={n} />)}</div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" style={subtle}><T k="lists.shared-note">Uses the shared emails (Texts & Scripts, List Emails).</T></p>
            <button type="button" onClick={() => save.mutate({ id: list.id, custom_emails: true })} className={btn} style={{ ...card, ...bright }}>
              <PenLine className="h-4 w-4" aria-hidden="true" /> <T k="lists.customize">Customize Emails</T>
            </button>
          </div>
        )}
      </div>
      {save.error && <p className="mt-2 text-sm text-red-600" role="alert">{save.error.message}</p>}
    </div>
  );
}

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
          <p className="mt-1" style={subtle}><T k="lists.import.note2">Anyone already on this list is skipped. If this list’s follow-up emails are on, imported people get them too, in daily waves.</T></p>
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
  const rows = [['First Name', 'Last Name', 'Email', 'Phone', 'Notes', 'Added By', 'Added', 'Source', 'Emails Sent', 'Stopped', 'Unsubscribed'],
    ...people.map(m => [m.first_name, m.last_name || '', m.email, fmtPhone(m.phone), m.notes || '', m.added_by_name || '', m.created_at.slice(0, 10), SOURCE[m.source] || m.source, m.steps_sent || 0, STOPPED[m.stopped_reason] || '', m.unsubscribed ? 'Yes' : ''])];
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
          <FollowUps list={list} people={people} />
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
                  {m.unsubscribed ? <span className="font-semibold text-red-600">Unsubscribed</span>
                    : m.stopped_reason ? `Stopped: ${STOPPED[m.stopped_reason]}`
                    : m.steps_sent ? `Email ${m.steps_sent} sent ${shortDate(m.last_sent_at)}` : null}
                  {(m.unsubscribed || m.stopped_reason || m.steps_sent > 0) && ' · '}
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
