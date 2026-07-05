// Unit tests for the Offers report aggregation + the close-screen prefill helper.
// Run: node --test tests/unit/offerOutcomes.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOfferOutcomes } from '../../src/lib/offerOutcomes.js';
import { latestOfferedPremium } from '../../src/lib/interventions.js';

const row = (over = {}) => ({
  case_type: 'renewal',
  outcome: 'open',
  interventions: ['requote_deductible'],
  offered_premium: 900,
  case_premium: 1000,
  competitor_name: null,
  competitor_quote: null,
  ...over,
});

test('summarize: accept rate counts only resolved quotes', () => {
  const s = summarizeOfferOutcomes([
    row({ outcome: 'saved' }),
    row({ outcome: 'lost' }),
    row({ outcome: 'lost' }),
    row({ outcome: 'open' }),
  ]);
  assert.equal(s.quoted, 4);
  assert.equal(s.accepted, 1);
  assert.equal(s.lost, 2);
  assert.equal(s.open, 1);
  assert.ok(Math.abs(s.acceptRate - 1 / 3) < 1e-9);
});

test('summarize: lost-quoted premium sums the quotes that failed', () => {
  const s = summarizeOfferOutcomes([
    row({ outcome: 'lost', offered_premium: 800 }),
    row({ outcome: 'lost', offered_premium: 450 }),
    row({ outcome: 'saved', offered_premium: 700 }),
  ]);
  assert.equal(s.lostQuotedPremium, 1250);
  assert.equal(s.lostRows.length, 2);
});

test('summarize: concession split by outcome', () => {
  const s = summarizeOfferOutcomes([
    row({ outcome: 'saved', offered_premium: 900, case_premium: 1000 }), // 10% off won
    row({ outcome: 'lost', offered_premium: 950, case_premium: 1000 }),  // 5% off lost
  ]);
  assert.ok(Math.abs(s.avgConcessionSavedPct - 10) < 1e-9);
  assert.ok(Math.abs(s.avgConcessionLostPct - 5) < 1e-9);
});

test('summarize: loss reasons and neutral tags stay out of the tactic table', () => {
  const s = summarizeOfferOutcomes([
    row({ interventions: ['requote_coverage', 'loss_price', 'spoke_no_decision'], outcome: 'lost' }),
  ]);
  assert.deepEqual(s.tactics.map((t) => t.code), ['requote_coverage']);
});

test('summarize: competitor intel groups by name with gap vs our premium', () => {
  const s = summarizeOfferOutcomes([
    row({ competitor_name: 'Geico', competitor_quote: 850, case_premium: 1000, outcome: 'lost', offered_premium: null }),
    row({ competitor_name: 'Geico', competitor_quote: 950, case_premium: 1000, outcome: 'saved' }),
    row({ competitor_name: '', competitor_quote: 700, case_premium: 1000 }),
  ]);
  const geico = s.competitors.find((c) => c.name === 'Geico');
  assert.equal(geico.quotes, 2);
  assert.equal(geico.avgGap, -100); // they undercut us by $100 on average
  assert.ok(s.competitors.some((c) => c.name === 'Unnamed'));
});

test('summarize: rows without an offered premium are competitor-intel only', () => {
  const s = summarizeOfferOutcomes([
    row({ offered_premium: null, competitor_quote: 800, competitor_name: 'Progressive' }),
  ]);
  assert.equal(s.quoted, 0);
  assert.equal(s.competitors.length, 1);
});

test('latestOfferedPremium: first populated quote wins (attempts newest-first)', () => {
  assert.equal(
    latestOfferedPremium([
      { offered_premium: null },
      { offered_premium: 880 },
      { offered_premium: 940 },
    ]),
    880,
  );
  assert.equal(latestOfferedPremium([{ offered_premium: 0 }, {}]), null);
  assert.equal(latestOfferedPremium([]), null);
  assert.equal(latestOfferedPremium(undefined), null);
});
