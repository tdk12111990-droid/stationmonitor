// ============================================================
// Router – Điều hướng giữa các trang Desktop App
// Không dùng URL hash; state-based SPA trong Tauri window
// ============================================================

import type { PageId } from '@/types/app.types';
import { authService } from '@/services/AuthService';

export type PageFactory = () => { render(): string; mount?(): void; destroy?(): void };

export class Router {
    private root: HTMLElement;
    private pages = new Map<PageId, PageFactory>();
    private currentPage: PageId | null = null;
    private currentDestroy?: () => void;
    private history: PageId[] = [];

    constructor(rootId: string) {
        const el = document.getElementById(rootId);
        if (!el) throw new Error(`Router root #${rootId} not found`);
        this.root = el;
    }

    register(id: PageId, factory: PageFactory): this {
        this.pages.set(id, factory);
        return this;
    }

    navigate(id: PageId, params?: Record<string, string>): void {
        // Guard: redirect to login if not authenticated
        if (id !== 'login' && !authService.isAuthenticated()) {
            this.navigate('login');
            return;
        }

        // Store params for page access
        if (params) {
            (window as any).__routerParams = params;
        } else {
            (window as any).__routerParams = {};
        }

        // Destroy current page
        if (this.currentDestroy) {
            this.currentDestroy();
            this.currentDestroy = undefined;
        }

        const factory = this.pages.get(id);
        if (!factory) {
            console.error(`Page '${id}' not registered`);
            return;
        }

        if (this.currentPage && this.currentPage !== id) {
            this.history.push(this.currentPage);
        }
        this.currentPage = id;

        const page = factory();
        this.root.innerHTML = page.render();

        if (page.mount) {
            page.mount();
        }
        if (page.destroy) {
            this.currentDestroy = page.destroy.bind(page);
        }
    }

    back(): void {
        const prev = this.history.pop();
        if (prev) this.navigate(prev);
    }

    getCurrentPage(): PageId | null {
        return this.currentPage;
    }

    getParams(): Record<string, string> {
        return (window as any).__routerParams || {};
    }
}

export const router = new Router('app');
