// Drivers Ed: the referral partner section and its apply form. The edge function is mocked.
import { test, expect } from '@playwright/test';

test('apply to be a referral partner from Drivers Ed', async ({ page }) => {
  const posts = [];
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/functions/v1/rate-check-partner', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applied: true }) });
  });
  await page.goto('/courses');
  await page.getByRole('link', { name: /Become a referral partner/ }).click();
  await expect(page.getByRole('heading', { name: /Get paid to share the savings/ })).toBeInViewport();

  const apply = page.getByRole('button', { name: 'Apply to be a partner' });
  await expect(apply).toBeDisabled();
  await page.getByLabel('First name').fill('Dana');
  await page.getByLabel('Mobile number').fill('4045551212');
  await expect(page.getByLabel('Mobile number')).toHaveValue('(404) 555-1212');
  await expect(page.getByText('Is Cam Wiley Agency your agent?')).toHaveCount(0);
  await page.getByRole('group', { name: 'Are you an Allstate customer?' }).getByText('Yes', { exact: true }).click();
  await page.getByRole('group', { name: 'Is Cam Wiley Agency your agent?' }).getByText('Not sure', { exact: true }).click();
  await page.getByLabel(/Who would you share it with/).selectOption('Coworkers');
  await apply.click();

  await expect(page.getByText('Thanks, Dana!')).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ mode: 'apply', first_name: 'Dana', phone: '4045551212', is_customer: 'allstate_unsure', audience: 'Coworkers', source: 'drivers_ed' });
});
