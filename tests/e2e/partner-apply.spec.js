// The affiliate page (/affiliates): what affiliates are paid, the honest rules, and the
// application. Drivers Ed keeps a short teaser; old recruit links still land and credit.
// The edge function is mocked.
import { test, expect } from '@playwright/test';

const PROGRAM = {
  tiers: [
    { key: 'auto_home', label: 'Auto + home or condo', amount: 45 },
    { key: 'auto_only', label: 'Auto only', amount: 10 },
    { key: 'landlord', label: 'Landlord (paid on its own, on top of the rest)', amount: 10 },
  ],
  extra_line: { amount: 5, cap: 2 }, pay_day: 21, min_payout: 50, quote_days: 7,
};

async function mock(page) {
  const posts = [];
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/functions/v1/rate-check-partner', async (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === 'program') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROGRAM) });
    posts.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applied: true }) });
  });
  return posts;
}

test('the affiliate page: plain about pay and the rules, then apply', async ({ page }) => {
  const posts = await mock(page);
  await page.goto('/affiliates');
  await expect(page.getByRole('heading', { level: 1, name: 'Get Paid to Share a Free Rate Check' })).toBeVisible();
  // What it pays, from the agency's rules.
  const pay = page.getByLabel('Pay per household');
  await expect(pay.getByText('Auto + Home or Condo', { exact: true })).toBeVisible();
  await expect(pay.getByText('Auto Only', { exact: true })).toBeVisible();
  await expect(pay.getByText('Landlord', { exact: true })).toBeVisible();
  await expect(pay.getByText(/paid on its own/)).toHaveCount(0);
  await expect(pay.getByText('$45')).toBeVisible();
  await expect(pay.getByText('+$5')).toBeVisible();
  await expect(page.getByText(/Paid monthly, on the 21st, for the month before. A month under \$50 carries over/)).toBeVisible();
  await expect(page.getByText('Households already insured with Allstate don’t count.')).toBeVisible();
  // The honest rules.
  await expect(page.getByText(/Say you’re paid for referrals when you share it/)).toBeVisible();
  await expect(page.getByText(/Talk about coverage or prices/)).toBeVisible();

  await page.getByRole('link', { name: /Apply in a Minute/ }).click();
  const form = page.getByRole('form', { name: 'Affiliate application' });
  await expect(form).toBeInViewport();
  const apply = form.getByRole('button', { name: 'Apply to Be an Affiliate' });
  await expect(apply).toBeDisabled();
  await form.getByLabel('First name').fill('Dana');
  await form.getByLabel('Mobile number').fill('4045551212');
  await expect(form.getByLabel('Mobile number')).toHaveValue('(404) 555-1212');
  await expect(form.getByText('Is Cam Wiley your agent?')).toHaveCount(0);
  await form.getByRole('group', { name: 'Are you an Allstate customer?' }).getByText('Yes', { exact: true }).click();
  await form.getByRole('group', { name: 'Is Cam Wiley your agent?' }).getByText('Not sure', { exact: true }).click();
  await form.getByLabel(/Who Would You Share It With/).selectOption('Coworkers');
  // Still off until they agree to the terms and texts.
  await expect(apply).toBeDisabled();
  await expect(form.getByRole('link', { name: 'Affiliate Program Terms' })).toHaveAttribute('href', '/affiliates/terms');
  await form.getByRole('checkbox', { name: /I agree to the Affiliate Program Terms and to get texts/ }).check();
  await apply.click();

  await expect(page.getByText('Thanks, Dana!')).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ mode: 'apply', first_name: 'Dana', phone: '4045551212', is_customer: 'allstate_unsure', audience: 'Coworkers', source: 'affiliates_page', accept_terms: true, terms_version: 'aff-terms-v1' });
});

test("a producer's recruit link credits the producer", async ({ page }) => {
  const posts = await mock(page);
  await page.goto('/affiliates?by=AB12CD34');
  const form = page.getByRole('form', { name: 'Affiliate application' });
  await form.getByLabel('First name').fill('Dana');
  await form.getByLabel('Mobile number').fill('4045551212');
  await form.getByRole('checkbox', { name: /I agree to the Affiliate Program Terms/ }).check();
  await form.getByRole('button', { name: 'Apply to Be an Affiliate' }).click();
  await expect(page.getByText('Thanks, Dana!')).toBeVisible();
  expect(posts[0]).toMatchObject({ mode: 'apply', recruit_code: 'AB12CD34', source: 'recruit_link' });
});

test('old recruit links (/courses?by=CODE#partners) land on the affiliate page, still credited', async ({ page }) => {
  const posts = await mock(page);
  await page.goto('/courses?by=AB12CD34#partners');
  await expect(page).toHaveURL(/\/affiliates\?by=AB12CD34$/);
  const form = page.getByRole('form', { name: 'Affiliate application' });
  await form.getByLabel('First name').fill('Dana');
  await form.getByLabel('Mobile number').fill('4045551212');
  await form.getByRole('checkbox', { name: /I agree to the Affiliate Program Terms/ }).check();
  await form.getByRole('button', { name: 'Apply to Be an Affiliate' }).click();
  await expect(page.getByText('Thanks, Dana!')).toBeVisible();
  expect(posts[0]).toMatchObject({ recruit_code: 'AB12CD34', source: 'recruit_link' });
});

test('Drivers Ed keeps a short teaser that opens the affiliate page', async ({ page }) => {
  await mock(page);
  await page.goto('/courses');
  await expect(page.getByRole('form', { name: 'Affiliate application' })).toHaveCount(0);
  await page.getByRole('link', { name: /Learn More/ }).click();
  await expect(page).toHaveURL(/\/affiliates$/);
  await page.goto('/courses');
  await page.getByRole('link', { name: /Become an Affiliate|Become a paid affiliate/i }).click();
  await expect(page).toHaveURL(/\/affiliates$/);
});

test('the terms page says the rules plainly, with the live pay', async ({ page }) => {
  await mock(page);
  await page.goto('/affiliates/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Affiliate Program Terms' })).toBeVisible();
  await expect(page.getByText('Version aff-terms-v1')).toBeVisible();
  await expect(page.getByLabel('Pay per household').getByText('$45')).toBeVisible();
  await expect(page.getByText(/Reply STOP to opt out or HELP for help/)).toBeVisible();
  await expect(page.getByText(/not an employee, agent or partner/)).toBeVisible();
});

test("an affiliate's invite link credits them on the application", async ({ page }) => {
  const posts = await mock(page);
  await page.goto('/affiliates?aff=DANA2QXD');
  const form = page.getByRole('form', { name: 'Affiliate application' });
  await form.getByLabel('First name').fill('Lee');
  await form.getByLabel('Mobile number').fill('4045551313');
  await form.getByRole('checkbox', { name: /I agree to the Affiliate Program Terms/ }).check();
  await form.getByRole('button', { name: 'Apply to Be an Affiliate' }).click();
  await expect(page.getByText('Thanks, Lee!')).toBeVisible();
  expect(posts[0]).toMatchObject({ affiliate_code: 'DANA2QXD', source: 'affiliate_invite', recruit_code: null });
});
