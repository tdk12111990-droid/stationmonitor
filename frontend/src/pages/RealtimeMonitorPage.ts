// ============================================================
// RealtimeMonitorPage — NVR-style grid + integrated events panel
// Layout: 1×1 / 2×2 / 3×3  |  Double-click → fullscreen + cam events
// Panel: collapsible, filter by type + date, realtime via SignalR
// ============================================================

import { stationApi, CameraDevice } from '@/services/StationApiService';
import * as signalR from '@microsoft/signalr';
import { GO2RTC_URL, API_BASE_URL } from '@/utils/env';

type Layout = 'l1' | 'l4' | 'l9';

interface DetectionEvent {
  id: string;
  cameraId: string;
  cameraName: string | null;
  detectionType: string;
  detectedAt: string;
  maxTemp: number | null;
  affectedZone: string | null;
  alertId: string | null;
  metadata: string | null;
}

interface EvtMeta { snapshotUrl?: string; videoUrl?: string; }

const EVT_CFG: Record<string, { label: string; icon: string; color: string }> = {
  thermal_hotspot: { label: 'Nhiệt bất thường', icon: '🌡️', color: '#ef4444' },
  fire: { label: 'Cháy', icon: '🔥', color: '#ef4444' },
  smoke: { label: 'Khói', icon: '💨', color: '#f97316' },
  intrusion: { label: 'Xâm nhập', icon: '🚨', color: '#f59e0b' },
  partial_discharge: { label: 'Phóng điện', icon: '⚡', color: '#a855f7' },
  tampering: { label: 'Che camera', icon: '🎭', color: '#f59e0b' },
  video_loss: { label: 'Mất tín hiệu', icon: '📵', color: '#64748b' },
  motion: { label: 'Chuyển động', icon: '👁️', color: '#3b82f6' },
  storage_error: { label: 'Lỗi lưu trữ', icon: '💾', color: '#f59e0b' },
};

export class RealtimeMonitorPage {
  private cameras: CameraDevice[] = [];
  private detections: DetectionEvent[] = [];
  private hubConnection: signalR.HubConnection | null = null;
  private clockInterval?: ReturnType<typeof setInterval>;
  private currentLayout: Layout = 'l4';
  private expandedId: string | null = null;
  private panelCamFilter = '';
  private panelTypeFilter = '';
  private panelDateFilter = '';

  render(): string {
    return `
    <style>
      #pageContent { padding:0!important; overflow:hidden!important; height:100%!important; }
      .rtm-page { display:flex; flex-direction:column; height:100%; background:#000; overflow:hidden; }

      /* ── Toolbar ── */
      .rtm-bar {
        height:44px; background:#0b0f18; border-bottom:1px solid #131c2a;
        display:flex; align-items:center; padding:0 14px; gap:10px;
        flex-shrink:0; z-index:30;
      }
      .rtm-title { font-size:10px; font-weight:900; color:#1a2744; letter-spacing:2px; text-transform:uppercase; }
      .rtm-sep   { width:1px; height:22px; background:#131c2a; flex-shrink:0; }

      .nvr-lb {
        background:transparent; border:1px solid #131c2a; color:#2d4060;
        width:30px; height:30px; border-radius:5px; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        transition:all .15s; padding:0; flex-shrink:0;
      }
      .nvr-lb.active { background:rgba(59,130,246,.18); border-color:#3b82f6; color:#3b82f6; }
      .nvr-lb:hover:not(.active) { border-color:#1e2d40; color:#475569; }

      .nvr-sel {
        background:#0b0f18; border:1px solid #131c2a; color:#475569;
        padding:0 8px; border-radius:4px; font-size:11px; height:28px; max-width:180px;
      }
      .nvr-sel:focus { outline:none; border-color:#3b82f6; }

      #nvrBackBtn {
        display:none; align-items:center; gap:6px;
        background:rgba(59,130,246,.15); border:1px solid #3b82f6; color:#3b82f6;
        padding:0 12px; height:28px; border-radius:5px; font-size:11px; font-weight:700;
        cursor:pointer; transition:background .15s; white-space:nowrap;
      }
      #nvrBackBtn:hover { background:rgba(59,130,246,.3); }
      #nvrBackBtn.visible { display:flex; }
      #nvrFsCam { display:none; font-size:11px; font-weight:700; color:#3b82f6; white-space:nowrap; }

      .nvr-stats { margin-left:auto; display:flex; gap:16px; align-items:center; }
      .nvr-stat  { font-size:11px; color:#1a2744; display:flex; gap:5px; align-items:center; }
      .nvr-stat b { font-weight:800; }
      .nvr-clock-txt { font-size:12px; font-weight:700; font-family:'Courier New',monospace; color:#1a2744; letter-spacing:1px; }

      /* ── Main area ── */
      .rtm-main { flex:1; display:flex; overflow:hidden; min-height:0; }

      /* ── Camera grid ── */
      .nvr-wrap { flex:1; min-width:0; overflow:hidden; background:#000; position:relative; padding:2px; box-sizing:border-box; }
      .nvr-grid { display:grid; gap:2px; height:100%; width:100%; position:relative; box-sizing:border-box; }
      .nvr-grid.l1 { grid-template-columns:1fr; grid-template-rows:1fr; }
      .nvr-grid.l4 { grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
      .nvr-grid.l9 { grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); }

      .nvr-cell { position:relative; background:#070a10; overflow:hidden; cursor:pointer; user-select:none; transition:box-shadow .12s; }
      .nvr-cell:hover { box-shadow:inset 0 0 0 1px #1e3050; }
      .nvr-cell.expanded { position:absolute!important; inset:0!important; z-index:20; box-shadow:0 0 0 2px #3b82f6!important; }
      .nvr-cell iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
        pointer-events: none;
        display: block;
        background: #000;
        z-index: 1;
      }

      /* No signal */
      .nvr-nosig { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; pointer-events:none; }
      .nvr-nosig-ico { font-size:1.8rem; opacity:.1; }
      .nvr-nosig-txt { font-size:9px; font-weight:900; color:#131c2a; letter-spacing:3px; text-transform:uppercase; }
      .nvr-ch { position:absolute; top:8px; left:10px; font-size:10px; font-weight:700; color:#131c2a; pointer-events:none; }

      /* HUD top (on hover) */
      .nvr-hud-t { position:absolute; top:0; left:0; right:0; padding:7px 10px 20px; background:linear-gradient(180deg,rgba(0,0,0,.78) 0%,transparent 100%); display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none; z-index:5; opacity:0; transition:opacity .2s; }
      .nvr-cam-info { display:flex; align-items:center; gap:6px; min-width:0; }
      .nvr-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; transition:background .3s,box-shadow .3s; }
      .nvr-dot.online  { background:#10b981; box-shadow:0 0 6px #10b981; }
      .nvr-dot.offline { background:#ef4444; box-shadow:0 0 6px #ef4444; }
      .nvr-dot.unknown { background:#334155; }
      .nvr-cname { font-size:11px; font-weight:700; color:rgba(255,255,255,.82); text-shadow:0 1px 4px rgba(0,0,0,.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; }
      .nvr-rec { display:flex; align-items:center; gap:3px; font-size:9px; font-weight:900; color:#ef4444; letter-spacing:1px; flex-shrink:0; }
      .nvr-recdot { width:6px; height:6px; border-radius:50%; background:#ef4444; animation:nvr-blink 1.2s infinite; }
      @keyframes nvr-blink { 0%,100%{opacity:1} 50%{opacity:0} }

      /* HUD bottom (on hover) */
      .nvr-hud-b { position:absolute; bottom:0; left:0; right:0; padding:18px 10px 7px; background:linear-gradient(0deg,rgba(0,0,0,.74) 0%,transparent 100%); display:flex; justify-content:space-between; align-items:flex-end; z-index:5; opacity:0; transition:opacity .2s; pointer-events:none; }
      .nvr-cell:hover .nvr-hud-t, .nvr-cell:hover .nvr-hud-b { opacity:1; }
      .nvr-ts   { font-size:10px; font-weight:500; color:rgba(255,255,255,.45); font-family:'Courier New',monospace; }
      .nvr-acts { display:flex; gap:4px; pointer-events:all; }
      .nvr-abtn { background:rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.7); width:26px; height:26px; border-radius:4px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
      .nvr-abtn:hover { background:rgba(59,130,246,.45); border-color:#3b82f6; color:#fff; }

      /* ── Events Panel ── */
      .nvr-ep { display:flex; width:300px; flex-shrink:0; background:#0b0f18; border-left:1px solid #131c2a; overflow:hidden; transition:width .25s ease; position:relative; }
      .nvr-ep.collapsed { width:28px; }

      /* Vertical toggle tab */
      .nvr-ep-tab { width:28px; flex-shrink:0; background:transparent; border:none; border-right:1px solid #131c2a; color:#1e3050; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:0; transition:all .15s; }
      .nvr-ep-tab:hover { color:#3b82f6; background:rgba(59,130,246,.06); }
      .nvr-ep-tab-arrow { font-size:9px; transition:transform .25s; line-height:1; }
      .nvr-ep.collapsed .nvr-ep-tab-arrow { transform:rotate(180deg); }
      .nvr-ep-tab-label { font-size:8px; font-weight:900; letter-spacing:1.5px; writing-mode:vertical-rl; transform:rotate(180deg); opacity:.4; color:inherit; }

      /* Panel body */
      .nvr-ep-body { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:272px; }

      /* Panel header */
      .nvr-ep-hdr { padding:10px 12px 8px; border-bottom:1px solid #131c2a; flex-shrink:0; }
      .nvr-ep-hdr-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
      .nvr-ep-title { font-size:10px; font-weight:900; color:#2d4060; letter-spacing:1.5px; text-transform:uppercase; }
      .nvr-ep-cnt { background:rgba(59,130,246,.15); border:1px solid rgba(59,130,246,.3); color:#3b82f6; font-size:9px; font-weight:800; padding:1px 7px; border-radius:10px; }

      /* Filters */
      .nvr-ep-filters { display:flex; gap:5px; align-items:center; }
      .nvr-ep-fsel { background:#0d1117; border:1px solid #1a2332; color:#475569; padding:3px 6px; border-radius:4px; font-size:10px; height:26px; flex:1; min-width:0; cursor:pointer; }
      .nvr-ep-fdate { background:#0d1117; border:1px solid #1a2332; color:#475569; padding:3px 5px; border-radius:4px; font-size:10px; height:26px; width:100px; flex-shrink:0; }
      .nvr-ep-fsel:focus,.nvr-ep-fdate:focus { outline:none; border-color:#3b82f6; }
      .nvr-ep-rbtn { background:transparent; border:1px solid #1a2332; color:#334155; width:26px; height:26px; border-radius:4px; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .15s; }
      .nvr-ep-rbtn:hover { border-color:#3b82f6; color:#3b82f6; }

      /* Events list */
      .nvr-ep-list { flex:1; overflow-y:auto; padding:5px; }
      .nvr-ep-list::-webkit-scrollbar { width:3px; }
      .nvr-ep-list::-webkit-scrollbar-track { background:#0b0f18; }
      .nvr-ep-list::-webkit-scrollbar-thumb { background:#1a2332; border-radius:2px; }

      .nvr-evt { display:flex; gap:8px; padding:7px 7px; border-radius:6px; cursor:pointer; transition:background .12s; margin-bottom:3px; border:1px solid transparent; }
      .nvr-evt:hover { background:#0f1620; border-color:#1a2332; }

      .nvr-evt-thumb {
        width:54px; height:38px; border-radius:4px; flex-shrink:0; overflow:hidden;
        background:#0d1117; display:flex; align-items:center; justify-content:center; font-size:1.3rem;
      }
      .nvr-evt-thumb img { width:54px; height:38px; object-fit:cover; display:block; }

      .nvr-evt-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; justify-content:center; }
      .nvr-evt-badge { display:inline-flex; align-items:center; gap:4px; font-size:9px; font-weight:800; letter-spacing:.3px; }
      .nvr-evt-cam  { font-size:9px; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .nvr-evt-time { font-size:9px; color:#1e3050; font-family:monospace; }
      .nvr-evt-temp { font-size:10px; font-weight:800; color:#ef4444; }

      .nvr-ep-empty { padding:40px 12px; text-align:center; color:#1e3050; font-size:11px; }
      .nvr-ep-loading { padding:20px; text-align:center; color:#1e3050; font-size:11px; }

      @keyframes nvr-flash { 0%{background:rgba(59,130,246,.14)} 100%{background:transparent} }
      .nvr-evt.new { animation:nvr-flash .9s ease-out; }

      /* Visual Alarm Pulse */
      @keyframes nvr-alarm-pulse {
        0% { box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.4); }
        50% { box-shadow: inset 0 0 10px 4px rgba(239, 68, 68, 0.8); }
        100% { box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.4); }
      }
      .nvr-cell.alarm-triggered {
        animation: nvr-alarm-pulse 1.5s infinite;
        z-index: 10;
        border: 1px solid #ef4444;
      }

      /* ── Toast Notifications ── */
      .nvr-toast-container {
        position: fixed; bottom: 20px; left: 20px;
        display: flex; flex-direction: column; gap: 10px; z-index: 10000;
      }
      .nvr-alert-toast {
        background: #ef4444; color: white; padding: 12px 16px; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 0.85rem; font-weight: 700;
        display: flex; align-items: center; gap: 12px; min-width: 280px;
        animation: toast-slide-in 0.3s ease-out; cursor: pointer;
      }
      @keyframes toast-slide-in { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

      /* ── Lightbox Extended ── */
      #nvrLB { display:none; position:fixed; inset:0; background:rgba(0,0,0,.92); z-index:9999; align-items:center; justify-content:center; }
      #nvrLB.open { display:flex; }
      #nvrLB .lb-content { max-width:92vw; max-height:90vh; position:relative; }
      #nvrLB img, #nvrLB video { width:100%; height:100%; border-radius:8px; box-shadow:0 0 60px rgba(0,0,0,.8); }
      #nvrLBClose { position:absolute; top:16px; right:20px; color:#fff; font-size:1.4rem; cursor:pointer; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; transition:background .15s; }
      #nvrLBClose:hover { background:rgba(255,255,255,.2); }
      
      /* ── Canvas Overlay ── */
      .nvr-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2;
      }
    </style>

    <div class="rtm-page">
      <!-- ── Toolbar ── -->
      <div class="rtm-bar">
        <span class="rtm-title">Camera Live</span>
        <div class="rtm-sep"></div>

        <!-- Layout: 1×1 -->
        <button class="nvr-lb" data-layout="l1" title="1×1 — Một camera">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><rect width="13" height="13" rx="1.5"/></svg>
        </button>
        <!-- Layout: 2×2 -->
        <button class="nvr-lb active" data-layout="l4" title="2×2 — Bốn camera">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
            <rect x="0"   y="0"   width="5.5" height="5.5" rx=".8"/>
            <rect x="7.5" y="0"   width="5.5" height="5.5" rx=".8"/>
            <rect x="0"   y="7.5" width="5.5" height="5.5" rx=".8"/>
            <rect x="7.5" y="7.5" width="5.5" height="5.5" rx=".8"/>
          </svg>
        </button>
        <!-- Layout: 3×3 -->
        <button class="nvr-lb" data-layout="l9" title="3×3 — Chín camera">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
            <rect x="0"    y="0"    width="3.2" height="3.2" rx=".5"/>
            <rect x="4.9"  y="0"    width="3.2" height="3.2" rx=".5"/>
            <rect x="9.8"  y="0"    width="3.2" height="3.2" rx=".5"/>
            <rect x="0"    y="4.9"  width="3.2" height="3.2" rx=".5"/>
            <rect x="4.9"  y="4.9"  width="3.2" height="3.2" rx=".5"/>
            <rect x="9.8"  y="4.9"  width="3.2" height="3.2" rx=".5"/>
            <rect x="0"    y="9.8"  width="3.2" height="3.2" rx=".5"/>
            <rect x="4.9"  y="9.8"  width="3.2" height="3.2" rx=".5"/>
            <rect x="9.8"  y="9.8"  width="3.2" height="3.2" rx=".5"/>
          </svg>
        </button>

        <div class="rtm-sep"></div>
        <select class="nvr-sel" id="nvrSel">
          <option value="">Tất cả camera</option>
        </select>

        <button id="nvrBackBtn" title="Quay về lưới (ESC)">← Quay về lưới</button>
        <span id="nvrFsCam"></span>

        <div class="nvr-stats">
          <div class="nvr-stat">
            <span class="nvr-dot online" style="width:8px;height:8px;flex-shrink:0;"></span>
            Online: <b id="nvrOnline" style="color:#10b981">—</b>
          </div>
          <span class="nvr-clock-txt" id="nvrClock">00:00:00</span>
        </div>
      </div>

      <!-- ── Main area: grid + events panel ── -->
      <div class="rtm-main">

        <!-- Camera grid -->
        <div class="nvr-wrap">
          <div class="nvr-grid l4" id="nvrGrid"></div>
        </div>

        <!-- Events panel (collapsible) -->
        <div class="nvr-ep" id="nvrEP">
          <button class="nvr-ep-tab" id="nvrEPTab" title="Thu/mở nhật ký sự kiện">
            <span class="nvr-ep-tab-arrow">◀</span>
            <span class="nvr-ep-tab-label">NHẬT KÝ</span>
          </button>
          <div class="nvr-ep-body">
            <div class="nvr-ep-hdr">
              <div class="nvr-ep-hdr-row">
                <span class="nvr-ep-title" id="nvrEPTitle">SỰ KIỆN CAM</span>
                <span class="nvr-ep-cnt" id="nvrEPCnt">0</span>
              </div>
              <div class="nvr-ep-filters">
                <select class="nvr-ep-fsel" id="nvrEPType">
                  <option value="">Tất cả loại</option>
                  ${Object.entries(EVT_CFG).map(([k, v]) =>
      `<option value="${k}">${v.icon} ${v.label}</option>`
    ).join('')}
                </select>
                <input type="date" class="nvr-ep-fdate" id="nvrEPDate" title="Lọc theo ngày">
                <button class="nvr-ep-rbtn" id="nvrEPRefresh" title="Làm mới">↻</button>
              </div>
            </div>
            <div class="nvr-ep-list" id="nvrEPList">
              <div class="nvr-ep-loading">Đang tải...</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
    <div id="nvrLB">
      <span id="nvrLBClose">✕</span>
      <div class="lb-content" id="nvrLBContent">
        <!-- Render img or video dynamically -->
      </div>
    </div>
    
    <!-- Toasts -->
    <div class="nvr-toast-container" id="nvrToastContainer"></div>`;
  }

  // ════════════════════════════════════════════════════════════
  // Lifecycle
  // ════════════════════════════════════════════════════════════

  async mount(): Promise<void> {
    // Override page-content padding for full-height layout
    const pc = document.getElementById('pageContent');
    if (pc) { pc.style.padding = '0'; pc.style.overflow = 'hidden'; pc.style.height = '100%'; }

    try { this.cameras = await stationApi.getCamerasFromFirstStation(); }
    catch { this.cameras = []; }

    this.renderGrid();
    this.bindEvents();
    this.loadDetections();
    this.connectSignalR();
    this.syncAlarmStates();
    this.startClock();
  }

  destroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.hubConnection) this.hubConnection.stop();
    document.removeEventListener('keydown', this._onKey);
    const pc = document.getElementById('pageContent');
    if (pc) { pc.style.padding = ''; pc.style.overflow = ''; pc.style.height = ''; }
  }

  // ════════════════════════════════════════════════════════════
  // Camera grid
  // ════════════════════════════════════════════════════════════

  private cellCount(): number {
    return this.currentLayout === 'l1' ? 1 : this.currentLayout === 'l4' ? 4 : 9;
  }

  private renderGrid(override?: (CameraDevice | null)[]): void {
    const grid = document.getElementById('nvrGrid');
    if (!grid) return;

    // Rebuild camera select
    const sel = document.getElementById('nvrSel') as HTMLSelectElement | null;
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = `<option value="">Tất cả camera</option>` +
        this.cameras.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      sel.value = prev;
    }

    // Online count
    const online = this.cameras.filter(c => (c.status as string) === 'online').length;
    const onlineEl = document.getElementById('nvrOnline');
    if (onlineEl) {
      onlineEl.textContent = `${online}/${this.cameras.length}`;
      onlineEl.style.color = online > 0 ? '#10b981' : '#ef4444';
    }

    const src = override ?? this.cameras;
    let html = '';
    for (let i = 0; i < this.cellCount(); i++) {
      html += this.renderCell(src[i] ?? null, i + 1);
    }
    grid.innerHTML = html;
  }

  private renderCell(cam: CameraDevice | null, num: number, fullscreen = false): string {
    const ch = String(num).padStart(2, '0');
    if (!cam) {
      return `
      <div class="nvr-cell" data-cam-id="">
        <div class="nvr-nosig">
          <span class="nvr-nosig-ico">📷</span>
          <span class="nvr-nosig-txt">No Signal</span>
        </div>
        <div class="nvr-ch">CH${ch}</div>
      </div>`;
    }

    const cfg = (cam as any).config ?? {};
    const go2rtcId: string = cfg.go2rtc_id ?? '';
    if (!go2rtcId) {
      // go2rtc_id chưa được cấu hình — hiện no signal
      return `
      <div class="nvr-cell" data-cam-id="${cam.id}">
        <div class="nvr-nosig">
          <span class="nvr-nosig-ico">⚙️</span>
          <span class="nvr-nosig-txt">Chưa cấu hình stream</span>
        </div>
        <div class="nvr-ch">CH${ch} · ${cam.name}</div>
      </div>`;
    }
    // Grid dùng _sub (nếu có cấu hình), nếu không thì fallback về luồng thường.
    const subId: string = cfg.go2rtc_sub_id ?? go2rtcId;
    const mainId: string = cfg.go2rtc_main_id ?? go2rtcId;
    const activeId = fullscreen ? mainId : subId;
    const status: string = (cam.status as string) ?? 'unknown';

    // mse: kết nối nhanh, ổn định hơn webrtc qua iframe
    const streamUrl = `${GO2RTC_URL}/stream.html?src=${encodeURIComponent(activeId)}&mode=mse&controls=0`;

    return `
    <div class="nvr-cell" data-cam-id="${cam.id}" data-go2rtc="${go2rtcId}"
         data-sub="${subId}" data-main="${mainId}" data-cam-name="${cam.name}">
      <iframe src="${streamUrl}" id="nvr-frame-${cam.id}" allow="autoplay; camera; microphone"></iframe>
      <canvas id="nvr-canvas-${cam.id}" class="nvr-overlay"></canvas>
      <div class="nvr-hud-t">
        <div class="nvr-cam-info">
          <span class="nvr-dot ${status}" id="nvr-dot-${cam.id}"></span>
          <span class="nvr-cname">CH${ch} · ${cam.name}</span>
        </div>
        <div class="nvr-rec"><span class="nvr-recdot"></span>REC</div>
      </div>
      <div class="nvr-hud-b">
        <span class="nvr-ts" id="nvr-ts-${cam.id}"></span>
        <div class="nvr-acts">
          <button class="nvr-abtn btn-snap" data-src="${activeId}" title="Chụp ảnh">📸</button>
          <button class="nvr-abtn btn-full" data-id="${cam.id}" data-name="${cam.name}" title="Xem toàn màn hình (double-click)">⛶</button>
        </div>
      </div>
    </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // Events panel
  // ════════════════════════════════════════════════════════════

  private async loadDetections(): Promise<void> {
    const list = document.getElementById('nvrEPList');
    if (list) list.innerHTML = `<div class="nvr-ep-loading">Đang tải...</div>`;
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (this.panelCamFilter) params.set('deviceId', this.panelCamFilter);
      if (this.panelTypeFilter) params.set('type', this.panelTypeFilter);
      if (this.panelDateFilter) {
        params.set('from', new Date(this.panelDateFilter).toISOString());
        params.set('to', new Date(this.panelDateFilter + 'T23:59:59').toISOString());
      }
      this.detections = await stationApi.getDetections(params.toString());
    } catch {
      this.detections = [];
    }
    this.renderDetections();
  }

  private renderDetections(): void {
    const list = document.getElementById('nvrEPList');
    const cnt = document.getElementById('nvrEPCnt');
    if (!list) return;

    if (cnt) cnt.textContent = String(this.detections.length);

    if (!this.detections.length) {
      list.innerHTML = `<div class="nvr-ep-empty">Chưa có sự kiện nào</div>`;
      return;
    }
    list.innerHTML = this.detections.map(e => this.evtCardHtml(e, false)).join('');
  }

  private evtCardHtml(e: DetectionEvent, isNew: boolean): string {
    const cfg = EVT_CFG[e.detectionType] ?? { label: e.detectionType, icon: '📷', color: '#64748b' };
    const meta: EvtMeta = (() => {
      try { return e.metadata ? JSON.parse(e.metadata) : {}; } catch { return {}; }
    })();
    const snap = meta.snapshotUrl ? `${API_BASE_URL}${meta.snapshotUrl}` : '';
    const time = new Date(e.detectedAt).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit',
    });
    const camName = e.cameraName ?? 'Camera';

    const vidUrl = meta.videoUrl ? `${API_BASE_URL}${meta.videoUrl}` : '';

    return `
    <div class="nvr-evt${isNew ? ' new' : ''}" data-snap="${snap}" data-video="${vidUrl}" title="${cfg.label} — ${camName}">
      <div class="nvr-evt-thumb">
        ${snap
        ? `<img src="${snap}" alt="" loading="lazy" onerror="this.parentElement.textContent='${cfg.icon}'">`
        : cfg.icon}
        ${vidUrl ? `<div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);border-radius:2px;padding:1px 3px;font-size:8px;">📹</div>` : ''}
      </div>
      <div class="nvr-evt-body">
        <span class="nvr-evt-badge" style="color:${cfg.color}">${cfg.icon} ${cfg.label}</span>
        <span class="nvr-evt-cam">📷 ${camName}</span>
        ${e.maxTemp != null ? `<span class="nvr-evt-temp">🌡 ${e.maxTemp.toFixed(1)}°C</span>` : ''}
        <span class="nvr-evt-time">${time}</span>
      </div>
    </div>`;
  }

  private prependDetection(evt: DetectionEvent): void {
    if (this.panelCamFilter && evt.cameraId !== this.panelCamFilter) return;
    if (this.panelTypeFilter && evt.detectionType !== this.panelTypeFilter) return;

    this.detections.unshift(evt);
    const cnt = document.getElementById('nvrEPCnt');
    const list = document.getElementById('nvrEPList');
    if (!list) return;

    if (cnt) cnt.textContent = String(this.detections.length);
    list.querySelector('.nvr-ep-empty')?.remove();

    const div = document.createElement('div');
    div.innerHTML = this.evtCardHtml(evt, true);
    const card = div.firstElementChild as HTMLElement;

    // Gán dataset cho thẻ vừa tạo để lightbox có thể đọc
    try {
      const m: any = JSON.parse(evt.metadata ?? '{}');
      if (m.snapshotUrl) card.dataset.snap = `${API_BASE_URL}${m.snapshotUrl}`;
      if (m.videoUrl) card.dataset.video = `${API_BASE_URL}${m.videoUrl}`;
    } catch { }

    list.insertBefore(card, list.firstChild);
  }

  // ════════════════════════════════════════════════════════════
  // Expand / collapse camera
  // ════════════════════════════════════════════════════════════

  private toggleExpand(cell: HTMLElement, camId: string, camName: string): void {
    if (this.expandedId === camId) {
      this.collapseExpanded();
    } else {
      if (this.expandedId) this.collapseExpanded();

      this.expandedId = camId;
      cell.classList.add('expanded');
      document.getElementById('nvrGrid')
        ?.querySelectorAll<HTMLElement>('.nvr-cell:not(.expanded)')
        .forEach(c => { c.style.display = 'none'; });

      // Switch to main (high-res) stream for fullscreen
      const mainId = cell.dataset.main ?? cell.dataset.go2rtc ?? '';
      const iframe = document.getElementById(`nvr-frame-${camId}`) as HTMLIFrameElement | null;
      if (iframe && mainId) {
        iframe.src = `${GO2RTC_URL}/stream.html?src=${encodeURIComponent(mainId)}&mode=mse&controls=0`;
      }

      // Toolbar: show back + camera name
      document.getElementById('nvrBackBtn')?.classList.add('visible');
      const fsCam = document.getElementById('nvrFsCam');
      if (fsCam) { fsCam.textContent = camName; fsCam.style.display = 'block'; }

      // Panel: filter to this camera
      this.setPanelCamFilter(camId, camName);
    }
  }

  private collapseExpanded(): void {
    const grid = document.getElementById('nvrGrid');
    const expanded = grid?.querySelector<HTMLElement>('.nvr-cell.expanded');

    // Switch back to sub-stream
    if (expanded) {
      const camId = expanded.dataset.camId ?? '';
      const subId = expanded.dataset.sub ?? expanded.dataset.go2rtc ?? '';
      const iframe = document.getElementById(`nvr-frame-${camId}`) as HTMLIFrameElement | null;
      if (iframe && subId) {
        iframe.src = `${GO2RTC_URL}/stream.html?src=${encodeURIComponent(subId)}&mode=mse&controls=0`;
      }
      expanded.classList.remove('expanded');
    }

    grid?.querySelectorAll<HTMLElement>('.nvr-cell').forEach(c => { c.style.display = ''; });
    this.expandedId = null;

    // Toolbar: hide back
    document.getElementById('nvrBackBtn')?.classList.remove('visible');
    const fsCam = document.getElementById('nvrFsCam');
    if (fsCam) { fsCam.textContent = ''; fsCam.style.display = 'none'; }

    // Panel: show all cameras
    this.setPanelCamFilter('', '');
  }

  private setPanelCamFilter(camId: string, camName: string): void {
    this.panelCamFilter = camId;
    const title = document.getElementById('nvrEPTitle');
    if (title) title.textContent = camId ? camName : 'SỰ KIỆN CAM';
    this.loadDetections();
  }

  // ════════════════════════════════════════════════════════════
  // Event bindings
  // ════════════════════════════════════════════════════════════

  private bindEvents(): void {
    // Layout switcher
    document.querySelectorAll<HTMLElement>('.nvr-lb').forEach(btn => {
      btn.addEventListener('click', () => {
        const layout = btn.dataset.layout as Layout | undefined;
        if (!layout || layout === this.currentLayout) return;
        document.querySelectorAll('.nvr-lb').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentLayout = layout;
        document.getElementById('nvrGrid')!.className = `nvr-grid ${layout}`;
        this.collapseExpanded();
        this.renderGrid();
      });
    });

    // Camera select → 1×1 for that cam
    document.getElementById('nvrSel')?.addEventListener('change', (e) => {
      const camId = (e.target as HTMLSelectElement).value;
      if (camId) {
        const cam = this.cameras.find(c => c.id === camId) ?? null;
        this.setLayout('l1');
        this.renderGrid(cam ? [cam] : [null]);
      } else {
        this.setLayout('l4');
        this.renderGrid();
      }
    });

    // Back button
    document.getElementById('nvrBackBtn')?.addEventListener('click', () => this.collapseExpanded());

    // Grid delegation
    const grid = document.getElementById('nvrGrid');
    if (grid) {
      // Double-click cell → expand
      grid.addEventListener('dblclick', (e) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.nvr-cell');
        if (!cell?.dataset.camId) return;
        this.toggleExpand(cell, cell.dataset.camId, cell.dataset.camName ?? '');
      });

      grid.addEventListener('click', (e) => {
        // Button: fullscreen
        const btnFull = (e.target as HTMLElement).closest<HTMLElement>('.btn-full');
        if (btnFull) {
          const cell = btnFull.closest<HTMLElement>('.nvr-cell')!;
          this.toggleExpand(cell, btnFull.dataset.id!, btnFull.dataset.name ?? '');
          return;
        }
        // Button: snapshot
        const btnSnap = (e.target as HTMLElement).closest<HTMLElement>('.btn-snap');
        if (btnSnap && btnSnap.dataset.src) {
          const url = `${GO2RTC_URL}/api/frame.jpeg?src=${encodeURIComponent(btnSnap.dataset.src)}`;
          Object.assign(document.createElement('a'), { href: url, download: `snap_${Date.now()}.jpg`, target: '_blank' }).click();
        }
      });
    }

    // Panel toggle (collapse/expand)
    document.getElementById('nvrEPTab')?.addEventListener('click', () => {
      document.getElementById('nvrEP')?.classList.toggle('collapsed');
    });

    // Panel filters
    document.getElementById('nvrEPType')?.addEventListener('change', (e) => {
      this.panelTypeFilter = (e.target as HTMLSelectElement).value;
      this.loadDetections();
    });
    document.getElementById('nvrEPDate')?.addEventListener('change', (e) => {
      this.panelDateFilter = (e.target as HTMLInputElement).value;
      this.loadDetections();
    });
    document.getElementById('nvrEPRefresh')?.addEventListener('click', () => {
      (document.getElementById('nvrEPDate') as HTMLInputElement).value = '';
      this.panelDateFilter = '';
      this.panelTypeFilter = '';
      (document.getElementById('nvrEPType') as HTMLSelectElement).value = '';
      this.loadDetections();
    });

    // Events list: click → lightbox
    document.getElementById('nvrEPList')?.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.nvr-evt');
      if (!card) return;
      const snap = card.dataset.snap;
      const video = card.dataset.video;
      if (video) this.openLightbox(video, true);
      else if (snap) this.openLightbox(snap, false);
    });

    // Lightbox
    document.getElementById('nvrLBClose')?.addEventListener('click', () => this.closeLightbox());
    document.getElementById('nvrLB')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'nvrLB') this.closeLightbox();
    });

    document.addEventListener('keydown', this._onKey);
  }

  private openLightbox(url: string, isVideo: boolean): void {
    if (!url) return;
    const content = document.getElementById('nvrLBContent')!;
    if (isVideo) {
      content.innerHTML = `<video src="${url}" controls autoplay loop style="max-height:85vh"></video>`;
    } else {
      content.innerHTML = `<img src="${url}" alt="snapshot" style="max-height:85vh">`;
    }
    document.getElementById('nvrLB')!.classList.add('open');
  }

  private closeLightbox(): void {
    const content = document.getElementById('nvrLBContent');
    if (content) content.innerHTML = ''; // Stop video
    document.getElementById('nvrLB')!.classList.remove('open');
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('nvrLB')?.classList.contains('open')) { this.closeLightbox(); return; }
    if (this.expandedId) this.collapseExpanded();
  };

  private setLayout(layout: Layout): void {
    this.currentLayout = layout;
    document.querySelectorAll('.nvr-lb').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-layout="${layout}"]`)?.classList.add('active');
    const g = document.getElementById('nvrGrid');
    if (g) g.className = `nvr-grid ${layout}`;
  }

  // ════════════════════════════════════════════════════════════
  // SignalR
  // ════════════════════════════════════════════════════════════

  private connectSignalR(): void {
    const token = localStorage.getItem('station_token') ?? localStorage.getItem('station_jwt');
    if (!token) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('/ws/realtime', { accessTokenFactory: () => token! })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('DeviceStatus', (data: { deviceId: string; status: string }) => {
      const cam = this.cameras.find(c => c.id === data.deviceId);
      if (cam) (cam as any).status = data.status;
      const dot = document.getElementById(`nvr-dot-${data.deviceId}`);
      if (dot) dot.className = `nvr-dot ${data.status}`;
      const online = this.cameras.filter(c => (c.status as string) === 'online').length;
      const el = document.getElementById('nvrOnline');
      if (el) { el.textContent = `${online}/${this.cameras.length}`; el.style.color = online > 0 ? '#10b981' : '#ef4444'; }
    });

    // Live sensor values + dots
    this.hubConnection.on('SensorUpdate', (readings: any[]) => {
      this.drawPoints(readings);
    });

    // New camera event -> prepend to panel
    this.hubConnection.on('CameraEvent', (evt: DetectionEvent) => {
      this.prependDetection(evt);
    });

    // Integrated Alert System (Pulsing + Toast)
    this.hubConnection.on('AlertNew', (alert: any) => {
      // 1. Show Toast
      this.showAlarmToast(alert);

      // 2. Pulse camera cell
      if (alert.deviceId && alert.level === 'alarm') {
        const cell = document.querySelector(`.nvr-cell[data-cam-id="${alert.deviceId}"]`);
        if (cell) cell.classList.add('alarm-triggered');
      }

      // 3. Refresh sidebar detections to get the alert context
      this.loadDetections();
    });

    this.hubConnection.on('AlertUpdated', (data: any) => {
      // If alert closed, remove pulsing
      if (data.status === 'closed' && data.deviceId) {
        const cells = document.querySelectorAll(`.nvr-cell[data-cam-id="${data.deviceId}"]`);
        cells.forEach(c => c.classList.remove('alarm-triggered'));
      }
    });

    this.hubConnection.start().catch(() => { });
  }

  private showAlarmToast(alert: any): void {
    const container = document.getElementById('nvrToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'nvr-alert-toast';
    toast.innerHTML = `
      <div style="font-size:1.5rem">🚨</div>
      <div style="flex:1">
        <div style="font-size:0.7rem;opacity:0.8">${alert.level.toUpperCase()}</div>
        <div>${alert.message}</div>
      </div>
      <div style="font-size:0.8rem">✕</div>
    `;

    toast.onclick = () => {
      toast.remove();
      // If there's an alert ID, we could navigate, but in RTM we just acknowledge locally
    };

    container.appendChild(toast);

    // Play sound if possible (Browser policy might block initial)
    try {
      const audio = new Audio('/assets/sounds/alarm_beep.mp3');
      audio.play();
    } catch { }

    setTimeout(() => toast.remove(), 8000);
  }

  private drawPoints(readings: any[]): void {
    // Group readings by camera to avoid constant DOM queries
    const camGroups: Record<string, any[]> = {};
    readings.forEach(r => {
      if (!camGroups[r.deviceId]) camGroups[r.deviceId] = [];
      camGroups[r.deviceId].push(r);
    });

    for (const [camId, points] of Object.entries(camGroups)) {
      const canvas = document.getElementById(`nvr-canvas-${camId}`) as HTMLCanvasElement;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Sync canvas internal resolution with display size
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cell = canvas.closest('.nvr-cell') as HTMLElement;
      // Kiểm tra tên camera hoặc go2rtcId để biết là cam nhiệt hay quang
      const go2rtcId = cell?.dataset.go2rtc?.toLowerCase() ?? '';
      const camName = cell?.dataset.camName?.toLowerCase() ?? '';
      const isThermal = camName.includes('nhiet') || camName.includes('thermal') || go2rtcId.includes('thermal');

      points.forEach(p => {
        // Chọn tọa độ tùy theo camera (quang hay nhiệt)
        const x = isThermal ? p.tx : p.ox;
        const y = isThermal ? p.ty : p.oy;

        if (x == null || y == null) return;

        const screenX = x * canvas.width;
        const screenY = y * canvas.height;

        // Vẽ chấm nhiệt
        const isHigh = p.value > 35; // Ngưỡng ví dụ, có thể lấy từ p.metadata
        ctx.beginPath();
        ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
        ctx.fillStyle = isHigh ? '#ef4444' : '#10b981';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.fill();

        // Vẽ nhãn giá trị
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(`${p.value.toFixed(1)}°C`, screenX + 8, screenY + 4);
      });
    }
  }

  /**
   * Đồng bộ trạng thái viền nháy cho các camera có cảnh báo đang mở
   */
  private async syncAlarmStates(): Promise<void> {
    try {
      // Lấy danh sách alert từ service
      const alerts = await stationApi.getAlerts();
      const openAlerts = alerts.filter(a => a.status === 'open' && a.level === 'alarm');
      openAlerts.forEach(a => {
        if (a.deviceId) {
          const cell = document.querySelector(`.nvr-cell[data-cam-id="${a.deviceId}"]`);
          if (cell) cell.classList.add('alarm-triggered');
        }
      });
    } catch (err) {
      console.warn('[SyncAlarmStates] Error:', err);
    }
  }

  // ════════════════════════════════════════════════════════════
  // Clock
  // ════════════════════════════════════════════════════════════

  private startClock(): void {
    const tick = (): void => {
      const now = new Date().toLocaleTimeString('vi-VN', { hour12: false });
      const clockEl = document.getElementById('nvrClock');
      if (clockEl) clockEl.textContent = now;
      this.cameras.forEach(c => {
        const el = document.getElementById(`nvr-ts-${c.id}`);
        if (el) el.textContent = now;
      });
    };
    tick();
    this.clockInterval = setInterval(tick, 1000);
  }
}
