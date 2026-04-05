// ============================================================
// ReportsPage v2 — 2 tab
//   Tab 1: Xuất dữ liệu (XLSX)  — sensor readings theo ngày
//   Tab 2: Báo cáo phân tích (PDF) — báo cáo đầy đủ với biểu đồ
// ============================================================

import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import {
  stationApi,
  type AlertItem,
} from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

type ReportType = 'daily' | 'monthly' | 'event';

// Sensor point definitions
const POINTS = [
  { id: 'nhiet_do_pha_1', label: 'Nhiệt độ Pha 1', unit: '°C', color: '#3b82f6' },
  { id: 'nhiet_do_pha_2', label: 'Nhiệt độ Pha 2', unit: '°C', color: '#10b981' },
  { id: 'nhiet_do_pha_3', label: 'Nhiệt độ Pha 3', unit: '°C', color: '#f59e0b' },
  { id: 'phong_dien',     label: 'Phóng điện PD',  unit: 'dB',  color: '#a855f7' },
];

export class ReportsPage {
  private stationId = '';
  private alerts: AlertItem[] = [];
  private previewChart: Chart | null = null;   // Tab 1 export chart
  private inlineChart:  Chart | null = null;   // Tab 2 report inline chart
  private lastReportHtml = '';
  private isGenerating = false;
  private isExporting = false;

  render(): string {
    const today = new Date().toISOString().split('T')[0]!;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;

    return `
    <div id="rp-root" style="display:flex;flex-direction:column;height:calc(100vh - 64px);background:#0f172a;overflow:hidden;">

      <!-- TAB BAR -->
      <div style="display:flex;align-items:center;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;padding:0 16px;">
        <button class="rp-tab rp-tab-active" data-tab="export"
          style="padding:12px 20px;background:none;border:none;border-bottom:2px solid #2563eb;
          color:#e2e8f0;font-size:0.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
          📊 Xuất dữ liệu
        </button>
        <button class="rp-tab" data-tab="report"
          style="padding:12px 20px;background:none;border:none;border-bottom:2px solid transparent;
          color:#64748b;font-size:0.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">
          📄 Báo cáo phân tích
        </button>
      </div>

      <!-- CONTENT -->
      <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">

        <!-- ══ TAB 1: XUẤT DỮ LIỆU ══════════════════════════ -->
        <div id="rp-panel-export" style="flex:1;display:flex;overflow:hidden;">

          <!-- Config panel (left) -->
          <div style="width:300px;flex-shrink:0;background:#1e293b;border-right:1px solid #334155;
            overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;">

            <div style="font-size:0.7rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">
              Cấu hình xuất
            </div>

            <!-- Date range -->
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Từ ngày</label>
              <input type="datetime-local" id="ex-from" value="${yesterday}T00:00"
                style="background:#0f172a;border:1px solid #334155;border-radius:6px;
                color:#e2e8f0;padding:7px 10px;font-size:0.78rem;width:100%;box-sizing:border-box;">
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Đến ngày</label>
              <input type="datetime-local" id="ex-to" value="${today}T23:59"
                style="background:#0f172a;border:1px solid #334155;border-radius:6px;
                color:#e2e8f0;padding:7px 10px;font-size:0.78rem;width:100%;box-sizing:border-box;">
            </div>

            <!-- Interval -->
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Khoảng cách mẫu</label>
              <select id="ex-interval" style="background:#0f172a;border:1px solid #334155;
                border-radius:6px;color:#e2e8f0;padding:7px 10px;font-size:0.78rem;width:100%;">
                <option value="0">Raw (tất cả mẫu)</option>
                <option value="1">Mỗi 1 phút</option>
                <option value="5" selected>Mỗi 5 phút</option>
                <option value="15">Mỗi 15 phút</option>
                <option value="30">Mỗi 30 phút</option>
                <option value="60">Mỗi 1 giờ</option>
              </select>
            </div>

            <!-- Sensor checkboxes -->
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Cảm biến</label>
              ${POINTS.map(p => `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                  font-size:0.78rem;color:#cbd5e1;padding:5px 0;">
                  <input type="checkbox" class="ex-point" data-id="${p.id}" checked
                    style="width:14px;height:14px;accent-color:${p.color};">
                  <span style="color:${p.color};font-weight:600;">${p.label}</span>
                  <span style="color:#475569;font-size:0.7rem;">(${p.unit})</span>
                </label>`).join('')}
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                font-size:0.78rem;color:#cbd5e1;padding:5px 0;">
                <input type="checkbox" id="ex-alerts" checked
                  style="width:14px;height:14px;accent-color:#ef4444;">
                <span style="color:#ef4444;font-weight:600;">Cảnh báo</span>
                <span style="color:#475569;font-size:0.7rem;">(sheet 2)</span>
              </label>
            </div>

            <!-- Buttons -->
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">
              <button id="ex-preview-btn"
                style="padding:9px;background:#1e3a5f;border:1px solid #2563eb;border-radius:6px;
                color:#60a5fa;font-size:0.78rem;font-weight:700;cursor:pointer;">
                👁 Xem trước (30 dòng)
              </button>
              <button id="ex-export-btn"
                style="padding:9px;background:#2563eb;border:none;border-radius:6px;
                color:#fff;font-size:0.78rem;font-weight:700;cursor:pointer;">
                ⬇ Xuất XLSX
              </button>
            </div>

            <!-- Info box -->
            <div id="ex-info" style="font-size:0.7rem;color:#475569;padding:10px;
              background:#0f172a;border-radius:6px;border:1px solid #1e293b;">
              Chọn cảm biến và khoảng thời gian, sau đó nhấn "Xem trước" hoặc "Xuất XLSX".
            </div>
          </div>

          <!-- Preview panel (right) -->
          <div style="flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:16px;">
            <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;flex-shrink:0;">
              <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">
                Biểu đồ xem trước
              </div>
              <div style="position:relative;height:180px;"><canvas id="ex-chart"></canvas></div>
            </div>
            <div style="background:#1e293b;border-radius:10px;border:1px solid #334155;overflow:hidden;flex:1;">
              <div style="padding:12px 16px;border-bottom:1px solid #334155;">
                <span style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;">
                  Xem trước dữ liệu
                </span>
                <span id="ex-row-count" style="margin-left:8px;font-size:0.68rem;color:#475569;"></span>
              </div>
              <div style="overflow:auto;">
                <table id="ex-table" style="width:100%;border-collapse:collapse;font-size:0.72rem;">
                  <thead>
                    <tr style="background:#0f172a;position:sticky;top:0;z-index:1;">
                      <th style="padding:8px 12px;text-align:left;color:#64748b;white-space:nowrap;border-bottom:1px solid #334155;">Thời gian</th>
                      ${POINTS.map(p => `
                        <th style="padding:8px 12px;text-align:right;color:${p.color};white-space:nowrap;border-bottom:1px solid #334155;">
                          ${p.label} (${p.unit})
                        </th>`).join('')}
                    </tr>
                  </thead>
                  <tbody id="ex-tbody">
                    <tr><td colspan="5" style="padding:40px;text-align:center;color:#334155;">
                      Nhấn "Xem trước" để tải dữ liệu
                    </td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ══ TAB 2: BÁO CÁO PHÂN TÍCH ═════════════════════ -->
        <div id="rp-panel-report" style="flex:1;display:none;overflow:hidden;flex-direction:row;">

          <!-- Config panel (left) -->
          <div style="width:300px;flex-shrink:0;background:#1e293b;border-right:1px solid #334155;
            overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;">

            <div style="font-size:0.7rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">
              Cấu hình báo cáo
            </div>

            <!-- Report type -->
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Loại báo cáo</label>
              <div style="display:flex;flex-direction:column;gap:4px;">
                ${[
                  ['daily',   '📅', 'Báo cáo hàng ngày'],
                  ['monthly', '📆', 'Báo cáo hàng tháng'],
                  ['event',   '⚡', 'Báo cáo sự cố'],
                ].map(([val, icon, lbl]) => `
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                    padding:8px 10px;border-radius:6px;border:1px solid ${val === 'daily' ? '#2563eb' : '#334155'};
                    background:${val === 'daily' ? 'rgba(37,99,235,0.1)' : 'transparent'};
                    font-size:0.78rem;color:#cbd5e1;" class="rp-type-label">
                    <input type="radio" name="rp-type" value="${val}" ${val === 'daily' ? 'checked' : ''}
                      style="accent-color:#2563eb;">
                    ${icon} ${lbl}
                  </label>`).join('')}
              </div>
            </div>

            <!-- Date range -->
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Từ ngày</label>
              <input type="date" id="rp-from" value="${yesterday}"
                style="background:#0f172a;border:1px solid #334155;border-radius:6px;
                color:#e2e8f0;padding:7px 10px;font-size:0.78rem;width:100%;box-sizing:border-box;">
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Đến ngày</label>
              <input type="date" id="rp-to" value="${today}"
                style="background:#0f172a;border:1px solid #334155;border-radius:6px;
                color:#e2e8f0;padding:7px 10px;font-size:0.78rem;width:100%;box-sizing:border-box;">
            </div>

            <!-- Content options -->
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:0.75rem;color:#94a3b8;font-weight:600;">Nội dung</label>
              ${[
                ['rp-chk-stats',   'Thống kê cảnh báo (KPI)'],
                ['rp-chk-trend',   'Biểu đồ xu hướng nhiệt độ'],
                ['rp-chk-alerts',  'Danh sách sự kiện'],
                ['rp-chk-pd',      'Phân tích phóng điện PD'],
                ['rp-chk-sensor',  'Bảng thống kê cảm biến'],
              ].map(([id, lbl]) => `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                  font-size:0.78rem;color:#cbd5e1;padding:3px 0;">
                  <input type="checkbox" id="${id}" checked style="accent-color:#2563eb;">
                  ${lbl}
                </label>`).join('')}
            </div>

            <!-- Actions -->
            <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">
              <button id="rp-generate-btn"
                style="padding:10px;background:#2563eb;border:none;border-radius:6px;
                color:#fff;font-size:0.8rem;font-weight:700;cursor:pointer;">
                ⚙ Tạo báo cáo
              </button>
              <button id="rp-dl-server-btn" disabled
                style="padding:9px;background:#1e3a5f;border:1px solid #334155;border-radius:6px;
                color:#94a3b8;font-size:0.78rem;font-weight:700;cursor:not-allowed;opacity:.5;">
                ☁ Tải PDF (từ server)
              </button>
              <button id="rp-dl-browser-btn" disabled
                style="padding:9px;background:#1e3a5f;border:1px solid #334155;border-radius:6px;
                color:#94a3b8;font-size:0.78rem;font-weight:700;cursor:not-allowed;opacity:.5;">
                🖨 In / Lưu PDF (trình duyệt)
              </button>
            </div>

            <!-- Report history -->
            <div style="border-top:1px solid #334155;padding-top:14px;">
              <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">
                Lịch sử báo cáo
              </div>
              <div id="rp-history" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;">
                <div style="font-size:0.72rem;color:#334155;">Đang tải...</div>
              </div>
            </div>
          </div>

          <!-- Preview panel (right) -->
          <div style="flex:1;overflow:auto;padding:20px;background:#0f172a;">
            <div id="rp-preview" style="min-height:300px;display:flex;align-items:center;
              justify-content:center;flex-direction:column;gap:12px;">
              <span style="font-size:3rem;opacity:.15;">📄</span>
              <span style="color:#334155;font-size:0.85rem;">Nhấn "Tạo báo cáo" để xem trước</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    // Load station + alerts
    try {
      const [stations, alerts] = await Promise.all([
        stationApi.getStations(),
        stationApi.getAlerts(undefined, 500),
      ]);
      this.stationId = stations[0]?.id ?? '';
      this.alerts    = alerts;
    } catch { /* ignore if backend offline */ }

    this.bindTabs();
    this.bindExport();
    this.bindReport();
    await this.loadReportHistory();
  }

  destroy(): void {
    this.previewChart?.destroy();
    this.previewChart = null;
    this.inlineChart?.destroy();
    this.inlineChart = null;
  }

  // ── Tab switching ─────────────────────────────────────────
  private bindTabs(): void {
    document.querySelectorAll('.rp-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab as 'export' | 'report';
        this.switchTab(tab);
      });
    });
  }

  private switchTab(tab: 'export' | 'report'): void {
    const isExport = tab === 'export';

    document.querySelectorAll('.rp-tab').forEach(b => {
      const el = b as HTMLElement;
      const active = el.dataset.tab === tab;
      el.style.borderBottom = active ? '2px solid #2563eb' : '2px solid transparent';
      el.style.color = active ? '#e2e8f0' : '#64748b';
    });

    const panelExport = document.getElementById('rp-panel-export')!;
    const panelReport = document.getElementById('rp-panel-report')!;
    panelExport.style.display = isExport ? 'flex' : 'none';
    panelReport.style.display = isExport ? 'none' : 'flex';
  }

  // ════════════════════════════════════════════════════════════
  // TAB 1 — XUẤT DỮ LIỆU
  // ════════════════════════════════════════════════════════════

  private bindExport(): void {
    document.getElementById('ex-preview-btn')?.addEventListener('click', () => this.loadPreview());
    document.getElementById('ex-export-btn')?.addEventListener('click', () => this.exportXlsx());
  }

  private getSelectedPoints(): string[] {
    return POINTS
      .filter(p => (document.querySelector(`.ex-point[data-id="${p.id}"]`) as HTMLInputElement)?.checked)
      .map(p => p.id);
  }

  private async loadPreview(): Promise<void> {
    if (!this.stationId) {
      this.setInfo('Chưa kết nối backend', 'error');
      return;
    }
    const from  = (document.getElementById('ex-from') as HTMLInputElement).value;
    const to    = (document.getElementById('ex-to')   as HTMLInputElement).value;
    const intv  = (document.getElementById('ex-interval') as HTMLSelectElement).value;
    const points = this.getSelectedPoints();

    if (!points.length) { this.setInfo('Chọn ít nhất 1 cảm biến', 'error'); return; }
    if (!from || !to)   { this.setInfo('Chọn đầy đủ ngày', 'error'); return; }

    const previewBtn = document.getElementById('ex-preview-btn') as HTMLButtonElement;
    previewBtn.disabled = true;
    previewBtn.textContent = '⏳ Đang tải...';
    this.setInfo('Đang tải dữ liệu...', 'info');

    try {
      const raw = await stationApi.getHistoryBulk(
        this.stationId, from, to, Number(intv), points
      );


      const pivoted = this.pivot(raw);
      this.renderPreviewTable(pivoted.slice(0, 30));
      this.renderPreviewChart(raw, points);

      const rowCount = document.getElementById('ex-row-count');
      if (rowCount) rowCount.textContent = `(${pivoted.length} dòng, hiển thị 30)`;
      this.setInfo(`Tổng ${pivoted.length} dòng · ${points.length} cảm biến · khoảng ${intv === '0' ? 'raw' : intv + ' phút'}`, 'ok');
    } catch (err) {
      this.setInfo(`Lỗi: ${err}`, 'error');
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = '👁 Xem trước (30 dòng)';
    }
  }

  private pivot(raw: Array<{ pointId: string; time: string; value: number }>):
    Array<Record<string, string | number | null>> {
    const map = new Map<string, Record<string, string | number | null>>();
    raw.forEach(r => {
      const key = r.time;
      if (!map.has(key)) {
        map.set(key, { time: r.time });
        POINTS.forEach(p => map.get(key)![p.id] = null);
      }
      map.get(key)![r.pointId] = r.value;
    });
    return Array.from(map.values()).sort((a, b) =>
      new Date(a.time as string).getTime() - new Date(b.time as string).getTime()
    );
  }

  private renderPreviewTable(rows: Array<Record<string, string | number | null>>): void {
    const tbody = document.getElementById('ex-tbody')!;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:#334155;">Không có dữ liệu trong khoảng thời gian này</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((row, i) => {
      const bg = i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent';
      const timeStr = new Date(row.time as string).toLocaleString('vi-VN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      return `<tr style="background:${bg};">
        <td style="padding:6px 12px;color:#94a3b8;white-space:nowrap;border-bottom:1px solid #1e293b;">${timeStr}</td>
        ${POINTS.map(p => {
          const v = row[p.id];
          const txt = v !== null && v !== undefined ? (v as number).toFixed(1) : '—';
          return `<td style="padding:6px 12px;text-align:right;color:${v !== null ? p.color : '#334155'};border-bottom:1px solid #1e293b;">${txt}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
  }

  private renderPreviewChart(raw: Array<{ pointId: string; time: string; value: number }>, selectedPoints: string[]): void {
    this.previewChart?.destroy();
    this.previewChart = null;
    const canvas = document.getElementById('ex-chart') as HTMLCanvasElement;
    if (!canvas) return;

    const datasets = POINTS.filter(p => selectedPoints.includes(p.id)).map(p => {
      const pts = raw.filter(r => r.pointId === p.id)
        .map(r => ({ x: new Date(r.time).getTime(), y: r.value }));
      return {
        label: `${p.label} (${p.unit})`,
        data: pts,
        borderColor: p.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3,
      };
    });

    // Temp and PD have different units — use dual axis
    const hasPd = selectedPoints.includes('phong_dien');
    const hasTemp = selectedPoints.some(id => id.startsWith('nhiet_do'));

    this.previewChart = new Chart(canvas.getContext('2d')!, {
      type: 'line',
      data: { datasets: datasets.map(ds => ({
        ...ds,
        yAxisID: ds.label.includes('dB') ? 'yPd' : 'yTemp',
      })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { type: 'time', time: { tooltipFormat: 'dd/MM HH:mm' },
            ticks: { color: '#64748b', maxTicksLimit: 8 },
            grid: { color: 'rgba(51,65,85,0.3)' } },
          yTemp: {
            display: hasTemp, position: 'left',
            ticks: { color: '#3b82f6' }, grid: { color: 'rgba(51,65,85,0.3)' },
            title: { display: hasTemp, text: '°C', color: '#64748b', font: { size: 10 } },
          },
          yPd: {
            display: hasPd, position: 'right',
            ticks: { color: '#a855f7' }, grid: { display: false },
            title: { display: hasPd, text: 'dB', color: '#64748b', font: { size: 10 } },
          },
        },
      } as any,
    });
  }

  private setInfo(msg: string, type: 'info' | 'ok' | 'error'): void {
    const el = document.getElementById('ex-info');
    if (!el) return;
    const colors = { info: '#64748b', ok: '#10b981', error: '#ef4444' };
    el.style.color = colors[type];
    el.textContent = msg;
  }

  // ── XLSX Export ──────────────────────────────────────────
  private async exportXlsx(): Promise<void> {
    if (this.isExporting) return;
    this.isExporting = true;
    const btn = document.getElementById('ex-export-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '⏳ Đang xuất...';

    try {
      if (!this.stationId) throw new Error('Chưa kết nối backend');

      const from   = (document.getElementById('ex-from') as HTMLInputElement).value;
      const to     = (document.getElementById('ex-to') as HTMLInputElement).value;
      const intv   = (document.getElementById('ex-interval') as HTMLSelectElement).value;
      const points = this.getSelectedPoints();
      const inclAlerts = (document.getElementById('ex-alerts') as HTMLInputElement)?.checked;

      if (!points.length) throw new Error('Chọn ít nhất 1 cảm biến');

      // Load all data (may be larger than preview)
      const raw = await stationApi.getHistoryBulk(
        this.stationId, from, to, Number(intv), points
      );
      const pivoted = this.pivot(raw);

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Dữ liệu cảm biến ─────────────────────
      const fmtTime = (t: string) =>
        new Date(t).toLocaleString('vi-VN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });

      const selectedPointDefs = POINTS.filter(p => points.includes(p.id));
      const headers = ['Thời gian', ...selectedPointDefs.map(p => `${p.label} (${p.unit})`)];
      const dataRows = pivoted.map(row => [
        fmtTime(row.time as string),
        ...selectedPointDefs.map(p => {
          const v = row[p.id];
          return v !== null && v !== undefined ? Number((v as number).toFixed(2)) : '';
        }),
      ]);

      const ws1 = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

      // Column widths
      ws1['!cols'] = [{ wch: 22 }, ...selectedPointDefs.map(() => ({ wch: 18 }))];

      // Meta info in top rows (insert before data)
      XLSX.utils.sheet_add_aoa(ws1, [
        [`STATION MONITOR — Dữ liệu cảm biến`],
        [`Khoảng thời gian: ${fmtTime(from)} → ${fmtTime(to)}`],
        [`Khoảng cách mẫu: ${intv === '0' ? 'Raw' : intv + ' phút'}`],
        [`Tổng số dòng: ${pivoted.length}`],
        [],
      ], { origin: 'A1' });

      XLSX.utils.book_append_sheet(wb, ws1, 'Dữ liệu cảm biến');

      // ── Sheet 2: Thống kê tóm tắt ─────────────────────
      const summaryRows: (string | number)[][] = [
        ['THỐNG KÊ TÓM TẮT'],
        [],
        ['Cảm biến', 'Giá trị nhỏ nhất', 'Giá trị lớn nhất', 'Trung bình', 'Số mẫu'],
      ];
      selectedPointDefs.forEach(p => {
        const vals = raw.filter(r => r.pointId === p.id).map(r => r.value);
        if (!vals.length) return;
        summaryRows.push([
          `${p.label} (${p.unit})`,
          Number(Math.min(...vals).toFixed(2)),
          Number(Math.max(...vals).toFixed(2)),
          Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)),
          vals.length,
        ]);
      });
      const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
      ws2['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Thống kê');

      // ── Sheet 3: Cảnh báo (nếu chọn) ──────────────────
      if (inclAlerts && this.alerts.length) {
        const fromMs = new Date(from).getTime();
        const toMs   = new Date(to).getTime();
        const filtered = this.alerts.filter(a => {
          const t = new Date(a.triggeredAt).getTime();
          return t >= fromMs && t <= toMs;
        });

        const alertHeaders = ['Thời gian', 'Mô tả', 'Cấp độ', 'Trạng thái', 'Xử lý lúc'];
        const alertRows = filtered.map(a => [
          fmtTime(a.triggeredAt),
          a.message,
          a.level.toUpperCase(),
          a.status,
          a.closedAt ? fmtTime(a.closedAt) : '',
        ]);
        const ws3 = XLSX.utils.aoa_to_sheet([alertHeaders, ...alertRows]);
        ws3['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'Cảnh báo');
      }

      // ── Download ───────────────────────────────────────
      const fromDate = from.split('T')[0]?.replace(/-/g, '') ?? '';
      const toDate   = to.split('T')[0]?.replace(/-/g, '') ?? '';
      XLSX.writeFile(wb, `SensorData_${fromDate}-${toDate}.xlsx`);
    } catch (err) {
      this.setInfo(`Lỗi xuất XLSX: ${err}`, 'error');
    } finally {
      this.isExporting = false;
      btn.disabled = false;
      btn.textContent = '⬇ Xuất XLSX';
    }
  }

  // ════════════════════════════════════════════════════════════
  // TAB 2 — BÁO CÁO PHÂN TÍCH
  // ════════════════════════════════════════════════════════════

  private bindReport(): void {
    // Report type radio → update date range automatically
    document.querySelectorAll('input[name="rp-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const type = (document.querySelector('input[name="rp-type"]:checked') as HTMLInputElement)?.value;
        this.autoSetDateRange(type as ReportType);
        // Update label styles
        document.querySelectorAll('.rp-type-label').forEach(lbl => {
          const inp = lbl.querySelector('input') as HTMLInputElement;
          const active = inp.checked;
          (lbl as HTMLElement).style.borderColor = active ? '#2563eb' : '#334155';
          (lbl as HTMLElement).style.background = active ? 'rgba(37,99,235,0.1)' : 'transparent';
        });
      });
    });

    document.getElementById('rp-generate-btn')?.addEventListener('click', () => this.generateReport());
    document.getElementById('rp-dl-server-btn')?.addEventListener('click', () => this.downloadFromServer());
    document.getElementById('rp-dl-browser-btn')?.addEventListener('click', () => this.printReport());
  }

  private autoSetDateRange(type: ReportType): void {
    const today = new Date();
    const isoDate = (d: Date) => d.toISOString().split('T')[0]!;
    const fromEl = document.getElementById('rp-from') as HTMLInputElement;
    const toEl   = document.getElementById('rp-to') as HTMLInputElement;
    toEl.value = isoDate(today);
    if (type === 'daily') {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      fromEl.value = isoDate(d);
    } else if (type === 'monthly') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1);
      fromEl.value = isoDate(d);
    }
    // event: keep current selection
  }

  private currentReportId = '';

  private async generateReport(): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const btn = document.getElementById('rp-generate-btn') as HTMLButtonElement;
    const preview = document.getElementById('rp-preview')!;
    btn.disabled = true;
    btn.textContent = '⏳ Đang tạo...';

    // Destroy inline chart trước khi xóa DOM
    this.inlineChart?.destroy();
    this.inlineChart = null;

    preview.innerHTML = `
      <div style="text-align:center;padding:60px;">
        <div style="font-size:2rem;margin-bottom:12px;">⏳</div>
        <div style="color:#64748b;font-size:0.85rem;">Đang tổng hợp dữ liệu và tạo báo cáo...</div>
      </div>`;

    try {
      const type = (document.querySelector('input[name="rp-type"]:checked') as HTMLInputElement)?.value ?? 'daily';
      const from = (document.getElementById('rp-from') as HTMLInputElement).value;
      const to   = (document.getElementById('rp-to') as HTMLInputElement).value;

      if (!from || !to) throw new Error('Chọn đầy đủ ngày');
      if (new Date(from) > new Date(to)) throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
      if (!this.stationId) throw new Error('Chưa kết nối backend');

      const [histRaw, alertsInRange, report] = await Promise.all([
        stationApi.getHistoryBulk(this.stationId, `${from}T00:00`, `${to}T23:59`, 60),
        stationApi.getAlerts(undefined, 500),
        stationApi.generateReport({
          stationId: this.stationId, type, from: `${from}T00:00:00`, to: `${to}T23:59:59`,
        }),
      ]);

      this.currentReportId = report.id;
      const filteredAlerts = alertsInRange.filter(a => {
        const t = new Date(a.triggeredAt).getTime();
        return t >= new Date(from).getTime() && t <= new Date(`${to}T23:59:59`).getTime();
      });

      // Render HTML preview
      this.lastReportHtml = this.buildReportHtml(type as ReportType, from, to, histRaw, filteredAlerts);
      preview.innerHTML = this.lastReportHtml;

      // Draw inline chart if trend checkbox is checked
      if ((document.getElementById('rp-chk-trend') as HTMLInputElement)?.checked) {
        await this.drawInlineChart(histRaw);
      }

      // Enable download buttons
      this.enableReportBtns();

      // Reload history
      await this.loadReportHistory();
    } catch (err) {
      preview.innerHTML = `
        <div style="text-align:center;padding:40px;">
          <div style="font-size:1.5rem;color:#ef4444;margin-bottom:8px;">❌</div>
          <div style="color:#ef4444;font-size:0.85rem;">Lỗi: ${err}</div>
        </div>`;
    } finally {
      this.isGenerating = false;
      btn.disabled = false;
      btn.textContent = '⚙ Tạo báo cáo';
    }
  }

  private buildReportHtml(
    type: ReportType,
    from: string,
    to: string,
    hist: Array<{ pointId: string; time: string; value: number }>,
    alerts: AlertItem[]
  ): string {
    const fmtDate = (s: string) => new Date(s).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const fmtDt = (s: string) => new Date(s).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });

    const typeLabels: Record<ReportType, string> = {
      daily: 'BÁO CÁO VẬN HÀNH HÀNG NGÀY',
      monthly: 'BÁO CÁO VẬN HÀNH HÀNG THÁNG',
      event: 'BÁO CÁO SỰ CỐ',
    };

    const alarmCount  = alerts.filter(a => a.level === 'alarm').length;
    const warnCount   = alerts.filter(a => a.level === 'warning').length;
    const closedCount = alerts.filter(a => a.status === 'closed').length;

    // Sensor stats
    const sensorStats = POINTS.map(p => {
      const vals = hist.filter(r => r.pointId === p.id).map(r => r.value);
      return {
        ...p,
        min: vals.length ? Math.min(...vals).toFixed(1) : '—',
        max: vals.length ? Math.max(...vals).toFixed(1) : '—',
        avg: vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : '—',
        count: vals.length,
      };
    });

    const showStats  = (document.getElementById('rp-chk-stats')  as HTMLInputElement)?.checked !== false;
    const showTrend  = (document.getElementById('rp-chk-trend')   as HTMLInputElement)?.checked !== false;
    const showAlerts = (document.getElementById('rp-chk-alerts')  as HTMLInputElement)?.checked !== false;
    const showPd     = (document.getElementById('rp-chk-pd')      as HTMLInputElement)?.checked !== false;
    const showSensor = (document.getElementById('rp-chk-sensor')  as HTMLInputElement)?.checked !== false;

    // PD stats
    const pdVals = hist.filter(r => r.pointId === 'phong_dien').map(r => r.value);
    const pdMax = pdVals.length ? Math.max(...pdVals).toFixed(1) : '—';
    const pdAvg = pdVals.length ? (pdVals.reduce((s, v) => s + v, 0) / pdVals.length).toFixed(1) : '—';
    const pdEvCount = alerts.filter(a => a.message?.toLowerCase().includes('phong_dien') || a.message?.toLowerCase().includes('pd')).length;

    return `
    <div id="rp-html-preview" style="background:#fff;color:#111;padding:28px;border-radius:8px;
      font-family:'Segoe UI',Arial,sans-serif;font-size:13px;text-align:left;max-width:900px;margin:0 auto;">

      <!-- Header -->
      <div style="border-bottom:3px solid #1a56db;padding-bottom:14px;margin-bottom:20px;">
        <div style="font-size:20px;font-weight:800;color:#1a56db;">STATION MONITOR ENTERPRISE</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px;text-transform:uppercase;color:#111;">
          ${typeLabels[type]}
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px;">
          Khoảng thời gian: <b>${fmtDate(from)}</b> – <b>${fmtDate(to)}</b>
          &nbsp;|&nbsp; Tạo lúc: ${new Date().toLocaleString('vi-VN')}
        </div>
      </div>

      ${showStats ? `
      <!-- KPI -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        ${[
          { label: 'Tổng cảnh báo',    value: alerts.length, color: '#1a56db' },
          { label: 'Nguy cấp (Alarm)', value: alarmCount,    color: '#e02424' },
          { label: 'Cảnh báo',         value: warnCount,     color: '#d97706' },
          { label: 'Đã xử lý',         value: closedCount,   color: '#059669' },
        ].map(k => `
          <div style="border:1px solid #e5e7eb;border-left:4px solid ${k.color};border-radius:6px;padding:12px;">
            <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;">${k.label}</div>
            <div style="font-size:28px;font-weight:800;color:${k.color};margin-top:4px;">${k.value}</div>
          </div>`).join('')}
      </div>` : ''}

      ${showSensor ? `
      <!-- Sensor stats table -->
      <div style="margin-bottom:20px;">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;
          margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">
          THỐNG KÊ CẢM BIẾN
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb;">Cảm biến</th>
              <th style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">Min</th>
              <th style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">Max</th>
              <th style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">Trung bình</th>
              <th style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">Số mẫu</th>
            </tr>
          </thead>
          <tbody>
            ${sensorStats.map((s, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
              <td style="padding:6px 10px;font-weight:600;color:${s.color};border:1px solid #e5e7eb;">
                ${s.label} (${s.unit})
              </td>
              <td style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">${s.min}</td>
              <td style="padding:6px 10px;text-align:center;font-weight:700;color:#e02424;border:1px solid #e5e7eb;">${s.max}</td>
              <td style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb;">${s.avg}</td>
              <td style="padding:6px 10px;text-align:center;color:#6b7280;border:1px solid #e5e7eb;">${s.count}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${showTrend ? `
      <!-- Biểu đồ xu hướng -->
      <div style="margin-bottom:20px;">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;
          margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">
          BIỂU ĐỒ XU HƯỚNG NHIỆT ĐỘ & PHÓNG ĐIỆN
        </div>
        <div style="position:relative;height:200px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb;">
          <canvas id="rp-inline-chart"></canvas>
        </div>
      </div>` : ''}

      ${showPd ? `
      <!-- PD analysis -->
      <div style="margin-bottom:20px;">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;
          margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">
          PHÂN TÍCH PHÓNG ĐIỆN (PD)
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="border:1px solid #e5e7eb;border-left:4px solid #7e3af2;border-radius:6px;padding:12px;">
            <div style="font-size:10px;color:#6b7280;">PD Max</div>
            <div style="font-size:22px;font-weight:800;color:#7e3af2;">${pdMax} dB</div>
          </div>
          <div style="border:1px solid #e5e7eb;border-left:4px solid #7e3af2;border-radius:6px;padding:12px;">
            <div style="font-size:10px;color:#6b7280;">PD Trung bình</div>
            <div style="font-size:22px;font-weight:800;color:#7e3af2;">${pdAvg} dB</div>
          </div>
          <div style="border:1px solid #e5e7eb;border-left:4px solid #e02424;border-radius:6px;padding:12px;">
            <div style="font-size:10px;color:#6b7280;">Sự kiện PD</div>
            <div style="font-size:22px;font-weight:800;color:#e02424;">${pdEvCount}</div>
          </div>
        </div>
      </div>` : ''}

      ${showAlerts && alerts.length > 0 ? `
      <!-- Alert list -->
      <div style="margin-bottom:20px;">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;
          margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">
          DANH SÁCH CẢNH BÁO (${Math.min(alerts.length, 30)}/${alerts.length})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:5px 8px;text-align:left;border:1px solid #e5e7eb;">Thời gian</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #e5e7eb;">Mô tả</th>
              <th style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;">Cấp độ</th>
              <th style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${[...alerts].sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
              .slice(0, 30).map((a, i) => {
                const isAlm = a.level === 'alarm';
                const lvlColor = isAlm ? '#e02424' : '#d97706';
                const lvlBg    = isAlm ? '#fee2e2' : '#fef3c7';
                return `
                <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
                  <td style="padding:5px 8px;color:#6b7280;white-space:nowrap;border:1px solid #e5e7eb;">${fmtDt(a.triggeredAt)}</td>
                  <td style="padding:5px 8px;border:1px solid #e5e7eb;">${a.message || '—'}</td>
                  <td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;">
                    <span style="background:${lvlBg};color:${lvlColor};padding:2px 8px;border-radius:4px;
                      font-size:10px;font-weight:700;">${a.level.toUpperCase()}</span>
                  </td>
                  <td style="padding:5px 8px;text-align:center;color:#6b7280;border:1px solid #e5e7eb;">${a.status}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>` : showAlerts ? `
      <div style="padding:12px;background:#f0fdf4;border-radius:6px;margin-bottom:20px;color:#059669;font-weight:600;">
        ✓ Không có cảnh báo nào trong kỳ báo cáo.
      </div>` : ''}

      <!-- Footer -->
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;
        font-size:10px;color:#9ca3af;text-align:center;">
        Báo cáo được tạo tự động bởi Station Monitor Enterprise
        — ${new Date().toLocaleString('vi-VN')}
      </div>
    </div>`;
  }

  private async drawInlineChart(
    hist: Array<{ pointId: string; time: string; value: number }>
  ): Promise<void> {
    await new Promise(r => setTimeout(r, 50)); // wait for DOM
    const canvas = document.getElementById('rp-inline-chart') as HTMLCanvasElement;
    if (!canvas) return;

    // Destroy trước nếu canvas đã có chart
    this.inlineChart?.destroy();
    this.inlineChart = null;

    const datasets = POINTS.map(p => ({
      label: `${p.label} (${p.unit})`,
      data: hist.filter(r => r.pointId === p.id)
        .map(r => ({ x: new Date(r.time).getTime(), y: r.value })),
      borderColor: p.color,
      backgroundColor: 'transparent',
      borderWidth: 1.5, pointRadius: 0, tension: 0.3,
      yAxisID: p.id === 'phong_dien' ? 'yPd' : 'yTemp',
    }));

    this.inlineChart = new Chart(canvas.getContext('2d')!, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: '#374151', boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { type: 'time', time: { tooltipFormat: 'dd/MM HH:mm' },
            ticks: { color: '#6b7280', maxTicksLimit: 8 },
            grid: { color: '#f3f4f6' } },
          yTemp: { position: 'left',
            ticks: { color: '#3b82f6' }, grid: { color: '#f3f4f6' },
            title: { display: true, text: '°C', color: '#6b7280', font: { size: 10 } } },
          yPd: { position: 'right',
            ticks: { color: '#a855f7' }, grid: { display: false },
            title: { display: true, text: 'dB', color: '#6b7280', font: { size: 10 } } },
        },
      } as any,
    });
  }

  private enableReportBtns(): void {
    const serverBtn  = document.getElementById('rp-dl-server-btn') as HTMLButtonElement;
    const browserBtn = document.getElementById('rp-dl-browser-btn') as HTMLButtonElement;
    serverBtn.disabled  = false;
    serverBtn.style.opacity = '1';
    serverBtn.style.cursor = 'pointer';
    serverBtn.style.color = '#60a5fa';
    serverBtn.style.borderColor = '#2563eb';
    browserBtn.disabled = false;
    browserBtn.style.opacity = '1';
    browserBtn.style.cursor = 'pointer';
    browserBtn.style.color = '#60a5fa';
    browserBtn.style.borderColor = '#2563eb';
  }

  private async downloadFromServer(): Promise<void> {
    if (!this.currentReportId) return;
    const btn = document.getElementById('rp-dl-server-btn') as HTMLButtonElement;
    btn.textContent = '⏳ Đang tải...';
    btn.disabled = true;
    try {
      const blob = await stationApi.downloadReport(this.currentReportId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `BaoCao_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Lỗi tải PDF: ${err}`);
    } finally {
      btn.textContent = '☁ Tải PDF (từ server)';
      btn.disabled = false;
    }
  }

  private printReport(): void {
    const preview = document.getElementById('rp-html-preview');
    if (!preview) { alert('Tạo báo cáo trước'); return; }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Báo cáo Station Monitor</title>
      <style>
        body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>${preview.outerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  // ── Report history ───────────────────────────────────────
  private async loadReportHistory(): Promise<void> {
    const container = document.getElementById('rp-history');
    if (!container) return;
    try {
      const reports = await stationApi.getReports(this.stationId || undefined);

      if (!reports.length) {
        container.innerHTML = `<div style="font-size:0.72rem;color:#334155;">Chưa có báo cáo nào</div>`;
        return;
      }

      const typeLabels: Record<string, string> = {
        daily: 'Hàng ngày', monthly: 'Hàng tháng', event: 'Sự cố',
      };
      const typeColors: Record<string, string> = {
        daily: '#2563eb', monthly: '#10b981', event: '#f59e0b',
      };

      container.innerHTML = reports.slice(0, 20).map(r => {
        const from = r.periodFrom ? new Date(r.periodFrom).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
        const to   = r.periodTo   ? new Date(r.periodTo).toLocaleDateString('vi-VN',   { day: '2-digit', month: '2-digit' }) : '';
        const color = typeColors[r.type] ?? '#64748b';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:7px 8px;
            background:#0f172a;border-radius:6px;border:1px solid #1e293b;">
            <span style="font-size:0.62rem;padding:2px 6px;border-radius:3px;
              background:${color}22;color:${color};font-weight:700;white-space:nowrap;">
              ${typeLabels[r.type] ?? r.type}
            </span>
            <span style="flex:1;font-size:0.7rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${from}${to && to !== from ? ' – ' + to : ''}
            </span>
            ${r.fileUrl ? `
              <button class="rp-hist-dl" data-id="${r.id}"
                style="padding:2px 7px;background:#1e3a5f;border:1px solid #2563eb;border-radius:3px;
                color:#60a5fa;font-size:0.65rem;cursor:pointer;white-space:nowrap;">
                ⬇
              </button>` : ''}
            <button class="rp-hist-del" data-id="${r.id}"
              style="padding:2px 7px;background:transparent;border:1px solid #334155;border-radius:3px;
              color:#64748b;font-size:0.65rem;cursor:pointer;">
              ✕
            </button>
          </div>`;
      }).join('');

      // Download buttons
      container.querySelectorAll('.rp-hist-dl').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!;
          try {
            const blob = await stationApi.downloadReport(id);
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = `BaoCao_${id.slice(0, 8)}.pdf`; a.click();
            URL.revokeObjectURL(url);
          } catch (err) { alert(`Lỗi: ${err}`); }
        });
      });

      // Delete buttons
      container.querySelectorAll('.rp-hist-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!;
          const ok = await confirmDialog({ title: 'Xóa báo cáo', message: 'Xóa báo cáo này?', danger: true });
          if (!ok) return;
          await stationApi.deleteReport(id).catch(() => {});
          await this.loadReportHistory();
        });
      });
    } catch {
      container.innerHTML = `<div style="font-size:0.72rem;color:#334155;">Lỗi tải lịch sử</div>`;
    }
  }
}
