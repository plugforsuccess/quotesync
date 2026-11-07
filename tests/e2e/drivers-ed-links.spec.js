// Every link and Check My Rate button on the Drivers Ed pages goes where it says.
// Unknown addresses redirect to the home page, so a broken link looks like it
// "works" — each internal link is opened and must land on its own page.
import { test, expect } from '@playwright/test';

const PAGES = ['/courses', '/courses/defensive-driving'];

async function quiet(page) {
  // No live data needed: every Supabase call answers empty.
  const course = { id: 'c1', slug: 'georgia-6hr-defensive-driving', title: 'Georgia 6-Hour Defensive Driving', price_cents: 3500, currency: 'usd', min_seat_seconds: 21600, pass_threshold_pct: 75, retake_limit: 3, retake_cooldown_seconds: 0, exam_question_count: 25, is_active: true, is_dds_approved: false, compliance_label: null, dds_provider_no: null };
  await page.route('https://ghnpzllykteelveezhnv.supabase.co/**', (route) => {
    const one = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    if (route.request().url().includes('/rest/v1/dd_courses')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? course : [course]) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: one ? 'null' : '[]' });
  });
}

async function linksOn(page) {
  return page.$$eval('a[href]', as => as.map(a => ({
    href: a.getAttribute('href'), text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    target: a.getAttribute('target'), visible: !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length),
  })));
}

for (const path of PAGES) {
  test(`every link on ${path} goes where it says`, async ({ page }) => {
    await quiet(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const links = await linksOn(page);
    expect(links.length).toBeGreaterThan(3);

    for (const l of links) {
      if (l.href.startsWith('#')) {
        // Jump links need a section to land on.
        expect(await page.locator(l.href).count(), `${l.text} → ${l.href}`).toBeGreaterThan(0);
      } else if (/^(https?:)?\/\//.test(l.href)) {
        expect(l.target, `${l.text} → ${l.href} opens in a new tab`).toBe('_blank');
      } else if (/^(tel|sms|mailto):/.test(l.href)) {
        expect(l.href.length).toBeGreaterThan(6);
      } else {
        // Internal: open it and make sure we land on that page, not the home page fallback.
        const target = new URL(l.href, 'http://x');
        const p2 = await page.context().newPage();
        await quiet(p2);
        await p2.goto(l.href);
        await p2.waitForLoadState('domcontentloaded');
        const landed = new URL(p2.url());
        if (target.pathname !== '/') expect(landed.pathname, `${l.text} → ${l.href}`).toBe(target.pathname.replace(/\/$/, '') || '/');
        await p2.close();
      }
    }

    // Every Check My Rate opens the start of the rate check, tagged with where it came from.
    const checks = links.filter(l => /check my rate/i.test(l.text));
    for (const l of checks) {
      expect(l.href, `${l.text} on ${path}`).toMatch(/^\/\?start=1/);
    }
  });
}

test('Check My Rate on Drivers Ed opens "What Should We Check?" and keeps the source', async ({ page }) => {
  await quiet(page);
  await page.goto('/courses');
  await page.getByRole('link', { name: /Check My Rate/i }).last().click();
  await expect(page.getByRole('heading', { name: 'What Should We Check?' })).toBeVisible();
  await expect(page).toHaveURL(/utm_source=drivers_ed/);
  await expect(page).not.toHaveURL(/start=1/);
});

test('the phone menu Check My Rate also opens the start', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  await page.goto('/courses');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /Check My Rate/i }).click();
  await expect(page.getByRole('heading', { name: 'What Should We Check?' })).toBeVisible();
});

test('Enroll buttons on the course page jump to the enroll form', async ({ page }) => {
  await quiet(page);
  await page.goto('/courses/defensive-driving');
  const enroll = page.locator('a[href="#enroll"]');
  await expect(enroll.first()).toBeVisible();
  await enroll.first().click();
  await expect(page.locator('#enroll')).toBeInViewport();
});

test('Drivers Ed sends people to our own course, never the outside course site', async ({ page }) => {
  await page.route('**/*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/courses');
  await expect(page.getByRole('link', { name: /Already Enrolled\? Continue Your Course/ })).toHaveAttribute('href', '/courses/defensive-driving/portal');
  await expect(page.getByRole('link', { name: 'Start Defensive Driving Course' })).toHaveAttribute('href', '/courses/defensive-driving');
  await expect(page.locator('a[href*="nationaldrivered"]')).toHaveCount(0);
});
