// ============================================================
// AuditLogPage — Nhật ký hệ thống (Giao diện Sáng & Tối ưu)
// Cải thiện độ rộng, thêm chế độ xem "Tất cả", hỗ trợ thanh cuộn
// ============================================================

import { stationApi } from '@/services/StationApiService';

type TabId = 'all' | 'audit' | 'login' | 'notify' | 'triggers';

export class AuditLogPage {
  private activeTab: TabId = 'all';
  private timeRange: string = 'today'; 
  private fromDate = '';
  private toDate   = '';

  render(): string {
    return `
    <div class="audit-log-wrapper">
      <div class="audit-log-container">
        <div class="page-toolbar audit-toolbar">
          <div class="toolbar-left">
            <h2>NHẬT KÝ HỆ THỐNG</h2>
            <div class="toolbar-select-group">
              <div class="select-wrapper">
                <label>LOẠI NHẬT KÝ</label>
                <select id="logTabSelect" class="form-select audit-select">
                  <option value="all"      ${this.activeTab === 'all'      ? 'selected' : ''}>🌟 Tất cả nhật ký</option>
                  <option value="audit"    ${this.activeTab === 'audit'    ? 'selected' : ''}>📋 Hành động hệ thống</option>
                  <option value="login"    ${this.activeTab === 'login'    ? 'selected' : ''}>🔑 Nhật ký đăng nhập</option>
                  <option value="notify"   ${this.activeTab === 'notify'   ? 'selected' : ''}>📧 Thông báo Email/SMS</option>
                  <option value="triggers" ${this.activeTab === 'triggers' ? 'selected' : ''}>⚡ Rule kích hoạt</option>
                </select>
              </div>
              <div class="select-wrapper">
                <label>THỜI GIAN</label>
                <select id="logTimeSelect" class="form-select audit-select">
                  <option value="today"     ${this.timeRange === 'today'     ? 'selected' : ''}>Hôm nay</option>
                  <option value="yesterday" ${this.timeRange === 'yesterday' ? 'selected' : ''}>Hôm qua</option>
                  <option value="7d"        ${this.timeRange === '7d'        ? 'selected' : ''}>7 ngày qua</option>
                  <option value="30d"       ${this.timeRange === '30d'       ? 'selected' : ''}>30 ngày qua</option>
                  <option value="all"       ${this.timeRange === 'all'       ? 'selected' : ''}>Tất cả lịch sử</option>
                </select>
              </div>
            </div>
          </div>
          <div class="toolbar-right">
            <button id="auditRefreshBtn" class="btn-industrial btn-primary">
              <span style="font-size:1.1rem">↻</span> Làm mới
            </button>
          </div>
        </div>

        <!-- Main Log Card -->
        <div class="admin-card audit-card">
          <div class="audit-table-header-sticky">
            <table class="data-table audit-table" style="margin-bottom:0">
              <thead id="auditThead"></thead>
            </table>
          </div>
          <div class="audit-table-scroll-body">
            <table class="data-table audit-table">
              <tbody id="auditTableBody">
                <tr><td colspan="6" style="text-align:center;padding:100px;color:#94a3b8">Đang nạp dữ liệu...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="audit-footer">
          <span>Hệ thống lưu trữ nhật ký thời gian thực — Immutable Storage</span>
          <span id="logCount">0 bản ghi</span>
        </div>
      </div>
    </div>

    <style>
      .audit-log-wrapper {
        background: var(--admin-bg); min-height: 100%; padding: 20px;
        display: flex; justify-content: center;
      }
      .audit-log-container {
        width: 100%; max-width: 1200px;
      }

      /* Toolbar */
      .audit-toolbar {
        display: flex; justify-content: space-between; align-items: flex-end;
        background: var(--admin-card-bg); padding: 24px; border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.2);
        margin-bottom: 20px; border: 1px solid var(--admin-border);
      }
      .toolbar-left h2 { margin: 0 0 16px 0; font-size: 1.5rem; color: var(--admin-text); font-weight: 800; }
      .toolbar-select-group { display: flex; gap: 16px; }
      .select-wrapper { display: flex; flex-direction: column; gap: 6px; }
      .select-wrapper label { font-size: 0.65rem; font-weight: 800; color: var(--admin-text); opacity: 0.5; text-transform: uppercase; letter-spacing: 0.5px; }

      .audit-select {
        background: var(--admin-bg); border: 1px solid var(--admin-border); color: var(--admin-text);
        padding: 10px 14px; border-radius: 8px; width: 220px; font-size: 0.9rem;
        cursor: pointer; font-weight: 500;
      }
      .audit-select:focus { border-color: var(--admin-accent); outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

      /* Table & Scrolling */
      .audit-card { background: var(--admin-card-bg); border-radius: 12px; border: 1px solid var(--admin-border); box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.2); padding: 0 !important; }
      .audit-table-scroll-body { max-height: 65vh; overflow-y: auto; }

      .audit-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .audit-table th {
        background: var(--admin-bg); color: var(--admin-text); opacity: 0.6; font-size: 0.7rem; text-transform: uppercase;
        padding: 14px 16px; border-bottom: 1px solid var(--admin-border); text-align: left; font-weight: 700;
      }
      .audit-table th { opacity: 1; color: var(--admin-text); }
      .audit-table td {
        padding: 14px 16px; border-bottom: 1px solid var(--admin-border);
        color: var(--admin-text); font-size: 0.85rem; word-break: break-word; opacity: 0.85;
      }
      .audit-table tr:last-child td { border-bottom: none; }
      .audit-table tr:hover td { background: rgba(255,255,255,0.03); opacity: 1; }

      /* Badge */
      .tag-all { background: rgba(59,130,246,0.2); color: #60a5fa; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
      .tag-audit { background: rgba(245,158,11,0.2); color: #fbbf24; }
      .tag-login { background: rgba(16,185,129,0.2); color: #34d399; }
      .tag-notify { background: rgba(139,92,246,0.2); color: #a78bfa; }
      .tag-trigger { background: rgba(239,68,68,0.2); color: #f87171; }

      .audit-detail-row { background: var(--admin-bg) !important; }
      .log-diff-box {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px;
        background: var(--admin-card-bg); border-radius: 8px; border: 1px solid var(--admin-border);
      }
      .diff-item b { display: block; margin-bottom: 8px; font-size: 0.65rem; color: var(--admin-text); opacity: 0.5; border-bottom: 1px solid var(--admin-border); padding-bottom: 4px; }
      .diff-content { font-family: monospace; font-size: 0.75rem; white-space: pre-wrap; color: var(--admin-text); }

      .audit-footer { display: flex; justify-content: space-between; margin-top: 20px; color: var(--admin-text); opacity: 0.5; font-size: 0.75rem; }

      .expanding-btn { color: var(--admin-accent); cursor: pointer; border: 1px solid var(--admin-border); background: var(--admin-bg); padding: 2px 8px; border-radius: 4px; color: var(--admin-text); }
      .expanding-btn:hover { background: rgba(255,255,255,0.05); }

      .hidden { display: none; }

      /* Column fixed widths */
      .col-time { width: 160px; }
      .col-type { width: 100px; }
      .col-action { width: 140px; }
      .col-who { width: 180px; }
      .col-ip { width: 120px; }
      .col-view { width: 60px; }
    </style>
    `;
  }

  async mount(): Promise<void> {
    this.calculateDates();
    this.renderThead();
    await this.loadActive();
    this.bindEvents();
  }

  private calculateDates() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (this.timeRange === 'today') { this.fromDate = todayStr; this.toDate = todayStr; }
    else if (this.timeRange === 'yesterday') {
      const yest = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      this.fromDate = yest; this.toDate = yest;
    } else if (this.timeRange === '7d') {
      this.fromDate = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      this.toDate = todayStr;
    } else if (this.timeRange === '30d') {
      this.fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      this.toDate = todayStr;
    } else { this.fromDate = ''; this.toDate = ''; }
  }

  private renderThead(): void {
    const el = document.getElementById('auditThead');
    if (!el) return;
    if (this.activeTab === 'all') {
      el.innerHTML = `<tr>
        <th class="col-time">Thời gian</th>
        <th class="col-type">Loại</th>
        <th>Hành động / Sự kiện</th>
        <th class="col-who">Đối tượng</th>
        <th class="col-view">Xem</th>
      </tr>`;
    } else if (this.activeTab === 'audit') {
      el.innerHTML = `<tr>
        <th class="col-time">Thời gian</th>
        <th class="col-action">Hành động</th>
        <th>Đối tượng tác động</th>
        <th class="col-who">Người thực hiện</th>
        <th class="col-view">Xem</th>
      </tr>`;
    } else if (this.activeTab === 'login') {
      el.innerHTML = `<tr>
        <th class="col-time">Thời gian</th>
        <th class="col-action">Tên đăng nhập</th>
        <th>Kết quả</th>
        <th class="col-ip">Địa chỉ IP</th>
      </tr>`;
    } else if (this.activeTab === 'notify') {
      el.innerHTML = `<tr>
        <th class="col-time">Thời gian</th>
        <th class="col-type">Kênh</th>
        <th>Người nhận</th>
        <th class="col-action">Trạng thái</th>
      </tr>`;
    } else {
      el.innerHTML = `<tr>
        <th class="col-time">Thời gian</th>
        <th>Quy tắc</th>
        <th>Thiết bị</th>
        <th class="col-action">Giá trị</th>
      </tr>`;
    }
  }

  private async loadActive(): Promise<void> {
    if (this.activeTab === 'all') await this.loadAll();
    else if (this.activeTab === 'audit') await this.loadAudit();
    else if (this.activeTab === 'login') await this.loadLogin();
    else if (this.activeTab === 'notify') await this.loadNotify();
    else await this.loadTriggers();
  }

  // ── loaders ───────────────────────────────────────────────

  private async loadAll(): Promise<void> {
    const tbody = document.getElementById('auditTableBody')!;
    tbody.innerHTML = this.loadingRow(5);
    try {
      const params = { from: this.fromDate ? new Date(this.fromDate).toISOString() : undefined, to: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined, limit: 100 };
      const [audit, logins, notify, triggers] = await Promise.all([
        stationApi.getAuditLogs(params),
        stationApi.getLoginLogs(params),
        stationApi.getNotifyLogs(params),
        stationApi.getRuleTriggerLogs(params)
      ]);

      const merged = [
        ...audit.map(l => ({ ts: l.ts, type: 'audit', action: l.action, info: this.entityLabel(l.entityType ?? null), who: l.fullName || l.username, raw: l })),
        ...logins.map(l => ({ ts: l.ts, type: 'login', action: 'Auth', info: l.action === 'login' ? 'Đăng nhập thành công' : 'Thất bại/Thoát', who: l.username, raw: l })),
        ...notify.map(l => ({ ts: l.sentAt, type: 'notify', action: 'Notify', info: `${l.channel}: ${l.status}`, who: l.recipient, raw: l })),
        ...triggers.map(l => ({ ts: l.triggeredAt, type: 'trigger', action: 'Rule', info: l.ruleName || 'Rule triggered', who: l.deviceName, raw: l }))
      ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

      this.updateCount(merged.length);
      if (!merged.length) { tbody.innerHTML = this.emptyRow(5, 'Không có dữ liệu tổng hợp.'); return; }

      tbody.innerHTML = merged.map((m: any) => {
        const typeTag = `<span class="tag-all tag-${m.type}">${m.type.toUpperCase()}</span>`;
        const hasDetail = m.type === 'audit';
        return `
        <tr>
          <td class="col-time" style="color:#64748b; font-family:monospace">${fmtTime(m.ts)}</td>
          <td class="col-type">${typeTag}</td>
          <td style="font-weight:600">${m.info} <small style="color:#94a3b8; font-weight:normal">(${m.action})</small></td>
          <td class="col-who">${m.who || 'system'}</td>
          <td class="col-view" style="text-align:center">
             ${hasDetail ? `<button class="expanding-btn" onclick="this.closest('tr').nextElementSibling.classList.toggle('hidden')">▼</button>` : '—'}
          </td>
        </tr>
        ${hasDetail ? `<tr class="hidden audit-detail-row">
          <td colspan="5" style="padding:16px"><div class="log-diff-box">
            <div class="diff-item"><b>CŨ</b><div class="diff-content">${this.prettyFormat(m.raw.oldValue)}</div></div>
            <div class="diff-item"><b>MỚI</b><div class="diff-content">${this.prettyFormat(m.raw.newValue)}</div></div>
          </div></td>
        </tr>` : ''}`;
      }).join('');
    } catch (e) { tbody.innerHTML = this.errorRow(5, e); }
  }

  private async loadAudit(): Promise<void> {
    const tbody = document.getElementById('auditTableBody')!;
    tbody.innerHTML = this.loadingRow(5);
    try {
      const logs = await stationApi.getAuditLogs({ from: this.fromDate ? new Date(this.fromDate).toISOString() : undefined, to: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined, limit: 200 });
      this.updateCount(logs.length);
      tbody.innerHTML = logs.map((l: any) => `
        <tr>
          <td class="col-time" style="color:#64748b">${fmtTime(l.ts)}</td>
          <td class="col-action"><b>${l.action.toUpperCase()}</b></td>
          <td>${this.entityLabel(l.entityType)} <small style="color:#94a3b8; font-size:0.7rem">${l.entityId?.slice(0,8) || ''}</small></td>
          <td class="col-who">${l.fullName || l.username || 'system'}</td>
          <td class="col-view" style="text-align:center">
            <button class="expanding-btn" onclick="this.closest('tr').nextElementSibling.classList.toggle('hidden')">▼</button>
          </td>
        </tr>
        <tr class="hidden audit-detail-row">
          <td colspan="5" style="padding:16px"><div class="log-diff-box">
            <div class="diff-item"><b>CŨ</b><div class="diff-content">${this.prettyFormat(l.oldValue)}</div></div>
            <div class="diff-item"><b>MỚI</b><div class="diff-content">${this.prettyFormat(l.newValue)}</div></div>
          </div></td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = this.errorRow(5, e); }
  }

  private async loadLogin(): Promise<void> {
    const tbody = document.getElementById('auditTableBody')!;
    tbody.innerHTML = this.loadingRow(4);
    try {
      const logs = await stationApi.getLoginLogs({ from: this.fromDate ? new Date(this.fromDate).toISOString() : undefined, to: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined });
      this.updateCount(logs.length);
      tbody.innerHTML = logs.map((l: any) => `
        <tr>
          <td class="col-time">${fmtTime(l.ts)}</td>
          <td class="col-action"><b>${l.username}</b></td>
          <td>${l.action === 'login' ? '✅ Đăng nhập' : '❌ Thất bại / Thoát'}</td>
          <td class="col-ip">${l.ipAddress || 'internal'}</td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = this.errorRow(4, e); }
  }

  private async loadNotify(): Promise<void> {
    const tbody = document.getElementById('auditTableBody')!;
    tbody.innerHTML = this.loadingRow(4);
    try {
      const logs = await stationApi.getNotifyLogs({ from: this.fromDate ? new Date(this.fromDate).toISOString() : undefined, to: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined });
      this.updateCount(logs.length);
      tbody.innerHTML = logs.map((l: any) => `
        <tr>
          <td class="col-time">${fmtTime(l.sentAt)}</td>
          <td class="col-type"><b>${l.channel.toUpperCase()}</b></td>
          <td>${l.recipient}</td>
          <td class="col-action">${l.status === 'sent' ? '✅ Gửi thành công' : '❌ Lỗi'}</td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = this.errorRow(4, e); }
  }

  private async loadTriggers(): Promise<void> {
    const tbody = document.getElementById('auditTableBody')!;
    tbody.innerHTML = this.loadingRow(4);
    try {
      const logs = await stationApi.getRuleTriggerLogs({ from: this.fromDate ? new Date(this.fromDate).toISOString() : undefined, to: this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined });
      this.updateCount(logs.length);
      tbody.innerHTML = logs.map((l: any) => `
        <tr>
          <td class="col-time">${fmtTime(l.triggeredAt)}</td>
          <td><b>${l.ruleName || 'Rule'}</b></td>
          <td>${l.deviceName || 'Device'}</td>
          <td class="col-action"><b>${l.valueAtTrigger?.toFixed(2) || '—'}</b></td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = this.errorRow(4, e); }
  }

  private entityLabel(type: string | null): string {
    const map: Record<string, string> = { device: 'Thiết bị', rule: 'Quy tắc', alert: 'Cảnh báo', user: 'Người dùng', settings: 'Cấu hình', maintenance: 'Bảo trì' };
    return type ? (map[type] ?? type) : '—';
  }

  private prettyFormat(raw: string | null): string {
    if (!raw) return '(trống)';
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }

  private updateCount(count: number) {
    const el = document.getElementById('logCount');
    if (el) el.textContent = `${count} bản ghi`;
  }

  private loadingRow(cols: number): string { return `<tr><td colspan="${cols}" style="text-align:center;padding:60px;color:#94a3b8">Đang nạp...</td></tr>`; }
  private emptyRow(cols: number, m: string): string { return `<tr><td colspan="${cols}" style="text-align:center;padding:60px;color:#94a3b8;font-style:italic">${m}</td></tr>`; }
  private errorRow(cols: number, e: any): string { return `<tr><td colspan="${cols}" style="text-align:center;padding:60px;color:#ef4444">⚠ Lỗi: ${e.message || e}</td></tr>`; }

  private bindEvents(): void {
    const ts = document.getElementById('logTabSelect') as HTMLSelectElement;
    const tt = document.getElementById('logTimeSelect') as HTMLSelectElement;
    ts?.addEventListener('change', async () => { this.activeTab = ts.value as TabId; this.renderThead(); await this.loadActive(); });
    tt?.addEventListener('change', async () => { this.timeRange = tt.value; this.calculateDates(); await this.loadActive(); });
    document.getElementById('auditRefreshBtn')?.addEventListener('click', async () => await this.loadActive());
  }

  destroy(): void {}
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
