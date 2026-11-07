/* global Buffer */
// The course page changes with where a signed-in student stands: partway through
// (Continue Course, progress), retaking the exam, or passed (certificate and when the
// discount ends). Supabase is mocked.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const UID = '33333333-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dana@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const course = { id: 'c1', slug: 'georgia-6hr-defensive-driving', title: 'Georgia 6-Hour Defensive Driving', price_cents: 2495, currency: 'usd', retake_limit: 3, retake_cooldown_seconds: 0, is_active: true };
const modules = [1, 2, 3].map(n => ({ id: `m${n}`, course_id: 'c1', ordinal: n, title: `Module Title ${n}`, content_ref: `m${n}` }));
const done = (n) => modules.slice(0, n).map(m => ({ module_id: m.id, kc_passed: true, completed_at: '2026-06-01T12:00:00Z', seconds_spent: 600 }));

async function student(page, { enrollment, progress = [], attempts = [], cert = null }) {
  await page.addInitScript((s) => localStorage.setItem('sb-ghnpzllykteelveezhnv-auth-token', s), JSON.stringify(session));
  await page.route(`${SB}/**`, (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (rows) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? (Array.isArray(rows) ? rows[0] ?? null : rows) : rows) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/profiles') return json([{ id: UID, email: user.email, full_name: 'Dana Whitfield', role: 'insured', platform_role: null, is_platform_user: false }]);
    if (p === '/rest/v1/dd_courses') return json([course]);
    if (p === '/rest/v1/dd_modules') return json(modules);
    if (p === '/rest/v1/dd_enrollments') return json([{ id: 'e1', course_id: 'c1', user_id: UID, student_name_snapshot: 'Dana Whitfield', ...enrollment }]);
    if (p === '/rest/v1/dd_module_progress') return json(progress);
    if (p === '/rest/v1/dd_exam_attempts') return json(attempts);
    if (p === '/rest/v1/dd_certificates') return json(cert ? [cert] : []);
    return json([]);
  });
  await page.goto('/courses/defensive-driving');
}

test('partway through: Continue Course opens the next module, with progress', async ({ page }) => {
  await student(page, { enrollment: { status: 'active' }, progress: done(1) });
  await expect(page.getByText('Welcome back, Dana. 1 of 3 modules done.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue Course' })).toHaveAttribute('href', '/courses/defensive-driving/portal?module=m2');
  await expect(page.getByText('Your Progress', { exact: true })).toBeVisible();
  await expect(page.getByText(/Enroll For/)).toHaveCount(0);
  await expect(page.getByText('$24.95')).toHaveCount(0);
});

test('retaking: says how many exam tries are used', async ({ page }) => {
  await student(page, { enrollment: { status: 'active' }, progress: done(3), attempts: [{ id: 'a1', attempt_no: 1, passed: false, score_pct: 60, submitted_at: '2026-06-03T12:00:00Z' }] });
  await expect(page.getByText('Welcome back, Dana. You’ve used 1 of 3 exam tries.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retake the Final Exam' })).toBeVisible();
});

test('passed: the certificate, when it was sent, and when the discount ends', async ({ page }) => {
  await student(page, { enrollment: { status: 'completed', completed_at: '2026-06-04T23:40:00Z' }, progress: done(3), cert: { certificate_uid: 'X', issued_at: '2026-06-05T15:00:00Z', revoked_at: null } });
  await expect(page.getByText(/You passed on June 4, 2026\. Your certificate was sent to Cam Wiley Agency\./)).toBeVisible();
  await expect(page.getByText(/good through June 5, 2029/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Certificate' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Check Your Whole Rate' })).toHaveAttribute('href', '/?start=1');
});

test('passed with no certificate on file: offers to get it', async ({ page }) => {
  await student(page, { enrollment: { status: 'completed', completed_at: '2026-06-04T23:40:00Z' }, progress: done(3) });
  await expect(page.getByRole('button', { name: 'Get Your Certificate' }).first()).toBeVisible();
  await expect(page.getByText('Not yet')).toBeVisible();
});
