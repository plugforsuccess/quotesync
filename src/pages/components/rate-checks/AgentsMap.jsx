// src/pages/components/rate-checks/AgentsMap.jsx
// Georgia map for the Competing agents tab: one bubble per ZIP where a competing
// agent's customers sent us their policy, sized by how many customers, coloured by
// whose book it is (independent = could be bought). Tap a bubble to filter the
// list to that ZIP; switch between all of Georgia and metro Atlanta.

import { useMemo, useState } from 'react';
import { GA_COUNTIES, GA_OUTLINE, GA_VIEWBOX, GA_ZIPS } from './gaMap';

// Whose book: independent (could be bought) > Allstate book > not sure > captive.
const TONES = {
  acquirable: { fill: 'var(--qs-success)', label: 'Independent' },
  allstate: { fill: 'var(--qs-info)', label: 'Allstate book' },
  check: { fill: 'var(--qs-warning)', label: 'Not sure' },
  not_acquirable: { fill: 'var(--qs-subtle)', label: 'Captive' },
};
const RANK = ['acquirable', 'allstate', 'check', 'not_acquirable'];

// Metro Atlanta: a box around downtown (30303).
const [ATL_X, ATL_Y] = GA_ZIPS['30303'] || [180, 190];
const VIEWS = {
  ga: GA_VIEWBOX,
  atl: [ATL_X - 75, ATL_Y - 75, 150, 165],
};

/**
 * agents: the agents the list shows (every filter but ZIP); scans: rate checks
 * (competitor_agent_id, zip). Bubbles count customers per ZIP for those agents.
 */
export default function AgentsMap({ agents, scans, zip, onPickZip }) {
  const [view, setView] = useState('ga');
  const bubbles = useMemo(() => {
    const byId = Object.fromEntries(agents.map(a => [a.id, a]));
    const map = new Map();
    for (const s of scans || []) {
      const a = byId[s.competitor_agent_id];
      const z = String(s.zip || '').slice(0, 5);
      if (!a || !GA_ZIPS[z]) continue;
      if (!map.has(z)) map.set(z, { zip: z, customers: 0, agents: new Map() });
      const b = map.get(z);
      b.customers += 1;
      b.agents.set(a.id, a);
    }
    return [...map.values()].map(b => {
      const list = [...b.agents.values()];
      const tone = RANK.find(k => list.some(a => (a.book_ownership || 'check') === k)) || 'check';
      const [x, y, city] = GA_ZIPS[b.zip];
      return { ...b, agents: list, tone, x, y, city };
    }).sort((a, b) => b.customers - a.customers); // big ones under small ones
  }, [agents, scans]);

  const [vx, vy, vw, vh] = VIEWS[view];
  const k = vw / 360; // viewBox units per screen pixel, roughly, on a phone
  const radius = (n) => (5 + Math.sqrt(n) * 4) * k;
  const picked = bubbles.find(b => b.zip === zip);
  const totals = { zips: bubbles.length, customers: bubbles.reduce((t, b) => t + b.customers, 0) };

  return (
    <div className="px-3 pb-3" style={{ borderBottom: '1px solid var(--qs-border)' }}>
      <div className="flex items-center justify-between gap-2 py-2">
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          {totals.customers ? <><b style={{ color: 'var(--qs-bright)' }}>{totals.customers}</b> customers in <b style={{ color: 'var(--qs-bright)' }}>{totals.zips}</b> ZIPs</> : 'No customers with a Georgia ZIP yet'}
        </p>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--qs-elevated)' }} role="group" aria-label="Map area">
          {[['ga', 'Georgia'], ['atl', 'Metro Atlanta']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 text-xs font-semibold ${view === v ? 'bg-primary-600 text-white' : ''}`}
              style={view === v ? undefined : { color: 'var(--qs-text)' }}>{l}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="block w-full rounded-lg" style={{ background: 'var(--qs-elevated)', maxHeight: 460 }}
        role="group" aria-label="Map of Georgia with competing agents' customers by ZIP">
        <path d={GA_OUTLINE} fill="var(--qs-card)" stroke="var(--qs-border)" strokeWidth={1.5 * k} />
        <path d={GA_COUNTIES} fill="none" stroke="var(--qs-border)" strokeWidth={0.5 * k} opacity={0.6} />
        {bubbles.map(b => {
          const r = radius(b.customers);
          const on = b.zip === zip;
          const label = `${b.zip} ${b.city}: ${b.customers} customer${b.customers === 1 ? '' : 's'}, ${b.agents.length} agent${b.agents.length === 1 ? '' : 's'}`;
          return (
            <g key={b.zip} role="button" tabIndex={0} aria-label={label} aria-pressed={on} className="cursor-pointer outline-none"
              onClick={() => onPickZip(on ? '' : b.zip)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickZip(on ? '' : b.zip); } }}>
              <title>{label}</title>
              {/* Bigger invisible target so small bubbles are easy to tap. */}
              <circle cx={b.x} cy={b.y} r={Math.max(r, 14 * k)} fill="transparent" />
              <circle cx={b.x} cy={b.y} r={r} fill={TONES[b.tone].fill} fillOpacity={zip && !on ? 0.3 : 0.75}
                stroke={on ? 'var(--qs-bright)' : 'var(--qs-card)'} strokeWidth={(on ? 2.5 : 1) * k} />
              {b.customers > 1 && r > 9 * k && (
                <text x={b.x} y={b.y} dy="0.35em" textAnchor="middle" fontSize={10 * k} fontWeight="700" fill="#fff" pointerEvents="none">{b.customers}</text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        {RANK.map(t => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES[t].fill }} />{TONES[t].label}</span>
        ))}
      </div>

      {zip && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-bright)' }}>
          <span className="min-w-0">
            <b>{zip}</b>{picked ? ` · ${picked.city} · ${picked.customers} customer${picked.customers === 1 ? '' : 's'}, ${picked.agents.length} agent${picked.agents.length === 1 ? '' : 's'}` : ''}
          </span>
          <button type="button" onClick={() => onPickZip('')} className="min-h-[36px] shrink-0 font-semibold text-primary-600">Show all</button>
        </div>
      )}
    </div>
  );
}
