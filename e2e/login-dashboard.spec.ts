import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Login → Dashboard → View Stats', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard displays summary statistics cards', async ({ page }) => {
    await login(page);

    // Verify dashboard title
    await expect(page.getByRole('heading', { name: /Tổng quan|Dashboard/ })).toBeVisible();

    // Verify stat cards are present
    await expect(page.locator('[data-testid="stat-card"]').first()).toBeVisible();

    // Check for key metrics: documents, members, tasks, alerts
    const content = page.locator('main');
    await expect(content.getByText(/Tài liệu/)).toBeVisible();
    await expect(content.getByText(/Hội viên/)).toBeVisible();
  });

  test('dashboard shows pending alerts section', async ({ page }) => {
    await login(page);

    // Alerts/notifications section
    await expect(page.getByText(/Cảnh báo|Thông báo/)).toBeVisible();
  });

  test('sidebar navigation is visible after login', async ({ page }) => {
    await login(page);

    // Verify sidebar nav items
    const nav = page.locator('nav, [role="navigation"]');
    await expect(nav.getByText('Tài liệu')).toBeVisible();
    await expect(nav.getByText('Hội viên')).toBeVisible();
    await expect(nav.getByText('Nhóm')).toBeVisible();
    await expect(nav.getByText('Đối tác')).toBeVisible();
    await expect(nav.getByText('Dự án')).toBeVisible();
  });

  test('failed login shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@iocm.vn');
    await page.getByLabel('Mật khẩu').fill('wrongpassword');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.getByText(/Sai email hoặc mật khẩu|Đăng nhập thất bại/)).toBeVisible();
  });
});
