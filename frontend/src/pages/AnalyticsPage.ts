// ============================================================
// AnalyticsPage v2 — Phân tích toàn diện 6 tab
// Tổng quan · Nhiệt độ · Phóng điện · Tương quan · Cảnh báo · Sức khỏe
// ============================================================

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { stationApi, type AlertItem, type Device, type SensorPoint, type Rule } from '@/services/StationApiService';

type TimeRange = '1H' | '6H' | '1D' | '1W' | '1M';
type TabId = 'overview' | 'temp' | 'pd' | 'correlation' | 'alerts' | 'health';
interface HP { time: string; value: number; }

// Threshold từ Rule: { value, level: 'warning'|'alarm', op: '>'|'>='|'<'|'<=' }
interface Threshold { value: number; level: string; op: string; label: string; }

// ── Cấu hình sensor ──────────────────────────────────────────
const T_IDS    = ['nhiet_do_pha_1','nhiet_do_pha_2','nhiet_do_pha_3'];
const T_LABELS = ['Pha 1','Pha 2','Pha 3'];
const T_COLORS = ['#3b82f6','#10b981','#f59e0b'];
const PD_ID    = 'phong_dien';
const RMS: Record<TimeRange,number> = {
  '1H':3600000,'6H':21600000,'1D':86400000,'1W':604800000,'1M':2592000000,
};
const TABS: {id:TabId; icon:string; label:string}[] = [
  {id:'overview',    icon:'📊', label:'Tổng quan'},
  {id:'temp',        icon:'🌡️', label:'Nhiệt độ'},
  {id:'pd',          icon:'⚡', label:'Phóng điện'},
  {id:'correlation', icon:'🔗', label:'Tương quan'},
  {id:'alerts',      icon:'🚨', label:'Cảnh báo'},
  {id:'health',      icon:'❤️', label:'Sức khỏe'},
];

export class AnalyticsPage {
  private charts = new Map<string, Chart>();
  private stationId = '';
  private sensors: SensorPoint[] = [];
  private devices: Device[] = [];
  private alerts: AlertItem[] = [];
  // pointId → danh sách ngưỡng từ rules
  private thresholds: Record<string, Threshold[]> = {};
  private tempH: Record<string, HP[]> = {};
  private pdH: HP[] = [];
  private activeTab: TabId = 'overview';
  private range: TimeRange = '1D';
  private live: ReturnType<typeof setInterval> | null = null;
  private tabReady = new Set<TabId>();

  // ── HTML shell ───────────────────────────────────────────────
  render(): string {
    return `
    <div id="an-root" style="display:flex;flex-direction:column;height:calc(100vh - 64px);background:#0f172a;overflow:hidden;">

      <!-- TABBAR -->
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:0 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;">
        <div style="display:flex;overflow-x:auto;">
          ${TABS.map((t,i) => `
            <button class="an-tab${i===0?' an-tab-active':''}" data-tab="${t.id}"
              style="padding:11px 14px;background:none;border:none;
              border-bottom:2px solid ${i===0?'#2563eb':'transparent'};
              color:${i===0?'#e2e8f0':'#64748b'};font-size:0.76rem;font-weight:600;
              cursor:pointer;white-space:nowrap;transition:all .15s;">
              ${t.icon} ${t.label}
            </button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;padding-left:12px;">
          ${(['1H','6H','1D','1W','1M'] as TimeRange[]).map(r => `
            <button class="an-range${r==='1D'?' an-range-active':''}" data-range="${r}"
              style="padding:3px 9px;background:${r==='1D'?'#1e3a5f':'none'};
              border:1px solid ${r==='1D'?'#2563eb':'#334155'};border-radius:4px;
              color:${r==='1D'?'#60a5fa':'#64748b'};font-size:0.7rem;font-weight:600;cursor:pointer;">${r}</button>
          `).join('')}
          <button id="btnExportHistory" title="Xuất lịch sử CSV"
            style="padding:3px 9px;background:none;border:1px solid #334155;border-radius:4px;
            color:#64748b;font-size:0.7rem;font-weight:600;cursor:pointer;">⬇ CSV</button>
          <div style="display:flex;align-items:center;gap:6px;margin-left:8px;">
            <span style="font-size:0.68rem;color:#64748b;font-weight:700;">LIVE</span>
            <div id="an-live-wrap" style="position:relative;width:34px;height:18px;cursor:pointer;">
              <input type="checkbox" id="an-live" style="opacity:0;position:absolute;width:0;height:0;">
              <div id="an-live-track" style="position:absolute;inset:0;background:#1e293b;border-radius:9px;
                border:1px solid #334155;transition:.2s;"></div>
              <div id="an-live-thumb" style="position:absolute;top:2px;left:2px;width:12px;height:12px;
                background:#475569;border-radius:50%;transition:.2s;"></div>
            </div>
            <span id="an-live-dot" style="font-size:0.68rem;color:#334155;">●</span>
          </div>
        </div>
      </div>

      <!-- TAB PANELS (lazy populated) -->
      <div style="flex:1;overflow:hidden;position:relative;">
        ${TABS.map((t,i) => `
          <div id="an-tab-${t.id}" style="display:${i===0?'flex':'none'};
            flex-direction:column;height:100%;overflow-y:auto;padding:16px;gap:16px;">
            <div style="color:#475569;font-size:0.8rem;padding:40px;text-align:center;">Đang tải…</div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  // ── Mount ────────────────────────────────────────────────────
  async mount(): Promise<void> {
    this.bindTabBar();
    this.bindRangeButtons();
    this.bindLiveToggle();
    this.bindExportHistory();
    await this.loadAll();
    await this.initTab('overview');
  }

  private bindExportHistory(): void {
    document.getElementById('btnExportHistory')?.addEventListener('click', () => {
      const token = localStorage.getItem('station_token') ?? '';
      const url = `http://localhost:5056/api/v1/history/export`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `history_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
        });
    });
  }

  private bindTabBar(): void {
    document.querySelectorAll<HTMLButtonElement>('.an-tab').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset['tab'] as TabId));
    });
  }

  private bindRangeButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('.an-range').forEach(btn => {
      btn.addEventListener('click', () => {
        this.range = btn.dataset['range'] as TimeRange;
        document.querySelectorAll('.an-range').forEach(b => {
          (b as HTMLElement).style.background = 'none';
          (b as HTMLElement).style.borderColor = '#334155';
          (b as HTMLElement).style.color = '#64748b';
          b.classList.remove('an-range-active');
        });
        btn.style.background = '#1e3a5f';
        btn.style.borderColor = '#2563eb';
        btn.style.color = '#60a5fa';
        btn.classList.add('an-range-active');
        // Invalidate history-dependent tabs
        (['temp','pd','correlation'] as TabId[]).forEach(t => this.tabReady.delete(t));
        if (['temp','pd','correlation'].includes(this.activeTab)) {
          this.tabReady.delete(this.activeTab);
          this.initTab(this.activeTab);
        }
      });
    });
  }

  private bindLiveToggle(): void {
    const cb    = document.getElementById('an-live') as HTMLInputElement;
    const track = document.getElementById('an-live-track')!;
    const thumb = document.getElementById('an-live-thumb')!;
    const dot   = document.getElementById('an-live-dot')!;
    const wrap  = document.getElementById('an-live-wrap')!;
    wrap.addEventListener('click', () => {
      cb.checked = !cb.checked;
      if (cb.checked) {
        track.style.background = '#1d4ed8'; thumb.style.left = '18px'; thumb.style.background = '#fff';
        dot.style.color = '#10b981'; dot.textContent = '● LIVE';
        this.live = setInterval(() => { this.loadAll().then(() => {
          this.tabReady.delete(this.activeTab);
          this.initTab(this.activeTab);
        }); }, 10000);
      } else {
        track.style.background = '#1e293b'; thumb.style.left = '2px'; thumb.style.background = '#475569';
        dot.style.color = '#334155'; dot.textContent = '●';
        if (this.live) { clearInterval(this.live); this.live = null; }
      }
    });
  }

  private async switchTab(id: TabId): Promise<void> {
    this.activeTab = id;
    TABS.forEach(t => {
      const panel = document.getElementById(`an-tab-${t.id}`)!;
      const btn   = document.querySelector<HTMLElement>(`.an-tab[data-tab="${t.id}"]`)!;
      const active = t.id === id;
      panel.style.display = active ? 'flex' : 'none';
      btn.style.borderBottomColor = active ? '#2563eb' : 'transparent';
      btn.style.color = active ? '#e2e8f0' : '#64748b';
    });
    await this.initTab(id);
  }

  private async initTab(id: TabId): Promise<void> {
    if (this.tabReady.has(id)) return;
    this.tabReady.add(id);
    this.destroyTabCharts(id);
    switch (id) {
      case 'overview':     await this.buildOverview();     break;
      case 'temp':         await this.buildTemp();         break;
      case 'pd':           await this.buildPd();           break;
      case 'correlation':  await this.buildCorrelation();  break;
      case 'alerts':            this.buildAlerts();        break;
      case 'health':       await this.buildHealth();        break;
    }
  }

  // ── Data loading ─────────────────────────────────────────────
  private async loadAll(): Promise<void> {
    const [stations, alerts, rules] = await Promise.all([
      stationApi.getStations(),
      stationApi.getAlerts(undefined, undefined, undefined, 500),
      stationApi.getRules().catch(() => [] as Rule[]),
    ]);
    this.stationId = stations[0]?.id ?? '';
    this.alerts    = alerts;
    this.thresholds = this.parseThresholds(rules);
    if (this.stationId) {
      const [sensors, devices] = await Promise.all([
        stationApi.getLatestPoints(this.stationId),
        stationApi.getDevices(this.stationId),
      ]);
      this.sensors = sensors;
      this.devices = devices;
    }
  }

  // Parse rules → map pointId → [{value, level, op, label}]
  private parseThresholds(rules: Rule[]): Record<string, Threshold[]> {
    const map: Record<string, Threshold[]> = {};
    rules.filter(r => r.enabled).forEach(r => {
      try {
        const cond = JSON.parse(r.condition) as {point?: string; op?: string; value?: number};
        const acts = JSON.parse(r.actions) as {level?: string}[];
        if (!cond.point || cond.value === undefined) return;
        const level = acts[0]?.level ?? 'warning';
        const t: Threshold = {
          value: cond.value,
          level,
          op: cond.op ?? '>',
          label: `${r.name} (${cond.op ?? '>'}${cond.value})`,
        };
        if (!map[cond.point]) map[cond.point] = [];
        // Tránh trùng value
        if (!map[cond.point]!.some(x => x.value === t.value && x.level === t.level)) {
          map[cond.point]!.push(t);
        }
      } catch { /* bỏ qua rule lỗi JSON */ }
    });
    // Sắp xếp theo value tăng dần
    Object.values(map).forEach(arr => arr.sort((a,b) => a.value - b.value));
    return map;
  }

  // Tạo threshold datasets cho chart — chỉ vẽ nếu có rule
  private thresholdDatasets(pointId: string, timeMin: number, timeMax: number): object[] {
    const thresholds = this.thresholds[pointId];
    if (!thresholds?.length) return [];
    return thresholds.map(t => ({
      label: t.label,
      data: [{x: timeMin, y: t.value}, {x: timeMax, y: t.value}],
      borderColor: t.level === 'alarm' ? '#ef4444' : '#f59e0b',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      tension: 0,
      order: 99,
    }));
  }

  private async loadHistory(): Promise<void> {
    const now  = new Date();
    const from = new Date(now.getTime() - RMS[this.range]);
    const tempSensors = T_IDS.map(pid => this.sensors.find(s => s.pointId === pid)).filter(Boolean) as SensorPoint[];
    const pdSensor    = this.sensors.find(s => s.pointId === PD_ID);

    const calls: Promise<void>[] = [];

    if (tempSensors.length) {
      calls.push(...tempSensors.map(s =>
        stationApi.getHistory(s.deviceId, s.pointId, from.toISOString(), now.toISOString(), 1000)
          .then(h => { this.tempH[s.pointId] = h; })
          .catch(() => { this.tempH[s.pointId] = []; })
      ));
    }
    if (pdSensor) {
      calls.push(
        stationApi.getHistory(pdSensor.deviceId, pdSensor.pointId, from.toISOString(), now.toISOString(), 1000)
          .then(h => { this.pdH = h; })
          .catch(() => { this.pdH = []; })
      );
    }
    await Promise.all(calls);
  }

  private destroyTabCharts(tabId: TabId): void {
    const prefix = `an-c-${tabId}`;
    this.charts.forEach((chart, key) => {
      if (key.startsWith(prefix)) { chart.destroy(); this.charts.delete(key); }
    });
  }

  private setTabHTML(id: TabId, html: string): void {
    const el = document.getElementById(`an-tab-${id}`);
    if (el) el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 1 — TỔNG QUAN
  // ══════════════════════════════════════════════════════════════
  private async buildOverview(): Promise<void> {
    await this.loadHistory();
    const sensors = this.sensors;
    const tempSensors = T_IDS.map((id, i) => ({
      id, label: T_LABELS[i], color: T_COLORS[i],
      val: sensors.find(s => s.pointId === id)?.value ?? null,
      data: (this.tempH[id] ?? []).map(h => h.value),
    }));
    const pdVal  = sensors.find(s => s.pointId === PD_ID)?.value ?? null;
    const pdData = this.pdH.map(h => h.value);
    const open   = this.alerts.filter(a => a.status === 'open').length;
    const acked  = this.alerts.filter(a => a.status === 'acked').length;

    // 7-day bar data
    const bins7 = Array(7).fill(0);
    const now = Date.now();
    this.alerts.forEach(a => {
      const d = Math.floor((now - new Date(a.triggeredAt).getTime()) / 86400000);
      if (d >= 0 && d < 7) bins7[6 - d]++;
    });
    const dayLabels = Array.from({length:7}, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return d.toLocaleDateString('vi-VN', {weekday:'short'});
    });

    const tempMaxVal = Math.max(...tempSensors.map(t => t.val ?? 0));
    const statusColor = open > 0 ? '#ef4444' : acked > 0 ? '#f59e0b' : '#10b981';
    const statusText  = open > 0 ? `${open} CẢNH BÁO CHƯA XỬ LÝ` : acked > 0 ? `${acked} ĐANG XỬ LÝ` : 'BÌNH THƯỜNG';

    this.setTabHTML('overview', `
      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${tempSensors.map(t => `
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Nhiệt độ ${t.label}</div>
            <div style="font-size:1.6rem;font-weight:800;color:${this.valColor(t.val, t.id, t.color ?? '#94a3b8')};">
              ${t.val !== null ? t.val.toFixed(1) : '—'}°C
            </div>
            <div style="margin-top:8px;">${this.sparklineSvg(t.data, t.color ?? '#94a3b8', 120, 28)}</div>
          </div>`).join('')}
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Phóng điện PD</div>
          <div style="font-size:1.6rem;font-weight:800;color:${this.valColor(pdVal, PD_ID, '#a855f7')};">
            ${pdVal !== null ? pdVal.toFixed(1) : '—'} dB
          </div>
          <div style="margin-top:8px;">${this.sparklineSvg(pdData, '#a855f7', 120, 28)}</div>
        </div>
      </div>

      <!-- Status + Alerts row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Trạng thái hệ thống</div>
          <div style="font-size:0.95rem;font-weight:800;color:${statusColor};margin-bottom:12px;">● ${statusText}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            <div style="text-align:center;padding:8px;background:rgba(239,68,68,0.1);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:800;color:#ef4444;">${open}</div>
              <div style="font-size:0.6rem;color:#64748b;">Open</div>
            </div>
            <div style="text-align:center;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:800;color:#f59e0b;">${acked}</div>
              <div style="font-size:0.6rem;color:#64748b;">Acked</div>
            </div>
            <div style="text-align:center;padding:8px;background:rgba(16,185,129,0.1);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:800;color:#10b981;">${tempMaxVal.toFixed(0)}</div>
              <div style="font-size:0.6rem;color:#64748b;">Max °C</div>
            </div>
          </div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Cảnh báo 7 ngày qua</div>
          <div style="position:relative;height:120px;"><canvas id="an-c-overview-bar"></canvas></div>
        </div>
      </div>

      <!-- Realtime trend mini -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
          Xu hướng gần đây — Nhiệt độ 3 pha (°C) <span style="color:#10b981;margin-left:8px;">● Realtime</span>
        </div>
        <div style="position:relative;height:140px;"><canvas id="an-c-overview-trend"></canvas></div>
      </div>
    `);

    // Bar chart 7 ngày
    this.mkChart('an-c-overview-bar', {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          label: 'Cảnh báo', data: bins7,
          backgroundColor: bins7.map(v => v > 5 ? 'rgba(239,68,68,0.7)' : v > 2 ? 'rgba(245,158,11,0.7)' : 'rgba(56,189,248,0.5)'),
          borderColor: 'transparent', borderRadius: 4,
        }],
      },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color:'#64748b', stepSize: 1 } }
      }, plugins: { legend: { display:false } } } as any,
    });

    // Trend mini (last portion of history)
    const trendDatasets = tempSensors.map((t, i) => ({
      label: t.label,
      data: (this.tempH[t.id] ?? []).slice(-60).map(h => ({x: new Date(h.time).getTime(), y: h.value})),
      borderColor: T_COLORS[i], backgroundColor: 'transparent',
      borderWidth: 1.5, pointRadius: 0, tension: 0.3,
    }));
    this.mkChart('an-c-overview-trend', {
      type: 'line',
      data: { datasets: trendDatasets },
      options: { ...this.baseOpts(), scales: {
        x: { ...this.xScaleTime(), ticks: { color:'#64748b', maxTicksLimit: 6 } },
        y: { ...this.yScale(), title: { display:true, text:'°C', color:'#64748b', font:{size:10} } }
      } } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2 — NHIỆT ĐỘ
  // ══════════════════════════════════════════════════════════════
  private async buildTemp(): Promise<void> {
    await this.loadHistory();

    const stats = T_IDS.map((id, i) => {
      const data = (this.tempH[id] ?? []).map(h => h.value);
      const thr  = this.thresholds[id] ?? [];
      const warnV = thr.find(t => t.level === 'warning')?.value;
      const almV  = thr.find(t => t.level === 'alarm')?.value;
      return {
        label: T_LABELS[i], color: T_COLORS[i],
        min: data.length ? Math.min(...data).toFixed(1) : '—',
        max: data.length ? Math.max(...data).toFixed(1) : '—',
        avg: data.length ? (data.reduce((s,v)=>s+v,0)/data.length).toFixed(1) : '—',
        overWarn: warnV !== undefined ? data.filter(v => v >= warnV).length : null,
        overAlm:  almV  !== undefined ? data.filter(v => v >= almV).length  : null,
        warnV, almV,
      };
    });

    const heatmapRows = this.buildTempHeatmap();

    // Heatmap legend (depends on Pha 3 thresholds)
    const thr3 = this.thresholds[T_IDS[2] ?? ''] ?? [];
    const hmWarnV = thr3.find((t: Threshold) => t.level === 'warning')?.value;
    const hmAlmV  = thr3.find((t: Threshold) => t.level === 'alarm')?.value;
    const hmLegend = hmWarnV !== undefined && hmAlmV !== undefined
      ? `<span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;"></span> ≥${hmWarnV}°C (warning)</span>
         <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;"></span> ≥${hmAlmV}°C (alarm)</span>`
      : hmWarnV !== undefined
        ? `<span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;"></span> ≥${hmWarnV}°C (warning)</span>`
        : hmAlmV !== undefined
          ? `<span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;"></span> ≥${hmAlmV}°C (alarm)</span>`
          : `<span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;"></span> 55–65°C</span>
             <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;"></span> &gt;65°C</span>`;

    this.setTabHTML('temp', `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;">
        <!-- Line chart -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
            Nhiệt độ 3 pha (°C) — ${this.range}
          </div>
          <div style="position:relative;height:260px;"><canvas id="an-c-temp-line"></canvas></div>
        </div>
        <!-- Stats box -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;min-width:200px;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Thống kê</div>
          ${stats.map(s => `
            <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #1e293b;">
              <div style="font-size:0.75rem;font-weight:700;color:${s.color};margin-bottom:4px;">${s.label}</div>
              <div style="font-size:0.7rem;color:#94a3b8;">Min: <b style="color:#e2e8f0;">${s.min}°C</b></div>
              <div style="font-size:0.7rem;color:#94a3b8;">Max: <b style="color:#e2e8f0;">${s.max}°C</b></div>
              <div style="font-size:0.7rem;color:#94a3b8;">Avg: <b style="color:#e2e8f0;">${s.avg}°C</b></div>
              ${s.warnV !== undefined ? `<div style="font-size:0.7rem;color:#f59e0b;">>${s.warnV}°C (warning): ${s.overWarn} lần</div>` : ''}
              ${s.almV  !== undefined ? `<div style="font-size:0.7rem;color:#ef4444;">>${s.almV}°C (alarm): ${s.overAlm} lần</div>` : ''}
              ${s.warnV === undefined && s.almV === undefined ? `<div style="font-size:0.65rem;color:#334155;font-style:italic;">Chưa cài ngưỡng</div>` : ''}
            </div>`).join('')}
        </div>
      </div>

      <!-- Histogram -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Phân phối nhiệt độ</div>
        <div style="position:relative;height:160px;"><canvas id="an-c-temp-hist"></canvas></div>
      </div>

      <!-- Heatmap (Pha C max) -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
          Heatmap nhiệt độ Pha 3 theo giờ (7 ngày) — xanh thấp · vàng cảnh báo · đỏ nguy hiểm
        </div>
        <div style="overflow-x:auto;">
          <table style="border-collapse:separate;border-spacing:2px;font-size:0.62rem;">
            <tr>
              <td style="padding:2px 8px 2px 0;color:#475569;white-space:nowrap;"></td>
              ${Array.from({length:24}, (_,h) => `<td style="text-align:center;width:22px;color:#475569;padding:0;">${h}h</td>`).join('')}
            </tr>
            ${heatmapRows.map(row => `
              <tr>
                <td style="padding:2px 8px 2px 0;color:#94a3b8;font-weight:600;white-space:nowrap;">${row.label}</td>
                ${row.data.map(val => `
                  <td title="${val !== null ? val.toFixed(1)+'°C' : '—'}"
                    style="width:22px;height:16px;background:${this.tempCellColor(val, T_IDS[2])};border-radius:2px;opacity:0.85;"></td>
                `).join('')}
              </tr>`).join('')}
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:0.62rem;color:#64748b;">
          <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;"></span> &lt;45°C</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;"></span> 45–55°C</span>
          ${hmLegend}
        </div>
      </div>
    `);

    // Line chart với ngưỡng từ Rules
    const now = Date.now();
    const tMin = now - RMS[this.range], tMax = now;
    const datasets: object[] = T_IDS.map((id, i) => ({
      label: T_LABELS[i],
      data: (this.tempH[id] ?? []).map(h => ({x: new Date(h.time).getTime(), y: h.value})),
      borderColor: T_COLORS[i], backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 0, tension: 0.3, order: i + 1,
    }));
    // Chỉ thêm threshold lines nếu có rule cho sensor đó
    T_IDS.forEach(id => {
      this.thresholdDatasets(id, tMin, tMax).forEach(d => datasets.push(d));
    });

    this.mkChart('an-c-temp-line', {
      type: 'line', data: { datasets },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleTime(), y: { ...this.yScale(), title: { display:true, text:'°C', color:'#64748b', font:{size:10} } }
      } } as any,
    });

    // Histogram phân phối nhiệt
    const allTemp = T_IDS.flatMap(id => (this.tempH[id] ?? []).map(h => h.value));
    const buckets = Array(8).fill(0);
    const bucketLabels = ['<40','40-45','45-50','50-55','55-60','60-65','65-70','>70'];
    allTemp.forEach(v => {
      if      (v <  40) buckets[0]++;
      else if (v <  45) buckets[1]++;
      else if (v <  50) buckets[2]++;
      else if (v <  55) buckets[3]++;
      else if (v <  60) buckets[4]++;
      else if (v <  65) buckets[5]++;
      else if (v <  70) buckets[6]++;
      else              buckets[7]++;
    });
    this.mkChart('an-c-temp-hist', {
      type: 'bar',
      data: { labels: bucketLabels, datasets: [{
        label: 'Số mẫu', data: buckets, borderRadius: 4, borderWidth: 0,
        backgroundColor: ['#3b82f6','#3b82f6','#22c55e','#22c55e','#eab308','#f59e0b','#f97316','#ef4444'],
      }] },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), title: { display:true, text:'Số mẫu', color:'#64748b', font:{size:10} } }
      }, plugins: { legend: { display:false } } } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 3 — PHÓNG ĐIỆN
  // ══════════════════════════════════════════════════════════════
  private async buildPd(): Promise<void> {
    await this.loadHistory();

    const data    = this.pdH.map(h => h.value);
    const pdThr   = this.thresholds[PD_ID] ?? [];
    const warnV   = pdThr.find(t => t.level === 'warning')?.value;
    const almV    = pdThr.find(t => t.level === 'alarm')?.value;
    const minPD   = data.length ? Math.min(...data).toFixed(1) : '—';
    const maxPD   = data.length ? Math.max(...data).toFixed(1) : '—';
    const avgPD   = data.length ? (data.reduce((s,v)=>s+v,0)/data.length).toFixed(1) : '—';
    const overWarn = warnV !== undefined ? data.filter(v => v >= warnV).length : null;
    const overAlm  = almV  !== undefined ? data.filter(v => v >= almV).length  : null;

    // Events per day — dùng ngưỡng warning nếu có, ngược lại hiển thị tất cả sự kiện
    const eventThreshold = warnV ?? 0;
    const pdBins7 = Array(7).fill(0);
    const now7    = Date.now();
    this.pdH.filter(h => h.value >= eventThreshold).forEach(h => {
      const d = Math.floor((now7 - new Date(h.time).getTime()) / 86400000);
      if (d >= 0 && d < 7) pdBins7[6 - d]++;
    });

    this.setTabHTML('pd', `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
            Cường độ phóng điện (dB) — ${this.range}
          </div>
          <div style="position:relative;height:260px;"><canvas id="an-c-pd-line"></canvas></div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;min-width:180px;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Thống kê PD</div>
          <div style="margin-bottom:8px;"><div style="font-size:0.7rem;color:#94a3b8;">Min</div><div style="font-size:1.1rem;font-weight:700;color:#a855f7;">${minPD} dB</div></div>
          <div style="margin-bottom:8px;"><div style="font-size:0.7rem;color:#94a3b8;">Max</div><div style="font-size:1.1rem;font-weight:700;color:#ef4444;">${maxPD} dB</div></div>
          <div style="margin-bottom:12px;"><div style="font-size:0.7rem;color:#94a3b8;">Avg</div><div style="font-size:1.1rem;font-weight:700;color:#e2e8f0;">${avgPD} dB</div></div>
          ${warnV !== undefined ? `
          <div style="padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;margin-bottom:6px;">
            <div style="font-size:0.65rem;color:#f59e0b;">Vượt ${warnV}dB (warning)</div>
            <div style="font-size:1.2rem;font-weight:800;color:#f59e0b;">${overWarn} lần</div>
          </div>` : ''}
          ${almV !== undefined ? `
          <div style="padding:8px;background:rgba(239,68,68,0.1);border-radius:6px;">
            <div style="font-size:0.65rem;color:#ef4444;">Vượt ${almV}dB (alarm)</div>
            <div style="font-size:1.2rem;font-weight:800;color:#ef4444;">${overAlm} lần</div>
          </div>` : ''}
          ${warnV === undefined && almV === undefined ? `
          <div style="padding:8px;background:rgba(51,65,85,0.4);border-radius:6px;">
            <div style="font-size:0.65rem;color:#475569;font-style:italic;">Chưa cài ngưỡng</div>
          </div>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Sự kiện PD/ngày (7 ngày${warnV !== undefined ? `, >${warnV}dB` : ''})</div>
          <div style="position:relative;height:160px;"><canvas id="an-c-pd-bar"></canvas></div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Phân phối cường độ PD</div>
          <div style="position:relative;height:160px;"><canvas id="an-c-pd-hist"></canvas></div>
        </div>
      </div>
    `);

    // Line chart PD — ngưỡng từ Rules + NETA MTS 2023 cố định
    const nowMs = Date.now();
    const tMin  = nowMs - RMS[this.range];
    const pdDatasets: object[] = [
      {
        label: 'PD (dBmW)',
        data: this.pdH.map(h => ({x: new Date(h.time).getTime(), y: h.value})),
        borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)',
        borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, order: 1,
      },
      ...this.thresholdDatasets(PD_ID, tMin, nowMs),
      // NETA MTS 2023 — 3 ngưỡng cố định (không phụ thuộc rules)
      { label: 'NETA Monitor (−37)', data: [{x:tMin,y:-37},{x:nowMs,y:-37}],
        borderColor:'#eab308', backgroundColor:'transparent',
        borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0, order:98 },
      { label: 'NETA Warning (−27)', data: [{x:tMin,y:-27},{x:nowMs,y:-27}],
        borderColor:'#f97316', backgroundColor:'transparent',
        borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0, order:98 },
      { label: 'NETA Critical (−20)', data: [{x:tMin,y:-20},{x:nowMs,y:-20}],
        borderColor:'#ef4444', backgroundColor:'transparent',
        borderWidth:1, borderDash:[4,4], pointRadius:0, tension:0, order:98 },
    ];
    this.mkChart('an-c-pd-line', {
      type: 'line',
      data: { datasets: pdDatasets },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleTime(),
        y: { ...this.yScale(), title: { display:true, text:'dB', color:'#64748b', font:{size:10} } }
      } } as any,
    });

    // Bar events per day
    const dayLabels7 = Array.from({length:7}, (_,i) => {
      const d = new Date(now7 - (6-i)*86400000);
      return d.toLocaleDateString('vi-VN',{weekday:'short',day:'2-digit'});
    });
    this.mkChart('an-c-pd-bar', {
      type: 'bar',
      data: { labels: dayLabels7, datasets: [{
        label: `Sự kiện PD${warnV !== undefined ? ` >${warnV}dB` : ''}`, data: pdBins7, borderRadius: 4, borderWidth: 0,
        backgroundColor: pdBins7.map(v => v > 3 ? 'rgba(239,68,68,0.7)' : 'rgba(168,85,247,0.5)'),
      }] },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color:'#64748b', stepSize:1 } }
      }, plugins: { legend: { display:false } } } as any,
    });

    // Histogram
    const pdBuckets = Array(6).fill(0);
    const pdBLabels = ['<10','10-15','15-20','20-25','25-30','>30'];
    data.forEach(v => {
      if      (v <  10) pdBuckets[0]++;
      else if (v <  15) pdBuckets[1]++;
      else if (v <  20) pdBuckets[2]++;
      else if (v <  25) pdBuckets[3]++;
      else if (v <  30) pdBuckets[4]++;
      else              pdBuckets[5]++;
    });
    this.mkChart('an-c-pd-hist', {
      type: 'bar',
      data: { labels: pdBLabels, datasets: [{
        label: 'Số mẫu', data: pdBuckets, borderRadius: 4, borderWidth: 0,
        backgroundColor: ['#3b82f6','#22c55e','#a855f7','#f59e0b','#f97316','#ef4444'],
      }] },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale() }
      }, plugins: { legend: { display:false } } } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 4 — TƯƠNG QUAN
  // ══════════════════════════════════════════════════════════════
  private async buildCorrelation(): Promise<void> {
    await this.loadHistory();

    const scatterData = this.buildScatterData();
    const r = this.calcCorrelation(scatterData);
    const rLabel = Math.abs(r) > 0.7 ? '🔴 TƯƠNG QUAN CAO' : Math.abs(r) > 0.4 ? '🟡 TƯƠNG QUAN TRUNG BÌNH' : '🟢 TƯƠNG QUAN THẤP';

    this.setTabHTML('correlation', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Scatter: Nhiệt Pha 3 vs Phóng điện</div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:8px;">
            Hệ số tương quan r = <b style="color:#e2e8f0;">${r.toFixed(2)}</b> — ${rLabel}
          </div>
          <div style="position:relative;height:260px;"><canvas id="an-c-corr-scatter"></canvas></div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Dual-axis: Nhiệt °C + PD dB theo thời gian</div>
          <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:8px;">Trục trái: °C · Trục phải: dB</div>
          <div style="position:relative;height:260px;"><canvas id="an-c-corr-dual"></canvas></div>
        </div>
      </div>
      <div style="background:#0f172a;border:1px dashed #334155;border-radius:10px;padding:16px;">
        <div style="font-size:0.72rem;color:#475569;font-weight:700;margin-bottom:8px;">🤖 Nâng cấp với AI (sắp có)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          ${['Phát hiện bất thường tự động (anomaly detection)','Dự báo thời điểm vượt ngưỡng trong X ngày','Nhận dạng pattern phóng điện từ camera'].map(t => `
            <div style="background:#1e293b;border-radius:6px;padding:10px;font-size:0.72rem;color:#475569;">
              <div style="color:#334155;margin-bottom:4px;">⏳</div>${t}
            </div>`).join('')}
        </div>
      </div>
    `);

    // Scatter chart
    this.mkChart('an-c-corr-scatter', {
      type: 'scatter',
      data: { datasets: [{
        label: 'Nhiệt Pha 3 vs PD',
        data: scatterData,
        backgroundColor: 'rgba(168,85,247,0.5)',
        pointRadius: 3, pointHoverRadius: 5,
      }] },
      options: { ...this.baseOpts(), scales: {
        x: { ...this.yScale(), title: { display:true, text:'Nhiệt độ Pha 3 (°C)', color:'#64748b', font:{size:10} } },
        y: { ...this.yScale(), title: { display:true, text:'PD (dB)', color:'#64748b', font:{size:10} } },
      } } as any,
    });

    // Dual-axis chart
    const slice60 = (arr: HP[]) => arr.slice(-100).map(h => ({x: new Date(h.time).getTime(), y: h.value}));
    this.mkChart('an-c-corr-dual', {
      type: 'line',
      data: { datasets: [
        {
          label: 'Nhiệt Pha 3 (°C)', yAxisID: 'yTemp',
          data: slice60(this.tempH['nhiet_do_pha_3'] ?? []),
          borderColor: '#f59e0b', backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 0, tension: 0.3,
        },
        {
          label: 'PD (dB)', yAxisID: 'yPd',
          data: slice60(this.pdH),
          borderColor: '#a855f7', backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 0, tension: 0.3,
        },
      ] },
      options: {
        ...this.baseOpts(),
        scales: {
          x: this.xScaleTime(),
          yTemp: { ...this.yScale(), position:'left',  title: { display:true, text:'°C', color:'#f59e0b', font:{size:10} } },
          yPd:   { ...this.yScale(), position:'right', grid: { drawOnChartArea:false }, title: { display:true, text:'dB', color:'#a855f7', font:{size:10} } },
        },
      } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 5 — CẢNH BÁO
  // ══════════════════════════════════════════════════════════════
  private buildAlerts(): void {
    const alarm   = this.alerts.filter(a => a.level === 'alarm').length;
    const warning = this.alerts.filter(a => a.level === 'warning').length;
    const closed  = this.alerts.filter(a => a.status === 'closed');
    const handled = closed.filter(a => a.ackedAt && a.closedAt);
    const avgMs   = handled.length
      ? handled.reduce((s,a) => s + (new Date(a.closedAt!).getTime() - new Date(a.triggeredAt).getTime()), 0) / handled.length
      : 0;
    const avgMin  = (avgMs / 60000).toFixed(0);

    // By device
    const byDevice: Record<string, number> = {};
    this.alerts.forEach(a => {
      const dev = this.devices.find(d => d.id === a.deviceId)?.name ?? (a.deviceId ? 'Unknown' : 'Hệ thống');
      byDevice[dev] = (byDevice[dev] ?? 0) + 1;
    });
    const devEntries = Object.entries(byDevice).sort((a,b) => b[1]-a[1]).slice(0,5);

    // 30-day bar
    const bins30 = Array(30).fill(0);
    const now30  = Date.now();
    this.alerts.forEach(a => {
      const d = Math.floor((now30 - new Date(a.triggeredAt).getTime()) / 86400000);
      if (d >= 0 && d < 30) bins30[29 - d]++;
    });

    // Heatmap hour × weekday
    const heatmap = this.buildAlertHeatmap();
    const maxHM   = Math.max(...heatmap.flat(), 1);
    const DOW_LABELS = ['T2','T3','T4','T5','T6','T7','CN'];

    // Response time histogram
    const rBins = [0,0,0,0,0]; // <5, 5-30, 30-60, 60-240, >240 phút
    handled.forEach(a => {
      const m = (new Date(a.closedAt!).getTime() - new Date(a.triggeredAt).getTime()) / 60000;
      if      (m < 5)   (rBins[0] as number)++;
      else if (m < 30)  (rBins[1] as number)++;
      else if (m < 60)  (rBins[2] as number)++;
      else if (m < 240) (rBins[3] as number)++;
      else              (rBins[4] as number)++;
    });

    this.setTabHTML('alerts', `
      <div style="display:grid;grid-template-columns:180px 1fr 1fr;gap:12px;align-items:start;">
        <!-- Donut -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Phân loại</div>
          <div style="position:relative;height:140px;"><canvas id="an-c-al-donut"></canvas></div>
          <div style="margin-top:8px;font-size:0.7rem;">
            <div style="color:#ef4444;">Alarm: ${alarm}</div>
            <div style="color:#f59e0b;">Warning: ${warning}</div>
          </div>
        </div>
        <!-- By device -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Theo thiết bị</div>
          <div style="position:relative;height:160px;"><canvas id="an-c-al-device"></canvas></div>
        </div>
        <!-- Response time -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Thời gian xử lý</div>
          <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:8px;">Trung bình: <b style="color:#10b981;">${avgMin} phút</b></div>
          <div style="position:relative;height:130px;"><canvas id="an-c-al-resp"></canvas></div>
        </div>
      </div>

      <!-- 30 day trend -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Xu hướng 30 ngày</div>
        <div style="position:relative;height:120px;"><canvas id="an-c-al-trend"></canvas></div>
      </div>

      <!-- Heatmap -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
          Tần suất cảnh báo — Giờ × Thứ trong tuần
        </div>
        <div style="overflow-x:auto;">
          <table style="border-collapse:separate;border-spacing:2px;font-size:0.62rem;">
            <tr>
              <td style="padding:2px 8px 2px 0;color:#475569;white-space:nowrap;"></td>
              ${Array.from({length:24},(_,h) => `<td style="text-align:center;width:22px;color:#475569;padding:0;">${h}h</td>`).join('')}
            </tr>
            ${heatmap.map((row, dow) => `
              <tr>
                <td style="padding:2px 8px 2px 0;color:#94a3b8;font-weight:600;white-space:nowrap;">${DOW_LABELS[dow]}</td>
                ${row.map(count => `
                  <td title="${count} cảnh báo"
                    style="width:22px;height:16px;background:${this.freqCellColor(count, maxHM)};
                    border-radius:2px;text-align:center;color:${count>0?'rgba(255,255,255,0.7)':'transparent'};
                    font-size:0.55rem;">${count||''}</td>
                `).join('')}
              </tr>`).join('')}
          </table>
        </div>
      </div>
    `);

    // Donut
    this.mkChart('an-c-al-donut', {
      type: 'doughnut',
      data: { labels:['Alarm','Warning'], datasets:[{ data:[alarm,warning], backgroundColor:['#ef4444','#f59e0b'], borderWidth:0 }] },
      options: { ...this.baseOpts(), cutout:'65%', plugins: { legend: { display:false } } } as any,
    });

    // By device
    this.mkChart('an-c-al-device', {
      type: 'bar',
      data: { labels: devEntries.map(e => e[0]), datasets:[{
        label: 'Cảnh báo', data: devEntries.map(e => e[1]), borderRadius: 4, borderWidth: 0,
        backgroundColor: 'rgba(56,189,248,0.6)',
      }] },
      options: { ...this.baseOpts(), indexAxis:'y' as const, scales: {
        x: { ...this.yScale(), ticks: { color:'#64748b', stepSize:1 } },
        y: this.xScaleStr(),
      }, plugins: { legend: { display:false } } } as any,
    });

    // Response time
    this.mkChart('an-c-al-resp', {
      type: 'bar',
      data: { labels:['<5ph','5-30ph','30-60ph','1-4h','>4h'], datasets:[{
        data: rBins, borderRadius: 4, borderWidth: 0,
        backgroundColor: ['#10b981','#22c55e','#f59e0b','#f97316','#ef4444'],
      }] },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color:'#64748b', stepSize:1 } }
      }, plugins: { legend: { display:false } } } as any,
    });

    // 30-day trend
    const labels30 = Array.from({length:30}, (_,i) => {
      const d = new Date(now30 - (29-i)*86400000);
      return i % 5 === 0 ? d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : '';
    });
    this.mkChart('an-c-al-trend', {
      type: 'bar',
      data: { labels: labels30, datasets:[{
        label: 'Cảnh báo', data: bins30, borderRadius: 2, borderWidth: 0,
        backgroundColor: bins30.map(v => v > 5 ? 'rgba(239,68,68,0.7)' : 'rgba(56,189,248,0.4)'),
      }] },
      options: { ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color:'#64748b', stepSize:1 } }
      }, plugins: { legend: { display:false } } } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 6 — SỨC KHỎE & RỦI RO
  // ══════════════════════════════════════════════════════════════
  private async buildHealth(): Promise<void> {
    // Ưu tiên dùng dữ liệu từ API (HealthScoreWorker tính mỗi 1h)
    // Fallback về tính cục bộ từ alerts nếu API chưa có
    let apiScores: Array<{deviceId:string;deviceName:string;deviceType:string;score:number;risk:string}> = [];
    try {
      apiScores = await stationApi.getHealthScores();
    } catch { /* fallback */ }

    const scores = this.devices.map(d => {
      const api = apiScores.find(a => a.deviceId === d.id);
      const score = api?.score ?? this.calcHealthScore(d.id);
      const risk  = api?.risk  ?? (score >= 80 ? 'good' : score >= 60 ? 'fair' : score >= 40 ? 'poor' : 'critical');
      return { id: d.id, name: d.name, type: d.type, score, risk, alerts30: this.alertsForDevice(d.id, 30) };
    }).sort((a,b) => a.score - b.score);

    // Load trend data
    let trends: Array<{pointId:string;label:string;slopePerDay:number;trend:string;latestValue:number;unit:string}> = [];
    try { trends = await stationApi.getTrends(); } catch { /* skip */ }

    const scoreColor = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f97316' : '#ef4444';
    const scoreLabel = (s: number) => s >= 80 ? '🟢 TỐT' : s >= 60 ? '🟡 TB' : s >= 40 ? '🟠 KÉM' : '🔴 NGUY';
    const riskLabel  = (r: string) => ({ good:'THẤP', fair:'TRUNG BÌNH', poor:'CAO', critical:'RẤT CAO' }[r] ?? r.toUpperCase());
    const recommend  = (d: {score:number}) =>
      d.score >= 80 ? 'Kiểm tra định kỳ 6 tháng' :
      d.score >= 60 ? 'Lên lịch bảo trì trong 30 ngày' :
      'Cần bảo trì ngay / kiểm tra khẩn';

    const open   = this.alerts.filter(a => a.status === 'open').length;
    const acked  = this.alerts.filter(a => a.status === 'acked').length;
    const closed24 = this.alerts.filter(a => a.status === 'closed' && new Date(a.triggeredAt).getTime() > Date.now() - 86400000).length;

    this.setTabHTML('health', `
      <!-- Health scores -->
      <div style="background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:12px;">Điểm sức khỏe thiết bị (dựa trên alert 30 ngày)</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${scores.map(d => `
            <div style="display:grid;grid-template-columns:140px 60px 1fr 80px;align-items:center;gap:12px;">
              <div style="font-size:0.78rem;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.name}">${d.name}</div>
              <div style="font-size:0.78rem;font-weight:800;color:${scoreColor(d.score)};">${d.score}/100</div>
              <div style="background:#0f172a;border-radius:4px;height:10px;overflow:hidden;">
                <div style="height:100%;width:${d.score}%;background:${scoreColor(d.score)};border-radius:4px;transition:width .5s;"></div>
              </div>
              <div style="font-size:0.65rem;color:${scoreColor(d.score)};font-weight:600;">${scoreLabel(d.score)}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Risk table -->
      <div style="background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Bảng đánh giá rủi ro</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
          <thead>
            <tr style="border-bottom:1px solid #334155;">
              <th style="text-align:left;padding:6px 8px;color:#64748b;font-weight:600;">Thiết bị</th>
              <th style="text-align:center;padding:6px 8px;color:#64748b;font-weight:600;">Mức rủi ro</th>
              <th style="text-align:center;padding:6px 8px;color:#64748b;font-weight:600;">Alerts 30N</th>
              <th style="text-align:left;padding:6px 8px;color:#64748b;font-weight:600;">Khuyến nghị</th>
            </tr>
          </thead>
          <tbody>
            ${scores.map(d => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:7px 8px;color:#e2e8f0;font-weight:600;">${d.name}</td>
                <td style="padding:7px 8px;text-align:center;">
                  <span style="padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;
                    background:${d.score>=80?'rgba(16,185,129,0.15)':d.score>=60?'rgba(245,158,11,0.15)':d.score>=40?'rgba(249,115,22,0.15)':'rgba(239,68,68,0.15)'};
                    color:${scoreColor(d.score)};">${riskLabel(d.risk)}</span>
                </td>
                <td style="padding:7px 8px;text-align:center;color:#94a3b8;">${d.alerts30}</td>
                <td style="padding:7px 8px;color:#94a3b8;">${recommend(d)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Trend table -->
      ${trends.length > 0 ? `
      <div style="background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">📈 Xu hướng 7 ngày (phân tích tuyến tính)</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
          <thead>
            <tr style="border-bottom:1px solid #334155;">
              <th style="text-align:left;padding:5px 8px;color:#64748b;font-weight:600;">Điểm đo</th>
              <th style="text-align:right;padding:5px 8px;color:#64748b;font-weight:600;">Giá trị HT</th>
              <th style="text-align:right;padding:5px 8px;color:#64748b;font-weight:600;">Slope/ngày</th>
              <th style="text-align:center;padding:5px 8px;color:#64748b;font-weight:600;">Xu hướng</th>
            </tr>
          </thead>
          <tbody>
            ${trends.map(t => {
              const tCol = t.trend==='rising'?'#ef4444':t.trend==='falling'?'#10b981':'#64748b';
              const tIcon= t.trend==='rising'?'📈':t.trend==='falling'?'📉':'➡️';
              return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:5px 8px;color:#e2e8f0;">${t.label}</td>
                <td style="padding:5px 8px;text-align:right;color:#94a3b8;">${t.latestValue.toFixed(1)} ${t.unit}</td>
                <td style="padding:5px 8px;text-align:right;color:${tCol};font-weight:700;">${t.slopePerDay>=0?'+':''}${t.slopePerDay.toFixed(3)} ${t.unit}</td>
                <td style="padding:5px 8px;text-align:center;">${tIcon} <span style="color:${tCol};font-size:0.65rem;font-weight:700;">${t.trend.toUpperCase()}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Alert status -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Chưa xử lý</div>
          <div style="font-size:2rem;font-weight:800;color:${open>0?'#ef4444':'#10b981'};">${open}</div>
          <div style="font-size:0.7rem;color:#64748b;">${open>0?'⚠️ Cần xử lý ngay':'✅ Tất cả đã xử lý'}</div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Đang xử lý</div>
          <div style="font-size:2rem;font-weight:800;color:${acked>0?'#f59e0b':'#10b981'};">${acked}</div>
          <div style="font-size:0.7rem;color:#64748b;">Đã ACK, chờ đóng</div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Đóng 24h qua</div>
          <div style="font-size:2rem;font-weight:800;color:#10b981;">${closed24}</div>
          <div style="font-size:0.7rem;color:#64748b;">Đã giải quyết</div>
        </div>
      </div>

      <!-- AI placeholder -->
      <div style="background:#0f172a;border:1px dashed #334155;border-radius:10px;padding:16px;">
        <div style="font-size:0.72rem;color:#475569;font-weight:700;margin-bottom:8px;">🤖 Phân tích AI nâng cao (sắp có)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          ${['Dự báo điểm sức khỏe 30 ngày tới (ML trending)','Phát hiện bất thường so với baseline lịch sử','Đề xuất lịch bảo trì tối ưu dựa trên AI (CBM)'].map(t => `
            <div style="background:#1e293b;border-radius:6px;padding:10px;font-size:0.72rem;color:#475569;">
              <div style="color:#334155;margin-bottom:4px;">⏳</div>${t}
            </div>`).join('')}
        </div>
      </div>
    `);
  }

  // ── Helper: chart factory ─────────────────────────────────────
  private mkChart(id: string, config: object): void {
    const old = this.charts.get(id);
    if (old) { old.destroy(); this.charts.delete(id); }
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas) return;
    const chart = new Chart(canvas, config as any);
    const tabId = id.replace('an-c-', '').split('-')[0] as TabId;
    this.charts.set(`an-c-${tabId}-${id}`, chart);
    // Also store by canvas id for cleanup
    this.charts.set(id, chart);
  }

  private baseOpts() {
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { labels: { color:'#94a3b8', boxWidth:12, usePointStyle:true, font:{size:10} } },
        tooltip: {
          backgroundColor:'rgba(15,23,42,0.95)', titleColor:'#fff', bodyColor:'#94a3b8', borderColor:'#334155', borderWidth:1,
        },
      },
    };
  }

  private xScaleTime() {
    return { type:'linear' as const, grid:{ color:'rgba(255,255,255,0.04)' }, ticks: { color:'#64748b', font:{size:10}, maxTicksLimit:6,
      callback: (v: string|number) => {
        const d = new Date(Number(v));
        return ['1H','6H'].includes(this.range)
          ? d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})
          : d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
      }
    }};
  }

  private xScaleStr() {
    return { grid:{ display:false }, ticks:{ color:'#64748b', font:{size:9} } };
  }

  private yScale() {
    return { grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#64748b', font:{size:10} } };
  }

  // ── Helpers: data ─────────────────────────────────────────────
  private buildTempHeatmap(): {label:string; data:(number|null)[]}[] {
    const pha3 = this.tempH['nhiet_do_pha_3'] ?? [];
    const now  = Date.now();
    return Array.from({length:7}, (_,d) => {
      const dayStart = now - (6-d+1)*86400000;
      const dayEnd   = now - (6-d)*86400000;
      const date     = new Date(dayStart);
      const label    = date.toLocaleDateString('vi-VN',{weekday:'short',day:'2-digit',month:'2-digit'});
      const buckets  = Array.from({length:24},() => [] as number[]);
      pha3.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= dayStart && t < dayEnd;
      }).forEach(p => { (buckets[new Date(p.time).getHours()] as number[]).push(p.value); });
      return { label, data: (buckets as number[][]).map(b => b.length ? b.reduce((s,v)=>s+v,0)/b.length : null) };
    });
  }

  private buildAlertHeatmap(): number[][] {
    const grid: number[][] = Array.from({length:7}, () => Array(24).fill(0) as number[]);
    this.alerts.forEach(a => {
      const d = new Date(a.triggeredAt);
      const dow = (d.getDay() + 6) % 7;
      const row = grid[dow];
      if (row) row[d.getHours()] = (row[d.getHours()] ?? 0) + 1;
    });
    return grid;
  }

  private buildScatterData(): {x:number;y:number}[] {
    const tempData = this.tempH['nhiet_do_pha_3'] ?? [];
    if (!tempData.length || !this.pdH.length) return [];
    return this.pdH.map(pd => {
      const pdT = new Date(pd.time).getTime();
      const closest = tempData.reduce((b,t) =>
        Math.abs(new Date(t.time).getTime()-pdT) < Math.abs(new Date(b.time).getTime()-pdT) ? t : b
      );
      return Math.abs(new Date(closest.time).getTime()-pdT) < 30000
        ? {x: closest.value, y: pd.value} : null;
    }).filter((p): p is {x:number;y:number} => p !== null);
  }

  private calcCorrelation(pairs: {x:number;y:number}[]): number {
    const n = pairs.length;
    if (n < 2) return 0;
    const sx = pairs.reduce((s,p)=>s+p.x,0), sy = pairs.reduce((s,p)=>s+p.y,0);
    const sxy = pairs.reduce((s,p)=>s+p.x*p.y,0);
    const sx2 = pairs.reduce((s,p)=>s+p.x*p.x,0), sy2 = pairs.reduce((s,p)=>s+p.y*p.y,0);
    const den = Math.sqrt((n*sx2-sx*sx)*(n*sy2-sy*sy));
    return den === 0 ? 0 : (n*sxy-sx*sy)/den;
  }

  private calcHealthScore(deviceId: string): number {
    const d30 = Date.now() - 30*86400000;
    const devAlerts = this.alerts.filter(a => a.deviceId === deviceId && new Date(a.triggeredAt).getTime() > d30);
    const alarms  = devAlerts.filter(a => a.level === 'alarm').length;
    const warns   = devAlerts.filter(a => a.level === 'warning').length;
    return Math.max(0, Math.min(100, 100 - alarms*4 - warns*1));
  }

  private alertsForDevice(deviceId: string, days: number): number {
    const cutoff = Date.now() - days*86400000;
    return this.alerts.filter(a => a.deviceId === deviceId && new Date(a.triggeredAt).getTime() > cutoff).length;
  }

  // ── Helpers: visual ───────────────────────────────────────────
  private sparklineSvg(data: number[], color: string, w=100, h=28): string {
    if (data.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const min = Math.min(...data), max = Math.max(...data), rng = max-min||1;
    const pts = data.map((v,i) => {
      const x = (i/(data.length-1))*w;
      const y = h-((v-min)/rng)*(h-4)-2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  private tempCellColor(v: number|null, pointId?: string): string {
    if (v === null) return 'rgba(255,255,255,0.03)';
    const thr = pointId ? (this.thresholds[pointId] ?? []) : [];
    const almV  = thr.find(t => t.level === 'alarm')?.value;
    const warnV = thr.find(t => t.level === 'warning')?.value;
    if (almV  !== undefined && v >= almV)  return '#ef4444';
    if (warnV !== undefined && v >= warnV) return '#f59e0b';
    if (v >= 55) return '#eab308';
    if (v >= 45) return '#22c55e';
    return '#3b82f6';
  }

  // Color a value by its rule thresholds; fallback to default color
  private valColor(v: number|null, pointId: string, defaultColor: string): string {
    if (v === null) return defaultColor;
    const thr = this.thresholds[pointId] ?? [];
    const almV  = thr.find(t => t.level === 'alarm')?.value;
    const warnV = thr.find(t => t.level === 'warning')?.value;
    if (almV  !== undefined && v >= almV)  return '#ef4444';
    if (warnV !== undefined && v >= warnV) return '#f59e0b';
    return defaultColor;
  }

  private freqCellColor(count: number, max: number): string {
    if (!count || !max) return 'rgba(255,255,255,0.04)';
    const r = count/max;
    if (r >= 0.75) return '#ef4444';
    if (r >= 0.5)  return '#f97316';
    if (r >= 0.25) return '#f59e0b';
    return '#3b82f6';
  }

  // ── Destroy ───────────────────────────────────────────────────
  destroy(): void {
    if (this.live) clearInterval(this.live);
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
  }
}
