// tests/e2e/auth-persistence.spec.js
// E2E tests for authentication persistence across navigation and page refreshes

import { test, expect } from '@playwright/test';

// Test credentials - these should be set in Vercel env vars
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'testpassword123';

/**
 * Helper function to log in
 */
async function login(page) {
  await page.goto('/admin-access-8by2X');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL('**/news/dashboard', { timeout: 10000 });
}

test.describe('Authentication Persistence', () => {
  test('should persist session across navigation', async ({ page }) => {
    // Log in
    await login(page);

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/\/news\/dashboard/);

    // Check that user menu is visible
    const userMenu = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await expect(userMenu).toBeVisible({ timeout: 5000 });

    // Navigate to editor page
    await page.click('a[href="/news/editor"]');
    await page.waitForURL('**/news/editor');

    // User should still be logged in
    await expect(userMenu).toBeVisible();

    // Navigate back to dashboard
    await page.click('text=Back to Dashboard');
    await page.waitForURL('**/news/dashboard');

    // User should still be logged in
    await expect(userMenu).toBeVisible();

    // Navigate to newsroom
    await page.click('text=View Newsroom');
    await page.waitForURL('**/news');

    // User should still be logged in (check for user menu if it appears on public pages)
    // Or verify we can navigate back to dashboard
    await page.goto('/news/dashboard');
    await expect(page).toHaveURL(/\/news\/dashboard/);
    await expect(userMenu).toBeVisible();
  });

  test('should persist session on page refresh', async ({ page }) => {
    // Log in
    await login(page);

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/\/news\/dashboard/);

    // Check that user is logged in
    const dashboardHeading = page.locator('h1:has-text("Newsroom Dashboard")');
    await expect(dashboardHeading).toBeVisible();

    // Refresh the page
    await page.reload();

    // User should still be on dashboard (not redirected to login)
    await expect(page).toHaveURL(/\/news\/dashboard/);
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });

    // Navigate to editor
    await page.goto('/news/editor');
    await expect(page).toHaveURL(/\/news\/editor/);

    // Refresh on editor page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL(/\/news\/editor/);
    const editorHeading = page.locator('text=Back to Dashboard');
    await expect(editorHeading).toBeVisible({ timeout: 5000 });
  });

  test('should persist session in new tab', async ({ context }) => {
    // Create first page and log in
    const page1 = await context.newPage();
    await login(page1);

    // Verify logged in
    await expect(page1).toHaveURL(/\/news\/dashboard/);

    // Open new tab
    const page2 = await context.newPage();

    // Navigate directly to dashboard in new tab
    await page2.goto('/news/dashboard');

    // Should be logged in (not redirected to login)
    await expect(page2).toHaveURL(/\/news\/dashboard/);
    const dashboardHeading = page2.locator('h1:has-text("Newsroom Dashboard")');
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });

    // Close tabs
    await page1.close();
    await page2.close();
  });

  test('should clear session on logout', async ({ page }) => {
    // Log in
    await login(page);

    // Verify logged in
    await expect(page).toHaveURL(/\/news\/dashboard/);

    // Open user menu and logout
    const userMenu = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await userMenu.click();

    // Click logout button
    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    // Should be redirected to login page
    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });
    await expect(page).toHaveURL(/\/admin-access-8by2X/);

    // Try to navigate to dashboard
    await page.goto('/news/dashboard');

    // Should be redirected back to login
    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });
    await expect(page).toHaveURL(/\/admin-access-8by2X/);

    // Refresh page
    await page.reload();

    // Should still be on login page (session not restored)
    await expect(page).toHaveURL(/\/admin-access-8by2X/);
  });
});
