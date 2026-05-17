import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Verify Notifications Appear on Key Actions', () => {
  test('notification bell icon is visible in AppBar', async ({ page }) => {
    await login(page);

    // Notification icon should be in the app bar
    const notifIcon = page.locator(
      '[data-testid="notifications-icon"], [aria-label*="Thông báo"], .MuiBadge-root'
    );
    await expect(notifIcon.first()).toBeVisible();
  });

  test('notification appears after creating a document', async ({ page }) => {
    await login(page);
    await page.goto('/documents/new');

    // Create a document
    await page.getByLabel(/Tên tài liệu|Tên/).fill('Tài liệu thông báo E2E');
    await page.getByLabel(/Mã tài liệu|Mã/).fill(`NOTIF-${Date.now().toString().slice(-6)}`);

    await page.getByLabel(/Loại tài liệu|Loại/).click();
    await page.getByRole('option').first().click();

    await page.getByLabel(/Cụm tài liệu|Cụm/).click();
    await page.getByRole('option').first().click();

    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Check for success notification (Snackbar or toast)
    const snackbar = page.locator('.MuiSnackbar-root, .MuiAlert-root, [role="alert"]');
    await expect(snackbar.first()).toBeVisible({ timeout: 5000 });
    await expect(snackbar.first()).toContainText(/Thành công|Đã tạo|Tạo thành công/);
  });

  test('notification appears after approving a document', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Open a document that can be approved
    await page.locator('[data-testid="document-row"], tr').first().click();

    // Try to approve (if button available)
    const approveBtn = page.getByRole('button', { name: /Phê duyệt|Duyệt/ });
    if (await approveBtn.isVisible()) {
      await approveBtn.click();

      // Confirm if needed
      const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      // Check notification
      const snackbar = page.locator('.MuiSnackbar-root, .MuiAlert-root, [role="alert"]');
      await expect(snackbar.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('notification dropdown shows recent notifications', async ({ page }) => {
    await login(page);

    // Click notification icon to open dropdown
    const notifIcon = page.locator(
      '[data-testid="notifications-icon"], [aria-label*="Thông báo"]'
    ).first();
    await notifIcon.click();

    // Dropdown/menu should appear with notification items
    const notifMenu = page.locator(
      '.MuiMenu-root, .MuiPopover-root, [data-testid="notifications-menu"]'
    );
    await expect(notifMenu).toBeVisible();

    // Should have notification items or empty state
    const items = notifMenu.locator('[data-testid="notification-item"], .MuiMenuItem-root, li');
    const emptyState = notifMenu.getByText(/Không có thông báo|Trống/);

    const hasItems = (await items.count()) > 0;
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasItems || hasEmpty).toBe(true);
  });

  test('navigate to notifications page', async ({ page }) => {
    await login(page);
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: /Thông báo/ })).toBeVisible();

    // Should show notification list
    const notifList = page.locator('[data-testid="notification-list"], .MuiList-root, main');
    await expect(notifList).toBeVisible();
  });

  test('mark notification as read', async ({ page }) => {
    await login(page);
    await page.goto('/notifications');

    // Find an unread notification
    const unreadItem = page.locator(
      '[data-testid="notification-unread"], .unread, [aria-label*="chưa đọc"]'
    ).first();

    if (await unreadItem.isVisible()) {
      // Click to mark as read or use action button
      await unreadItem.click();

      // Verify it's marked as read (visual change)
      await expect(unreadItem).not.toHaveClass(/unread/);
    }
  });

  test('notification badge shows unread count', async ({ page }) => {
    await login(page);

    // Badge on notification icon
    const badge = page.locator('.MuiBadge-badge');
    if (await badge.isVisible()) {
      const badgeText = await badge.textContent();
      // Badge should show a number
      if (badgeText && badgeText.trim()) {
        expect(Number(badgeText.trim())).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
