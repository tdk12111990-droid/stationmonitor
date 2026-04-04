// ============================================================
// AuditLogPage — Nhật ký hành động hệ thống từ backend API
// GET /api/v1/logs/audit + GET /api/v1/logs/login
// ============================================================

import { stationApi } from '@/services/StationApiService';

export class AuditLogPage {
  private activeTab: 'audit' | 'login' = 'audit';

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>📋 NHẬT KÝ HỆ THỐNG</h2>
        <button id="auditRefreshBtn" class="btn-industrial">↺ Làm mới</button>
      </div>

      <div style="display:flex;gap:4px;margin-bottom:16px;">
        <button id="tabAudit" class="btn-industrial btn-primary" style="font-size:0.8rem;">Hành động</button>
        <button id="tabLogin" class="btn-industrial" style="font-size:0.8rem;">Đăng nhập</button>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden;">
        <table class="data-table">
          <thead id="auditThead"></thead>
          <tbody id="auditTableBody">
            <tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8">Đang tải...</td></tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px;font-size:.75rem;opacity:.4;text-align:center">
        Nhật ký chỉ đọc — Không thể sửa hoặc xóa
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    this.renderTabHeaders();
    await this.loadAudit();
    this.bindEvents();
  }

  private renderTabHeaders(): void {
    const thead = document.getElementById('auditThead');
    if (!thead) return;
    thead.innerHTML = this.activeTab === 'audit'
      ? `<tr><th>Thời gian</th><th>Hành động</th><th>Đối tượng</th><th>IP</th><th>User ID</th></tr>`
      : `<tr><th>Thời gian</th><th>Username</th><th>Hành động</th><th>IP</th></tr>`;
  }

  private async loadAudit(): Promise<void> {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">Đang tải...</td></tr>`;
    try {
      const logs = await stationApi.getAuditLogs();
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:30px">Chưa có log nào. Thực hiện một thao tác (thêm/sửa/xóa) để tạo log.</td></tr>`;
        return;
      }
      tbody.innerHTML = logs.map(l => `<tr>
        <td style="white-space:nowrap;font-size:0.8rem">${new Date(l.ts).toLocaleString('vi-VN')}</td>
        <td>${this.actionBadge(l.action)}</td>
        <td style="font-size:0.8rem;color:#94a3b8">${l.entityType ?? '—'} ${l.entityId ? `<small>${l.entityId.slice(0,8)}...</small>` : ''}</td>
        <td style="font-size:0.8rem">${l.ipAddress ?? '—'}</td>
        <td style="font-size:0.75rem;color:#64748b">${l.userId ? l.userId.slice(0,8) + '...' : '—'}</td>
      </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:30px">Lỗi: ${e}</td></tr>`;
    }
  }

  private async loadLogin(): Promise<void> {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">Đang tải...</td></tr>`;
    try {
      const logs = await stationApi.getLoginLogs();
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:30px">Chưa có log đăng nhập.</td></tr>`;
        return;
      }
      tbody.innerHTML = logs.map(l => {
        const badge = l.action === 'login'
          ? '<span class="tag tag-success">✓ Login</span>'
          : l.action === 'failed'
          ? '<span class="tag tag-danger">✗ Thất bại</span>'
          : `<span class="tag">${l.action}</span>`;
        return `<tr>
          <td style="white-space:nowrap;font-size:0.8rem">${new Date(l.ts).toLocaleString('vi-VN')}</td>
          <td><b>${l.username ?? '—'}</b></td>
          <td>${badge}</td>
          <td style="font-size:0.8rem">${l.ipAddress ?? '—'}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:30px">Lỗi: ${e}</td></tr>`;
    }
  }

  private actionBadge(action: string): string {
    return ({
      create:      '<span class="tag tag-success">+ Tạo mới</span>',
      update:      '<span class="tag" style="background:#3b82f6">✎ Cập nhật</span>',
      delete:      '<span class="tag tag-danger">✕ Xóa</span>',
      ack_alert:   '<span class="tag tag-warning">✓ ACK Alert</span>',
      close_alert: '<span class="tag" style="background:#64748b">■ Đóng Alert</span>',
    } as Record<string, string>)[action] ?? `<span class="tag">${action}</span>`;
  }

  private bindEvents(): void {
    document.getElementById('tabAudit')?.addEventListener('click', async () => {
      this.activeTab = 'audit';
      this.setTabStyle();
      this.renderTabHeaders();
      await this.loadAudit();
    });
    document.getElementById('tabLogin')?.addEventListener('click', async () => {
      this.activeTab = 'login';
      this.setTabStyle();
      this.renderTabHeaders();
      await this.loadLogin();
    });
    document.getElementById('auditRefreshBtn')?.addEventListener('click', async () => {
      this.activeTab === 'audit' ? await this.loadAudit() : await this.loadLogin();
    });
  }

  private setTabStyle(): void {
    document.getElementById('tabAudit')?.classList.toggle('btn-primary', this.activeTab === 'audit');
    document.getElementById('tabLogin')?.classList.toggle('btn-primary', this.activeTab === 'login');
  }

  destroy(): void {}
}
