// Campaigns (principal): build a drip for Rate Check leads, preview and test it, start it;
// a blast; archive. Supabase is mocked; the test checks what the page shows and writes.
import { test, expect } from '@playwright/test';

import { mockCampaigns } from './campaigns.mock.js';

const AG = '00000000-0000-0000-0000-000000000001';

test('build a drip for leads who were quoted, preview, test and start it', async ({ page }) => {
  const state = { campaigns: [] };
  const writes = await mockCampaigns(page, state);
  page.on('dialog', d => d.accept());
  await page.goto('/agency/campaigns');
  await expect(page.getByText('No campaigns yet.')).toBeVisible();
  await page.getByRole('button', { name: 'New Campaign' }).click();

  await page.getByLabel('Campaign Name').fill('Quoted, Didn’t Buy');
  await page.getByRole('button', { name: 'Rate Check Leads' }).click();
  await expect(page.getByText(/14 people · 9 can get emails · 4 can get texts/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quoted, Didn’t Buy' })).toHaveAttribute('aria-pressed', 'true');

  // Step 1 (email) is filled in; preview it.
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText('Hi Dana,')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Email preview"]').getByRole('link', { name: 'Check My Rate' })).toBeVisible();

  // Add a text on day 3.
  await page.getByRole('button', { name: 'Add Text' }).click();
  const step2 = page.getByRole('article', { name: 'Step 2' });
  await expect(step2.getByLabel('Step 2 day')).toHaveValue('3');
  await step2.getByRole('button', { name: 'Preview' }).click();
  await expect(step2.getByLabel('Text preview')).toContainText('Reply STOP to opt out.');

  // Tests need a save first.
  await expect(page.getByRole('article', { name: 'Step 1' }).getByRole('button', { name: 'Send Me a Test' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect.poll(() => writes.find(w => w.table === 'campaigns' && w.method === 'POST')?.body).toMatchObject({
    name: 'Quoted, Didn’t Buy', kind: 'drip', audience: { type: 'leads', statuses: ['quoted'] }, include_existing: true, stop_on_upload: true,
  });
  const saved = writes.find(w => w.method === 'POST').body;
  expect(saved.steps.map(s => [s.channel, s.day])).toEqual([['email', 0], ['text', 3]]);

  await page.getByRole('article', { name: 'Step 1' }).getByRole('button', { name: 'Send Me a Test' }).click();
  await expect(page.getByText('Sent to cam@example.com.')).toBeVisible();
  expect(writes.find(w => w.table === 'test').body).toMatchObject({ mode: 'test', campaign_id: 'c1', step: 0 });

  await page.getByRole('button', { name: 'Start Campaign' }).click();
  await expect.poll(() => writes.filter(w => w.method === 'PATCH').at(-1)?.body).toMatchObject({ status: 'active' });
  await expect(page.getByRole('heading', { name: 'How It’s Going' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('a blast is one message; steps must be in day order; archive hides it', async ({ page }) => {
  const state = { campaigns: [] };
  const writes = await mockCampaigns(page, state);
  page.on('dialog', d => d.accept());
  await page.goto('/agency/campaigns');
  await page.getByRole('button', { name: 'New Campaign' }).click();
  await page.getByLabel('Campaign Name').fill('Affiliate Update');
  await page.getByRole('button', { name: 'Affiliates' }).click();
  await page.getByRole('button', { name: 'Add Email' }).click();
  await page.getByLabel('Step 2 day').fill('0');
  await page.getByLabel('Step 1 day').fill('5');
  await expect(page.getByRole('alert')).toHaveText('Put the steps in day order.');
  await page.getByRole('radio', { name: 'One-Time Blast' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add Email' })).toHaveCount(0);
  // Affiliates get their own links in the button choices.
  await expect(page.getByRole('combobox', { name: 'Button' }).locator('option', { hasText: 'Their Affiliate Link' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Send It' }).click();
  await expect.poll(() => writes.find(w => w.method === 'POST')?.body).toMatchObject({ kind: 'blast', status: 'active', audience: { type: 'affiliates', which: 'active' } });
  expect(writes.find(w => w.method === 'POST').body.send_at).toBeTruthy();
  expect(writes.find(w => w.method === 'POST').body.steps).toHaveLength(1);

  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('list', { name: 'Campaigns' })).toHaveCount(0);
  await page.getByRole('button', { name: /Show archived/ }).click();
  await expect(page.getByRole('list', { name: 'Archived campaigns' }).getByText('Affiliate Update')).toBeVisible();
});
