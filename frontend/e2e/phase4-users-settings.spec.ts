// ============================================================
// phase4-users-settings.spec.ts — E2E tests Phase 4
// User Management UI + Audit Log UI + Settings UI
// ============================================================

import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateTo } from './helpers';

// ── 4A: User Management UI ──────────────────────────────────

test.describe('Phase 4A — User Management UI', () => {

  test('4.1 User Management page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'user-management');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await expect(page.locator('#userTableBody')).toBeVisible({ timeout: 8000 });
  });

  test('4.2 Bảng phân quyền hiển thị đúng', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'user-management');
    await page.waitForSelector('#userTableBody');
    // Trang có admin user
    await expect(page.locator('#userTableBody')).toContainText('admin', { timeout: 5000 });
  });

  test('4.3 Mở modal thêm tài khoản', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'user-management');
    await page.waitForSelector('#userTableBody');
    await page.locator('#addUserBtn').click();
    await expect(page.locator('#userModal.active')).toBeVisible({ timeout: 3000 });
  });

  test('4.4 Tạo user mới → hiện trong bảng → vô hiệu hóa', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);

    const token = await page.evaluate(() => localStorage.getItem('station_token'));

    // Dọn sạch user test cũ (nếu còn)
    if (token) {
      await page.evaluate(async (tok) => {
        const res = await fetch('http://localhost:5056/api/v1/users', {
          headers: { Authorization: `Bearer ${tok}` }
        });
        const users = await res.json();
        const old = users.filter((u: any) => u.username === 'pw4_test_user');
        for (const u of old) {
          if (u.isActive) {
            await fetch(`http://localhost:5056/api/v1/users/${u.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tok}` }
            });
          }
        }
      }, token);
    }

    await navigateTo(page, 'user-management');
    await page.waitForSelector('#userTableBody');

    // Thêm user
    await page.locator('#addUserBtn').click();
    await page.waitForSelector('#userModal.active');
    await page.locator('#uf_user').fill('pw4_test_user');
    await page.locator('#uf_name').fill('[Playwright] Test User');
    await page.locator('#uf_email').fill('pw4@test.vn');
    await page.locator('#uf_pass').fill('Test@123456');
    await page.locator('#uf_pass2').fill('Test@123456');
    await page.locator('input[name="uf_role"][value="operator"]').check();

    await Promise.all([
      page.waitForResponse(res => res.url().includes('/users') && res.request().method() === 'POST'),
      page.locator('#userModalSave').click(),
    ]);

    await expect(page.locator('#userTableBody'))
      .toContainText('pw4_test_user', { timeout: 5000 });

    // Vô hiệu hóa
    const targetRow = page.locator('#userTableBody tr').filter({ hasText: 'pw4_test_user' });
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/users/') && res.request().method() === 'DELETE'),
      targetRow.locator('button.deactivate-btn').click(),
    ]);

    // Sau khi vô hiệu hóa, row vẫn còn nhưng không có nút 🚫 nữa
    await expect(targetRow.locator('button.deactivate-btn')).toHaveCount(0, { timeout: 5000 });
  });

  test('4.5 Đóng modal bằng nút Hủy', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'user-management');
    await page.waitForSelector('#userTableBody');
    await page.locator('#addUserBtn').click();
    await page.waitForSelector('#userModal.active');
    await page.locator('#userModalCancel').click();
    await expect(page.locator('#userModal.active')).not.toBeVisible();
  });

});

// ── 4B: Audit Log UI ───────────────────────────────────────

test.describe('Phase 4B — Audit Log UI', () => {

  test('4.6 Audit Log page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await expect(page.locator('#auditTableBody')).toBeVisible({ timeout: 8000 });
  });

  test('4.7 Tab Đăng nhập hoạt động', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await page.waitForSelector('#auditTableBody');
    await page.locator('#tabLogin').click();
    await page.waitForTimeout(1500);
    // Phải có ít nhất 1 login log (vì vừa login)
    await expect(page.locator('#auditTableBody')).toBeVisible();
    const rows = page.locator('#auditTableBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('4.8 Nút Làm mới hoạt động', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await page.waitForSelector('#auditTableBody');
    await page.locator('#auditRefreshBtn').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('#auditTableBody')).toBeVisible();
  });

});

// ── 4C: Settings UI ────────────────────────────────────────

test.describe('Phase 4C — Settings UI', () => {

  test('4.9 Settings page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'settings');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await expect(page.locator('#saveSettingsBtn')).toBeVisible({ timeout: 8000 });
  });

  test('4.10 Load settings từ API và hiển thị giá trị', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'settings');
    await page.waitForSelector('#saveSettingsBtn');
    await page.waitForTimeout(1500);
    // polling_interval_s phải là số hợp lệ
    const pollingVal = await page.locator('#s_polling').inputValue();
    expect(Number(pollingVal)).toBeGreaterThan(0);
  });

  test('4.11 Lưu settings thành công', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'settings');
    await page.waitForSelector('#saveSettingsBtn');
    await page.waitForTimeout(1500);

    await page.locator('#s_email').fill('test@playwright.vn');
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/settings/') && res.request().method() === 'PUT'),
      page.locator('#saveSettingsBtn').click(),
    ]);

    // Kiểm tra trạng thái "Đã lưu"
    await expect(page.locator('#saveStatus')).toContainText('Đã lưu', { timeout: 5000 });
  });

});
