// src/pages/components/rate-checks/TodayStrip.jsx
// Top of the Rate Checks inbox: today's two numbers and the two ways to add to them.
//   Scans Today   households that sent their policy today, against the agency goal (8.5).
//   You Quoted    people you quoted today (scan or not), against your goal (8).
//   Log a Quote   a walk-in or call-in quoted without a lead, so it still counts.
//   Scan for Customer  scan a customer's policy for them (the staff upload).
// Tapping either number opens the Scans & Quotes tab.
import { useState } from 'react';
import { Camera, ChevronRight, PenLine } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { useScanGoals } from '../../../hooks/useScanGoals';
import { goalText } from '../../../lib/scanGoals';
import { WalkInQuoteSheet } from '../sales/SalesForms';

const card = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)' };

export function Meter({ value, goal, label }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--qs-elevated)' }}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-full rounded-full bg-primary-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ title, value, goal, unit, sub, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="min-w-0 rounded-xl p-3 text-left sm:p-4" style={card}>
      <span className="flex items-center justify-between gap-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>
        <span className="truncate"><T>{title}</T></span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: 'var(--qs-bright)' }}>{value}</span>
        <span className="truncate text-sm" style={{ color: 'var(--qs-dim)' }}><T k="goals.of">of</T> {goalText(goal)}{unit ? <> <T>{unit}</T></> : null}</span>
      </span>
      <Meter value={value} goal={goal} label={title} />
      {sub && <span className="mt-1.5 block truncate text-xs" style={{ color: 'var(--qs-dim)' }}>{sub}</span>}
    </button>
  );
}

export default function TodayStrip({ agencyId, onScan, onOpenGoals }) {
  const { data: g } = useScanGoals(agencyId);
  const [logOpen, setLogOpen] = useState(false);
  if (!g) return null;
  const me = g.me.today;
  const btn = 'inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold';
  return (
    <section className="mb-4" aria-label="Today">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Stat title="Scans Today" value={g.todayScans} goal={g.goalScans} onOpen={onOpenGoals}
          sub={<><T k="goals.month">Month:</T> {g.month.scans} <T k="goals.of">of</T> {g.month.goal}</>} />
        <Stat title="You Quoted" value={me.people} goal={g.goalPeople} unit="People" onOpen={onOpenGoals}
          sub={<>{me.policies} {me.policies === 1 ? <T k="goals.policy">policy</T> : <T k="goals.policies">policies</T>} · {me.with_scan} <T k="goals.with-scan">with a scan</T></>} />
      </div>
      <div className="mt-2 flex gap-2 sm:mt-3">
        <button type="button" onClick={() => setLogOpen(true)} className={btn} style={{ ...card, color: 'var(--qs-text)' }}>
          <PenLine className="h-4 w-4" aria-hidden="true" /><T k="goals.log-quote">Log a Quote</T>
        </button>
        <button type="button" onClick={onScan} className={`${btn} bg-primary-600 text-white hover:bg-primary-700`}>
          <Camera className="h-4 w-4" aria-hidden="true" /><T k="goals.scan-for">Scan for Customer</T>
        </button>
      </div>
      {logOpen && <WalkInQuoteSheet agencyId={agencyId} onClose={() => setLogOpen(false)} />}
    </section>
  );
}
