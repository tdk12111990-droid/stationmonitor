// ============================================================
// env.ts — Tập trung các env var dùng trong frontend
// Thay đổi URL trong .env, KHÔNG sửa trực tiếp trong code
// ============================================================

export const GO2RTC_URL: string =
  (import.meta.env.VITE_GO2RTC_URL as string | undefined) ?? 'http://localhost:1984';

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5056';
