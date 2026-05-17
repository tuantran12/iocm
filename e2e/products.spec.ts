import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

const testProduct = {
  name: `Sản phẩm AI E2E ${Date.now()}`,
  version: '1.0.0',
  description: 'Sản phẩm công nghệ AI được tạo bởi E2E test',
  type: 'SaaS',
};

test.describe('Products → Create → Review → Approve → Link to Pilot', () => {
  test('navigate to products page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Sản phẩm|Products/ }).click();
    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByRole('heading', { name: /Sản phẩm/ })).toBeVisible();
  });

  test('create a new technology product', async ({ page }) => {
    await login(page);
    await page.goto('/products');

    // Click create
    await page.getByRole('button', { name: /Thêm sản phẩm|Tạo mới/ }).click();

    // Fill product form
    await page.getByLabel(/Tên sản phẩm|Tên/).fill(testProduct.name);
    await page.getByLabel(/Phiên bản|Version/).fill(testProduct.version);
    await page.getByLabel(/Mô tả/).fill(testProduct.description);

    // Select type
    await page.getByLabel(/Loại sản phẩm|Loại/).click();
    await page.getByRole('option', { name: /SaaS|Phần mềm/ }).first().click();

    // Mark AI usage
    const aiCheckbox = page.getByLabel(/Sử dụng AI|AI/);
    if (await aiCheckbox.isVisible()) {
      await aiCheckbox.check();
    }

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify product created
    await expect(page.getByText(testProduct.name)).toBeVisible();
  });

  test('review product (security, data, AI gates)', async ({ page }) => {
    await login(page);
    await page.goto('/products');

    // Open product detail
    await page.getByText(testProduct.name).first().click();

    // Security review
    await page.getByRole('button', { name: /Đánh giá bảo mật|Security Review/ }).click();
    await page.getByLabel(/Kết quả|Trạng thái/).click();
    await page.getByRole('option', { name: /Đạt|Passed|Approved/ }).click();
    await page.getByRole('button', { name: /Lưu|Xác nhận/ }).click();

    // Data review
    await page.getByRole('button', { name: /Đánh giá dữ liệu|Data Review/ }).click();
    await page.getByLabel(/Kết quả|Trạng thái/).click();
    await page.getByRole('option', { name: /Đạt|Passed|Approved/ }).click();
    await page.getByRole('button', { name: /Lưu|Xác nhận/ }).click();

    // AI review (if applicable)
    const aiReviewBtn = page.getByRole('button', { name: /Đánh giá AI|AI Review/ });
    if (await aiReviewBtn.isVisible()) {
      await aiReviewBtn.click();
      await page.getByLabel(/Kết quả|Trạng thái/).click();
      await page.getByRole('option', { name: /Đạt|Passed|Approved/ }).click();
      await page.getByRole('button', { name: /Lưu|Xác nhận/ }).click();
    }

    // Verify all reviews passed
    await expect(page.getByText(/Đã đánh giá|Reviewed/)).toBeVisible();
  });

  test('approve product', async ({ page }) => {
    await login(page);
    await page.goto('/products');

    // Open product
    await page.getByText(testProduct.name).first().click();

    // Approve
    await page.getByRole('button', { name: /Phê duyệt|Approve/ }).click();

    // Confirm
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // Verify approved
    await expect(page.getByText(/APPROVED|Đã phê duyệt/)).toBeVisible();
  });

  test('link product to pilot deployment', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // Open a project or create one for pilot
    await page.getByRole('button', { name: /Tạo dự án|Thêm/ }).click();
    await page.getByLabel(/Tên dự án|Tên/).fill('Dự án Pilot E2E');
    await page.getByLabel(/Mục tiêu|Goal/).fill('Pilot sản phẩm E2E');
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Navigate to pilot section
    await page.getByRole('tab', { name: /Pilot|Triển khai thử/ }).click();

    // Create pilot deployment
    await page.getByRole('button', { name: /Thêm pilot|Tạo pilot/ }).click();

    // Link product
    await page.getByLabel(/Sản phẩm|Product/).click();
    await page.getByRole('option', { name: new RegExp(testProduct.name.slice(0, 15)) }).click();

    // Fill deployment details
    await page.getByLabel(/Khu vực triển khai|Deployment area/).fill('Quận 1, TP.HCM');

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify pilot linked
    await expect(page.getByText(testProduct.name.slice(0, 15))).toBeVisible();
  });
});
