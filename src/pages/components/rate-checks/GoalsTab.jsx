// src/pages/components/rate-checks/GoalsTab.jsx
// Scans & Quotes (Rate Checks → More → Scans & Quotes).
//   • Scans: households that sent their policy, against the agency goal (8.5 a day):
//     today, this week, this month's pace, the last 14 days, and where they came from.
//   • Team: people each producer quoted (goal 8 a day), policies, Scan Rate and the
//     scans their own links and in-person scans brought in. Producers see only themselves.
//   • Principal: set the two goals and share a read-only report link.
import { useState } from 'react';
import { Copy, Link2, Share2, X } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { useCreateScanReportLink, useRevokeScanReportLink, useSaveScanGoals, useScanGoals, useScanReportLinks } from '../../../hooks/useScanGoals';
import { goalText, scanRate } from '../../../lib/scanGoals';
import { Meter } from './TodayStrip';
import { inputStyle } from './ui';

const card = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)' };
const h2 = 'text-base font-bold';
const dayName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' });
const dayLong = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Daily bars with the goal as a dashed line. Shared with the public report. */
export function DayBars({ days, goal, light = false }) {
  const top = Math.max(goal * 1.25, ...days.map(d => d.n), 1);
  const muted = light ? '#64748b' : 'var(--qs-subtle)';
  return (
    <div>
      <div className="relative flex h-32 items-end gap-1" role="img"
        aria-label={`Scans per day: ${days.map(d => `${dayLong(d.day)} ${d.n}`).join(', ')}. Goal ${goalText(goal)} a day.`}>
        {goal > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${(goal / top) * 100}%`, borderColor: light ? '#93c5fd' : 'var(--qs-info, #60a5fa)' }} aria-hidden="true" />
        )}
        {days.map(d => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLong(d.day)}: ${d.n}`}>
            <div className={`w-full rounded-t ${d.n >= goal && goal > 0 ? 'bg-primary-600' : 'bg-primary-400'}`} style={{ height: `${d.n ? Math.max(4, (d.n / top) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t pt-1" style={{ borderColor: light ? '#e2e8f0' : 'var(--qs-border)' }} aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 text-center text-[10px] tabular-nums" style={{ color: muted }}>
            {days.length > 16 ? (i % 5 === 0 ? Number(d.day.slice(8)) : '') : dayName(d.day)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Big({ title, value, goal, sub, children }) {
  return (
    <div className="min-w-0 rounded-xl p-3 sm:p-4" style={card}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide sm:text-xs" style={{ color: 'var(--qs-subtle)' }}><T>{title}</T></p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: 'var(--qs-bright)' }}>{value}</span>
        {goal != null && <span className="text-xs sm:text-sm" style={{ color: 'var(--qs-dim)' }}><T k="goals.of">of</T> {goal}</span>}
      </p>
      {goal != null && <Meter value={Number(value) || 0} goal={Number(goal) || 0} label={title} />}
      {sub && <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-dim)' }}>{sub}</p>}
      {children}
    </div>
  );
}

function GoalSettings({ agencyId, g }) {
  const save = useSaveScanGoals();
  const [scans, setScans] = useState(String(g.goalScans));
  const [people, setPeople] = useState(String(g.goalPeople));
  const s = Number(scans); const p = Math.round(Number(people));
  const ok = scans !== '' && people !== '' && s >= 0 && s <= 500 && p >= 0 && p <= 100;
  const changed = s !== g.goalScans || p !== g.goalPeople;
  const field = 'mt-1 h-11 w-full rounded-lg px-3 text-base tabular-nums';
  return (
    <section className="rounded-xl p-4" style={card} aria-labelledby="goals-set">
      <h2 id="goals-set" className={h2} style={{ color: 'var(--qs-bright)' }}><T k="goals.set.title">Daily Goals</T></h2>
      <div className="mt-3 grid grid-cols-2 items-end gap-3">
        <label className="block text-sm" style={{ color: 'var(--qs-dim)' }}>
          <T k="goals.set.scans">Scans a Day (Agency)</T>
          <input inputMode="decimal" value={scans} onChange={e => setScans(e.target.value.replace(/[^0-9.]/g, ''))} className={field} style={inputStyle} />
        </label>
        <label className="block text-sm" style={{ color: 'var(--qs-dim)' }}>
          <T k="goals.set.people">Quotes A Day (Each)</T>
          <input inputMode="numeric" value={people} onChange={e => setPeople(e.target.value.replace(/\D/g, ''))} className={field} style={inputStyle} />
        </label>
      </div>
      {save.error && <p className="mt-2 text-sm text-red-600" role="alert">{save.error.message}</p>}
      <button type="button" disabled={!ok || !changed || save.isPending}
        onClick={() => save.mutate({ agencyId, scans: s, people: p })}
        className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
        {save.isPending ? <T k="goals.set.saving">Saving…</T> : <T k="goals.set.save">Save Goals</T>}
      </button>
    </section>
  );
}

function ShareReport({ agencyId }) {
  const { data: links = [] } = useScanReportLinks(agencyId);
  const create = useCreateScanReportLink();
  const revoke = useRevokeScanReportLink();
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(null);
  const urlOf = (l) => `${window.location.origin}/report/${l.token}`;
  const share = async (l) => {
    const url = urlOf(l);
    try {
      if (navigator.share) { await navigator.share({ title: 'Scans & Quotes', url }); return; }
    } catch { /* fall back to copy */ }
    try { await navigator.clipboard.writeText(url); setCopied(l.id); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };
  return (
    <section className="rounded-xl p-4" style={card} aria-labelledby="goals-share">
      <h2 id="goals-share" className={h2} style={{ color: 'var(--qs-bright)' }}><T k="goals.share.title">Share a Report</T></h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--qs-dim)' }}><T k="goals.share.body">A read-only page with the last 30 days: scans, where they came from, people quoted, Scan Rate and binds. Team totals only, no customer or producer names. Turn a link off any time.</T></p>
      <div className="mt-3 flex gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Who it's for (optional)" maxLength={80}
          aria-label="Who the link is for" className="h-11 min-w-0 flex-1 rounded-lg px-3 text-base" style={inputStyle} />
        <button type="button" disabled={create.isPending} onClick={() => create.mutate({ agencyId, label }, { onSuccess: () => setLabel('') })}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Link2 className="h-4 w-4" aria-hidden="true" /><T k="goals.share.make">Make Link</T>
        </button>
      </div>
      {links.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg" style={{ ...inputStyle, borderColor: 'var(--qs-border)' }}>
          {links.map(l => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2" style={{ borderColor: 'var(--qs-border)' }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{l.label || 'Report link'}</p>
                <p className="truncate text-xs" style={{ color: 'var(--qs-subtle)' }}>{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <button type="button" onClick={() => share(l)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={card}>
                {navigator.share ? <Share2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === l.id ? <T k="goals.share.copied">Copied</T> : navigator.share ? <T k="goals.share.share">Share</T> : <T k="goals.share.copy">Copy</T>}
              </button>
              <button type="button" onClick={() => { if (window.confirm('Turn this link off? Anyone who has it won’t be able to open the report.')) revoke.mutate({ id: l.id, agencyId }); }}
                aria-label="Turn link off" title="Turn link off" className="inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ color: 'var(--qs-subtle)' }}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonRow({ p, goal }) {
  const rate = scanRate(p.month);
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate font-semibold" style={{ color: 'var(--qs-bright)' }}>{p.name}</p>
        <p className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--qs-dim)' }}>
          <span className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{p.today.people}</span> <T k="goals.of">of</T> {goal} <T k="goals.today">today</T>
        </p>
      </div>
      <Meter value={p.today.people} goal={goal} label={`${p.name} people quoted today`} />
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ['This Week', p.week.people, 'people'],
          ['Policies', p.week.policies, 'this week'],
          ['Scan Rate', rate == null ? '—' : `${rate}%`, 'this month'],
          ['Scans', p.month.scans, 'brought in'],
        ].map(([k, v, s]) => (
          <div key={k} className="min-w-0 rounded-lg px-1 py-1.5" style={{ background: 'var(--qs-elevated)' }}>
            <dt className="truncate text-[11px]" style={{ color: 'var(--qs-subtle)' }}><T>{k}</T></dt>
            <dd className="text-base font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{v}</dd>
            <dd className="truncate text-[10px]" style={{ color: 'var(--qs-subtle)' }}><T>{s}</T></dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export default function GoalsTab({ agencyId }) {
  const { data: g, isLoading, error } = useScanGoals(agencyId);
  if (isLoading) return <p className="py-10 text-center text-sm" style={{ color: 'var(--qs-dim)' }}><T k="goals.loading">Loading…</T></p>;
  if (error || !g) return <p className="py-10 text-center text-sm text-red-600" role="alert"><T k="goals.error">Couldn’t load Scans &amp; Quotes.</T> {error?.message}</p>;
  const m = g.month;
  const onPace = m.scans >= m.pace;
  const totalSources = g.sources.reduce((t, s) => t + s.n, 0);
  const teamRate = scanRate(g.team.month);
  const shown = g.isManager ? g.people.filter(p => p.role || p.month.people || p.month.scans) : g.people;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="goals.title">Scans &amp; Quotes</T></h2>
        <p className="text-sm" style={{ color: 'var(--qs-dim)' }}>
          <T k="goals.sub">Scans are households that sent their policy. Quotes are people quoted, scan or not.</T>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Big title="Today" value={g.todayScans} goal={goalText(g.goalScans)}
          sub={<T k="goals.scans-sub">scans</T>} />
        <Big title="This Week" value={g.weekScans}
          sub={<>{goalText(g.weekAvg)} <T k="goals.a-day">a day</T></>} />
        <Big title="This Month" value={m.scans} goal={m.goal}
          sub={<><span className="font-semibold" style={{ color: onPace ? 'var(--qs-bright)' : 'var(--qs-warning)' }}>{onPace ? <T k="goals.on-pace">On Pace</T> : <T k="goals.behind">Behind Pace</T>}</span><br /><T k="goals.on-track-for">on track for</T> {m.projected}</>} />
      </div>

      <section className="rounded-xl p-4" style={card} aria-labelledby="goals-14">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="goals-14" className={h2} style={{ color: 'var(--qs-bright)' }}><T k="goals.last14">Last 14 Days</T></h2>
          <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}><T k="goals.dashed">Dashed line: goal</T></span>
        </div>
        <div className="mt-3"><DayBars days={g.last14} goal={g.goalScans} /></div>
      </section>

      <section className="rounded-xl p-4" style={card} aria-labelledby="goals-src">
        <h2 id="goals-src" className={h2} style={{ color: 'var(--qs-bright)' }}><T k="goals.sources">Where Scans Come From</T> <span className="text-sm font-normal" style={{ color: 'var(--qs-subtle)' }}>· <T k="goals.this-month">this month</T></span></h2>
        <ul className="mt-3 space-y-2.5">
          {g.sources.map(s => (
            <li key={s.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span style={{ color: 'var(--qs-text)' }}><T>{s.label}</T></span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{s.n}</span>
              </div>
              <Meter value={s.n} goal={Math.max(totalSources, 1)} label={s.label} />
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl" style={card} aria-labelledby="goals-team">
        <div className="px-4 pt-4">
          <h2 id="goals-team" className={h2} style={{ color: 'var(--qs-bright)' }}>{g.isManager ? <T k="goals.team">People Quoted</T> : <T k="goals.you">Your Quotes</T>}</h2>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-dim)' }}>
            <T k="goals.team.sub">Goal: each producer quotes</T> {g.goalPeople} <T k="goals.team.sub2">people a day. Save walk-ins and call-ins too, so they count.</T>
          </p>
          {g.isManager && (
            <p className="mt-2 text-sm" style={{ color: 'var(--qs-dim)' }}>
              <T k="goals.team.today">Team today:</T> <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{g.team.today.people}</span> <T k="goals.people">people</T> · {g.team.today.policies} <T k="goals.policies">policies</T> · <T k="goals.scan-rate">Scan Rate</T> {teamRate == null ? '—' : `${teamRate}%`} <T k="goals.this-month">this month</T>
            </p>
          )}
        </div>
        {shown.length ? (
          <ul className="mt-2 divide-y" style={{ borderColor: 'var(--qs-border)' }}>
            {shown.map(p => <PersonRow key={p.user_id} p={p} goal={g.goalPeople} />)}
          </ul>
        ) : <p className="px-4 pb-4 pt-2 text-sm" style={{ color: 'var(--qs-dim)' }}><T k="goals.none">No quotes logged yet.</T></p>}
      </section>

      {g.isManager && <GoalSettings agencyId={agencyId} g={g} />}
      {g.isManager && <ShareReport agencyId={agencyId} />}

      <details className="rounded-xl p-4 text-sm" style={card}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="goals.how.title">How It Counts</T></summary>
        <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: 'var(--qs-dim)' }}>
          <li><T k="goals.how.1">A scan is one household, counted on the day its first policy arrives. Auto and home from the same family is one scan.</T></li>
          <li><T k="goals.how.2">People Quoted counts each household once a day, whether or not they scanned. Policies counts each policy on those quotes.</T></li>
          <li><T k="goals.how.3">Scan Rate is the share of people quoted who sent their policy first.</T></li>
          <li><T k="goals.how.4">A producer’s scans are the ones from their links, Quick Sends and Scan for Customer. Affiliate scans count for the agency, not a producer.</T></li>
          <li><T k="goals.how.5">Days run midnight to midnight, Georgia time. Test records don’t count.</T></li>
        </ul>
      </details>
    </div>
  );
}
