// A failed scan: our scanner's problem (no retake; alert the principal) or the photo's?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scannerProblem as edge } from '../../supabase/functions/_shared/scanErrors.ts';
import { scannerProblem as app } from '../../src/lib/scanErrors.js';

const cases = [
  ['Anthropic API error (400): {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."}}', 'limit'],
  ['Anthropic API error (400): Your credit balance is too low to access the Anthropic API.', 'limit'],
  ['Anthropic API error (401): invalid x-api-key', 'key'],
  ['ANTHROPIC_API_KEY is not configured', 'key'],
  ['Anthropic API error (529): Overloaded', 'busy'],
  ['Anthropic API error (429): rate_limit_error', 'busy'],
  ['TypeError: fetch failed', 'other'],
  ['Cannot extract image/heic; agent must review image', null],
  ['Model returned no tool_use block', null],
  [null, null],
];

test('our side vs the photo, the same in the app and the edge function', () => {
  for (const [err, kind] of cases) {
    assert.equal(edge(err)?.kind ?? null, kind, String(err));
    assert.deepEqual(app(err), edge(err), String(err));
  }
  assert.match(edge(cases[0][0]).fix, /console\.anthropic\.com/);
});
