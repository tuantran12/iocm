import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

const testProject = {
  name: `Dự án KPI E2E ${Date.now()}`,
  goal: 'Đo lường hiệu quả triển khai công nghệ',
  type: 'Pilot',
};

test.describe('Projects → Create → Add KPIs → Measure → Generate Report', () => {
  test('navigate to projects page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Dự án/ }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole('heading', { name: /Dự án/ })).toBeVisible();
  });

  test('create a new project', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // Click create
    await page.getByRole('button', { name: /Tạo dự án|Thêm/ }).click();

    // Fill project form
    await page.getByLabel(/Tên dự án|Tên/).fill(testProject.name);
    await page.getByLabel(/Mục tiêu|Goal/).fill(testProject.goal);

    // Select type
    await page.getByLabel(/Loại dự án|Loại/).click();
    await page.getByRole('option', { name: /Pilot|Thử nghiệm/ }).first().click();

    // Set dates
    await page.getByLabel(/Ngày bắt đầu/).fill('01/01/2025');
    await page.getByLabel(/Ngày kết thúc/).fill('30/06/2025');

    // Submit
    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify project created
    await expect(page.getByText(testProject.name)).toBeVisible();
  });

  test('add KPI metrics to project', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // Open project
    await page.getByText(testProject.name).first().click();

    // Navigate to KPIs tab
    await page.getByRole('tab', { name: /KPI|Chỉ số/ }).click();

    // Add first KPI
    await page.getByRole('button', { name: /Thêm KPI|Tạo chỉ số/ }).click();

    await page.getByLabel(/Tên chỉ số|Tên KPI/).fill('Số người dùng thử nghiệm');
    await page.getByLabel(/Đơn vị|Unit/).fill('người');
    await page.getByLabel(/Giá trị mục tiêu|Target/).fill('100');
    await page.getByLabel(/Giá trị cơ sở|Baseline/).fill('0');

    // Select KPI type
    await page.getByLabel(/Loại KPI|Type/).click();
    await page.getByRole('option', { name: /Output|Đầu ra/ }).first().click();

    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Add second KPI
    await page.getByRole('button', { name: /Thêm KPI|Tạo chỉ số/ }).click();

    await page.getByLabel(/Tên chỉ số|Tên KPI/).fill('Mức độ hài lòng');
    await page.getByLabel(/Đơn vị|Unit/).fill('%');
    await page.getByLabel(/Giá trị mục tiêu|Target/).fill('80');
    await page.getByLabel(/Giá trị cơ sở|Baseline/).fill('0');

    await page.getByLabel(/Loại KPI|Type/).click();
    await page.getByRole('option', { name: /Satisfaction|Hài lòng/ }).first().click();

    await page.getByRole('button', { name: /Lưu|Tạo/ }).click();

    // Verify KPIs added
    await expect(page.getByText('Số người dùng thử nghiệm')).toBeVisible();
    await expect(page.getByText('Mức độ hài lòng')).toBeVisible();
  });

  test('measure KPI values', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // Open project
    await page.getByText(testProject.name).first().click();
    await page.getByRole('tab', { name: /KPI|Chỉ số/ }).click();

    // Click measure on first KPI
    await page.getByText('Số người dùng thử nghiệm').first().click();
    await page.getByRole('button', { name: /Đo lường|Cập nhật giá trị|Ghi nhận/ }).click();

    // Enter current value
    await page.getByLabel(/Giá trị hiện tại|Current value/).fill('45');
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).click();

    // Verify measurement recorded
    await expect(page.getByText(/45/)).toBeVisible();

    // Measure second KPI
    await page.getByText('Mức độ hài lòng').first().click();
    await page.getByRole('button', { name: /Đo lường|Cập nhật giá trị|Ghi nhận/ }).click();
    await page.getByLabel(/Giá trị hiện tại|Current value/).fill('72');
    await page.getByRole('button', { name: /Lưu|Cập nhật/ }).click();

    await expect(page.getByText(/72/)).toBeVisible();
  });

  test('generate project impact report', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // Open project
    await page.getByText(testProject.name).first().click();

    // Generate report
    await page.getByRole('button', { name: /Tạo báo cáo|Xuất báo cáo|Generate Report/ }).click();

    // Select report type if dialog
    const reportType = page.getByLabel(/Loại báo cáo/);
    if (await reportType.isVisible()) {
      await reportType.click();
      await page.getByRole('option', { name: /Tác động|Impact/ }).click();
    }

    // Generate
    await page.getByRole('button', { name: /Tạo|Xuất|Download/ }).click();

    // Verify report generated (download or preview)
    await expect(page.getByText(/Báo cáo đã tạo|Đã xuất|Download/)).toBeVisible();
  });
});
