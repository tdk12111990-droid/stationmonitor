// ============================================================
// AlertsHistoryPage — Nhật ký cảnh báo từ backend API
// Hiển thị alerts + detail panel inline (không navigate trang)
// ============================================================

import { stationApi, type AlertItem, type AlertHistoryEntry } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';
import { router } from '@/router/Router';

type SortCol = 'time' | 'level';
type SortDir = 'asc' | 'desc';
type AlertDetail = AlertItem & { history: AlertHistoryEntry[] };

export class AlertsHistoryPage {
  private alerts: AlertItem[] = [];
  private filterStatus = '';
  private timeRange = '7d';
  private fromDate = '';
  private toDate = '';
  private sortBy: SortCol = 'time';
  private sortDir: SortDir = 'desc';
  private selectedId = '';

  render(): string {
    return `
    <style>
      /* ── Layout tổng: list + detail panel ── */
      .ah-layout {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        min-height: 0;
      }
      .ah-list-col {
        flex: 1 1 0;
        min-width: 0;
        transition: flex .25s ease;
      }
      .ah-detail-panel {
        width: 0;
        overflow: hidden;
        opacity: 0;
        transition: width .25s ease, opacity .2s ease;
        flex-shrink: 0;
      }
      .ah-detail-panel.open {
        width: 420px;
        opacity: 1;
      }

      /* ── Grid list ── */
      .ah-grid-header, .ah-grid-row {
        display: grid;
        grid-template-columns: 155px 100px 1fr 70px 120px 100px;
        align-items: center;
      }
      .ah-detail-panel.open ~ * .ah-grid-header,
      .ah-detail-panel.open ~ * .ah-grid-row {
        grid-template-columns: 140px 90px 1fr 60px 110px 90px;
      }
      .ah-grid-header {
        border-bottom: 1px solid var(--admin-border);
        background: var(--admin-card-bg);
        position: sticky; top: 0; z-index: 2;
      }
      .ah-grid-header > div {
        padding: 10px 12px;
        font-size: .7rem; font-weight: 700; letter-spacing: .4px;
        text-transform: uppercase; color: var(--admin-text); opacity: .6;
        white-space: nowrap; overflow: hidden;
        display: flex; align-items: center; gap: 5px;
      }
      .ah-grid-row {
        border-bottom: 1px solid rgba(255,255,255,.04);
        cursor: pointer; transition: background .1s;
      }
      .ah-grid-row:hover { background: rgba(255,255,255,.04); }
      .ah-grid-row.ah-selected { background: rgba(59,130,246,.10) !important; }
      .ah-grid-row > div {
        padding: 10px 12px;
        font-size: .83rem; color: var(--admin-text);
        overflow: hidden;
      }
      .ah-col-msg { word-break: break-word; }

      /* ── Sort controls ── */
      .ah-sortable-th { cursor:pointer; user-select:none; }
      .ah-sortable-th:hover { background:rgba(255,255,255,0.06) !important; opacity:1 !important; }
      .ah-th-icon { opacity:.7; }
      .ah-sort-badge {
        font-size:.68rem; padding:1px 5px; border-radius:3px;
        background:var(--admin-accent); color:#fff; font-weight:700; flex-shrink:0;
      }
      .ah-sort-inactive {
        background:rgba(255,255,255,.08); color:var(--admin-text); opacity:.4; font-weight:400;
      }
      .ah-sort-dropdown {
        position:fixed;
        background:var(--admin-card-bg); border:1px solid var(--admin-border);
        border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.4);
        z-index:9999; min-width:220px; overflow:hidden;
        animation: ah-pop .12s ease;
      }
      @keyframes ah-pop { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
      .ah-sort-dropdown-title {
        padding:8px 14px; font-size:.65rem; font-weight:800; letter-spacing:.5px;
        text-transform:uppercase; color:var(--admin-text); opacity:.4;
        border-bottom:1px solid var(--admin-border);
      }
      .ah-sort-opt {
        display:flex; align-items:center; gap:10px;
        padding:10px 14px; cursor:pointer; font-size:.85rem; color:var(--admin-text);
        transition:background .1s;
      }
      .ah-sort-opt:hover { background:rgba(255,255,255,.06); }
      .ah-sort-opt.active { background:rgba(59,130,246,.12); color:var(--admin-accent); font-weight:600; }
      .ah-sort-opt .opt-icon { font-size:1rem; width:20px; text-align:center; }
      .ah-sort-opt .opt-check { margin-left:auto; opacity:0; }
      .ah-sort-opt.active .opt-check { opacity:1; }

      /* ── Detail panel nội dung ── */
      .ah-detail-inner {
        width: 420px;
        height: calc(100vh - 170px);
        overflow-y: auto;
        background: var(--admin-card-bg);
        border: 1px solid var(--admin-border);
        border-radius: 12px;
      }
      .ah-detail-header {
        display:flex; align-items:center; gap:10px;
        padding:14px 16px;
        border-bottom:1px solid var(--admin-border);
        position:sticky; top:0; z-index:1;
        background:var(--admin-card-bg);
      }
      .ah-detail-section {
        padding:16px;
        border-bottom:1px solid var(--admin-border);
      }
      .ah-detail-section:last-child { border-bottom:none; }
      .ah-section-title {
        font-size:.65rem; font-weight:800; letter-spacing:.5px;
        text-transform:uppercase; opacity:.4; margin-bottom:12px;
      }
      .ah-info-row {
        display:flex; justify-content:space-between; align-items:center;
        padding:6px 0; border-bottom:1px solid rgba(255,255,255,.04);
        font-size:.82rem;
      }
      .ah-info-row:last-child { border-bottom:none; }
      .ah-info-label { opacity:.45; font-size:.75rem; text-transform:uppercase; letter-spacing:.2px; }
      .ah-timeline-item {
        display:flex; gap:12px; padding-bottom:14px;
      }
      .ah-tl-dot {
        width:26px; height:26px; border-radius:50%; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        font-size:.7rem; font-weight:700;
        border:2px solid; position:relative;
      }
      .ah-tl-line {
        position:absolute; top:26px; left:50%; transform:translateX(-50%);
        width:2px; height:calc(100% + 14px - 26px);
        background:var(--admin-border);
      }
      .ah-tl-content { flex:1; padding-top:3px; }
      .ah-detail-actions {
        display:flex; gap:8px; padding:14px 16px;
        border-top:1px solid var(--admin-border);
        position:sticky; bottom:0;
        background:var(--admin-card-bg);
      }
    </style>

    <div class="list-page" style="max-width:100%">
      <div class="page-toolbar" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <h2 style="margin:0">⚠️ NHẬT KÝ CẢNH BÁO</h2>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:.65rem;font-weight:800;color:var(--admin-text);opacity:.5;text-transform:uppercase;letter-spacing:.5px">THỜI GIAN</label>
            <select id="alertTimeRange" class="form-select" style="width:150px">
              <option value="today">Hôm nay</option>
              <option value="yesterday">Hôm qua</option>
              <option value="7d" selected>7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="all">Tất cả</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:.65rem;font-weight:800;color:var(--admin-text);opacity:.5;text-transform:uppercase;letter-spacing:.5px">TRẠNG THÁI</label>
            <select id="alertFilter" class="form-select" style="width:150px">
              <option value="">Tất cả</option>
              <option value="open">Chưa xử lý</option>
              <option value="acked">Đang xử lý</option>
              <option value="closed">Đã đóng</option>
            </select>
          </div>
          <button id="btnRefreshAlerts" class="btn-industrial btn-primary">↺ Làm mới</button>
        </div>
      </div>

      <div class="ah-layout">
        <!-- Danh sách alerts -->
        <div class="ah-list-col">
          <div class="admin-card" style="padding:0;overflow:hidden;">
            <div class="ah-grid-header" id="ahGridHeader">
              <div class="ah-sortable-th" data-sort="time">
                <span class="ah-th-icon">🕒</span> Thời gian
                <span id="sort-time" class="ah-sort-badge">↓</span>
              </div>
              <div class="ah-sortable-th" data-sort="level">
                <span class="ah-th-icon">⚡</span> Mức độ
                <span id="sort-level" class="ah-sort-badge ah-sort-inactive">⇅</span>
              </div>
              <div>Thông báo</div>
              <div>Giá trị</div>
              <div>Trạng thái</div>
              <div>Hành động</div>
            </div>
            <div style="overflow-y:auto;max-height:calc(100vh - 260px);" id="alertTableBody">
              <div style="text-align:center;padding:40px;color:#94a3b8">Đang tải...</div>
            </div>
            <div style="padding:7px 14px;border-top:1px solid var(--admin-border);font-size:.75rem;color:var(--admin-text);opacity:.5;display:flex;justify-content:space-between;">
              <span id="alertCount">0 cảnh báo</span>
              <span id="alertRangeLabel"></span>
            </div>
          </div>
        </div>

        <!-- Detail panel -->
        <div class="ah-detail-panel" id="ahDetailPanel">
          <div class="ah-detail-inner" id="ahDetailInner">
            <div style="text-align:center;padding:60px;opacity:.3;font-size:.85rem;">Chọn một cảnh báo để xem chi tiết</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ACK modal -->
    <div id="ackModal" class="modal-overlay">
      <div class="modal-content" style="width:400px">
        <div class="modal-header">
          <h3>Xác nhận cảnh báo</h3>
          <button id="ackModalClose" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Ghi chú xử lý (tùy chọn)</label>
            <textarea id="ackNote" class="form-input" rows="3" placeholder="Đã kiểm tra, đang xử lý..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button id="ackConfirm" class="btn-industrial btn-primary">Xác nhận</button>
          <button id="ackCancel" class="btn-industrial">Hủy</button>
        </div>
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    this.calculateDates();

    // Sort dropdown gắn vào body để tránh clip
    const dd = document.createElement('div');
    dd.id = 'sortDropdown';
    dd.className = 'ah-sort-dropdown';
    dd.style.display = 'none';
    dd.innerHTML = `<div class="ah-sort-dropdown-title" id="sortDropdownTitle"></div><div id="sortDropdownOptions"></div>`;
    document.body.appendChild(dd);

    await this.loadAlerts();
    this.bindEvents();
  }

  private calculateDates(): void {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (this.timeRange === 'today') {
      this.fromDate = todayStr; this.toDate = todayStr;
    } else if (this.timeRange === 'yesterday') {
      const y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      this.fromDate = y; this.toDate = y;
    } else if (this.timeRange === '7d') {
      this.fromDate = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      this.toDate = todayStr;
    } else if (this.timeRange === '30d') {
      this.fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      this.toDate = todayStr;
    } else {
      this.fromDate = ''; this.toDate = '';
    }
  }

  private async loadAlerts(): Promise<void> {
    const tbody = document.getElementById('alertTableBody');
    if (tbody) tbody.innerHTML = `<div style="text-align:center;padding:60px;color:#94a3b8">Đang tải...</div>`;
    try {
      const from = this.fromDate ? new Date(this.fromDate).toISOString() : undefined;
      const to = this.toDate ? new Date(this.toDate + 'T23:59:59').toISOString() : undefined;
      this.alerts = await stationApi.getAlerts(this.filterStatus || undefined, from, to);
      this.renderTable();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<div style="text-align:center;color:#ef4444;padding:30px">Lỗi tải alerts: ${e}</div>`;
    }
  }

  private sortedAlerts(): AlertItem[] {
    const levelOrder: Record<string, number> = { alarm: 0, warning: 1 };
    return [...this.alerts].sort((a, b) => {
      let cmp = 0;
      if (this.sortBy === 'time') {
        cmp = new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime();
      } else {
        cmp = (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9);
      }
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  private updateSortIndicators(): void {
    ['time', 'level'].forEach(col => {
      const el = document.getElementById(`sort-${col}`);
      if (!el) return;
      if (col === this.sortBy) {
        el.textContent = this.sortDir === 'asc' ? '↑' : '↓';
        el.className = 'ah-sort-badge';
      } else {
        el.textContent = '⇅';
        el.className = 'ah-sort-badge ah-sort-inactive';
      }
    });
  }

  private renderTable(): void {
    const tbody = document.getElementById('alertTableBody');
    if (!tbody) return;
    this.updateSortIndicators();

    const countEl = document.getElementById('alertCount');
    if (countEl) countEl.textContent = `${this.alerts.length} cảnh báo`;
    const rangeEl = document.getElementById('alertRangeLabel');
    if (rangeEl) rangeEl.textContent = this.fromDate ? `${this.fromDate} → ${this.toDate || 'nay'}` : 'Tất cả thời gian';

    if (this.alerts.length === 0) {
      tbody.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:40px">Không có cảnh báo trong khoảng thời gian này.</div>`;
      return;
    }

    let pendingAckId = '';

    tbody.innerHTML = this.sortedAlerts().map(a => {
      const time = new Date(a.triggeredAt).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const levelBadge = a.level === 'alarm'
        ? '<span class="tag tag-danger">🚨 Alarm</span>'
        : '<span class="tag tag-warning">⚠️ Warning</span>';
      const statusBadge = a.status === 'open'
        ? '<span class="tag tag-danger">Chưa xử lý</span>'
        : a.status === 'acked'
          ? '<span class="tag tag-warning">Đang xử lý</span>'
          : '<span class="tag tag-success">Đã đóng</span>';
      const value = a.value != null ? `<b>${a.value.toFixed(1)}</b>` : '—';
      const actionBtns = a.status === 'open'
        ? `<button class="btn-industrial btn-sm btn-ack" data-id="${a.id}">✓ ACK</button>`
        : a.status === 'acked'
          ? `<button class="btn-industrial btn-sm btn-close-alert" data-id="${a.id}">✕ Đóng</button>`
          : '';
      const sel = a.id === this.selectedId ? ' ah-selected' : '';

      return `
      <div class="ah-grid-row alert-row${sel}" data-id="${a.id}" title="Nhấn để xem chi tiết">
        <div style="font-size:.78rem;white-space:nowrap;">${time}</div>
        <div>${levelBadge}</div>
        <div class="ah-col-msg">${a.message}</div>
        <div>${value}</div>
        <div>${statusBadge}</div>
        <div>${actionBtns}</div>
      </div>`;
    }).join('');

    // Click row → open detail panel
    tbody.querySelectorAll('.alert-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const id = (row as HTMLElement).dataset.id!;
        this.openDetail(id);
      });
    });

    // ACK buttons
    tbody.querySelectorAll('.btn-ack').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingAckId = (btn as HTMLElement).dataset.id!;
        document.getElementById('ackModal')?.classList.add('active');
        (document.getElementById('ackNote') as HTMLTextAreaElement).value = '';
      });
    });

    document.getElementById('ackConfirm')?.addEventListener('click', async () => {
      const note = (document.getElementById('ackNote') as HTMLTextAreaElement).value;
      if (pendingAckId) {
        await stationApi.ackAlert(pendingAckId, note);
        document.getElementById('ackModal')?.classList.remove('active');
        await this.loadAlerts();
        if (this.selectedId) this.openDetail(this.selectedId);
      }
    });

    // Close-alert buttons
    tbody.querySelectorAll('.btn-close-alert').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Đóng cảnh báo', message: 'Xác nhận đóng alert này?', confirmText: 'Đóng alert' })) return;
        await stationApi.closeAlert((btn as HTMLElement).dataset.id!);
        await this.loadAlerts();
        if (this.selectedId) this.openDetail(this.selectedId);
      });
    });
  }

  private async openDetail(id: string): Promise<void> {
    this.selectedId = id;

    // Highlight selected row
    document.querySelectorAll('.alert-row').forEach(r => r.classList.remove('ah-selected'));
    document.querySelector(`.alert-row[data-id="${id}"]`)?.classList.add('ah-selected');

    // Mở panel
    const panel = document.getElementById('ahDetailPanel')!;
    const inner = document.getElementById('ahDetailInner')!;
    panel.classList.add('open');
    inner.innerHTML = `<div style="text-align:center;padding:60px;opacity:.4;font-size:.85rem;">⏳ Đang tải...</div>`;

    try {
      const a = await stationApi.getAlertDetail(id);
      inner.innerHTML = this.renderDetail(a);
      this.bindDetailEvents(a, inner);
    } catch (e: any) {
      inner.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;">⚠ Lỗi: ${e.message}</div>`;
    }
  }

  private closeDetail(): void {
    this.selectedId = '';
    document.querySelectorAll('.alert-row').forEach(r => r.classList.remove('ah-selected'));
    document.getElementById('ahDetailPanel')?.classList.remove('open');
  }

  private renderDetail(a: AlertDetail): string {
    const isAlarm = a.level === 'alarm';
    const color = isAlarm ? '#ef4444' : '#f59e0b';
    const levelText = isAlarm ? '🚨 ALARM' : '⚠️ WARNING';

    const statusLabel: Record<string, string> = {
      open: '🔴 Chưa xử lý', acked: '🟡 Đang xử lý', closed: '🟢 Đã đóng',
    };
    const sourceLabel: Record<string, string> = {
      rule_engine: 'Rule Engine', ai_detection: 'AI Detection',
      manual: 'Thủ công', maintenance: 'Bảo trì',
    };
    const fmt = (ts?: string) => ts
      ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';

    const infoRow = (label: string, val: string) => `
      <div class="ah-info-row">
        <span class="ah-info-label">${label}</span>
        <span>${val}</span>
      </div>`;

    const timelineItem = (icon: string, clr: string, time: string, actor: string, desc: string, hasLine: boolean) => `
      <div class="ah-timeline-item">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;position:relative;">
          <div class="ah-tl-dot" style="background:${clr}20;border-color:${clr};color:${clr};">
            ${icon}
            ${hasLine ? `<div class="ah-tl-line"></div>` : ''}
          </div>
        </div>
        <div class="ah-tl-content">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px;flex-wrap:wrap;">
            <span style="font-size:.7rem;font-family:monospace;opacity:.45;">${time}</span>
            <span style="font-size:.62rem;font-weight:700;padding:1px 6px;border-radius:3px;background:var(--admin-bg);border:1px solid var(--admin-border);opacity:.6;">${actor.toUpperCase()}</span>
          </div>
          <div style="font-size:.82rem;">${desc}</div>
        </div>
      </div>`;

    const historyItems = [
      timelineItem('🔔', color, fmt(a.triggeredAt), 'SYSTEM',
        `Phát sinh — ${levelText} — <span style="opacity:.7">${a.message}</span>`,
        a.history.length > 0),
      ...a.history.map((h, i) => timelineItem(
        h.status === 'acked' ? '✓' : h.status === 'closed' ? '✕' : '•',
        h.status === 'closed' ? '#10b981' : h.status === 'acked' ? '#f59e0b' : '#64748b',
        fmt(h.changedAt),
        h.changedBy || 'system',
        `→ <b>${statusLabel[h.status] ?? h.status}</b>${h.note ? ` <span style="opacity:.6">— ${h.note}</span>` : ''}`,
        i < a.history.length - 1,
      )),
    ].join('');

    return `
    <!-- Header -->
    <div class="ah-detail-header">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};flex-shrink:0;"></div>
      <span style="font-weight:800;color:${color};font-size:.9rem;">${levelText}</span>
      <span style="font-family:monospace;font-size:.72rem;opacity:.4;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${a.id.slice(0, 8)}</span>
      <button id="adClosePanel" class="btn-industrial" style="padding:4px 10px;font-size:.8rem;">✕</button>
    </div>

    <!-- Thông báo -->
    <div class="ah-detail-section">
      <div style="font-size:.88rem;line-height:1.5;opacity:.85;">${a.message}</div>
      <div style="margin-top:8px;font-size:.78rem;opacity:.4;">${fmt(a.triggeredAt)}</div>
    </div>

    <!-- Thông tin -->
    <div class="ah-detail-section">
      <div class="ah-section-title">Thông tin</div>
      ${infoRow('Trạng thái', statusLabel[a.status] ?? a.status)}
      ${infoRow('Nguồn', sourceLabel[a.source] ?? a.source)}
      ${a.value != null ? infoRow('Giá trị', `<b style="color:${color}">${a.value.toFixed(2)}</b>`) : ''}
      ${infoRow('ACK lúc', fmt(a.ackedAt))}
      ${infoRow('Đóng lúc', fmt(a.closedAt))}
      ${a.ackNote ? infoRow('Ghi chú', `<em style="opacity:.7">${a.ackNote}</em>`) : ''}
    </div>

    <!-- IDs -->
    <div class="ah-detail-section">
      <div class="ah-section-title">Tham chiếu</div>
      ${infoRow('Alert ID', `<code style="font-size:.68rem;opacity:.6">${a.id}</code>`)}
      ${a.deviceId ? infoRow('Device ID', `<code style="font-size:.68rem;opacity:.6">${a.deviceId}</code>`) : ''}
      ${a.ruleId ? infoRow('Rule ID', `<code style="font-size:.68rem;opacity:.6">${a.ruleId}</code>`) : ''}
    </div>

    <!-- Timeline -->
    <div class="ah-detail-section">
      <div class="ah-section-title">Lịch sử xử lý</div>
      ${a.history.length === 0 && !a.triggeredAt
        ? `<div style="text-align:center;opacity:.35;font-size:.82rem;padding:12px 0;">Chưa có lịch sử.</div>`
        : historyItems}
    </div>

    <!-- Actions -->
    <div class="ah-detail-actions">
      ${a.status === 'open'  ? `<button id="adAckBtn"   class="btn-industrial btn-primary" style="flex:1">✓ ACK cảnh báo</button>` : ''}
      ${a.status === 'acked' ? `<button id="adCloseBtn" class="btn-industrial btn-danger"  style="flex:1">✕ Đóng cảnh báo</button>` : ''}
      <button id="adAnalyticsBtn" class="btn-industrial" style="flex:1">📈 Phân tích</button>
    </div>`;
  }

  private bindDetailEvents(a: AlertDetail, container: HTMLElement): void {
    container.querySelector('#adClosePanel')?.addEventListener('click', () => this.closeDetail());

    container.querySelector('#adAnalyticsBtn')?.addEventListener('click', () => router.navigate('analytics'));

    container.querySelector('#adAckBtn')?.addEventListener('click', async () => {
      const note = prompt('Ghi chú ACK (tùy chọn):') ?? '';
      await stationApi.ackAlert(a.id, note);
      await this.loadAlerts();
      this.openDetail(a.id);
    });

    container.querySelector('#adCloseBtn')?.addEventListener('click', async () => {
      if (!await confirmDialog({ title: 'Đóng cảnh báo', message: 'Xác nhận đóng alert này?', confirmText: 'Đóng' })) return;
      await stationApi.closeAlert(a.id);
      await this.loadAlerts();
      this.openDetail(a.id);
    });
  }

  private bindEvents(): void {
    document.getElementById('btnRefreshAlerts')?.addEventListener('click', () => this.loadAlerts());

    document.getElementById('alertFilter')?.addEventListener('change', async (e) => {
      this.filterStatus = (e.target as HTMLSelectElement).value;
      await this.loadAlerts();
    });

    document.getElementById('alertTimeRange')?.addEventListener('change', async (e) => {
      this.timeRange = (e.target as HTMLSelectElement).value;
      this.calculateDates();
      await this.loadAlerts();
    });

    // Sort dropdown
    const dropdown = document.getElementById('sortDropdown')!;
    const dropTitle = document.getElementById('sortDropdownTitle')!;
    const dropOpts = document.getElementById('sortDropdownOptions')!;

    const SORT_OPTIONS: Record<SortCol, { icon: string; label: string; dir: SortDir }[]> = {
      time: [
        { icon: '🕒', label: 'Mới nhất trước', dir: 'desc' },
        { icon: '🕰️', label: 'Cũ nhất trước', dir: 'asc' },
      ],
      level: [
        { icon: '🚨', label: 'Alarm trước', dir: 'asc' },
        { icon: '⚠️', label: 'Warning trước', dir: 'desc' },
      ],
    };
    const COL_LABELS: Record<SortCol, string> = {
      time: 'SẮP XẾP THEO THỜI GIAN',
      level: 'SẮP XẾP THEO MỨC ĐỘ',
    };

    const closeDropdown = () => { dropdown.style.display = 'none'; };

    document.querySelectorAll('.ah-grid-header [data-sort]').forEach(th => {
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = (th as HTMLElement).dataset.sort as SortCol;
        const rect = (th as HTMLElement).getBoundingClientRect();
        dropTitle.textContent = COL_LABELS[col];
        dropOpts.innerHTML = SORT_OPTIONS[col].map(opt => `
          <div class="ah-sort-opt ${this.sortBy === col && this.sortDir === opt.dir ? 'active' : ''}"
               data-col="${col}" data-dir="${opt.dir}">
            <span class="opt-icon">${opt.icon}</span>
            <span>${opt.label}</span>
            <span class="opt-check">✓</span>
          </div>`).join('');
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.display = 'block';
        dropOpts.querySelectorAll('.ah-sort-opt').forEach(opt => {
          opt.addEventListener('click', () => {
            this.sortBy = (opt as HTMLElement).dataset.col as SortCol;
            this.sortDir = (opt as HTMLElement).dataset.dir as SortDir;
            this.renderTable();
            closeDropdown();
          });
        });
      });
    });

    document.addEventListener('click', closeDropdown);

    const closeAck = () => document.getElementById('ackModal')?.classList.remove('active');
    document.getElementById('ackModalClose')?.addEventListener('click', closeAck);
    document.getElementById('ackCancel')?.addEventListener('click', closeAck);
  }

  destroy(): void {
    document.getElementById('sortDropdown')?.remove();
  }
}
