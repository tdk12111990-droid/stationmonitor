import { Page } from '@playwright/test';

export const ADMIN = { user: 'admin', pass: 'Admin@123' };
export const API = 'http://localhost:5056/api/v1';

export async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await page.locator('input[type="text"]').fill(ADMIN.user);
  await page.locator('input[type="password"]').fill(ADMIN.pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);
}

export async function navigateTo(page: Page, pageId: string) {
  await page.locator(`.nav-item[data-page="${pageId}"]`).click();
  await page.waitForTimeout(1500);
}

export async function getToken(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN.user, password: ADMIN.pass }),
  });
  const d = await res.json();
  return d.token ?? '';
}
