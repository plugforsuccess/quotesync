// Competing agents map: city tiers, labels that don't overlap, zoom limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, placeLabels, clampView, zoomAt, FULL_VIEW, ATL_VIEW, zoomOf, MAX_ZOOM } from '../../src/pages/components/rate-checks/mapView.js';

const boxOf = (l, view, px, font = 11) => {
  const sx = (l.x - view.x) * px, sy = (l.y - view.y) * px, w = l.name.length * font * 0.56;
  const x0 = l.side === 'r' ? sx + 4 : sx - 4 - w;
  return { x0, x1: x0 + w, y0: sy - font * 0.6, y1: sy + font * 0.6 };
};
const noOverlap = (labels, view, px) => {
  const b = labels.map(l => boxOf(l, view, px));
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const o = b[i].x0 < b[j].x1 && b[i].x1 > b[j].x0 && b[i].y0 < b[j].y1 && b[i].y1 > b[j].y0;
    if (o) return false;
  }
  return true;
};

test('every Georgia town is a city, majors first, McDonough cased', () => {
  assert.ok(CITIES.length > 400);
  assert.equal(CITIES[0].tier, 1);
  assert.ok(CITIES.some(c => c.name === 'McDonough' && c.tier === 2));
  assert.equal(new Set(CITIES.map(c => c.name.toLowerCase())).size, CITIES.length);
});

test('more names fit as you zoom in, and none overlap', () => {
  const phone = placeLabels(FULL_VIEW, 0.56); // all of Georgia on a phone
  const desk = placeLabels(FULL_VIEW, 1.0); // all of Georgia on a computer
  const metro = placeLabels(ATL_VIEW, 2.3); // metro Atlanta on a phone
  const close = placeLabels(zoomAt(ATL_VIEW, 3, 200, 160), 6.9); // Gwinnett, zoomed in
  assert.ok(phone.every(l => l.tier === 1));
  assert.ok(phone.some(l => l.name === 'Atlanta') && phone.some(l => l.name === 'Savannah'));
  assert.ok(desk.length > phone.length);
  assert.ok(metro.some(l => l.tier === 2));
  assert.ok(close.some(l => l.tier === 3));
  for (const [labels, view, px] of [[phone, FULL_VIEW, 0.56], [desk, FULL_VIEW, 1], [metro, ATL_VIEW, 2.3]]) {
    assert.ok(noOverlap(labels, view, px));
  }
});

test('zoom stays within limits and inside Georgia', () => {
  assert.deepEqual(clampView({ x: -50, y: 10, w: 900, h: 1000 }), FULL_VIEW);
  const deep = zoomAt(FULL_VIEW, 100, 300, 300);
  assert.equal(Math.round(zoomOf(deep)), MAX_ZOOM);
  const z = zoomAt(FULL_VIEW, 2, 150, 200);
  assert.equal(zoomOf(z), 2);
  // The point zoomed on stays put on screen.
  assert.ok(Math.abs((150 - z.x) / z.w - (150 - 0) / 600) < 1e-9);
});
