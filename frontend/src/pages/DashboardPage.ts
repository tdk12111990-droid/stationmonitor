// ============================================================
// DashboardPage — SLD full-screen + KPI + Alerts + Camera
// Phase 5: Kết nối API thật, drawer thiết bị, upload SVG
// ============================================================

import { stationApi, type SldPoint, type SldUnpinnedDevice, type SensorPoint, type HealthScore } from '@/services/StationApiService';
import { GO2RTC_URL } from '@/utils/env';
import { router } from '@/router/Router';
import { confirmDialog } from '@/utils/confirm';

const API_BASE = 'http://localhost:5056';
const SLD_W = 792, SLD_H = 612; // landscape viewbox

export class DashboardPage {
  private stationId = '';

  private sldPoints: SldPoint[] = [];
  private sensors: SensorPoint[] = [];
  private kpiInterval?: ReturnType<typeof setInterval>;
  private alertInterval?: ReturnType<typeof setInterval>;
  private healthInterval?: ReturnType<typeof setInterval>;
  private editMode = false;

  // Pan/zoom state (cần truy cập từ nhiều method)
  private vs = 1; private vx = 0; private vy = 0;

  render(): string {
    return `
    <div class="dashboard-page new-dash-theme" style="position:relative;overflow:hidden;height:100%;background:#0f172a;">

      <!-- ══ SLD SVG fullscreen ══ -->
      <div id="sldViewport" style="position:absolute;inset:0;overflow:hidden;cursor:grab;">
        <svg id="sld-canvas" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="sld-color-filter" color-interpolation-filters="sRGB">
              <feColorMatrix id="sld-color-matrix" type="matrix"
                values="-0.161 0 0 0 0.220  -0.651 0 0 0 0.741  -0.808 0 0 0 0.973  0 0 0 1 0"/>
            </filter>
          </defs>
          <g id="sld-world">
            <g id="sld-bg"></g>
            <g id="dash-dots"></g>
          </g>
        </svg>
        <!-- Tooltip -->
        <div id="sld-tooltip" style="display:none;position:absolute;pointer-events:none;
          background:#1e293b;border:1px solid #334155;border-radius:7px;
          padding:7px 11px;font-size:0.75rem;color:#e2e8f0;
          box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:5;min-width:140px;"></div>
        <!-- Dot quick-action panel -->
        <div id="dot-edit-panel" style="display:none;position:absolute;z-index:40;
          background:#1e293b;border:1px solid #334155;border-radius:8px;
          box-shadow:0 6px 24px rgba(0,0,0,.5);padding:0;min-width:210px;overflow:hidden;">
          <div style="background:#0f172a;padding:7px 12px;border-bottom:1px solid #334155;
            display:flex;justify-content:space-between;align-items:center;">
            <span id="dep-title" style="font-size:0.72rem;font-weight:800;color:#e2e8f0;">Thiết bị</span>
            <button id="dep-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1rem;">✕</button>
          </div>
          <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
            <div id="dep-info" style="font-size:0.68rem;color:#94a3b8;margin-bottom:2px;"></div>
            <!-- Label -->
            <label style="font-size:0.67rem;color:#64748b;">Nhãn</label>
            <input id="dep-label" type="text" style="width:100%;box-sizing:border-box;padding:4px 7px;
              background:#0f172a;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:0.72rem;outline:none;">
            <!-- X / Y -->
            <div style="display:flex;gap:6px;">
              <div style="flex:1;">
                <label style="font-size:0.67rem;color:#64748b;">X</label>
                <input id="dep-x" type="number" min="0" max="792" style="width:100%;box-sizing:border-box;
                  padding:4px 7px;background:#0f172a;border:1px solid #334155;border-radius:5px;
                  color:#e2e8f0;font-size:0.72rem;outline:none;">
              </div>
              <div style="flex:1;">
                <label style="font-size:0.67rem;color:#64748b;">Y</label>
                <input id="dep-y" type="number" min="0" max="612" style="width:100%;box-sizing:border-box;
                  padding:4px 7px;background:#0f172a;border:1px solid #334155;border-radius:5px;
                  color:#e2e8f0;font-size:0.72rem;outline:none;">
              </div>
            </div>
            <!-- Radius -->
            <label style="font-size:0.67rem;color:#64748b;">Kích thước (r)</label>
            <input id="dep-r" type="number" min="4" max="40" step="1" style="width:100%;box-sizing:border-box;
              padding:4px 7px;background:#0f172a;border:1px solid #334155;border-radius:5px;
              color:#e2e8f0;font-size:0.72rem;outline:none;">
            <!-- Buttons -->
            <div style="display:flex;gap:6px;margin-top:2px;">
              <button id="dep-save" style="flex:1;padding:5px;background:#1d4ed8;color:#fff;
                border:none;border-radius:5px;font-size:0.7rem;font-weight:700;cursor:pointer;">
                💾 Lưu
              </button>
              <button id="dep-delete" style="flex:1;padding:5px;background:#fef2f2;color:#ef4444;
                border:1px solid #fecaca;border-radius:5px;font-size:0.7rem;font-weight:700;cursor:pointer;">
                🗑 Gỡ
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Dot data panel (view mode click) -->
      <div id="dot-data-panel" style="display:none;position:absolute;z-index:40;
        background:#1e293b;border:1px solid #334155;border-radius:8px;
        box-shadow:0 6px 24px rgba(0,0,0,.5);padding:0;min-width:200px;max-width:230px;overflow:hidden;">
        <div style="background:#0f172a;padding:7px 12px;border-bottom:1px solid #334155;
          display:flex;justify-content:space-between;align-items:center;">
          <span id="ddp-title" style="font-size:0.72rem;font-weight:800;color:#93c5fd;">—</span>
          <button id="ddp-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1rem;">✕</button>
        </div>
        <div id="ddp-body" style="padding:8px 12px;"></div>
      </div>

      <!-- ══ Device Drawer (trái, edit mode) ══ -->
      <div id="deviceDrawer" style="position:absolute;top:0;left:0;bottom:0;width:220px;
        background:#111827;border-right:2px solid #2563eb;z-index:50;
        transform:translateX(-100%);transition:transform 0.25s ease;
        display:flex;flex-direction:column;">
        <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
          <div style="font-size:0.72rem;font-weight:800;color:#93c5fd;margin-bottom:2px;">THIẾT BỊ CHƯA ĐẶT</div>
          <div style="font-size:0.65rem;color:#475569;">Kéo thiết bị vào sơ đồ</div>
        </div>
        <div id="drawerList" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
          <div style="color:#475569;font-size:0.72rem;text-align:center;padding:20px;">Đang tải...</div>
        </div>
        <!-- Upload SVG -->
        <div style="padding:10px;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
          <input type="file" id="svgFileInput" accept=".svg" style="display:none">
          <button id="btnUploadSvg" class="btn-industrial" style="width:100%;font-size:0.72rem;padding:7px;">
            ↑ Upload SVG mới
          </button>
        </div>
      </div>

      <!-- ══ Toolbar nổi (top-center) ══ -->
      <div id="sldToolbar" style="position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:30;
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;
        background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px 14px;">
        <span id="sldTitle" style="font-size:0.78rem;font-weight:800;color:#e2e8f0;white-space:nowrap;">⛣ SƠ ĐỒ TRẠM</span>
        <div style="width:1px;height:18px;background:rgba(255,255,255,0.15);"></div>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="thermal" checked> Nhiệt
        </label>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="pd" checked> PD
        </label>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="camera" checked> Camera
        </label>
        <div style="width:1px;height:18px;background:rgba(255,255,255,0.15);"></div>
        <button id="sld-btn-fit" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
          color:#e2e8f0;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;">⊞ Fit</button>
        <button id="btnEditMode" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
          color:#e2e8f0;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;">📝 Chỉnh sơ đồ</button>
        <label title="Màu đường nét" style="display:flex;align-items:center;gap:3px;cursor:pointer;color:#94a3b8;font-size:10px;">
          🎨<input type="color" id="sld-color-picker" value="#38bdf8"
            style="width:18px;height:14px;border:none;padding:0;background:none;cursor:pointer;border-radius:2px;">
        </label>
      </div>

      <!-- ══ KPI nổi (top-left) ══ -->
      <div id="floatKpi" style="position:absolute;top:10px;left:10px;z-index:30;width:240px;
        background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <span style="font-size:0.7rem;font-weight:800;color:#94a3b8;letter-spacing:.5px;">📊 CHỈ SỐ HỆ THỐNG</span>
          <button id="btnCollapseKpi" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
        </div>
        <div id="kpiBody" style="padding:6px 8px;display:flex;flex-direction:column;gap:4px;">
          <div class="kpi-row-item" style="border-left:3px solid #ef4444;">
            <span class="kpi-row-label">🌡 NHIỆT ĐỘ CAO NHẤT</span>
            <span class="kpi-row-val kpi-text-red"><span class="kpi-val">--</span> °C</span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #f59e0b;">
            <span class="kpi-row-label">⚡ PHÓNG ĐIỆN (PD)</span>
            <span class="kpi-row-val kpi-text-orange"><span class="kpi-val">--</span> dB</span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #10b981;">
            <span class="kpi-row-label">📡 THIẾT BỊ ONLINE</span>
            <span class="kpi-row-val kpi-text-green"><span class="kpi-val">--</span></span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #ef4444;">
            <span class="kpi-row-label">🔔 CẢNH BÁO ĐANG MỞ</span>
            <span class="kpi-row-val kpi-text-red"><span class="kpi-val">--</span></span>
          </div>
        </div>
      </div>

      <!-- ══ Health widget (bên trái, dưới KPI) ══ -->
      <div id="floatHealth" style="position:absolute;top:auto;left:10px;z-index:30;width:240px;
        background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;
        margin-top:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <span style="font-size:0.7rem;font-weight:800;color:#94a3b8;letter-spacing:.5px;">🛡 SỨC KHỎE HỆ THỐNG</span>
          <button id="btnCollapseHealth" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
        </div>
        <div id="healthBody" style="padding:5px 8px;display:flex;flex-direction:column;gap:3px;">
          <div style="color:#475569;font-size:0.68rem;text-align:center;padding:6px;">Đang tải...</div>
        </div>
      </div>

      <!-- ══ Cột phải: Alerts + Camera ══ -->
      <div id="floatRightCol" style="position:absolute;top:10px;right:10px;z-index:30;width:255px;
        display:flex;flex-direction:column;gap:8px;max-height:calc(100% - 38px);">

        <!-- Nhật ký cảnh báo -->
        <div id="floatAlerts" style="display:flex;flex-direction:column;min-height:0;flex:1;
          background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;
          overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);">
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:8px 12px;border-bottom:1px solid #f1f5f9;flex-shrink:0;background:#f8fafc;">
            <span style="font-size:0.7rem;font-weight:800;color:#475569;letter-spacing:.5px;">🔔 CẢNH BÁO GẦN ĐÂY</span>
            <button id="btnCollapseAlerts" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
          </div>
          <div id="alertsBody" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
            <div id="dashAlertList" style="overflow-y:auto;flex:1;padding:8px;">
              <div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Đang tải...</div>
            </div>
            <div style="text-align:center;padding:7px 0;border-top:1px solid #f1f5f9;flex-shrink:0;background:#f8fafc;">
              <a href="javascript:void(0)" id="btnSeeAllAlerts"
                style="font-size:10px;color:#0ea5e9;font-weight:700;text-decoration:none;">TẤT CẢ LỊCH SỬ →</a>
            </div>
          </div>
        </div>

        <!-- Camera live -->
        <div id="floatCam" style="flex-shrink:0;
          background:#0f172a;border:1px solid #1e293b;border-radius:10px;
          overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:5px 10px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:0.65rem;font-weight:800;color:#e2e8f0;">📷 CAMERA LIVE</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="btnFullCam" style="background:none;border:1px solid #38bdf8;color:#38bdf8;cursor:pointer;
                font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:4px;">FULL VIEW →</button>
              <button id="btnCollapseCam" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
            </div>
          </div>
          <div id="camBody">
            <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;">
              <iframe src="${GO2RTC_URL}/stream.html?src=camera_152_normal&mode=mse"
                style="width:100%;height:calc(100% + 42px);border:none;pointer-events:none;display:block;">
              </iframe>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Status bar ══ -->
      <div style="position:absolute;bottom:0;left:0;right:0;z-index:30;
        display:flex;gap:24px;padding:4px 10px;font-size:10px;color:#64748b;
        background:rgba(10,14,20,0.85);border-top:1px solid rgba(255,255,255,0.07);">
        <span id="statusPlc" style="display:flex;align-items:center;gap:5px;font-weight:600;">
          <span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> PLC: Đang kết nối...
        </span>
        <span id="statusSld" style="display:flex;align-items:center;gap:5px;font-weight:600;">
          <span style="width:6px;height:6px;background:#64748b;border-radius:50%;display:inline-block;"></span> SLD: Chưa có sơ đồ
        </span>
      </div>

    </div>`;
  }

  async mount(): Promise<void> {
    // Load station ID
    this.stationId = await stationApi.getFirstStationId() ?? '';

    this.initPanZoom();
    this.initCollapse();
    this.initColorPicker();
    this.initEditMode();
    this.initDotPanel();
    this.initDragDrop();
    this.initUploadSvg();
    this.bindNavEvents();

    // Load data
    await this.loadSld();
    await this.refreshKpi();
    await this.refreshAlerts();

    // Polling
    this.kpiInterval = setInterval(() => this.refreshKpi(), 5000);
    this.alertInterval = setInterval(() => this.refreshAlerts(), 15000);
    this.healthInterval = setInterval(() => this.refreshHealth(), 120000); // mỗi 2 phút
    await this.refreshHealth();
    this.positionHealthWidget();
  }

  // ── SLD load ────────────────────────────────────────────────
  private async loadSld(): Promise<void> {
    if (!this.stationId) return;
    try {
      const data = await stationApi.getSld(this.stationId);
      // sldFileId tracked server-side only
      this.sldPoints = data.points;

      // Render SVG background
      this.renderSvgBackground(data.svgUrl);

      // Render dots
      this.renderSldPoints(data.points);

      // Render drawer
      this.renderDrawer(data.unpinned);

      // Status bar
      const statusEl = document.getElementById('statusSld');
      if (statusEl) {
        const dot = statusEl.querySelector('span')!;
        if (data.svgUrl) {
          dot.style.background = '#10b981';
          statusEl.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> SLD: v${data.version}`;
        } else {
          dot.style.background = '#f59e0b';
          statusEl.innerHTML = `<span style="width:6px;height:6px;background:#f59e0b;border-radius:50%;display:inline-block;"></span> SLD: Chưa upload sơ đồ`;
        }
      }

      // Cập nhật tiêu đề
      const stations = await stationApi.getStations();
      const station = stations.find(s => s.id === this.stationId);
      if (station) {
        const titleEl = document.getElementById('sldTitle');
        if (titleEl) titleEl.textContent = `⛣ ${station.name.toUpperCase()}`;
      }
    } catch (e) {
      console.error('[SLD] Load lỗi:', e);
    }
  }

  private renderSvgBackground(svgUrl?: string): void {
    const bg = document.getElementById('sld-bg');
    if (!bg) return;
    bg.innerHTML = '';

    const ns = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', String(SLD_W));
    rect.setAttribute('height', String(SLD_H));
    rect.setAttribute('fill', '#0f172a');
    bg.appendChild(rect);

    if (svgUrl) {
      const img = document.createElementNS(ns, 'image');
      img.setAttribute('href', `${API_BASE}${svgUrl}`);
      img.setAttribute('x', '0'); img.setAttribute('y', '0');
      img.setAttribute('width', String(SLD_W)); img.setAttribute('height', String(SLD_H));
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      img.setAttribute('filter', 'url(#sld-color-filter)');
      bg.appendChild(img);
    } else {
      // Placeholder text
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', String(SLD_W / 2)); txt.setAttribute('y', String(SLD_H / 2));
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', '#1e293b');
      txt.setAttribute('font-size', '18'); txt.setAttribute('font-family', 'sans-serif');
      txt.textContent = 'Chưa có sơ đồ — Bật "Chỉnh sơ đồ" và upload file SVG';
      bg.appendChild(txt);
    }
  }

  private renderSldPoints(points: SldPoint[]): void {
    const container = document.getElementById('dash-dots');
    if (!container) return;
    const ns = 'http://www.w3.org/2000/svg';
    container.innerHTML = '';

    points.forEach(p => {
      const color = this.dotColor(p.deviceType, p.deviceStatus);
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('data-point-id', p.id);
      g.setAttribute('data-device-id', p.deviceId ?? '');
      g.setAttribute('data-device-type', p.deviceType ?? '');
      g.style.cursor = this.editMode ? 'move' : 'pointer';

      const circ = document.createElementNS(ns, 'circle');
      circ.setAttribute('cx', String(p.x)); circ.setAttribute('cy', String(p.y));
      circ.setAttribute('r', String(p.r));
      circ.setAttribute('fill', color); circ.setAttribute('fill-opacity', '0.88');
      circ.setAttribute('stroke', this.editMode ? '#facc15' : '#fff');
      circ.setAttribute('stroke-width', '1.5');
      g.appendChild(circ);

      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', String(p.x + p.r + 3)); txt.setAttribute('y', String(p.y + 4));
      txt.setAttribute('font-size', '7'); txt.setAttribute('font-family', 'sans-serif');
      txt.setAttribute('font-weight', '700'); txt.setAttribute('fill', color);
      txt.setAttribute('pointer-events', 'none');
      txt.textContent = p.label;
      g.appendChild(txt);

      // Tooltip on hover
      g.addEventListener('mouseenter', (e: MouseEvent) => {
        if (this.editMode) return;
        const tip = document.getElementById('sld-tooltip')!;
        const deviceSensors = this.sensors.filter(s => s.deviceId === p.deviceId);
        let sensorHtml = '';
        if (deviceSensors.length > 0) {
          sensorHtml = '<div style="border-top:1px solid #334155;margin:5px 0 3px;"></div>' +
            deviceSensors.map(s => {
              const lbl = this.sensorLabel(s.pointId);
              const col = s.pointId.startsWith('nhiet') ? '#f87171' : '#fbbf24';
              return `<div style="display:flex;justify-content:space-between;gap:10px;">
                <span style="color:#94a3b8;">${lbl}</span>
                <b style="color:${col};">${s.value.toFixed(1)} ${s.unit}</b>
              </div>`;
            }).join('');
        }
        tip.innerHTML = `
          <div style="font-weight:800;color:#e2e8f0;margin-bottom:2px;">${p.label}</div>
          <div style="font-size:0.68rem;color:#64748b;">${p.deviceType ?? '—'} · ${p.deviceStatus ?? '—'}</div>
          ${sensorHtml}
          <div style="font-size:0.62rem;color:#475569;margin-top:4px;">Click để xem chi tiết</div>`;
        const vp = document.getElementById('sldViewport')!.getBoundingClientRect();
        tip.style.left = (e.clientX - vp.left + 14) + 'px';
        tip.style.top = (e.clientY - vp.top - 12) + 'px';
        tip.style.display = 'block';
      });
      g.addEventListener('mouseleave', () => {
        document.getElementById('sld-tooltip')!.style.display = 'none';
      });

      container.appendChild(g);
    });

    this.applyDotFilter();
  }

  private dotColor(type?: string, status?: string): string {
    if (!type) return '#94a3b8';
    if (type.startsWith('camera')) return '#3b82f6';
    if (status === 'offline') return '#ef4444';
    return '#10b981';
  }

  // ── Drawer (unpinned devices) ────────────────────────────────
  private renderDrawer(unpinned: SldUnpinnedDevice[]): void {
    const list = document.getElementById('drawerList');
    if (!list) return;
    if (unpinned.length === 0) {
      list.innerHTML = '<div style="color:#475569;font-size:0.72rem;text-align:center;padding:20px;">Tất cả thiết bị đã đặt lên sơ đồ</div>';
      return;
    }
    list.innerHTML = unpinned.map(d => {
      const icon = d.type.startsWith('camera') ? '📷' : d.type === 'plc_s7' ? '🔌' : '📡';
      const color = d.status === 'online' ? '#10b981' : '#ef4444';
      return `
      <div class="drawer-device-item" draggable="true" data-device-id="${d.id}" data-device-name="${d.name}" data-device-type="${d.type}"
        style="background:#1f2937;border:1px solid transparent;border-radius:6px;
          padding:9px 10px;cursor:grab;font-size:0.72rem;user-select:none;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span>${icon}</span>
          <div>
            <div style="font-weight:700;color:#e2e8f0;">${d.name}</div>
            <div style="color:${color};font-size:0.62rem;margin-top:2px;">● ${d.status}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Bind dragstart
    list.querySelectorAll('.drawer-device-item').forEach(item => {
      item.addEventListener('dragstart', (e: Event) => {
        const de = e as DragEvent;
        const el = item as HTMLElement;
        de.dataTransfer!.setData('deviceId', el.dataset['deviceId'] ?? '');
        de.dataTransfer!.setData('deviceName', el.dataset['deviceName'] ?? '');
        de.dataTransfer!.setData('deviceType', el.dataset['deviceType'] ?? '');
        el.style.opacity = '0.4';
      });
      item.addEventListener('dragend', (_e: Event) => {
        (item as HTMLElement).style.opacity = '1';
      });
    });
  }

  // ── Drag-drop onto SVG ───────────────────────────────────────
  private initDragDrop(): void {
    const viewport = document.getElementById('sldViewport')!;

    viewport.addEventListener('dragover', e => {
      if (!this.editMode) return;
      e.preventDefault();
    });

    viewport.addEventListener('drop', async (e: DragEvent) => {
      if (!this.editMode) return;
      e.preventDefault();

      const deviceId = e.dataTransfer!.getData('deviceId');
      const deviceName = e.dataTransfer!.getData('deviceName');
      if (!deviceId || !this.stationId) return;

      // Convert mouse position → SVG coordinate
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const svgX = (mouseX - this.vx) / this.vs;
      const svgY = (mouseY - this.vy) / this.vs;

      // Clamp within SLD bounds
      const x = Math.max(10, Math.min(SLD_W - 10, svgX));
      const y = Math.max(10, Math.min(SLD_H - 10, svgY));

      try {
        const newPoint = await stationApi.addSldPoint(this.stationId, {
          deviceId, label: deviceName, x, y, r: 10,
        });
        this.sldPoints.push(newPoint);
        this.renderSldPoints(this.sldPoints);
        // Refresh drawer (thiết bị vừa đặt biến mất khỏi danh sách)
        await this.reloadDrawer();
        this.initDotDrag(); // re-bind drag trên dots mới
      } catch (err) {
        console.error('[SLD] Đặt thiết bị thất bại:', err);
      }
    });
  }

  // ── Dot drag (di chuyển điểm đã đặt) ────────────────────────
  private initDotDrag(): void {
    const viewport = document.getElementById('sldViewport')!;
    let active: { el: SVGGElement; pointId: string; startX: number; startY: number; mx: number; my: number } | null = null;
    let wasDrag = false;

    // Remove old listeners by re-binding via container delegation
    const dotsLayer = document.getElementById('dash-dots')!;

    dotsLayer.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.editMode) return;
      const g = (e.target as Element).closest('#dash-dots > g') as SVGGElement | null;
      if (!g) return;
      const circ = g.querySelector('circle')!;
      e.stopPropagation();
      active = {
        el: g, pointId: g.dataset['pointId']!,
        startX: parseFloat(circ.getAttribute('cx')!),
        startY: parseFloat(circ.getAttribute('cy')!),
        mx: e.clientX, my: e.clientY,
      };
      wasDrag = false;
      viewport.style.cursor = 'move';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!active) return;
      const dx = (e.clientX - active.mx) / this.vs;
      const dy = (e.clientY - active.my) / this.vs;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wasDrag = true;
      if (!wasDrag) return;
      const nx = Math.max(0, Math.min(SLD_W, active.startX + dx));
      const ny = Math.max(0, Math.min(SLD_H, active.startY + dy));
      const circ = active.el.querySelector('circle')!;
      const r = parseFloat(circ.getAttribute('r')!);
      circ.setAttribute('cx', String(nx)); circ.setAttribute('cy', String(ny));
      const txt = active.el.querySelector('text');
      txt?.setAttribute('x', String(nx + r + 3)); txt?.setAttribute('y', String(ny + 4));
    });

    document.addEventListener('mouseup', async (e: MouseEvent) => {
      if (!active) return;
      if (wasDrag) {
        const circ = active.el.querySelector('circle')!;
        const nx = parseFloat(circ.getAttribute('cx')!);
        const ny = parseFloat(circ.getAttribute('cy')!);
        // Lưu vị trí mới lên API
        await stationApi.updateSldPoint(active.pointId, { x: nx, y: ny }).catch(() => { });
        // Cập nhật local state
        const pt = this.sldPoints.find(p => p.id === active!.pointId);
        if (pt) { pt.x = nx; pt.y = ny; }
      } else {
        // Click → show edit panel in edit mode, data panel in view mode
        if (this.editMode) {
          this.showDotPanel(active.pointId, e.clientX, e.clientY);
        } else {
          this.showDataPopup(active.pointId, e.clientX, e.clientY);
        }
      }
      active = null;
      wasDrag = false;
      viewport.style.cursor = this.editMode ? 'grab' : 'grab';
    });
  }

  // ── Dot quick panel ──────────────────────────────────────────
  private initDotPanel(): void {
    document.getElementById('dep-close')?.addEventListener('click', () => this.hideDotPanel());
    document.getElementById('ddp-close')?.addEventListener('click', () => this.hideDataPopup());

    // Live preview: nhập r → cập nhật node ngay trên canvas
    document.getElementById('dep-r')?.addEventListener('input', (e) => {
      const r = parseFloat((e.target as HTMLInputElement).value);
      if (isNaN(r) || r < 4) return;
      const panel = document.getElementById('dot-edit-panel')!;
      const pointId = panel.dataset['pointId'];
      if (!pointId) return;
      const g = document.querySelector(`#dash-dots > g[data-point-id="${pointId}"]`);
      if (!g) return;
      const circ = g.querySelector('circle')!;
      const cx = parseFloat(circ.getAttribute('cx')!);
      const cy = parseFloat(circ.getAttribute('cy')!);
      circ.setAttribute('r', String(r));
      const txt = g.querySelector('text');
      if (txt) { txt.setAttribute('x', String(cx + r + 3)); txt.setAttribute('y', String(cy + 4)); }
    });

    // Save button
    document.getElementById('dep-save')?.addEventListener('click', async () => {
      const panel = document.getElementById('dot-edit-panel')!;
      const pointId = panel.dataset['pointId'];
      if (!pointId) return;

      const label = (document.getElementById('dep-label') as HTMLInputElement).value.trim() || undefined;
      const x = parseFloat((document.getElementById('dep-x') as HTMLInputElement).value);
      const y = parseFloat((document.getElementById('dep-y') as HTMLInputElement).value);
      const r = parseFloat((document.getElementById('dep-r') as HTMLInputElement).value);

      try {
        await stationApi.updateSldPoint(pointId, { x, y, r, label });
        // Cập nhật local state
        const pt = this.sldPoints.find(p => p.id === pointId);
        if (pt) {
          pt.x = x; pt.y = y; pt.r = r;
          if (label) pt.label = label;
          if (label) (document.getElementById('dep-title') as HTMLElement).textContent = label;
        }
        this.renderSldPoints(this.sldPoints);
        this.initDotDrag();
        this.hideDotPanel();
      } catch (err) {
        alert('Lưu thất bại: ' + err);
      }
    });

    // Delete button
    document.getElementById('dep-delete')?.addEventListener('click', async () => {
      const panel = document.getElementById('dot-edit-panel')!;
      const pointId = panel.dataset['pointId'];
      if (!pointId) return;
      if (!await confirmDialog({ message: 'Gỡ thiết bị này khỏi sơ đồ?', confirmText: 'Gỡ', danger: true })) return;
      try {
        await stationApi.deleteSldPoint(pointId);
        this.sldPoints = this.sldPoints.filter(p => p.id !== pointId);
        this.renderSldPoints(this.sldPoints);
        await this.reloadDrawer();
        this.hideDotPanel();
      } catch { }
    });
  }

  private showDotPanel(pointId: string, clientX: number, clientY: number): void {
    const panel = document.getElementById('dot-edit-panel')!;
    const viewport = document.getElementById('sldViewport')!.getBoundingClientRect();
    const pt = this.sldPoints.find(p => p.id === pointId);
    if (!pt) return;

    panel.dataset['pointId'] = pointId;
    (document.getElementById('dep-title') as HTMLElement).textContent = pt.label;
    (document.getElementById('dep-info') as HTMLElement).innerHTML =
      `Loại: ${pt.deviceType ?? '—'} · ${pt.deviceStatus ?? '—'}`;

    // Populate inputs
    (document.getElementById('dep-label') as HTMLInputElement).value = pt.label;
    (document.getElementById('dep-x') as HTMLInputElement).value = Math.round(pt.x).toString();
    (document.getElementById('dep-y') as HTMLInputElement).value = Math.round(pt.y).toString();
    (document.getElementById('dep-r') as HTMLInputElement).value = String(pt.r);

    let left = clientX - viewport.left + 12;
    let top = clientY - viewport.top - 10;
    if (left + 220 > viewport.width) left = clientX - viewport.left - 225;
    if (top + 280 > viewport.height) top = clientY - viewport.top - 280;
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    panel.style.display = 'block';
  }

  private hideDotPanel(): void {
    const panel = document.getElementById('dot-edit-panel')!;
    panel.style.display = 'none';
    delete panel.dataset['pointId'];
  }

  // ── Data popup (view mode click) ─────────────────────────────
  private hideDataPopup(): void {
    const panel = document.getElementById('dot-data-panel');
    if (panel) panel.style.display = 'none';
  }

  private async showDataPopup(pointId: string, clientX: number, clientY: number): Promise<void> {
    const pt = this.sldPoints.find(p => p.id === pointId);
    if (!pt) return;

    const panel = document.getElementById('dot-data-panel')!;
    const body = document.getElementById('ddp-body')!;
    (document.getElementById('ddp-title') as HTMLElement).textContent = pt.label;

    // Position
    const viewport = document.getElementById('sldViewport')!.getBoundingClientRect();
    let left = clientX - viewport.left + 14;
    let top = clientY - viewport.top - 12;
    if (left + 240 > viewport.width) left = clientX - viewport.left - 245;
    if (top + 240 > viewport.height) top = clientY - viewport.top - 240;
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    panel.style.display = 'block';

    const deviceSensors = this.sensors.filter(s => s.deviceId === pt.deviceId);
    if (deviceSensors.length === 0) {
      body.innerHTML = `<div style="color:#64748b;font-size:0.72rem;padding:4px 0;">Không có dữ liệu cảm biến</div>`;
      return;
    }

    const currentHtml = deviceSensors.map(s => {
      const lbl = this.sensorLabel(s.pointId);
      const col = s.pointId.startsWith('nhiet') ? '#f87171' : '#fbbf24';
      return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:0.68rem;color:#94a3b8;">${lbl}</span>
        <span style="font-size:0.82rem;font-weight:800;color:${col};">${s.value.toFixed(1)}<span style="font-size:0.62rem;font-weight:400;color:#64748b;"> ${s.unit}</span></span>
      </div>`;
    }).join('');

    body.innerHTML = currentHtml +
      `<div id="ddp-sparkline" style="margin-top:4px;"></div>`;

    // Sparkline for first sensor
    const main = deviceSensors[0];
    if (main && pt.deviceId) {
      this.loadSparkline('ddp-sparkline', pt.deviceId, main.pointId);
    }
  }

  private sensorLabel(pointId: string): string {
    const map: Record<string, string> = {
      nhiet_do_pha_1: 'Nhiệt độ Pha 1',
      nhiet_do_pha_2: 'Nhiệt độ Pha 2',
      nhiet_do_pha_3: 'Nhiệt độ Pha 3',
      phong_dien: 'Phóng điện (PD)',
    };
    return map[pointId] ?? pointId;
  }

  private async loadSparkline(containerId: string, deviceId: string, pointId: string): Promise<void> {
    try {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const data = await stationApi.getHistory(deviceId, pointId, from, to, 60);

      const container = document.getElementById(containerId);
      if (!container || data.length < 2) return;

      const vals = data.map(d => d.value);
      const min = Math.min(...vals), max = Math.max(...vals);
      const range = max - min || 1;
      const W = 190, H = 44;

      const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.value - min) / range) * (H - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      const unit = pointId === 'phong_dien' ? 'dB' : '°C';
      container.innerHTML = `
        <div style="font-size:0.6rem;color:#475569;margin-bottom:3px;">1 giờ qua · ${data.length} mẫu</div>
        <svg width="${W}" height="${H}" style="display:block;border-radius:4px;background:#0f172a;">
          <polyline points="${pts}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:#64748b;margin-top:2px;">
          <span>Min: ${min.toFixed(1)}${unit}</span>
          <span>Max: ${max.toFixed(1)}${unit}</span>
        </div>`;
    } catch {
      // silently fail
    }
  }

  // ── Edit mode ────────────────────────────────────────────────
  private initEditMode(): void {
    document.getElementById('btnEditMode')?.addEventListener('click', () => {
      this.editMode = !this.editMode;
      const btn = document.getElementById('btnEditMode')!;
      const drawer = document.getElementById('deviceDrawer')!;

      if (this.editMode) {
        btn.style.background = 'rgba(245,158,11,0.3)';
        btn.style.color = '#fbbf24'; btn.style.borderColor = '#d97706';
        btn.textContent = '🔓 Đang chỉnh';
        drawer.style.transform = 'translateX(0)';
        // Shift toolbar ra phải để tránh bị drawer che
        (document.getElementById('sldToolbar') as HTMLElement).style.left = 'calc(50% + 110px)';
      } else {
        btn.style.background = 'rgba(255,255,255,0.07)';
        btn.style.color = '#e2e8f0'; btn.style.borderColor = 'rgba(255,255,255,0.15)';
        btn.textContent = '📝 Chỉnh sơ đồ';
        drawer.style.transform = 'translateX(-100%)';
        (document.getElementById('sldToolbar') as HTMLElement).style.left = '50%';
        this.hideDotPanel();
      }

      // Cập nhật màu stroke dots
      document.querySelectorAll<SVGCircleElement>('#dash-dots circle').forEach(c => {
        c.setAttribute('stroke', this.editMode ? '#facc15' : '#fff');
      });
    });
  }

  // ── Upload SVG ───────────────────────────────────────────────
  private initUploadSvg(): void {
    const btn = document.getElementById('btnUploadSvg')!;
    const input = document.getElementById('svgFileInput') as HTMLInputElement;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file || !this.stationId) return;

      btn.textContent = '⏳ Đang upload...';
      btn.setAttribute('disabled', 'true');

      try {
        const result = await stationApi.uploadSldSvg(this.stationId, file);
        // sldFileId updated server-side
        this.renderSvgBackground(result.svgUrl);
        const statusEl = document.getElementById('statusSld');
        if (statusEl) statusEl.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> SLD: v${result.version}`;
        this.showToast('Upload SVG thành công', 'success');
      } catch (e) {
        this.showToast(`Lỗi upload: ${(e as Error).message}`, 'error');
      } finally {
        btn.textContent = '↑ Upload SVG mới';
        btn.removeAttribute('disabled');
        input.value = '';
      }
    });
  }

  // ── Reload drawer (sau khi thêm/xóa điểm) ───────────────────
  private async reloadDrawer(): Promise<void> {
    if (!this.stationId) return;
    const data = await stationApi.getSld(this.stationId).catch(() => null);
    if (data) this.renderDrawer(data.unpinned);
  }

  // ── Pan / Zoom ───────────────────────────────────────────────
  private initPanZoom(): void {
    const viewport = document.getElementById('sldViewport')!;
    const world = document.getElementById('sld-world')!;

    const apply = () => world.setAttribute('transform', `translate(${this.vx},${this.vy}) scale(${this.vs})`);

    const fit = () => {
      const r = viewport.getBoundingClientRect();
      const s = Math.min(r.width / SLD_W, r.height / SLD_H) * 0.96;
      this.vs = s;
      this.vx = (r.width - SLD_W * s) / 2;
      this.vy = (r.height - SLD_H * s) / 2;
      apply();
    };

    let panning = false, px0 = 0, py0 = 0, vx0 = 0, vy0 = 0;

    viewport.addEventListener('mousedown', e => {
      if ((e.target as HTMLElement).closest('#floatKpi,#floatAlerts,#floatCam,#deviceDrawer')) return;
      if (this.editMode && (e.target as Element).closest('#dash-dots > g')) return;
      panning = true; px0 = e.clientX; py0 = e.clientY; vx0 = this.vx; vy0 = this.vy;
      viewport.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
      if (!panning) return;
      this.vx = vx0 + (e.clientX - px0);
      this.vy = vy0 + (e.clientY - py0);
      apply();
    });
    document.addEventListener('mouseup', () => {
      panning = false;
      viewport.style.cursor = 'grab';
    });
    viewport.addEventListener('wheel', e => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.max(0.1, Math.min(10, this.vs * f));
      this.vx = cx - (cx - this.vx) * (ns / this.vs);
      this.vy = cy - (cy - this.vy) * (ns / this.vs);
      this.vs = ns;
      apply();
    }, { passive: false });

    document.getElementById('sld-btn-fit')?.addEventListener('click', fit);
    setTimeout(fit, 100);
    this.initDotDrag();
  }

  // ── Collapse toggles ─────────────────────────────────────────
  private initCollapse(): void {
    const setup = (btnId: string, bodyId: string) => {
      const btn = document.getElementById(btnId);
      const body = document.getElementById(bodyId);
      if (!btn || !body) return;
      btn.addEventListener('click', () => {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        if (bodyId === 'alertsBody') {
          const panel = document.getElementById('floatAlerts');
          if (panel) panel.style.flex = hidden ? '1' : '0 0 auto';
        }
        btn.textContent = hidden ? '▲' : '▼';
      });
    };
    setup('btnCollapseKpi', 'kpiBody');
    setup('btnCollapseAlerts', 'alertsBody');
    setup('btnCollapseCam', 'camBody');
    setup('btnCollapseHealth', 'healthBody');
  }

  // ── Color picker ─────────────────────────────────────────────
  private initColorPicker(): void {
    const BG = { R: 0.059, G: 0.090, B: 0.165 };
    document.getElementById('sld-color-picker')?.addEventListener('input', function () {
      const hex = (this as HTMLInputElement).value;
      const R = parseInt(hex.slice(1, 3), 16) / 255, G = parseInt(hex.slice(3, 5), 16) / 255, B = parseInt(hex.slice(5, 7), 16) / 255;
      const m = [BG.R - R, 0, 0, 0, R, 0, BG.G - G, 0, 0, G, 0, 0, BG.B - B, 0, B, 0, 0, 0, 1, 0].join(' ');
      document.getElementById('sld-color-matrix')?.setAttribute('values', m);
    });
  }

  // ── KPI (real API) ───────────────────────────────────────────
  private async refreshKpi(): Promise<void> {
    try {
      const [points, devices, alerts] = await Promise.all([
        stationApi.getLatestPoints(this.stationId),
        this.stationId ? stationApi.getDevices(this.stationId) : Promise.resolve([]),
        stationApi.getAlerts('open', undefined, undefined, 100),
      ]);

      this.sensors = points;

      const temps = points.filter(p => p.pointId.startsWith('nhiet_do'));
      const pd = points.find(p => p.pointId === 'phong_dien');
      const online = devices.filter(d => d.status === 'online').length;

      const rows = document.querySelectorAll<HTMLElement>('#floatKpi .kpi-row-item');
      const val = (i: number) => rows[i]?.querySelector('.kpi-val');

      if (temps.length) val(0)!.textContent = Math.max(...temps.map(p => p.value)).toFixed(1);
      if (pd) val(1)!.textContent = `${pd.value.toFixed(1)}`;
      val(2)!.textContent = `${online}/${devices.length}`;
      val(3)!.textContent = String(alerts.length);

      const statusEl = document.getElementById('statusPlc');
      if (statusEl) statusEl.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> PLC: Online`;

      // Cập nhật màu dot theo status thiết bị
      devices.forEach(d => {
        const g = document.querySelector<SVGGElement>(`#dash-dots [data-device-id="${d.id}"]`);
        if (!g) return;
        const color = this.dotColor(d.type, d.status);
        g.querySelector('circle')?.setAttribute('fill', color);
        (g.querySelector('text') as SVGTextElement | null)?.setAttribute('fill', color);
      });

    } catch {
      const statusEl = document.getElementById('statusPlc');
      if (statusEl) statusEl.innerHTML = `<span style="width:6px;height:6px;background:#ef4444;border-radius:50%;display:inline-block;"></span> PLC: Offline`;
    }
  }

  // ── Alerts log ───────────────────────────────────────────────
  private async refreshAlerts(): Promise<void> {
    const listEl = document.getElementById('dashAlertList');
    if (!listEl) return;
    try {
      const alerts = await stationApi.getAlerts(undefined, undefined, undefined, 8);
      if (alerts.length === 0) {
        listEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Hệ thống ổn định</div>';
        return;
      }
      const levelColor = (l: string) => l === 'alarm' ? '#ef4444' : '#f59e0b';
      const statusBg = (s: string) => s === 'open' ? '#fef2f2' : s === 'acked' ? '#fffbeb' : '#f0fdf4';
      listEl.innerHTML = alerts.map(a => `
        <div style="padding:6px 8px;border-left:3px solid ${levelColor(a.level)};
          background:${statusBg(a.status)};border-radius:0 4px 4px 0;margin-bottom:5px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <span style="font-size:0.68rem;font-weight:800;color:#1e293b;">${a.level.toUpperCase()}</span>
            <span style="font-size:0.62rem;color:#64748b;">${new Date(a.triggeredAt).toLocaleTimeString('vi-VN')}</span>
          </div>
          <div style="font-size:0.68rem;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.message}</div>
          <span style="font-size:0.62rem;font-weight:700;color:${levelColor(a.level)};">${a.status.toUpperCase()}</span>
        </div>`).join('');
    } catch { }
  }

  // ── Filter dots ──────────────────────────────────────────────
  private applyDotFilter(): void {
    const thermal = (document.querySelector('[data-filter="thermal"]') as HTMLInputElement)?.checked;
    const pd = (document.querySelector('[data-filter="pd"]') as HTMLInputElement)?.checked;
    const camera = (document.querySelector('[data-filter="camera"]') as HTMLInputElement)?.checked;

    document.querySelectorAll<SVGGElement>('#dash-dots [data-device-type]').forEach(g => {
      const type = g.dataset['deviceType'] ?? '';
      let show = false;
      if (camera && type.startsWith('camera')) show = true;
      if (thermal && type === 'plc_s7') show = true;
      if (pd && type === 'plc_s7') show = true;
      if (!type) show = true; // điểm không gắn thiết bị
      g.style.display = show ? '' : 'none';
    });
  }

  // ── Nav events ───────────────────────────────────────────────
  private bindNavEvents(): void {
    document.getElementById('btnSeeAllAlerts')?.addEventListener('click', () => router.navigate('alerts-history'));
    document.getElementById('btnFullCam')?.addEventListener('click', () => router.navigate('realtime'));
    document.querySelectorAll('.filter-cb').forEach(cb =>
      cb.addEventListener('change', () => this.applyDotFilter())
    );
    // Đóng dot panel và data panel khi click ngoài
    document.getElementById('sldViewport')?.addEventListener('mousedown', e => {
      const t = e.target as Element;
      if (!t.closest('#dot-edit-panel') && !t.closest('#dash-dots'))
        this.hideDotPanel();
      if (!t.closest('#dot-data-panel') && !t.closest('#dash-dots'))
        this.hideDataPopup();
    });
  }

  // ── Toast ─────────────────────────────────────────────────────
  private showToast(msg: string, type: 'success' | 'error'): void {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ── Health scores ─────────────────────────────────────────
  private async refreshHealth(): Promise<void> {
    const body = document.getElementById('healthBody');
    if (!body) return;
    try {
      const scores = await stationApi.getHealthScores(this.stationId || undefined);
      if (scores.length === 0) {
        body.innerHTML = '<div style="color:#475569;font-size:0.68rem;text-align:center;padding:6px;">Chưa có dữ liệu</div>';
        return;
      }
      const riskColor: Record<string, string> = {
        good: '#10b981', fair: '#f59e0b', poor: '#f97316', critical: '#ef4444',
      };
      const riskLabel: Record<string, string> = {
        good: 'Tốt', fair: 'Trung bình', poor: 'Kém', critical: 'Nguy hiểm',
      };
      body.innerHTML = scores.map((s: HealthScore) => {
        const col = riskColor[s.risk] ?? '#64748b';
        const lbl = riskLabel[s.risk] ?? s.risk;
        const pct = s.score;
        const icon = s.deviceType.startsWith('camera') ? '📷' : s.deviceType === 'plc_s7' ? '🔌' : '📡';
        return `
          <div style="padding:3px 2px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
              <span style="font-size:0.65rem;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">
                ${icon} ${s.deviceName}
              </span>
              <span style="font-size:0.6rem;font-weight:800;color:${col};">${s.score} · ${lbl}</span>
            </div>
            <div style="background:#1e293b;border-radius:3px;height:4px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${col};border-radius:3px;transition:width 0.4s;"></div>
            </div>
          </div>`;
      }).join('');
    } catch {
      /* silently fail — backend mới có thể chưa tính */
    }
  }

  private positionHealthWidget(): void {
    const kpi = document.getElementById('floatKpi');
    const health = document.getElementById('floatHealth');
    if (!kpi || !health) return;
    const kpiBottom = kpi.getBoundingClientRect().bottom;
    const vpTop = document.getElementById('sldViewport')?.getBoundingClientRect().top ?? 0;
    health.style.top = (kpiBottom - vpTop + 8) + 'px';
  }

  destroy(): void {
    clearInterval(this.kpiInterval);
    clearInterval(this.alertInterval);
    clearInterval(this.healthInterval);
  }
}
