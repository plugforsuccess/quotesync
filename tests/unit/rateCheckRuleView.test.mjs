// Rules tab: compact formulas and money formatting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortMoney, withCommas, ruleFormula } from '../../src/pages/components/rate-checks/ruleView.js';

test('short money', () => {
  assert.equal(shortMoney(4000000), '$4M');
  assert.equal(shortMoney(1500000), '$1.5M');
  assert.equal(shortMoney(300000), '$300k');
  assert.equal(shortMoney(500), '$500');
  assert.equal(withCommas('1500000'), '1,500,000');
  assert.equal(withCommas(''), '');
});

test('rule formulas', () => {
  assert.equal(ruleFormula({ field: 'dwelling', op: 'gt', value_num: 4000000 }, 'money'), 'Dwelling > $4M');
  assert.equal(ruleFormula({ field: 'vehicle_count', op: 'gt', value_num: 3 }, 'number'), 'Vehicles > 3');
  assert.equal(ruleFormula({ field: 'home_liability', op: 'gte', value_num: 300000 }, 'money'), 'Liability ≥ $300k');
  assert.equal(ruleFormula({ field: 'policy_type', op: 'eq', value_text: 'umbrella' }, 'text'), 'Policy type = umbrella');
  assert.equal(ruleFormula({ field: 'dwelling', op: 'missing' }, 'money'), 'Dwelling not on the page');
});
