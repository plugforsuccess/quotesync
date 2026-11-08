// Lists: reading an imported spreadsheet into people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, mapColumns, cleanName, cleanPhone, isEmail } from '../../src/lib/contactLists.js';

test('headings are matched however they are written', () => {
  assert.deepEqual(mapColumns(['First Name', 'Last', 'E-mail', 'Mobile', 'Notes']), { first: 0, last: 1, email: 2, phone: 3, notes: 4 });
  assert.deepEqual(mapColumns(['Name', 'Email Address', 'Phone Number']), { name: 0, email: 1, phone: 2 });
});

test('people come out clean; bad, missing and repeated emails are skipped and counted', () => {
  const { people, skipped } = parseImport([
    ['Name', 'Email', 'Phone', 'Group'],
    ['dana smith', ' Dana@Gmail.com ', '1 (404) 555-0123', 'Frat'],
    ['Marcus McKay', 'marcus@example.com', '555', ''],
    ['No Email', '', '4045550000', ''],
    ['Bad', 'not-an-email', '', ''],
    ['Dana Again', 'dana@gmail.com', '', ''],
    ['', '', '', ''],
  ]);
  assert.deepEqual(people, [
    { first_name: 'Dana', last_name: 'Smith', email: 'dana@gmail.com', phone: '4045550123', notes: 'Frat' },
    { first_name: 'Marcus', last_name: 'McKay', email: 'marcus@example.com', phone: null, notes: null },
  ]);
  assert.deepEqual(skipped, { noEmail: 1, badEmail: 1, duplicate: 1 });
});

test('no name: the email stands in', () => {
  const { people } = parseImport([['Email'], ['jo@example.com']]);
  assert.equal(people[0].first_name, 'jo');
});

test('helpers', () => {
  assert.equal(cleanName('  dana   smith '), 'Dana Smith');
  assert.equal(cleanName('DeShawn McKay'), 'DeShawn McKay'); // typed capitals are kept
  assert.equal(cleanPhone('+1 404-555-0123'), '4045550123');
  assert.equal(cleanPhone('555-0123'), '');
  assert.ok(isEmail('a@b.co') && !isEmail('a@b') && !isEmail('a b@c.com'));
});
