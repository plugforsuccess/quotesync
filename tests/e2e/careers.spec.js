// /careers: the roles, the producer's pay range, and Apply only when a job post exists.
// Reached from the footer (Careers, and Become an Affiliate), not the top menu.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
});

test('careers: both roles, the producer pay range, no dead Apply buttons', async ({ page }) => {
  await page.goto('/careers');
  await expect(page.getByRole('heading', { level: 1, name: 'Build a Career Helping Georgia Families' })).toBeVisible();
  const producer = page.getByRole('article', { name: 'Licensed Sales Producer' });
  await expect(producer.getByText('$48,000–$90,000 a year · base plus commission, based on production')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Customer Service Representative' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Apply on Indeed/ })).toHaveCount(0);
  await expect(page.getByText('The job post is coming soon. Check back shortly.').first()).toBeVisible();
});

test('the footer links to Careers and Become an Affiliate', async ({ page }) => {
  await page.goto('/careers');
  const about = page.getByRole('navigation', { name: 'About us' });
  await expect(about.getByRole('link', { name: 'Careers' })).toHaveAttribute('href', '/careers');
  await about.getByRole('link', { name: 'Become an Affiliate' }).click();
  await expect(page).toHaveURL(/\/affiliates$/);
});
