import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Documents → Create → Completeness Check → Approve', () => {
  test('navigate to documents page', async ({ page }) => {
    await login(page);

    // Navigate via sidebar
    await page.getByRole('link', { name: /Tài liệu/ }).click();
    await expect(page).toHaveURL(/\/documents/);
    await expect(page.getByRole('heading', { name: /Tài liệu|Ma trận tài liệu/ })).toBeVisible();
  });

  test('create a new document', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Click create button
    await page.getByRole('button', { name: /Tạo mới|Thêm tài liệu/ }).click();
    await expect(page).toHaveURL(/\/documents\/new/);

    // Fill document form
    await page.getByLabel(/Tên tài liệu|Tên/).fill('Quy chế hoạt động nội bộ E2E');
    await page.getByLabel(/Mã tài liệu|Mã/).fill('DOC-E2E-001');

    // Select document type
    await page.getByLabel(/Loại tài liệu|Loại/).click();
    await page.getByRole('option', { name: /Quy chế|Nội quy/ }).click();

    // Select cluster
    await page.getByLabel(/Cụm tài liệu|Cụm/).click();
    await page.getByRole('option', { name: /Nội bộ|CORE_FOUNDING/ }).click();

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify redirect to document detail
    await expect(page.getByText('Quy chế hoạt động nội bộ E2E')).toBeVisible();
  });

  test('perform completeness check on document', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Click on a document to open detail
    await page.getByRole('link', { name: /Quy chế hoạt động nội bộ E2E/ }).first().click();

    // Navigate to completeness tab
    await page.getByRole('tab', { name: /Kiểm tra đầy đủ|Completeness/ }).click();

    // Answer completeness questions (Q1-Q8)
    const questions = page.locator('[data-testid="completeness-question"]');
    const count = await questions.count();
    for (let i = 0; i < Math.min(count, 8); i++) {
      await questions.nth(i).getByRole('radio', { name: /Có|Đạt/ }).click();
    }

    // Save completeness check
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).click();

    // Verify score updated
    await expect(page.getByText(/100%|Hoàn thành/)).toBeVisible();
  });

  test('submit document for approval and approve', async ({ page }) => {
    await login(page);
    await page.goto('/documents');

    // Open document
    await page.getByRole('link', { name: /Quy chế hoạt động nội bộ E2E/ }).first().click();

    // Submit for review
    await page.getByRole('button', { name: /Gửi duyệt|Trình duyệt/ }).click();
    await expect(page.getByText(/Đang chờ duyệt|IN_REVIEW|Chờ phê duyệt/)).toBeVisible();

    // Approve document (admin has approver role)
    await page.getByRole('button', { name: /Phê duyệt|Duyệt/ }).click();

    // Confirm approval dialog if present
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Verify approved status
    await expect(page.getByText(/Đã duyệt|APPROVED|Phê duyệt/)).toBeVisible();
  });
});
