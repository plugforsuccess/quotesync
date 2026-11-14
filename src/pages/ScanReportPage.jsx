// src/pages/ScanReportPage.jsx
// /report/:token — the read-only Scans & Quotes report a principal shares with people
// outside the agency. Last 30 days of team totals: scans a day against the goal, where
// they came from, people quoted, Scan Rate and binds. No customer or producer names.
// Light, consumer-site look. No black.
import { useParams } from 'react-router-dom';
import { useScanReport } from '../hooks/useScanGoals';
import { SOURCES, goalText, reportDays, scanRate } from '../lib/scanGoals';
import { DayBars } from './components/rate-checks/GoalsTab';

const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const fmt = (iso, opts) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

function Stat({ title, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-[#0F2D6B]">{value}</p>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
    </div>
  );
}

export default function ScanReportPage() {
  const { token } = useParams();
  const { data: r, isLoading, error } = useScanReport(token);

  if (isLoading) return <div className="min-h-screen bg-slate-50 p-10 text-center text-slate-600">Loading…</div>;
  if (error || !r) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-extrabold text-[#0F2D6B]">This Report Isn’t Available</h1>
          <p className="mt-2 text-slate-600">The link may have been turned off. Ask the agency for a new one.</p>
        </div>
      </div>
    );
  }

  const days = reportDays(r);
  const scans = days.reduce((t, d) => t + d.scans, 0);
  const people = days.reduce((t, d) => t + d.people, 0);
  const binds = days.reduce((t, d) => t + d.binds, 0);
  const withScan = (r.quotes || []).reduce((t, q) => t + (Number(q.with_scan) || 0), 0);
  const policies = (r.quotes || []).reduce((t, q) => t + (Number(q.policies) || 0), 0);
  const rate = scanRate({ people, with_scan: withScan });
  const goal = Number(r.goal_scans) || 0;
  const daysAtGoal = days.filter(d => goal > 0 && d.scans >= goal).length;
  const bySource = Object.fromEntries(SOURCES.map(([k]) => [k, 0]));
  for (const s of r.scans || []) bySource[s.source] = (bySource[s.source] || 0) + (Number(s.n) || 0);
  const last7 = days.slice(-7).reduce((t, d) => t + d.scans, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <title>Scans &amp; Quotes Report</title>
      <header className="text-white" style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-8 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">{r.agency}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight lg:text-[40px]">Scans &amp; Quotes</h1>
          <p className="mt-1 text-blue-100">Last 30 days · {fmt(r.from, { month: 'short', day: 'numeric' })} to {fmt(r.today, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat title="Scans" value={scans} sub={`${goalText(scans / 30)} a day · goal ${goalText(goal)}`} />
          <Stat title="Last 7 Days" value={last7} sub={`${goalText(last7 / 7)} a day`} />
          <Stat title="People Quoted" value={people} sub={`${policies} ${policies === 1 ? 'policy' : 'policies'}`} />
          <Stat title="Binds" value={binds} sub={rate == null ? 'Scan Rate —' : `Scan Rate ${rate}%`} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#0F2D6B]">Scans a Day</h2>
            <span className="text-xs text-slate-500">Dashed line: goal · {daysAtGoal} of 30 days at goal</span>
          </div>
          <div className="mt-3"><DayBars light days={days.map(d => ({ day: d.day, n: d.scans }))} goal={goal} /></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-extrabold text-[#0F2D6B]">Where Scans Come From</h2>
          <ul className="mt-3 space-y-2.5">
            {SOURCES.map(([k, label]) => (
              <li key={k}>
                <div className="flex items-baseline justify-between text-sm"><span className="text-slate-700">{label}</span><span className="font-bold tabular-nums text-[#0F2D6B]">{bySource[k]}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${scans ? Math.round((bySource[k] / scans) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-base font-extrabold text-[#0F2D6B]">Day by Day</summary>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5 font-bold">Day</th><th className="py-1.5 text-right font-bold">Scans</th><th className="py-1.5 text-right font-bold">Quoted</th><th className="py-1.5 text-right font-bold">Binds</th></tr></thead>
            <tbody>
              {[...days].reverse().map(d => (
                <tr key={d.day} className="border-t border-slate-100 text-slate-700">
                  <td className="py-1.5">{fmt(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.scans}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.people}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.binds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <p className="px-1 text-xs leading-relaxed text-slate-500">
          A scan is a household that sent its insurance policy for a quote, counted once. People Quoted counts each household quoted once a day, scan or not. Scan Rate is the share of people quoted who sent their policy first. Team totals only.
        </p>
      </main>
    </div>
  );
}
