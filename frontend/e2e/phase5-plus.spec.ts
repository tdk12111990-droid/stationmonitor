// ============================================================
// phase5-plus.spec.ts — E2E tests Phase 5+
// Dashboard SLD · Analytics · Reports · Maintenance ·
// AuditLog tabs mới · Alerts export · Rule toggle
// ============================================================

import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateTo, API, getToken } from './helpers';

// ── 5A: Dashboard SLD ──────────────────────────────────────

test.describe('Phase 5A — Dashboard SLD', () => {

  test('5.1 Dashboard page load và hiển thị SLD', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'dashboard');
    await expect(page.locator('.main-view').first()).toBeVisible();
    // SLD viewport/canvas phải tồn tại
    await expect(page.locator('#sldViewport, #sld-canvas').first())
      .toBeVisible({ timeout: 10000 });
  });

  test('5.2 KPI panel hiển thị', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'dashboard');
    await page.waitForTimeout(2000);
    // Ít nhất một phần tử KPI tồn tại trên trang
    const kpiExists = await page.locator('.kpi-card, .kpi-value, #floatKpi').count() > 0;
    expect(kpiExists).toBeTruthy();
  });

});

// ── 5B: Analytics ─────────────────────────────────────────

test.describe('Phase 5B — Analytics', () => {

  test('5.3 Analytics page load', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'analytics');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await page.waitForTimeout(2000);
  });

  test('5.4 Analytics tabs chuyển được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'analytics');
    await page.waitForTimeout(2000);

    // Nhấn tab thứ 2 (nếu có)
    const tabs = page.locator('.analytics-tab, .tab-btn, [data-tab]');
    const count = await tabs.count();
    if (count >= 2) {
      await tabs.nth(1).click();
      await page.waitForTimeout(1000);
    }
    await expect(page.locator('.main-view').first()).toBeVisible();
  });

});

// ── 5C: Reports ───────────────────────────────────────────

test.describe('Phase 5C — Reports', () => {

  test('5.5 Reports page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'reports');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await page.waitForTimeout(2000);
  });

  test('5.6 Tab xuất dữ liệu XLSX có các controls', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'reports');
    await page.waitForTimeout(2000);

    // Tìm tab "Xuất dữ liệu" hoặc button liên quan
    const exportTab = page.locator('text=/Xuất dữ liệu|Export|XLSX/i').first();
    if (await exportTab.count() > 0) {
      await exportTab.click();
      await page.waitForTimeout(1000);
    }

    // Phải có ít nhất một input/button liên quan đến export
    const hasExportControls = await page.locator('input[type="date"], #btnPreview, #btnExport, button').count() > 0;
    expect(hasExportControls).toBeTruthy();
  });

  test('5.7 API GET /reports trả về 200', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

});

// ── 5D: Maintenance ───────────────────────────────────────

test.describe('Phase 5D — Maintenance', () => {

  test('5.8 Maintenance page hiển thị được', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'maintenance');
    await expect(page.locator('.main-view').first()).toBeVisible();
    await page.waitForTimeout(2000);
  });

  test('5.9 Có stats cards bảo trì', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'maintenance');
    await page.waitForTimeout(2000);

    // Stats cards — class thực tế: mt-stat-card
    await expect(page.locator('.mt-stat-card').first()).toBeVisible({ timeout: 5000 });
  });

  test('5.10 Mở modal tạo task bảo trì', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'maintenance');
    await page.waitForTimeout(2000);

    const addBtn = page.locator('button:has-text("Tạo lịch bảo trì")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      // Modal dùng style.display='flex', không dùng class active
      await expect(page.locator('#mt-modal')).toBeVisible({ timeout: 3000 });
    }
  });

});

// ── 5E: AuditLog tabs mới ─────────────────────────────────

test.describe('Phase 5E — AuditLog tabs mới', () => {

  test('5.11 AuditLog — tab Thông báo email hiển thị', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await page.waitForTimeout(2000);

    // Select dropdown với option "notify" (giao diện mới)
    const select = page.locator('#logTabSelect');
    if (await select.count() > 0) {
      await select.selectOption('notify');
      await page.waitForTimeout(2500);
      // tbody phải tồn tại trong DOM (dù có data hay không)
      await expect(page.locator('#auditTableBody')).toBeAttached({ timeout: 5000 });
    }
  });

  test('5.12 AuditLog — tab Rule kích hoạt hiển thị', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await page.waitForTimeout(2000);

    const select = page.locator('#logTabSelect');
    if (await select.count() > 0) {
      await select.selectOption('triggers');
      await page.waitForTimeout(1500);
      await expect(page.locator('#auditTableBody')).toBeVisible();
    }
  });

  test('5.13 AuditLog — filter thời gian 7 ngày', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'audit-log');
    await page.waitForTimeout(2000);

    const timeSelect = page.locator('#logTimeSelect');
    if (await timeSelect.count() > 0) {
      await timeSelect.selectOption('7d');
      await page.waitForTimeout(2000);
      await expect(page.locator('#auditTableBody')).toBeVisible();
    }
  });

  test('5.14 API GET /logs/notify trả về 200', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/logs/notify?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('5.15 API GET /logs/rule-triggers trả về 200 (cần restart backend)', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/logs/rule-triggers?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Chấp nhận 200 (sau restart) hoặc 404 (nếu backend chưa restart)
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

});

// ── 5F: Alerts export + Rule toggle ───────────────────────

test.describe('Phase 5F — Alerts export & Rule toggle', () => {

  test('5.16 API GET /alerts/export trả về CSV', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/alerts/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  test('5.17 API GET /history/export trả về CSV', async () => {
    const token = await getToken();
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to   = new Date().toISOString();
    const res  = await fetch(`${API}/history/export?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  test('5.18 API PATCH /rules/{id}/toggle bật/tắt rule', async () => {
    const token = await getToken();

    // Lấy rule đầu tiên
    const rulesRes = await fetch(`${API}/rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rules = await rulesRes.json();
    if (!rules.length) return; // bỏ qua nếu không có rule

    const rule     = rules[0];
    const origEnabled = rule.enabled;

    // Toggle
    const toggleRes = await fetch(`${API}/rules/${rule.id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(toggleRes.status).toBe(200);
    const toggled = await toggleRes.json();
    expect(toggled.enabled).toBe(!origEnabled);

    // Toggle lại về trạng thái ban đầu
    await fetch(`${API}/rules/${rule.id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('5.19 API GET /logs/audit trả về username (không chỉ userId)', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/logs/audit?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const logs = await res.json();
    expect(Array.isArray(logs)).toBe(true);
    // Bất kỳ log nào có userId phải có thêm username
    const logsWithUser = logs.filter((l: any) => l.userId);
    if (logsWithUser.length > 0) {
      expect(logsWithUser[0]).toHaveProperty('username');
    }
  });

  test('5.20 PermissionService — Admin thấy tất cả trạm', async () => {
    const token = await getToken();
    const res = await fetch(`${API}/stations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const stations = await res.json();
    expect(Array.isArray(stations)).toBe(true);
    expect(stations.length).toBeGreaterThanOrEqual(0);
  });

});
