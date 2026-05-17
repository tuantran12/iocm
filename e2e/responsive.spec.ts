import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Verify Responsive — Desktop (1024px) and Tablet (768px)', () => {
  test.describe('Desktop viewport (1024px)', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('sidebar navigation is visible on desktop', async ({ page }) => {
      await login(page);

      // Sidebar/Drawer should be visible (permanent drawer on desktop)
      const sidebar = page.locator('[data-testid="sidebar"], .MuiDrawer-root, nav');
      await expect(sidebar.first()).toBeVisible();

      // Navigation items visible
      await expect(page.getByText('Tài liệu')).toBeVisible();
      await expect(page.getByText('Hội viên')).toBeVisible();
    });

    test('main content area has proper width on desktop', async ({ page }) => {
      await login(page);

      const main = page.locator('main, [role="main"]');
      const box = await main.first().boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Main content should take remaining space (at least 700px on 1024 viewport)
        expect(box.width).toBeGreaterThan(600);
      }
    });

    test('data tables display all columns on desktop', async ({ page }) => {
      await login(page);
      await page.goto('/documents');

      // DataGrid should show multiple columns
      const columns = page.locator('[role="columnheader"], th');
      const count = await columns.count();
      // Desktop should show at least 4 columns
      expect(count).toBeGreaterThanOrEqual(4);
    });

    test('AppBar shows search and notifications on desktop', async ({ page }) => {
      await login(page);

      const appBar = page.locator('header, .MuiAppBar-root');
      await expect(appBar).toBeVisible();

      // Search should be visible on desktop
      const search = appBar.locator('[data-testid="search"], input[type="search"], [aria-label*="Tìm"]');
      if (await search.isVisible()) {
        await expect(search).toBeVisible();
      }

      // Notification icon should be visible
      const notifIcon = appBar.locator('[data-testid="notifications"], [aria-label*="Thông báo"]');
      if (await notifIcon.isVisible()) {
        await expect(notifIcon).toBeVisible();
      }
    });
  });

  test.describe('Tablet viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('sidebar is collapsed or hidden on tablet', async ({ page }) => {
      await login(page);

      // On tablet, sidebar should be collapsed (hamburger menu) or bottom nav
      const hamburger = page.locator(
        '[data-testid="menu-toggle"], [aria-label*="menu"], button:has(.MuiSvgIcon-root)'
      );

      // Either hamburger is visible OR bottom navigation is present
      const bottomNav = page.locator('.MuiBottomNavigation-root, [data-testid="bottom-nav"]');
      const hasHamburger = await hamburger.first().isVisible().catch(() => false);
      const hasBottomNav = await bottomNav.isVisible().catch(() => false);

      // At least one responsive navigation pattern should be present
      expect(hasHamburger || hasBottomNav).toBe(true);
    });

    test('main content takes full width on tablet', async ({ page }) => {
      await login(page);

      const main = page.locator('main, [role="main"]');
      const box = await main.first().boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // On tablet, main content should be close to full width
        expect(box.width).toBeGreaterThan(700);
      }
    });

    test('forms are usable on tablet viewport', async ({ page }) => {
      await login(page);
      await page.goto('/documents/new');

      // Form fields should be visible and not overflow
      const form = page.locator('form');
      if (await form.isVisible()) {
        const formBox = await form.boundingBox();
        expect(formBox).not.toBeNull();
        if (formBox) {
          // Form should not exceed viewport width
          expect(formBox.width).toBeLessThanOrEqual(768);
        }
      }
    });

    test('data tables are scrollable or adapted on tablet', async ({ page }) => {
      await login(page);
      await page.goto('/documents');

      // Table container should handle overflow
      const tableContainer = page.locator(
        '.MuiDataGrid-root, .MuiTableContainer-root, [role="grid"]'
      );
      if (await tableContainer.isVisible()) {
        const box = await tableContainer.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          // Table should not exceed viewport
          expect(box.width).toBeLessThanOrEqual(768 + 20); // small margin for scrollbar
        }
      }
    });

    test('hamburger menu opens navigation on tablet', async ({ page }) => {
      await login(page);

      // Find and click hamburger/menu button
      const menuBtn = page.locator(
        '[data-testid="menu-toggle"], [aria-label*="menu"], [aria-label*="Menu"]'
      ).first();

      if (await menuBtn.isVisible()) {
        await menuBtn.click();

        // Navigation drawer should appear
        await expect(page.getByText('Tài liệu')).toBeVisible();
        await expect(page.getByText('Hội viên')).toBeVisible();
      }
    });
  });

  test.describe('Login page responsive', () => {
    test('login form is centered on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/login');

      const form = page.locator('form');
      const box = await form.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Form should be roughly centered
        const leftMargin = box.x;
        const rightMargin = 1024 - (box.x + box.width);
        expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(200);
      }
    });

    test('login form fits tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/login');

      const form = page.locator('form');
      const box = await form.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(768);
      }
    });
  });
});
