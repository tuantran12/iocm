import { test, expect, Page } from '@playwright/test';

/** Helper: login as admin */
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@iocm.vn');
  await page.getByLabel('Mật khẩu').fill('Admin@IOCM2025');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

const testGroup = {
  name: `Nhóm E2E Test ${Date.now()}`,
  goal: 'Kiểm thử tự động nhóm làm việc',
  description: 'Nhóm được tạo bởi E2E test',
};

test.describe('Groups → Create → Invite Member → Chat → Create Task from Chat → Complete Task', () => {
  test('navigate to groups page', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /Nhóm/ }).click();
    await expect(page).toHaveURL(/\/groups/);
    await expect(page.getByRole('heading', { name: /Nhóm làm việc|Nhóm/ })).toBeVisible();
  });

  test('create a new working group', async ({ page }) => {
    await login(page);
    await page.goto('/groups');

    // Click create
    await page.getByRole('button', { name: /Tạo nhóm|Thêm nhóm/ }).click();

    // Fill group form
    await page.getByLabel(/Tên nhóm/).fill(testGroup.name);
    await page.getByLabel(/Mục tiêu|Goal/).fill(testGroup.goal);
    await page.getByLabel(/Mô tả/).fill(testGroup.description);

    // Select group type
    await page.getByLabel(/Loại nhóm|Loại/).click();
    await page.getByRole('option', { name: /Dự án|PROJECT|Doanh nghiệp/ }).first().click();

    // Submit
    await page.getByRole('button', { name: /Tạo|Lưu/ }).click();

    // Verify group created
    await expect(page.getByText(testGroup.name)).toBeVisible();
  });

  test('invite member to group', async ({ page }) => {
    await login(page);
    await page.goto('/groups');

    // Open the created group
    await page.getByText(testGroup.name).first().click();

    // Go to settings or members tab
    await page.getByRole('tab', { name: /Thành viên|Members/ }).click();

    // Click invite
    await page.getByRole('button', { name: /Mời|Thêm thành viên|Invite/ }).click();

    // Search and select a member
    await page.getByLabel(/Tìm kiếm|Email|Tên/).fill('admin');
    await page.getByRole('option').first().click();

    // Confirm invite
    await page.getByRole('button', { name: /Mời|Gửi|Xác nhận/ }).click();

    // Verify member added
    await expect(page.getByText(/Đã mời|Thành công|Đã thêm/)).toBeVisible();
  });

  test('send chat message in group', async ({ page }) => {
    await login(page);
    await page.goto('/groups');

    // Open group
    await page.getByText(testGroup.name).first().click();

    // Navigate to chat tab (or it may be default)
    const chatTab = page.getByRole('tab', { name: /Chat|Trò chuyện/ });
    if (await chatTab.isVisible()) {
      await chatTab.click();
    }

    // Type and send message
    const chatInput = page.getByPlaceholder(/Nhập tin nhắn|Viết tin nhắn|Gửi tin nhắn/);
    await chatInput.fill('Đây là tin nhắn E2E test - cần tạo task từ đây');
    await page.getByRole('button', { name: /Gửi|Send/ }).click();

    // Verify message appears
    await expect(page.getByText('Đây là tin nhắn E2E test - cần tạo task từ đây')).toBeVisible();
  });

  test('create task from chat message', async ({ page }) => {
    await login(page);
    await page.goto('/groups');

    // Open group
    await page.getByText(testGroup.name).first().click();

    // Find the message and use context menu or action button
    const message = page.getByText('Đây là tin nhắn E2E test - cần tạo task từ đây');
    await message.hover();

    // Click "create task" action on message
    await page.getByRole('button', { name: /Tạo task|Tạo công việc|Chuyển thành task/ }).click();

    // Fill task details if dialog appears
    const taskTitle = page.getByLabel(/Tiêu đề|Tên task|Tên công việc/);
    if (await taskTitle.isVisible()) {
      await taskTitle.fill('Task từ chat E2E');
      await page.getByRole('button', { name: /Tạo|Lưu/ }).click();
    }

    // Verify task created
    await expect(page.getByText(/Đã tạo task|Thành công|Task từ chat E2E/)).toBeVisible();
  });

  test('complete the created task', async ({ page }) => {
    await login(page);
    await page.goto('/groups');

    // Open group
    await page.getByText(testGroup.name).first().click();

    // Go to tasks tab
    await page.getByRole('tab', { name: /Công việc|Tasks/ }).click();

    // Find the task
    await page.getByText(/Task từ chat E2E/).first().click();

    // Mark as done
    await page.getByRole('button', { name: /Hoàn thành|Đánh dấu hoàn thành|Done/ }).click();

    // Verify task completed
    await expect(page.getByText(/Hoàn thành|DONE|Đã hoàn thành/)).toBeVisible();
  });
});
