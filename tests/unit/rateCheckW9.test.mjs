// Partner W-9: TIN formatting and rules, whole-form checks, the payload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTin, tinProblem, w9Problems, w9Payload } from '../../src/pages/components/rate-checks/w9.js';

test('TIN formatting as typed', () => {
  assert.equal(formatTin('1', 'ssn'), '1');
  assert.equal(formatTin('1234', 'ssn'), '123-4');
  assert.equal(formatTin('123456789', 'ssn'), '123-45-6789');
  assert.equal(formatTin('12-3456789x', 'ein'), '12-3456789');
  assert.equal(formatTin('1234567890', 'ssn'), '123-45-6789');
});

test('TIN rules', () => {
  assert.equal(tinProblem('123-45-6789', 'ssn'), 'That doesn’t look like a real number.');
  assert.equal(tinProblem('078-05-1120', 'ssn'), null);
  assert.equal(tinProblem('666-05-1120', 'ssn'), 'That isn’t a valid SSN (check the first 3 digits).');
  assert.equal(tinProblem('900-05-1120', 'ssn'), 'That isn’t a valid SSN or ITIN (check the first 5 digits).');
  // ITINs (9XX, middle pair 50–65, 70–88, 90–92, 94–99) are accepted in the SSN box.
  assert.equal(tinProblem('912-70-1234', 'ssn'), null);
  assert.equal(tinProblem('912-93-1234', 'ssn'), 'That isn’t a valid SSN or ITIN (check the first 5 digits).');
  assert.equal(tinProblem('078-00-1120', 'ssn'), 'That isn’t a valid SSN.');
  assert.equal(tinProblem('111111111', 'ssn'), 'That doesn’t look like a real number.');
  assert.equal(tinProblem('12-345', 'ssn'), 'Enter all 9 digits of your SSN.');
  assert.equal(tinProblem('00-3456789', 'ein'), 'An EIN can’t start with 00.');
  assert.equal(tinProblem('58-1234567', 'ein'), null);
});

const good = {
  name: 'Javon Yarbrough', business_name: '', tax_class: 'individual', llc_class: '', other_text: '',
  address: '123 Peachtree St NE', city_state_zip: 'Atlanta, GA 30303', tin_type: 'ssn', tin: '078-05-1120',
  signed_name: 'Javon Yarbrough', accept: true,
};

test('whole-form checks', () => {
  assert.deepEqual(w9Problems(good), {});
  assert.ok(w9Problems({ ...good, name: 'J' }).name);
  assert.ok(w9Problems({ ...good, tax_class: 'llc' }).llc_class);
  assert.deepEqual(w9Problems({ ...good, tax_class: 'llc', llc_class: 'S' }), {});
  assert.ok(w9Problems({ ...good, tax_class: 'other' }).other_text);
  assert.ok(w9Problems({ ...good, city_state_zip: 'Atlanta GA' }).city_state_zip);
  assert.deepEqual(w9Problems({ ...good, city_state_zip: 'Peachtree City GA 30269' }), {});
  assert.ok(w9Problems({ ...good, tin_type: 'ein', tin: '58-1234567' }).tin_type); // sole prop with an EIN and no business name
  assert.deepEqual(w9Problems({ ...good, tin_type: 'ein', tin: '58-1234567', business_name: 'JY Media LLC' }), {});
  assert.ok(w9Problems({ ...good, signed_name: 'Javon' }).signed_name);
  assert.ok(w9Problems({ ...good, accept: false }).accept);
});

test('payload carries digits only and the mode', () => {
  const p = w9Payload('abc', { ...good, tax_class: 'llc', llc_class: 'S' });
  assert.equal(p.mode, 'w9');
  assert.equal(p.tin, '078051120');
  assert.equal(p.llc_class, 'S');
  assert.equal(p.other_text, null);
  assert.equal(p.business_name, null);
});
