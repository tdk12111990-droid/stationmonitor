import { authService } from '@/services/AuthService';
import { router } from '@/router/Router';
import type { PageId } from '@/types/app.types';
import * as signalR from '@microsoft/signalr';

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
];

const ADMIN_NAV: NavItem[] = [
  { id: 'device-management', icon: '📡', label: 'Thiết bị', roles: ['admin'] },
  { id: 'user-management', icon: '👥', label: 'Người dùng', roles: ['admin'] },
  { id: 'rule-engine', icon: '🎛️', label: 'Rule Engine', roles: ['admin'] },
  { id: 'thermal-points', icon: '🌡️', label: 'Điểm Nhiệt', roles: ['admin', 'manager'] },
];


export class AppShell {
  private activeNavId: PageId = 'dashboard';
  private clockInterval?: ReturnType<typeof setInterval>;
  private hubConnection?: signalR.HubConnection;

  render(contentId: PageId): string {
    this.activeNavId = contentId;
    const user = authService.getUser()!;
    const savedTheme = localStorage.getItem('station-theme') || 'dark';
    const themeClass = savedTheme !== 'default' ? `theme-${savedTheme}` : '';
    return `
    <div class="app-shell admin-container ${themeClass}">
      <!-- Sidebar -->
      <nav class="sidebar-nav" id="sidebarNav">
        <div class="sidebar-logo" style="padding: 8px;">
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0NGZmODgiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDI4NGM3IiAvPjwvbGluZWFyR3JhZGllbnQ+PGZpbHRlciBpZD0iZ2xvdyI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMyIgcmVzdWx0PSJjb2xvcmVkQmx1ciIvPjxmZU1lcmdlPjxmZU1lcmdlTm9kZSBpbj0iY29sb3JlZEJsdXIiLz48ZmVNZXJnZU5vZGUgaW49IlNvdXJjZUdyYXBoaWMiLz48L2ZlTWVyZ2U+PC9maWx0ZXI+PC9kZWZzPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ1IiBmaWxsPSJub25lIiBzdHJva2U9InVybCgjZ3JhZCkiIHN0cm9rZS13aWR0aD0iNiIgZmlsdGVyPSJ1cmwoI2dsb3cpIi8+PHBhdGggZD0iTTUwIDE1IEw4MCAzNSBMODAgNjUgTDUwIDg1IEwyMCA2NSBMMjAgMzUgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjMiIG9wYWNpdHk9IjAuNSIvPjxwYXRoIGQ9Ik01NSAyNSBMMzUgNTUgTDUwIDU1IEw0NSA3NSBMNjUgNDUgTDUwIDQ1IFoiIGZpbGw9IiM0NGZmODgiIGZpbHRlcj0idXJsKCNnbG93KSIvPjwvc3ZnPg==" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 5px rgba(0,0,0,0.3));" alt="Station Monitor">
        </div>
        ${this.renderNavItems(NAV_ITEMS)}
        <div class="sidebar-divider"></div>
        ${this.renderNavItems(ADMIN_NAV)}
        <div style="flex:1"></div>
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

    // Start Global Notifications
    this.connectSignalR();
  }

  // ── Tự động nhận diện loại cảnh báo từ nội dung message/source ──
  private alertTitle(a: any): string {
    const msg = (a.message || '').toLowerCase();
    const src = (a.source || '').toLowerCase();
    if (src.includes('storage') || msg.includes('ổ đĩa') || msg.includes('disk') || msg.includes('dung lượng'))
      return 'CẢNH BÁO Ổ ĐĨA';
    if (msg.includes('phóng điện') || msg.includes('phong_dien') || src.includes('pd'))
      return 'CẢNH BÁO PHÓNG ĐIỆN';
    if (msg.includes('nhiệt') || msg.includes('nhiet') || msg.includes('°c') || msg.includes('camera nhiệt'))
      return 'CẢNH BÁO NHIỆT ĐỘ';
    if (msg.includes('camera') || src.includes('camera'))
      return 'CẢNH BÁO CAMERA';
    if (msg.includes('kết nối') || msg.includes('offline') || src.includes('health'))
      return 'CẢNH BÁO KẾT NỐI';
    if (a.level === 'alarm') return 'BÁO ĐỘNG KHẨN CẤP';
    return 'CẢNH BÁO HỆ THỐNG';
  }

  // ── iOS Premium Toast Notification (Global) ──────────────────
  private showToast(msg: string, type: 'success' | 'error' | 'warning' | 'alarm', thumb?: string, title?: string): void {
    const t = document.createElement('div');
    const color = type === 'alarm' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981';
    
    t.style.cssText = `
      position:fixed; top:-120px; left:50%; transform:translateX(-50%); z-index:9999;
      width:360px; background:rgba(30, 41, 59, 0.7); backdrop-filter:blur(20px) saturate(180%);
      -webkit-backdrop-filter:blur(20px) saturate(180%);
      color:#fff; padding:15px; border-radius:24px;
      box-shadow:0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
      transition:all 0.7s cubic-bezier(0.23, 1, 0.32, 1);
      cursor:pointer; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    // Sử dụng đường dẫn tương đối để Proxy (Vite) xử lý
    const imageUrl = thumb ? (thumb.startsWith('http') ? thumb : thumb) : '';

    t.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; opacity:0.5; font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:1px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:18px; height:18px; background:#3b82f6; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:11px;">⚡</div>
          STATION MONITOR
        </div>
        <div>bây giờ</div>
      </div>
      <div style="display:flex; gap:14px; align-items:center;">
         <div style="flex:1;">
            <div style="font-weight:800; color:${color}; font-size:0.9rem; margin-bottom:3px; letter-spacing:-0.2px;">${title ?? (type === 'alarm' ? 'BÁO ĐỘNG KHẨN CẤP' : 'THÔNG BÁO')}</div>
            <div style="font-size:0.82rem; line-height:1.45; opacity:0.95; font-weight:500;">${msg}</div>
         </div>
         ${imageUrl ? `<img src="${imageUrl}" style="width:60px; height:60px; border-radius:14px; object-fit:cover; border:1px solid rgba(255,255,255,0.15); background:#000;">` : ''}
      </div>
      <div style="margin-top:12px; height:3px; width:100%; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
         <div id="gt-progress" style="height:100%; width:100%; background:${color}; transition: width 7s linear;"></div>
      </div>
    `;

    document.body.appendChild(t);
    setTimeout(() => t.style.top = '20px', 50);

    // Subtle iOS-like notification sound
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.4;
        audio.play().catch(() => {});
    } catch {}

    const closeToast = () => {
      t.style.top = '-160px';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 700);
    };

    t.addEventListener('click', () => {
      closeToast();
      router.navigate('alerts-history');
    });

    setTimeout(() => {
        const prog = t.querySelector('#gt-progress') as HTMLElement;
        if(prog) prog.style.width = '0%';
    }, 100);

    setTimeout(closeToast, 7000);
  }

  private connectSignalR(): void {
    if (this.hubConnection) return;
    const token = localStorage.getItem('station_token') ?? localStorage.getItem('station_jwt');
    if (!token) return;

    // Sử dụng URL tuyệt đối vì Vite không cấu hình proxy cho /ws
    const hubUrl = 'http://localhost:5056/ws/realtime';

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('AlertNew', (a: any) => {
      const level = (a.level || 'warning').toLowerCase() as any;
      this.showToast(a.message, level, a.thumbnailUrl, this.alertTitle(a));
    });

    this.hubConnection.start().catch(err => {
        console.warn('[AppShell] SignalR error:', err);
        // Retry after 5s if failed
        setTimeout(() => this.connectSignalR(), 5000);
    });
  }

  destroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.hubConnection) this.hubConnection.stop();
  }
}

export const appShell = new AppShell();
