import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('app loads and renders login page', async ({ page }) => {
    await page.goto('/');

    // App should redirect to login or show main page
    await expect(page).toHaveTitle(/.+/);

    // Verify the page has loaded (body is visible)
    await expect(page.locator('body')).toBeVisible();
  });

  test('Vietnamese locale is active', async ({ page }) => {
    // Verify the browser locale is set to vi-VN
    const locale = await page.evaluate(() => navigator.language);
    expect(locale).toBe('vi-VN');
  });
});
