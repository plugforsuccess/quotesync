// src/pages/components/rate-checks/AgentsMap.jsx
// Georgia map for the Competing agents tab: one bubble per ZIP where a competing
// agent's customers sent us their policy, sized by how many customers, coloured by
// whose book it is (independent = could be bought). Tap a bubble to filter the
// list to that ZIP.
//
// Zoom with +/−, the mouse wheel, a double-tap, or a pinch; drag to move once
// zoomed in. City names fill in as you zoom (big cities, then suburbs and regional
// towns, then every town with a ZIP) and never overlap. Bubbles and names keep
// their size on screen at any zoom. Label placement and zoom math: mapView.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { GA_COUNTIES, GA_OUTLINE, GA_ZIPS } from './gaMap';
import { ATL_VIEW, FULL_H, FULL_VIEW, FULL_W, clampView, placeLabels, zoomAt, zoomOf } from './mapView';

// Whose book: independent (could be bought) > Allstate book > not sure > captive.
const TONES = {
  acquirable: { fill: 'var(--qs-success)', label: 'Independent' },
  allstate: { fill: 'var(--qs-info)', label: 'Allstate book' },
  check: { fill: 'var(--qs-warning)', label: 'Not sure' },
  not_acquirable: { fill: 'var(--qs-subtle)', label: 'Captive' },
};
const RANK = ['acquirable', 'allstate', 'check', 'not_acquirable'];
const radiusPx = (n) => 5 + Math.sqrt(n) * 4;
const FONT = 11;
const sameView = (a, b) => ['x', 'y', 'w'].every(k => Math.abs(a[k] - b[k]) < 0.5);

/**
 * agents: the agents the list shows (every filter but ZIP); scans: rate checks
 * (competitor_agent_id, zip). Bubbles count customers per ZIP for those agents.
 * tall: give the map the height of its column (side-by-side layout on a computer).
 */
export default function AgentsMap({ agents, scans, zip, onPickZip, tall = false }) {
  const [view, setView] = useState(FULL_VIEW);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 408 });

  // Screen size of the map, for px-per-unit (labels, bubbles, hit areas).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const px = Math.min(size.w / view.w, size.h / view.h) || 1; // screen px per map unit
  const u = 1 / px; // map units per screen px
  const zoomed = view.w < FULL_W - 0.5;

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
      return { ...b, agents: list, tone, x, y, city: String(city).replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`) };
    }).sort((a, b) => b.customers - a.customers); // big ones under small ones
  }, [agents, scans]);

  // City names that fit at this zoom; bubbles count as taken space so names go around them.
  // The zoom buttons (top right) are taken space too.
  const labels = useMemo(() => {
    const ox = (size.w - view.w * px) / 2, oy = (size.h - view.h * px) / 2; // letterbox, if any
    return placeLabels(view, px, {
      font: FONT,
      avoid: [
        ...bubbles.map(b => {
          const sx = (b.x - view.x) * px, sy = (b.y - view.y) * px, r = radiusPx(b.customers);
          return { x0: sx - r, x1: sx + r, y0: sy - r, y1: sy + r };
        }),
        { x0: size.w - ox - 56, x1: view.w * px, y0: -oy, y1: 100 - oy },
      ],
    });
  }, [view, px, bubbles, size]);

  // ── Zoom and drag ──
  const toMap = (clientX, clientY) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return [view.x + view.w / 2, view.y + view.h / 2];
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };
  const zoomBy = (factor, at) => setView(v => zoomAt(v, factor, ...(at || [v.x + v.w / 2, v.y + v.h / 2])));

  // Mouse wheel: zoom around the pointer (needs a non-passive listener to stop page scroll).
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const ctm = el.getScreenCTM();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      setView(v => zoomAt(v, Math.exp(-e.deltaY * 0.0015), p.x, p.y));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pointers: one drags (once zoomed in), two pinch. A drag shouldn't count as a tap.
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const dragged = useRef(false);
  const lastTap = useRef(0);
  useEffect(() => {
    const move = (e) => {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      const g = gesture.current;
      if (pts.length >= 2 && g.kind === 'pinch') {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (Math.abs(d - g.d0) > 4) dragged.current = true;
        setView(zoomAt(g.v0, d / g.d0, ...g.center));
      } else if (g.kind === 'pan') {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (Math.hypot(dx, dy) > 5) dragged.current = true;
        const k = 1 / g.px0; // map units per screen px at drag start
        setView(clampView({ ...g.v0, x: g.v0.x - dx * k, y: g.v0.y - dy * k }));
      }
    };
    const up = (e) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) gesture.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    const pts = [...pointers.current.values()];
    const v = viewRef.current;
    if (pts.length === 2) {
      const mid = toMap((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      gesture.current = { kind: 'pinch', v0: v, d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, center: mid };
    } else if (v.w < FULL_W - 0.5 || e.pointerType === 'mouse') {
      gesture.current = { kind: 'pan', v0: v, x0: e.clientX, y0: e.clientY, px0: px };
    }
    // Double-tap (touch) zooms in where you tapped; mice use double-click.
    if (e.pointerType !== 'mouse') {
      const now = Date.now();
      if (now - lastTap.current < 300) { zoomBy(2, toMap(e.clientX, e.clientY)); dragged.current = true; }
      lastTap.current = now;
    }
  };
  const pick = (z) => { if (!dragged.current) onPickZip(z); };

  const picked = bubbles.find(b => b.zip === zip);
  const totals = { zips: bubbles.length, customers: bubbles.reduce((t, b) => t + b.customers, 0) };
  const ctrl = 'flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold shadow disabled:opacity-40';
  const ctrlStyle = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };

  return (
    <div className={`px-3 pb-3 ${tall ? 'flex h-full flex-col' : ''}`}>
      <div className="flex items-center justify-between gap-2 py-2">
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          {totals.customers ? <><b style={{ color: 'var(--qs-bright)' }}>{totals.customers}</b> customers in <b style={{ color: 'var(--qs-bright)' }}>{totals.zips}</b> ZIPs</> : 'No customers with a Georgia ZIP yet'}
        </p>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--qs-elevated)' }} role="group" aria-label="Map area">
          {[[FULL_VIEW, 'Georgia'], [ATL_VIEW, 'Metro Atlanta']].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={sameView(view, v)} onClick={() => setView(v)}
              className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 text-xs font-semibold ${sameView(view, v) ? 'bg-primary-600 text-white' : ''}`}
              style={sameView(view, v) ? undefined : { color: 'var(--qs-text)' }}>{l}</button>
          ))}
        </div>
      </div>

      <div className={`relative ${tall ? 'min-h-0 flex-1' : ''}`}>
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
          className="block w-full select-none rounded-lg"
          style={{ background: 'var(--qs-elevated)', aspectRatio: tall ? undefined : `${FULL_W} / ${FULL_H}`, height: tall ? '100%' : undefined, maxHeight: tall ? undefined : '70vh', touchAction: zoomed ? 'none' : 'pan-y', cursor: zoomed ? 'grab' : 'default' }}
          onPointerDown={onPointerDown} onDoubleClick={e => zoomBy(2, toMap(e.clientX, e.clientY))}
          role="group" aria-label="Map of Georgia with competing agents' customers by ZIP. Use the plus and minus buttons to zoom.">
          <path d={GA_OUTLINE} fill="var(--qs-card)" stroke="var(--qs-border)" strokeWidth={1.5 * u} />
          <path d={GA_COUNTIES} fill="none" stroke="var(--qs-border)" strokeWidth={0.6 * u} opacity={0.6} />
          {bubbles.map(b => {
            const r = radiusPx(b.customers) * u;
            const on = b.zip === zip;
            const label = `${b.zip} ${b.city}: ${b.customers} customer${b.customers === 1 ? '' : 's'}, ${b.agents.length} agent${b.agents.length === 1 ? '' : 's'}`;
            return (
              <g key={b.zip} role="button" tabIndex={0} aria-label={label} aria-pressed={on} className="cursor-pointer outline-none"
                onClick={() => pick(on ? '' : b.zip)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickZip(on ? '' : b.zip); } }}>
                <title>{label}</title>
                {/* Bigger invisible target so small bubbles are easy to tap. */}
                <circle cx={b.x} cy={b.y} r={Math.max(r, 14 * u)} fill="transparent" />
                <circle cx={b.x} cy={b.y} r={r} fill={TONES[b.tone].fill} fillOpacity={zip && !on ? 0.3 : 0.75}
                  stroke={on ? 'var(--qs-bright)' : 'var(--qs-card)'} strokeWidth={(on ? 2.5 : 1) * u} />
                {b.customers > 1 && (
                  <text x={b.x} y={b.y} dy="0.35em" textAnchor="middle" fontSize={10 * u} fontWeight="700" fill="#fff" pointerEvents="none">{b.customers}</text>
                )}
              </g>
            );
          })}
          {/* City names: placed around the bubbles, never overlapping; taps pass through. */}
          <g pointerEvents="none" aria-hidden="true">
            {labels.map(l => (
              <g key={l.name}>
                <circle cx={l.x} cy={l.y} r={(l.tier === 3 ? 1.4 : 1.8) * u} fill="var(--qs-text)" />
                <text x={l.x + (l.side === 'l' ? -4 : 4) * u} y={l.y} dy="0.35em" textAnchor={l.side === 'l' ? 'end' : 'start'}
                  fontSize={(l.tier === 3 ? FONT - 1 : FONT) * u} fontWeight={l.tier === 1 ? 700 : 500}
                  fill={l.tier === 3 ? 'var(--qs-subtle)' : 'var(--qs-text)'}
                  stroke="var(--qs-elevated)" strokeWidth={3 * u} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>{l.name}</text>
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <button type="button" aria-label="Zoom in" className={ctrl} style={ctrlStyle} disabled={zoomOf(view) >= 13.9} onClick={() => zoomBy(2)}><Plus className="h-5 w-5" /></button>
          <button type="button" aria-label="Zoom out" className={ctrl} style={ctrlStyle} disabled={!zoomed} onClick={() => zoomBy(0.5)}><Minus className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        {RANK.map(t => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES[t].fill }} />{TONES[t].label}</span>
        ))}
        <span className="basis-full">{zoomed ? 'Drag to move · more towns appear as you zoom' : 'Pinch, scroll or double-tap to zoom'}</span>
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
