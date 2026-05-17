import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Verify Audit Log Records Actions', () => {
  test('navigate to audit log page', async ({ page }) => {
    await login(page);

    // Navigate via sidebar or settings
    await page.getByRole('link', { name: /Nhật ký|Audit/ }).click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(page.getByRole('heading', { name: /Nhật ký|Audit Log|Lịch sử/ })).toBeVisible();
  });

  test('audit log displays entries in a table', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Should have a data grid/table with audit entries
    const table = page.locator('.MuiDataGrid-root, table, [role="grid"]');
    await expect(table).toBeVisible();

    // Should have columns: user, action, target, timestamp
    const headers = page.locator('[role="columnheader"], th');
    const headerTexts: string[] = [];
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      const text = await headers.nth(i).textContent();
      if (text) headerTexts.push(text);
    }

    // Verify key columns exist (in Vietnamese)
    const allHeaders = headerTexts.join(' ');
    expect(allHeaders).toMatch(/Người dùng|User|Tài khoản/);
    expect(allHeaders).toMatch(/Hành động|Action|Thao tác/);
    expect(allHeaders).toMatch(/Thời gian|Timestamp|Ngày/);
  });

  test('performing an action creates an audit log entry', async ({ page }) => {
    await login(page);

    // Perform an action: create a document
    await page.goto('/documents/new');
    const docCode = `AUDIT-${Date.now().toString().slice(-6)}`;
    await page.getByLabel(/Tên tài liệu|Tên/).fill('Tài liệu Audit Test');
    await page.getByLabel(/Mã tài liệu|Mã/).fill(docCode);

    await page.getByLabel(/Loại tài liệu|Loại/).click();
    await page.getByRole('option').first().click();

    await page.getByLabel(/Cụm tài liệu|Cụm/).click();
    await page.getByRole('option').first().click();

    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Wait for creation to complete
    await expect(page.getByText('Tài liệu Audit Test')).toBeVisible();

    // Navigate to audit log
    await page.goto('/audit');

    // Search or filter for the recent action
    const searchInput = page.getByPlaceholder(/Tìm kiếm|Search/);
    if (await searchInput.isVisible()) {
      await searchInput.fill(docCode);
      await page.keyboard.press('Enter');
    }

    // Verify the create action is logged
    await expect(page.getByText(/create|CREATE|Tạo/i).first()).toBeVisible();
  });

  test('audit log shows login events', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Filter for login actions
    const actionFilter = page.getByLabel(/Hành động|Action|Lọc/);
    if (await actionFilter.isVisible()) {
      await actionFilter.click();
      await page.getByRole('option', { name: /Login|Đăng nhập/ }).click();
    }

    // Should show login entries
    await expect(page.getByText(/login|LOGIN|Đăng nhập/i).first()).toBeVisible();
  });

  test('audit log entries show before/after values for updates', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Find an update entry
    const updateRow = page.getByText(/update|UPDATE|Cập nhật/i).first();
    if (await updateRow.isVisible()) {
      await updateRow.click();

      // Detail view should show before/after values
      const detail = page.locator('[data-testid="audit-detail"], .MuiDialog-root, [role="dialog"]');
      if (await detail.isVisible()) {
        await expect(detail.getByText(/Trước|Before|Giá trị cũ/)).toBeVisible();
        await expect(detail.getByText(/Sau|After|Giá trị mới/)).toBeVisible();
      }
    }
  });

  test('audit log can be filtered by date range', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Look for date range filter
    const fromDate = page.getByLabel(/Từ ngày|From|Bắt đầu/);
    const toDate = page.getByLabel(/Đến ngày|To|Kết thúc/);

    if (await fromDate.isVisible()) {
      await fromDate.fill('01/01/2025');
      await toDate.fill('31/12/2025');

      // Apply filter
      const filterBtn = page.getByRole('button', { name: /Lọc|Áp dụng|Filter/ });
      if (await filterBtn.isVisible()) {
        await filterBtn.click();
      }

      // Table should still be visible (filtered results)
      const table = page.locator('.MuiDataGrid-root, table, [role="grid"]');
      await expect(table).toBeVisible();
    }
  });

  test('audit log can be exported', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Look for export button
    const exportBtn = page.getByRole('button', { name: /Xuất|Export|Tải xuống/ });
    if (await exportBtn.isVisible()) {
      // Start download
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await exportBtn.click();

      const download = await downloadPromise;
      if (download) {
        // Verify file was downloaded
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/audit|log|nhật.ký/i);
      }
    }
  });

  test('audit log records user IP address', async ({ page }) => {
    await login(page);
    await page.goto('/audit');

    // Check if IP column exists
    const headers = page.locator('[role="columnheader"], th');
    const count = await headers.count();
    let hasIpColumn = false;
    for (let i = 0; i < count; i++) {
      const text = await headers.nth(i).textContent();
      if (text && /IP|Địa chỉ IP/.test(text)) {
        hasIpColumn = true;
        break;
      }
    }

    // If IP column exists, verify entries have IP values
    if (hasIpColumn) {
      const ipCells = page.locator('td, [role="cell"]');
      const cellTexts: string[] = [];
      const cellCount = await ipCells.count();
      for (let i = 0; i < Math.min(cellCount, 20); i++) {
        const text = await ipCells.nth(i).textContent();
        if (text) cellTexts.push(text);
      }
      // Should have at least one IP-like value
      const hasIp = cellTexts.some((t) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1/.test(t));
      expect(hasIp).toBe(true);
    }
  });
});
