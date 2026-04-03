// ============================================================
// main.ts – Entry Point (Router-based SPA)
// Replaces single-class App.ts with multi-page Router
// ============================================================

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'NotAllowedError') e.preventDefault();
});

import './styles/main.css';
import './styles/app.css';    // New styles for all pages
import './styles/components.css'; // Data tables, buttons, tags, modals, forms
import { applyStoredTheme } from '@/utils/theme-manager';
import { authService } from '@/services/AuthService';
import { router } from '@/router/Router';
import { appShell } from '@/components/AppShell';

// Make router globally available for inline onclick handlers
(window as any).router = router;

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AlertsHistoryPage } from '@/pages/AlertsHistoryPage';
import { AlertDetailPage } from '@/pages/AlertDetailPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { RealtimeMonitorPage } from '@/pages/RealtimeMonitorPage';
import { DeviceManagementPage } from '@/pages/DeviceManagementPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { SettingsPage } from '@/pages/SettingsPage';
import {
  UserManagementPage,
  SystemStatusPage,
  MultisitePage,
} from '@/pages/OtherPages';
import { ReportsPage } from '@/pages/ReportsPage';
import { RuleEnginePage } from '@/pages/RuleEnginePage';
import { AiDebugPage } from '@/pages/AiDebugPage';
applyStoredTheme();

// ── Xóa data cũ khi schema thay đổi ─────────────────────────
// Bump SCHEMA_KEY khi cần force clear toàn bộ IndexedDB
import { clearAllScadaData } from '@/services/storage';
const SCHEMA_KEY = 'sm_schema_v2';
if (!localStorage.getItem(SCHEMA_KEY)) {
  clearAllScadaData().then(() => {
    localStorage.setItem(SCHEMA_KEY, '1');
    console.info('[App] Storage cleared — schema v2');
  });
}

// Remove no-transition class after first paint
requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transition');
});

// ── Helper: wrap a page inside the AppShell layout ──────────
function shellPage<T extends { render(): string; mount?(): void; destroy?(): void }>(
  pageId: Parameters<typeof router.navigate>[0],
  PageClass: new () => T
) {
  return () => {
    // Ngăn chặn truy cập nếu chưa đăng nhập
    if (!authService.isAuthenticated()) {
      setTimeout(() => router.navigate('login'), 0);
      return { render: () => '', mount: () => {} };
    }
    
    const page = new PageClass();
    return {
      render() {
        // Render shell HTML – page content injected after mount
        return appShell.render(pageId);
      },
      mount() {
        appShell.mount();
        // Inject page content into #pageContent
        const contentEl = document.getElementById('pageContent');
        if (contentEl) {
          contentEl.innerHTML = page.render();
          if (page.mount) page.mount();
        }
      },
      destroy() {
        appShell.destroy();
        if (page.destroy) page.destroy();
      }
    };
  };
}

// Register pages
router
  .register('login', () => {
    const p = new LoginPage();
    return {
      render() {
        // Ensure #app-root exists in DOM
        return p.render();
      },
      mount() { p.mount(); }
    };
  })
  .register('dashboard', shellPage('dashboard', DashboardPage))
  .register('realtime', shellPage('realtime', RealtimeMonitorPage))
  .register('alert-detail', shellPage('alert-detail', AlertDetailPage))
  .register('alerts-history', shellPage('alerts-history', AlertsHistoryPage))
  .register('analytics', shellPage('analytics', AnalyticsPage))
  .register('reports', shellPage('reports', ReportsPage))
  .register('system-status', shellPage('system-status', SystemStatusPage))
  .register('device-management', shellPage('device-management', DeviceManagementPage))
  .register('user-management', shellPage('user-management', UserManagementPage))
  .register('settings', shellPage('settings', SettingsPage))
  .register('audit-log', shellPage('audit-log', AuditLogPage))
  .register('maintenance', shellPage('maintenance', MaintenancePage))
  .register('multisite', shellPage('multisite', MultisitePage))
  .register('rule-engine', shellPage('rule-engine', RuleEnginePage))
  .register('ai-test', shellPage('ai-test', AiDebugPage));


// Boot: navigate to dashboard if already logged in, else login
const startPage = authService.isAuthenticated() ? 'dashboard' : 'login';
router.navigate(startPage);
