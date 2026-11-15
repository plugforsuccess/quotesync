// src/pages/CampaignsPage.jsx
// Campaigns (/agency/campaigns, principals only): build email and text campaigns.
//   Drip   steps on days counted from when each person joins (any number, up to 12).
//   Blast  one message to everyone, now or at a set time.
// Audiences: contact lists, Rate Check leads (by where they are), affiliates, Drivers Ed
// students. Emails use the agency's email look; texts say who they're from and how to opt
// out, and only go to people who agreed to texts. Sending is the campaigns-run function
// (hourly, 9am–8pm Eastern). Campaigns are archived, never deleted.
import { useMemo, useState } from 'react';
import { Archive, ArrowLeft, ChevronDown, ChevronUp, Eye, Loader2, Mail, MessageSquare, Pause, Play, Plus, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { useContactLists } from '../hooks/useContactLists';
import { sendCampaignTest, useAudienceCount, useCampaignStats, useCampaigns, useSaveCampaign } from '../hooks/useCampaigns';
import { emailTemplate, textMessage, varsFor } from '../../supabase/functions/campaigns-run/plan.ts';
import { renderEmail } from '../../supabase/functions/_shared/email.ts';

const card = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)' };
const sunk = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };
const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };
const bright = { color: 'var(--qs-bright)' };
const subtle = { color: 'var(--qs-subtle)' };
const btn = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50';
const chip = (on) => `inline-flex min-h-[40px] items-center rounded-full px-3.5 text-sm font-semibold ${on ? 'bg-primary-600 text-white' : ''}`;
const SITE = 'https://insuredbycam.com';

const AUDIENCES = [
  ['lists', 'Contact Lists'],
  ['leads', 'Rate Check Leads'],
  ['affiliates', 'Affiliates'],
  ['dd_students', 'Drivers Ed Students'],
];
const LEAD_STATUSES = [
  ['waiting', 'Waiting for a Quote'],
  ['quoted', 'Quoted, Didn’t Buy'],
  ['won', 'Bought'],
  ['unreadable', 'Couldn’t Read Their Policy'],
];
const BUTTONS = [
  ['rate_check', 'Check My Rate (Rate Check)'],
  ['affiliates', 'Affiliate Program Page'],
  ['courses', 'Defensive Driving Course'],
  ['their_link', 'Their Affiliate Link'],
  ['portal', 'Their Affiliate Portal'],
  ['none', 'No Button'],
];
const STATUS = { draft: 'Draft', active: 'Sending', paused: 'Paused', done: 'Sent' };
const STOPPED = { uploaded: 'Sent their policy', left_audience: 'Left the audience', finished: 'Got every step', already_in_audience: 'Already in the audience (skipped)' };

const newStep = (channel, day) => (channel === 'text'
  ? { id: crypto.randomUUID(), channel: 'text', day, body: 'Cam Wiley Agency: Hi [first name], want a free rate check? Snap a photo of your policy: [link]', button: 'rate_check' }
  : {
    id: crypto.randomUUID(), channel: 'email', day, subject: 'Quick question, [first name]',
    body: 'Hi [first name],\n\nHave you checked your insurance rate lately? It takes about a minute: upload your current policy and a licensed agent on my team checks whether Allstate can beat it.\n\nCam Wiley\nCam Wiley Agency',
    button: 'rate_check', button_label: 'Check My Rate',
  });

const blank = () => ({
  name: '', kind: 'drip', status: 'draft', audience: { type: 'lists', list_ids: [] },
  steps: [newStep('email', 0)], include_existing: true, stop_on_upload: true, send_at: null,
});

function audienceLine(a, lists) {
  if (!a?.type) return '';
  if (a.type === 'lists') {
    const names = (a.list_ids || []).map(id => lists.find(l => l.id === id)?.name).filter(Boolean);
    return names.length ? `Lists: ${names.join(', ')}` : 'All contact lists';
  }
  if (a.type === 'leads') return `Rate Check leads: ${(a.statuses || []).map(s => LEAD_STATUSES.find(x => x[0] === s)?.[1]).filter(Boolean).join(', ') || 'none picked'}`;
  if (a.type === 'affiliates') return a.which === 'all' ? 'All affiliates' : 'Active affiliates';
  return a.which === 'completed' ? 'Drivers Ed students who finished' : 'All Drivers Ed students';
}

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary-600' : 'bg-slate-400/50'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Toggle({ on, onChange, title, note }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold" style={bright}>{title}</p>
        {note && <p className="text-xs" style={subtle}>{note}</p>}
      </div>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

// ── Audience ────────────────────────────────────────────────────────────────
function AudienceCard({ c, set, locked }) {
  const { data: lists = [] } = useContactLists();
  const a = c.audience || {};
  const { data: count, isFetching } = useAudienceCount(a);
  const pick = (type) => set({ audience: type === 'lists' ? { type, list_ids: [] } : type === 'leads' ? { type, statuses: ['quoted'] } : type === 'affiliates' ? { type, which: 'active' } : { type, which: 'all' } });
  const toggleIn = (key, v) => {
    const cur = a[key] || [];
    set({ audience: { ...a, [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] } });
  };
  return (
    <section className="rounded-xl p-4" style={card} aria-labelledby="camp-aud">
      <h2 id="camp-aud" className="font-bold" style={bright}><T k="camp.audience">Who It Goes To</T></h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {AUDIENCES.map(([k, label]) => (
          <button key={k} type="button" disabled={locked} aria-pressed={a.type === k} onClick={() => pick(k)} className={chip(a.type === k)} style={a.type === k ? undefined : { ...sunk, ...bright }}><T>{label}</T></button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.type === 'lists' && (lists.length ? lists.map(l => {
          const on = (a.list_ids || []).includes(l.id);
          return <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleIn('list_ids', l.id)} className={chip(on)} style={on ? undefined : { ...sunk, ...bright }}>{l.name}</button>;
        }) : <p className="text-sm" style={subtle}><T k="camp.no-lists">No lists yet. Make one on the Lists page.</T></p>)}
        {a.type === 'leads' && LEAD_STATUSES.map(([k, label]) => {
          const on = (a.statuses || []).includes(k);
          return <button key={k} type="button" aria-pressed={on} onClick={() => toggleIn('statuses', k)} className={chip(on)} style={on ? undefined : { ...sunk, ...bright }}><T>{label}</T></button>;
        })}
        {(a.type === 'affiliates' || a.type === 'dd_students') && (a.type === 'affiliates' ? [['active', 'Active Only'], ['all', 'All Affiliates']] : [['all', 'Everyone Who Signed Up'], ['completed', 'Finished the Course']]).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={a.which === k} onClick={() => set({ audience: { ...a, which: k } })} className={chip(a.which === k)} style={a.which === k ? undefined : { ...sunk, ...bright }}><T>{label}</T></button>
        ))}
      </div>
      {a.type === 'lists' && !(a.list_ids || []).length && lists.length > 0 && <p className="mt-2 text-xs" style={subtle}><T k="camp.all-lists">None picked = every list.</T></p>}
      <p className="mt-3 text-sm" style={bright} aria-live="polite">
        {isFetching && !count ? <Loader2 className="inline h-4 w-4 animate-spin" aria-label="Counting" /> : count ? (
          <><span className="font-bold">{count.people}</span> {count.people === 1 ? 'person' : 'people'} · {count.email} <T k="camp.can-email">can get emails</T> · {count.text} <T k="camp.can-text">can get texts</T>
            {count.sample?.length > 0 && <span style={subtle}> · {count.sample.join(', ')}{count.people > count.sample.length ? '…' : ''}</span>}</>
        ) : null}
      </p>
      <p className="mt-1 text-xs" style={subtle}><T k="camp.text-note">Texts only go to people who agreed to texts (the text box on their Rate Check, or an affiliate’s program terms) and never to anyone who replied STOP.</T></p>
    </section>
  );
}

// ── One step ────────────────────────────────────────────────────────────────
function StepCard({ step, i, n, c, set, savedId }) {
  const steps = c.steps;
  const update = (patch) => set({ steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const remove = () => set({ steps: steps.filter((_, j) => j !== i) });
  const move = (d) => { const s = [...steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; set({ steps: s }); };
  const [preview, setPreview] = useState(false);
  const [test, setTest] = useState({ busy: false, note: '', error: false, phone: '' });
  const isText = step.channel === 'text';
  const fields = ['[first name]', '[link]', ...(c.audience?.type === 'affiliates' ? ['[affiliate link]', '[portal link]'] : [])];
  const sample = varsFor({ first_name: 'Dana', extra: { code: 'SAMPLE01', portal_token: 'sample' } }, step, SITE);
  const textOut = isText ? textMessage(step, sample) : '';
  const segments = textOut.length <= 160 ? 1 : Math.ceil(textOut.length / 153);
  const dirty = !savedId;

  const sendTest = async () => {
    setTest(t => ({ ...t, busy: true, note: '', error: false }));
    try {
      const r = await sendCampaignTest({ campaignId: savedId, step: i, phone: test.phone });
      setTest(t => ({ ...t, busy: false, note: `Sent to ${r.sent_to}.` }));
    } catch (e) {
      setTest(t => ({ ...t, busy: false, note: e.message, error: true }));
    }
  };

  return (
    <article className="rounded-xl p-4" style={card} aria-label={`Step ${i + 1}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={bright}>{c.kind === 'blast' ? <T k="camp.message">Message</T> : <>Step {i + 1}</>}</span>
        <div className="inline-flex rounded-lg p-0.5" style={sunk} role="radiogroup" aria-label={`Step ${i + 1} channel`}>
          {[['email', 'Email', Mail], ['text', 'Text', MessageSquare]].map(([k, label, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={step.channel === k} onClick={() => update(k === 'text' ? { channel: 'text' } : { channel: 'email', subject: step.subject || 'Quick question, [first name]', button_label: step.button_label || 'Check My Rate' })}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${step.channel === k ? 'bg-primary-600 text-white' : ''}`} style={step.channel === k ? undefined : bright}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        {c.kind === 'drip' && (
          <label className="inline-flex items-center gap-1.5 text-sm" style={bright}>
            <T k="camp.day">Day</T>
            <input inputMode="numeric" value={step.day} onChange={e => update({ day: Math.min(365, Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0) })}
              aria-label={`Step ${i + 1} day`} className="h-9 w-14 rounded-lg px-2 text-center text-base font-semibold tabular-nums" style={field} />
          </label>
        )}
        <span className="ml-auto flex gap-1">
          {c.kind === 'drip' && i > 0 && <button type="button" onClick={() => move(-1)} aria-label="Move up" className="rounded-lg p-2" style={subtle}><ChevronUp className="h-4 w-4" /></button>}
          {c.kind === 'drip' && i < n - 1 && <button type="button" onClick={() => move(1)} aria-label="Move down" className="rounded-lg p-2" style={subtle}><ChevronDown className="h-4 w-4" /></button>}
          {n > 1 && <button type="button" onClick={remove} aria-label={`Remove step ${i + 1}`} className="rounded-lg p-2" style={subtle}><Trash2 className="h-4 w-4" /></button>}
        </span>
      </div>
      {c.kind === 'drip' && <p className="mt-1 text-xs" style={subtle}>{step.day === 0 ? 'The day they join' : `${step.day} ${step.day === 1 ? 'day' : 'days'} after they join`}</p>}

      {!isText && (
        <label className="mt-3 block text-sm" style={subtle}><T k="camp.subject">Subject</T>
          <input value={step.subject || ''} onChange={e => update({ subject: e.target.value.slice(0, 120) })} className="mt-1 h-11 w-full rounded-lg px-3 text-base" style={field} />
        </label>
      )}
      <label className="mt-3 block text-sm" style={subtle}>{isText ? <T k="camp.text">Text</T> : <T k="camp.body">Message</T>}
        <textarea value={step.body || ''} onChange={e => update({ body: e.target.value.slice(0, isText ? 480 : 4000) })} rows={isText ? 4 : 8}
          className="mt-1 w-full rounded-lg px-3 py-2 text-base leading-relaxed" style={field} />
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={subtle}>
        <span><T k="camp.insert">Insert:</T></span>
        {fields.map(f => <button key={f} type="button" onClick={() => update({ body: `${step.body || ''}${(step.body || '').endsWith(' ') || !step.body ? '' : ' '}${f}` })} className="rounded-full px-2 py-1 font-semibold" style={sunk}>{f}</button>)}
        {!isText && <span className="basis-full"><T k="camp.lines">Each line is its own paragraph.</T></span>}
        {isText && <span className="basis-full">{textOut.length} characters · {segments} {segments === 1 ? 'text' : 'texts'} · <T k="camp.text-adds">“Cam Wiley Agency:” and “Reply STOP to opt out.” are added if missing.</T></span>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm" style={subtle}>{isText ? <T k="camp.link-to">[link] Goes To</T> : <T k="camp.button">Button</T>}
          <select value={step.button || 'rate_check'} onChange={e => update({ button: e.target.value })} className="mt-1 h-11 w-full rounded-lg px-3 text-base" style={field}>
            {BUTTONS.filter(([k]) => (c.audience?.type === 'affiliates' || !['their_link', 'portal'].includes(k)) && !(isText && k === 'none')).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {!isText && step.button !== 'none' && (
          <label className="block text-sm" style={subtle}><T k="camp.button-label">Button Words</T>
            <input value={step.button_label || ''} onChange={e => update({ button_label: e.target.value.slice(0, 40) })} className="mt-1 h-11 w-full rounded-lg px-3 text-base" style={field} />
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPreview(v => !v)} aria-expanded={preview} className={btn} style={{ ...sunk, ...bright }}>
          <Eye className="h-4 w-4" aria-hidden="true" />{preview ? <T k="camp.hide-preview">Hide Preview</T> : <T k="camp.preview">Preview</T>}
        </button>
        {isText && <input value={test.phone} onChange={e => setTest(t => ({ ...t, phone: e.target.value.replace(/[^\d() -]/g, '').slice(0, 14) }))} inputMode="tel" placeholder="Your cell" aria-label="Your cell number for the test" className="h-11 w-36 rounded-lg px-3 text-base" style={field} />}
        <button type="button" onClick={sendTest} disabled={test.busy || dirty} title={dirty ? 'Save first' : undefined} className={`${btn} bg-primary-600 text-white`}>
          {test.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}<T k="camp.send-test">Send Me a Test</T>
        </button>
        {dirty && <span className="text-xs" style={subtle}><T k="camp.save-to-test">Save to send a test.</T></span>}
        {test.note && <span role="status" className="basis-full text-sm" style={{ color: test.error ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>{test.note}</span>}
      </div>
      {preview && (isText ? (
        <div className="mt-3 max-w-sm rounded-2xl rounded-bl-md px-4 py-3 text-[15px] leading-snug" style={{ background: 'var(--qs-elevated)', ...bright }} aria-label="Text preview">{textOut}</div>
      ) : (
        <EmailPreview step={step} vars={sample} />
      ))}
    </article>
  );
}

function EmailPreview({ step, vars }) {
  const msg = useMemo(() => renderEmail({ template: emailTemplate(step), saved: {}, vars, unsubscribeUrl: `${SITE}/` }), [step, vars]);
  return (
    <div className="mt-3 overflow-hidden rounded-xl" style={sunk}>
      <p className="px-3 py-2 text-sm" style={bright}><span style={subtle}><T k="camp.subject">Subject</T>: </span>{msg.subject}</p>
      <iframe title="Email preview" srcDoc={msg.html} sandbox="" className="h-[520px] w-full border-0 bg-white" />
    </div>
  );
}

// ── How it's going ──────────────────────────────────────────────────────────
function Stats({ c }) {
  const { data: s } = useCampaignStats(c.id);
  if (!s) return null;
  return (
    <section className="rounded-xl p-4" style={card} aria-labelledby="camp-stats">
      <h2 id="camp-stats" className="font-bold" style={bright}><T k="camp.how">How It’s Going</T></h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[['In It', s.joined], ['Still Going', s.active], ['Sent Their Policy', s.uploaded]].map(([k, v]) => (
          <div key={k} className="rounded-lg px-2 py-2" style={sunk}><dt className="text-[11px]" style={subtle}><T>{k}</T></dt><dd className="text-xl font-bold tabular-nums" style={bright}>{v}</dd></div>
        ))}
      </dl>
      <ul className="mt-3 space-y-1 text-sm" style={bright}>
        {c.steps.map((st, i) => {
          const r = s.steps[i] || {};
          return <li key={st.id || i}>{c.kind === 'blast' ? 'Message' : `Step ${i + 1}`} ({st.channel === 'text' ? 'text' : 'email'}): {r.sent || 0} sent{r.skipped ? `, ${r.skipped} skipped` : ''}{r.failed ? `, ${r.failed} failed` : ''}</li>;
        })}
      </ul>
      {Object.keys(s.stopped).length > 0 && (
        <p className="mt-2 text-xs" style={subtle}><T k="camp.stopped">Stopped:</T> {Object.entries(s.stopped).map(([k, v]) => `${STOPPED[k] || k} ${v}`).join(' · ')}</p>
      )}
    </section>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────
function Editor({ initial, onClose }) {
  const [c, setC] = useState(initial);
  const [savedId, setSavedId] = useState(initial.id || null);
  const [dirtyAt, setDirtyAt] = useState(0);
  const save = useSaveCampaign();
  const { data: count } = useAudienceCount(c.audience);
  const set = (patch) => { setC(x => ({ ...x, ...patch })); setDirtyAt(Date.now()); };
  const started = c.status !== 'draft';
  const days = c.steps.map(s => Number(s.day) || 0);
  const outOfOrder = c.kind === 'drip' && days.some((d, i) => i && d < days[i - 1]);
  const problems = [
    !c.name.trim() && 'Give it a name.',
    !c.steps.length && 'Add a step.',
    c.steps.some(s => !String(s.body || '').trim()) && 'Every step needs a message.',
    c.audience?.type === 'leads' && !(c.audience.statuses || []).length && 'Pick which Rate Check leads.',
    outOfOrder && 'Put the steps in day order.',
  ].filter(Boolean);

  const persist = async (extra = {}) => {
    const fields = {
      name: c.name.trim(), kind: c.kind, audience: c.audience, steps: c.kind === 'blast' ? c.steps.slice(0, 1) : c.steps,
      include_existing: c.include_existing, stop_on_upload: c.stop_on_upload, send_at: c.send_at, ...extra,
    };
    const row = await save.mutateAsync(savedId ? { id: savedId, ...fields } : fields);
    setSavedId(row.id);
    setC(row);
    setDirtyAt(0);
    return row;
  };
  const start = async () => {
    const who = count ? `${count.people} ${count.people === 1 ? 'person' : 'people'}` : 'this audience';
    const when = c.kind === 'blast' && c.send_at && new Date(c.send_at) > new Date() ? ` on ${new Date(c.send_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '';
    if (!window.confirm(`Start sending to ${who}${when}? Messages go out between 9am and 8pm Eastern.`)) return;
    await persist({ status: 'active', started_at: new Date().toISOString(), ...(c.kind === 'blast' && !c.send_at ? { send_at: new Date().toISOString() } : {}) });
  };

  const localSendAt = c.send_at ? new Date(new Date(c.send_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return (
    <div className="space-y-4">
      <button type="button" onClick={onClose} className={`${btn} -ml-2`} style={subtle}><ArrowLeft className="h-4 w-4" aria-hidden="true" /><T k="camp.back">All Campaigns</T></button>

      <section className="rounded-xl p-4" style={card}>
        <label className="block text-sm" style={subtle}><T k="camp.name">Campaign Name</T>
          <input value={c.name} onChange={e => set({ name: e.target.value.slice(0, 80) })} placeholder="e.g. Quoted, Didn’t Buy: 3 Check-Ins" className="mt-1 h-11 w-full rounded-lg px-3 text-base" style={field} />
        </label>
        <div className="mt-3 inline-flex rounded-lg p-0.5" style={sunk} role="radiogroup" aria-label="Campaign type">
          {[['drip', 'Drip'], ['blast', 'One-Time Blast']].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={c.kind === k} disabled={started} onClick={() => set({ kind: k, steps: k === 'blast' ? c.steps.slice(0, 1).map(s => ({ ...s, day: 0 })) : c.steps })}
              className={`inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold ${c.kind === k ? 'bg-primary-600 text-white' : ''}`} style={c.kind === k ? undefined : bright}><T>{label}</T></button>
          ))}
        </div>
        <p className="mt-2 text-xs" style={subtle}>{c.kind === 'drip'
          ? <T k="camp.drip-note">Steps go out on their days, counted from when each person joins. New people join as they come into the audience.</T>
          : <T k="camp.blast-note">One message to everyone in the audience, now or at a time you pick.</T>}</p>
      </section>

      <AudienceCard c={c} set={set} locked={false} />

      <section className="space-y-3 rounded-xl p-4" style={card}>
        {c.kind === 'drip' ? (
          <>
            <Toggle on={c.include_existing} onChange={v => set({ include_existing: v })} title="Include People Already in the Audience"
              note={c.include_existing ? 'Everyone in it now gets step 1, plus anyone who joins later.' : 'Only people who join from now on.'} />
            <Toggle on={c.stop_on_upload} onChange={v => set({ stop_on_upload: v })} title="Stop When They Send Their Policy" note="They’re done once they upload; they leave anyway when they no longer match the audience." />
          </>
        ) : (
          <label className="block text-sm" style={subtle}><T k="camp.send-at">Send At</T>
            <input type="datetime-local" value={localSendAt} onChange={e => set({ send_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="mt-1 h-11 w-full rounded-lg px-3 text-base sm:w-72" style={field} />
            <span className="mt-1 block text-xs"><T k="camp.send-now">Leave empty to send when you start it. Messages go out 9am–8pm Eastern.</T></span>
          </label>
        )}
      </section>

      {c.steps.map((s, i) => <StepCard key={s.id || i} step={s} i={i} n={c.steps.length} c={c} set={set} savedId={dirtyAt ? null : savedId} />)}
      {c.kind === 'drip' && c.steps.length < 12 && (
        <div className="flex flex-wrap gap-2">
          {[['email', 'Add Email', Mail], ['text', 'Add Text', MessageSquare]].map(([ch, label, Icon]) => (
            <button key={ch} type="button" onClick={() => set({ steps: [...c.steps, newStep(ch, (Number(c.steps.at(-1)?.day) || 0) + 3)] })} className={btn} style={{ ...sunk, ...bright }}>
              <Plus className="h-4 w-4" aria-hidden="true" /><Icon className="h-4 w-4" aria-hidden="true" /><T>{label}</T>
            </button>
          ))}
        </div>
      )}

      {started && savedId && <Stats c={c} />}

      <div className="flex flex-wrap items-center gap-2 rounded-xl p-4" style={card}>
        {problems.length > 0 && <p className="basis-full text-sm" style={{ color: 'var(--qs-warning)' }} role="alert">{problems[0]}</p>}
        {save.error && <p className="basis-full text-sm text-red-600" role="alert">{save.error.message}</p>}
        <button type="button" disabled={save.isPending || !c.name.trim()} onClick={() => persist()} className={btn} style={{ ...sunk, ...bright }}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{started ? <T k="camp.save">Save Changes</T> : <T k="camp.save-draft">Save Draft</T>}
        </button>
        {c.status === 'draft' && (
          <button type="button" disabled={save.isPending || problems.length > 0} onClick={start} className={`${btn} bg-primary-600 text-white`}>
            <Play className="h-4 w-4" aria-hidden="true" />{c.kind === 'blast' ? <T k="camp.start-blast">Send It</T> : <T k="camp.start">Start Campaign</T>}
          </button>
        )}
        {c.status === 'active' && (
          <button type="button" disabled={save.isPending} onClick={() => persist({ status: 'paused' })} className={btn} style={{ ...sunk, ...bright }}><Pause className="h-4 w-4" aria-hidden="true" /><T k="camp.pause">Pause</T></button>
        )}
        {c.status === 'paused' && (
          <button type="button" disabled={save.isPending || problems.length > 0} onClick={() => persist({ status: 'active' })} className={`${btn} bg-primary-600 text-white`}><Play className="h-4 w-4" aria-hidden="true" /><T k="camp.resume">Resume</T></button>
        )}
        {savedId && !c.archived_at && (
          <button type="button" onClick={async () => { if (window.confirm('Archive this campaign? It stops sending and moves to Archived.')) { await persist({ archived_at: new Date().toISOString(), status: c.status === 'active' ? 'paused' : c.status }); onClose(); } }}
            className={`${btn} ml-auto`} style={subtle}><Archive className="h-4 w-4" aria-hidden="true" /><T k="camp.archive">Archive</T></button>
        )}
        {c.archived_at && (
          <button type="button" onClick={() => persist({ archived_at: null })} className={`${btn} ml-auto`} style={subtle}><RotateCcw className="h-4 w-4" aria-hidden="true" /><T k="camp.restore">Restore</T></button>
        )}
      </div>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: lists = [] } = useContactLists();
  const [open, setOpen] = useState(null); // a campaign, or blank() for a new one
  const [showArchived, setShowArchived] = useState(false);
  const live = campaigns.filter(c => !c.archived_at);
  const archived = campaigns.filter(c => c.archived_at);

  if (open) return <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6"><Editor key={open.id || 'new'} initial={open} onClose={() => setOpen(null)} /></div>;

  const row = (c) => (
    <li key={c.id}>
      <button type="button" onClick={() => setOpen(c)} className="flex w-full items-start gap-3 rounded-xl p-4 text-left" style={card}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={sunk} aria-hidden="true">
          {c.steps?.every(s => s.channel === 'text') ? <MessageSquare className="h-5 w-5" style={bright} /> : <Mail className="h-5 w-5" style={bright} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate font-semibold" style={bright}>{c.name}</span>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.status === 'active' ? 'var(--qs-info)' : c.status === 'paused' ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>{STATUS[c.status]}</span>
          </span>
          <span className="block truncate text-sm" style={subtle}>
            {c.kind === 'blast' ? 'One-time blast' : `Drip · ${c.steps?.length || 0} ${(c.steps?.length || 0) === 1 ? 'step' : 'steps'}`} · {audienceLine(c.audience, lists)}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={bright}><T k="camp.title">Campaigns</T></h1>
          <p className="mt-1 text-sm" style={subtle}><T k="camp.intro">Emails and texts on a schedule (drips) or all at once (blasts), to your lists, Rate Check leads, affiliates or Drivers Ed students.</T></p>
        </div>
        <button type="button" onClick={() => setOpen(blank())} className={`${btn} shrink-0 bg-primary-600 text-white`}><Plus className="h-4 w-4" aria-hidden="true" /><T k="camp.new">New Campaign</T></button>
      </div>

      {isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" style={subtle} aria-label="Loading" />}
      {!isLoading && !live.length && (
        <div className="rounded-xl p-6 text-center" style={card}>
          <p className="font-semibold" style={bright}><T k="camp.empty">No campaigns yet.</T></p>
          <p className="mt-1 text-sm" style={subtle}><T k="camp.empty-line">Start with a check-in for people who were quoted but didn’t buy, or a note to your affiliates.</T></p>
        </div>
      )}
      {live.length > 0 && <ul className="space-y-2" aria-label="Campaigns">{live.map(row)}</ul>}

      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived(v => !v)} className="inline-flex items-center gap-1 text-sm font-semibold underline" style={subtle} aria-expanded={showArchived}>
            {showArchived ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}{showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <ul className="mt-2 space-y-2" aria-label="Archived campaigns">{archived.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
