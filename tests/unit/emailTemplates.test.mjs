// Every email: one layout, the owner's saved wording, and defaults that match the app's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_TEMPLATES } from '../../supabase/functions/_shared/emailTemplates.ts';
import { renderEmail, ADDRESS_KEY } from '../../supabase/functions/_shared/email.ts';
import { TEXT_TEMPLATES } from '../../src/lib/textTemplates.js';

test('the edge defaults match the Texts & Scripts page', () => {
  const app = TEXT_TEMPLATES.filter(t => t.kind === 'email');
  assert.deepEqual(app.map(t => t.id).sort(), Object.keys(EMAIL_TEMPLATES).sort());
  for (const a of app) {
    const e = EMAIL_TEMPLATES[a.id];
    assert.equal(a.key, e.key, a.id);
    assert.equal(a.subject, e.subject, a.id);
    assert.deepEqual(a.paragraphs, e.paragraphs, a.id);
    assert.equal(a.button?.label, e.button?.label, a.id);
    assert.equal(a.button?.link, e.button && `[${e.button.link}]`, a.id);
    assert.equal(!!a.unsub, !!e.unsub, a.id);
  }
});

const course = 'https://insuredbycam.com/courses/defensive-driving';
const vars = { 'first name': 'Dana', 'modules done': '3', 'modules total': '8', 'course link': course };

test('the main link becomes a gold button; plain text keeps the link', () => {
  const m = renderEmail({ template: EMAIL_TEMPLATES.ddStall, saved: {}, vars, unsubscribeUrl: 'https://x.test/u?t=1' });
  assert.equal(m.subject, 'Pick up your defensive driving course where you left off');
  assert.match(m.html, /Continue Your Course<\/a>/);
  assert.equal(m.html.split(course).length - 1, 1, 'the link shows once, as the button');
  assert.match(m.html, /modules into Georgia&#39;s|modules into Georgia's/);
  assert.match(m.html, /Pick up where you left off\.<\/p>/);
  assert.match(m.text, new RegExp(`Pick up where you left off: ${course}`));
  assert.match(m.text, /Unsubscribe: https:\/\/x\.test\/u\?t=1/);
  assert.match(m.html, /brand\/cw-seal-email\.png/);
  assert.doesNotMatch(m.html, /#000(000)?\b|black/i);
});

test("the owner's saved wording and button label win; blanks fill in; HTML is escaped", () => {
  const saved = {
    'email.dd.stall.subject': '[first name], your course is waiting',
    'email.dd.stall.2': 'Only <5> modules left!',
    'email.dd.stall.button': 'Keep Going',
  };
  const m = renderEmail({ template: EMAIL_TEMPLATES.ddStall, saved, vars });
  assert.equal(m.subject, 'Dana, your course is waiting');
  assert.match(m.html, /Only &lt;5&gt; modules left!/);
  assert.match(m.html, /Keep Going<\/a>/);
  // The edit dropped [course link]: the button still comes along.
  assert.match(m.html, new RegExp(`href="${course}"`));
  assert.match(m.text, new RegExp(course));
});

test('unsubscribe only when asked for; the mailing address shows once it is set', () => {
  const plain = renderEmail({ template: EMAIL_TEMPLATES.ddCert, saved: {}, vars: { 'first name': 'Dana', 'certificate link': course } });
  assert.doesNotMatch(plain.html, /Unsubscribe/);
  assert.doesNotMatch(plain.text, /Unsubscribe/);
  const withAddr = renderEmail({ template: EMAIL_TEMPLATES.ddCert, saved: { [ADDRESS_KEY]: 'P.O. Box 12, Atlanta, GA 30301' }, vars: { 'first name': 'Dana', 'certificate link': course } });
  assert.match(withAddr.html, /P\.O\. Box 12, Atlanta, GA 30301/);
  assert.match(withAddr.text, /Cam Wiley Agency\nP\.O\. Box 12/);
});

test('the producer alert reads naturally', () => {
  const m = renderEmail({
    template: EMAIL_TEMPLATES.rcUpload, saved: {},
    vars: { 'first name': 'Dana', 'where we met': ' (from Rotary)', carrier: 'State Farm', premium: '$2,140 a year', 'lead link': 'https://insuredbycam.com/agency/leads/abc' },
  });
  assert.equal(m.subject, 'Dana uploaded their policy');
  assert.match(m.text, /^Dana \(from Rotary\) just uploaded their State Farm policy, paying \$2,140 a year\./);
  assert.match(m.html, /Open the Lead<\/a>/);
});

// The affiliate terms box: the page and the function store the same words and version.
test('affiliate terms: page and function agree', async () => {
  const fs = await import('node:fs');
  const lib = fs.readFileSync(new URL('../../src/lib/affiliates.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../../supabase/functions/rate-check-partner/index.ts', import.meta.url), 'utf8');
  const pick = (src, name) => src.match(new RegExp(`${name} = '([^']+)'`))?.[1];
  assert.equal(pick(lib, 'AFFILIATE_TERMS_VERSION'), pick(fn, 'TERMS_VERSION'));
  assert.equal(pick(lib, 'AFFILIATE_TERMS_TEXT'), pick(fn, 'TERMS_TEXT'));
  assert.ok(pick(fn, 'TERMS_TEXT'));
});
