// ============================================================
// DeviceManagementPage – Quản lý thiết bị từ backend thật
// Hỗ trợ: PLC S7, Camera RTSP, Cảm biến Modbus
// API: GET/POST/PUT/DELETE /api/v1/devices
// ============================================================

import { stationApi, Device } from '@/services/StationApiService';

const TYPE_LABELS: Record<string, string> = {
  plc_s7:         '⚙️ PLC S7-1200',
  camera_cctv:    '📷 Camera Thường',
  camera_thermal: '🌡 Camera Nhiệt',
  camera_pd:      '⚡ Camera PD',
  modbus_tcp:     '📡 Cảm biến Modbus',
};

export class DeviceManagementPage {
  private stationId: string | null = null;
  private devices: Device[] = [];
  private editingId: string | null = null;

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>QUẢN LÝ THIẾT BỊ</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="status-pill">🟢 <span id="devOnlineCount">--</span> Online</span>
          <span class="status-pill status-pill--red">🔴 <span id="devOfflineCount">--</span> Offline</span>
          <button id="addDeviceBtn" class="btn-industrial btn-primary">+ Thêm thiết bị</button>
          <button id="scanLanBtn" class="btn-industrial">🔍 Quét LAN</button>
        </div>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tên thiết bị</th>
              <th>Loại</th>
              <th>IP / Địa chỉ</th>
              <th>Trạng thái</th>
              <th>Ngày thêm</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="deviceTableBody">
            <tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8">
              ⏳ Đang tải danh sách thiết bị...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal thêm / sửa thiết bị -->
    <div id="deviceModal" class="modal-overlay">
      <div class="modal-content" style="max-width:560px">
        <div class="modal-header">
          <h3 id="deviceModalTitle">Thêm thiết bị</h3>
          <button id="deviceModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid-2">

            <div class="form-group" style="grid-column:1/-1">
              <label>Tên hiển thị *</label>
              <input id="devName" type="text" class="form-input" placeholder="VD: PLC Tủ điện A1">
            </div>

            <div class="form-group">
              <label>Loại thiết bị *</label>
              <select id="devType" class="form-select">
                <option value="plc_s7">⚙️ PLC S7-1200/1500</option>
                <option value="camera_cctv">📷 Camera Thường (RTSP)</option>
                <option value="camera_thermal">🌡 Camera Nhiệt (RTSP)</option>
                <option value="camera_pd">⚡ Camera Phóng điện (RTSP)</option>
                <option value="modbus_tcp">📡 Cảm biến Modbus TCP</option>
              </select>
            </div>

            <div class="form-group">
              <label>Địa chỉ IP *</label>
              <input id="devIp" type="text" class="form-input" placeholder="192.168.10.x">
            </div>

            <!-- PLC fields -->
            <div id="plcFields" class="form-group" style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
              <div><label>Rack</label><input id="devRack" type="number" class="form-input" value="0"></div>
              <div><label>Slot</label><input id="devSlot" type="number" class="form-input" value="1"></div>
              <div><label>DB Number</label><input id="devDb" type="number" class="form-input" value="32"></div>
              <div><label>Length (bytes)</label><input id="devLength" type="number" class="form-input" value="10"></div>
            </div>

            <!-- Username/Password (camera + modbus) -->
            <div class="form-group" id="credFields" style="display:none">
              <label>Username</label>
              <input id="devUsername" type="text" class="form-input" placeholder="admin" value="admin">
            </div>
            <div class="form-group" id="credFieldsPass" style="display:none">
              <label>Password</label>
              <input id="devPassword" type="password" class="form-input" placeholder="password">
            </div>

            <!-- Camera fields -->
            <div id="cameraFields" class="form-group" style="grid-column:1/-1;display:none;gap:8px;display:none">
              <label>RTSP Path
                <select id="devRtspPreset" class="form-select" style="margin-left:8px;font-size:11px;display:inline-block;width:auto">
                  <option value="">-- Preset Hikvision --</option>
                  <option value="/Streaming/Channels/101">Kênh chính (101)</option>
                  <option value="/Streaming/Channels/102">Kênh phụ (102)</option>
                  <option value="/Streaming/Channels/201">Nhiệt/PD kênh chính (201)</option>
                  <option value="/Streaming/Channels/202">Nhiệt/PD kênh phụ (202)</option>
                  <option value="/stream1">Generic /stream1</option>
                  <option value="/h264/ch1/main/av_stream">Dahua Main</option>
                </select>
              </label>
              <input id="devRtspPath" type="text" class="form-input" placeholder="/Streaming/Channels/101">
              <label style="margin-top:8px">go2rtc Stream ID <small style="opacity:.6">(tự tạo nếu bỏ trống)</small></label>
              <input id="devGo2rtcId" type="text" class="form-input" placeholder="vd: camera_152_main">
            </div>

            <!-- Modbus fields -->
            <div id="modbusFields" style="grid-column:1/-1;display:none;gap:8px">
              <label>Port</label>
              <input id="devPort" type="number" class="form-input" value="502">
              <label style="margin-top:8px">Unit ID</label>
              <input id="devUnitId" type="number" class="form-input" value="1">
            </div>

          </div>
          <div id="testConnResult" style="margin-top:10px;font-size:.85rem;padding:8px;border-radius:6px;display:none"></div>
        </div>
        <div class="modal-footer">
          <button id="testConnBtn" class="btn-industrial">🔌 Test kết nối</button>
          <div style="flex:1"></div>
          <button id="deviceModalCancel" class="btn-industrial">Hủy</button>
          <button id="deviceModalSave" class="btn-industrial btn-primary">💾 Lưu thiết bị</button>
        </div>
      </div>
    </div>

    <!-- Modal quét LAN -->
    <div id="scanModal" class="modal-overlay">
      <div class="modal-content" style="max-width:600px">
        <div class="modal-header">
          <h3>🔍 Quét LAN – Tìm thiết bị mới</h3>
          <button id="scanModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input id="scanSubnet" type="text" class="form-input" value="192.168.10" placeholder="Subnet: 192.168.10" style="flex:1">
            <button id="startScanBtn" class="btn-industrial btn-primary">Bắt đầu quét</button>
          </div>
          <div id="scanResults" style="min-height:120px;color:#94a3b8;text-align:center;padding:20px">
            Nhấn "Bắt đầu quét" để tìm thiết bị trong LAN
          </div>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    this.loadDevices();
    this.bindEvents();
  }

  private async loadDevices(): Promise<void> {
    try {
      this.stationId = await stationApi.getFirstStationId();
      if (!this.stationId) {
        this.setTableContent('<tr><td colspan="6" style="text-align:center;padding:30px;color:#ef4444">Chưa có trạm nào trong hệ thống</td></tr>');
        return;
      }
      this.devices = await stationApi.getDevices(this.stationId);
      this.renderTable();
    } catch (err) {
      this.setTableContent('<tr><td colspan="6" style="text-align:center;padding:30px;color:#ef4444">❌ Không kết nối được backend</td></tr>');
    }
  }

  private renderTable(): void {
    const online = this.devices.filter(d => d.status === 'online').length;
    const offline = this.devices.length - online;
    const elOn = document.getElementById('devOnlineCount');
    const elOff = document.getElementById('devOfflineCount');
    if (elOn) elOn.textContent = String(online);
    if (elOff) elOff.textContent = String(offline);

    if (!this.devices.length) {
      this.setTableContent('<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8">Chưa có thiết bị nào. Nhấn "+ Thêm thiết bị"</td></tr>');
      return;
    }

    this.setTableContent(this.devices.map(d => this.renderRow(d)).join(''));
    this.bindRowEvents();
  }

  private renderRow(d: Device): string {
    const isOnline = d.status === 'online';
    const ip = d.config?.ip ?? '---';
    const extra = d.type.startsWith('camera') && d.config?.go2rtc_id
      ? `<br><small style="opacity:.5">go2rtc: ${d.config.go2rtc_id}</small>` : '';
    return `
    <tr id="devrow-${d.id}">
      <td><b>${d.name}</b></td>
      <td>${TYPE_LABELS[d.type] ?? d.type}</td>
      <td><code style="font-size:.8rem">${ip}</code>${extra}</td>
      <td>
        <span class="status-dot" style="background:${isOnline ? '#10b981' : '#ef4444'}"></span>
        ${isOnline ? '🟢 Online' : '🔴 Offline'}
      </td>
      <td style="font-size:.8rem;opacity:.7">${new Date(d.createdAt).toLocaleDateString('vi-VN')}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-industrial btn-sm test-btn" data-id="${d.id}" title="Test kết nối">🔌</button>
        <button class="btn-industrial btn-sm edit-btn" data-id="${d.id}" title="Sửa">✏️</button>
        <button class="btn-industrial btn-sm btn-danger del-btn" data-id="${d.id}" title="Xóa">🗑</button>
      </td>
    </tr>`;
  }

  private bindRowEvents(): void {
    document.querySelectorAll('.test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        btn.textContent = '⏳';
        (btn as HTMLButtonElement).disabled = true;
        try {
          const res = await stationApi.testConnection(id);
          this.showToast(res.success
            ? `✅ Kết nối OK — ${res.latencyMs}ms`
            : `❌ ${res.message}`, res.success ? 'success' : 'error');
        } catch {
          this.showToast('❌ Không thể test kết nối', 'error');
        } finally {
          btn.textContent = '🔌';
          (btn as HTMLButtonElement).disabled = false;
        }
      });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const device = this.devices.find(d => d.id === id);
        if (device) this.openModal(device);
      });
    });

    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const device = this.devices.find(d => d.id === id);
        if (!confirm(`Xóa thiết bị "${device?.name}"?\n${device?.type.startsWith('camera') ? '⚠️ Stream go2rtc cũng sẽ bị xóa.' : ''}`)) return;
        try {
          await stationApi.deleteDevice(id);
          this.devices = this.devices.filter(d => d.id !== id);
          this.renderTable();
          this.showToast('✅ Đã xóa thiết bị', 'success');
        } catch {
          this.showToast('❌ Xóa thất bại', 'error');
        }
      });
    });
  }

  private openModal(device?: Device): void {
    this.editingId = device?.id ?? null;
    const title = document.getElementById('deviceModalTitle')!;
    title.textContent = device ? `Sửa: ${device.name}` : 'Thêm thiết bị mới';

    (document.getElementById('devName') as HTMLInputElement).value = device?.name ?? '';
    (document.getElementById('devIp') as HTMLInputElement).value = device?.config?.ip ?? '';
    const typeEl = document.getElementById('devType') as HTMLSelectElement;
    typeEl.value = device?.type ?? 'camera_cctv';

    if (device?.type === 'plc_s7') {
      (document.getElementById('devRack') as HTMLInputElement).value = String(device.config?.rack ?? 0);
      (document.getElementById('devSlot') as HTMLInputElement).value = String(device.config?.slot ?? 1);
      (document.getElementById('devDb') as HTMLInputElement).value = String(device.config?.db ?? 32);
      (document.getElementById('devLength') as HTMLInputElement).value = String(device.config?.length ?? 10);
    } else if (device?.type?.startsWith('camera')) {
      (document.getElementById('devRtspPath') as HTMLInputElement).value = device.config?.rtsp_path ?? '';
      (document.getElementById('devGo2rtcId') as HTMLInputElement).value = device.config?.go2rtc_id ?? '';
    }

    this.updateFieldVisibility(typeEl.value);
    document.getElementById('testConnResult')!.style.display = 'none';
    document.getElementById('deviceModal')?.classList.add('active');
  }

  private updateFieldVisibility(type: string): void {
    const plc  = document.getElementById('plcFields')!;
    const cam  = document.getElementById('cameraFields')!;
    const mod  = document.getElementById('modbusFields')!;
    const cred = document.getElementById('credFields')!;
    const credP = document.getElementById('credFieldsPass')!;
    plc.style.display  = type === 'plc_s7' ? 'grid' : 'none';
    cam.style.display  = type.startsWith('camera') ? 'flex' : 'none';
    cam.style.flexDirection = 'column';
    mod.style.display  = type === 'modbus_tcp' ? 'flex' : 'none';
    mod.style.flexDirection = 'column';
    // Hiện username/password cho camera và modbus
    const showCred = type.startsWith('camera') || type === 'modbus_tcp';
    cred.style.display  = showCred ? 'block' : 'none';
    credP.style.display = showCred ? 'block' : 'none';
  }

  private buildConfig(type: string): string {
    const ip = (document.getElementById('devIp') as HTMLInputElement).value.trim();
    if (type === 'plc_s7') {
      return JSON.stringify({
        ip,
        rack: parseInt((document.getElementById('devRack') as HTMLInputElement).value),
        slot: parseInt((document.getElementById('devSlot') as HTMLInputElement).value),
        db: parseInt((document.getElementById('devDb') as HTMLInputElement).value),
        offset: 0,
        length: parseInt((document.getElementById('devLength') as HTMLInputElement).value),
      });
    }
    if (type.startsWith('camera')) {
      let rtspPath = (document.getElementById('devRtspPath') as HTMLInputElement).value.trim();
      if (rtspPath && !rtspPath.startsWith('/')) rtspPath = '/' + rtspPath;
      const go2rtcId = (document.getElementById('devGo2rtcId') as HTMLInputElement).value.trim()
        || `camera_${ip.replace(/\./g, '_')}_${type.replace('camera_', '')}`;
      const username = (document.getElementById('devUsername') as HTMLInputElement).value.trim() || 'admin';
      const password = (document.getElementById('devPassword') as HTMLInputElement).value.trim();
      return JSON.stringify({ ip, rtsp_path: rtspPath, go2rtc_id: go2rtcId, username, password });
    }
    if (type === 'modbus_tcp') {
      return JSON.stringify({
        ip,
        port: parseInt((document.getElementById('devPort') as HTMLInputElement).value),
        unit_id: parseInt((document.getElementById('devUnitId') as HTMLInputElement).value),
      });
    }
    return JSON.stringify({ ip });
  }

  private bindEvents(): void {
    // Thêm thiết bị
    document.getElementById('addDeviceBtn')?.addEventListener('click', () => this.openModal());

    // Đóng modal
    const closeModal = () => {
      document.getElementById('deviceModal')?.classList.remove('active');
      this.editingId = null;
    };
    document.getElementById('deviceModalClose')?.addEventListener('click', closeModal);
    document.getElementById('deviceModalCancel')?.addEventListener('click', closeModal);

    // Đổi type → cập nhật fields
    document.getElementById('devType')?.addEventListener('change', (e) => {
      this.updateFieldVisibility((e.target as HTMLSelectElement).value);
    });

    // Preset RTSP → tự điền vào input
    document.getElementById('devRtspPreset')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val) (document.getElementById('devRtspPath') as HTMLInputElement).value = val;
    });

    // Lưu thiết bị
    document.getElementById('deviceModalSave')?.addEventListener('click', async () => {
      const name = (document.getElementById('devName') as HTMLInputElement).value.trim();
      const type = (document.getElementById('devType') as HTMLSelectElement).value;
      if (!name) { this.showToast('Vui lòng nhập tên thiết bị', 'error'); return; }

      const saveBtn = document.getElementById('deviceModalSave') as HTMLButtonElement;
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Đang lưu...';

      try {
        const config = this.buildConfig(type);
        if (this.editingId) {
          const updated = await stationApi.updateDevice(this.editingId, { name, config });
          const idx = this.devices.findIndex(d => d.id === this.editingId!);
          if (idx >= 0) this.devices[idx] = { ...this.devices[idx], ...updated, config: JSON.parse(config) };
        } else {
          const created = await stationApi.createDevice({
            stationId: this.stationId!,
            name, type,
            protocol: type === 'plc_s7' ? 'snap7' : type.startsWith('camera') ? 'rtsp' : 'modbus',
            config
          });
          this.devices.push({ ...created, config: JSON.parse(config) });
        }
        this.renderTable();
        closeModal();
        this.showToast(`✅ ${this.editingId ? 'Đã cập nhật' : 'Đã thêm'} thiết bị`, 'success');
      } catch (err: any) {
        this.showToast(`❌ Lỗi: ${err.message}`, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Lưu thiết bị';
      }
    });

    // Test kết nối từ modal (chưa có id → test IP trực tiếp)
    document.getElementById('testConnBtn')?.addEventListener('click', async () => {
      const resultEl = document.getElementById('testConnResult')!;
      if (this.editingId) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#1e293b';
        resultEl.textContent = '⏳ Đang kiểm tra...';
        try {
          const res = await stationApi.testConnection(this.editingId);
          resultEl.style.background = res.success ? '#052e16' : '#2d1515';
          resultEl.style.color = res.success ? '#10b981' : '#ef4444';
          resultEl.textContent = res.success
            ? `✅ Kết nối thành công — ${res.latencyMs}ms`
            : `❌ ${res.message}`;
        } catch {
          resultEl.textContent = '❌ Lỗi kết nối';
        }
      } else {
        resultEl.style.display = 'block';
        resultEl.style.background = '#1e293b';
        resultEl.style.color = '#f59e0b';
        resultEl.textContent = '⚠️ Lưu thiết bị trước rồi mới test được kết nối.';
      }
    });

    // Quét LAN
    document.getElementById('scanLanBtn')?.addEventListener('click', () => {
      document.getElementById('scanModal')?.classList.add('active');
    });
    document.getElementById('scanModalClose')?.addEventListener('click', () => {
      document.getElementById('scanModal')?.classList.remove('active');
    });

    document.getElementById('startScanBtn')?.addEventListener('click', async () => {
      const subnet = (document.getElementById('scanSubnet') as HTMLInputElement).value.trim();
      const resultsEl = document.getElementById('scanResults')!;
      resultsEl.innerHTML = '<div style="color:#94a3b8">⏳ Đang quét ' + subnet + '.1 → .254 ...</div>';
      (document.getElementById('startScanBtn') as HTMLButtonElement).disabled = true;

      try {
        const token = localStorage.getItem('station_jwt');
        const res = await fetch(`http://localhost:5056/api/v1/devices/scan?subnet=${subnet}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const found: any[] = await res.json();
        if (!found.length) {
          resultsEl.innerHTML = '<div style="color:#94a3b8;padding:20px;text-align:center">Không tìm thấy thiết bị nào</div>';
        } else {
          resultsEl.innerHTML = found.map(f => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #1e293b;">
              <div>
                <b style="color:#e2e8f0">${f.ip}</b>
                <span style="margin-left:8px;font-size:11px;color:#94a3b8">${f.guessedType ?? 'Unknown'}</span>
              </div>
              <span style="font-size:11px;color:${f.isOnline ? '#10b981' : '#ef4444'}">${f.isOnline ? '🟢 Online' : '🔴 Offline'}</span>
            </div>`).join('');
        }
      } catch {
        resultsEl.innerHTML = '<div style="color:#ef4444">❌ Lỗi quét LAN — backend cần đang chạy</div>';
      } finally {
        (document.getElementById('startScanBtn') as HTMLButtonElement).disabled = false;
      }
    });
  }

  private setTableContent(html: string): void {
    const tbody = document.getElementById('deviceTableBody');
    if (tbody) tbody.innerHTML = html;
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    const existing = document.querySelector('.wm-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'wm-toast';
    t.style.cssText = `position:fixed;top:24px;right:24px;z-index:999999;
      background:${type === 'success' ? '#052e16' : '#2d1515'};
      color:${type === 'success' ? '#10b981' : '#ef4444'};
      border:1px solid ${type === 'success' ? '#10b981' : '#ef4444'};
      padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;
      box-shadow:0 4px 20px rgba(0,0,0,.4);transition:opacity .3s`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  destroy(): void {}
}
