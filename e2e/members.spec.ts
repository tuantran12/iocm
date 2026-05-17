import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

const testEnterprise = {
  name: `Công ty TNHH E2E Test ${Date.now()}`,
  taxCode: `E2E${Date.now().toString().slice(-8)}`,
  representative: 'Nguyễn Văn E2E',
  contactName: 'Trần Thị Test',
  contactEmail: 'e2e@test.vn',
  contactPhone: '0901234567',
  address: '123 Đường Test, Quận 1, TP.HCM',
};

test.describe('Members → Application → Approve → Assign Tier → Generate Fee → Record Payment', () => {
  test('navigate to members page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Hội viên/ }).click();
    await expect(page).toHaveURL(/\/members/);
    await expect(page.getByRole('heading', { name: /Hội viên|Doanh nghiệp/ })).toBeVisible();
  });

  test('submit membership application', async ({ page }) => {
    await login(page);
    await page.goto('/members');

    // Click create/apply button
    await page.getByRole('button', { name: /Thêm|Tạo đơn|Đăng ký/ }).click();

    // Fill application form
    await page.getByLabel(/Tên doanh nghiệp|Tên pháp nhân/).fill(testEnterprise.name);
    await page.getByLabel(/Mã số thuế/).fill(testEnterprise.taxCode);
    await page.getByLabel(/Người đại diện/).fill(testEnterprise.representative);
    await page.getByLabel(/Người liên hệ|Tên liên hệ/).fill(testEnterprise.contactName);
    await page.getByLabel(/Email liên hệ|Email/).fill(testEnterprise.contactEmail);
    await page.getByLabel(/Số điện thoại|Điện thoại/).fill(testEnterprise.contactPhone);
    await page.getByLabel(/Địa chỉ/).fill(testEnterprise.address);

    // Submit application
    await page.getByRole('button', { name: /Gửi đơn|Nộp đơn|Lưu/ }).click();

    // Verify application submitted
    await expect(page.getByText(/Đã gửi|Chờ xét duyệt|APPLICATION_SUBMITTED/)).toBeVisible();
  });

  test('approve membership application', async ({ page }) => {
    await login(page);
    await page.goto('/members/applications');

    // Find the pending application
    await page.getByText(testEnterprise.name).first().click();

    // Approve
    await page.getByRole('button', { name: /Phê duyệt|Duyệt đơn|Chấp nhận/ }).click();

    // Confirm if dialog appears
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Verify approved
    await expect(page.getByText(/Đã duyệt|APPROVED|Đã phê duyệt/)).toBeVisible();
  });

  test('assign membership tier', async ({ page }) => {
    await login(page);
    await page.goto('/members');

    // Open member detail
    await page.getByText(testEnterprise.name).first().click();

    // Assign tier
    await page.getByLabel(/Cấp hội viên|Hạng|Tier/).click();
    await page.getByRole('option', { name: /Vàng|Gold|Bạc|Silver|Tiêu chuẩn/ }).first().click();

    // Save
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).click();
    await expect(page.getByText(/Đã cập nhật|Thành công/)).toBeVisible();
  });

  test('generate annual fee', async ({ page }) => {
    await login(page);
    await page.goto('/fees');

    // Generate fee for the member
    await page.getByRole('button', { name: /Tạo phí|Phát sinh phí|Tạo hóa đơn/ }).click();

    // Select member
    await page.getByLabel(/Doanh nghiệp|Hội viên/).click();
    await page.getByRole('option', { name: new RegExp(testEnterprise.name.slice(0, 20)) }).click();

    // Select year
    await page.getByLabel(/Năm/).fill(new Date().getFullYear().toString());

    // Generate
    await page.getByRole('button', { name: /Tạo|Phát sinh|Lưu/ }).click();

    // Verify fee created
    await expect(page.getByText(/Đã tạo phí|Thành công|NOT_INVOICED|Chưa xuất hóa đơn/)).toBeVisible();
  });

  test('record payment for fee', async ({ page }) => {
    await login(page);
    await page.goto('/fees');

    // Find the fee row and click to record payment
    await page.getByText(testEnterprise.name.slice(0, 20)).first().click();

    // Click record payment
    await page.getByRole('button', { name: /Ghi nhận thanh toán|Thanh toán/ }).click();

    // Fill payment details
    await page.getByLabel(/Số tiền|Amount/).fill('50000000');
    await page.getByLabel(/Ngày thanh toán/).fill(
      new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    );

    // Submit payment
    await page.getByRole('button', { name: /Xác nhận|Lưu|Ghi nhận/ }).click();

    // Verify payment recorded
    await expect(page.getByText(/Đã thanh toán|PAID|Hoàn thành/)).toBeVisible();
  });
});
