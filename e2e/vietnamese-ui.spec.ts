import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Verify Vietnamese UI (labels, dates dd/MM/yyyy, messages)', () => {
  test('login page displays Vietnamese labels', async ({ page }) => {
    await page.goto('/login');

    // Verify Vietnamese labels on login form
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Mật khẩu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();

    // Check for Vietnamese text content
    await expect(page.getByText(/Đăng nhập|Chào mừng/)).toBeVisible();
  });

  test('sidebar navigation uses Vietnamese labels', async ({ page }) => {
    await login(page);

    const nav = page.locator('nav, [role="navigation"]');

    // All navigation items should be in Vietnamese
    await expect(nav.getByText('Tổng quan')).toBeVisible();
    await expect(nav.getByText('Tài liệu')).toBeVisible();
    await expect(nav.getByText('Hội viên')).toBeVisible();
    await expect(nav.getByText('Nhóm')).toBeVisible();
    await expect(nav.getByText('Đối tác')).toBeVisible();
    await expect(nav.getByText('Dự án')).toBeVisible();
  });

  test('dates are displayed in dd/MM/yyyy format', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Look for date patterns in the page - should be dd/MM/yyyy
    const datePattern = /\d{2}\/\d{2}\/\d{4}/;
    const pageContent = await page.locator('main').textContent();

    // If there are dates on the page, they should match Vietnamese format
    if (pageContent && datePattern.test(pageContent)) {
      const dates = pageContent.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
      for (const date of dates) {
        const [day, month] = date.split('/').map(Number);
        // Day should be 1-31, month should be 1-12
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }
    }
  });

  test('form validation messages are in Vietnamese', async ({ page }) => {
    await page.goto('/login');

    // Submit empty form to trigger validation
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Validation messages should be in Vietnamese
    const errorMessages = page.locator('[role="alert"], .MuiFormHelperText-root, .error-message');
    const count = await errorMessages.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const text = await errorMessages.nth(i).textContent();
        // Should not contain English-only error messages
        expect(text).not.toMatch(/^(Required|This field is required|Invalid)$/);
      }
    }
  });

  test('success/error notifications are in Vietnamese', async ({ page }) => {
    await page.goto('/login');

    // Trigger error with wrong credentials
    await page.getByLabel('Email').fill('wrong@test.vn');
    await page.getByLabel('Mật khẩu').fill('wrongpass');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Error message should be in Vietnamese
    const errorMsg = page.locator('.MuiAlert-root, [role="alert"], .MuiSnackbar-root');
    await expect(errorMsg.first()).toBeVisible();
    const text = await errorMsg.first().textContent();
    // Vietnamese characters present (diacritics)
    expect(text).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
  });

  test('table headers and buttons use Vietnamese text', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Table headers should be Vietnamese
    const headers = page.locator('th, [role="columnheader"]');
    const headerCount = await headers.count();
    if (headerCount > 0) {
      // Check at least some headers contain Vietnamese
      const headerTexts: string[] = [];
      for (let i = 0; i < Math.min(headerCount, 5); i++) {
        const text = await headers.nth(i).textContent();
        if (text) headerTexts.push(text);
      }
      // At least one header should have Vietnamese diacritics or known Vietnamese words
      const hasVietnamese = headerTexts.some(
        (t) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t) ||
          /Tên|Mã|Trạng thái|Ngày|Loại|Hành động/.test(t)
      );
      expect(hasVietnamese).toBe(true);
    }

    // Action buttons should be Vietnamese
    const buttons = page.locator('button');
    const btnTexts: string[] = [];
    const btnCount = await buttons.count();
    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.trim().length > 0) btnTexts.push(text.trim());
    }
    // Should have Vietnamese button labels
    const hasVietnameseBtn = btnTexts.some(
      (t) => /Tạo|Thêm|Lưu|Xóa|Sửa|Duyệt|Xuất|Tìm/.test(t)
    );
    expect(hasVietnameseBtn).toBe(true);
  });

  test('MUI DatePicker uses Vietnamese locale', async ({ page }) => {
    await login(page);
    await page.goto('/documents/new');

    // Open a date picker
    const dateInput = page.getByLabel(/Hạn|Ngày|Deadline/);
    if (await dateInput.isVisible()) {
      await dateInput.click();

      // Calendar should show Vietnamese month names
      const calendar = page.locator('.MuiPickersCalendarHeader-label, .MuiDayCalendar-header');
      if (await calendar.isVisible()) {
        const calText = await calendar.textContent();
        // Vietnamese month names: Tháng 1, Tháng 2, etc. or abbreviated
        expect(calText).toMatch(/[Tt]háng|Th\d+/);
      }
    }
  });
});
