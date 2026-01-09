# E2E Tests with Playwright

End-to-end tests for authentication persistence, preview button, and logout button functionality.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Set up test credentials:**

   Create a test user in Supabase with editor or admin role:

   ```sql
   -- In Supabase SQL Editor
   INSERT INTO auth.users (email, encrypted_password)
   VALUES ('test@example.com', 'your-hashed-password');

   INSERT INTO profiles (id, email, full_name, role)
   VALUES ('user-id', 'test@example.com', 'Test User', 'editor');
   ```

   Or use the Supabase dashboard to create a test user.

4. **Configure environment variables:**

   For local testing, create a `.env.local` file:
   ```
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=testpassword123
   ```

   For Vercel, add these as environment variables in your project settings:
   - `TEST_USER_EMAIL`
   - `TEST_USER_PASSWORD`

## Running Tests

### Local Development

```bash
# Run all tests (headless)
npm run test:e2e

# Run tests with UI mode (recommended for development)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# View test report
npm run test:e2e:report
```

### CI/CD (Vercel)

Add to your Vercel build settings or GitHub Actions:

```yaml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

## Test Suites

### 1. Authentication Persistence (`auth-persistence.spec.js`)

Tests that verify session persistence works correctly:

- ✅ Session persists across navigation
- ✅ Session persists on page refresh
- ✅ Session persists in new tabs
- ✅ Session is cleared on logout

### 2. Preview and Logout Buttons (`preview-logout-buttons.spec.js`)

Tests for button functionality:

**Preview Button:**
- ✅ Opens story preview in new tab
- ✅ Shows correct story content
- ✅ Shows alert if story not saved

**Logout Button:**
- ✅ Logs out and redirects to login
- ✅ Blocks dashboard access after logout
- ✅ Blocks editor access after logout
- ✅ Does not restore session on refresh

## Test Environments

The tests run against:
- **Dev:** `http://localhost:5173`
- **Vercel Preview:** Set `PLAYWRIGHT_BASE_URL` env var
- **Production:** Set `PLAYWRIGHT_BASE_URL` to production URL

## Troubleshooting

### Tests fail with timeout errors

- Ensure the dev server is running (`npm run dev`)
- Increase timeout in test file if needed
- Check that test credentials are correct

### Preview button tests fail

- Ensure there's at least one story in the database
- Check that story has a valid slug
- Verify story status allows preview

### Auth tests fail

- Verify Supabase credentials are correct
- Check that test user has proper role in `profiles` table
- Ensure Supabase auth is configured correctly

## Best Practices

1. **Use test data:** Create dedicated test stories/users
2. **Clean up:** Delete test data after tests if needed
3. **Parallel execution:** Tests are designed to run in parallel
4. **Screenshots:** Captured automatically on failure
5. **Video recording:** Enable in `playwright.config.js` for debugging
