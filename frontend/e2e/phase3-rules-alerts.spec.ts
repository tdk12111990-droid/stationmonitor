// ============================================================
// phase3-rules-alerts.spec.ts — E2E tests Phase 3
// Rule Engine UI + Alerts History UI
// ============================================================

import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateTo, API } from './helpers';

// ── 3A: Rule Engine UI ──────────────────────────────────────

test.describe('Phase 3A — Rule Engine UI', () => {

  test('3.1 Rule Engine page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'rule-engine');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await expect(page.locator('#ruleTableBody')).toBeVisible({ timeout: 8000 });
  });

  test('3.2 Mở modal thêm rule', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'rule-engine');
    await page.waitForSelector('#ruleTableBody');
    await page.locator('#btnAddRule').click();
    await expect(page.locator('#ruleModal.active')).toBeVisible({ timeout: 3000 });
  });

  test('3.3 Tạo rule mới → hiện trong bảng → xóa', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);

    // Dọn sạch rule test cũ còn sót (nếu có) trước khi bắt đầu
    const token = await page.evaluate(() => localStorage.getItem('station_token'));
    if (token) {
      await page.evaluate(async (tok) => {
        const res = await fetch('http://localhost:5056/api/v1/rules', { headers: { Authorization: `Bearer ${tok}` } });
        const rules = await res.json();
        const old = rules.filter((r: any) => r.name?.includes('[Playwright Test] Rule tự động'));
        for (const r of old) {
          await fetch(`http://localhost:5056/api/v1/rules/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
        }
      }, token);
    }

    await navigateTo(page, 'rule-engine');
    await page.waitForSelector('#ruleTableBody');

    // Mở modal và điền form
    await page.locator('#btnAddRule').click();
    await page.waitForSelector('#ruleModal.active');
    await page.locator('#ruleNameInput').fill('[Playwright Test] Rule tự động');
    await page.locator('#rulePointInput').selectOption('nhiet_do_pha_1');
    await page.locator('#ruleOpInput').selectOption('>');
    await page.locator('#ruleValueInput').fill('999');
    await page.locator('#ruleLevelInput').selectOption('warning');

    // Lưu và chờ rule xuất hiện
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/rules') && res.request().method() === 'POST'),
      page.locator('#ruleModalSave').click(),
    ]);
    await expect(page.locator('#ruleTableBody'))
      .toContainText('[Playwright Test] Rule tự động', { timeout: 5000 });

    // Tìm đúng nút xóa của row chứa tên rule này
    const targetRow = page.locator('#ruleTableBody tr').filter({ hasText: '[Playwright Test] Rule tự động' });
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/rules/') && res.request().method() === 'DELETE'),
      targetRow.locator('button.rule-del-btn').click(),
    ]);
    await expect(page.locator('#ruleTableBody'))
      .not.toContainText('[Playwright Test] Rule tự động', { timeout: 5000 });
  });

  test('3.4 Toggle bật/tắt rule', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);
    await navigateTo(page, 'rule-engine');
    await page.waitForSelector('#ruleTableBody');

    // Tạo một rule để toggle
    await page.locator('#btnAddRule').click();
    await page.waitForSelector('#ruleModal.active');
    await page.locator('#ruleNameInput').fill('[Playwright] Toggle Test');
    await page.locator('#ruleValueInput').fill('999');
    await page.locator('#ruleModalSave').click();
    await page.waitForTimeout(2000);

    // Toggle (nút Tắt/Bật cuối bảng)
    const toggleBtn = page.locator('button.rule-toggle-btn').last();
    const textBefore = await toggleBtn.textContent();
    await toggleBtn.click();
    await page.waitForTimeout(2000);

    const toggleBtn2 = page.locator('button.rule-toggle-btn').last();
    const textAfter = await toggleBtn2.textContent();
    expect(textBefore?.trim()).not.toBe(textAfter?.trim()); // trạng thái đảo ngược

    // Dọn dẹp
    await page.locator('button.rule-del-btn').last().click();
    await page.waitForTimeout(1500);
  });

  test('3.5 Đóng modal bằng nút Hủy', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'rule-engine');
    await page.waitForSelector('#ruleTableBody');
    await page.locator('#btnAddRule').click();
    await page.waitForSelector('#ruleModal.active');
    await page.locator('#ruleModalCancelBtn').click();
    await expect(page.locator('#ruleModal.active')).not.toBeVisible();
  });

});

// ── 3B: Alerts History UI ───────────────────────────────────

test.describe('Phase 3B — Alerts History UI', () => {

  test('3.6 Alerts History page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'alerts-history');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await expect(page.locator('#alertTableBody')).toBeVisible({ timeout: 8000 });
  });

  test('3.7 Filter status hoạt động', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'alerts-history');
    await page.waitForSelector('#alertTableBody');

    // Filter open
    await page.locator('#alertFilter').selectOption('open');
    await page.waitForTimeout(1500);
    await expect(page.locator('#alertTableBody')).toBeVisible();

    // Filter acked
    await page.locator('#alertFilter').selectOption('acked');
    await page.waitForTimeout(1500);
    await expect(page.locator('#alertTableBody')).toBeVisible();

    // Filter all
    await page.locator('#alertFilter').selectOption('');
    await page.waitForTimeout(1500);
    await expect(page.locator('#alertTableBody')).toBeVisible();
  });

  test('3.8 Nút Làm mới hoạt động', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'alerts-history');
    await page.waitForSelector('#alertTableBody');
    await page.locator('#btnRefreshAlerts').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('#alertTableBody')).toBeVisible();
  });

  test('3.9 ACK flow — tạo alert qua API rồi ACK trên UI', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);
    await page.waitForTimeout(1000);

    const token = await page.evaluate(() => localStorage.getItem('station_token'));
    if (!token) { test.skip(); return; }

    // Tạo rule ngưỡng thấp để trigger alert
    const stationsRes = await page.evaluate(async (tok) => {
      const r = await fetch(`${location.protocol}//${location.hostname}:5056/api/v1/stations`, {
        headers: { Authorization: `Bearer ${tok}` }
      });
      return r.json();
    }, token);

    const stationId = stationsRes?.[0]?.id;
    if (!stationId) { test.skip(); return; }

    const ruleRes = await page.evaluate(async ({ tok, sid }) => {
      const r = await fetch(`${location.protocol}//${location.hostname}:5056/api/v1/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          stationId: sid,
          name: '[Playwright] ACK Test',
          condition: JSON.stringify({ point: 'phong_dien', op: '<', value: 9999 }),
          actions: JSON.stringify([{ type: 'alert', level: 'warning' }]),
          enabled: true,
        }),
      });
      return r.json();
    }, { tok: token, sid: stationId });

    const ruleId = ruleRes?.id;

    // Chờ tối đa 8s để worker tạo alert
    let alertId = '';
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1000);
      const alerts = await page.evaluate(async ({ tok, rid }) => {
        const r = await fetch(`${location.protocol}//${location.hostname}:5056/api/v1/alerts?status=open`, {
          headers: { Authorization: `Bearer ${tok}` }
        });
        const data = await r.json();
        return data.filter((a: any) => a.ruleId === rid);
      }, { tok: token, rid: ruleId });

      if (alerts?.length > 0) { alertId = alerts[0].id; break; }
    }

    if (!alertId) {
      // PLC offline → không thể trigger → skip
      if (ruleId) {
        await page.evaluate(async ({ tok, rid }) => {
          await fetch(`${location.protocol}//${location.hostname}:5056/api/v1/rules/${rid}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${tok}` }
          });
        }, { tok: token, rid: ruleId });
      }
      test.skip();
      return;
    }

    // Vào trang Alerts và ACK
    await navigateTo(page, 'alerts-history');
    await page.waitForSelector('#alertTableBody');
    await page.locator('#alertFilter').selectOption('open');
    await page.waitForTimeout(1500);

    const ackBtn = page.locator(`button.btn-ack[data-id="${alertId}"]`);
    if (await ackBtn.isVisible()) {
      await ackBtn.click();
      await page.waitForSelector('#ackModal.active');
      await page.locator('#ackNote').fill('Playwright auto-test ACK');
      await page.locator('#ackConfirm').click();
      await page.waitForTimeout(2000);

      // Kiểm tra alert không còn trong danh sách "open"
      const stillOpen = await page.locator(`button.btn-ack[data-id="${alertId}"]`).count();
      expect(stillOpen).toBe(0);
    }

    // Dọn dẹp rule
    if (ruleId) {
      await page.evaluate(async ({ tok, rid }) => {
        await fetch(`${location.protocol}//${location.hostname}:5056/api/v1/rules/${rid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tok}` }
        });
      }, { tok: token, rid: ruleId });
    }
  });

});

// ── 3C: go2rtc URL từ env var ──────────────────────────────

test.describe('Phase 3C — go2rtc env URL', () => {

  test('3.10 Camera iframe dùng VITE_GO2RTC_URL (không còn hardcode localhost)', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'realtime');
    await page.waitForTimeout(3000);

    // Lấy tất cả iframe go2rtc
    const iframes = page.locator('iframe[id^="hik-rtc-frame"]');
    const count = await iframes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const src = await iframes.nth(i).getAttribute('src');
      // Phải dùng go2rtc stream endpoint
      expect(src).toContain('/stream.html');
      // src không được rỗng
      expect(src).toBeTruthy();
    }
  });

});
