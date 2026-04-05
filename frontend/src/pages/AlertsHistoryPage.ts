// ============================================================
// AlertsHistoryPage — Nhật ký cảnh báo từ backend API
// Hiển thị alerts, ACK, Close
// ============================================================

import { stationApi, type AlertItem } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

export class AlertsHistoryPage {
  private alerts: AlertItem[] = [];
  private filterStatus = '';

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>⚠️ NHẬT KÝ CẢNH BÁO</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="alertFilter" class="form-select" style="width:160px">
            <option value="">Tất cả</option>
            <option value="open">Chưa xử lý</option>
            <option value="acked">Đang xử lý</option>
            <option value="closed">Đã đóng</option>
          </select>
          <button id="btnRefreshAlerts" class="btn-industrial">↺ Làm mới</button>
        </div>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden;margin-top:16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Mức độ</th>
              <th>Thông báo</th>
              <th>Giá trị</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="alertTableBody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Đang tải...</td></tr>
          </tbody>
        </table>
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
    await this.loadAlerts();
    this.bindEvents();
  }

  private async loadAlerts(): Promise<void> {
    try {
      this.alerts = await stationApi.getAlerts(this.filterStatus || undefined, 200);
      this.renderTable();
    } catch (e) {
      const tbody = document.getElementById('alertTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:30px">Lỗi tải alerts: ${e}</td></tr>`;
    }
  }

  private renderTable(): void {
    const tbody = document.getElementById('alertTableBody');
    if (!tbody) return;

    if (this.alerts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:30px">Không có cảnh báo nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.alerts.map(a => {
      const time = new Date(a.triggeredAt).toLocaleString('vi-VN');
      const levelBadge = a.level === 'alarm'
        ? '<span class="tag tag-danger">🚨 Alarm</span>'
        : '<span class="tag tag-warning">⚠️ Warning</span>';
      const statusBadge = a.status === 'open'
        ? '<span class="tag" style="background:#ef4444">Chưa xử lý</span>'
        : a.status === 'acked'
        ? '<span class="tag" style="background:#f59e0b">Đang xử lý</span>'
        : '<span class="tag" style="background:#10b981">Đã đóng</span>';
      const value = a.value != null ? `<b>${a.value.toFixed(1)}</b>` : '—';

      const actionBtns = a.status === 'open'
        ? `<button class="btn-industrial btn-sm btn-ack" data-id="${a.id}">✓ ACK</button>`
        : a.status === 'acked'
        ? `<button class="btn-industrial btn-sm btn-close-alert" data-id="${a.id}">✕ Đóng</button>`
        : '';

      return `
      <tr>
        <td style="white-space:nowrap;font-size:.8rem">${time}</td>
        <td>${levelBadge}</td>
        <td style="max-width:300px">${a.message}</td>
        <td>${value}</td>
        <td>${statusBadge}</td>
        <td>${actionBtns}</td>
      </tr>`;
    }).join('');

    // ACK buttons
    let pendingAckId = '';
    document.querySelectorAll('.btn-ack').forEach(btn => {
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
      }
    });

    // Close buttons
    document.querySelectorAll('.btn-close-alert').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Đóng cảnh báo', message: 'Xác nhận đóng alert này?', confirmText: 'Đóng alert' })) return;
        await stationApi.closeAlert((btn as HTMLElement).dataset.id!);
        await this.loadAlerts();
      });
    });
  }

  private bindEvents(): void {
    document.getElementById('btnRefreshAlerts')?.addEventListener('click', () => this.loadAlerts());

    document.getElementById('alertFilter')?.addEventListener('change', async (e) => {
      this.filterStatus = (e.target as HTMLSelectElement).value;
      await this.loadAlerts();
    });

    const closeAck = () => document.getElementById('ackModal')?.classList.remove('active');
    document.getElementById('ackModalClose')?.addEventListener('click', closeAck);
    document.getElementById('ackCancel')?.addEventListener('click', closeAck);
  }

  destroy(): void {}
}
