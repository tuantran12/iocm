import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

const testPartner = {
  name: `Đối tác E2E ${Date.now()}`,
  taxCode: `PT${Date.now().toString().slice(-8)}`,
  representative: 'Lê Văn Partner',
  address: '456 Đường Công Nghệ, Quận 7, TP.HCM',
  domains: ['AI', 'Blockchain'],
};

test.describe('Partners → Create → Due Diligence → Approve → Create Agreement', () => {
  test('navigate to partners page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Đối tác/ }).click();
    await expect(page).toHaveURL(/\/partners/);
    await expect(page.getByRole('heading', { name: /Đối tác/ })).toBeVisible();
  });

  test('create a new technology partner', async ({ page }) => {
    await login(page);
    await page.goto('/partners');

    // Click create
    await page.getByRole('button', { name: /Thêm đối tác|Tạo mới/ }).click();

    // Fill partner form
    await page.getByLabel(/Tên công ty|Tên đối tác/).fill(testPartner.name);
    await page.getByLabel(/Mã số thuế/).fill(testPartner.taxCode);
    await page.getByLabel(/Người đại diện/).fill(testPartner.representative);
    await page.getByLabel(/Địa chỉ/).fill(testPartner.address);

    // Select technology domains
    await page.getByLabel(/Lĩnh vực công nghệ|Domains/).click();
    await page.getByRole('option', { name: /AI/ }).click();
    await page.keyboard.press('Escape');

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify partner created
    await expect(page.getByText(testPartner.name)).toBeVisible();
  });

  test('perform due diligence review', async ({ page }) => {
    await login(page);
    await page.goto('/partners');

    // Open partner detail
    await page.getByText(testPartner.name).first().click();

    // Navigate to due diligence
    await page.getByRole('link', { name: /Due Diligence|Thẩm định/ }).click();

    // Start new review
    await page.getByRole('button', { name: /Tạo đánh giá|Thẩm định mới|Bắt đầu/ }).click();

    // Fill scoring sections
    await page.getByLabel(/Pháp lý|Legal/).fill('8');
    await page.getByLabel(/Kỹ thuật|Technical/).fill('9');
    await page.getByLabel(/Bảo mật|Security/).fill('7');
    await page.getByLabel(/Dữ liệu|Data/).fill('8');
    await page.getByLabel(/AI/).fill('9');

    // Submit review
    await page.getByRole('button', { name: /Lưu|Hoàn thành đánh giá/ }).click();

    // Verify score displayed
    await expect(page.getByText(/Điểm tổng|Overall|R[1-5]/)).toBeVisible();
  });

  test('approve partner after due diligence', async ({ page }) => {
    await login(page);
    await page.goto('/partners');

    // Open partner
    await page.getByText(testPartner.name).first().click();

    // Approve partner
    await page.getByRole('button', { name: /Phê duyệt|Chấp nhận đối tác/ }).click();

    // Confirm if dialog
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Verify approved status
    await expect(page.getByText(/Đã phê duyệt|Approved|Đã duyệt/)).toBeVisible();
  });

  test('create agreement with partner', async ({ page }) => {
    await login(page);
    await page.goto('/agreements');

    // Create new agreement
    await page.getByRole('button', { name: /Tạo hợp đồng|Thêm thỏa thuận/ }).click();

    // Fill agreement form
    await page.getByLabel(/Tiêu đề|Tên hợp đồng/).fill(`MOU với ${testPartner.name}`);

    // Select type
    await page.getByLabel(/Loại hợp đồng|Loại/).click();
    await page.getByRole('option', { name: /MOU|Biên bản ghi nhớ/ }).click();

    // Select partner
    await page.getByLabel(/Đối tác|Bên B/).click();
    await page.getByRole('option', { name: new RegExp(testPartner.name.slice(0, 15)) }).click();

    // Set dates
    await page.getByLabel(/Ngày hiệu lực/).fill('01/01/2025');
    await page.getByLabel(/Ngày hết hạn/).fill('31/12/2025');

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify agreement created
    await expect(page.getByText(new RegExp(`MOU với ${testPartner.name.slice(0, 10)}`))).toBeVisible();
  });
});
