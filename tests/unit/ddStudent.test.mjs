// Defensive driving: where an enrolled student stands on the course page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentStatus, addMonths } from '../../src/lib/ddStudent.js';

const course = { retake_limit: 3 };
const modules = [1, 2, 3].map(n => ({ id: `m${n}`, ordinal: n, title: `M${n}` }));
const doneUpTo = (n) => modules.slice(0, n).map(m => ({ module_id: m.id, completed_at: '2026-06-01T12:00:00Z' }));

test('learning: counts finished modules and points at the next one', () => {
  const s = studentStatus({ course, enrollment: { status: 'active' }, modules, progress: doneUpTo(1) });
  assert.equal(s.stage, 'learning');
  assert.equal(s.doneCount, 1);
  assert.equal(s.next.id, 'm2');
});

test('exam, then retake with tries counted', () => {
  assert.equal(studentStatus({ course, enrollment: { status: 'active' }, modules, progress: doneUpTo(3) }).stage, 'exam');
  const r = studentStatus({ course, enrollment: { status: 'active' }, modules, progress: doneUpTo(3), attempts: [{ passed: false, submitted_at: '2026-06-02T00:00:00Z' }] });
  assert.equal(r.stage, 'retake');
  assert.equal(r.tries, 1);
  assert.equal(r.triesLeft, 2);
});

test('passed: the discount runs 36 months from the certificate (or the pass)', () => {
  const s = studentStatus({ course, enrollment: { status: 'completed', completed_at: '2026-06-04T23:40:00Z' }, modules, progress: doneUpTo(3), cert: { issued_at: '2026-06-05T15:00:00Z' } });
  assert.equal(s.stage, 'passed');
  assert.equal(s.expiresAt.slice(0, 10), '2029-06-05');
  const noCert = studentStatus({ course, enrollment: { status: 'completed', completed_at: '2026-06-04T23:40:00Z' }, modules });
  assert.equal(noCert.certIssuedAt, null);
  assert.equal(noCert.expiresAt.slice(0, 10), '2029-06-04');
});

test('addMonths keeps month ends sane', () => {
  assert.equal(addMonths('2026-01-31T12:00:00Z', 1).slice(0, 10), '2026-02-28');
});
