// ============================================================
// AuthService – Kết nối backend thật qua REST API
// POST /api/v1/auth/login → JWT token
// ============================================================

import type { User, UserRole } from '@/types/app.types';

const SESSION_KEY = 'station_session';
const TOKEN_KEY   = 'station_token';

const API_BASE = 'http://localhost:5056/api/v1';

class AuthService {
    private currentUser: User | null = null;

    constructor() {
        this.restoreSession();
    }

    public async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (!res.ok) {
                return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
            }

            const data = await res.json();
            const token: string = data.token ?? '';

            // Decode payload từ JWT để lấy user info
            const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
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
            this.currentUser = user;
            return { success: true };

        } catch (err) {
            return { success: false, error: 'Không thể kết nối tới máy chủ' };
        }
    }

    public logout(): void {
        this.currentUser = null;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(TOKEN_KEY);
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
