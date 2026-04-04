// ============================================================
// AnalyticsPage — Phân tích dữ liệu sensor từ TimescaleDB
// Dùng GET /api/v1/points + GET /api/v1/history (backend thật)
// ============================================================

import Chart from 'chart.js/auto';
import { stationApi, type AlertItem } from '@/services/StationApiService';

type TimeRange = '1H' | '6H' | '1D' | '1W' | '1M';

interface SensorMeta {
  deviceId: string;
  pointId: string;
  label: string;
  unit: string;
}

export class AnalyticsPage {
  private mainChart: Chart | null = null;
  private alertTypeChart: Chart | null = null;
  private alertFreqChart: Chart | null = null;

  private sensors: SensorMeta[] = [];
  private alerts: AlertItem[] = [];
  private selectedKeys: Set<string> = new Set(); // "deviceId|pointId"
  private currentRange: TimeRange = '1D';
  private liveInterval: ReturnType<typeof setInterval> | null = null;

  render(): string {
    return `
    <div class="analytics-container" style="display:flex;height:calc(100vh - 64px);background:var(--admin-bg);">

      <!-- SIDEBAR -->
      <div class="analytics-sidebar" style="width:280px;border-right:1px solid rgba(255,255,255,0.05);padding:20px;display:flex;flex-direction:column;background:rgba(0,0,0,0.1);">
        <h3 style="font-size:0.9rem;color:var(--admin-text);opacity:0.6;text-transform:uppercase;margin-bottom:20px;letter-spacing:1px;">Điểm đo</h3>
        <div id="sensorListContainer" style="flex:1;overflow-y:auto;margin-bottom:20px;">
          <div style="padding:10px;color:#94a3b8;font-size:0.8rem;">Đang tải...</div>
        </div>
        <div style="padding-top:15px;border-top:1px solid rgba(255,255,255,0.05);">
          <button id="selectAllSensors" class="btn-industrial" style="width:100%;margin-bottom:8px;font-size:0.75rem;">Chọn tất cả</button>
          <button id="clearAllSensors" class="btn-industrial" style="width:100%;font-size:0.75rem;">Bỏ chọn hết</button>
        </div>
      </div>

      <!-- MAIN -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">

        <!-- TOOLBAR -->
        <div style="padding:15px 24px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);">
          <div style="display:flex;gap:10px;">
            ${(['1H','6H','1D','1W','1M'] as TimeRange[]).map(r =>
              `<button class="range-btn${r === '1D' ? ' active' : ''}" data-range="${r}">${r}</button>`
            ).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:15px;">
            <span style="font-size:0.75rem;color:#94a3b8;font-weight:600;">LIVE</span>
            <label class="switch-industrial">
              <input type="checkbox" id="liveToggle">
              <span class="slider-industrial"></span>
            </label>
          </div>
        </div>

        <!-- CHARTS -->
        <div style="flex:1;padding:24px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;background:rgba(0,0,0,0.05);">

          <!-- Main trend chart -->
          <div class="admin-card" style="flex:0 0 420px;padding:20px;display:flex;flex-direction:column;background:rgba(0,0,0,0.2);">
            <div style="font-weight:700;color:var(--admin-text);font-size:1rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
              Xu hướng thông số
            </div>
            <div style="flex:1;min-height:0;position:relative;">
              <canvas id="mainChartCanvas"></canvas>
            </div>
          </div>

          <!-- Bottom row: alert stats -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:0 0 300px;">
            <div class="admin-card" style="padding:20px;background:rgba(0,0,0,0.2);">
              <div style="font-weight:700;color:var(--admin-text);font-size:0.9rem;margin-bottom:12px;text-transform:uppercase;">Phân loại cảnh báo</div>
              <div style="position:relative;height:220px;">
                <canvas id="alertTypeChartCanvas"></canvas>
              </div>
            </div>
            <div class="admin-card" style="padding:20px;background:rgba(0,0,0,0.2);">
              <div style="font-weight:700;color:var(--admin-text);font-size:0.9rem;margin-bottom:12px;text-transform:uppercase;">Tần suất cảnh báo 24h</div>
              <div style="position:relative;height:220px;">
                <canvas id="alertFreqChartCanvas"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- KPI bar -->
        <div style="padding:10px 24px;border-top:1px solid rgba(255,255,255,0.05);display:grid;grid-template-columns:repeat(4,1fr);gap:20px;font-size:0.75rem;background:rgba(0,0,0,0.1);">
          <div id="kpiOpen"   style="color:#ef4444;">OPEN: 0</div>
          <div id="kpiAcked"  style="color:#f59e0b;">ACKED: 0</div>
          <div id="kpiClosed">CLOSED (24H): 0</div>
          <div id="kpiStatus" style="text-align:right;color:#10b981;">● LOADING...</div>
        </div>
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    await this.loadAll();
    this.bindEvents();
  }

  // ── Load dữ liệu từ backend ───────────────────────────────

  private async loadAll(): Promise<void> {
    try {
      const [points, alerts] = await Promise.all([
        stationApi.getLatestPoints(),
        stationApi.getAlerts(undefined, 200),
      ]);

      this.alerts = alerts;

      // Chuyển SensorPoint → SensorMeta
      this.sensors = points.map(p => ({
        deviceId: p.deviceId,
        pointId:  p.pointId,
        label:    this.formatLabel(p.pointId),
        unit:     p.unit,
      }));

      this.renderSensorList();

      // Auto-select tất cả (ít điểm, chọn hết luôn)
      this.selectedKeys = new Set(this.sensors.map(s => this.key(s)));
      this.syncCheckboxes();

      this.updateKpiBar();
      this.renderAlertCharts();
      await this.refreshMainChart();

    } catch (err) {
      console.error('[Analytics] load failed:', err);
      const container = document.getElementById('sensorListContainer');
      if (container) container.innerHTML = `<div style="color:#ef4444;padding:10px;font-size:0.8rem;">Lỗi tải dữ liệu: ${err}</div>`;
    }
  }

  private async refreshMainChart(): Promise<void> {
    if (this.selectedKeys.size === 0) {
      this.mainChart?.destroy();
      return;
    }

    const now = new Date();
    const from = new Date(now.getTime() - this.rangeMs());

    const selected = this.sensors.filter(s => this.selectedKeys.has(this.key(s)));

    const histories = await Promise.all(
      selected.map(s =>
        stationApi.getHistory(s.deviceId, s.pointId, from.toISOString(), now.toISOString())
      )
    );

    this.renderMainChart(selected, histories);
  }

  // ── Render charts ─────────────────────────────────────────

  private renderSensorList(): void {
    const container = document.getElementById('sensorListContainer');
    if (!container) return;

    if (this.sensors.length === 0) {
      container.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:10px;">Chưa có dữ liệu sensor.<br>Kiểm tra PLC có đang chạy không.</div>';
      return;
    }

    container.innerHTML = this.sensors.map((s, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;margin-bottom:4px;">
        <input type="checkbox" class="sensor-checkbox"
          data-key="${this.key(s)}"
          ${this.selectedKeys.has(this.key(s)) ? 'checked' : ''}
          style="cursor:pointer">
        <div style="flex:1;">
          <div style="font-size:0.85rem;color:var(--admin-text);font-weight:600;">${s.label}</div>
          <div style="font-size:0.7rem;color:#64748b;">${s.unit}</div>
        </div>
        <div style="width:10px;height:10px;border-radius:50%;background:${this.color(i)};"></div>
      </div>
    `).join('');

    container.querySelectorAll<HTMLInputElement>('.sensor-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const k = cb.dataset.key!;
        if (cb.checked) this.selectedKeys.add(k);
        else this.selectedKeys.delete(k);
        this.refreshMainChart();
      });
    });
  }

  private syncCheckboxes(): void {
    document.querySelectorAll<HTMLInputElement>('.sensor-checkbox').forEach(cb => {
      cb.checked = this.selectedKeys.has(cb.dataset.key!);
    });
  }

  private renderMainChart(sensors: SensorMeta[], histories: Array<Array<{ time: string; value: number }>>): void {
    const canvas = document.getElementById('mainChartCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    this.mainChart?.destroy();

    const datasets = sensors.map((s, i) => ({
      label: `${s.label} (${s.unit})`,
      data: (histories[i] ?? []).map(h => ({ x: new Date(h.time).getTime(), y: h.value })),
      borderColor: this.color(i),
      backgroundColor: this.color(i, 0.08),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    }));

    const range = this.currentRange;
    this.mainChart = new Chart(canvas, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', boxWidth: 12, usePointStyle: true } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.9)',
            titleColor: '#fff',
            bodyColor: '#94a3b8',
            callbacks: {
              title: (items: any[]) => new Date(items[0]?.parsed?.x ?? 0).toLocaleString('vi-VN'),
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              color: '#64748b',
              callback: (val: string | number) => {
                const d = new Date(Number(val));
                return range === '1H' || range === '6H'
                  ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
              }
            }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b' }
          }
        }
      }
    } as any);
  }

  private renderAlertCharts(): void {
    // Donut — phân loại theo level
    const alarmCount   = this.alerts.filter(a => a.level === 'alarm').length;
    const warningCount = this.alerts.filter(a => a.level === 'warning').length;

    const donut = document.getElementById('alertTypeChartCanvas') as HTMLCanvasElement;
    if (donut) {
      this.alertTypeChart?.destroy();
      this.alertTypeChart = new Chart(donut, {
        type: 'doughnut',
        data: {
          labels: ['Alarm', 'Warning'],
          datasets: [{ data: [alarmCount, warningCount], backgroundColor: ['#ef4444', '#f59e0b'], borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, usePointStyle: true } } }
        }
      } as any);
    }

    // Bar — tần suất theo giờ trong 24h
    const now = Date.now();
    const bins: number[] = Array(24).fill(0);
    this.alerts
      .filter(a => new Date(a.triggeredAt).getTime() > now - 86400000)
      .forEach(a => {
        const h = new Date(a.triggeredAt).getHours();
        if (h >= 0 && h < 24) bins[h] = (bins[h] ?? 0) + 1;
      });

    const bar = document.getElementById('alertFreqChartCanvas') as HTMLCanvasElement;
    if (bar) {
      this.alertFreqChart?.destroy();
      this.alertFreqChart = new Chart(bar, {
        type: 'bar',
        data: {
          labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
          datasets: [{ label: 'Cảnh báo', data: bins, backgroundColor: 'rgba(56,189,248,0.4)', borderColor: '#38bdf8', borderWidth: 1, borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  private updateKpiBar(): void {
    const open   = this.alerts.filter(a => a.status === 'open').length;
    const acked  = this.alerts.filter(a => a.status === 'acked').length;
    const closed = this.alerts.filter(a =>
      a.status === 'closed' && new Date(a.triggeredAt).getTime() > Date.now() - 86400000
    ).length;

    const el = (id: string, text: string) => { const e = document.getElementById(id); if (e) e.textContent = text; };
    el('kpiOpen',   `OPEN: ${open}`);
    el('kpiAcked',  `ACKED: ${acked}`);
    el('kpiClosed', `CLOSED (24H): ${closed}`);

    const status = document.getElementById('kpiStatus');
    if (status) {
      if (open > 0)        { status.textContent = `● ${open} CẢNH BÁO CHƯA XỬ LÝ`; status.style.color = '#ef4444'; }
      else if (acked > 0)  { status.textContent = `● ${acked} ĐANG XỬ LÝ`;          status.style.color = '#f59e0b'; }
      else                 { status.textContent = '● HỆ THỐNG BÌNH THƯỜNG';          status.style.color = '#10b981'; }
    }
  }

  // ── Events ────────────────────────────────────────────────

  private bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentRange = btn.dataset.range as TimeRange;
        this.refreshMainChart();
      });
    });

    const liveToggle = document.getElementById('liveToggle') as HTMLInputElement;
    liveToggle?.addEventListener('change', () => {
      if (liveToggle.checked) {
        this.liveInterval = setInterval(() => { this.refreshMainChart(); this.loadAll(); }, 10000);
      } else {
        if (this.liveInterval) clearInterval(this.liveInterval);
        this.liveInterval = null;
      }
    });

    document.getElementById('selectAllSensors')?.addEventListener('click', () => {
      this.selectedKeys = new Set(this.sensors.map(s => this.key(s)));
      this.syncCheckboxes();
      this.refreshMainChart();
    });

    document.getElementById('clearAllSensors')?.addEventListener('click', () => {
      this.selectedKeys.clear();
      this.syncCheckboxes();
      this.refreshMainChart();
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  private key(s: SensorMeta): string { return `${s.deviceId}|${s.pointId}`; }

  private rangeMs(): number {
    return { '1H': 3600000, '6H': 21600000, '1D': 86400000, '1W': 604800000, '1M': 2592000000 }[this.currentRange] ?? 86400000;
  }

  private formatLabel(pointId: string): string {
    return ({
      nhiet_do_pha_1: 'Nhiệt độ Pha 1',
      nhiet_do_pha_2: 'Nhiệt độ Pha 2',
      nhiet_do_pha_3: 'Nhiệt độ Pha 3',
      phong_dien:     'Phóng điện PD',
    } as Record<string, string>)[pointId] ?? pointId;
  }

  private color(i: number, a = 1): string {
    return [
      `rgba(59,130,246,${a})`, `rgba(16,185,129,${a})`,
      `rgba(245,158,11,${a})`, `rgba(239,68,68,${a})`,
      `rgba(139,92,246,${a})`, `rgba(6,182,212,${a})`,
    ][i % 6] ?? `rgba(100,116,139,${a})`;
  }

  destroy(): void {
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.mainChart?.destroy();
    this.alertTypeChart?.destroy();
    this.alertFreqChart?.destroy();
  }
}
