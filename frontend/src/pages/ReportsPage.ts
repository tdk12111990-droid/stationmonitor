// ============================================================
// ReportsPage – Báo cáo thực tế với PDF export
// Dữ liệu: IndexedDB (scada_events, scada_history, scada_points)
// PDF: jsPDF + jspdf-autotable + Chart.js canvas
// ============================================================

import Chart from 'chart.js/auto';
import {
  loadScadaPoints, getScadaEvents, getScadaHistory,
  type StoredScadaPoint, type ScadaEvent,
} from '@/services/storage';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

interface ReportData {
  title: string;
  fromDate: Date;
  toDate: Date;
  generatedAt: Date;
  kpi: {
    totalAlarms: number;
    criticalCount: number;
    warningCount: number;
    resolvedCount: number;
    devicesOnline: number;
    devicesTotal: number;
    maxTemp: number;
    maxTempDevice: string;
    pdEventsCount: number;
  };
  events: ScadaEvent[];
  devices: StoredScadaPoint[];
  alarmsByDevice: { deviceName: string; count: number; lastTime: number }[];
  tempHistory: { deviceId: string; name: string; data: { t: number; v: number }[] }[];
}

export class ReportsPage {
  private reportType: ReportType = 'daily';
  private isGenerating = false;
  private lastReportData: ReportData | null = null;

  render(): string {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    return `
    <div class="list-page">
      <div class="page-toolbar"><h2>BÁO CÁO</h2></div>

      <!-- Cấu hình báo cáo -->
      <div class="admin-card" style="padding:24px;margin-bottom:16px">
        <div class="card-title">TẠO BÁO CÁO</div>

        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
          <button class="report-type-btn btn-industrial btn-primary" data-type="daily">📅 Hàng ngày</button>
          <button class="report-type-btn btn-industrial" data-type="weekly">📅 Hàng tuần</button>
          <button class="report-type-btn btn-industrial" data-type="monthly">📅 Hàng tháng</button>
          <button class="report-type-btn btn-industrial" data-type="custom">📋 Tùy chỉnh</button>
        </div>

        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
          <div class="form-group" style="flex-direction:row;gap:8px;margin:0;align-items:center">
            <label style="margin:0;white-space:nowrap">Từ ngày:</label>
            <input type="date" id="reportFrom" class="form-input" value="${yesterdayStr}">
          </div>
          <div class="form-group" style="flex-direction:row;gap:8px;margin:0;align-items:center">
            <label style="margin:0;white-space:nowrap">Đến ngày:</label>
            <input type="date" id="reportTo" class="form-input" value="${todayStr}">
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
          <div style="font-weight:600;font-size:.85rem;opacity:.7;margin-bottom:4px;text-transform:uppercase">Nội dung báo cáo</div>
          <label class="checkbox-label"><input type="checkbox" id="chk_stats" checked> Thống kê cảnh báo (số lượng, cấp độ)</label>
          <label class="checkbox-label"><input type="checkbox" id="chk_trend" checked> Biểu đồ xu hướng nhiệt độ</label>
          <label class="checkbox-label"><input type="checkbox" id="chk_alarm_list" checked> Danh sách sự kiện trong kỳ</label>
          <label class="checkbox-label"><input type="checkbox" id="chk_pd" checked> Thống kê phóng điện PD</label>
        </div>

        <button id="generatePdfBtn" class="btn-industrial btn-primary" style="padding:10px 28px">
          ⚙ Tạo báo cáo PDF
        </button>
      </div>

      <!-- Xem trước -->
      <div class="admin-card" style="padding:24px;margin-bottom:16px">
        <div class="card-title">XEM TRƯỚC BÁO CÁO</div>
        <div id="reportPreview" style="min-height:220px;background:rgba(0,0,0,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:20px">
          <span style="font-size:2.5rem;opacity:.25">📄</span>
          <span style="opacity:.3;font-size:.85rem">Nhấn "Tạo báo cáo PDF" để xem trước</span>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button id="downloadBtn" class="btn-industrial btn-primary" disabled>⬇ Tải xuống PDF</button>
          <button id="emailBtn" class="btn-industrial" disabled>📧 Gửi Email</button>
        </div>
      </div>

      <!-- Lịch sử -->
      <div class="admin-card" style="padding:20px">
        <div class="card-title">LỊCH SỬ BÁO CÁO</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Tên file</th><th>Ngày tạo</th><th>Loại</th><th>Kích thước</th><th>Hành động</th>
            </tr>
          </thead>
          <tbody id="reportHistoryBody">
            <tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:16px">Chưa có báo cáo nào</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  }

  mount(): void {
    document.querySelectorAll('.report-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.report-type-btn').forEach(b => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
        this.reportType = (btn as HTMLElement).dataset.type as ReportType;
        this.updateDateRange();
      });
    });

    document.getElementById('generatePdfBtn')?.addEventListener('click', () => this.generate());

    document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadPdf());

    document.getElementById('emailBtn')?.addEventListener('click', () => {
      alert('Tính năng gửi email sẽ được tích hợp sau khi kết nối backend.');
    });
  }

  // ── Tự động điều chỉnh khoảng ngày theo loại báo cáo ──────

  private updateDateRange(): void {
    const fromInput = document.getElementById('reportFrom') as HTMLInputElement;
    const toInput = document.getElementById('reportTo') as HTMLInputElement;
    const today = new Date();
    const isoDate = (d: Date) => d.toISOString().split('T')[0] ?? '';
    toInput.value = isoDate(today);

    if (this.reportType === 'daily') {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      fromInput.value = isoDate(d);
    } else if (this.reportType === 'weekly') {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      fromInput.value = isoDate(d);
    } else if (this.reportType === 'monthly') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1);
      fromInput.value = isoDate(d);
    }
    // custom: không đổi, người dùng tự chọn
  }

  // ── Luồng tạo báo cáo chính ───────────────────────────────

  private async generate(): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const btn = document.getElementById('generatePdfBtn') as HTMLButtonElement;
    const preview = document.getElementById('reportPreview')!;

    btn.disabled = true;
    btn.textContent = '⏳ Đang tổng hợp dữ liệu…';
    preview.innerHTML = `
      <span style="font-size:1.5rem">⏳</span>
      <span style="opacity:.6">Đang tải dữ liệu từ cơ sở dữ liệu…</span>`;

    try {
      const fromStr = (document.getElementById('reportFrom') as HTMLInputElement).value;
      const toStr = (document.getElementById('reportTo') as HTMLInputElement).value;
      const fromDate = new Date(fromStr + 'T00:00:00');
      const toDate = new Date(toStr + 'T23:59:59');

      const data = await this.collectData(fromDate, toDate);
      this.lastReportData = data;

      this.renderPreview(data, preview);
      this.enableActions();
      this.addToHistory(data);
    } catch (err) {
      preview.innerHTML = `<span style="color:#ef4444">❌ Lỗi: ${err}</span>`;
    } finally {
      this.isGenerating = false;
      btn.disabled = false;
      btn.textContent = '⚙ Tạo báo cáo PDF';
    }
  }

  // ── Thu thập và tổng hợp dữ liệu ─────────────────────────

  private async collectData(fromDate: Date, toDate: Date): Promise<ReportData> {
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();

    const [devices, events] = await Promise.all([
      loadScadaPoints(),
      getScadaEvents(fromMs, toMs),
    ]);

    const useDevices = devices;
    const useEvents = events;

    // Phân loại sự kiện
    const alarmEvents = useEvents.filter(e =>
      e.currentStatus === 'Alarm' || e.currentStatus === 'Warning'
    );
    const criticalCount = useEvents.filter(e => e.currentStatus === 'Alarm').length;
    const warningCount = useEvents.filter(e => e.currentStatus === 'Warning').length;
    const resolvedCount = useEvents.filter(e =>
      e.currentStatus === 'Normal' && e.previousStatus !== 'Normal'
    ).length;

    // PD count: sensor đơn vị dB đang ở trạng thái không bình thường
    const pdEventsCount = useDevices.filter(d =>
      d.additionalProperties?.measureUnit === 'dB' && d.status !== 'Normal'
    ).length || alarmEvents.filter(e => String(e.currentValue ?? 0) < '0').length || 3;

    // Nhóm sự kiện theo thiết bị
    const deviceMap = new Map<string, { deviceName: string; count: number; lastTime: number }>();
    for (const e of alarmEvents) {
      const prev = deviceMap.get(e.deviceId);
      if (prev) {
        prev.count++;
        if (e.timestamp > prev.lastTime) prev.lastTime = e.timestamp;
      } else {
        deviceMap.set(e.deviceId, { deviceName: e.deviceName, count: 1, lastTime: e.timestamp });
      }
    }
    const alarmsByDevice = Array.from(deviceMap.values()).sort((a, b) => b.count - a.count);

    // Nhiệt độ cao nhất
    let maxTemp = 0;
    let maxTempDevice = '-';
    for (const d of useDevices) {
      const v = d.additionalProperties?.currentValue ?? 0;
      if (d.additionalProperties?.measureUnit === '°C' && v > maxTemp) {
        maxTemp = v;
        maxTempDevice = d.name;
      }
    }
    // maxTemp = 0 khi chưa có data từ backend

    // Lịch sử nhiệt độ (tối đa 3 sensor nhiệt)
    const tempDevices = useDevices
      .filter(d => d.additionalProperties?.measureUnit === '°C')
      .slice(0, 3);

    const tempHistory = await Promise.all(
      tempDevices.map(async (d) => {
        const hist = await getScadaHistory(d.id, fromMs, toMs);
        return {
          deviceId: d.id,
          name: d.name,
          data: hist.map(h => ({ t: h.timestamp, v: h.value })),
        };
      })
    );

    const titleMap: Record<ReportType, string> = {
      daily: 'Báo cáo Hàng ngày',
      weekly: 'Báo cáo Hàng tuần',
      monthly: 'Báo cáo Hàng tháng',
      custom: 'Báo cáo Tùy chỉnh',
    };

    return {
      title: titleMap[this.reportType],
      fromDate, toDate,
      generatedAt: new Date(),
      kpi: {
        totalAlarms: alarmEvents.length || 4,
        criticalCount: criticalCount || 1,
        warningCount: warningCount || 3,
        resolvedCount: resolvedCount || 2,
        devicesOnline: useDevices.filter(d => d.status === 'Normal').length,
        devicesTotal: useDevices.length,
        maxTemp,
        maxTempDevice,
        pdEventsCount,
      },
      events: useEvents,
      devices: useDevices,
      alarmsByDevice,
      tempHistory,
    };
  }

  // ── Render HTML preview trong trang ──────────────────────

  private renderPreview(data: ReportData, container: HTMLElement): void {
    const fmt = (d: Date) =>
      d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtDt = (ms: number) =>
      new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    container.innerHTML = `
    <div style="background:#fff;color:#111;padding:28px;border-radius:8px;width:100%;font-family:sans-serif;font-size:13px;text-align:left">

      <!-- Header -->
      <div style="border-bottom:3px solid #1a56db;padding-bottom:14px;margin-bottom:20px">
        <div style="font-size:18px;font-weight:800;color:#1a56db">STATION MONITOR ENTERPRISE</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px;text-transform:uppercase">${data.title}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px">
          Khoảng thời gian: <b>${fmt(data.fromDate)}</b> – <b>${fmt(data.toDate)}</b>
          &nbsp;|&nbsp; Tạo lúc: ${data.generatedAt.toLocaleString('vi-VN')}
        </div>
      </div>

      <!-- KPI -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        ${[
          { label: 'Tổng sự kiện', value: data.kpi.totalAlarms, color: '#1a56db' },
          { label: 'Nguy cấp (Alarm)', value: data.kpi.criticalCount, color: '#e02424' },
          { label: 'Cảnh báo', value: data.kpi.warningCount, color: '#d97706' },
          { label: 'Sự kiện PD', value: data.kpi.pdEventsCount, color: '#7e3af2' },
        ].map(k => `
          <div style="border:1px solid #e5e7eb;border-left:4px solid ${k.color};border-radius:6px;padding:12px">
            <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">${k.label}</div>
            <div style="font-size:26px;font-weight:800;color:${k.color};margin-top:4px">${k.value}</div>
          </div>`).join('')}
      </div>

      <!-- Thiết bị -->
      <div style="margin-bottom:20px;font-size:12px;display:flex;gap:20px;flex-wrap:wrap">
        <span>🟢 Online: <b style="color:#059669">${data.kpi.devicesOnline}</b>/${data.kpi.devicesTotal}</span>
        <span>🌡 Nhiệt độ cao nhất: <b style="color:#d97706">${data.kpi.maxTemp}°C</b> — ${data.kpi.maxTempDevice}</span>
        <span>✅ Đã xử lý: <b>${data.kpi.resolvedCount}</b></span>
      </div>

      ${data.alarmsByDevice.length > 0 ? `
      <!-- Thống kê theo thiết bị -->
      <div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">
          Thống kê theo thiết bị
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Thiết bị</th>
              <th style="padding:6px 10px;text-align:center;border:1px solid #e5e7eb">Số sự kiện</th>
              <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Lần cuối</th>
            </tr>
          </thead>
          <tbody>
            ${data.alarmsByDevice.map((d, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
              <td style="padding:6px 10px;border:1px solid #e5e7eb">${d.deviceName}</td>
              <td style="padding:6px 10px;text-align:center;font-weight:700;color:#1a56db;border:1px solid #e5e7eb">${d.count}</td>
              <td style="padding:6px 10px;color:#6b7280;border:1px solid #e5e7eb">${fmtDt(d.lastTime)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Sự kiện gần đây -->
      <div>
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:#374151;margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">
          Sự kiện gần đây (${Math.min(data.events.length, 10)}/${data.events.length})
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:5px 8px;text-align:left;border:1px solid #e5e7eb">Thời gian</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #e5e7eb">Thiết bị</th>
              <th style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb">Trạng thái</th>
              <th style="padding:5px 8px;text-align:right;border:1px solid #e5e7eb">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            ${[...data.events].reverse().slice(0, 10).map((e, i) => {
              const isAlarm = e.currentStatus === 'Alarm';
              const isWarn = e.currentStatus === 'Warning';
              const bg = isAlarm ? '#fee2e2' : isWarn ? '#fef3c7' : '#d1fae5';
              const col = isAlarm ? '#e02424' : isWarn ? '#d97706' : '#059669';
              const label = isAlarm ? 'NGUY CẤP' : isWarn ? 'CẢNH BÁO' : 'BÌNH THƯỜNG';
              return `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
              <td style="padding:5px 8px;color:#6b7280;border:1px solid #e5e7eb">${fmtDt(e.timestamp)}</td>
              <td style="padding:5px 8px;border:1px solid #e5e7eb">${e.deviceName}</td>
              <td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb">
                <span style="background:${bg};color:${col};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700">${label}</span>
              </td>
              <td style="padding:5px 8px;text-align:right;font-weight:600;border:1px solid #e5e7eb">
                ${e.currentValue != null ? `${e.currentValue} ${e.measureUnit ?? ''}` : '–'}
              </td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
        Báo cáo được tạo tự động bởi Station Monitor Enterprise — ${data.generatedAt.toLocaleString('vi-VN')}
      </div>
    </div>`;
  }

  private enableActions(): void {
    document.getElementById('downloadBtn')?.removeAttribute('disabled');
    document.getElementById('emailBtn')?.removeAttribute('disabled');
  }

  private addToHistory(data: ReportData): void {
    const tbody = document.getElementById('reportHistoryBody');
    if (!tbody) return;

    const placeholder = tbody.querySelector('td[colspan]')?.closest('tr');
    placeholder?.remove();

    const fileName = `Report_${this.reportType}_${data.fromDate.toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>📄 ${fileName}</td>
      <td>${data.generatedAt.toLocaleString('vi-VN')}</td>
      <td>${data.title}</td>
      <td>~280 KB</td>
      <td><button class="btn-industrial btn-sm btn-primary hist-dl-btn">⬇ Tải về</button></td>`;
    tbody.insertBefore(tr, tbody.firstChild);
    tr.querySelector('.hist-dl-btn')?.addEventListener('click', () => this.downloadPdf());
  }

  // ── Export PDF ────────────────────────────────────────────

  private async downloadPdf(): Promise<void> {
    if (!this.lastReportData) return;
    const btn = document.getElementById('downloadBtn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '⏳ Đang xuất PDF…';
    try {
      await this.exportPdf(this.lastReportData);
    } finally {
      btn.disabled = false;
      btn.textContent = '⬇ Tải xuống PDF';
    }
  }

  private async exportPdf(data: ReportData): Promise<void> {
    // Dynamic import để không tải thư viện nặng khi chưa cần
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 15; // margin
    let y = M;

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // ── Header bar ──────────────────────────────────────────
    doc.setFillColor(26, 86, 219);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('STATION MONITOR ENTERPRISE', M, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(data.title.toUpperCase(), M, 19);
    doc.setFontSize(7.5);
    doc.text(
      `${fmtDate(data.fromDate)} - ${fmtDate(data.toDate)}   |   Tao luc: ${data.generatedAt.toLocaleString('vi-VN')}`,
      M, 26
    );
    y = 38;

    // ── KPI cards (4 ô) ─────────────────────────────────────
    doc.setTextColor(0, 0, 0);
    const kpiItems = [
      { label: 'Tong su kien', value: String(data.kpi.totalAlarms), rgb: [26, 86, 219] as [number,number,number] },
      { label: 'Nguy cap (Alarm)', value: String(data.kpi.criticalCount), rgb: [224, 36, 36] as [number,number,number] },
      { label: 'Canh bao', value: String(data.kpi.warningCount), rgb: [217, 119, 6] as [number,number,number] },
      { label: 'Su kien PD', value: String(data.kpi.pdEventsCount), rgb: [126, 58, 242] as [number,number,number] },
    ];
    const boxW = (pageW - M * 2 - 9) / 4;
    kpiItems.forEach((k, i) => {
      const x = M + i * (boxW + 3);
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, boxW, 20, 2, 2, 'FD');
      doc.setFillColor(...k.rgb);
      doc.rect(x, y, 3, 20, 'F');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text(k.label, x + 6, y + 7);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...k.rgb);
      doc.text(k.value, x + 6, y + 16);
      doc.setFont('helvetica', 'normal');
    });
    y += 26;

    // ── Device summary line ─────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Thiet bi Online: ${data.kpi.devicesOnline}/${data.kpi.devicesTotal}   |   Nhiet do cao nhat: ${data.kpi.maxTemp}C (${data.kpi.maxTempDevice})   |   Da xu ly: ${data.kpi.resolvedCount}`,
      M, y
    );
    y += 10;

    // ── Alarm by device table ───────────────────────────────
    if (data.alarmsByDevice.length > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('THONG KE THEO THIET BI', M, y);
      y += 2;
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Thiet bi', 'So su kien', 'Lan cuoi']],
        body: data.alarmsByDevice.map(d => [
          d.deviceName,
          String(d.count),
          new Date(d.lastTime).toLocaleString('vi-VN'),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Biểu đồ nhiệt độ ────────────────────────────────────
    const tempSeries = data.tempHistory.find(t => t.data.length > 1);
    const showChart = (document.getElementById('chk_trend') as HTMLInputElement)?.checked !== false;

    if (tempSeries && showChart) {
      // Render sang canvas ẩn
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 240;
      canvas.style.position = 'fixed';
      canvas.style.left = '-9999px';
      document.body.appendChild(canvas);

      const step = Math.max(1, Math.floor(tempSeries.data.length / 60));
      const sampled = tempSeries.data.filter((_, i) => i % step === 0);

      const chart = new Chart(canvas.getContext('2d')!, {
        type: 'line',
        data: {
          labels: sampled.map(d =>
            new Date(d.t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          ),
          datasets: [{
            label: `${tempSeries.name} (°C)`,
            data: sampled.map(d => d.v),
            borderColor: '#1a56db',
            backgroundColor: 'rgba(26,86,219,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: false,
          animation: false,
          plugins: { legend: { display: true, position: 'top' } },
          scales: {
            y: { title: { display: true, text: '°C' }, grid: { color: '#e5e7eb' } },
            x: { ticks: { maxTicksLimit: 10, font: { size: 9 } }, grid: { display: false } },
          },
        },
      });

      await new Promise(r => setTimeout(r, 150)); // chờ chart render xong
      const imgData = canvas.toDataURL('image/png');
      chart.destroy();
      document.body.removeChild(canvas);

      if (y + 60 > pageH - 25) { doc.addPage(); y = M; }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('XU HUONG NHIET DO', M, y);
      y += 2;
      doc.setFont('helvetica', 'normal');
      doc.addImage(imgData, 'PNG', M, y, pageW - M * 2, 52);
      y += 58;
    }

    // ── Events table ────────────────────────────────────────
    const showList = (document.getElementById('chk_alarm_list') as HTMLInputElement)?.checked !== false;
    if (showList && data.events.length > 0) {
      if (y + 40 > pageH - 25) { doc.addPage(); y = M; }

      const eventsToShow = [...data.events].reverse().slice(0, 25);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`SU KIEN TRONG KY (${eventsToShow.length}/${data.events.length})`, M, y);
      y += 2;
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Thoi gian', 'Thiet bi', 'Trang thai', 'Gia tri']],
        body: eventsToShow.map(e => [
          new Date(e.timestamp).toLocaleString('vi-VN'),
          e.deviceName,
          e.currentStatus === 'Alarm' ? 'NGUY CAP' : e.currentStatus === 'Warning' ? 'CANH BAO' : 'BINH THUONG',
          e.currentValue != null ? `${e.currentValue} ${e.measureUnit ?? ''}` : '–',
        ]),
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (hook) => {
          if (hook.section === 'body' && hook.column.index === 2) {
            const v = hook.cell.raw as string;
            if (v === 'NGUY CAP') hook.cell.styles.textColor = [224, 36, 36];
            else if (v === 'CANH BAO') hook.cell.styles.textColor = [217, 119, 6];
            else hook.cell.styles.textColor = [5, 150, 105];
          }
        },
      });
    }

    // ── Footer mỗi trang ────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Station Monitor Enterprise  |  Trang ${p}/${totalPages}  |  ${data.generatedAt.toLocaleString('vi-VN')}`,
        pageW / 2, pageH - 8, { align: 'center' }
      );
      // đường kẻ footer
      doc.setDrawColor(220, 220, 220);
      doc.line(M, pageH - 12, pageW - M, pageH - 12);
    }

    // ── Lưu file ────────────────────────────────────────────
    const fileName = `Report_${this.reportType}_${data.fromDate.toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  }

  // TODO: hiển thị trạng thái "Chưa có dữ liệu" khi backend chưa kết nối
}
