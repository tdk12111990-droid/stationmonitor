// ============================================================
// AuthService – Kết nối backend thật qua REST API
// POST /api/v1/auth/login → JWT token
// ============================================================

import type { User, UserRole } from '@/types/app.types';
import { API_BASE_URL } from '@/utils/env';

const SESSION_KEY = 'station_session';
const TOKEN_KEY   = 'station_token';

const API_BASE = `${API_BASE_URL}/api/v1`;

class AuthService {
    private currentUser: User | null = null;

    constructor() {
        this.restoreSession();
    }

    public async login(username: string, password: string, licenseKey: string): Promise<{ success: boolean; error?: string }> {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, licenseKey }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const message = errData.message || 'Sai tên đăng nhập hoặc mật khẩu';

                // Xác định loại lỗi dựa trên status code
                if (res.status === 403) {
                    return { success: false, error: message }; // License error
                }
                return { success: false, error: message };
            }

            const data = await res.json();
            const token: string = data.token ?? '';

            // Decode payload từ JWT (UTF-8 safe — hỗ trợ tiếng Việt)
            const base64url = token.split('.')[1] ?? '';
            const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const payload = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
            const user: User = {
                user_id: payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ?? '',
                username: payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? username,
                fullname: payload['fullName'] ?? username,
                email: '',
                role: (payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? 'operator') as UserRole,
                active: true,
                created_at: new Date().toISOString(),
            };

            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(SESSION_KEY, JSON.stringify(user));

            // Lưu license info nếu có
            if (data.licenseInfo) {
                localStorage.setItem('station_license_info', JSON.stringify(data.licenseInfo));
            }

            this.currentUser = user;
            return { success: true };

        } catch (err) {
            console.error('Login error:', err);
            return { success: false, error: 'Không thể kết nối tới máy chủ' };
        }
    }

    public async logout(): Promise<void> {
        try {
            const token = this.getToken();
            if (token) {
                // Notify backend to revoke session
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }).catch(() => {}); // Ignore errors during logout
            }
        } catch {}
        finally {
            this.currentUser = null;
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem('station_license_info');
            localStorage.removeItem('station_license_key');
        }
    }

    public getToken(): string | null {
        return localStorage.getItem(TOKEN_KEY);
    }

    public getUser(): User | null {
        return this.currentUser;
    }

    public isAuthenticated(): boolean {
        return this.currentUser !== null;
    }

    public hasRole(...roles: UserRole[]): boolean {
        return this.currentUser ? roles.includes(this.currentUser.role) : false;
    }

    private restoreSession(): void {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) this.currentUser = JSON.parse(raw);
        } catch { this.currentUser = null; }
    }
}

export const authService = new AuthService();
