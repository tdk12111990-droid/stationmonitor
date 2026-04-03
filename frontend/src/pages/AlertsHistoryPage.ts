// ============================================================
// AlertsHistoryPage – D05: Nhật ký Cảnh báo
// ============================================================

import { router } from '@/router/Router';
import type { AlarmStatus } from '@/types/app.types';
import { getScadaEvents, loadScadaPoints, type ScadaEvent } from '@/services/storage';


function badgeLabel(ev: any, liveAlarms: Set<string>): string {
  // Ưu tiên số 1: nếu thiết bị ĐANG còn đỏ trên live data → luôn là Chưa xử lý
  if (liveAlarms.has(String(ev.deviceId))) return '⚠ Chưa xử lý';
  if (ev.resolvedStatus) {
    switch (ev.resolvedStatus) {
      case 'RESOLVED':     return '✅ Đã xử lý';
      case 'FALSE_ALARM':  return '🚫 Cảnh báo giả';
      case 'ACKNOWLEDGED': return '🔍 Đang xử lý';
      case 'MAINTENANCE':  return '🔧 Bảo trì';
    }
  }
  if (ev.currentStatus === 'Normal') return '✅ Đã xử lý';
  return '⚠ Chưa xử lý';
}
function badgeColor(ev: any, liveAlarms: Set<string>): string {
  if (liveAlarms.has(String(ev.deviceId))) return '#ef4444';
  if (ev.resolvedStatus) {
    switch (ev.resolvedStatus) {
      case 'RESOLVED':     return '#10b981';
      case 'FALSE_ALARM':  return '#94a3b8';
      case 'ACKNOWLEDGED': return '#f59e0b';
      case 'MAINTENANCE':  return '#3b82f6';
    }
  }
  if (ev.currentStatus === 'Normal') return '#10b981';
  return '#ef4444';
}
function badgeBg(ev: any, liveAlarms: Set<string>): string { return badgeColor(ev, liveAlarms) + '22'; }

export class AlertsHistoryPage {
  private scadaEvents: ScadaEvent[] = [];
  private filteredEvents: ScadaEvent[] = [];
  private currentPage = 1;
  private pageSize = 10;

  // Device IDs đang còn Alarm/Warning theo live data (scada_points)
  private liveAlarmDevices: Set<string> = new Set();
  private searchQuery = '';
  private statusFilter: AlarmStatus | 'ALL' = 'ALL';

  render(): string {
    return `
    <div class="page-layout-split">
      <!-- Filter Sidebar -->
      <div class="filter-sidebar">
        <h3 class="filter-title">BỘ LỌC</h3>
        <div class="form-group">
          <label>TÌM KIẾM THIẾT BỊ</label>
          <input type="text" id="alertSearch" class="form-input" placeholder="Nhập tên thiết bị…">
        </div>
        <div class="form-group">
          <label>TRẠNG THÁI</label>
          ${[['ALL', 'Tất cả'], ['ACTIVE', 'Chưa xử lý'], ['ACKNOWLEDGED', 'Đang xử lý'], ['RESOLVED', 'Đã xử lý']].map(([v, l]) => `
          <label class="radio-label">
            <input type="radio" name="statusFilter" value="${v}" ${v === 'ALL' ? 'checked' : ''}> ${l}
          </label>`).join('')}
        </div>
        <div class="form-group">
          <label>LOẠI SỰ KIỆN</label>
          ${[['ALL', 'Tất cả'], ['THERMAL', 'Quá nhiệt'], ['PD', 'Phóng điện'], ['ACOUSTIC', 'Âm thanh'], ['SMOKE', 'Khói'], ['DEVICE_OFFLINE', 'Mất kết nối']].map(([v, l]) => `
          <label class="checkbox-label">
            <input type="checkbox" class="type-cb" value="${v}" checked> ${l}
          </label>`).join('')}
        </div>
        <div class="form-group">
          <label>KHOẢNG THỜI GIAN</label>
          <input type="date" id="dateFrom" class="form-input">
          <input type="date" id="dateTo" class="form-input" style="margin-top:6px">
          <button id="applyDateFilter" class="btn-industrial btn-primary" style="margin-top:8px;width:100%">Áp dụng</button>
        </div>
        <button id="resetFilters" class="btn-industrial" style="width:100%;margin-top:8px">Đặt lại lọc</button>
      </div>

      <!-- Content Area -->
      <div class="content-area">
        <div class="content-header">
          <h2>NHẬT KÝ CẢNH BÁO</h2>
          <div id="alertCountInfo" class="count-info"></div>
          <div style="display:flex;gap:8px">
            <button id="exportCsvBtn" class="btn-industrial">⬇ Xuất CSV</button>
          </div>
        </div>

        <div id="alertTableBody" class="alert-table"></div>
        <div id="paginationBar" class="pagination-bar"></div>
      </div>
    </div>`;
  }

  mount(): void {
    this.applyFilters();

    // Search
    let debounce: ReturnType<typeof setTimeout>;
    document.getElementById('alertSearch')?.addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
        this.currentPage = 1;
        this.applyFilters();
      }, 300);
    });

    // Status radio
    document.querySelectorAll('[name="statusFilter"]').forEach(r => {
      r.addEventListener('change', (e) => {
        this.statusFilter = (e.target as HTMLInputElement).value as any;
        this.currentPage = 1;
        this.applyFilters();
      });
    });

    // Type checkboxes
    document.querySelectorAll('.type-cb').forEach(cb => {
      cb.addEventListener('change', () => { this.currentPage = 1; this.applyFilters(); });
    });

    // Date filter
    document.getElementById('applyDateFilter')?.addEventListener('click', () => { this.currentPage = 1; this.applyFilters(); });

    // Reset
    document.getElementById('resetFilters')?.addEventListener('click', () => {
      (document.getElementById('alertSearch') as HTMLInputElement).value = '';
      this.searchQuery = '';
      this.statusFilter = 'ALL';
      document.querySelectorAll('[name="statusFilter"]').forEach((r: any) => r.checked = r.value === 'ALL');
      document.querySelectorAll('.type-cb').forEach((cb: any) => cb.checked = true);
      (document.getElementById('dateFrom') as HTMLInputElement).value = '';
      (document.getElementById('dateTo') as HTMLInputElement).value = '';
      this.currentPage = 1;
      this.applyFilters();
    });

    // CSV setup
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => this.exportCsv());

    // Load live status
    loadScadaPoints()
      .then(points => {
        this.liveAlarmDevices = new Set(
          points.filter(p => p.status === 'Alarm' || p.status === 'Warning').map(p => p.id)
        );
      })
      .catch(() => {})
      .finally(() => {
        getScadaEvents().then(events => {
          this.scadaEvents = events.sort((a, b) => b.timestamp - a.timestamp);
          this.applyFilters();
        }).catch(() => {});
      });
  }

  private renderTable(): void {
    const container = document.getElementById('alertTableBody');
    if (!container) return;

    if (this.scadaEvents.length === 0) {
      container.innerHTML = '<div class="empty-state">Chưa có cảnh báo nào được ghi nhận.</div>';
      return;
    }

    if (this.filteredEvents.length === 0) {
      container.innerHTML = '<div class="empty-state">Không tìm thấy cảnh báo nào phù hợp với bộ lọc.</div>';
      return;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const page = this.filteredEvents.slice(start, start + this.pageSize);

    container.innerHTML = page.map(ev => {
      const typeLabel = ev.deviceName.includes('PD') ? 'Phóng điện' : (ev.deviceName.includes('Nhiệt') ? 'Quá nhiệt' : 'Hệ thống');
      const icon = ev.deviceName.includes('PD') ? '⚡' : (ev.deviceName.includes('Nhiệt') ? '🌡' : '🔊');
      const lvlColor = ev.currentStatus === 'Alarm' ? '#ef4444' : (ev.currentStatus === 'Warning' ? '#f59e0b' : '#38bdf8');

      return `
      <div class="alert-row" data-alarm-id="${ev.eventId}" style="border-left:3px solid ${lvlColor}">
        <div class="alert-row-icon">${icon}</div>
        <div class="alert-row-main">
          <div class="alert-row-device">${ev.deviceName}</div>
          <div class="alert-row-msg">${typeLabel} – Trạng thái: ${ev.previousStatus} → ${ev.currentStatus}</div>
        </div>
        <div class="alert-row-value" style="color:${lvlColor}">${ev.currentValue ?? '-'} ${ev.measureUnit ?? ''}</div>
        <div class="alert-row-time">
          <div>${new Date(ev.timestamp).toLocaleString('vi-VN')}</div>
          <div style="font-size:.7rem;opacity:.5">${ev.deviceType}</div>
        </div>
        <div class="alert-row-badge" style="background:${badgeBg(ev, this.liveAlarmDevices)};color:${badgeColor(ev, this.liveAlarmDevices)}">${badgeLabel(ev, this.liveAlarmDevices)}</div>
        <div><button class="btn-industrial btn-sm btn-detail-${ev.eventId}">${!this.liveAlarmDevices.has(String(ev.deviceId)) && ((ev as any).resolvedStatus || ev.currentStatus === 'Normal') ? 'Xem' : 'Xử lý'}</button></div>
      </div>`;
    }).join('');

    page.forEach(ev => {
      container.querySelector(`.btn-detail-${ev.eventId}`)?.addEventListener('click', () => {
        (window as any).__routerParams = { alarm_id: ev.eventId };
        router.navigate('alert-detail');
      });
    });
  }

  private applyFilters(): void {
    const dateFrom = (document.getElementById('dateFrom') as HTMLInputElement)?.value;
    const dateTo = (document.getElementById('dateTo') as HTMLInputElement)?.value;

    this.filteredEvents = this.scadaEvents.filter(ev => {
      if (this.searchQuery && !ev.deviceName.toLowerCase().includes(this.searchQuery)) return false;
      
      // Translate Active/Resolved filters
      if (this.statusFilter === 'ACTIVE' && ev.currentStatus === 'Normal') return false;
      if (this.statusFilter === 'RESOLVED' && ev.currentStatus !== 'Normal') return false;
      
      // Date filtering
      if (dateFrom && ev.timestamp < new Date(dateFrom).getTime()) return false;
      if (dateTo && ev.timestamp > new Date(dateTo + 'T23:59:59').getTime()) return false;
      
      return true;
    });

    this.renderTable();
    this.renderPagination();
    document.getElementById('alertCountInfo')!.innerHTML =
      `<span>Tổng: <b>${this.filteredEvents.length}</b></span>
       <span style="color:#ef4444">Chưa xử lý: <b>${this.filteredEvents.filter(e => e.currentStatus !== 'Normal').length}</b></span>`;
  }

  private renderPagination(): void {
    const total = Math.ceil(this.filteredEvents.length / this.pageSize);
    const bar = document.getElementById('paginationBar')!;
    if (total <= 1) { bar.innerHTML = ''; return; }
    bar.innerHTML = `
    <button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} id="pgPrev">◀</button>
    ${Array.from({ length: total }, (_, i) => `<button class="page-btn ${i + 1 === this.currentPage ? 'active' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
    <button class="page-btn" ${this.currentPage === total ? 'disabled' : ''} id="pgNext">▶</button>`;
    
    bar.querySelector('#pgPrev')?.addEventListener('click', () => { this.currentPage--; this.applyFilters(); });
    bar.querySelector('#pgNext')?.addEventListener('click', () => { this.currentPage++; this.applyFilters(); });
    bar.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => { this.currentPage = parseInt((btn as HTMLElement).dataset.pg!); this.applyFilters(); });
    });
  }

  private exportCsv(): void {
    const headers = ['eventId', 'deviceId', 'deviceName', 'deviceType', 'previousStatus', 'currentStatus', 'currentValue', 'measureUnit', 'timestamp'];
    const rows = this.filteredEvents.map(ev => [
      ev.eventId, ev.deviceId, `"${ev.deviceName}"`, ev.deviceType, 
      ev.previousStatus, ev.currentStatus, ev.currentValue ?? '', ev.measureUnit ?? '', 
      new Date(ev.timestamp).toISOString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scada_events_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }
}
