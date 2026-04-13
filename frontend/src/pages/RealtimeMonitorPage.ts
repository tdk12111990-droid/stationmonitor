// Realtime Monitor Page
import { stationApi, CameraDevice } from '@/services/StationApiService';
import * as signalR from '@microsoft/signalr';
import { GO2RTC_URL } from '@/utils/env';

export class RealtimeMonitorPage {
  private logs: any[] = [];
  private cameras: CameraDevice[] = [];
  private hubConnection: signalR.HubConnection | null = null;

  private currentModalCamId: string | null = null;
  private aiInterval: any = null;

  render(): string {
    const cameras = this.cameras;

    return `
    <div class="realtime-monitor-v2">
      <!-- Toolbar -->
      <div class="monitor-toolbar admin-card">
        <div class="tool-group">
          <span class="tool-label">🔍 LỌC CAMERA:</span>
          <select id="camFilterSelect" class="form-select" style="min-width: 150px;">
            <option value="ALL">Tất cả Camera</option>
            ${cameras.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div style="flex: 1"></div>
        <div class="status-summary">
           <span class="stat-item"><b style="color: #10b981">${cameras.filter(c => (c as any).status === 'ONLINE').length}</b> Online</span>
        </div>
      </div>

      <div class="monitor-main-content">
        <!-- Lưới Camera chính -->
        <div class="camera-grid-section">
          <div class="camera-grid-scroll-wrap">
            <div class="camera-grid-v2">
              ${cameras.map(d => {
      const deviceId = d.id;
      return `
              <div class="cam-card-v2" data-cam-id="${deviceId}" data-cam-name="${d.name.toLowerCase()}">
                <div class="cam-viewport" id="viewport-${deviceId}">
                  <div class="cam-hud-top">
                    <div class="cam-title-group">
                      <span class="status-dot ${(d as any).status === 'ONLINE' ? 'dot-green' : 'dot-red'}"></span>
                      <span class="cam-name">${d.name}</span>
                    </div>
                    <div class="cam-actions">
                      <button title="Xem chỉ số" class="cam-btn-hud" onclick="router.navigate('analytics', { deviceId: '${deviceId}' })">📈</button>
                      <button title="Chụp ảnh" class="cam-btn-hud btn-capture">📸</button>
                      <button title="Phóng to & Xem lại" class="cam-btn-hud btn-expand-live" data-id="${deviceId}">⛶</button>
                    </div>
                  </div>

                  <div class="cam-overlay-container" id="ai-overlay-${deviceId}">
                    <div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">AI ACTIVE</span></div>
                  </div>
                  <div class="breaker-ai-panel" id="breaker-panel-${deviceId}" style="display:none;"></div>
                  <div class="real-stream-container">
                    <iframe 
                      src="${GO2RTC_URL}/stream.html?src=${deviceId}&mode=mse&controls=0"
                      style="width:100%; height:100%; border:none; pointer-events: none;" 
                      id="hik-rtc-frame-${deviceId}">
                    </iframe>
                  </div>
                </div>
              </div>`;
    }).join('')}
            </div>
          </div>

          <div class="camera-captures-bottom-section" id="bottomCaptures">
            <button id="capturesToggleBtnBottom" class="sidebar-edge-toggle-bottom">∨</button>
            <div class="sidebar-content-wrapper-bottom">
              <div class="logs-header-bottom">
                  <span class="logs-title-bottom">ẢNH GẦN ĐÂY</span>
              </div>
              <div id="primaryRecentCaptures" class="captures-bottom-list">
                <div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic;">
                  Bạn hãy chụp một vài bức ảnh để thấy kết quả tại đây...
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="camera-logs-section" id="sidebarLogs">
          <button id="sidebarToggleBtn" class="sidebar-edge-toggle">›</button>
          
          <div class="sidebar-content-wrapper">
            <div class="logs-header">
              <span class="logs-title">NHẬT KÝ CHI TIẾT</span>
              <select id="sideLogFilter" class="form-select-sm">
                <option value="ALL">Tất cả sự kiện</option>
                <option value="INTRUDER">Người xâm nhập</option>
                <option value="PPE">An toàn PPE</option>
                <option value="CURFEW">Giờ giới nghiêm</option>
                <option value="BREAKER">Máy cắt</option>
                <option value="THERMAL">Nhiệt độ</option>
              </select>
            </div>
            <div class="logs-list-wrapper">
              ${this.logs.map(log => `
              <div class="cam-log-item forensic-log-item-light" 
                   data-ai-type="${log.type}" data-cam-id="${log.device_id}" data-video="${log.video || ''}">
                <div style="flex: 0 0 60px;">
                  <img src="${log.img}" style="width: 60px; height: 40px; border-radius: 4px; object-fit: cover; border: 1px solid #e2e8f0;">
                </div>
                <div style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span style="font-size: 9px; font-weight: 800; color: ${log.level === 'crit' ? '#ef4444' : '#f59e0b'}; text-transform: uppercase;">${log.type}</span>
                    <span style="font-size: 9px; color: #94a3b8;">${log.time}</span>
                  </div>
                  <div style="font-size: 11px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">${log.msg}</div>
                  <div style="font-size: 9px; color: #0284c7; font-weight: 600;">▶ Nhấn để xem lại</div>
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div id="cameraLiveModal" class="modal-overlay">
        <div class="modal-content" style="width: 98%; max-width: 1600px; height: 95vh; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(20px); display:flex; flex-direction:column; border: 1px solid rgba(255, 255, 255, 0.15); overflow:hidden; box-shadow: 0 0 100px rgba(0,0,0,0.5);">
           <div class="modal-header" style="background: rgba(255, 255, 255, 0.03); padding: 12px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="display:flex; align-items:center; gap: 20px;">
                 <h3 id="cameraLiveTitle" style="color: #fff; font-size: 1.1rem; margin: 0; font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">CHI TIẾT CAMERA HỆ THỐNG</h3>
                 <div id="monitorModeBadge" style="background: rgba(16, 185, 129, 0.8); color: white; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; box-shadow: 0 2px 10px rgba(16,185,129,0.4);">🔴 LIVE</div>
              </div>
              <div style="display:flex; gap: 15px; align-items:center;">
                 <button id="btnReturnToLive" class="btn-industrial btn-sm" style="display:none; background: #10b981; color: white; border:none; padding: 6px 18px; font-size: 11px; border-radius: 6px; cursor: pointer;">QUAY LẠI LIVE</button>
                 <button id="cameraLiveClose" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); width: 36px; height: 36px; border-radius: 50%; font-size: 1rem; color: #fff; cursor: pointer; display:flex; align-items:center; justify-content:center; transition: all 0.2s;">✕</button>
              </div>
           </div>
           
           <div style="flex: 1; display: flex; overflow: hidden; background: transparent; position: relative;">
              <div style="flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; height: 100%;">
                 <div id="modalVideoContainer" style="width:100%; height:100%; background: #000;"></div>
                 <video id="playbackVideo" style="display:none; width:100%; height:100%; object-fit: contain; background: black; z-index: 5;" controls></video>
              </div>

              <div id="modalSidebar" style="width: 320px; min-width: 320px; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(15px); display: flex; flex-direction: column; border-left: 1px solid rgba(255, 255, 255, 0.1); z-index: 100; transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;">
                 <button id="modalSidebarToggle" title="Đóng/Mở Nhật ký" style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 24px; height: 70px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px); color: white; border: 1px solid rgba(255,255,255,0.1); border-right: none; border-radius: 10px 0 0 10px; cursor: pointer; font-size: 14px; display:flex; align-items:center; justify-content:center; z-index: 101;">‹</button>
                 
                 <div style="padding: 15px; background: rgba(255, 255, 255, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.08); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size: 10px; font-weight: 900; color: #fff; letter-spacing: 1px; opacity: 0.8;">NHẬT KÝ AI PHÂN TÍCH</span>
                    <span id="modalLogCount" style="font-size: 9px; background: rgba(255,255,255,0.1); color: #fff; padding: 2px 8px; border-radius: 10px;">0 sự kiện</span>
                 </div>
                 <div id="modalCameraLogsGroup" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
              </div>
           </div>

           <div id="modalShelf" style="height: 120px; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(15px); border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; padding: 0 24px; gap: 20px; z-index: 90; transition: margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;">
              <button id="modalShelfToggle" title="Đóng/Mở Ảnh chụp" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); width: 60px; height: 20px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px); border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: none; border-radius: 10px 10px 0 0; cursor: pointer; font-size: 12px; color: #fff; display:flex; align-items:center; justify-content:center; z-index: 91;">∨</button>
              
              <div style="writing-mode: vertical-rl; transform: rotate(180deg); font-size: 10px; font-weight: 900; color: #fff; letter-spacing: 2px; border-left: 4px solid #0ea5e9; padding-left: 10px; height: 50px; opacity: 0.7;">ẢNH TRÍ TUỆ NHÂN TẠO</div>
              <div id="recentCapturesContainer" style="display: flex; gap: 15px; align-items: center; flex: 1; overflow-x: auto; padding: 5px 0;">
                  <span style="font-size: 11px; color: rgba(255,255,255,0.4); font-style: italic;">Đang đồng bộ hóa kho ảnh từ biên...</span>
              </div>
           </div>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    this.loadCamerasAndConnect();
    this.startAISimulation();
    this._realMount();
  }

  private async loadCamerasAndConnect(): Promise<void> {
    try {
      this.cameras = await stationApi.getCamerasFromFirstStation();
    } catch (err) {
      console.warn('[RealtimeMonitor] Không load được camera từ API, dùng danh sách rỗng', err);
      this.cameras = [];
    }
    this.renderCameraGrid();
    this.connectSignalR();
  }

  private renderCameraGrid(): void {
    const grid = document.querySelector('.camera-grid-v2');
    const filterSelect = document.getElementById('camFilterSelect') as HTMLSelectElement;
    if (!grid) return;

    if (filterSelect) {
      filterSelect.innerHTML = `<option value="ALL">Tất cả Camera</option>` +
        this.cameras.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    const onlineCount = this.cameras.filter(c => c.status === 'online').length;
    const statEl = document.querySelector('.status-summary .stat-item b');
    if (statEl) statEl.textContent = String(onlineCount);

    let html = '';

    // Render data thực từ API
    html += this.cameras.map((d, idx) => {
      const go2rtcId = d.config?.go2rtc_id ?? d.id;
      let camName = d.name;
      let aiLabel = "LIVE VIEWING";
      let streamContent = `
              <iframe
                src="${GO2RTC_URL}/stream.html?src=${go2rtcId}&mode=mse&controls=0"
                style="width:100%;height:100%;border:none;pointer-events:none;display:block;"
                id="hik-rtc-frame-${d.id}">
              </iframe>`;

      if (idx === 3) {
        camName = "Camera Quét Nhiệt (Thermal)";
        aiLabel = "THERMAL SCAN";
        streamContent = `<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#333;font-size:12px;">NO STREAM</div>`;
      }

      return `
        <div class="cam-card-v2" data-cam-id="${d.id}" data-go2rtc-id="${go2rtcId}" data-cam-name="${d.name.toLowerCase()}">
          <div class="cam-viewport" id="viewport-${d.id}">
            <div class="cam-hud-top">
              <div class="cam-title-group">
                <span class="status-dot ${d.status === 'online' ? 'dot-green' : 'dot-red'}"></span>
                <span class="cam-name">${camName}</span>
              </div>
              <div class="cam-actions">
                <button title="Chụp ảnh" class="cam-btn-hud btn-capture" data-go2rtc="${go2rtcId}">📸</button>
                <button title="Phóng to" class="cam-btn-hud btn-expand-live" data-id="${d.id}" data-go2rtc="${go2rtcId}">⛶</button>
              </div>
            </div>
            <div class="cam-overlay-container" id="ai-overlay-${d.id}">
              <div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">${aiLabel}</span></div>
            </div>
            <div class="real-stream-container" style="position:relative;overflow:hidden;width:100%;height:100%;flex:1;background:#000;">
              ${streamContent}
            </div>
          </div>
        </div>`;
    }).join('');

    // Nếu ít hơn 4 cam, bơm thêm các thẻ ảo vào frontend
    let currentLen = this.cameras.length;
    while (currentLen < 4) {
      const isThermal = currentLen === 3;
      const camName = isThermal ? "Camera Quét Nhiệt (Thermal)" : `Camera Bổ Sung ${currentLen + 1}`;
      const aiLabel = isThermal ? "THERMAL SCAN" : "LIVE VIEWING";
      const streamContent = isThermal
        ? `<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#333;font-size:12px;">NO STREAM</div>`
        : `<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#333;font-size:12px;">NO STREAM</div>`;

      html += `
        <div class="cam-card-v2" data-cam-id="fake_${currentLen}" data-cam-name="${camName}">
          <div class="cam-viewport" id="viewport-fake_${currentLen}">
            <div class="cam-hud-top">
              <div class="cam-title-group">
                <span class="status-dot dot-green"></span>
                <span class="cam-name">${camName}</span>
              </div>
              <div class="cam-actions">
                <button title="Chụp ảnh" class="cam-btn-hud btn-capture">📸</button>
                <button title="Phóng to" class="cam-btn-hud btn-expand-live">⛶</button>
              </div>
            </div>
            <div class="cam-overlay-container" id="ai-overlay-fake_${currentLen}">
              <div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">${aiLabel}</span></div>
            </div>
            <div class="real-stream-container" style="position:relative;overflow:hidden;width:100%;height:100%;flex:1;background:#000;">
              ${streamContent}
            </div>
          </div>
        </div>`;
      currentLen++;
    }

    grid.innerHTML = html;
  }

  private connectSignalR(): void {
    const token = localStorage.getItem('station_jwt');
    if (!token) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('/ws/realtime', { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('DeviceStatus', (data: { deviceId: string; status: string }) => {
      const dot = document.querySelector(`[data-cam-id="${data.deviceId}"] .status-dot`);
      if (dot) dot.className = `status-dot ${data.status === 'online' ? 'dot-green' : 'dot-red'}`;
    });

    this.hubConnection.start().catch(err => console.warn('[SignalR] Lỗi kết nối:', err));
  }

  private _realMount(): void {
    const modal = document.getElementById('cameraLiveModal');
    const modalBody = document.getElementById('modalVideoContainer');
    const playbackVideo = document.getElementById('playbackVideo') as HTMLVideoElement;
    document.getElementById('modalCameraLogsGroup'); // referenced via DOM
    const btnReturnLive = document.getElementById('btnReturnToLive');
    const modeBadge = document.getElementById('monitorModeBadge');

    const showLive = () => {
      if (!modalBody || !playbackVideo || !modeBadge || !btnReturnLive || !this.currentModalCamId) return;
      playbackVideo.style.display = 'none';
      playbackVideo.pause();
      modalBody.style.display = 'block';
      modalBody.innerHTML = `<iframe src="${GO2RTC_URL}/stream.html?src=${this.currentModalCamId}&mode=mse&controls=0" style="width:100%; height:100%; border:none; pointer-events: none;"></iframe>`;
      modeBadge.style.background = '#10b981';
      modeBadge.textContent = '🔴 LIVE';
      btnReturnLive.style.display = 'none';
    };

    const showPlayback = (url: string) => {
      if (!modalBody || !playbackVideo || !modeBadge || !btnReturnLive) return;
      modalBody.style.display = 'none';
      playbackVideo.style.display = 'block';
      playbackVideo.src = url;
      playbackVideo.play();
      modeBadge.style.background = '#f59e0b';
      modeBadge.textContent = '🎞 PLAYBACK';
      btnReturnLive.style.display = 'inline-block';
    };

    const openMonitor = (camId: string, playbackUrl: string | null = null) => {
      if (!modal) return;
      this.currentModalCamId = camId;
      if (playbackUrl) showPlayback(playbackUrl); else showLive();
      modal.classList.add('active');
    };

    const closeModal = () => {
      this.currentModalCamId = null;
      if (modal) modal.classList.remove('active');
      if (playbackVideo) { playbackVideo.pause(); playbackVideo.src = ""; }
      if (modalBody) modalBody.innerHTML = '';
    };

    // Event Delegation cho nút Phóng to và Chụp ảnh
    document.querySelector('.camera-grid-v2')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const expandBtn = target.closest('.btn-expand-live') as HTMLElement;
      if (expandBtn) {
        const camId = expandBtn.dataset.id;
        if (camId) openMonitor(camId);
      }
      const captureBtn = target.closest('.btn-capture') as HTMLElement;
      if (captureBtn) this.handleCapture(captureBtn);
    });

    document.getElementById('modalSidebarToggle')?.addEventListener('click', () => {
      const sidebar = document.getElementById('modalSidebar');
      if (sidebar) sidebar.style.marginRight = sidebar.style.marginRight === '-320px' ? '0' : '-320px';
    });

    document.getElementById('cameraLiveClose')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Load ảnh cũ
    this.loadHistoryCaptures();
  }

  private async loadHistoryCaptures() {
    try {
      const res = await fetch('http://127.0.0.1:46123/api/captures-list');
      const data = await res.json();
      const shelf = document.getElementById('primaryRecentCaptures');
      if (shelf && data.captures) {
        shelf.innerHTML = data.captures.map((f: string) => `
          <div class="recent-capture-item" style="flex:0 0 120px;height:85px">
            <img src="http://127.0.0.1:46123/api/captures/${f}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:2px solid #0ea5e9" onclick="window.open(this.src,'_blank')">
          </div>`).join('');
      }
    } catch { }
  }

  private async handleCapture(_btn: HTMLElement) {
    try {
      const res = await fetch('http://127.0.0.1:46123/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: 'hikvision_main' })
      });
      const result = await res.json();
      if (result.success) this.showToast(`📸 Đã chụp: ${result.filename}`);
    } catch (err: any) {
      this.showToast(`Lỗi: ${err.message}`, true);
    }
  }

  private showToast(msg: string, isError = false) {
    const t = document.createElement('div');
    t.className = `wm-toast ${isError ? 'error' : ''}`;
    t.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.3s;opacity:0;transform:translateY(-20px)';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; }, 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  private startAISimulation() {
    this.aiInterval = setInterval(() => {
      this.cameras.forEach(c => {
        const overlay = document.getElementById(`ai-overlay-${c.id}`);
        if (overlay) overlay.innerHTML = `<div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">LIVE VIEWING</span></div>`;
      });
    }, 2000);
  }

  destroy(): void {
    if (this.aiInterval) clearInterval(this.aiInterval);
    if (this.hubConnection) this.hubConnection.stop();
  }
}
