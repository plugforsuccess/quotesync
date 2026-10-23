// src/pages/components/rate-checks/mapView.js
// The Competing agents map's zoom and city labels, as pure functions: which city
// names fit at the current zoom without overlapping (big cities first, more
// towns as you zoom in), and how the view moves when you zoom or drag.
// Units are the map's viewBox units (gaMap.js); "px" is screen pixels.

import { GA_VIEWBOX, GA_ZIPS } from './gaMap.js';

export const [, , FULL_W, FULL_H] = GA_VIEWBOX;
export const MAX_ZOOM = 14;

// Always considered first.
const MAJOR = {
  Atlanta: '30303', Savannah: '31401', Augusta: '30901', Columbus: '31901', Macon: '31201', Athens: '30601',
  Albany: '31701', Valdosta: '31601', Rome: '30161', Gainesville: '30501', Dalton: '30720', 'Warner Robins': '31088',
  Brunswick: '31520', Statesboro: '30458',
};
// Metro Atlanta suburbs and regional towns: shown once there's room.
const MID = {
  Marietta: '30060', Kennesaw: '30144', Canton: '30114', Alpharetta: '30009', Roswell: '30075', Cumming: '30040',
  Buford: '30518', Duluth: '30096', Lawrenceville: '30046', Snellville: '30078', Decatur: '30030', Conyers: '30012',
  Covington: '30014', Douglasville: '30134', Stockbridge: '30281', McDonough: '30253', Fayetteville: '30214',
  'Peachtree City': '30269', Newnan: '30263', Griffin: '30223', Cartersville: '30120', Calhoun: '30701',
  Carrollton: '30117', LaGrange: '30240', Winder: '30680', Monroe: '30655', Jefferson: '30549', Toccoa: '30577',
  Dahlonega: '30533', Milledgeville: '31061', Dublin: '31021', Americus: '31709', Tifton: '31794',
  Thomasville: '31792', Moultrie: '31768', Bainbridge: '39817', Cordele: '31015', Fitzgerald: '31750',
  Douglas: '31533', Waycross: '31501', Vidalia: '30474', Hinesville: '31313', Pooler: '31322', Jesup: '31545',
  Kingsland: '31548', Thomson: '30824', Madison: '30650', Eatonton: '31024',
};

const fixCase = (s) => String(s).replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);

/** Every city: { name, x, y, tier (1 major, 2 mid, 3 any town with a ZIP), weight }. */
export const CITIES = (() => {
  const pinned = new Map();
  for (const [tier, list] of [[1, MAJOR], [2, MID]]) {
    for (const [name, zip] of Object.entries(list)) {
      if (GA_ZIPS[zip] && !pinned.has(name.toLowerCase())) pinned.set(name.toLowerCase(), { name, x: GA_ZIPS[zip][0], y: GA_ZIPS[zip][1], tier });
    }
  }
  const towns = new Map();
  for (const [x, y, city] of Object.values(GA_ZIPS)) {
    const key = String(city).toLowerCase();
    if (!towns.has(key)) towns.set(key, { name: fixCase(city), xs: 0, ys: 0, n: 0 });
    const t = towns.get(key);
    t.xs += x; t.ys += y; t.n += 1;
  }
  const out = [...pinned.values()].map(c => ({ ...c, weight: towns.get(c.name.toLowerCase())?.n || 1 }));
  for (const [key, t] of towns) {
    if (!pinned.has(key)) out.push({ name: t.name, x: t.xs / t.n, y: t.ys / t.n, tier: 3, weight: t.n });
  }
  return out.sort((a, b) => a.tier - b.tier || b.weight - a.weight);
})();

// Mid towns appear at this many px per unit; every town at the next.
const TIER_PX = { 1: 0, 2: 0.9, 3: 3.2 };

/**
 * Labels that fit: walks cities biggest-first, keeps a name only if its box
 * (right of the dot, else left) clears every name already placed and stays in view.
 * view = { x, y, w, h }; px = screen pixels per unit; font in px.
 * Returns [{ name, x, y, side: 'r' | 'l', tier }].
 */
export function placeLabels(view, px, { font = 11, cities = CITIES, avoid = [] } = {}) {
  const placed = [];
  const boxes = avoid.map(b => ({ ...b }));
  const pad = 2;
  const overlaps = (a) => boxes.some(b => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad);
  for (const c of cities) {
    if (px < TIER_PX[c.tier]) continue;
    const sx = (c.x - view.x) * px, sy = (c.y - view.y) * px; // screen position
    if (sx < 0 || sy < 0 || sx > view.w * px || sy > view.h * px) continue;
    const w = c.name.length * font * 0.56, h = font * 1.2;
    for (const side of ['r', 'l']) {
      const x0 = side === 'r' ? sx + 4 : sx - 4 - w;
      const box = { x0, x1: x0 + w, y0: sy - h / 2, y1: sy + h / 2 };
      if (box.x0 < 0 || box.x1 > view.w * px || box.y0 < 0 || box.y1 > view.h * px || overlaps(box)) continue;
      boxes.push(box, { x0: sx - 3, x1: sx + 3, y0: sy - 3, y1: sy + 3 });
      placed.push({ name: c.name, x: c.x, y: c.y, side, tier: c.tier });
      break;
    }
  }
  return placed;
}

/** Keep the view inside Georgia (with a little slack) and within the zoom limits. */
export function clampView(v) {
  const w = Math.min(FULL_W, Math.max(FULL_W / MAX_ZOOM, v.w));
  const h = w * (FULL_H / FULL_W);
  const slackX = w * 0.25, slackY = h * 0.25;
  const x = Math.min(FULL_W - w + slackX, Math.max(-slackX, v.x));
  const y = Math.min(FULL_H - h + slackY, Math.max(-slackY, v.y));
  return w >= FULL_W ? { x: 0, y: 0, w: FULL_W, h: FULL_H } : { x, y, w, h };
}

/** Zoom by `factor` (>1 = in) keeping the map point (ux, uy) under the same spot. */
export function zoomAt(v, factor, ux, uy) {
  const w = v.w / factor, h = v.h / factor;
  return clampView({ x: ux - (ux - v.x) / factor, y: uy - (uy - v.y) / factor, w, h });
}

export const FULL_VIEW = { x: 0, y: 0, w: FULL_W, h: FULL_H };
const ATL = GA_ZIPS['30303'] || [160, 190];
export const ATL_VIEW = clampView({ x: ATL[0] - 75, y: ATL[1] - 82, w: 150, h: 150 * (FULL_H / FULL_W) });
export const zoomOf = (v) => FULL_W / v.w;
