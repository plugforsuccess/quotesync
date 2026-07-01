// Unit tests for the Premium & Profitability parser + product-key normaliser.
// Run: node --test tests/unit/bookMetricsParser.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductKey,
  parsePremiumProfitability,
} from '../../src/lib/bookMetricsParser.js';

test('normalizeProductKey: auto sub-lines vs non-auto business lines', () => {
  assert.equal(normalizeProductKey('Standard Auto'), 'auto');
  assert.equal(normalizeProductKey('Non Standard Auto'), 'auto');
  assert.equal(normalizeProductKey('Specialty Auto'), 'specialty_auto');
  assert.equal(normalizeProductKey('Voluntary Auto'), 'auto_rollup');
  // The bug this guards: "Non Auto" business lines must NOT fall into the
  // generic auto catch.
  assert.equal(normalizeProductKey('ABI - Non Auto'), 'other');
  assert.equal(normalizeProductKey('Non-Auto'), 'other');
});

// Minimal Premium & Profitability sheet: meta row, a forward-filled group row,
// the "Products" subheader row, then product data rows.
function sheet(dataRows) {
  return [
    ['Production Month', 'May-2026'],
    ['', 'Policies in Force', '', 'Policy Retention - Current Month'],
    ['Products', 'Current Month', 'PYE', 'Policy Retention'],
    ...dataRows,
  ];
}

test('parsePremiumProfitability: reads month and keeps real product rows', () => {
  const { productionMonth, records } = parsePremiumProfitability(
    sheet([['Standard Auto', 632, 600, 79.0]])
  );
  assert.equal(productionMonth, '2026-05-01');
  assert.equal(records.length, 1);
  assert.equal(records[0].product, 'Standard Auto');
  assert.equal(records[0].product_key, 'auto');
  assert.equal(records[0].pif_current, 632);
  assert.equal(records[0].policy_retention_pct, 79.0);
});

test('parsePremiumProfitability: drops structurally-empty (0-PIF both years) lines', () => {
  const { records } = parsePremiumProfitability(
    sheet([
      ['Standard Auto', 632, 600, 79.0],
      ['Flood', 0, 0, 0],          // no book presence either year → dropped
      ['Ivantage', '', '', ''],    // blank metrics → dropped
    ])
  );
  assert.equal(records.length, 1);
  assert.deepEqual(records.map(r => r.product), ['Standard Auto']);
});

test('parsePremiumProfitability: keeps a line that collapsed to zero this year', () => {
  // pif_current 0 but pif_pye 5 — a real retention collapse, not noise.
  const { records } = parsePremiumProfitability(
    sheet([['Renters', 0, 5, 0]])
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].product, 'Renters');
  assert.equal(records[0].pif_current, 0);
  assert.equal(records[0].pif_pye, 5);
});
