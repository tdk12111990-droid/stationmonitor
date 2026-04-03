// ============================================================
// AnalyticsPage – D06: Phân tích & Báo cáo (Cấp độ Chuyên sâu)
// ============================================================

import Chart from 'chart.js/auto';
import {
  loadScadaPoints, getScadaEvents, getScadaHistory,
  type StoredScadaPoint, type ScadaEvent, type ScadaHistoryEntry
} from '@/services/storage';

type TimeRange = '1H' | '6H' | '1D' | '1W' | '1M' | '1Y';

export class AnalyticsPage {
  private mainChart: Chart | null = null;
  private alertTypeChart: Chart | null = null;
  private alertFreqChart: Chart | null = null;
  private scadaPoints: StoredScadaPoint[] = [];
  private scadaEvents: ScadaEvent[] = [];
  private selectedSensorIds: Set<string> = new Set();
  private currentTimeRange: TimeRange = '1D';
  private isLiveMode: boolean = false;
  private liveInterval: ReturnType<typeof setInterval> | null = null;

  render(): string {
    return `
    <div class="analytics-container" style="display:flex; height:calc(100vh - 64px); background:var(--admin-bg);">
      
      <!-- SIDEBAR: Sensor Selection -->
      <div class="analytics-sidebar" style="width:280px; border-right:1px solid rgba(255,255,255,0.05); padding:20px; display:flex; flex-direction:column; background:rgba(0,0,0,0.1);">
        <h3 style="font-size:0.9rem; color:var(--admin-text); opacity:0.6; text-transform:uppercase; margin-bottom:20px; letter-spacing:1px;">Thiết bị giám sát</h3>
        <div id="sensorListContainer" style="flex:1; overflow-y:auto; margin-bottom:20px;">
          <!-- Checkboxes populated dynamically -->
          <div style="padding:10px; color:#94a3b8; font-size:0.8rem;">Đang tải danh sách...</div>
        </div>
        <div style="padding-top:15px; border-top:1px solid rgba(255,255,255,0.05);">
          <button id="selectAllSensors" class="btn-industrial" style="width:100%; margin-bottom:8px; font-size:0.75rem;">Chọn tất cả</button>
          <button id="clearAllSensors" class="btn-industrial" style="width:100%; font-size:0.75rem;">Bỏ chọn hết</button>
        </div>
      </div>

      <!-- MAIN CONTENT -->
      <div class="analytics-main" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- TOOLBAR -->
        <div class="analytics-toolbar" style="padding:15px 24px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02);">
          <div style="display:flex; gap:10px;">
            <button class="range-btn" data-range="1H">1 GIỜ</button>
            <button class="range-btn active" data-range="1D">1 NGÀY</button>
            <button class="range-btn" data-range="1W">1 TUẦN</button>
            <button class="range-btn" data-range="1M">1 THÁNG</button>
            <button class="range-btn" data-range="1Y">1 NĂM</button>
          </div>
          <div style="display:flex; align-items:center; gap:15px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">LIVE UPDATES</span>
              <label class="switch-industrial">
                <input type="checkbox" id="liveToggle">
                <span class="slider-industrial"></span>
              </label>
            </div>
            <button id="exportData" class="btn-industrial" style="padding:6px 15px; font-size:0.75rem;">📥 Xuất dữ liệu</button>
          </div>
        </div>

        <!-- CHART AREA -->
        <div style="flex:1; padding:24px; display:flex; flex-direction:column; gap:20px; overflow-y:auto; background:rgba(0,0,0,0.05);">
          
          <!-- Top Row: Main Trends -->
          <div class="admin-card" style="flex:0 0 450px; padding:20px; display:flex; flex-direction:column; background:rgba(0,0,0,0.2); position:relative;">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
              <div id="chartTitle" style="font-weight:700; color:var(--admin-text); font-size:1.1rem; text-transform:uppercase; letter-spacing:1px;">Xu hướng thông số thiết bị</div>
              <div id="chartLegend" style="display:flex; gap:15px; flex-wrap:wrap;"></div>
            </div>
            <div style="flex:1; min-height:0; position:relative;">
              <canvas id="mainChartCanvas"></canvas>
            </div>
          </div>

          <!-- Bottom Row: Statistics -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; flex:0 0 320px;">
            <!-- Alert Distribution -->
            <div class="admin-card" style="padding:20px; display:flex; flex-direction:column; background:rgba(0,0,0,0.2);">
              <div style="font-weight:700; color:var(--admin-text); font-size:0.9rem; margin-bottom:15px; text-transform:uppercase;">Phân tích loại cảnh báo</div>
              <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">
                <canvas id="alertTypeChartCanvas"></canvas>
              </div>
            </div>

            <!-- Alert Frequency -->
            <div class="admin-card" style="padding:20px; display:flex; flex-direction:column; background:rgba(0,0,0,0.2);">
              <div style="font-weight:700; color:var(--admin-text); font-size:0.9rem; margin-bottom:15px; text-transform:uppercase;">Tần suất cảnh báo theo thời gian</div>
              <div style="flex:1; min-height:0;">
                <canvas id="alertFreqChartCanvas"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- BOTTOM KPI BAR -->
        <div class="analytics-status-bar" style="padding:10px 24px; border-top:1px solid rgba(255,255,255,0.05); display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; font-size:0.75rem; background:rgba(0,0,0,0.1);">
           <div id="kpiAlarm" style="color:#ef4444;">ALARM: 0</div>
           <div id="kpiWarning" style="color:#f59e0b;">WARNING: 0</div>
           <div id="kpiEvents">EVENTS (24H): 0</div>
           <div id="kpiStatus" style="text-align:right; color:#10b981;">● SYSTEM READY</div>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    this.loadInitialData();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Range buttons
    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        this.currentTimeRange = target.dataset.range as TimeRange;
        this.refreshChartData();
      });
    });

    // Live toggle
    const liveToggle = document.getElementById('liveToggle') as HTMLInputElement;
    liveToggle?.addEventListener('change', (e) => {
      this.isLiveMode = (e.currentTarget as HTMLInputElement).checked;
      if (this.isLiveMode) {
        this.startLivePolling();
      } else {
        this.stopLivePolling();
      }
    });

    // Sidebar buttons
    document.getElementById('selectAllSensors')?.addEventListener('click', () => {
      this.selectedSensorIds = new Set(this.scadaPoints.filter(p => p.type === 'Sensor').map(p => p.id));
      this.syncCheckboxes();
      this.refreshChartData();
    });

    document.getElementById('clearAllSensors')?.addEventListener('click', () => {
      this.selectedSensorIds.clear();
      this.syncCheckboxes();
      this.refreshChartData();
    });
  }

  private async loadInitialData(): Promise<void> {
    try {
      const [points, events] = await Promise.all([loadScadaPoints(), getScadaEvents()]);
      this.scadaPoints = points;
      this.scadaEvents = events;
      this.renderSensorList(points);
      
      // Auto-select first 3 sensors by default
      const sensors = points.filter(p => p.type === 'Sensor').slice(0, 3);
      sensors.forEach(s => this.selectedSensorIds.add(s.id));
      this.syncCheckboxes();
      
      this.updateKpiBar(points);
      this.refreshChartData();
      this.refreshAlertCharts();
    } catch (err) {
      console.error('[Analytics] Init failed:', err);
    }
  }

  private async refreshAlertCharts(): Promise<void> {
    const events = await getScadaEvents();
    this.scadaEvents = events;

    this.renderAlertTypeChart();
    this.renderAlertFreqChart(events);
  }

  private renderAlertTypeChart(): void {
    const canvas = document.getElementById('alertTypeChartCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    this.alertTypeChart?.destroy();

    // Group by CURRENT status of all points (not just events)
    const statusCounts: Record<string, number> = { 'Alarm': 0, 'Warning': 0, 'Normal': 0 };
    this.scadaPoints.filter(p => p.type === 'Sensor').forEach(p => {
      const status = p.status;
      if (status && statusCounts[status] !== undefined) {
        statusCounts[status]++;
      }
    });

    this.alertTypeChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Báo động (Alarm)', 'Cảnh báo (Warning)', 'Bình thường'],
        datasets: [{
          data: [statusCounts['Alarm'], statusCounts['Warning'], statusCounts['Normal']],
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { 
            position: 'right', 
            labels: { color: '#94a3b8', font: { size: 10 }, usePointStyle: true, padding: 15 } 
          }
        }
      }
    } as any); // Use any to bypass complex Chart.js type mismatch in mixed environments
  }

  private renderAlertFreqChart(events: ScadaEvent[]): void {
    const canvas = document.getElementById('alertFreqChartCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    this.alertFreqChart?.destroy();

    // Group by hour for the last 24h
    const now = Date.now();
    const last24h = now - 24 * 3600000;
    const bins: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
       const hourTs = new Date(now).setMinutes(0,0,0) - i * 3600000;
       bins[hourTs] = 0;
    }

    events.filter(e => e.timestamp > last24h).forEach(e => {
      const hourTs = new Date(e.timestamp).setMinutes(0,0,0);
      if (bins[hourTs] !== undefined) bins[hourTs]++;
    });

    const labels = Object.keys(bins).map(ts => new Date(Number(ts)).getHours() + 'h').reverse();
    const data = Object.values(bins).reverse();

    this.alertFreqChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Số sự kiện',
          data,
          backgroundColor: 'rgba(56, 189, 248, 0.4)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  private renderSensorList(points: StoredScadaPoint[]): void {
    const container = document.getElementById('sensorListContainer');
    if (!container) return;
    
    const sensors = points.filter(p => p.type === 'Sensor');
    if (sensors.length === 0) {
      container.innerHTML = '<div style="color:#64748b; font-size:0.8rem; padding:10px;">Không có thiết bị sensor nào</div>';
      return;
    }

    container.innerHTML = sensors.map((s, i) => `
      <div class="sensor-item" style="display:flex; align-items:center; gap:10px; padding:10px; border-radius:6px; margin-bottom:4px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="sensor-checkbox" data-id="${s.id}" ${this.selectedSensorIds.has(s.id) ? 'checked' : ''} style="cursor:pointer">
        <div style="flex:1;">
          <div style="font-size:0.85rem; color:var(--admin-text); font-weight:600;">${s.name}</div>
          <div style="font-size:0.7rem; color:#64748b;">${s.id} | ${s.additionalProperties?.measureUnit || '--'}</div>
        </div>
        <div style="width:12px; height:12px; border-radius:50%; background:${this.getColor(i)};"></div>
      </div>
    `).join('');

    // Add event listeners to checkboxes
    container.querySelectorAll('.sensor-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const checkbox = e.currentTarget as HTMLInputElement;
        const id = checkbox.dataset.id!;
        if (checkbox.checked) this.selectedSensorIds.add(id);
        else this.selectedSensorIds.delete(id);
        this.refreshChartData();
      });
    });
  }

  private syncCheckboxes(): void {
    document.querySelectorAll<HTMLInputElement>('.sensor-checkbox').forEach(cb => {
      cb.checked = this.selectedSensorIds.has(cb.dataset.id!);
    });
  }

  private async refreshChartData(): Promise<void> {
    const overlay = document.getElementById('noDataOverlay');
    if (this.selectedSensorIds.size === 0) {
       if (overlay) overlay.style.display = 'flex';
       this.mainChart?.destroy();
       return;
    }
    if (overlay) overlay.style.display = 'none';

    // Calculate time window
    const toTs = Date.now();
    let fromTs = toTs - 24 * 3600000; // Default 1D
    let resMin = 1; // minutes between points for downsampling

    const range = this.currentTimeRange;
    switch (range) {
      case '1H': fromTs = toTs - 3600000; resMin = 1; break;
      case '6H': fromTs = toTs - 6 * 3600000; resMin = 2; break;
      case '1D': fromTs = toTs - 24 * 3600000; resMin = 5; break;
      case '1W': fromTs = toTs - 7 * 24 * 3600000; resMin = 30; break;
      case '1M': fromTs = toTs - 30 * 24 * 3600000; resMin = 120; break;
      case '1Y': fromTs = toTs - 365 * 24 * 3600000; resMin = 1440; break;
    }

    // Fetch history for all selected sensors
    const sensorIds = Array.from(this.selectedSensorIds);
    const historyPromises = sensorIds.map(id => getScadaHistory(id, fromTs, toTs));
    const histories = await Promise.all(historyPromises);

    this.renderMainChart(sensorIds, histories, resMin);
  }

  private renderMainChart(ids: string[], histories: ScadaHistoryEntry[][], resolutionMin: number): void {
    const canvas = document.getElementById('mainChartCanvas') as HTMLCanvasElement;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    this.mainChart?.destroy();

    const currentRange = this.currentTimeRange;

    // Prepare datasets
    const datasets = ids.map((id, index) => {
      const sensor = this.scadaPoints.find(p => p.id === id);
      const hist = histories[index] || [];
      const data = this.downsample(hist, resolutionMin);
      
      return {
        label: sensor?.name || id,
        data: data.map(h => ({ x: h.timestamp, y: h.value })),
        borderColor: this.getColor(index),
        backgroundColor: this.getColor(index, 0.1),
        borderWidth: 2,
        pointRadius: resolutionMin > 30 ? 0 : 2,
        tension: 0.3,
        fill: false
      };
    });

    // Create chart
    this.mainChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#94a3b8', boxWidth: 12, usePointStyle: true } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#fff',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const ts = items[0]?.parsed?.x;
                return ts ? new Date(ts).toLocaleString('vi-VN') : '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            position: 'bottom',
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              color: '#64748b',
              display: true,
              callback: (val: string | number) => {
                const date = new Date(Number(val));
                if (isNaN(date.getTime())) return '';
                if (currentRange === '1H') return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                if (currentRange === '1D') return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
              }
            }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  private downsample(data: ScadaHistoryEntry[], windowMin: number): ScadaHistoryEntry[] {
    if (windowMin <= 1 || data.length < 100) return data;

    const windowMs = windowMin * 60 * 1000;
    const result: ScadaHistoryEntry[] = [];
    
    if (data.length === 0) return [];

    let currentBucket: ScadaHistoryEntry[] = [];
    let bucketStart: number | null = data[0]?.timestamp ?? null;

    data.forEach(p => {
      if (p.timestamp < (bucketStart ?? 0) + windowMs) {
        currentBucket.push(p);
      } else {
        if (currentBucket.length > 0) {
          const first = currentBucket[0];
          if (first) {
            const avgValue = currentBucket.reduce((sum, b) => sum + b.value, 0) / currentBucket.length;
            result.push({ 
              deviceId: first.deviceId,
              status: first.status, 
              value: avgValue, 
              timestamp: (bucketStart ?? 0) + windowMs / 2 
            });
          }
        }
        currentBucket = [p];
        bucketStart = p.timestamp;
      }
    });

    // Handle last bucket
    if (currentBucket.length > 0 && bucketStart !== null) {
      const first = currentBucket[0];
      if (first) {
        const lastTs = data[data.length - 1]?.timestamp ?? bucketStart;
        const avgValue = currentBucket.reduce((sum, b) => sum + b.value, 0) / currentBucket.length;
        result.push({ 
          deviceId: first.deviceId,
          status: first.status,
          value: avgValue, 
          timestamp: bucketStart + (lastTs - bucketStart) / 2 
        });
      }
    }

    return result;
  }

  private startLivePolling(): void {
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.liveInterval = setInterval(async () => {
      this.refreshChartData();
      this.refreshAlertCharts();
    }, 5000);
  }

  private stopLivePolling(): void {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }
  }

  private getColor(index: number, alpha: number = 1): string {
    const colors = [
      `rgba(59, 130, 246, ${alpha})`,   // Blue
      `rgba(16, 185, 129, ${alpha})`,   // Green
      `rgba(245, 158, 11, ${alpha})`,   // Amber
      `rgba(239, 68, 68, ${alpha})`,    // Red
      `rgba(139, 92, 246, ${alpha})`,   // Purple
      `rgba(236, 72, 153, ${alpha})`,   // Pink
      `rgba(6, 182, 212, ${alpha})`,    // Cyan
      `rgba(132, 204, 22, ${alpha})`,   // Lime
    ];
    return colors[index % colors.length] || `rgba(100, 116, 139, ${alpha})`;
  }

  private updateKpiBar(points: StoredScadaPoint[]): void {
    const alarm = points.filter(p => p.status === 'Alarm').length;
    const warn = points.filter(p => p.status === 'Warning').length;
    
    const el = (id: string, text: string) => {
      const e = document.getElementById(id);
      if (e) e.innerText = text;
    };
    
    el('kpiAlarm', `ALARM: ${alarm}`);
    el('kpiWarning', `WARNING: ${warn}`);
    el('kpiEvents', `EVENTS (24H): ${this.scadaEvents.filter(e => e.timestamp > Date.now() - 24 * 3600000).length}`);
    
    if (alarm > 0) el('kpiStatus', `● ${alarm} THIẾT BỊ ĐANG BÁO ĐỘNG`);
    else if (warn > 0) el('kpiStatus', `● ${warn} THIẾT BỊ CÓ CẢNH BÁO`);
    else el('kpiStatus', `● HỆ THỐNG ĐANG BÌNH THƯỜNG`);
    
    const kpiStatus = document.getElementById('kpiStatus');
    if (kpiStatus) {
      kpiStatus.style.color = alarm > 0 ? '#ef4444' : (warn > 0 ? '#f59e0b' : '#10b981');
    }
  }

  destroy(): void {
    this.stopLivePolling();
    this.mainChart?.destroy();
  }
}

