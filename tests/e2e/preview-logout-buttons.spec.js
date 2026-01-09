// tests/e2e/preview-logout-buttons.spec.js
// E2E tests for Preview button and Logout button functionality

import { test, expect } from '@playwright/test';

// Test credentials
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
  await page.waitForURL('**/news/dashboard', { timeout: 10000 });
}

test.describe('Preview Button', () => {
  test('should open preview of story in new tab', async ({ context }) => {
    // Create page and log in
    const page = await context.newPage();
    await login(page);

    // Navigate to dashboard
    await page.goto('/news/dashboard');
    await expect(page).toHaveURL(/\/news\/dashboard/);

    // Check if there are any stories
    const storyRows = page.locator('tbody tr');
    const count = await storyRows.count();

    if (count === 0) {
      // No stories exist - create one first
      await page.click('a[href="/news/editor"]');
      await page.waitForURL('**/news/editor');

      // Fill in story details
      await page.fill('input[placeholder*="title"]', 'Test Story for Preview');
      await page.fill('textarea[placeholder*="preview"]', 'This is a test story for preview button testing.');
      await page.fill('textarea[placeholder*="body"]', 'This is the body of the test story.\n\nIt has multiple paragraphs.');

      // Save the story
      await page.click('button:has-text("Save Draft")');

      // Wait for success
      await page.waitForTimeout(2000);
    } else {
      // Click on first story to edit
      const firstEditButton = page.locator('a[href*="/news/editor/"]').first();
      await firstEditButton.click();
      await page.waitForURL('**/news/editor/**');
    }

    // Get the story slug
    const slugInput = page.locator('input[value*="-"], input[placeholder*="slug"]');
    const slug = await slugInput.inputValue();

    // Listen for new page (popup/tab)
    const pagePromise = context.waitForEvent('page');

    // Click preview button
    const previewButton = page.locator('button:has-text("Preview")');
    await previewButton.click();

    // Wait for new page to open
    const newPage = await pagePromise;
    await newPage.waitForLoadState();

    // Verify the preview page URL
    const url = newPage.url();
    expect(url).toContain('/news/');
    expect(url).toContain(slug);

    // Verify story content is visible
    const storyTitle = newPage.locator('h1');
    await expect(storyTitle).toBeVisible({ timeout: 5000 });

    // Verify author byline is present
    const byline = newPage.locator('text=/By .+/');
    await expect(byline).toBeVisible({ timeout: 5000 });

    // Close preview page
    await newPage.close();

    // Original page should still be on editor
    await expect(page).toHaveURL(/\/news\/editor/);
  });

  test('should show alert if preview clicked without slug', async ({ page }) => {
    // Log in
    await login(page);

    // Navigate to new story editor
    await page.goto('/news/editor');
    await expect(page).toHaveURL(/\/news\/editor$/);

    // Set up dialog handler
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Click preview without saving
    const previewButton = page.locator('button:has-text("Preview")');
    await previewButton.click();

    // Wait a bit for dialog
    await page.waitForTimeout(500);

    // Verify alert was shown
    expect(dialogMessage).toContain('save the story first');
  });
});

test.describe('Logout Button', () => {
  test('should logout and redirect to login page', async ({ page }) => {
    // Log in
    await login(page);

    // Verify logged in
    await expect(page).toHaveURL(/\/news\/dashboard/);
    const dashboardHeading = page.locator('h1:has-text("Newsroom Dashboard")');
    await expect(dashboardHeading).toBeVisible();

    // Open user menu
    const userMenuButton = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await userMenuButton.click();

    // Wait for dropdown to appear
    await page.waitForTimeout(300);

    // Click logout
    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    // Should redirect to login page
    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });
    await expect(page).toHaveURL(/\/admin-access-8by2X/);

    // Verify login form is visible
    const loginHeading = page.locator('h1:has-text("Newsroom Login")');
    await expect(loginHeading).toBeVisible();
  });

  test('should block dashboard access after logout', async ({ page }) => {
    // Log in
    await login(page);

    // Logout
    const userMenuButton = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await userMenuButton.click();
    await page.waitForTimeout(300);

    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });

    // Try to access dashboard
    await page.goto('/news/dashboard');

    // Should be redirected to login
    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });
    await expect(page).toHaveURL(/\/admin-access-8by2X/);
  });

  test('should block editor access after logout', async ({ page }) => {
    // Log in
    await login(page);

    // Logout
    const userMenuButton = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await userMenuButton.click();
    await page.waitForTimeout(300);

    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });

    // Try to access editor
    await page.goto('/news/editor');

    // Should be redirected to login
    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });
    await expect(page).toHaveURL(/\/admin-access-8by2X/);
  });

  test('should not restore session after logout and refresh', async ({ page }) => {
    // Log in
    await login(page);

    // Logout
    const userMenuButton = page.locator('button:has-text("User"), button:has-text("admin"), button:has-text("editor")').first();
    await userMenuButton.click();
    await page.waitForTimeout(300);

    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    await page.waitForURL('**/admin-access-8by2X', { timeout: 5000 });

    // Refresh the page
    await page.reload();

    // Should still be on login page (not logged back in)
    await expect(page).toHaveURL(/\/admin-access-8by2X/);

    const loginHeading = page.locator('h1:has-text("Newsroom Login")');
    await expect(loginHeading).toBeVisible();
  });
});
