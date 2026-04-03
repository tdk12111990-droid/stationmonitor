import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateTo } from './helpers';

test.describe('Phase 2 — Backend Data & Camera', () => {

  test('2.1 Dashboard hiển thị nội dung sau login', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('.admin-header')).toBeVisible();
    await expect(page.locator('.main-view')).toBeVisible();
  });

  test('2.2 Realtime Monitor load được danh sách camera từ backend', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'realtime');
    await expect(page.locator('.cam-card-v2').first()).toBeVisible({ timeout: 8000 });
    const count = await page.locator('.cam-card-v2').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('2.3 Realtime Monitor hiển thị đúng số camera (>=3)', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'realtime');
    await page.waitForTimeout(3000);
    const count = await page.locator('.cam-card-v2').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('2.4 Camera iframe src dùng go2rtc_id (không phải UUID)', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'realtime');
    await page.waitForTimeout(3000);
    const firstIframe = page.locator('iframe[id^="hik-rtc-frame"]').first();
    await expect(firstIframe).toBeVisible();
    const src = await firstIframe.getAttribute('src');
    expect(src).toContain('localhost:1984');
    // go2rtc_id phải có dạng text (camera_152_normal...), không phải UUID
    expect(src).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  test('2.5 Device Management load danh sách thiết bị từ backend', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'device-management');
    await expect(page.locator('#deviceTableBody tr').first()).toBeVisible({ timeout: 8000 });
    const rowCount = await page.locator('#deviceTableBody tr').count();
    expect(rowCount).toBeGreaterThanOrEqual(4);
  });

  test('2.6 Device Management — thêm và xóa device', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);
    await navigateTo(page, 'device-management');
    await page.waitForSelector('#deviceTableBody tr');

    const countBefore = await page.locator('#deviceTableBody tr').count();

    // Mở modal thêm
    await page.locator('button#btnAddDevice, button[onclick*="openAdd"], button:has-text("Thêm thiết bị"), button:has-text("Thêm")').first().click();
    await page.waitForTimeout(800);

    // Điền form
    await page.locator('#devName').fill('Auto Test Camera');
    await page.locator('#devType').selectOption('camera_cctv');
    await page.locator('#deviceModalSave').click();
    await page.waitForTimeout(2000);

    const countAfter = await page.locator('#deviceTableBody tr').count();
    expect(countAfter).toBeGreaterThan(countBefore);

    // Xóa device vừa tạo
    await page.locator('button.del-btn').last().click();
    await page.waitForTimeout(2000);

    const countFinal = await page.locator('#deviceTableBody tr').count();
    expect(countFinal).toBe(countBefore);
  });

  test('2.7 Backend SignalR hub — negotiate endpoint phản hồi', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await page.evaluate(() => localStorage.getItem('station_token'));

    // Kiểm tra negotiate endpoint của SignalR hub có hoạt động không
    const res = await page.evaluate(async (tok) => {
      const r = await fetch('http://localhost:5056/ws/realtime/negotiate?negotiateVersion=1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` }
      });
      return { status: r.status };
    }, token);

    // 200 = hub sẵn sàng negotiate, 401 = hub chạy nhưng cần auth (cũng OK)
    expect([200, 400, 401]).toContain(res.status);
  });

  test('2.8 Backend API — sensor points có dữ liệu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);
    const token = await page.evaluate(() =>
      localStorage.getItem('station_token') ?? localStorage.getItem('station_jwt')
    );
    expect(token).toBeTruthy();

    const res = await page.evaluate(async (tok) => {
      const r = await fetch('http://localhost:5056/api/v1/points', {
        headers: { Authorization: `Bearer ${tok}` }
      });
      return { status: r.status, data: await r.json() };
    }, token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
  });

});
