import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultLanding } from '../../src/config/nav.config.js';

test('platform_admin lands on admin agencies', () => {
  assert.equal(getDefaultLanding('platform_admin', null), '/admin/agencies');
});

test('platform_editor lands on newsroom dashboard', () => {
  assert.equal(getDefaultLanding('platform_editor', null), '/news/dashboard');
});

test('agency agent lands on agency dashboard', () => {
  assert.equal(getDefaultLanding(null, 'agent'), '/agency/dashboard');
});

test('no role lands on root', () => {
  assert.equal(getDefaultLanding(null, null), '/');
});
