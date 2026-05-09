// ============================================================
// AnalyticsPage v3 — Phân tích toàn diện 6 tab
// Tổng quan · Nhiệt độ · Phóng điện · Tương quan · Cảnh báo · Sức khỏe
// ============================================================

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { stationApi, type AlertItem, type Device, type SensorPoint, type Rule } from '@/services/StationApiService';
import { API_BASE_URL } from '@/utils/env';

type TimeRange = '1H' | '6H' | '1D' | '1W' | '1M';
type TabId = 'overview' | 'temp' | 'pd' | 'correlation' | 'alerts' | 'health' | 'ai';
interface HP { time: string; value: number; }

// Threshold từ Rule: { value, level: 'warning'|'alarm', op: '>'|'>='|'<'|'<=' }
interface Threshold { value: number; level: string; op: string; label: string; }

// ── Cấu hình sensor ──────────────────────────────────────────
const T_IDS = ['nhiet_do_pha_1', 'nhiet_do_pha_2', 'nhiet_do_pha_3'];
const T_LABELS = ['Pha 1', 'Pha 2', 'Pha 3'];
const T_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
const PD_ID = 'phong_dien';

// 10 điểm nhiệt từ camera nhiệt
const CAM_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
const CAM_LABELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
const CAM_COLORS = [
  '#f43f5e', '#fb923c', '#facc15', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8',
];
const RMS: Record<TimeRange, number> = {
  '1H': 3600000, '6H': 21600000, '1D': 86400000, '1W': 604800000, '1M': 2592000000,
};
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Tổng quan' },
  { id: 'temp', icon: '🌡️', label: 'Nhiệt độ' },
  { id: 'pd', icon: '⚡', label: 'Phóng điện' },
  { id: 'correlation', icon: '🔗', label: 'Tương quan' },
  { id: 'alerts', icon: '🚨', label: 'Cảnh báo' },
  { id: 'health', icon: '❤️', label: 'Sức khỏe' },
  { id: 'ai', icon: '🤖', label: 'Phân tích AI' },
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
  private camH: Record<string, HP[]> = {};
  private pdH: HP[] = [];
  private activeTab: TabId = 'overview';
  private range: TimeRange = '1D';
  private live: ReturnType<typeof setInterval> | null = null;
  private aiPoller: ReturnType<typeof setInterval> | null = null;
  private tabReady = new Set<TabId>();

  // ── HTML shell ───────────────────────────────────────────────
  render(): string {
    return `
    <div id="an-root" style="display:flex;flex-direction:column;height:calc(100vh - 64px);background:#0f172a;overflow:hidden;">

      <!-- TABBAR -->
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:0 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;">
        <div style="display:flex;overflow-x:auto;">
          ${TABS.map((t, i) => `
            <button class="an-tab${i === 0 ? ' an-tab-active' : ''}" data-tab="${t.id}"
              style="padding:11px 14px;background:none;border:none;
              border-bottom:2px solid ${i === 0 ? '#2563eb' : 'transparent'};
              color:${i === 0 ? '#e2e8f0' : '#64748b'};font-size:0.76rem;font-weight:600;
              cursor:pointer;white-space:nowrap;transition:all .15s;">
              ${t.icon} ${t.label}
            </button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;padding-left:12px;">
          ${(['1H', '6H', '1D', '1W', '1M'] as TimeRange[]).map(r => `
            <button class="an-range${r === '1D' ? ' an-range-active' : ''}" data-range="${r}"
              style="padding:3px 9px;background:${r === '1D' ? '#1e3a5f' : 'none'};
              border:1px solid ${r === '1D' ? '#2563eb' : '#334155'};border-radius:4px;
              color:${r === '1D' ? '#60a5fa' : '#64748b'};font-size:0.7rem;font-weight:600;cursor:pointer;">${r}</button>
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
        ${TABS.map((t, i) => `
          <div id="an-tab-${t.id}" style="display:${i === 0 ? 'flex' : 'none'};
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
    this.startAiPoller();
  }

  private startAiPoller(): void {
    if (this.aiPoller) return;
    this.aiPoller = setInterval(async () => {
      if (this.live) return;
      const tab = this.activeTab;
      if (tab === 'ai' || tab === 'pd' || tab === 'overview') {
        try {
          console.log('[Analytics] Refreshing AI predictions in background...');
          if (this.stationId) {
            this.sensors = await stationApi.getLatestPoints(this.stationId);
          }
          await this.updateAiValuesOnly();
        } catch (e) { console.warn('[Analytics] BG AI poll failed:', e); }
      }
    }, 10000);
  }

  private async updateAiValuesOnly(): Promise<void> {
    // 1. Fetch predictions
    const [preds, pdPreds] = await Promise.all([
      fetch(`${window.location.origin}/ai-api/api/ai-predictions`).then(r => r.json()).catch(() => []),
      fetch(`${window.location.origin}/ai-api/api/pd-predictions`).then(r => r.json()).catch(() => [])
    ]);

    // 2. Update AI Tab elements if they exist
    const latestPd = pdPreds[pdPreds.length - 1];
    if (latestPd) {
      // Elements in PD Tab
      const elV = document.getElementById('pd-ai-pred');
      const elT = document.getElementById('pd-ai-pred-time');
      const elStD = document.getElementById('pd-ai-status-dot');
      const elStT = document.getElementById('pd-ai-status-text');
      if (elV) elV.innerHTML = `${parseFloat(latestPd.PredictedValue).toFixed(1)} <span style="font-size:0.8rem;color:#3b82f6;">dB</span>`;
      if (elT) elT.textContent = `📅 Lúc: ${latestPd.ForecastTime}`;
      const color = latestPd.Status === 'Alarm' ? '#ef4444' : latestPd.Status === 'Warning' ? '#f59e0b' : '#10b981';
      if (elStD) { elStD.style.background = color; elStD.style.boxShadow = `0 0 10px ${color}`; }
      if (elStT) { elStT.textContent = latestPd.Status === 'Alarm' ? 'RẤT CAO (Alarm)' : latestPd.Status === 'Warning' ? 'CAO (Warning)' : 'BÌNH THƯỜNG'; elStT.style.color = color; }

      // Elements in AI Tab (User's new layout)
      const elAiPdV = document.getElementById('ai-pd-val');
      const elAiPdF = document.getElementById('ai-pd-freq');
      const elAiPdA = document.getElementById('ai-pd-audio');
      const elAiPdS = document.getElementById('ai-pd-status');
      const elAiPdU = document.getElementById('ai-pd-update');

      if (elAiPdV) elAiPdV.innerHTML = `${parseFloat(latestPd.PredictedValue).toFixed(1)} <span style="font-size:1rem;">dB</span>`;
      if (elAiPdF) elAiPdF.innerHTML = `<span style="font-family: 'Courier New', monospace; background:#000; padding:2px 8px; border-radius:4px; border:1px solid #334155;">${parseFloat(latestPd.frequency || 0).toFixed(0)}</span> <span style="font-size:1rem; margin-left:4px;">Hz</span>`;
      
      const audioVal = parseFloat(latestPd.audioDecibel || 0);
      if (elAiPdA) elAiPdA.innerHTML = `${audioVal.toFixed(1)} <span style="font-size:1rem;">dB</span>`;
      
      // Cập nhật VU Meter cho Âm thanh
      const audioVuBar = document.getElementById('ai-audio-vu-bar');
      if (audioVuBar) {
        const percent = Math.min(100, Math.max(5, (audioVal / 100) * 100)); // Giả sử 0-100dB
        audioVuBar.style.width = `${percent}%`;
        audioVuBar.style.background = audioVal >= 80 ? '#ef4444' : audioVal >= 60 ? '#f59e0b' : '#10b981';
      }
      if (elAiPdS) {
        elAiPdS.textContent = latestPd.Status.toUpperCase();
        elAiPdS.style.color = color;
      }
      if (elAiPdU) elAiPdU.textContent = `Cập nhật: ${latestPd.ForecastTime.split(' ')[1] || '---'}`;
    }

    // Update AI Thermal Tab
    CAM_IDS.slice(0, 6).forEach(id => {
      const p = preds.find((x: any) => x.PointId === id);
      if (p) {
        const elV = document.getElementById(`ai-pd-val-${id}`);
        const elT = document.getElementById(`ai-pd-time-${id}`);
        const elSt = document.getElementById(`ai-pd-status-${id}`);
        if (elV) elV.textContent = `${parseFloat(p.PredictedValue).toFixed(1)}°C`;
        if (elT) elT.textContent = p.ForecastTime;
        if (elSt) {
          const color = p.Status === 'Alarm' ? '#ef4444' : p.Status === 'Warning' ? '#f59e0b' : '#10b981';
          elSt.textContent = p.Status.toUpperCase();
          elSt.style.background = `${color}20`;
          elSt.style.color = color;
          elSt.style.borderColor = `${color}40`;
        }
      }
    });

    // 3. Update Overview tab predicted values
    if (this.activeTab === 'overview') {
      await this.buildOverview(); // Overview is light enough to rebuild
    }
  }

  private bindExportHistory(): void {
    document.getElementById('btnExportHistory')?.addEventListener('click', () => {
      const token = localStorage.getItem('station_token') ?? '';
      const url = `${API_BASE_URL}/api/v1/history/export`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `history_${new Date().toISOString().slice(0, 10)}.csv`;
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
        (['temp', 'pd', 'correlation', 'ai'] as TabId[]).forEach(t => this.tabReady.delete(t));
        if (['temp', 'pd', 'correlation', 'ai'].includes(this.activeTab)) {
          this.tabReady.delete(this.activeTab);
          this.initTab(this.activeTab);
        }
      });
    });
  }

  private bindLiveToggle(): void {
    const e = document.getElementById('an-live') as HTMLInputElement;
    const track = document.getElementById('an-live-track')!;
    const thumb = document.getElementById('an-live-thumb')!;
    const r = document.getElementById('an-live-dot')!;
    const wrap = document.getElementById('an-live-wrap')!;
    wrap.addEventListener('click', () => {
      e.checked = !e.checked;
      if (e.checked) {
        track.style.background = '#1d4ed8'; thumb.style.left = '18px'; thumb.style.background = '#fff';
        r.style.color = '#10b981'; r.textContent = '● LIVE';
        this.live = setInterval(async () => {
          try {
            await this.loadAll();
            // Update the active tab without full re-render if it supports it
            switch (this.activeTab) {
              case 'overview': await this.buildOverview(); break;
              case 'temp': await this.buildTemp(); break;
              case 'pd': await this.buildPd(); break;
              case 'ai': await this.buildAi(); break;
            }
          } catch (err) {
            console.error('[Analytics] Live update error:', err);
          }
        }, 1000);
      } else {
        track.style.background = '#1e293b'; thumb.style.left = '2px'; thumb.style.background = '#475569';
        r.style.color = '#334155'; r.textContent = '●';
        if (this.live) { clearInterval(this.live); this.live = null; }
      }
    });
  }

  private async switchTab(id: TabId): Promise<void> {
    this.activeTab = id;
    TABS.forEach(t => {
      const panel = document.getElementById(`an-tab-${t.id}`)!;
      const btn = document.querySelector<HTMLElement>(`.an-tab[data-tab="${t.id}"]`)!;
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
    // Do NOT destroy if LIVE is active to avoid flickering
    if (!this.live) this.destroyTabCharts(id);
    switch (id) {
      case 'overview': await this.buildOverview(); break;
      case 'temp': await this.buildTemp(); break;
      case 'pd': await this.buildPd(); break;
      case 'correlation': await this.buildCorrelation(); break;
      case 'alerts': this.buildAlerts(); break;
      case 'health': await this.buildHealth(); break;
      case 'ai': await this.buildAi(); break;
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
    this.alerts = alerts;
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
        const cond = JSON.parse(r.condition) as { point?: string; op?: string; value?: number };
        const acts = JSON.parse(r.actions) as { level?: string }[];
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
    Object.values(map).forEach(arr => arr.sort((a, b) => a.value - b.value));
    return map;
  }

  // Tạo threshold datasets cho chart — chỉ vẽ nếu có rule
  private thresholdDatasets(pointId: string, timeMin: number, timeMax: number): object[] {
    const thresholds = this.thresholds[pointId];
    if (!thresholds?.length) return [];
    return thresholds.map(t => ({
      label: t.label,
      data: [{ x: timeMin, y: t.value }, { x: timeMax, y: t.value }],
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
    const now = new Date();
    const from = new Date(now.getTime() - RMS[this.range]);
    const tempSensors = T_IDS.map(pid => this.sensors.find(s => s.pointId === pid)).filter(Boolean) as SensorPoint[];
    const pdSensor = this.sensors.find(s => s.pointId === PD_ID);
    const camSensors = CAM_IDS.map(pid => this.sensors.find(s => s.pointId === pid)).filter(Boolean) as SensorPoint[];

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
    if (camSensors.length) {
      calls.push(...camSensors.map(s =>
        stationApi.getHistory(s.deviceId, s.pointId, from.toISOString(), now.toISOString(), 1000)
          .then(h => { this.camH[s.pointId] = h; })
          .catch(() => { this.camH[s.pointId] = []; })
      ));
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
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  private async buildAi(): Promise<void> {
    await this.loadHistory();

    // 1. Fetch dữ liệu dự báo Nhiệt độ & Phóng điện
    const [aiPreds, pdPreds] = await Promise.all([
      fetch(`${window.location.origin}/ai-api/api/ai-predictions`).then(r => r.json()).catch(() => []),
      fetch(`${window.location.origin}/ai-api/api/pd-predictions`).then(r => r.json()).catch(() => [])
    ]);

    // --- PHẦN NHIỆT ĐỘ ---
    const aiPoints = CAM_IDS.slice(0, 6).map((id, i) => {
      const sensor = this.sensors.find(s => s.pointId === id);
      const history = this.camH[id] ?? [];
      const last = history[history.length - 1] as any;
      const latestPred = aiPreds.filter((p: any) => p.Id === id || p.PointId === id).pop();
      let predVal = latestPred ? parseFloat(latestPred.PredictedValue) : (last?.predictedValue ?? null);
      return {
        id, label: CAM_LABELS[i], real: sensor?.value ?? 0, pred: predVal,
        status: (predVal !== null && predVal > 60) ? 'CRITICAL' : (predVal !== null && predVal > 50) ? 'WARNING' : 'STABLE',
        realTime: latestPred ? latestPred.Timestamp : (last?.time ? new Date(last.time).toLocaleTimeString('vi-VN') : '---'),
        predTime: latestPred?.ForecastTime || '---'
      };
    });

    // --- PHẦN PHÓNG ĐIỆN ---
    const latestPdPred = pdPreds.pop();
    const pdAiVal = latestPdPred ? parseFloat(latestPdPred.PredictedValue) : null;
    const pdAiStatus = (pdAiVal !== null && pdAiVal >= -20) ? 'CRITICAL' : (pdAiVal !== null && pdAiVal >= -27) ? 'WARNING' : 'STABLE';
    const statusColors: any = { STABLE: '#10b981', WARNING: '#f59e0b', CRITICAL: '#ef4444' };

    const isFirstLoad = !document.getElementById('an-c-ai-main');
    if (isFirstLoad) {
      this.setTabHTML('ai', `
        <div style="height: calc(100vh - 170px); overflow-y:auto; padding-right:10px; display:flex; flex-direction:column; gap:30px;">
          
          <!-- ROW 1: PD & ACOUSTIC AI ANALYSIS -->
          <div style="display:grid; grid-template-columns: 1fr 400px; gap: 12px;">
            <div style="background:linear-gradient(135deg, #1e293b, #0f172a); border-radius:10px; padding:16px; border:1px solid #1e3a8a;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; font-size:1rem; color:#60a5fa;">⚡ Dự báo Phóng điện & Âm thanh AI</h3>
                <div style="display:flex; gap:10px; font-size:0.65rem;">
                  <span style="color:#a855f7;">● PLC Actual</span> <span style="color:#60a5fa;">--- AI Prediction</span>
                </div>
              </div>
              <div style="height:280px; position:relative;"><canvas id="an-c-ai-pd"></canvas></div>
            </div>

            <div style="background:linear-gradient(135deg, #1e293b, #1e3a8a); border-radius:10px; padding:16px; border:1px solid #3b82f6;">
              <div style="font-size:0.85rem; color:#60a5fa; font-weight:700; margin-bottom:12px;">🤖 PD & ACOUSTIC INSIGHTS</div>
              <div id="ai-pd-insights-container" style="background:rgba(15,23,42,0.6); padding:18px; border-radius:8px; border:1px solid rgba(59,130,246,0.3); margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                  <span style="color:#94a3b8; font-size:0.9rem;">Trạng thái:</span>
                  <span id="ai-pd-status" style="font-weight:800; color:${statusColors[pdAiStatus]}; font-size:1.1rem;">${pdAiVal !== null ? pdAiStatus : 'WAITING'}</span>
                </div>
                <div id="ai-pd-update" style="text-align:right; color:#64748b; font-size:0.8rem; margin-bottom:12px;">
                  Cập nhật: ${latestPdPred?.Timestamp ? latestPdPred.Timestamp.split(' ')[1] : '---'}
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                  <div style="background:rgba(30,58,138,0.3); padding:12px; border-radius:6px;">
                    <div style="font-size:0.85rem; color:#64748b;">DỰ BÁO PD</div>
                    <div id="ai-pd-val" style="font-size:1.8rem; font-weight:900; color:#60a5fa;">${pdAiVal !== null ? pdAiVal.toFixed(1) : '---'} <span style="font-size:0.9rem;">dB</span></div>
                  </div>
                  <div style="background:rgba(30,58,138,0.3); padding:10px; border-radius:6px;">
                    <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">TẦN SỐ AI</div>
                    <div id="ai-pd-freq" style="font-size:1.8rem; font-weight:900; color:#a78bfa; line-height:1;">${(latestPdPred && latestPdPred.frequency !== undefined) ? parseFloat(latestPdPred.frequency).toFixed(0) : '---'} <span style="font-size:0.9rem;">Hz</span></div>
                    <div style="font-size:0.5rem; color:#475569; margin-top:8px; letter-spacing:1px;">SPECTRUM ANALYZER</div>
                  </div>
                </div>
                  <div style="background:rgba(30,58,138,0.3); padding:10px; border-radius:6px; text-align:center; margin-top:10px;">
                  <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">CƯỜNG ĐỘ ÂM THANH THỰC TẾ</div>
                  <div id="ai-pd-audio" style="font-size:1.6rem; font-weight:900; color:#e2e8f0; line-height:1;">${(latestPdPred && latestPdPred.audioDecibel !== undefined) ? parseFloat(latestPdPred.audioDecibel).toFixed(1) : '---'} <span style="font-size:0.9rem;">dB</span></div>
                  <!-- AUDIO VU METER -->
                  <div style="width:100%; height:4px; background:#0f172a; border-radius:2px; margin-top:12px; overflow:hidden;">
                     <div id="ai-audio-vu-bar" style="width:10%; height:100%; background:#10b981; transition: width 0.3s ease;"></div>
                  </div>
                </div>
              </div>
              <div style="font-size:0.6rem; color:#93c5fd; line-height:1.4; background:rgba(30,64,175,0.3); padding:8px; border-radius:6px;">
                ℹ️ Hệ thống đang lắng nghe âm thanh từ camera Acoustic Imaging để nhận diện tiếng đánh lửa và phóng điện.
              </div>
            </div>
          </div>

          <div style="border-top: 1px dashed #334155; margin: 10px 0;"></div>

          <!-- ROW 2: THERMAL AI ANALYSIS -->
          <div style="display:grid; grid-template-columns: 1fr 500px; gap:12px;">
            <div style="background:#1e293b; border-radius:10px; padding:16px; border:1px solid #334155;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; font-size:1rem; color:#e2e8f0;">📈 Dự báo Xu hướng Nhiệt độ</h3>
                <div style="display:flex; gap:10px; font-size:0.65rem;">
                  <span style="color:#10b981;">● Thực tế</span> <span style="color:#8b5cf6;">--- Dự báo AI</span>
                </div>
              </div>
              <div style="height:320px; position:relative;"><canvas id="an-c-ai-main"></canvas></div>
            </div>

            <div style="background:#1e293b; border-radius:10px; padding:16px; border:1px solid #334155;">
              <div style="font-size:0.85rem; color:#8b5cf6; font-weight:700; margin-bottom:12px;">🤖 THERMAL INSIGHTS</div>
              <div id="thermal-insights-list" style="display:flex; flex-direction:column; gap:8px;">
                ${aiPoints.map(p => `
                  <div class="ai-thermal-card" data-id="${p.id}" style="background:#0f172a; border-radius:8px; padding:12px 16px; border:1px solid #1e293b; transition: all 0.2s hover:border-[#8b5cf6]">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                      <span style="font-weight:700; color:#e2e8f0; font-size:1.1rem;">${p.label}</span>
                      <span id="ai-status-${p.id}" style="font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:4px; background:${statusColors[p.status]}22; color:${statusColors[p.status]}; border: 1px solid ${statusColors[p.status]}44;">${p.status}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px; font-size:0.85rem;">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#94a3b8; font-size:0.9rem;">Thực tế: <b id="ai-real-${p.id}" style="color:#e2e8f0; font-size:1.8rem; margin-left:8px;">${p.real.toFixed(1)}°C</b></span>
                        <span id="ai-realtime-${p.id}" style="color:#64748b; font-size:0.8rem; background:#1e293b; padding:2px 6px; border-radius:4px;">${p.realTime}</span>
                      </div>
                      <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid #1e293b; padding-top:8px;">
                        <span style="color:#a78bfa; font-size:0.9rem;">Dự báo: <b id="ai-pred-${p.id}" style="color:#c084fc; font-size:1.8rem; margin-left:8px;">${p.pred !== null ? p.pred.toFixed(1) + '°C' : '---'}</b></span>
                        <span id="ai-predtime-${p.id}" style="color:#64748b; font-size:0.8rem; background:#1e293b; padding:2px 6px; border-radius:4px;">${p.predTime}</span>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `);
    } else {
      // LIVE Update: only touch specific elements
      aiPoints.forEach(p => {
        const elReal = document.getElementById(`ai-real-${p.id}`);
        const elPred = document.getElementById(`ai-pred-${p.id}`);
        const elSt = document.getElementById(`ai-status-${p.id}`);
        const elRT = document.getElementById(`ai-realtime-${p.id}`);
        const elPT = document.getElementById(`ai-predtime-${p.id}`);

        if (elReal) elReal.textContent = `${p.real.toFixed(1)}°C`;
        if (elPred) elPred.textContent = p.pred !== null ? p.pred.toFixed(1) + '°C' : '---';
        if (elRT) elRT.textContent = p.realTime;
        if (elPT) elPT.textContent = p.predTime;
        if (elSt) {
          elSt.textContent = p.status;
          elSt.style.background = `${statusColors[p.status]}22`;
          elSt.style.color = statusColors[p.status];
          elSt.style.borderColor = `${statusColors[p.status]}44`;
        }
      });
      // PD Update
      const pdSt = document.getElementById('ai-pd-status');
      const pdUp = document.getElementById('ai-pd-update');
      const pdV = document.getElementById('ai-pd-val');
      const pdF = document.getElementById('ai-pd-freq');
      const pdA = document.getElementById('ai-pd-audio');
      if (pdSt) {
        pdSt.textContent = pdAiVal !== null ? pdAiStatus : 'WAITING';
        pdSt.style.color = statusColors[pdAiStatus];
      }
      if (pdUp) pdUp.textContent = `Cập nhật: ${latestPdPred?.Timestamp ? latestPdPred.Timestamp.split(' ')[1] : '---'}`;
      if (pdV) pdV.innerHTML = `${pdAiVal !== null ? pdAiVal.toFixed(1) : '---'} <span style="font-size:1rem;">dB</span>`;
      if (pdF) pdF.innerHTML = `${(latestPdPred && latestPdPred.frequency !== undefined) ? parseFloat(latestPdPred.frequency).toFixed(0) : '---'} <span style="font-size:1rem;">Hz</span>`;
      if (pdA) pdA.innerHTML = `${(latestPdPred && latestPdPred.audioDecibel !== undefined) ? parseFloat(latestPdPred.audioDecibel).toFixed(1) : '---'} <span style="font-size:1rem;">dB</span>`;
    }

    // --- VẼ BIỂU ĐỒ NHIỆT ĐỘ ---
    const datasets: any[] = [];
    aiPoints.forEach((p, i) => {
      const history = this.camH[p.id] ?? [];
      const realData = history.map(h => ({ x: new Date(h.time).getTime(), y: h.value }));

      // Lấy các điểm dự báo từ lịch sử (đã lưu trong DB)
      const predData = history.filter(h => (h as any).predictedValue).map(h => ({ x: new Date(h.time).getTime(), y: (h as any).predictedValue }));

      // [NEW] Lấy điểm dự báo tương lai từ AI API (nếu có)
      const latestFromApi = aiPreds.filter((apiP: any) => apiP.Id === p.id || apiP.PointId === p.id).pop();
      if (latestFromApi && latestFromApi.ForecastTime) {
        const fTime = new Date(latestFromApi.ForecastTime).getTime();
        const fVal = parseFloat(latestFromApi.PredictedValue);
        if (!isNaN(fTime) && !isNaN(fVal)) {
          predData.push({ x: fTime, y: fVal });
        }
      }

      datasets.push({
        label: `${p.label} (Real)`, data: realData,
        borderColor: CAM_COLORS[i], borderWidth: 2, pointRadius: 0, tension: 0.4
      });
      datasets.push({
        label: `${p.label} (AI)`, data: predData.sort((a, b) => a.x - b.x),
        borderColor: CAM_COLORS[i], borderDash: [5, 5], borderWidth: 1.5, pointRadius: 3, tension: 0.4
      });
    });
    this.mkChart('an-c-ai-main', {
      type: 'line', data: { datasets },
      options: {
        ...this.baseOpts(),
        scales: {
          x: this.xScaleTime(),
          y: { ...this.yScale(), min: 20 }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const isFuture = ctx.parsed.x > Date.now();
                return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}°C ${isFuture ? '[DỰ BÁO]' : ''}`;
              }
            }
          }
        }
      }
    });

    // --- VẼ BIỂU ĐỒ PHÓNG ĐIỆN (PD) ---
    const pdHistory = this.pdH ?? [];
    const pdRealData = pdHistory.map(h => ({ x: new Date(h.time).getTime(), y: h.value }));
    const pdPredData = pdHistory.filter(h => (h as any).predictedValue).map(h => ({ x: new Date(h.time).getTime(), y: (h as any).predictedValue }));

    // Nối điểm dự báo tương lai cho PD
    if (latestPdPred && latestPdPred.ForecastTime) {
      const fTime = new Date(latestPdPred.ForecastTime).getTime();
      const fVal = parseFloat(latestPdPred.PredictedValue);
      if (!isNaN(fTime) && !isNaN(fVal)) {
        pdPredData.push({ x: fTime, y: fVal });
      }
    }

    this.mkChart('an-c-ai-pd', {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'PD Actual (dB)', data: pdRealData,
            borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true
          },
          {
            label: 'PD AI Prediction', data: pdPredData.sort((a, b) => a.x - b.x),
            borderColor: '#60a5fa', borderDash: [6, 3], borderWidth: 2, pointRadius: 3, tension: 0.3
          }
        ]
      },
      options: { ...this.baseOpts(), scales: { x: this.xScaleTime(), y: { ...this.yScale() } } }
    });
  }



  // ── New Helpers ───────────────────────────────────────────────
  private groupHeader(icon: string, title: string, color: string, status: string, statusColor: string): string {
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
    <div style="width:3px;height:18px;background:${color};border-radius:2px;flex-shrink:0;"></div>
    <span style="font-size:0.68rem;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.5px;">${icon} ${title}</span>
    <span style="padding:2px 8px;background:${statusColor}22;border:1px solid ${statusColor}44;border-radius:10px;font-size:0.6rem;font-weight:700;color:${statusColor};">${status}</span>
  </div>`;
  }

  private camHotspotBar(): string {
    const sorted = CAM_IDS
      .map((id, i) => ({ id, label: CAM_LABELS[i]!, val: this.sensors.find(s => s.pointId === id)?.value ?? null }))
      .filter(c => c.val !== null)
      .sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
    if (!sorted.length) return '<div style="color:#475569;font-size:0.75rem;padding:8px;">Chưa có dữ liệu</div>';
    const maxVal = sorted[0]!.val ?? 1;
    return sorted.map((c, i) => {
      const pct = ((c.val ?? 0) / (maxVal || 1)) * 100;
      const color = (c.val ?? 0) >= 50 ? '#ef4444' : (c.val ?? 0) >= 40 ? '#f59e0b' : '#10b981';
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div style="font-size:0.68rem;color:${color};font-weight:${i === 0 ? '800' : '600'};width:26px;">${c.label}</div>
      <div style="flex:1;background:#0f172a;border-radius:3px;height:12px;overflow:hidden;">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:3px;"></div>
      </div>
      <div style="font-size:0.68rem;font-weight:700;color:${color};width:46px;text-align:right;">${(c.val ?? 0).toFixed(1)}°C</div>
      ${i === 0 ? '<span style="font-size:0.55rem;color:#ef4444;font-weight:800;">MAX</span>' : i === sorted.length - 1 ? '<span style="font-size:0.55rem;color:#3b82f6;font-weight:800;">MIN</span>' : '<span style="width:28px;"></span>'}
    </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 1 — TỔNG QUAN
  // ══════════════════════════════════════════════════════════════
  private async buildOverview(): Promise<void> {
    await this.loadHistory();
    const sensors = this.sensors;
    const tempSensors = T_IDS.map((id, i) => ({
      id, label: T_LABELS[i]!, color: T_COLORS[i]!,
      val: sensors.find(s => s.pointId === id)?.value ?? null,
      data: (this.tempH[id] ?? []).map(h => h.value),
    }));
    const pdVal = sensors.find(s => s.pointId === PD_ID)?.value ?? null;
    const pdData = this.pdH.map(h => h.value);
    const open = this.alerts.filter(a => a.status === 'open').length;
    const acked = this.alerts.filter(a => a.status === 'acked').length;

    // 7-day bar data
    const bins7 = Array(7).fill(0) as number[];
    const now = Date.now();
    const tempMaxVal = Math.max(...tempSensors.map(t => t.val ?? 0));
    const dayLabels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit' });
    });
    this.alerts.forEach(a => {
      const d = Math.floor((now - new Date(a.triggeredAt).getTime()) / 86400000);
      if (d >= 0 && d < 7) (bins7[6 - d] as number)++;
    });

    const plcStatus = pdVal !== null ? 'ONLINE' : 'OFFLINE';
    const plcStatusColor = pdVal !== null ? '#10b981' : '#64748b';
    const camSensors = CAM_IDS.map(id => sensors.find(s => s.pointId === id)).filter(Boolean);
    const camStatus = camSensors.length > 0 ? 'ONLINE' : 'OFFLINE';
    const camStatusColor = camSensors.length > 0 ? '#10b981' : '#64748b';

    const isFirstLoad = !document.getElementById('an-c-overview-trend');
    if (isFirstLoad) {
        this.setTabHTML('overview', `
        <!-- Row 1: Two groups side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <!-- LEFT: Tủ 471 -->
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
            <div id="ov-plc-header">${this.groupHeader('🔵', 'Tủ 471', '#3b82f6', plcStatus, plcStatusColor)}</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
              ${tempSensors.map(t => `
                <div style="background:#0f172a;border-radius:8px;padding:10px 12px;border:1px solid #1e293b;">
                  <div style="font-size:0.62rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Nhiệt ${t.label}</div>
                  <div id="ov-temp-${t.id}" style="font-size:1.3rem;font-weight:800;color:${this.valColor(t.val, t.id, t.color)};">
                    ${t.val !== null ? t.val.toFixed(1) : '—'}°C
                  </div>
                  <div id="ov-spark-${t.id}" style="margin-top:6px;">${this.sparklineSvg(t.data, t.color, 100, 24)}</div>
                </div>`).join('')}
              <div style="background:#0f172a;border-radius:8px;padding:10px 12px;border:1px solid #1e293b;">
                <div style="font-size:0.62rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Phóng điện PD</div>
                <div id="ov-pd-val" style="font-size:1.3rem;font-weight:800;color:${this.valColor(pdVal, PD_ID, '#a855f7')};">
                  ${pdVal !== null ? pdVal.toFixed(1) : '—'} dB
                </div>
                <div id="ov-pd-spark" style="margin-top:6px;">${this.sparklineSvg(pdData, '#a855f7', 100, 24)}</div>
              </div>
            </div>
          </div>
          <!-- RIGHT: Camera nhiệt -->
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
            <div id="ov-cam-header">${this.groupHeader('🟠', 'Camera nhiệt', '#f97316', camStatus, camStatusColor)}</div>
            <div id="ov-cam-hotspots">${this.camHotspotBar()}</div>
          </div>
        </div>

        <!-- Row 2: Trend charts side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
              Xu hướng nhiệt 3 pha (°C) <span style="color:#3b82f6;margin-left:6px;">● Tủ 471</span>
            </div>
            <div style="position:relative;height:140px;"><canvas id="an-c-overview-trend"></canvas></div>
          </div>
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Cảnh báo 7 ngày qua</div>
            <div style="position:relative;height:140px;"><canvas id="an-c-overview-bar"></canvas></div>
          </div>
        </div>

        <!-- Row 3: System status boxes -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Chưa xử lý</div>
            <div id="ov-alerts-open" style="font-size:1.6rem;font-weight:800;color:${open > 0 ? '#ef4444' : '#10b981'};">${open}</div>
            <div id="ov-alerts-status" style="font-size:0.7rem;color:#64748b;">${open > 0 ? '⚠️ Cần xử lý ngay' : '✅ Bình thường'}</div>
          </div>
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Đang ACK</div>
            <div id="ov-alerts-acked" style="font-size:1.6rem;font-weight:800;color:${acked > 0 ? '#f59e0b' : '#10b981'};">${acked}</div>
            <div style="font-size:0.7rem;color:#64748b;">Chờ đóng</div>
          </div>
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Max Temp PLC</div>
            <div id="ov-temp-max" style="font-size:1.6rem;font-weight:800;color:${tempMaxVal >= 50 ? '#ef4444' : tempMaxVal >= 40 ? '#f59e0b' : '#10b981'};">${tempMaxVal.toFixed(0)}°C</div>
            <div style="font-size:0.7rem;color:#64748b;">3 pha hiện tại</div>
          </div>
        </div>
      `);
      } else {
        // LIVE Update: only touch specific elements
        const elPlcH = document.getElementById('ov-plc-header');
        const elCamH = document.getElementById('ov-cam-header');
        const elCamHot = document.getElementById('ov-cam-hotspots');
        if (elPlcH) elPlcH.innerHTML = this.groupHeader('🔵', 'Tủ 471', '#3b82f6', plcStatus, plcStatusColor);
        if (elCamH) elCamH.innerHTML = this.groupHeader('🟠', 'Camera nhiệt', '#f97316', camStatus, camStatusColor);
        if (elCamHot) elCamHot.innerHTML = this.camHotspotBar();

        tempSensors.forEach(t => {
          const elV = document.getElementById(`ov-temp-${t.id}`);
          const elS = document.getElementById(`ov-spark-${t.id}`);
          if (elV) {
            elV.textContent = `${t.val !== null ? t.val.toFixed(1) : '—'}°C`;
            elV.style.color = this.valColor(t.val, t.id, t.color);
          }
          if (elS) elS.innerHTML = this.sparklineSvg(t.data, t.color, 100, 24);
        });

        const pdV = document.getElementById('ov-pd-val');
        const pdS = document.getElementById('ov-pd-spark');
        if (pdV) {
          pdV.textContent = `${pdVal !== null ? pdVal.toFixed(1) : '—'} dB`;
          pdV.style.color = this.valColor(pdVal, PD_ID, '#a855f7');
        }
        if (pdS) pdS.innerHTML = this.sparklineSvg(pdData, '#a855f7', 100, 24);

        const alO = document.getElementById('ov-alerts-open');
        const alA = document.getElementById('ov-alerts-acked');
        const alS = document.getElementById('ov-alerts-status');
        if (alO) { alO.textContent = String(open); alO.style.color = open > 0 ? '#ef4444' : '#10b981'; }
        if (alA) { alA.textContent = String(acked); alA.style.color = acked > 0 ? '#f59e0b' : '#10b981'; }
        if (alS) alS.textContent = open > 0 ? '⚠️ Cần xử lý ngay' : '✅ Bình thường';

        const tMax = document.getElementById('ov-temp-max');
        if (tMax) {
          tMax.textContent = `${tempMaxVal.toFixed(0)}°C`;
          tMax.style.color = tempMaxVal >= 50 ? '#ef4444' : tempMaxVal >= 40 ? '#f59e0b' : '#10b981';
        }
    }

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
      options: {
        ...this.baseOpts(), scales: {
          x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
        }, plugins: { legend: { display: false } }
      } as any,
    });

    // Trend mini (last portion of history)
    const trendDatasets = tempSensors.map((t, i) => ({
      label: t.label,
      data: (this.tempH[t.id] ?? []).slice(-60).map(h => ({ x: new Date(h.time).getTime(), y: h.value })),
      borderColor: T_COLORS[i]!, backgroundColor: 'transparent',
      borderWidth: 1.5, pointRadius: 0, tension: 0.3,
    }));
    this.mkChart('an-c-overview-trend', {
      type: 'line',
      data: { datasets: trendDatasets },
      options: {
        ...this.baseOpts(), scales: {
          x: { ...this.xScaleTime(), ticks: { color: '#64748b', maxTicksLimit: 6 } },
          y: { ...this.yScale(), title: { display: true, text: '°C', color: '#64748b', font: { size: 10 } } }
        }
      } as any,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2 — NHIỆT ĐỘ
  // ══════════════════════════════════════════════════════════════
  private async buildTemp(): Promise<void> {
    await this.loadHistory();

    const stats = T_IDS.map((id, i) => {
      const data = (this.tempH[id] ?? []).map(h => h.value);
      const thr = this.thresholds[id] ?? [];
      const warnV = thr.find(t => t.level === 'warning')?.value;
      const almV = thr.find(t => t.level === 'alarm')?.value;
      return {
        label: T_LABELS[i]!, color: T_COLORS[i]!,
        min: data.length ? Math.min(...data).toFixed(1) : '—',
        max: data.length ? Math.max(...data).toFixed(1) : '—',
        avg: data.length ? (data.reduce((s, v) => s + v, 0) / data.length).toFixed(1) : '—',
        overWarn: warnV !== undefined ? data.filter(v => v >= warnV).length : null,
        overAlm: almV !== undefined ? data.filter(v => v >= almV).length : null,
        warnV, almV,
      };
    });

    const heatmapRows = this.buildTempHeatmap();

    // Heatmap legend (depends on Pha 3 thresholds)
    const thr3 = this.thresholds[T_IDS[2] ?? ''] ?? [];
    const hmWarnV = thr3.find((t: Threshold) => t.level === 'warning')?.value;
    const hmAlmV = thr3.find((t: Threshold) => t.level === 'alarm')?.value;
    const hmLegend = hmWarnV !== undefined && hmAlmV !== undefined
      ? `< span > <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;" > </span> ≥${hmWarnV}°C (warning)</span >
      <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;" > </span> ≥${hmAlmV}°C (alarm)</span > `
      : hmWarnV !== undefined
        ? `< span > <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;" > </span> ≥${hmWarnV}°C (warning)</span > `
        : hmAlmV !== undefined
          ? `< span > <span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;" > </span> ≥${hmAlmV}°C (alarm)</span > `
          : `< span > <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;" > </span> 55–65°C</span >
      <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;" > </span> &gt;65°C</span > `;

    // Camera sorted for bar
    const camSorted = CAM_IDS.map((id, i) => ({
      id, label: CAM_LABELS[i]!,
      val: this.sensors.find(s => s.pointId === id)?.value ?? 0,
      color: CAM_COLORS[i]!,
    })).sort((a, b) => b.val - a.val);

    // PLC status
    const plcAnyWarn = T_IDS.some(id => {
      const val = this.sensors.find(s => s.pointId === id)?.value ?? null;
      if (val === null) return false;
      const wV = (this.thresholds[id] ?? []).find(t => t.level === 'warning')?.value;
      return wV !== undefined && val >= wV;
    });
    const plcStatus = plcAnyWarn ? 'CẢNH BÁO' : 'BÌNH THƯỜNG';
    const plcSC = plcAnyWarn ? '#f59e0b' : '#10b981';

    const camMaxVal2 = camSorted.length ? camSorted[0]!.val : 0;
    const camStatus2 = camMaxVal2 >= 50 ? 'CẢNH BÁO' : 'BÌNH THƯỜNG';
    const camSC2 = camMaxVal2 >= 50 ? '#f59e0b' : '#10b981';

    const isFirstLoad = !document.getElementById('an-c-temp-line');
    if (isFirstLoad) {
      this.setTabHTML('temp', `
        < !--Section: Tủ 471 -- >
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
            <div id="temp-plc-header" > ${ this.groupHeader('🔵', 'Tủ 471 — PLC S7-1200', '#3b82f6', plcStatus, plcSC) } </div>
              < div style = "display:grid;grid-template-columns:1fr auto;gap:12px;" >
                <!--Line chart-- >
                  <div>
                  <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" >
                    Nhiệt độ 3 pha(°C) — ${ this.range }
    </div>
      < div style = "position:relative;height:240px;" > <canvas id="an-c-temp-line" > </canvas></div >
        </div>
        < !--Stats box-- >
          <div style="min-width:200px;" >
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;" > Thống kê </div>
              < div id = "temp-stats-list" >
                ${
                  stats.map(s => `
                  <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #0f172a;">
                    <div style="font-size:0.75rem;font-weight:700;color:${s.color};margin-bottom:4px;">${s.label}</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">Min: <b style="color:#e2e8f0;">${s.min}°C</b></div>
                    <div style="font-size:0.7rem;color:#94a3b8;">Max: <b style="color:#e2e8f0;">${s.max}°C</b></div>
                    <div style="font-size:0.7rem;color:#94a3b8;">Avg: <b style="color:#e2e8f0;">${s.avg}°C</b></div>
                    ${s.warnV !== undefined ? `<div style="font-size:0.7rem;color:#f59e0b;">>${s.warnV}°C (warning): ${s.overWarn} lần</div>` : ''}
                    ${s.almV !== undefined ? `<div style="font-size:0.7rem;color:#ef4444;">>${s.almV}°C (alarm): ${s.overAlm} lần</div>` : ''}
                    ${s.warnV === undefined && s.almV === undefined ? `<div style="font-size:0.65rem;color:#334155;font-style:italic;">Chưa cài ngưỡng</div>` : ''}
                  </div>`).join('')
    }
    </div>
      </div>
      </div>
      < !--Heatmap -->
        <div style="margin-top:14px;" >
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" >
            Heatmap nhiệt độ Pha 3 theo giờ(7 ngày)
              </div>
              < div style = "overflow-x:auto;" >
                <table style="border-collapse:separate;border-spacing:2px;font-size:0.62rem;" >
                  <thead>
                  <tr>
                  <td style="padding:2px 8px 2px 0;color:#475569;white-space:nowrap;" > </td>
                    ${ Array.from({ length: 24 }, (_, h) => `<td style="text-align:center;width:22px;color:#475569;padding:0;">${h}h</td>`).join('') }
    </tr>
      </thead>
      < tbody id = "temp-heatmap-body" >
        ${
          heatmapRows.map(row => `
                    <tr>
                      <td style="padding:2px 8px 2px 0;color:#94a3b8;font-weight:600;white-space:nowrap;">${row.label}</td>
                      ${row.data.map(val => `
                        <td title="${val !== null ? val.toFixed(1) + '°C' : '—'}"
                          style="width:22px;height:16px;background:${this.tempCellColor(val, T_IDS[2])};border-radius:2px;opacity:0.85;"></td>
                      `).join('')}
                    </tr>`).join('')
    }
    </tbody>
      </table>
      </div>
      < div style = "display:flex;gap:12px;margin-top:8px;font-size:0.62rem;color:#64748b;" >
        <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;" > </span> &lt;45°C</span >
          <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;" > </span> 45–55°C</span >
            <div id="temp-hm-legend" style = "display:flex;gap:12px;" > ${ hmLegend } </div>
              </div>
              </div>
              </div>

              < !--Section: Camera nhiệt-- >
                <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
                  <div id="temp-cam-header" > ${ this.groupHeader('🟠', 'Camera nhiệt — 10 điểm đo', '#f97316', camStatus2, camSC2) } </div>
                    < !--Horizontal bar chart-- >
                      <div style="margin-bottom:14px;" >
                        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" >
                          Nhiệt độ hiện tại — sắp xếp cao → thấp
                            </div>
                            < div style = "position:relative;height:220px;" > <canvas id="an-c-cam-bar" > </canvas></div >
                              </div>
                              < !--Line chart P1 - P10-- >
                                <div>
                                <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" >
                                  10 điểm đo theo thời gian(°C) — ${ this.range }
    </div>
      < div style = "position:relative;height:200px;" > <canvas id="an-c-cam-line" > </canvas></div >
        </div>
        </div>

        < !--Histogram phân phối-- >
          <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" > Phân phối nhiệt độ(Tủ 471) </div>
              < div style = "position:relative;height:160px;" > <canvas id="an-c-temp-hist" > </canvas></div >
                </div>
                  `);
    } else {
      // LIVE Update
      const elH = document.getElementById('temp-plc-header');
      if (elH) elH.innerHTML = this.groupHeader('🔵', 'Tủ 471 — PLC S7-1200', '#3b82f6', plcStatus, plcSC);
      const elCH = document.getElementById('temp-cam-header');
      if (elCH) elCH.innerHTML = this.groupHeader('🟠', 'Camera nhiệt — 10 điểm đo', '#f97316', camStatus2, camSC2);
      const elStats = document.getElementById('temp-stats-list');
      if (elStats) {
        elStats.innerHTML = stats.map(s => `
                < div style = "margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #0f172a;" >
                  <div style="font-size:0.75rem;font-weight:700;color:${s.color};margin-bottom:4px;" > ${ s.label } </div>
                    < div style = "font-size:0.7rem;color:#94a3b8;" > Min: <b style="color:#e2e8f0;" > ${ s.min }°C < /b></div >
                      <div style="font-size:0.7rem;color:#94a3b8;" > Max: <b style="color:#e2e8f0;" > ${ s.max }°C < /b></div >
                        <div style="font-size:0.7rem;color:#94a3b8;" > Avg: <b style="color:#e2e8f0;" > ${ s.avg }°C < /b></div >
                          ${ s.warnV !== undefined ? `<div style="font-size:0.7rem;color:#f59e0b;">>${s.warnV}°C (warning): ${s.overWarn} lần</div>` : '' }
            ${ s.almV !== undefined ? `<div style="font-size:0.7rem;color:#ef4444;">>${s.almV}°C (alarm): ${s.overAlm} lần</div>` : '' }
            ${ s.warnV === undefined && s.almV === undefined ? `<div style="font-size:0.65rem;color:#334155;font-style:italic;">Chưa cài ngưỡng</div>` : '' }
    </div>`).join('');
  }
  const elHM = document.getElementById('temp-heatmap-body');
  if(elHM) {
    elHM.innerHTML = heatmapRows.map(row => `
          <tr>
            <td style="padding:2px 8px 2px 0;color:#94a3b8;font-weight:600;white-space:nowrap;">${row.label}</td>
            ${row.data.map(val => `
              <td title="${val !== null ? val.toFixed(1) + '°C' : '—'}"
                style="width:22px;height:16px;background:${this.tempCellColor(val, T_IDS[2])};border-radius:2px;opacity:0.85;"></td>
            `).join('')}
          </tr>`).join('');
  }
  const elLeg = document.getElementById('temp-hm-legend');
  if(elLeg) elLeg.innerHTML = hmLegend;
}

// Line chart với ngưỡng từ Rules
const now = Date.now();
const tMin = now - RMS[this.range], tMax = now;
const datasets: object[] = T_IDS.map((id, i) => ({
  label: T_LABELS[i]!,
  data: (this.tempH[id] ?? []).map(h => ({ x: new Date(h.time).getTime(), y: h.value })),
  borderColor: T_COLORS[i]!, backgroundColor: 'transparent',
  borderWidth: 2, pointRadius: 0, tension: 0.3, order: i + 1,
}));
// Chỉ thêm threshold lines nếu có rule cho sensor đó
T_IDS.forEach(id => {
  this.thresholdDatasets(id, tMin, tMax).forEach(d => datasets.push(d));
});

this.mkChart('an-c-temp-line', {
  type: 'line', data: { datasets },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleTime(), y: { ...this.yScale(), title: { display: true, text: '°C', color: '#64748b', font: { size: 10 } } }
    }
  } as any,
});

// Camera horizontal bar chart sorted high→low
this.mkChart('an-c-cam-bar', {
  type: 'bar',
  data: {
    labels: camSorted.map(c => c.label),
    datasets: [{
      label: '°C',
      data: camSorted.map(c => c.val),
      backgroundColor: camSorted.map(c => c.val >= 50 ? 'rgba(239,68,68,0.8)' : c.val >= 40 ? 'rgba(245,158,11,0.8)' : 'rgba(16,185,129,0.7)'),
      borderRadius: 4, borderWidth: 0,
    }],
  },
  options: {
    ...this.baseOpts(), indexAxis: 'y' as const, scales: {
      x: { ...this.yScale(), title: { display: true, text: '°C', color: '#64748b', font: { size: 10 } } },
      y: this.xScaleStr(),
    }, plugins: { legend: { display: false } }
  } as any,
});

// Chart P1-P10 camera nhiệt
const camDatasets: object[] = CAM_IDS.map((id, i) => ({
  label: CAM_LABELS[i]!,
  data: (this.camH[id] ?? []).map(h => ({ x: new Date(h.time).getTime(), y: h.value })),
  borderColor: CAM_COLORS[i]!, backgroundColor: 'transparent',
  borderWidth: 1.5, pointRadius: 0, tension: 0.3,
}));
this.mkChart('an-c-cam-line', {
  type: 'line', data: { datasets: camDatasets },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleTime(),
      y: { ...this.yScale(), title: { display: true, text: '°C', color: '#64748b', font: { size: 10 } } }
    }
  } as any,
});

// Histogram phân phối nhiệt
const allTemp = T_IDS.flatMap(id => (this.tempH[id] ?? []).map(h => h.value));
const buckets = Array(8).fill(0) as number[];
const bucketLabels = ['<40', '40-45', '45-50', '50-55', '55-60', '60-65', '65-70', '>70'];
allTemp.forEach(v => {
  if (v < 40) (buckets[0] as number)++;
  else if (v < 45) (buckets[1] as number)++;
  else if (v < 50) (buckets[2] as number)++;
  else if (v < 55) (buckets[3] as number)++;
  else if (v < 60) (buckets[4] as number)++;
  else if (v < 65) (buckets[5] as number)++;
  else if (v < 70) (buckets[6] as number)++;
  else (buckets[7] as number)++;
});
this.mkChart('an-c-temp-hist', {
  type: 'bar',
  data: {
    labels: bucketLabels, datasets: [{
      label: 'Số mẫu', data: buckets, borderRadius: 4, borderWidth: 0,
      backgroundColor: ['#3b82f6', '#3b82f6', '#22c55e', '#22c55e', '#eab308', '#f59e0b', '#f97316', '#ef4444'],
    }]
  },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleStr(), y: { ...this.yScale(), title: { display: true, text: 'Số mẫu', color: '#64748b', font: { size: 10 } } }
    }, plugins: { legend: { display: false } }
  } as any,
});
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 3 — PHÓNG ĐIỆN
  // ══════════════════════════════════════════════════════════════
  private async buildPd(): Promise < void> {
  await this.loadHistory();

  const data = this.pdH.map(h => h.value);
  const pdThr = this.thresholds[PD_ID] ?? [];
  const warnV = pdThr.find(t => t.level === 'warning')?.value;
  const almV = pdThr.find(t => t.level === 'alarm')?.value;
  const maxPD = data.length ? Math.max(...data).toFixed(1) : '—';
  const avgPD = data.length ? (data.reduce((s, v) => s + v, 0) / data.length).toFixed(1) : '—';
  const minPD = data.length ? Math.min(...data).toFixed(1) : '—';
  const overWarn = warnV !== undefined ? data.filter(v => v >= warnV).length : null;
  const overAlm = almV !== undefined ? data.filter(v => v >= almV).length : null;

  // Events per day
  const eventThreshold = warnV ?? 0;
  const pdBins7 = Array(7).fill(0) as number[];
  const now7 = Date.now();
  this.pdH.filter(h => h.value >= eventThreshold).forEach(h => {
    const d = Math.floor((now7 - new Date(h.time).getTime()) / 86400000);
    if (d >= 0 && d < 7) (pdBins7[6 - d] as number)++;
  });

  // PD sensor belongs to Tủ 471
  const pdStatus = (almV !== undefined && data.some(v => v >= almV)) ? 'CẢNH BÁO NGUY HIỂM' :
    (warnV !== undefined && data.some(v => v >= warnV)) ? 'CẢNH BÁO' : 'BÌNH THƯỜNG';
  const pdSC = pdStatus.includes('NGUY') ? '#ef4444' : pdStatus === 'CẢNH BÁO' ? '#f59e0b' : '#10b981';

  // [AI] Lấy dữ liệu dự báo Phóng điện
  const pdPreds = await fetch(`${window.location.origin}/ai-api/api/pd-predictions`)
    .then(r => r.json())
    .catch(() => []);
  const latestPdPred = pdPreds.pop();
  const pdAiVal = latestPdPred ? parseFloat(latestPdPred.PredictedValue) : null;
  const pdAiStatus = (pdAiVal !== null && pdAiVal >= -20) ? 'NGUY HIỂM' : (pdAiVal !== null && pdAiVal >= -27) ? 'CẢNH BÁO' : 'BÌNH THƯỜNG';
  const pdAiColor = pdAiStatus === 'NGUY HIỂM' ? '#ef4444' : pdAiStatus === 'CẢNH BÁO' ? '#f59e0b' : '#10b981';


    const isFirstLoad = !document.getElementById('an-c-pd-line');
    if (isFirstLoad) {
      this.setTabHTML('pd', `
    < div style = "background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
    <div id="pd-plc-header" > ${ this.groupHeader('🔵', 'Tủ 471 — Cảm biến phóng điện', '#3b82f6', pdStatus, pdSC) } </div>
  < div style = "font-size:0.7rem;color:#64748b;margin-bottom:12px;" >
  Sensor: <code style="color:#a855f7;background:#0f172a;padding:1px 6px;border-radius:3px;" > phong_dien </code>
  & nbsp;·& nbsp; Đơn vị: dBmW & nbsp;·& nbsp; PLC S7 - 1200
    </div>

    < div style = "display:grid;grid-template-columns:1fr 220px;gap:12px;" >
      <div>
      <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" >
        Cường độ phóng điện(dB) — ${ this.range }
</div>
  < div style = "position:relative;height:260px;" > <canvas id="an-c-pd-line" > </canvas></div >
    </div>

    < !--THỐNG KÊ KỸ THUẬT-- >
      <div id="pd-stats-panel" style = "background:#0f172a;border-radius:8px;padding:14px 16px;border:1px solid #1e293b;min-width:180px;" >
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;" > Thống kê PD </div>
          < div style = "margin-bottom:8px;" > <div style="font-size:0.7rem;color:#94a3b8;" > Min < /div><div id="pd-min" style="font-size:1.1rem;font-weight:700;color:#a855f7;">${minPD} dB</div > </div>
            < div style = "margin-bottom:8px;" > <div style="font-size:0.7rem;color:#94a3b8;" > Max < /div><div id="pd-max" style="font-size:1.1rem;font-weight:700;color:#ef4444;">${maxPD} dB</div > </div>
              < div style = "margin-bottom:12px;" > <div style="font-size:0.7rem;color:#94a3b8;" > Avg < /div><div id="pd-avg" style="font-size:1.1rem;font-weight:700;color:#e2e8f0;">${avgPD} dB</div > </div>
                < div id = "pd-alerts-box" >
                  ${
                    warnV !== undefined ? `
                <div style="padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;margin-bottom:6px;">
                  <div style="font-size:0.65rem;color:#f59e0b;">Vượt ${warnV}dB (warning)</div>
                  <div style="font-size:1.2rem;font-weight:800;color:#f59e0b;">${overWarn} lần</div>
                </div>` : ''
}
                ${
  almV !== undefined ? `
                <div style="padding:8px;background:rgba(239,68,68,0.1);border-radius:6px;">
                  <div style="font-size:0.65rem;color:#ef4444;">Vượt ${almV}dB (alarm)</div>
                  <div style="font-size:1.2rem;font-weight:800;color:#ef4444;">${overAlm} lần</div>
                </div>` : ''
}
</div>
  </div>
  </div>
  </div>

  < !--AI PD PROGNOSIS SECTION-- >
    <div style="background:linear-gradient(135deg, #0f172a, #1e3a8a);border-radius:10px;padding:16px;border:1px solid #1e40af;margin-top:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);" >
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;" >
        <div style="display:flex;align-items:center;gap:8px;" >
          <span style="font-size:1.2rem;" >🤖</span>
            < h3 style = "margin:0;font-size:0.9rem;color:#60a5fa;letter-spacing:0.5px;" > PHÂN TÍCH XU HƯỚNG PHÓNG ĐIỆN(AI) </h3>
              </div>
              < span style = "font-size:0.6rem;color:#93c5fd;background:rgba(30,64,175,0.5);padding:3px 8px;border-radius:20px;border:1px solid #3b82f6;" > PREDICTIVE MAINTENANCE </span>
                </div>

                < div style = "display:grid;grid-template-columns: 1fr 1fr 1.5fr; gap:20px; align-items:center;" >
                  <div style="background:rgba(15,23,42,0.6);padding:12px;border-radius:8px;border:1px solid rgba(59,130,246,0.2);" >
                    <div style="font-size:0.6rem;color:#94a3b8;font-weight:700;margin-bottom:4px;" > CƯỜNG ĐỘ HIỆN TẠI </div>
                      < div id = "pd-ai-cur" style = "font-size:1.6rem;font-weight:900;color:#e2e8f0;" > ${ parseFloat(maxPD).toFixed(1) } <span style="font-size:0.8rem;color:#64748b;" > dB < /span></div >
                        <div id="pd-ai-cur-time" style = "font-size:0.55rem;color:#475569;margin-top:4px;" >🕒 Ghi nhận: ${ new Date().toLocaleTimeString('vi-VN') } </div>
                          </div>

                          < div style = "background:rgba(30,58,138,0.4);padding:12px;border-radius:8px;border:1px solid #2563eb;" >
                            <div style="font-size:0.6rem;color:#93c5fd;font-weight:700;margin-bottom:4px;" > AI DỰ BÁO(T + 10M) </div>
                              < div id = "pd-ai-pred" style = "font-size:1.6rem;font-weight:900;color:#60a5fa;" > ${ pdAiVal !== null ? pdAiVal.toFixed(1) : '---' } <span style="font-size:0.8rem;color:#3b82f6;" > dB < /span></div >
                                <div id="pd-ai-pred-time" style = "font-size:0.55rem;color:#3b82f6;margin-top:4px;" >📅 Lúc: ${ latestPdPred?.ForecastTime || '---' } </div>
                                  </div>

                                  < div style = "padding-left:10px; border-left: 2px dashed rgba(59,130,246,0.3);" >
                                    <div style="font-size:0.65rem;color:#94a3b8;margin-bottom:6px;" > ĐÁNH GIÁ NGUY CƠ: </div>
                                      < div style = "display:flex;align-items:center;gap:10px;" >
                                        <div id="pd-ai-status-dot" style = "width:12px;height:12px;border-radius:50%;background:${pdAiColor};box-shadow:0 0 10px ${pdAiColor};" > </div>
                                          < div id = "pd-ai-status-text" style = "font-size:1.1rem;font-weight:800;color:${pdAiColor};" > ${ latestPdPred ? pdAiStatus : 'ĐANG PHÂN TÍCH...' } </div>
                                            </div>
                                            </div>
                                            </div>
                                            </div>

                                            < div style = "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;" >
                                              <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
                                                <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" > Sự kiện PD / ngày(7 ngày) </div>
                                                  < div style = "position:relative;height:160px;" > <canvas id="an-c-pd-bar" > </canvas></div >
                                                    </div>
                                                    < div style = "background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;" >
                                                      <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;" > Phân phối cường độ PD </div>
                                                        < div style = "position:relative;height:160px;" > <canvas id="an-c-pd-hist" > </canvas></div >
                                                          </div>
                                                          </div>
                                                            `);
    } else {
      // LIVE Update PD
      const elH = document.getElementById('pd-plc-header');
      if (elH) elH.innerHTML = this.groupHeader('🔵', 'Tủ 471 — Cảm biến phóng điện', '#3b82f6', pdStatus, pdSC);
      const elMin = document.getElementById('pd-min');
      const elMax = document.getElementById('pd-max');
      const elAvg = document.getElementById('pd-avg');
      if (elMin) elMin.textContent = `${ minPD } dB`;
      if (elMax) elMax.textContent = `${ maxPD } dB`;
      if (elAvg) elAvg.textContent = `${ avgPD } dB`;
      
      const elAiCur = document.getElementById('pd-ai-cur');
      const elAiCurT = document.getElementById('pd-ai-cur-time');
      const elAiPred = document.getElementById('pd-ai-pred');
      const elAiPredT = document.getElementById('pd-ai-pred-time');
      const elAiStD = document.getElementById('pd-ai-status-dot');
      const elAiStT = document.getElementById('pd-ai-status-text');
      if (elAiCur) elAiCur.innerHTML = `${ parseFloat(maxPD).toFixed(1) } <span style="font-size:0.8rem;color:#64748b;" > dB </span>`;
if (elAiCurT) elAiCurT.textContent = `🕒 Ghi nhận: ${new Date().toLocaleTimeString('vi-VN')}`;
if (elAiPred) elAiPred.innerHTML = `${pdAiVal !== null ? pdAiVal.toFixed(1) : '---'} <span style="font-size:0.8rem;color:#3b82f6;">dB</span>`;
if (elAiPredT) elAiPredT.textContent = `📅 Lúc: ${latestPdPred?.ForecastTime || '---'}`;
if (elAiStD) { elAiStD.style.background = pdAiColor; elAiStD.style.boxShadow = `0 0 10px ${pdAiColor}`; }
if (elAiStT) { elAiStT.textContent = latestPdPred ? pdAiStatus : 'ĐANG PHÂN TÍCH...'; elAiStT.style.color = pdAiColor; }
    }

// Line chart PD
const nowMs = Date.now();
const tMin = nowMs - RMS[this.range];
const pdDatasets: object[] = [
  {
    label: 'PD (dBmW)',
    data: this.pdH.map(h => ({ x: new Date(h.time).getTime(), y: h.value })),
    borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)',
    borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, order: 1,
  },
  ...this.thresholdDatasets(PD_ID, tMin, nowMs),
  {
    label: 'NETA Monitor (−37)', data: [{ x: tMin, y: -37 }, { x: nowMs, y: -37 }],
    borderColor: '#eab308', backgroundColor: 'transparent',
    borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0, order: 98
  },
  {
    label: 'NETA Warning (−27)', data: [{ x: tMin, y: -27 }, { x: nowMs, y: -27 }],
    borderColor: '#f97316', backgroundColor: 'transparent',
    borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0, order: 98
  },
  {
    label: 'NETA Critical (−20)', data: [{ x: tMin, y: -20 }, { x: nowMs, y: -20 }],
    borderColor: '#ef4444', backgroundColor: 'transparent',
    borderWidth: 1, borderDash: [4, 4], pointRadius: 0, tension: 0, order: 98
  },
];
this.mkChart('an-c-pd-line', {
  type: 'line',
  data: { datasets: pdDatasets },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleTime(),
      y: { ...this.yScale(), title: { display: true, text: 'dB', color: '#64748b', font: { size: 10 } } }
    }
  } as any,
});

const dayLabels7 = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(now7 - (6 - i) * 86400000);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit' });
});
this.mkChart('an-c-pd-bar', {
  type: 'bar',
  data: {
    labels: dayLabels7, datasets: [{
      label: `Sự kiện PD${warnV !== undefined ? ` >${warnV}dB` : ''}`, data: pdBins7, borderRadius: 4, borderWidth: 0,
      backgroundColor: pdBins7.map(v => v > 3 ? 'rgba(239,68,68,0.7)' : 'rgba(168,85,247,0.5)'),
    }]
  },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
    }, plugins: { legend: { display: false } }
  } as any,
});

const pdBuckets = Array(6).fill(0) as number[];
const pdBLabels = ['<10', '10-15', '15-20', '20-25', '25-30', '>30'];
data.forEach(v => {
  if (v < 10) (pdBuckets[0] as number)++;
  else if (v < 15) (pdBuckets[1] as number)++;
  else if (v < 20) (pdBuckets[2] as number)++;
  else if (v < 25) (pdBuckets[3] as number)++;
  else if (v < 30) (pdBuckets[4] as number)++;
  else (pdBuckets[5] as number)++;
});
this.mkChart('an-c-pd-hist', {
  type: 'bar',
  data: {
    labels: pdBLabels, datasets: [{
      label: 'Số mẫu', data: pdBuckets, borderRadius: 4, borderWidth: 0,
      backgroundColor: ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#f97316', '#ef4444'],
    }]
  },
  options: {
    ...this.baseOpts(), scales: {
      x: this.xScaleStr(), y: { ...this.yScale() }
    }, plugins: { legend: { display: false } }
  } as any,
});
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 4 — TƯƠNG QUAN
  // ══════════════════════════════════════════════════════════════
  private async buildCorrelation(): Promise < void> {
  await this.loadHistory();

  const scatterData = this.buildScatterData();
  const r = this.calcCorrelation(scatterData);
  const rLabel = Math.abs(r) > 0.7 ? '🔴 TƯƠNG QUAN CAO' : Math.abs(r) > 0.4 ? '🟡 TƯƠNG QUAN TRUNG BÌNH' : '🟢 TƯƠNG QUAN THẤP';

  // Camera variance
  const camVariance = CAM_IDS.map((id, i) => {
    const vals = (this.camH[id] ?? []).map(h => h.value);
    if (!vals.length) return { label: CAM_LABELS[i]!, std: 0 };
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
    return { label: CAM_LABELS[i]!, std };
  }).sort((a, b) => b.std - a.std);

  this.setTabHTML('correlation', `
      <!-- Section: Tủ 471 -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        ${this.groupHeader('🔵', 'Tủ 471 — Tương quan PD vs Nhiệt', '#3b82f6', 'PHÂN TÍCH', '#3b82f6')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Scatter: Nhiệt Pha 3 vs Phóng điện</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:8px;">
              Hệ số tương quan r = <b style="color:#e2e8f0;">${r.toFixed(2)}</b> — ${rLabel}
            </div>
            <div style="position:relative;height:240px;"><canvas id="an-c-corr-scatter"></canvas></div>
          </div>
          <div>
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Dual-axis: Nhiệt °C + PD dB theo thời gian</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:8px;">Trục trái: °C · Trục phải: dB</div>
            <div style="position:relative;height:240px;"><canvas id="an-c-corr-dual"></canvas></div>
          </div>
        </div>
      </div>

      <!-- Section: Camera nhiệt -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        ${this.groupHeader('🟠', 'Camera nhiệt — Biến động điểm đo', '#f97316', 'PHÂN TÍCH', '#f97316')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
              Độ lệch chuẩn (std) P1–P10 — điểm dao động nhiều nhất
            </div>
            <div style="position:relative;height:220px;"><canvas id="an-c-corr-camvar"></canvas></div>
          </div>
          <div>
            <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
              Xếp hạng biến động
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${camVariance.slice(0, 5).map((c, i) => {
    const pct = camVariance[0]!.std > 0 ? (c.std / camVariance[0]!.std) * 100 : 0;
    const color = i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#3b82f6';
    return `<div style="display:flex;align-items:center;gap:8px;">
                  <div style="font-size:0.68rem;color:${color};font-weight:700;width:24px;">${c.label}</div>
                  <div style="flex:1;background:#0f172a;border-radius:3px;height:10px;overflow:hidden;">
                    <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:3px;"></div>
                  </div>
                  <div style="font-size:0.65rem;color:${color};width:52px;text-align:right;">σ=${c.std.toFixed(2)}°C</div>
                </div>`;
  }).join('')}
              ${camVariance.every(c => c.std === 0) ? '<div style="font-size:0.72rem;color:#475569;padding:8px;">Chưa đủ dữ liệu lịch sử</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <div style="background:#0f172a;border:1px dashed #334155;border-radius:10px;padding:16px;">
        <div style="font-size:0.72rem;color:#475569;font-weight:700;margin-bottom:8px;">🤖 Nâng cấp với AI (sắp có)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          ${['Phát hiện bất thường tự động (anomaly detection)', 'Dự báo thời điểm vượt ngưỡng trong X ngày', 'Nhận dạng pattern phóng điện từ camera'].map(t => `
            <div style="background:#1e293b;border-radius:6px;padding:10px;font-size:0.72rem;color:#475569;">
              <div style="color:#334155;margin-bottom:4px;">⏳</div>${t}
            </div>`).join('')}
        </div>
      </div>
    `);

  // Scatter chart
  this.mkChart('an-c-corr-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Nhiệt Pha 3 vs PD',
        data: scatterData,
        backgroundColor: 'rgba(168,85,247,0.5)',
        pointRadius: 3, pointHoverRadius: 5,
      }]
    },
    options: {
      ...this.baseOpts(), scales: {
        x: { ...this.yScale(), title: { display: true, text: 'Nhiệt độ Pha 3 (°C)', color: '#64748b', font: { size: 10 } } },
        y: { ...this.yScale(), title: { display: true, text: 'PD (dB)', color: '#64748b', font: { size: 10 } } },
      }
    } as any,
  });

  // Dual-axis chart
  const slice60 = (arr: HP[]) => arr.slice(-100).map(h => ({ x: new Date(h.time).getTime(), y: h.value }));
  this.mkChart('an-c-corr-dual', {
    type: 'line',
    data: {
      datasets: [
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
      ]
    },
    options: {
      ...this.baseOpts(),
      scales: {
        x: this.xScaleTime(),
        yTemp: { ...this.yScale(), position: 'left', title: { display: true, text: '°C', color: '#f59e0b', font: { size: 10 } } },
        yPd: { ...this.yScale(), position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'dB', color: '#a855f7', font: { size: 10 } } },
      },
    } as any,
  });

  // Camera variance bar
  this.mkChart('an-c-corr-camvar', {
    type: 'bar',
    data: {
      labels: camVariance.map(c => c.label),
      datasets: [{
        label: 'Std Dev (°C)',
        data: camVariance.map(c => parseFloat(c.std.toFixed(3))),
        backgroundColor: camVariance.map((_, i) => i === 0 ? 'rgba(239,68,68,0.8)' : i === 1 ? 'rgba(245,158,11,0.7)' : 'rgba(249,115,22,0.5)'),
        borderRadius: 4, borderWidth: 0,
      }],
    },
    options: {
      ...this.baseOpts(), scales: {
        x: this.xScaleStr(),
        y: { ...this.yScale(), title: { display: true, text: 'σ (°C)', color: '#64748b', font: { size: 10 } } },
      }, plugins: { legend: { display: false } }
    } as any,
  });
}

  // ══════════════════════════════════════════════════════════════
  // TAB 5 — CẢNH BÁO
  // ══════════════════════════════════════════════════════════════
  private buildAlerts(): void {
  // Separate alerts by device type
  const plcDeviceIds = this.devices.filter(d => d.type === 'plc_s7').map(d => d.id);
  const camDeviceIds = this.devices.filter(d => d.type?.includes('camera')).map(d => d.id);
  const plcAlerts = this.alerts.filter(a => plcDeviceIds.includes(a.deviceId ?? ''));
  const camAlerts = this.alerts.filter(a => camDeviceIds.includes(a.deviceId ?? ''));

  const plcAlarm = plcAlerts.filter(a => a.level === 'alarm').length;
  const plcWarning = plcAlerts.filter(a => a.level === 'warning').length;
  const camAlarm = camAlerts.filter(a => a.level === 'alarm').length;
  const camWarning = camAlerts.filter(a => a.level === 'warning').length;

  const alarm = this.alerts.filter(a => a.level === 'alarm').length;
  const warning = this.alerts.filter(a => a.level === 'warning').length;
  const closed = this.alerts.filter(a => a.status === 'closed');
  const handled = closed.filter(a => a.ackedAt && a.closedAt);
  const avgMs = handled.length
    ? handled.reduce((s, a) => s + (new Date(a.closedAt!).getTime() - new Date(a.triggeredAt).getTime()), 0) / handled.length
    : 0;
  const avgMin = (avgMs / 60000).toFixed(0);

  // 7-day bins for PLC and Camera
  const now30 = Date.now();
  const plcBins7 = Array(7).fill(0) as number[];
  const camBins7 = Array(7).fill(0) as number[];
  plcAlerts.forEach(a => {
    const d = Math.floor((now30 - new Date(a.triggeredAt).getTime()) / 86400000);
    if (d >= 0 && d < 7) (plcBins7[6 - d] as number)++;
  });
  camAlerts.forEach(a => {
    const d = Math.floor((now30 - new Date(a.triggeredAt).getTime()) / 86400000);
    if (d >= 0 && d < 7) (camBins7[6 - d] as number)++;
  });

  const dayLabels7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now30 - (6 - i) * 86400000);
    return d.toLocaleDateString('vi-VN', { weekday: 'short' });
  });

  // 30-day bar (all)
  const bins30 = Array(30).fill(0) as number[];
  this.alerts.forEach(a => {
    const d = Math.floor((now30 - new Date(a.triggeredAt).getTime()) / 86400000);
    if (d >= 0 && d < 30) (bins30[29 - d] as number)++;
  });

  // Heatmap hour × weekday
  const heatmap = this.buildAlertHeatmap();
  const maxHM = Math.max(...heatmap.flat(), 1);
  const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  // Response time histogram
  const rBins = [0, 0, 0, 0, 0] as number[];
  handled.forEach(a => {
    const m = (new Date(a.closedAt!).getTime() - new Date(a.triggeredAt).getTime()) / 60000;
    if (m < 5) (rBins[0] as number)++;
    else if (m < 30) (rBins[1] as number)++;
    else if (m < 60) (rBins[2] as number)++;
    else if (m < 240) (rBins[3] as number)++;
    else (rBins[4] as number)++;
  });

  this.setTabHTML('alerts', `
      <!-- Row 1: Two group columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <!-- LEFT: Tủ 471 alerts -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          ${this.groupHeader('🔵', 'Tủ 471', '#3b82f6', `${plcAlerts.length} cảnh báo`, plcAlerts.length > 0 ? '#f59e0b' : '#10b981')}
          <div style="display:flex;gap:12px;margin-bottom:10px;">
            <div style="flex:1;text-align:center;padding:8px;background:#0f172a;border-radius:6px;">
              <div style="font-size:1.3rem;font-weight:800;color:#ef4444;">${plcAlarm}</div>
              <div style="font-size:0.6rem;color:#64748b;">Alarm</div>
            </div>
            <div style="flex:1;text-align:center;padding:8px;background:#0f172a;border-radius:6px;">
              <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;">${plcWarning}</div>
              <div style="font-size:0.6rem;color:#64748b;">Warning</div>
            </div>
          </div>
          <div style="position:relative;height:100px;margin-bottom:10px;"><canvas id="an-c-al-plc-donut"></canvas></div>
          <div style="font-size:0.62rem;color:#64748b;font-weight:700;margin-bottom:6px;">7 ngày qua</div>
          <div style="position:relative;height:100px;"><canvas id="an-c-al-plc-bar"></canvas></div>
        </div>
        <!-- RIGHT: Camera nhiệt alerts -->
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          ${this.groupHeader('🟠', 'Camera nhiệt', '#f97316', `${camAlerts.length} cảnh báo`, camAlerts.length > 0 ? '#f59e0b' : '#10b981')}
          <div style="display:flex;gap:12px;margin-bottom:10px;">
            <div style="flex:1;text-align:center;padding:8px;background:#0f172a;border-radius:6px;">
              <div style="font-size:1.3rem;font-weight:800;color:#ef4444;">${camAlarm}</div>
              <div style="font-size:0.6rem;color:#64748b;">Alarm</div>
            </div>
            <div style="flex:1;text-align:center;padding:8px;background:#0f172a;border-radius:6px;">
              <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;">${camWarning}</div>
              <div style="font-size:0.6rem;color:#64748b;">Warning</div>
            </div>
          </div>
          <div style="position:relative;height:100px;margin-bottom:10px;"><canvas id="an-c-al-cam-donut"></canvas></div>
          <div style="font-size:0.62rem;color:#64748b;font-weight:700;margin-bottom:6px;">7 ngày qua</div>
          <div style="position:relative;height:100px;"><canvas id="an-c-al-cam-bar"></canvas></div>
        </div>
      </div>

      <!-- Row 2: Response time + global trend -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Thời gian xử lý (tất cả)</div>
          <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:8px;">Trung bình: <b style="color:#10b981;">${avgMin} phút</b></div>
          <div style="position:relative;height:130px;"><canvas id="an-c-al-resp"></canvas></div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">
            Tổng cảnh báo: <span style="color:#ef4444;">${alarm} alarm</span> · <span style="color:#f59e0b;">${warning} warning</span>
          </div>
          <div style="position:relative;height:130px;"><canvas id="an-c-al-donut"></canvas></div>
        </div>
      </div>

      <!-- 30 day trend -->
      <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;">
        <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Xu hướng 30 ngày (tất cả)</div>
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
              ${Array.from({ length: 24 }, (_, h) => `<td style="text-align:center;width:22px;color:#475569;padding:0;">${h}h</td>`).join('')}
            </tr>
            ${heatmap.map((row, dow) => `
              <tr>
                <td style="padding:2px 8px 2px 0;color:#94a3b8;font-weight:600;white-space:nowrap;">${DOW_LABELS[dow]}</td>
                ${row.map(count => `
                  <td title="${count} cảnh báo"
                    style="width:22px;height:16px;background:${this.freqCellColor(count, maxHM)};
                    border-radius:2px;text-align:center;color:${count > 0 ? 'rgba(255,255,255,0.7)' : 'transparent'};
                    font-size:0.55rem;">${count || ''}</td>
                `).join('')}
              </tr>`).join('')}
          </table>
        </div>
      </div>
    `);

  // PLC donut
  this.mkChart('an-c-al-plc-donut', {
    type: 'doughnut',
    data: { labels: ['Alarm', 'Warning'], datasets: [{ data: [plcAlarm, plcWarning], backgroundColor: ['#ef4444', '#f59e0b'], borderWidth: 0 }] },
    options: { ...this.baseOpts(), cutout: '65%', plugins: { legend: { display: false } } } as any,
  });

  // PLC 7-day bar
  this.mkChart('an-c-al-plc-bar', {
    type: 'bar',
    data: {
      labels: dayLabels7, datasets: [{
        label: 'Tủ 471', data: plcBins7, borderRadius: 3, borderWidth: 0,
        backgroundColor: 'rgba(59,130,246,0.6)',
      }]
    },
    options: {
      ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
      }, plugins: { legend: { display: false } }
    } as any,
  });

  // Camera donut
  this.mkChart('an-c-al-cam-donut', {
    type: 'doughnut',
    data: { labels: ['Alarm', 'Warning'], datasets: [{ data: [camAlarm, camWarning], backgroundColor: ['#ef4444', '#f97316'], borderWidth: 0 }] },
    options: { ...this.baseOpts(), cutout: '65%', plugins: { legend: { display: false } } } as any,
  });

  // Camera 7-day bar
  this.mkChart('an-c-al-cam-bar', {
    type: 'bar',
    data: {
      labels: dayLabels7, datasets: [{
        label: 'Camera', data: camBins7, borderRadius: 3, borderWidth: 0,
        backgroundColor: 'rgba(249,115,22,0.6)',
      }]
    },
    options: {
      ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
      }, plugins: { legend: { display: false } }
    } as any,
  });

  // Global donut
  this.mkChart('an-c-al-donut', {
    type: 'doughnut',
    data: { labels: ['Alarm', 'Warning'], datasets: [{ data: [alarm, warning], backgroundColor: ['#ef4444', '#f59e0b'], borderWidth: 0 }] },
    options: { ...this.baseOpts(), cutout: '65%', plugins: { legend: { display: false } } } as any,
  });

  // Response time
  this.mkChart('an-c-al-resp', {
    type: 'bar',
    data: {
      labels: ['<5ph', '5-30ph', '30-60ph', '1-4h', '>4h'], datasets: [{
        data: rBins, borderRadius: 4, borderWidth: 0,
        backgroundColor: ['#10b981', '#22c55e', '#f59e0b', '#f97316', '#ef4444'],
      }]
    },
    options: {
      ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
      }, plugins: { legend: { display: false } }
    } as any,
  });

  // 30-day trend
  const labels30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now30 - (29 - i) * 86400000);
    return i % 5 === 0 ? d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
  });
  this.mkChart('an-c-al-trend', {
    type: 'bar',
    data: {
      labels: labels30, datasets: [{
        label: 'Cảnh báo', data: bins30, borderRadius: 2, borderWidth: 0,
        backgroundColor: bins30.map(v => v > 5 ? 'rgba(239,68,68,0.7)' : 'rgba(56,189,248,0.4)'),
      }]
    },
    options: {
      ...this.baseOpts(), scales: {
        x: this.xScaleStr(), y: { ...this.yScale(), ticks: { color: '#64748b', stepSize: 1 } }
      }, plugins: { legend: { display: false } }
    } as any,
  });
}

  // ══════════════════════════════════════════════════════════════
  // TAB 6 — SỨC KHỎE & RỦI RO
  // ══════════════════════════════════════════════════════════════
  private async buildHealth(): Promise < void> {
  let apiScores: Array<{ deviceId: string; deviceName: string; deviceType: string; score: number; risk: string }> = [];
  try {
    apiScores = await stationApi.getHealthScores();
  } catch { /* fallback */ }

    const scores = this.devices.map(d => {
    const api = apiScores.find(a => a.deviceId === d.id);
    const score = api?.score ?? this.calcHealthScore(d.id);
    const risk = api?.risk ?? (score >= 80 ? 'good' : score >= 60 ? 'fair' : score >= 40 ? 'poor' : 'critical');
    return { id: d.id, name: d.name, type: d.type, score, risk, alerts30: this.alertsForDevice(d.id, 30) };
  }).sort((a, b) => a.score - b.score);

  // Load trend data
  let trends: Array<{ pointId: string; label: string; slopePerDay: number; trend: string; latestValue: number; unit: string }> = [];
  try { trends = await stationApi.getTrends(); } catch { /* skip */ }

    const scoreColor = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f97316' : '#ef4444';
  const scoreLabel = (s: number) => s >= 80 ? '🟢 TỐT' : s >= 60 ? '🟡 TB' : s >= 40 ? '🟠 KÉM' : '🔴 NGUY';
  const riskLabel = (r: string) => ({ good: 'THẤP', fair: 'TRUNG BÌNH', poor: 'CAO', critical: 'RẤT CAO' }[r] ?? r.toUpperCase());
  const recommend = (d: { score: number }) =>
    d.score >= 80 ? 'Kiểm tra định kỳ 6 tháng' :
      d.score >= 60 ? 'Lên lịch bảo trì trong 30 ngày' :
        'Cần bảo trì ngay / kiểm tra khẩn';

  const open = this.alerts.filter(a => a.status === 'open').length;
  const acked = this.alerts.filter(a => a.status === 'acked').length;
  const closed24 = this.alerts.filter(a => a.status === 'closed' && new Date(a.triggeredAt).getTime() > Date.now() - 86400000).length;

  // Separate PLC vs Camera scores
  const plcScores = scores.filter(d => d.type === 'plc_s7');
  const camScores = scores.filter(d => d.type?.includes('camera'));

  // Camera thermal status from latest sensors
  const camValsNow = CAM_IDS.map(id => this.sensors.find(s => s.pointId === id)?.value ?? null).filter(v => v !== null) as number[];
  const camAbove50 = camValsNow.filter(v => v >= 50).length;
  const camAbove40 = camValsNow.filter(v => v >= 40).length;
  const camMaxNow = camValsNow.length ? Math.max(...camValsNow) : null;
  const camMaxIdx = camMaxNow !== null ? camValsNow.indexOf(camMaxNow) : -1;
  const camMaxLabel = camMaxIdx >= 0 ? CAM_IDS[camValsNow.findIndex(v => v === camMaxNow)] ?? '—' : '—';

  // Camera health score: if no API score, compute simple one
  let camHealthScore = 100;
  if(camScores.length > 0) {
  camHealthScore = Math.round(camScores.reduce((s, d) => s + d.score, 0) / camScores.length);
} else {
  camHealthScore = Math.max(0, 100 - camAbove50 * 20 - camAbove40 * 5);
}

// Trend table: filter to T_IDS + PD_ID
const plcPointIds = [...T_IDS, PD_ID];
const plcTrends = trends.filter(t => plcPointIds.includes(t.pointId));

this.setTabHTML('health', `
      <!-- Section: Tủ 471 -->
      <div style="background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div>${this.groupHeader('🔵', 'Tủ 471 — Sức khỏe PLC S7-1200', '#3b82f6', plcScores.length > 0 ? (plcScores[0]!.score >= 80 ? 'TỐT' : plcScores[0]!.score >= 60 ? 'TRUNG BÌNH' : 'CẦN KIỂM TRA') : 'CHƯA CÓ DỮ LIỆU', plcScores.length > 0 ? scoreColor(plcScores[0]!.score) : '#475569')}</div>
          <button id="btnRecalcHealth"
            style="padding:4px 12px;background:#1e3a5f;border:1px solid #2563eb;border-radius:5px;
            color:#60a5fa;font-size:0.68rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;flex-shrink:0;">
            ↻ Tính lại
          </button>
        </div>
        ${plcScores.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
          ${plcScores.map(d => `
            <div style="display:grid;grid-template-columns:140px 60px 1fr 80px;align-items:center;gap:12px;">
              <div style="font-size:0.78rem;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.name}">${d.name}</div>
              <div style="font-size:0.78rem;font-weight:800;color:${scoreColor(d.score)};">${d.score}/100</div>
              <div style="background:#0f172a;border-radius:4px;height:10px;overflow:hidden;">
                <div style="height:100%;width:${d.score}%;background:${scoreColor(d.score)};border-radius:4px;transition:width .5s;"></div>
              </div>
              <div style="font-size:0.65rem;color:${scoreColor(d.score)};font-weight:600;">${scoreLabel(d.score)}</div>
            </div>`).join('')}
        </div>
        <!-- Risk table Tủ 471 -->
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
            ${plcScores.map(d => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:7px 8px;color:#e2e8f0;font-weight:600;">${d.name}</td>
                <td style="padding:7px 8px;text-align:center;">
                  <span style="padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;
                    background:${d.score >= 80 ? 'rgba(16,185,129,0.15)' : d.score >= 60 ? 'rgba(245,158,11,0.15)' : d.score >= 40 ? 'rgba(249,115,22,0.15)' : 'rgba(239,68,68,0.15)'};
                    color:${scoreColor(d.score)};">${riskLabel(d.risk)}</span>
                </td>
                <td style="padding:7px 8px;text-align:center;color:#94a3b8;">${d.alerts30}</td>
                <td style="padding:7px 8px;color:#94a3b8;">${recommend(d)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<div style="font-size:0.72rem;color:#475569;padding:8px;">Chưa có dữ liệu sức khỏe PLC</div>'}

        ${plcTrends.length > 0 ? `
        <div style="margin-top:14px;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:10px;">📈 Xu hướng 7 ngày (Tủ 471)</div>
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
              ${plcTrends.map(t => {
  const tCol = t.trend === 'rising' ? '#ef4444' : t.trend === 'falling' ? '#10b981' : '#64748b';
  const tIcon = t.trend === 'rising' ? '📈' : t.trend === 'falling' ? '📉' : '➡️';
  return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:5px 8px;color:#e2e8f0;">${t.label}</td>
                  <td style="padding:5px 8px;text-align:right;color:#94a3b8;">${t.latestValue.toFixed(1)} ${t.unit}</td>
                  <td style="padding:5px 8px;text-align:right;color:${tCol};font-weight:700;">${t.slopePerDay >= 0 ? '+' : ''}${t.slopePerDay.toFixed(3)} ${t.unit}</td>
                  <td style="padding:5px 8px;text-align:center;">${tIcon} <span style="color:${tCol};font-size:0.65rem;font-weight:700;">${t.trend.toUpperCase()}</span></td>
                </tr>`;
}).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>

      <!-- Section: Camera nhiệt -->
      <div style="background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;">
        ${this.groupHeader('🟠', 'Camera nhiệt — Đánh giá nhiệt độ bề mặt', '#f97316',
  camAbove50 > 0 ? 'CẢNH BÁO NGUY HIỂM' : camAbove40 > 0 ? 'CẦN THEO DÕI' : 'BÌNH THƯỜNG',
  camAbove50 > 0 ? '#ef4444' : camAbove40 > 0 ? '#f59e0b' : '#10b981')}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
          <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:0.62rem;color:#64748b;font-weight:700;margin-bottom:4px;">Điểm nóng nhất</div>
            <div style="font-size:1.2rem;font-weight:800;color:${camMaxNow !== null && camMaxNow >= 50 ? '#ef4444' : camMaxNow !== null && camMaxNow >= 40 ? '#f59e0b' : '#10b981'};">
              ${camMaxLabel} = ${camMaxNow !== null ? camMaxNow.toFixed(1) : '—'}°C
            </div>
          </div>
          <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:0.62rem;color:#64748b;font-weight:700;margin-bottom:4px;">Điểm ≥ 40°C</div>
            <div style="font-size:1.2rem;font-weight:800;color:${camAbove40 > 0 ? '#f59e0b' : '#10b981'};">${camAbove40}/10</div>
          </div>
          <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:0.62rem;color:#64748b;font-weight:700;margin-bottom:4px;">Điểm ≥ 50°C</div>
            <div style="font-size:1.2rem;font-weight:800;color:${camAbove50 > 0 ? '#ef4444' : '#10b981'};">${camAbove50}/10</div>
          </div>
        </div>
        <!-- Camera health gauge bar -->
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div style="font-size:0.7rem;color:#94a3b8;">Điểm sức khỏe camera nhiệt</div>
            <div style="font-size:0.85rem;font-weight:800;color:${scoreColor(camHealthScore)};">${camHealthScore}/100 ${scoreLabel(camHealthScore)}</div>
          </div>
          <div style="background:#0f172a;border-radius:6px;height:14px;overflow:hidden;">
            <div style="height:100%;width:${camHealthScore}%;background:${scoreColor(camHealthScore)};border-radius:6px;transition:width .5s;"></div>
          </div>
          <div style="font-size:0.62rem;color:#475569;margin-top:4px;">
            * Điểm tính dựa trên số điểm vượt ngưỡng: −20 điểm/điểm ≥50°C, −5 điểm/điểm ≥40°C
          </div>
        </div>
        ${camScores.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
          ${camScores.map(d => `
            <div style="display:grid;grid-template-columns:140px 60px 1fr 80px;align-items:center;gap:12px;">
              <div style="font-size:0.75rem;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name}</div>
              <div style="font-size:0.75rem;font-weight:800;color:${scoreColor(d.score)};">${d.score}/100</div>
              <div style="background:#0f172a;border-radius:4px;height:8px;overflow:hidden;">
                <div style="height:100%;width:${d.score}%;background:${scoreColor(d.score)};border-radius:4px;"></div>
              </div>
              <div style="font-size:0.62rem;color:${scoreColor(d.score)};font-weight:600;">${scoreLabel(d.score)}</div>
            </div>`).join('')}
        </div>` : ''}
      </div>

      <!-- Alert status -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Chưa xử lý</div>
          <div style="font-size:2rem;font-weight:800;color:${open > 0 ? '#ef4444' : '#10b981'};">${open}</div>
          <div style="font-size:0.7rem;color:#64748b;">${open > 0 ? '⚠️ Cần xử lý ngay' : '✅ Tất cả đã xử lý'}</div>
        </div>
        <div style="background:#1e293b;border-radius:10px;padding:14px 16px;border:1px solid #334155;text-align:center;">
          <div style="font-size:0.65rem;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Đang xử lý</div>
          <div style="font-size:2rem;font-weight:800;color:${acked > 0 ? '#f59e0b' : '#10b981'};">${acked}</div>
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
          ${['Dự báo điểm sức khỏe 30 ngày tới (ML trending)', 'Phát hiện bất thường so với baseline lịch sử', 'Đề xuất lịch bảo trì tối ưu dựa trên AI (CBM)'].map(t => `
            <div style="background:#1e293b;border-radius:6px;padding:10px;font-size:0.72rem;color:#475569;">
              <div style="color:#334155;margin-bottom:4px;">⏳</div>${t}
            </div>`).join('')}
        </div>
      </div>
    `);

// Nút Tính lại sức khỏe
document.getElementById('btnRecalcHealth')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnRecalcHealth') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '⟳ Đang tính...';
  btn.style.color = '#94a3b8';
  try {
    await stationApi.recalculateHealth();
    btn.textContent = '✓ Xong!';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    setTimeout(async () => {
      this.tabReady.delete('health');
      await this.buildHealth();
    }, 3000);
  } catch (e) {
    btn.textContent = '✗ Lỗi';
    btn.style.color = '#ef4444';
    setTimeout(() => {
      btn.textContent = '↻ Tính lại';
      btn.style.color = '#60a5fa';
      btn.style.borderColor = '#2563eb';
      btn.disabled = false;
    }, 2000);
  }
});
  }

  // ── Helper: chart factory ─────────────────────────────────────
  private mkChart(id: string, config: any): void {
  const old = this.charts.get(id);
  if(old) {
    if (this.live) {
      // Deep data update to avoid flicker
      config.data.datasets.forEach((newDs: any, i: number) => {
        if (old.data.datasets[i]) {
          old.data.datasets[i].data = newDs.data;
        }
      });
      if (config.data.labels) old.data.labels = config.data.labels;
      old.update('none');
    } else {
      old.data = config.data;
      old.options = config.options;
      old.update();
    }
    return;
  }
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  if(!canvas) return;
  const chart = new Chart(canvas, config as any);
  const tabId = id.replace('an-c-', '').split('-')[0] as TabId;
  this.charts.set(`an-c-${tabId}-${id}`, chart);
  this.charts.set(id, chart);
}

  private baseOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8', boxWidth: 12, usePointStyle: true, font: { size: 10 } } },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#fff', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1,
      },
    },
  };
}

  private xScaleTime() {
  return {
    type: 'linear' as const, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: {
      color: '#64748b', font: { size: 10 }, maxTicksLimit: 6,
      callback: (v: string | number) => {
        const d = new Date(Number(v));
        return ['1H', '6H'].includes(this.range)
          ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      }
    }
  };
}

  private xScaleStr() {
  return { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } };
}

  private yScale() {
  return { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } };
}

  // ── Helpers: data ─────────────────────────────────────────────
  private buildTempHeatmap(): { label: string; data: (number | null)[] } [] {
  const pha3 = this.tempH['nhiet_do_pha_3'] ?? [];
  const now = Date.now();
  return Array.from({ length: 7 }, (_, d) => {
    const dayStart = now - (6 - d + 1) * 86400000;
    const dayEnd = now - (6 - d) * 86400000;
    const date = new Date(dayStart);
    const label = date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const buckets = Array.from({ length: 24 }, () => [] as number[]);
    pha3.filter(p => {
      const t = new Date(p.time).getTime();
      return t >= dayStart && t < dayEnd;
    }).forEach(p => { (buckets[new Date(p.time).getHours()] as number[]).push(p.value); });
    return { label, data: (buckets as number[][]).map(b => b.length ? b.reduce((s, v) => s + v, 0) / b.length : null) };
  });
}

  private buildAlertHeatmap(): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  this.alerts.forEach(a => {
    const d = new Date(a.triggeredAt);
    const dow = (d.getDay() + 6) % 7;
    const row = grid[dow];
    if (row) row[d.getHours()] = (row[d.getHours()] ?? 0) + 1;
  });
  return grid;
}

  private buildScatterData(): { x: number; y: number } [] {
  const tempData = this.tempH['nhiet_do_pha_3'] ?? [];
  if (!tempData.length || !this.pdH.length) return [];
  return this.pdH.map(pd => {
    const pdT = new Date(pd.time).getTime();
    const closest = tempData.reduce((b, t) =>
      Math.abs(new Date(t.time).getTime() - pdT) < Math.abs(new Date(b.time).getTime() - pdT) ? t : b
    );
    return Math.abs(new Date(closest.time).getTime() - pdT) < 30000
      ? { x: closest.value, y: pd.value } : null;
  }).filter((p): p is { x: number; y: number } => p !== null);
}

  private calcCorrelation(pairs: { x: number; y: number }[]): number {
  const n = pairs.length;
  if (n < 2) return 0;
  const sx = pairs.reduce((s, p) => s + p.x, 0), sy = pairs.reduce((s, p) => s + p.y, 0);
  const sxy = pairs.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pairs.reduce((s, p) => s + p.x * p.x, 0), sy2 = pairs.reduce((s, p) => s + p.y * p.y, 0);
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

  private calcHealthScore(deviceId: string): number {
  const d30 = Date.now() - 30 * 86400000;
  const devAlerts = this.alerts.filter(a => a.deviceId === deviceId && new Date(a.triggeredAt).getTime() > d30);
  const alarms = devAlerts.filter(a => a.level === 'alarm').length;
  const warns = devAlerts.filter(a => a.level === 'warning').length;
  return Math.max(0, Math.min(100, 100 - alarms * 4 - warns * 1));
}

  private alertsForDevice(deviceId: string, days: number): number {
  const cutoff = Date.now() - days * 86400000;
  return this.alerts.filter(a => a.deviceId === deviceId && new Date(a.triggeredAt).getTime() > cutoff).length;
}

  // ── Helpers: visual ───────────────────────────────────────────
  private sparklineSvg(data: number[], color: string, w = 100, h = 28): string {
  if (data.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / rng) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

  private tempCellColor(v: number | null, pointId ?: string): string {
  if (v === null) return 'rgba(255,255,255,0.03)';
  const thr = pointId ? (this.thresholds[pointId] ?? []) : [];
  const almV = thr.find(t => t.level === 'alarm')?.value;
  const warnV = thr.find(t => t.level === 'warning')?.value;
  if (almV !== undefined && v >= almV) return '#ef4444';
  if (warnV !== undefined && v >= warnV) return '#f59e0b';
  if (v >= 55) return '#eab308';
  if (v >= 45) return '#22c55e';
  return '#3b82f6';
}

  // Color a value by its rule thresholds; fallback to default color
  private valColor(v: number | null, pointId: string, defaultColor: string): string {
  if (v === null) return defaultColor;
  const thr = this.thresholds[pointId] ?? [];
  const almV = thr.find(t => t.level === 'alarm')?.value;
  const warnV = thr.find(t => t.level === 'warning')?.value;
  if (almV !== undefined && v >= almV) return '#ef4444';
  if (warnV !== undefined && v >= warnV) return '#f59e0b';
  return defaultColor;
}

  private freqCellColor(count: number, max: number): string {
  if (!count || !max) return 'rgba(255,255,255,0.04)';
  const r = count / max;
  if (r >= 0.75) return '#ef4444';
  if (r >= 0.5) return '#f97316';
  if (r >= 0.25) return '#f59e0b';
  return '#3b82f6';
}

// ── Destroy ───────────────────────────────────────────────────
destroy(): void {
  if(this.live) clearInterval(this.live);
  if(this.aiPoller) clearInterval(this.aiPoller);
  this.charts.forEach(c => c.destroy());
  this.charts.clear();
}
}
