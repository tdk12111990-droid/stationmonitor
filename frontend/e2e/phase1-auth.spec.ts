import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateTo } from './helpers';

test.describe('Phase 1 — Auth & Navigation', () => {

  test('1.1 Login sai password → báo lỗi, không vào được app', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input[type="text"]');
    await page.locator('input[type="text"]').fill('admin');
    await page.locator('input[type="password"]').fill('sai_mat_khau');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
    // Vẫn còn ở trang login (không có sidebar nav)
    const navVisible = await page.locator('nav.sidebar-nav').count();
    expect(navVisible).toBe(0);
  });

  test('1.2 Login đúng → vào được Dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    // Phải thấy sidebar nav
    await expect(page.locator('nav.sidebar-nav')).toBeVisible();
    // Phải thấy header hệ thống
    await expect(page.locator('.admin-header')).toBeVisible();
  });

  test('1.3 Điều hướng sang Realtime Monitor', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'realtime');
    await expect(page.locator('.realtime-monitor-v2')).toBeVisible();
  });

  test('1.4 Điều hướng sang Device Management', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'device-management');
    await expect(page.locator('#deviceTableBody')).toBeVisible();
  });

  test('1.5 Điều hướng sang Rule Engine', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, 'rule-engine');
    // Rule engine page phải có nội dung
    await expect(page.locator('.main-view').first()).toBeVisible();
  });

  test('1.6 Logout → về trang login', async ({ page }) => {
    await page.addInitScript(() => { (window as any).confirm = () => true; });
    await loginAsAdmin(page);
    await page.locator('#navLogout').click();
    await page.waitForTimeout(1000);
    const logoutBtn = page.locator('#logoutConfirm');
    if (await logoutBtn.isVisible()) await logoutBtn.click();
    await page.waitForTimeout(1500);
    // Về login: sidebar biến mất
    const navCount = await page.locator('nav.sidebar-nav').count();
    expect(navCount).toBe(0);
  });

});
