// ============================================================
// AppShell – Layout chung: Sidebar nav + Header + Content Area
// Bao bọc tất cả pages sau khi đăng nhập thành công
// ============================================================

import { authService } from '@/services/AuthService';
import { router } from '@/router/Router';
import type { PageId } from '@/types/app.types';

interface NavItem { id: PageId; icon: string; label: string; roles?: string[] }

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: '📊', label: 'Tổng quan' },
  { id: 'realtime', icon: '🎥', label: 'Giám sát RT' },
  { id: 'alerts-history', icon: '⚠️', label: 'Nhật ký' },
  { id: 'analytics', icon: '📈', label: 'Phân tích' },
  { id: 'reports', icon: '📄', label: 'Báo cáo' },
  { id: 'maintenance', icon: '🔧', label: 'Bảo trì', roles: ['admin', 'manager'] },
  { id: 'audit-log', icon: '📋', label: 'Audit Log', roles: ['admin', 'manager'] },
  { id: 'multisite', icon: '🗺', label: 'Đa trạm' },
  // { id: 'ai-test', icon: '🤖', label: 'AI Test' }, // ẨN TẠM — chưa hoàn thiện
];

const ADMIN_NAV: NavItem[] = [
  { id: 'device-management', icon: '📡', label: 'Thiết bị', roles: ['admin'] },
  { id: 'user-management', icon: '👥', label: 'Người dùng', roles: ['admin'] },
  { id: 'rule-engine', icon: '🎛️', label: 'Rule Engine', roles: ['admin'] },
];

export class AppShell {
  private activeNavId: PageId = 'dashboard';
  private clockInterval?: ReturnType<typeof setInterval>;

  render(contentId: PageId): string {
    this.activeNavId = contentId;
    const user = authService.getUser()!;
    return `
    <div class="app-shell admin-container">
      <!-- Sidebar -->
      <nav class="sidebar-nav" id="sidebarNav">
        <div class="sidebar-logo" style="padding: 8px;">
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0NGZmODgiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDI4NGM3IiAvPjwvbGluZWFyR3JhZGllbnQ+PGZpbHRlciBpZD0iZ2xvdyI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMyIgcmVzdWx0PSJjb2xvcmVkQmx1ciIvPjxmZU1lcmdlPjxmZU1lcmdlTm9kZSBpbj0iY29sb3JlZEJsdXIiLz48ZmVNZXJnZU5vZGUgaW49IlNvdXJjZUdyYXBoaWMiLz48L2ZlTWVyZ2U+PC9maWx0ZXI+PC9kZWZzPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ1IiBmaWxsPSJub25lIiBzdHJva2U9InVybCgjZ3JhZCkiIHN0cm9rZS13aWR0aD0iNiIgZmlsdGVyPSJ1cmwoI2dsb3cpIi8+PHBhdGggZD0iTTUwIDE1IEw4MCAzNSBMODAgNjUgTDUwIDg1IEwyMCA2NSBMMjAgMzUgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjMiIG9wYWNpdHk9IjAuNSIvPjxwYXRoIGQ9Ik01NSAyNSBMMzUgNTUgTDUwIDU1IEw0NSA3NSBMNjUgNDUgTDUwIDQ1IFoiIGZpbGw9IiM0NGZmODgiIGZpbHRlcj0idXJsKCNnbG93KSIvPjwvc3ZnPg==" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 5px rgba(0,0,0,0.3));" alt="Station Monitor">
        </div>
        ${this.renderNavItems(NAV_ITEMS)}
        <div class="sidebar-divider"></div>
        ${this.renderNavItems(ADMIN_NAV)}
        <div style="flex:1"></div>
        <div class="nav-item" id="navSystemStatus" data-page="system-status" title="Trạng thái hệ thống">🖥</div>
        <div class="nav-item" id="navSettings" data-page="settings" title="Cài đặt">⚙️</div>
        <div class="nav-item nav-item--logout" id="navLogout" title="Đăng xuất">🚪</div>
      </nav>

      <!-- Main view -->
      <div class="main-view">
        <!-- Header -->
        <header class="admin-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-weight:800;font-size:1.05rem;color:var(--admin-text);letter-spacing:.5px;">
              HỆ THỐNG GIÁM SÁT <span style="color:var(--admin-accent)">TRẠM ĐIỆN</span>
            </span>
            <span class="version-badge">v2.5.4</span>
          </div>
          <div style="display:flex;align-items:center;gap:20px;">
            <div class="header-status">
              <span style="color:#10b981">●</span> HỆ THỐNG TRỰC TUYẾN
            </div>
            <div class="header-divider"></div>
            <div id="headerClock" class="header-clock">${new Date().toLocaleTimeString('vi-VN')}</div>
            <div class="header-divider"></div>
            <div class="header-user">
              <span class="user-avatar">${user.fullname[0]}</span>
              <span style="font-size:.8rem;color:var(--admin-text)">${user.fullname}</span>
              <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
            </div>
          </div>
        </header>

        <!-- Page content injected here -->
        <div id="pageContent" class="page-content"></div>
      </div>

      <!-- Logout confirm modal -->
      <div id="logoutModal" class="modal-overlay">
        <div class="modal-content" style="width:380px;text-align:center">
          <div class="modal-body" style="padding:32px 24px">
            <div style="font-size:3rem;margin-bottom:12px">🚪</div>
            <h3 style="margin:0 0 8px;color:var(--admin-text,#e2e8f0)">Đăng xuất</h3>
            <p style="margin:0;opacity:.6;font-size:.9rem">Bạn có chắc muốn đăng xuất khỏi hệ thống?</p>
          </div>
          <div class="modal-footer" style="justify-content:center;gap:12px">
            <button id="logoutCancel" class="btn-industrial" style="min-width:100px">Hủy</button>
            <button id="logoutConfirm" class="btn-industrial btn-danger" style="min-width:100px">Đăng xuất</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  private renderNavItems(items: NavItem[]): string {
    const user = authService.getUser();
    return items
      .filter(item => !item.roles || (user && item.roles.includes(user.role)))
      .map(item => `
        <div class="nav-item ${item.id === this.activeNavId ? 'active' : ''}"
             data-page="${item.id}" title="${item.label}">
          ${item.icon}
        </div>`).join('');
  }

  mount(): void {
    // Clock update
    this.clockInterval = setInterval(() => {
      const el = document.getElementById('headerClock');
      if (el) el.textContent = new Date().toLocaleTimeString('vi-VN');
    }, 1000);

    // Nav click handlers
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => {
        const page = el.getAttribute('data-page') as PageId;
        if (page) router.navigate(page);
      });
    });

    // Logout with custom modal
    document.getElementById('navLogout')?.addEventListener('click', () => {
      document.getElementById('logoutModal')?.classList.add('active');
    });
    document.getElementById('logoutCancel')?.addEventListener('click', () => {
      document.getElementById('logoutModal')?.classList.remove('active');
    });
    document.getElementById('logoutConfirm')?.addEventListener('click', () => {
      authService.logout();
      window.location.reload();
    });


  }

  destroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}

export const appShell = new AppShell();
