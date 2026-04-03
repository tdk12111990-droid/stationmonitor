// ============================================================
// DashboardPage – D02: Dashboard Tổng quan (Tối ưu cho Cảnh báo AI)
// ============================================================

import { sensorService, SensorData } from '@/services/SensorService';
import { getKpiSummary } from '@/services/MockDataService';
import { stationApi } from '@/services/StationApiService';
import { router } from '@/router/Router';
import { ScadaPoint } from '@/services/ScadaApiService';
import {
  loadScadaPoints, clearOldScadaEvents, getVirtualPoints, saveVirtualPoint, deleteVirtualPoint,
  getCustomPointPositions, saveCustomPointPosition, resetCustomPointPositions,
  getScadaEvents, saveScadaEvent, updateScadaEvent,
  getHiddenPointIds, hidePointLocal, resetHiddenPoints,
  getMaintenanceModeDevices,
  type ScadaEvent,
} from '@/services/storage';

export class DashboardPage {
  private dotRadii: Record<string, number> = {}; // pointId → radius (px in SVG landscape)
  private pollingInterval?: ReturnType<typeof setInterval>;
  private lastPoints: Map<string, string> = new Map(); // deviceId → status
  private currentPoints: ScadaPoint[] = []; // Store latest points for Editing logic

  render(): string {
    const kpi = getKpiSummary();

    return `
    <div class="dashboard-page new-dash-theme" style="position:relative;overflow:hidden;height:100%;background:#0f172a;">

      <!-- ══ SLD SVG fullscreen ══════════════════════════════════ -->
      <div id="sldViewport" style="position:absolute;inset:0;overflow:hidden;cursor:grab;">
        <svg id="sld-canvas" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="sld-color-filter" color-interpolation-filters="sRGB">
              <feColorMatrix id="sld-color-matrix" type="matrix"
                values="-0.161 0 0 0 0.220  -0.651 0 0 0 0.741  -0.808 0 0 0 0.973  0 0 0 1 0"/>
            </filter>
          </defs>
          <g id="sld-world">
            <g id="sld-rotated" transform="translate(792,0) rotate(90)">
              <rect x="0" y="0" width="612" height="792" fill="#0f172a"/>
              <image href="/sodo1so_00001.svg"
                x="0" y="0" width="612" height="792"
                preserveAspectRatio="xMidYMid meet"
                filter="url(#sld-color-filter)"/>
            </g>
            <!-- Dots nằm trong landscape space (792×612), tự scale theo pan/zoom -->
            <g id="dash-dots"></g>
          </g>
        </svg>
        <!-- Tooltip -->
        <div id="sld-tooltip" style="display:none;position:absolute;pointer-events:none;
          background:#1e293b;border:1px solid #334155;border-radius:7px;
          padding:7px 11px;font-size:0.75rem;color:#e2e8f0;
          box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:5;min-width:140px;"></div>
        <!-- Edit panel -->
        <div id="dot-edit-panel" style="display:none;position:absolute;z-index:40;
          background:#fff;border:1px solid #e2e8f0;border-radius:10px;
          box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:0;width:210px;overflow:hidden;">
          <div style="background:#f8fafc;padding:8px 12px;border-bottom:1px solid #f1f5f9;
            display:flex;justify-content:space-between;align-items:center;">
            <span id="dep-title" style="font-size:0.75rem;font-weight:800;color:#1e293b;">Điểm giám sát</span>
            <button id="dep-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1rem;line-height:1;">✕</button>
          </div>
          <div style="padding:10px 12px;display:flex;flex-direction:column;gap:7px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <label style="font-size:10px;color:#64748b;font-weight:600;">X (%)
                <input id="dep-x" type="number" step="0.1" style="width:100%;margin-top:2px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;box-sizing:border-box;">
              </label>
              <label style="font-size:10px;color:#64748b;font-weight:600;">Y (%)
                <input id="dep-y" type="number" step="0.1" style="width:100%;margin-top:2px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;box-sizing:border-box;">
              </label>
            </div>
            <label style="font-size:10px;color:#64748b;font-weight:600;">Kích thước (px)
              <input id="dep-r" type="number" min="4" max="30" style="width:100%;margin-top:2px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;box-sizing:border-box;">
            </label>
            <div style="display:flex;gap:6px;margin-top:2px;">
              <button id="dep-edit" style="flex:1;padding:5px;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;">✏️ Sửa thông tin</button>
              <button id="dep-delete" style="flex:1;padding:5px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;">🗑 Xóa</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Toolbar nổi (top-center) ═══════════════════════════ -->
      <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:30;
        display:flex;align-items:center;gap:8px;flex-wrap:wrap;
        background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px 14px;">
        <span style="font-size:0.78rem;font-weight:800;color:#e2e8f0;white-space:nowrap;">⛣ SƠ ĐỒ TRẠM T1</span>
        <div style="width:1px;height:18px;background:rgba(255,255,255,0.15);"></div>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="thermal" checked> Nhiệt
        </label>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="acoustic" checked> Âm
        </label>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="filter-cb" data-filter="pd" checked> PD
        </label>
        <div style="width:1px;height:18px;background:rgba(255,255,255,0.15);"></div>
        <button id="sld-btn-fit" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;">⊞ Fit</button>
        <button id="sld-btn-lock" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;">🔒 Khóa</button>
        <button id="btnAddVirtualPoint" style="display:none;background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#93c5fd;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;font-weight:700;">➕ Thêm điểm</button>
        <button id="btnResetMap" style="display:none;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:#94a3b8;border-radius:5px;padding:3px 9px;font-size:0.68rem;cursor:pointer;">↺ Reset</button>
        <label title="Màu đường nét" style="display:flex;align-items:center;gap:3px;cursor:pointer;color:#94a3b8;font-size:10px;">
          🎨<input type="color" id="sld-color-picker" value="#38bdf8" style="width:18px;height:14px;border:none;padding:0;background:none;cursor:pointer;border-radius:2px;">
        </label>
      </div>

      <!-- ══ KPI nổi (top-left) ══════════════════════════════════ -->
      <div id="floatKpi" style="position:absolute;top:10px;left:10px;z-index:30;width:300px;
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
            <span class="kpi-row-val kpi-text-red"><span class="kpi-val">${kpi.max_temp}</span> °C</span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #f59e0b;">
            <span class="kpi-row-label">⚡ SỰ KIỆN PD (24H)</span>
            <span class="kpi-row-val kpi-text-orange"><span class="kpi-val">${kpi.pd_events_24h}</span> sự kiện</span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #10b981;">
            <span class="kpi-row-label">📡 THIẾT BỊ ONLINE</span>
            <span class="kpi-row-val kpi-text-green"><span class="kpi-val">${kpi.devices_online}/${kpi.devices_total}</span></span>
          </div>
          <div class="kpi-row-item" style="border-left:3px solid #ef4444;">
            <span class="kpi-row-label">🔔 CẢNH BÁO</span>
            <span class="kpi-row-val kpi-text-red"><span class="kpi-val">${kpi.active_alarms}</span> cần xử lý</span>
          </div>
        </div>
      </div>

      <!-- ══ Cột phải: Alerts + Camera (flex column, tự follow nhau) ══ -->
      <div id="floatRightCol" style="position:absolute;top:10px;right:10px;z-index:30;width:265px;
        display:flex;flex-direction:column;gap:8px;max-height:calc(100% - 38px);">

        <!-- Nhật ký cảnh báo -->
        <div id="floatAlerts" style="display:flex;flex-direction:column;min-height:0;flex:1;
          background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;
          overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:8px 12px;border-bottom:1px solid #f1f5f9;flex-shrink:0;background:#f8fafc;">
            <span style="font-size:0.7rem;font-weight:800;color:#475569;letter-spacing:.5px;">🔔 NHẬT KÝ CẢNH BÁO</span>
            <button id="btnCollapseAlerts" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
          </div>
          <div id="alertsBody" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
            <div class="alert-list-unified" id="dashAlertList" style="overflow-y:auto;flex:1;padding:8px;">
              <div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Đang tải...</div>
            </div>
            <div style="text-align:center;padding:7px 0;border-top:1px solid #f1f5f9;flex-shrink:0;background:#f8fafc;">
              <a href="javascript:void(0)" id="btnSeeAllAlerts" style="font-size:10px;color:#0ea5e9;font-weight:700;text-decoration:none;">TẤT CẢ LỊCH SỬ →</a>
            </div>
          </div>
        </div>

        <!-- Camera live -->
        <div id="floatCam" style="flex-shrink:0;
          background:#0f172a;border:1px solid #1e293b;border-radius:10px;
          overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:5px 10px;background:rgba(15,23,42,0.95);
            border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="font-size:0.65rem;font-weight:800;color:#e2e8f0;">📷 CAMERA LIVE</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="btnFullCam" style="background:none;border:1px solid #38bdf8;color:#38bdf8;cursor:pointer;
                font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:4px;letter-spacing:.3px;">FULL VIEW →</button>
              <button id="btnCollapseCam" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem;line-height:1;padding:0 2px;">▲</button>
            </div>
          </div>
          <div id="camBody">
            <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;">
              <iframe
                src="http://localhost:1984/stream.html?src=camera_152_normal&mode=mse"
                style="width:100%;height:calc(100% + 42px);border:none;pointer-events:none;display:block;"
                id="dash-mini-cam-frame">
              </iframe>
            </div>
          </div>
        </div>

      </div>

      <!-- ══ Status bar (bottom) ════════════════════════════════ -->
      <div class="dash-status-bar" style="position:absolute;bottom:0;left:0;right:0;z-index:30;
        display:flex;gap:24px;padding:4px 10px;font-size:10px;color:#64748b;
        background:rgba(10,14,20,0.85);border-top:1px solid rgba(255,255,255,0.07);">
        <span style="display:flex;align-items:center;gap:5px;font-weight:600;">
          <span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> Hệ thống: ỔN ĐỊNH
        </span>
        <span style="display:flex;align-items:center;gap:5px;font-weight:600;">
          <span style="width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;"></span> AI Model: Active (v5.2)
        </span>
      </div>
    </div>

    <!-- Acknowledge Modal -->
    <div id="ackModal" class="modal-overlay">
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3 id="ackModalTitle">Xử lý cảnh báo</h3>
          <button id="ackModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div id="ackModalBody"></div>
        </div>
        <div class="modal-footer">
          <button id="ackCancelBtn" class="btn-industrial">Hủy bỏ</button>
        </div>
      </div>
    </div>

      <!-- Virtual Point Modal -->
      <div id="virtualPointModal" class="modal-overlay" style="display:none; z-index:9999;">
        <div class="modal-content" style="width: 480px; padding: 0; border-radius: 12px; font-family: 'Inter', sans-serif; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
            <h3 style="margin: 0; font-size: 16px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
              <span class="title-icon" style="color:#3b82f6;">⛣</span> Cập nhật điểm giám sát
            </h3>
            <button class="close-modal-btn" id="closeVpModal" style="background:none; border:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
          </div>
          
          <div style="padding: 20px; overflow-y: auto; flex: 1;">
            <!-- Section 1: Thông tin cơ bản -->
            <div style="margin-bottom: 25px;">
              <h4 style="font-size: 15px; color: #1e293b; margin: 0 0 15px 0;">Thông tin cơ bản</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 100px;">Tên điểm: *</label>
                  <input type="text" id="vpName" class="form-input" style="flex: 1;" placeholder="Ví dụ: Điểm mới 2348">
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 100px;">Loại: *</label>
                  <div style="display: flex; gap: 20px; flex: 1;">
                    <label style="font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="vpTypeRadio" value="Camera"> Camera
                    </label>
                    <label style="font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                      <input type="radio" name="vpTypeRadio" value="Sensor" checked> Sensor
                    </label>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 100px;">Trạng thái:</label>
                  <select id="vpStatus" class="form-select" style="flex: 1;">
                    <option value="Normal">Normal</option>
                    <option value="Warning">Warning</option>
                    <option value="Alarm">Alarm</option>
                  </select>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 100px;">Địa chỉ IP: *</label>
                  <input type="text" id="vpIp" class="form-input" style="flex: 1;" placeholder="192.168.1.10">
                </div>
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 100px; margin-top: 8px;">Mô tả:</label>
                  <textarea id="vpDesc" class="form-input" style="flex: 1; height: 60px; resize: none; padding: 8px;" placeholder="Điểm giám sát mới được tạo"></textarea>
                </div>
              </div>
            </div>

            <!-- Section 2: Cấu hình cảm biến (Only for Sensor) -->
            <div id="sectionSensor" style="margin-bottom: 25px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
              <h4 style="font-size: 15px; color: #1e293b; margin: 0 0 15px 0;">Cấu hình cảm biến</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 110px;">Giá trị hiện tại:</label>
                  <input type="number" id="vpValue" class="form-input" style="flex: 1;">
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 110px;">Đơn vị đo:</label>
                  <select id="vpUnit" class="form-select" style="flex: 1;">
                    <option value="°C">Nhiệt độ (°C)</option>
                    <option value="dB">Tiếng ồn (dB)</option>
                    <option value="%">Độ ẩm (%)</option>
                    <option value="ppm">Khí (ppm)</option>
                    <option value="lux">Ánh sáng (lux)</option>
                    <option value="A">Dòng điện (A)</option>
                    <option value="V">Điện áp (V)</option>
                    <option value="">Không có đơn vị</option>
                  </select>
                </div>
                <p style="font-size: 11px; font-style: italic; color: #94a3b8; margin: 0 0 0 120px;">Ví dụ đơn vị đo: °C, %, ppm, lux, dB, V, A, W, Pa, bar, m/s</p>
              </div>
            </div>

            <!-- Section 2b: Cấu hình Camera (Only for Camera) -->
            <div id="sectionCamera" style="margin-bottom: 25px; border-top: 1px solid #f1f5f9; padding-top: 20px; display: none;">
              <h4 style="font-size: 15px; color: #1e293b; margin: 0 0 15px 0;">Cấu hình tùy chọn</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 110px;">Thư mục ghi:</label>
                  <div style="display: flex; gap: 5px; flex: 1;">
                    <input type="text" id="vpCamFolder" class="form-input" style="flex: 1;" placeholder="/mnt/data/rec/">
                    <button style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0 10px;">📁</button>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 110px;">Tên node:</label>
                  <input type="text" id="vpCamNode" class="form-input" style="flex: 1;" placeholder="MainHall_Cam_01">
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <label style="font-size: 12px; font-weight: 600; color: #475569; width: 110px;">Account ONVIF:</label>
                  <input type="text" id="vpCamOnvif" class="form-input" style="flex: 1;" placeholder="admin:password123">
                </div>
              </div>
            </div>

            <!-- Section 3: Vị trí -->
            <div style="margin-bottom: 10px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
              <h4 style="font-size: 15px; color: #1e293b; margin: 0 0 5px 0;">Vị trí trên bản đồ (%)</h4>
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 15px 0;">Tọa độ điểm được tính theo phần trăm (0-100%) trên bản đồ CAD.</p>
              <div style="display: flex; align-items: flex-end; gap: 10px;">
                <div style="width: 100px;">
                  <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 5px;">Tọa độ X (%)</label>
                  <input type="number" id="vpPosX" class="form-input" value="50.0" style="width: 100%;">
                </div>
                <div style="width: 100px;">
                  <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 5px;">Tọa độ Y (%)</label>
                  <input type="number" id="vpPosY" class="form-input" value="50.0" style="width: 100%;">
                </div>
                <button type="button" style="height: 36px; padding: 0 10px; background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px; margin-left: auto;">
                  🎯 Chọn trên bản đồ
                </button>
              </div>
            </div>
          </div>

          <div style="background: #f8fafc; padding: 15px 20px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #e2e8f0;">
            <button id="cancelVpBtn" style="padding: 10px 25px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; color: #475569; cursor: pointer; font-weight: 600;">✕ Hủy</button>
            <button id="saveVpBtn" style="padding: 10px 35px; border-radius: 6px; border: none; background: #0070f3; color: white; cursor: pointer; font-weight: 600; display:flex; gap:8px; align-items:center;">
               ✓ Lưu
            </button>
          </div>
        </div>
      </div>

    </div>`;
  }

  mount(): void {
    // Read station params if navigated from MultisitePage
    const params = router.getParams();
    if (params.stationName) {
      // Cập nhật tiêu đề sơ đồ
      const titleEl = document.querySelector('.dash-card-title');
      if (titleEl) {
        titleEl.innerHTML = `<span class="title-icon">⛣</span> SƠ ĐỒ ${params.stationName.toUpperCase()}`;
      }
      // Thêm badge tên trạm + nút quay lại ở đầu trang
      const dashHeader = document.querySelector('.dashboard-header') || document.querySelector('.page-header');
      if (dashHeader) {
        const badge = document.createElement('div');
        badge.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:10px;';
        badge.innerHTML = `
          <button onclick="window.router.navigate('multisite')"
                  style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15);
                         color:#94a3b8; padding:4px 12px; border-radius:6px; cursor:pointer;
                         font-size:0.75rem; font-weight:700;">
            ← Quay lại đa trạm
          </button>
          <span style="background:rgba(14,165,233,0.15); color:#38bdf8; padding:4px 12px;
                       border-radius:6px; font-size:0.75rem; font-weight:800; border:1px solid rgba(14,165,233,0.3);">
            📍 Đang xem: ${params.stationName}
          </span>`;
        dashHeader.prepend(badge);
      }
    }

    // ── SLD pan / zoom ────────────────────────────────────────────
    const sldViewport = document.getElementById('sldViewport')!;
    const sldWorld    = document.getElementById('sld-world')!;
    const SLD_W = 792, SLD_H = 612;
    let vx = 0, vy = 0, vs = 1;

    const applyView = () => sldWorld.setAttribute('transform', `translate(${vx},${vy}) scale(${vs})`);

    const fitView = () => {
      const r = sldViewport.getBoundingClientRect();
      const s = Math.min(r.width / SLD_W, r.height / SLD_H) * 0.96;
      vs = s;
      vx = (r.width  - SLD_W * s) / 2;
      vy = (r.height - SLD_H * s) / 2;
      applyView();
    };

    let panning = false, panStart = { x: 0, y: 0 }, panOrigin = { x: 0, y: 0 };

    sldViewport.addEventListener('mousedown', e => {
      if ((e.target as HTMLElement).closest('#floatKpi,#floatAlerts,#floatCam')) return;
      // Khi đang edit mode và click vào dot → chỉ drag dot, không pan
      if (editUnlocked && (e.target as Element).closest('#dash-dots > g')) return;
      panning = true;
      panStart  = { x: e.clientX, y: e.clientY };
      panOrigin = { x: vx, y: vy };
      sldViewport.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
      if (!panning) return;
      vx = panOrigin.x + (e.clientX - panStart.x);
      vy = panOrigin.y + (e.clientY - panStart.y);
      applyView();
    });
    document.addEventListener('mouseup', () => {
      panning = false;
      sldViewport.style.cursor = 'grab';
    });
    sldViewport.addEventListener('wheel', e => {
      e.preventDefault();
      const r = sldViewport.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const f  = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.max(0.1, Math.min(10, vs * f));
      vx = cx - (cx - vx) * (ns / vs);
      vy = cy - (cy - vy) * (ns / vs);
      vs = ns;
      applyView();
    }, { passive: false });

    document.getElementById('sld-btn-fit')?.addEventListener('click', fitView);

    // ── Lock / Unlock chỉnh điểm ──────────────────────────────────
    let editUnlocked = false;
    const btnLock    = document.getElementById('sld-btn-lock')!;
    const btnAddVP   = document.getElementById('btnAddVirtualPoint')!;
    const btnReset   = document.getElementById('btnResetMap')!;

    const setEditMode = (on: boolean) => {
      editUnlocked = on;
      if (on) {
        btnLock.textContent = '🔓 Đang chỉnh';
        (btnLock as HTMLElement).style.background = 'rgba(245,158,11,0.35)';
        (btnLock as HTMLElement).style.color      = '#fbbf24';
        (btnLock as HTMLElement).style.borderColor = '#d97706';
        btnAddVP.style.display  = 'inline-block';
        btnReset.style.display  = 'inline-block';
        // Dots nổi bật hơn khi edit
        document.querySelectorAll<SVGCircleElement>('#dash-dots circle').forEach(c => {
          c.setAttribute('stroke', '#facc15');
          c.setAttribute('stroke-width', '2');
        });
      } else {
        btnLock.textContent = '🔒 Khóa';
        (btnLock as HTMLElement).style.background   = 'rgba(255,255,255,0.07)';
        (btnLock as HTMLElement).style.color        = '#e2e8f0';
        (btnLock as HTMLElement).style.borderColor  = 'rgba(255,255,255,0.15)';
        btnAddVP.style.display = 'none';
        btnReset.style.display = 'none';
        document.querySelectorAll<SVGCircleElement>('#dash-dots circle').forEach(c => {
          c.setAttribute('stroke', '#fff');
          c.setAttribute('stroke-width', '1.5');
        });
        hideEditPanel();
      }
    };

    btnLock.addEventListener('click', () => setEditMode(!editUnlocked));

    // Color picker
    const BG = { R: 0.059, G: 0.090, B: 0.165 };
    document.getElementById('sld-color-picker')?.addEventListener('input', function() {
      const hex = (this as HTMLInputElement).value;
      const Rl = parseInt(hex.slice(1,3),16)/255, Gl = parseInt(hex.slice(3,5),16)/255, Bl = parseInt(hex.slice(5,7),16)/255;
      const m = [(BG.R-Rl),0,0,0,Rl, 0,(BG.G-Gl),0,0,Gl, 0,0,(BG.B-Bl),0,Bl, 0,0,0,1,0].join(' ');
      document.getElementById('sld-color-matrix')?.setAttribute('values', m);
    });

    setTimeout(fitView, 100);

    // ── SVG dot drag + edit panel ─────────────────────────────────
    const SLD_W_LAND = 792, SLD_H_LAND = 612;
    const editPanel  = document.getElementById('dot-edit-panel')!;
    const tip        = document.getElementById('sld-tooltip')!;

    let activeDot: { g: Element, id: string, startCx: number, startCy: number, mx: number, my: number } | null = null;
    let wasDragging = false;
    let selectedPointId: string | null = null;

    const getCircle = (g: Element) => g.querySelector('circle');
    const getText   = (g: Element) => g.querySelector('text');

    const showEditPanel = (pointId: string, clientX: number, clientY: number) => {
      selectedPointId = pointId;
      const r     = sldViewport.getBoundingClientRect();
      const g     = document.querySelector(`#dash-dots [data-point-id="${pointId}"]`);
      const circ  = g ? getCircle(g) : null;
      const cx    = circ ? parseFloat(circ.getAttribute('cx') || '0') : 0;
      const cy    = circ ? parseFloat(circ.getAttribute('cy') || '0') : 0;
      const rad   = circ ? parseFloat(circ.getAttribute('r') || '8') : 8;
      const px    = parseFloat(((cx / SLD_W_LAND) * 100).toFixed(1));
      const py    = parseFloat(((cy / SLD_H_LAND) * 100).toFixed(1));
      const point = this.currentPoints.find(p => p.id === pointId);
      (document.getElementById('dep-title') as HTMLElement).textContent = point?.name ?? pointId;
      (document.getElementById('dep-x') as HTMLInputElement).value = String(px);
      (document.getElementById('dep-y') as HTMLInputElement).value = String(py);
      (document.getElementById('dep-r') as HTMLInputElement).value = String(rad);

      let left = clientX - r.left + 12;
      let top  = clientY - r.top  - 10;
      if (left + 220 > r.width)  left = clientX - r.left - 225;
      if (top  + 180 > r.height) top  = clientY - r.top  - 180;
      editPanel.style.left = left + 'px';
      editPanel.style.top  = top  + 'px';
      editPanel.style.display = 'block';
      tip.style.display = 'none';
    };

    const hideEditPanel = () => { editPanel.style.display = 'none'; selectedPointId = null; };

    // Mousedown trên dot
    document.addEventListener('mousedown', (e) => {
      const g = (e.target as Element).closest('#dash-dots > g') as SVGGElement | null;
      if (!g) return;
      const circ = getCircle(g);
      if (!circ) return;
      if (!editUnlocked) return; // đang khóa → không làm gì
      e.stopPropagation();
      activeDot = {
        g, id: g.dataset['pointId'] ?? '',
        startCx: parseFloat(circ.getAttribute('cx') || '0'),
        startCy: parseFloat(circ.getAttribute('cy') || '0'),
        mx: e.clientX, my: e.clientY
      };
      wasDragging = false;
      sldViewport.style.cursor = 'move';
    });

    document.addEventListener('mousemove', (e) => {
      if (!activeDot) return;
      const dx = (e.clientX - activeDot.mx) / vs;
      const dy = (e.clientY - activeDot.my) / vs;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wasDragging = true;
      if (!wasDragging) return;

      const newCx = Math.max(0, Math.min(SLD_W_LAND, activeDot.startCx + dx));
      const newCy = Math.max(0, Math.min(SLD_H_LAND, activeDot.startCy + dy));
      const circ = getCircle(activeDot.g)!;
      const txt  = getText(activeDot.g);
      const r    = parseFloat(circ.getAttribute('r') || '8');
      circ.setAttribute('cx', String(newCx));
      circ.setAttribute('cy', String(newCy));
      txt?.setAttribute('x', String(newCx + r + 3));
      txt?.setAttribute('y', String(newCy + 4));

      // Cập nhật inputs nếu panel đang mở
      if (selectedPointId === activeDot.id) {
        (document.getElementById('dep-x') as HTMLInputElement).value = ((newCx / SLD_W_LAND) * 100).toFixed(1);
        (document.getElementById('dep-y') as HTMLInputElement).value = ((newCy / SLD_H_LAND) * 100).toFixed(1);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (!activeDot) return;
      if (wasDragging) {
        const circ = getCircle(activeDot.g)!;
        const newX = (parseFloat(circ.getAttribute('cx') || '0') / SLD_W_LAND) * 100;
        const newY = (parseFloat(circ.getAttribute('cy') || '0') / SLD_H_LAND) * 100;
        saveCustomPointPosition(activeDot.id, newX, newY);
      } else {
        showEditPanel(activeDot.id, e.clientX, e.clientY);
      }
      activeDot = null;
      wasDragging = false;
      sldViewport.style.cursor = 'grab';
    });

    // Edit panel: inputs sync → SVG live
    const syncFromPanel = () => {
      if (!selectedPointId) return;
      const g    = document.querySelector(`#dash-dots [data-point-id="${selectedPointId}"]`);
      const circ = g ? getCircle(g) : null;
      const txt  = g ? getText(g) : null;
      if (!circ) return;
      const px = parseFloat((document.getElementById('dep-x') as HTMLInputElement).value) || 0;
      const py = parseFloat((document.getElementById('dep-y') as HTMLInputElement).value) || 0;
      const r  = Math.max(4, parseFloat((document.getElementById('dep-r') as HTMLInputElement).value) || 8);
      const cx = (px / 100) * SLD_W_LAND;
      const cy = (py / 100) * SLD_H_LAND;
      circ.setAttribute('cx', String(cx));
      circ.setAttribute('cy', String(cy));
      circ.setAttribute('r',  String(r));
      txt?.setAttribute('x', String(cx + r + 3));
      txt?.setAttribute('y', String(cy + 4));
      this.dotRadii[selectedPointId] = r;
      saveCustomPointPosition(selectedPointId, px, py, r);
    };

    document.getElementById('dep-x')?.addEventListener('input', syncFromPanel);
    document.getElementById('dep-y')?.addEventListener('input', syncFromPanel);
    document.getElementById('dep-r')?.addEventListener('input', syncFromPanel);
    document.getElementById('dep-close')?.addEventListener('click', hideEditPanel);

    document.getElementById('dep-edit')?.addEventListener('click', () => {
      if (!selectedPointId) return;
      hideEditPanel();
      document.getElementById('btnAddVirtualPoint')?.dispatchEvent(new MouseEvent('click'));
      // Pre-fill modal nếu là điểm đang chọn
      setTimeout(() => {
        const point = this.currentPoints.find(p => p.id === selectedPointId);
        if (!point) return;
        (document.getElementById('vpName') as HTMLInputElement)!.dataset.id = point.id;
        (document.getElementById('vpName') as HTMLInputElement)!.value = point.name;
        (document.getElementById('vpIp')  as HTMLInputElement)!.value = point.ipAddress;
        (document.querySelector(`input[name="vpTypeRadio"][value="${point.type}"]`) as HTMLInputElement).checked = true;
        (document.getElementById('vpStatus') as HTMLSelectElement)!.value = point.status;
        if (point.additionalProperties) {
          (document.getElementById('vpValue') as HTMLInputElement)!.value = String(point.additionalProperties.currentValue ?? '');
          (document.getElementById('vpUnit')  as HTMLSelectElement)!.value = point.additionalProperties.measureUnit ?? '°C';
        }
        document.getElementById('sectionSensor')!.style.display = point.type === 'Sensor' ? 'block' : 'none';
        document.getElementById('sectionCamera')!.style.display = point.type === 'Camera' ? 'block' : 'none';
      }, 50);
    });

    document.getElementById('dep-delete')?.addEventListener('click', () => {
      if (!selectedPointId) return;
      const isVirtual = selectedPointId.startsWith('VP_');
      const msg = isVirtual ? 'Xóa điểm ảo này?' : 'Ẩn điểm này khỏi màn hình?';
      if (confirm(msg)) {
        if (isVirtual) deleteVirtualPoint(selectedPointId);
        else hidePointLocal(selectedPointId);
        hideEditPanel();
        fetchAndUpdate();
      }
    });

    // Đóng panel khi click ra ngoài
    sldViewport.addEventListener('mousedown', (e) => {
      if (!(e.target as Element).closest('#dot-edit-panel') &&
          !(e.target as Element).closest('#dash-dots'))
        hideEditPanel();
    });

    // ── Panel collapse toggles ────────────────────────────────────
    const setupCollapse = (btnId: string, bodyId: string) => {
      const btn  = document.getElementById(btnId);
      const body = document.getElementById(bodyId);
      if (!btn || !body) return;
      // Nhớ display gốc để restore đúng (flex/block/...)
      const defaultDisplay = getComputedStyle(body).display || '';
      btn.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? defaultDisplay : 'none';
        // Khi alerts body ẩn thì bỏ flex:1 của floatAlerts để nó shrink lại
        if (bodyId === 'alertsBody') {
          const panel = document.getElementById('floatAlerts');
          if (panel) panel.style.flex = isHidden ? '1' : '0 0 auto';
        }
        btn.textContent = isHidden ? '▲' : '▼';
      });
    };
    setupCollapse('btnCollapseKpi',    'kpiBody');
    setupCollapse('btnCollapseAlerts', 'alertsBody');
    setupCollapse('btnCollapseCam',    'camBody');

    document.getElementById('btnFullCam')?.addEventListener('click', () => router.navigate('realtime'));

    sensorService.addEventListener('sensorUpdate', this.onSensorUpdate);
    sensorService.startSimulation();

    document.getElementById('btnSeeAllAlerts')?.addEventListener('click', () => router.navigate('alerts-history'));
    document.querySelectorAll('.filter-cb').forEach(cb => {
      cb.addEventListener('change', () => this.applyDotFilter());
    });
    document.querySelector('.cam-widget-body')?.addEventListener('click', () => router.navigate('realtime'));

    // ── Cleanup events older than 30 days on startup
    clearOldScadaEvents().catch(() => { });

    // ── OFFLINE-FIRST: Render from IndexedDB cache immediately
    loadScadaPoints().then(cached => {
      if (cached.length > 0) {
        this.renderPoints(cached as unknown as ScadaPoint[]);
        this.updateKpiFromPoints(cached as unknown as ScadaPoint[]);
      }
    }).catch(() => { });

    // ── Load từ local storage (không dùng Ngrok API nữa)
    const fetchAndUpdate = () => {
      const virtualPoints = getVirtualPoints() as unknown as ScadaPoint[];
      const hiddenIds = getHiddenPointIds();
      const visiblePoints = virtualPoints.filter((p: ScadaPoint) => !hiddenIds.includes(p.id));
      this.currentPoints = visiblePoints;
      this.renderPoints(visiblePoints);
      this.updateKpiFromPoints(visiblePoints);
      this.updateAlertLog();
      this._detectAndLogChanges(visiblePoints);
    };

    // Removed seedDemoData call
    this.updateAlertLog();
    fetchAndUpdate(); // immediate first load
    this.pollingInterval = setInterval(fetchAndUpdate, 20_000);

    // Cập nhật KPI từ dữ liệu cảm biến thật (PLC backend)
    this.fetchRealSensorKpi();
    setInterval(() => this.fetchRealSensorKpi(), 5_000);

    const resetBtn = document.getElementById('btnResetMap');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Khôi phục toàn bộ điểm về vị trí mặc định?')) {
          resetCustomPointPositions();
          resetHiddenPoints();
          fetchAndUpdate();
        }
      });
    }

    // ── Virtual Point Modal Logic
    const vpModal = document.getElementById('virtualPointModal');
    const btnAddVp = document.getElementById('btnAddVirtualPoint');

    if (btnAddVp && vpModal) {
      const closeVp = () => vpModal.style.display = 'none';
      btnAddVp.addEventListener('click', () => {
        // Reset form for cleanup
        const formId = 'VP_' + Math.floor(Math.random() * 1000000);
        document.getElementById('vpName')!.dataset.id = formId;
        (document.getElementById('vpName') as HTMLInputElement).value = '';
        (document.getElementById('vpIp') as HTMLInputElement).value = '';
        (document.getElementById('vpDesc') as HTMLTextAreaElement).value = '';
        (document.querySelector('input[name="vpTypeRadio"][value="Sensor"]') as HTMLInputElement).checked = true;
        (document.getElementById('vpStatus') as HTMLSelectElement).value = 'Normal';
        (document.getElementById('vpValue') as HTMLInputElement).value = '';
        (document.getElementById('vpUnit') as HTMLSelectElement).value = '°C';

        // Toggle sections
        document.getElementById('sectionSensor')!.style.display = 'block';
        document.getElementById('sectionCamera')!.style.display = 'none';

        vpModal.style.display = 'flex';
      });

      // Toggle Sensor vs Camera sections
      document.querySelectorAll('input[name="vpTypeRadio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          const type = (e.target as HTMLInputElement).value;
          document.getElementById('sectionSensor')!.style.display = type === 'Sensor' ? 'block' : 'none';
          document.getElementById('sectionCamera')!.style.display = type === 'Camera' ? 'block' : 'none';
        });
      });

      document.getElementById('closeVpModal')?.addEventListener('click', closeVp);
      document.getElementById('cancelVpBtn')?.addEventListener('click', closeVp);

      document.getElementById('saveVpBtn')?.addEventListener('click', () => {
        const id = document.getElementById('vpName')!.dataset.id || 'virtual_point';
        const name = (document.getElementById('vpName') as HTMLInputElement).value || 'Điểm ảo chưa đặt tên';
        const type = (document.querySelector('input[name="vpTypeRadio"]:checked') as HTMLInputElement).value as 'Camera' | 'Sensor';
        const status = (document.getElementById('vpStatus') as HTMLSelectElement).value as 'Normal' | 'Warning' | 'Alarm';
        const ip = (document.getElementById('vpIp') as HTMLInputElement).value || '192.168.x.x';
        const desc = (document.getElementById('vpDesc') as HTMLTextAreaElement).value;

        const valStr = (document.getElementById('vpValue') as HTMLInputElement).value;
        const unit = (document.getElementById('vpUnit') as HTMLSelectElement).value;

        // Cam specific
        const camFolder = (document.getElementById('vpCamFolder') as HTMLInputElement).value;
        const camNode = (document.getElementById('vpCamNode') as HTMLInputElement).value;
        const camOnvif = (document.getElementById('vpCamOnvif') as HTMLInputElement).value;

        // Pos
        const posX = parseFloat((document.getElementById('vpPosX') as HTMLInputElement).value) || 50;
        const posY = parseFloat((document.getElementById('vpPosY') as HTMLInputElement).value) || 50;

        // Retrieve existing virtual point to preserve its coordinates and IP during edit
        const existingPoints = getVirtualPoints();
        const existingPoint = existingPoints.find(p => p.id === id);

        saveVirtualPoint({
          id: id,
          name: name,
          type: type,
          status: status,
          ipAddress: ip,
          positionX: existingPoint ? existingPoint.positionX : posX,
          positionY: existingPoint ? existingPoint.positionY : posY,
          additionalProperties: {
            currentValue: valStr ? parseFloat(valStr) : 0,
            measureUnit: unit,
            // Store new metadata
            description: desc,
            camFolder,
            camNode,
            camOnvif
          } as any,
          savedAt: Date.now()
        });

        closeVp();
        fetchAndUpdate();

        // Điểm mới tạo — có thể kéo thả ngay
      });

      // ── Edit/Delete Virtual Point Delegated Events
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Sửa điểm
        if (target.classList.contains('btn-edit-vp')) {
          const id = target.dataset.id;
          if (!id) return;

          // Check if it is a Virtual Point or a Real Point
          const vps = getVirtualPoints();
          let p: ScadaPoint | undefined = vps.find(v => v.id === id);

          if (!p) {
            p = this.currentPoints.find((cp: ScadaPoint) => cp.id === id);
          }

          if (p && vpModal) {
            document.getElementById('vpName')!.dataset.id = p.id;
            (document.getElementById('vpName') as HTMLInputElement).value = p.name;
            (document.getElementById('vpIp') as HTMLInputElement).value = p.ipAddress;
            (document.getElementById('vpDesc') as HTMLTextAreaElement).value = p.additionalProperties?.description || '';

            const radioType = document.querySelector(`input[name="vpTypeRadio"][value="${p.type}"]`) as HTMLInputElement;
            if (radioType) radioType.checked = true;

            (document.getElementById('vpStatus') as HTMLSelectElement).value = p.status;
            (document.getElementById('vpValue') as HTMLInputElement).value = p.additionalProperties?.currentValue?.toString() || '';
            (document.getElementById('vpUnit') as HTMLSelectElement).value = p.additionalProperties?.measureUnit || '°C';

            // Cam specific
            (document.getElementById('vpCamFolder') as HTMLInputElement).value = p.additionalProperties?.camFolder || '';
            (document.getElementById('vpCamNode') as HTMLInputElement).value = p.additionalProperties?.camNode || '';
            (document.getElementById('vpCamOnvif') as HTMLInputElement).value = p.additionalProperties?.camOnvif || '';

            // Pos
            (document.getElementById('vpPosX') as HTMLInputElement).value = p.positionX.toString();
            (document.getElementById('vpPosY') as HTMLInputElement).value = p.positionY.toString();

            // Toggle sections
            document.getElementById('sectionSensor')!.style.display = p.type === 'Sensor' ? 'block' : 'none';
            document.getElementById('sectionCamera')!.style.display = p.type === 'Camera' ? 'block' : 'none';

            vpModal.style.display = 'flex';
          }
        }

        // Xóa điểm
        if (target.classList.contains('btn-delete-vp')) {
          const id = target.dataset.id;
          if (!id) return;

          const isVirtual = id.startsWith('VP_');
          const msg = isVirtual
            ? 'Bạn có chắc chắn muốn xóa vĩnh viễn (Local) Điểm Ảo này không?'
            : 'Đây là thiết bị thật từ Server. Bạn có muốn ẩn nó khỏi màn hình của mình không? (Không ảnh hưởng đến Backend)';

          if (confirm(msg)) {
            if (isVirtual) {
              deleteVirtualPoint(id);
            } else {
              hidePointLocal(id);
            }
            fetchAndUpdate();
          }
        }
      });
    }

  }

  private updateAlertLog(): void {
    getScadaEvents().then(events => {
      const listEl = document.getElementById('dashAlertList');
      if (!listEl) return;
      if (events.length === 0) {
        listEl.innerHTML = '<div style="color:#94a3b8; font-size:12px; text-align:center; padding: 20px;">Hệ thống ổn định. Chưa ghi nhận sự kiện cảnh báo.</div>';
        return;
      }

      // Sort newest first, take top 10
      const recent = events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
      const sColor = (s: string) => (s === 'Warning' || s === 'Alarm') ? '#ef4444' : '#10b981';

      listEl.innerHTML = recent.map(ev => {
        const isAI = ev.deviceType === 'Camera';
        // Relative time helper inline
        const diffSecs = Math.floor((Date.now() - ev.timestamp) / 1000);
        let tAgo = 'Vừa xong';
        if (diffSecs > 60) tAgo = Math.floor(diffSecs / 60) + ' phút trước';
        if (diffSecs > 3600) tAgo = Math.floor(diffSecs / 3600) + ' giờ trước';

        return `
        <div class="unified-alert-item" style="padding: 6px 10px; border-left: 3px solid ${sColor(ev.currentStatus)}; background: rgba(255,255,255,0.03); margin-bottom: 6px;">
          <div class="alert-top" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
             <div style="display: flex; gap: 6px; align-items: center;">
                <span class="alert-type-tag ${isAI ? 'type-ai' : 'type-sensor'}" style="font-size: 8px; padding: 1px 4px;">${isAI ? 'AI' : 'SEN'}</span>
                <span class="alert-device-name" style="font-size: 12px; font-weight: 800; color: #150d0dff;">${ev.deviceName}</span>
             </div>
             <span class="alert-time-small" style="color: #11171eff; font-size: 10px;">${tAgo}</span>
          </div>
          <div class="alert-description" style="font-size: 11px; color: #0b0e11ff; line-height: 1.3; font-weight: 400; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            Đổi trạng thái: <span style="color:${sColor(ev.previousStatus)}">${ev.previousStatus}</span> → <span style="color:${sColor(ev.currentStatus)};font-weight:700">${ev.currentStatus}</span>
            ${ev.currentValue !== undefined ? `(Giá trị: ${ev.currentValue} ${ev.measureUnit ?? ''})` : ''}
          </div>
          <div class="alert-actions" style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn-verify-ai" style="padding: 2px 8px; font-size: 9px; background: transparent; border: 1px solid #38bdf8; color: #38bdf8; font-weight: 700; border-radius: 3px;" onclick="window.router.navigate('alerts-history')">XEM CHI TIẾT</button>
            <span style="font-size: 9px; color:${sColor(ev.currentStatus)}; font-weight:800; text-transform: uppercase;">${ev.currentStatus}</span>
          </div>
        </div>`;
      }).join('');
    }).catch(() => { });
  }

  private updateKpiFromPoints(points: ScadaPoint[]): void {
    const sensors = points.filter(p => p.type === 'Sensor' && p.additionalProperties);
    const tempSensors = sensors.filter(p => p.additionalProperties?.measureUnit === '°C');
    const pdSensors = sensors.filter(p => p.additionalProperties?.measureUnit === 'dB');
    const warnings = points.filter(p => p.status === 'Warning' || p.status === 'Alarm');
    const online = points.filter(p => p.status === 'Normal').length;

    const maxTemp = tempSensors.length > 0
      ? Math.max(...tempSensors.map(p => p.additionalProperties?.currentValue ?? 0)).toFixed(1)
      : null;
    const minPD = pdSensors.length > 0
      ? Math.min(...pdSensors.map(p => p.additionalProperties?.currentValue ?? 0)).toFixed(1)
      : null;

    // Update DOM if elements exist
    const kpiRows = document.querySelectorAll<HTMLElement>('#floatKpi .kpi-row-item');
    if (kpiRows.length >= 4) {
      const v0 = kpiRows[0]?.querySelector('.kpi-val');
      if (maxTemp !== null && v0) v0.textContent = maxTemp;
      if (minPD !== null) {
        const v1 = kpiRows[1]?.querySelector('.kpi-val');
        if (v1) v1.textContent = minPD;
      }
      const v2 = kpiRows[2]?.querySelector('.kpi-val');
      if (v2) v2.textContent = `${online}/${points.length}`;
      const v3 = kpiRows[3]?.querySelector('.kpi-val');
      if (v3) v3.textContent = String(warnings.length);
    }
  }

  /** Detect status changes between polls -> auto-log to IndexedDB */
  private _detectAndLogChanges(points: ScadaPoint[]): void {
    const now = Date.now();
    const isFirstLoad = this.lastPoints.size === 0;
    const maintenanceDevices = getMaintenanceModeDevices();

    points.forEach(p => {
      // Bỏ qua thiết bị đang bảo trì – không log alarm
      if (maintenanceDevices.has(p.id)) {
        this.lastPoints.set(p.id, p.status);
        return;
      }

      const prev = this.lastPoints.get(p.id);

      let shouldLog = false;
      let previousStatus = prev ?? 'Unknown';

      if (prev !== undefined && prev !== p.status) {
        shouldLog = true;
      } else if (isFirstLoad && p.status !== 'Normal') {
        shouldLog = true;
      }

      if (shouldLog) {
        const isRecovery = p.status === 'Normal';
        const event: ScadaEvent = {
          eventId: `${p.id}_${now}`,
          deviceId: p.id,
          deviceName: p.name,
          deviceType: p.type,
          previousStatus: previousStatus,
          currentStatus: p.status,
          currentValue: p.additionalProperties?.currentValue,
          measureUnit: p.additionalProperties?.measureUnit,
          timestamp: now,
          ...(isRecovery && {
            resolvedStatus: 'RESOLVED' as const,
            resolvedNote: 'Thiết bị đã khắc phục, trở về trạng thái bình thường',
            resolvedAt: now,
            resolvedBy: 'SYSTEM',
          }),
        };
        saveScadaEvent(event).catch(() => { });

        // Khi về Normal: tìm event Alarm/Warning cũ chưa xử lý của thiết bị này → đánh dấu đã phục hồi
        if (isRecovery) {
          getScadaEvents(0, now).then(allEvents => {
            const unresolvedAlarms = allEvents.filter(e =>
              e.deviceId === p.id &&
              (e.currentStatus === 'Alarm' || e.currentStatus === 'Warning') &&
              !e.resolvedStatus
            );
            unresolvedAlarms.forEach(e => {
              updateScadaEvent(e.eventId, {
                resolvedStatus: 'RESOLVED',
                resolvedNote: 'Thiết bị đã khắc phục, trở về trạng thái bình thường',
                resolvedAt: now,
                resolvedBy: 'SYSTEM',
              }).catch(() => { });
            });
          }).catch(() => { });
        }

        console.info(`[ScadaEvent] ${p.name}: ${previousStatus} → ${p.status}`);
      }
      this.lastPoints.set(p.id, p.status);
    });
  }

  private renderPoints(points: ScadaPoint[]): void {
    const container = document.getElementById('dash-dots');
    if (!container) return;

    const ns = 'http://www.w3.org/2000/svg';
    const SLD_W = 792, SLD_H = 612;
    const customOverrides = getCustomPointPositions();
    const maintenanceDevices = getMaintenanceModeDevices();

    container.innerHTML = '';

    points.forEach(p => {
      const isCam        = p.type === 'Camera';
      const isMaintenance = maintenanceDevices.has(p.id);
      const isAlert      = !isMaintenance && (p.status === 'Warning' || p.status === 'Alarm');
      const color        = isCam ? '#3b82f6' : isMaintenance ? '#f59e0b' : isAlert ? '#ef4444' : '#10b981';

      const posX = customOverrides[p.id]?.x ?? p.positionX;
      const posY = customOverrides[p.id]?.y ?? p.positionY;
      const cx   = (posX / 100) * SLD_W;
      const cy   = (posY / 100) * SLD_H;
      const r    = customOverrides[p.id]?.r ?? this.dotRadii[p.id] ?? 8;

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('data-point-id',   p.id);
      g.setAttribute('data-point-type', p.type);
      g.setAttribute('data-point-name', p.name.toLowerCase());
      g.style.cursor = 'move';

      // Dot chính
      const circ = document.createElementNS(ns, 'circle');
      circ.setAttribute('cx', String(cx)); circ.setAttribute('cy', String(cy));
      circ.setAttribute('r', String(r));
      circ.setAttribute('fill', color);
      circ.setAttribute('fill-opacity', '0.88');
      circ.setAttribute('stroke', '#fff');
      circ.setAttribute('stroke-width', '1.5');
      g.appendChild(circ);

      // Label giá trị / tên
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', String(cx + r + 3)); txt.setAttribute('y', String(cy + 4));
      txt.setAttribute('font-size', '7'); txt.setAttribute('font-family', 'sans-serif');
      txt.setAttribute('font-weight', '700'); txt.setAttribute('fill', color);
      txt.setAttribute('pointer-events', 'none');
      const val = p.additionalProperties;
      txt.textContent = val?.currentValue != null
        ? `${val.currentValue}${val.measureUnit}`
        : p.name.split(' ').slice(0, 2).join(' ');
      g.appendChild(txt);

      container.appendChild(g);
    });
  }

  private onSensorUpdate = (e: any) => {
    const sensors: SensorData[] = e.detail;
    sensors.forEach(s => {
      const g = document.querySelector<SVGGElement>(`#dash-dots [data-point-id="${s.id}"]`);
      if (g) {
        const color = s.status === 'error' ? '#ef4444' : '#10b981';
        g.querySelector('circle')?.setAttribute('fill', color);
        (g.querySelector('text') as SVGTextElement | null)?.setAttribute('fill', color);
      }
    });
  };

  private applyDotFilter(): void {
    const thermal = (document.querySelector('[data-filter="thermal"]') as HTMLInputElement)?.checked;
    const acoustic = (document.querySelector('[data-filter="acoustic"]') as HTMLInputElement)?.checked;
    const pd = (document.querySelector('[data-filter="pd"]') as HTMLInputElement)?.checked;
    document.querySelectorAll<SVGGElement>('#dash-dots [data-point-type]').forEach(g => {
      const type = g.dataset['pointType'] ?? '';
      const name = g.dataset['pointName'] ?? '';
      let vis = type === 'Camera';
      if (thermal && (name.includes('thermal') || name.includes('nhiệt'))) vis = true;
      if (acoustic && name.includes('acoustic')) vis = true;
      if (pd && (name.includes('pd') || type === 'Sensor')) vis = true;
      g.style.display = vis ? '' : 'none';
    });
  }

  /** Lấy dữ liệu cảm biến thật từ backend PLC và cập nhật KPI panel */
  private async fetchRealSensorKpi(): Promise<void> {
    try {
      const points = await stationApi.getLatestPoints();
      if (!points.length) return;

      const temps = points.filter(p =>
        p.pointId === 'nhiet_do_pha_1' ||
        p.pointId === 'nhiet_do_pha_2' ||
        p.pointId === 'nhiet_do_pha_3'
      );
      const pdPoint = points.find(p => p.pointId === 'phong_dien');

      const kpiRows = document.querySelectorAll<HTMLElement>('#floatKpi .kpi-row-item');
      if (!kpiRows.length) return;

      // Row 0: nhiệt độ cao nhất
      if (temps.length) {
        const maxTemp = Math.max(...temps.map(p => p.value)).toFixed(1);
        const v0 = kpiRows[0]?.querySelector('.kpi-val');
        if (v0) v0.textContent = maxTemp;
      }

      // Row 1: giá trị PD (dB)
      if (pdPoint) {
        const v1 = kpiRows[1]?.querySelector('.kpi-val');
        if (v1) v1.textContent = `${pdPoint.value.toFixed(1)} dB`;
      }
    } catch {
      // Backend chưa sẵn sàng → giữ giá trị mock
    }
  }

  destroy(): void {
    clearInterval(this.pollingInterval);
    sensorService.removeEventListener('sensorUpdate', this.onSensorUpdate);
    sensorService.stopSimulation();
  }
}
