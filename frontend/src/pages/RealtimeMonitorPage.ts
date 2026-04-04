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
    // Camera grid sẽ được render sau khi load từ API trong mount()
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
                  <!-- Floating HUD: Title & Actions -->
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
                    <!-- go2rtc Adaptive Stream (Auto-match H.264/H.265) -->
                    <iframe 
                      src="${GO2RTC_URL}/stream.html?src=${deviceId}&mode=mse"
                      style="width:100%; height:100%; border:none; pointer-events: none;" 
                      id="hik-rtc-frame-${deviceId}">
                    </iframe>
                  </div>
                </div>
              </div>`;
    }).join('')}
            </div>
          </div>

          <!-- Bottom Drawer: Ảnh chụp mới (Collapsible) -->
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



        <!-- Sidebar: Nhật ký Camera (Dạng Sáng có ảnh) -->
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

      <!-- Camera Professional Monitor Modal (Premium Glassmorphism Layout) -->
      <div id="cameraLiveModal" class="modal-overlay">
        <div class="modal-content" style="width: 98%; max-width: 1600px; height: 95vh; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(20px); display:flex; flex-direction:column; border: 1px solid rgba(255, 255, 255, 0.15); overflow:hidden; box-shadow: 0 0 100px rgba(0,0,0,0.5);">
           <!-- Header -->
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
           
           <!-- Top Section: Video (Left) + Logs (Right) -->
           <div style="flex: 1; display: flex; overflow: hidden; background: transparent; position: relative;">
              <!-- Video Area -->
              <div style="flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; height: 100%;">
                 <div id="modalVideoContainer" style="width:100%; height:100%; background: #000;"></div>
                 <video id="playbackVideo" style="display:none; width:100%; height:100%; object-fit: contain; background: black; z-index: 5;" controls></video>
              </div>

              <!-- Sidebar: Nhật ký sự kiện (Right Collapsible Glass) -->
              <div id="modalSidebar" style="width: 320px; min-width: 320px; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(15px); display: flex; flex-direction: column; border-left: 1px solid rgba(255, 255, 255, 0.1); z-index: 100; transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;">
                 <button id="modalSidebarToggle" title="Đóng/Mở Nhật ký" style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 24px; height: 70px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px); color: white; border: 1px solid rgba(255,255,255,0.1); border-right: none; border-radius: 10px 0 0 10px; cursor: pointer; font-size: 14px; display:flex; align-items:center; justify-content:center; z-index: 101;">‹</button>
                 
                 <div style="padding: 15px; background: rgba(255, 255, 255, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.08); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size: 10px; font-weight: 900; color: #fff; letter-spacing: 1px; opacity: 0.8;">NHẬT KÝ AI PHÂN TÍCH</span>
                    <span id="modalLogCount" style="font-size: 9px; background: rgba(255,255,255,0.1); color: #fff; padding: 2px 8px; border-radius: 10px;">0 sự kiện</span>
                 </div>
                 <div id="modalCameraLogsGroup" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
              </div>
           </div>

           <!-- Bottom Section: Ảnh chụp mới (Horizontal Glass Shelf) -->
           <div id="modalShelf" style="height: 120px; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(15px); border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; padding: 0 24px; gap: 20px; z-index: 90; transition: margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;">
              <button id="modalShelfToggle" title="Đóng/Mở Ảnh chụp" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); width: 60px; height: 20px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(5px); border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: none; border-radius: 10px 10px 0 0; cursor: pointer; font-size: 12px; color: #fff; display:flex; align-items:center; justify-content:center; z-index: 91;">∨</button>
              
              <div style="writing-mode: vertical-rl; transform: rotate(180deg); font-size: 10px; font-weight: 900; color: #fff; letter-spacing: 2px; border-left: 4px solid #0ea5e9; padding-left: 10px; height: 50px; opacity: 0.7;">ẢNH TRÍ TUỆ NHÂN TẠO</div>
              <div id="recentCapturesContainer" style="display: flex; gap: 15px; align-items: center; flex: 1; overflow-x: auto; padding: 5px 0;">
                  <span style="font-size: 11px; color: rgba(255,255,255,0.4); font-style: italic;">Đang đồng bộ hóa kho ảnh từ biên...</span>
              </div>
           </div>
        </div>
      </div>
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
    this.bindCameraEvents();
    this.connectSignalR();
  }

  // Render lại grid camera sau khi đã có dữ liệu từ API
  private renderCameraGrid(): void {
    const grid = document.querySelector('.camera-grid-v2');
    const filterSelect = document.getElementById('camFilterSelect') as HTMLSelectElement;
    if (!grid) return;

    // Cập nhật select filter
    if (filterSelect) {
      filterSelect.innerHTML = `<option value="ALL">Tất cả Camera</option>` +
        this.cameras.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Cập nhật counter
    const onlineCount = this.cameras.filter(c => c.status === 'online').length;
    const statEl = document.querySelector('.status-summary .stat-item b');
    if (statEl) statEl.textContent = String(onlineCount);

    if (!this.cameras.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:#94a3b8;">
        Chưa có camera nào. Thêm camera trong mục Quản lý thiết bị.
      </div>`;
      return;
    }

    grid.innerHTML = this.cameras.map(d => {
      const go2rtcId = d.config?.go2rtc_id ?? d.id;
      return `
        <div class="cam-card-v2" data-cam-id="${d.id}" data-go2rtc-id="${go2rtcId}" data-cam-name="${d.name.toLowerCase()}">
          <div class="cam-viewport" id="viewport-${d.id}">
            <div class="cam-hud-top">
              <div class="cam-title-group">
                <span class="status-dot ${d.status === 'online' ? 'dot-green' : 'dot-red'}"></span>
                <span class="cam-name">${d.name}</span>
              </div>
              <div class="cam-actions">
                <button title="Chụp ảnh" class="cam-btn-hud btn-capture" data-go2rtc="${go2rtcId}">📸</button>
                <button title="Phóng to" class="cam-btn-hud btn-expand-live" data-id="${d.id}" data-go2rtc="${go2rtcId}">⛶</button>
              </div>
            </div>
            <div class="cam-overlay-container" id="ai-overlay-${d.id}">
              <div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">LIVE VIEWING</span></div>
            </div>
            <div class="real-stream-container"
              style="position:relative;overflow:hidden;width:100%;height:100%;flex:1;">
              <!-- iframe cao hơn 44px để cắt thanh controls go2rtc ở dưới -->
              <iframe
                src="${GO2RTC_URL}/stream.html?src=${go2rtcId}&mode=mse"
                style="width:100%;height:calc(100% + 44px);border:none;
                  pointer-events:none;display:block;"
                id="hik-rtc-frame-${d.id}">
              </iframe>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Kết nối SignalR và lắng nghe SensorUpdate
  private connectSignalR(): void {
    const token = localStorage.getItem('station_jwt');
    if (!token) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5056/ws/realtime', {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.hubConnection.on('SensorUpdate', (payload: any[]) => {
      // Cập nhật HUD overlay với giá trị cảm biến mới nhất
      if (!Array.isArray(payload)) return;
      const tempReadings = payload.filter(p =>
        p.pointId?.startsWith('nhiet_do') || p.pointId?.startsWith('phong_dien')
      );
      if (!tempReadings.length) return;

      // Hiển thị lên overlay của tất cả camera PLC
      this.cameras.forEach(cam => {
        if (!cam.type.startsWith('camera')) {
          const overlay = document.getElementById(`ai-overlay-${cam.id}`);
          if (overlay) {
            const lines = tempReadings.map(p => `${p.pointId}: ${p.value} ${p.unit}`).join(' | ');
            overlay.innerHTML = `<div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text" style="font-size:9px;">${lines}</span></div>`;
          }
        }
      });
    });

    this.hubConnection.on('DeviceStatus', (data: { deviceId: string; status: string }) => {
      const dot = document.querySelector(`[data-cam-id="${data.deviceId}"] .status-dot`);
      if (dot) {
        dot.className = `status-dot ${data.status === 'online' ? 'dot-green' : 'dot-red'}`;
      }
    });

    this.hubConnection.start()
      .then(() => console.log('[SignalR] Kết nối realtime thành công'))
      .catch(err => console.warn('[SignalR] Không kết nối được:', err));
  }

  // Gắn events cho các camera card (sau khi render xong)
  private bindCameraEvents(): void {
    // Nằm trong mount() cũ — sẽ được gọi lại sau khi renderCameraGrid()
    // Capture + Expand nằm trong mount() bind qua event delegation
  }

  private _realMount(): void {

    const modal = document.getElementById('cameraLiveModal');
    const modalBody = document.getElementById('modalVideoContainer');
    const playbackVideo = document.getElementById('playbackVideo') as HTMLVideoElement;
    const modalLogsGroup = document.getElementById('modalCameraLogsGroup');
    const btnReturnLive = document.getElementById('btnReturnToLive');
    const modeBadge = document.getElementById('monitorModeBadge');

    const showLive = () => {
      if (!modalBody || !playbackVideo || !modeBadge || !btnReturnLive || !this.currentModalCamId) return;
      playbackVideo.style.display = 'none';
      playbackVideo.pause();
      modalBody.style.display = 'block';
      
      // Inject a fresh iframe for the modal without controls for cleaner live view
      modalBody.innerHTML = `
        <iframe 
          src="${GO2RTC_URL}/stream.html?src=${this.currentModalCamId}&mode=mse&controls=0"
          style="width:100%; height:100%; border:none; pointer-events: none;" 
          id="modal-rtc-frame">
        </iframe>
      `;
      
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
      const viewport = document.getElementById(`viewport-${camId}`);
      if (!viewport || !modal || !modalBody || !modalLogsGroup) return;

      this.currentModalCamId = camId;
      if (playbackUrl) showPlayback(playbackUrl); else showLive();

      const filteredLogs = this.logs.filter(l => l.device_id === camId);
      modalLogsGroup.innerHTML = filteredLogs.map(log => `
        <div class="cam-log-item forensic-log-item-light" style="padding: 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; gap: 8px;" 
             data-video="${log.video || ''}" data-cam-id="${log.device_id}">
          <div style="flex: 0 0 50px;">
            <img src="${log.img}" style="width: 50px; height: 35px; border-radius: 4px; object-fit: cover;">
          </div>
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
               <span style="font-size: 8px; font-weight: 800; color: ${log.level === 'crit' ? '#ef4444' : '#f59e0b'};">${log.type}</span>
               <span style="font-size: 8px; color: #94a3b8;">${log.time}</span>
            </div>
            <div style="font-size: 10px; color: #1e293b; font-weight: 600;">${log.msg}</div>
          </div>
        </div>
      `).join('');

      modalLogsGroup.querySelectorAll('.forensic-log-item-light').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const videoUrl = (item as HTMLElement).dataset.video;
          if (videoUrl) showPlayback(videoUrl);
        });
      });

      const countEl = document.getElementById('modalLogCount');
      if (countEl) countEl.textContent = `${filteredLogs.length} sự kiện`;

      modal.classList.add('active');
    };

    // Modal Collapsible Handlers
    document.getElementById('modalSidebarToggle')?.addEventListener('click', (e) => {
      const sidebar = document.getElementById('modalSidebar');
      const btn = e.currentTarget as HTMLButtonElement;
      if (sidebar && btn) {
        const isCollapsed = sidebar.style.marginRight === '-320px';
        sidebar.style.marginRight = isCollapsed ? '0' : '-320px';
        btn.textContent = isCollapsed ? '‹' : '›';
        btn.style.left = isCollapsed ? '-24px' : '-20px';
      }
    });

    document.getElementById('modalShelfToggle')?.addEventListener('click', (e) => {
      const shelf = document.getElementById('modalShelf');
      const btn = e.currentTarget as HTMLButtonElement;
      if (shelf && btn) {
        const isCollapsed = shelf.style.marginBottom === '-110px';
        shelf.style.marginBottom = isCollapsed ? '0' : '-110px';
        btn.textContent = isCollapsed ? '∨' : '∧';
        btn.style.top = isCollapsed ? '-20px' : '-18px';
      }
    });

    // Global listeners
    document.querySelectorAll('.btn-expand-live').forEach(btn => {
      btn.addEventListener('click', () => openMonitor((btn as HTMLElement).dataset.id!));
    });

    document.querySelectorAll('.camera-logs-section .forensic-log-item-light').forEach(item => {
      item.addEventListener('click', () => {
        const camId = (item as HTMLElement).dataset.camId!;
        const videoUrl = (item as HTMLElement).dataset.video || null;
        openMonitor(camId, videoUrl);
      });
    });

    btnReturnLive?.addEventListener('click', showLive);

    // Sidebar Toggle Logic
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const logsSidebar = document.getElementById('sidebarLogs');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      logsSidebar?.classList.toggle('sidebar-collapsed');
      const isCollapsed = logsSidebar?.classList.contains('sidebar-collapsed');
      if (toggleBtn) toggleBtn.textContent = isCollapsed ? '‹' : '›';
    });



    const closeModal = () => {
      this.currentModalCamId = null;
      if (modal) modal.classList.remove('active');
      if (playbackVideo) { playbackVideo.pause(); playbackVideo.src = ""; }
      if (modalBody) modalBody.innerHTML = '';
    };

    // Capture Snapshot Logic (Backend Automated)
    const showToast = (msg: string, isError = false) => {
      const existing = document.querySelector('.wm-toast');
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.className = `wm-toast ${isError ? 'error' : ''}`;
      toast.style.zIndex = '999999';
      toast.style.position = 'fixed';
      toast.style.top = '24px';
      toast.style.right = '24px';
      toast.innerHTML = `<span>${isError ? '⚠️' : '📸'} ${msg}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    };


    document.querySelectorAll('.btn-capture').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const streamId = 'hikvision_main';
        const localApiUrl = 'http://127.0.0.1:46123/api/capture';

        try {
          const response = await fetch(localApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streamId })
          });
          const result = await response.json();
          if (result.success) {
            showToast(`Đã chụp và lưu ảnh: ${result.filename}`);

            const imgUrl = `http://127.0.0.1:46123/api/captures/${result.filename}`;
            const timeStr = new Date().toLocaleTimeString();

            // Function to add image to a container
            const addToShelf = (shelfId: string) => {
              const shelf = document.getElementById(shelfId);
              if (shelf) {
                if (shelf.innerText.includes('Chưa có ảnh') || shelf.innerText.includes('Bạn hãy chụp')) shelf.innerHTML = '';
                const item = document.createElement('div');
                item.className = 'recent-capture-item';
                item.style.flex = '0 0 120px';
                item.style.height = '85px';
                item.innerHTML = `
                        <div style="position:relative; width:100%; height:100%; border-radius: 8px; overflow:hidden; border:2px solid #0ea5e9; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor:pointer;" onclick="window.open('${imgUrl}', '_blank')">
                            <img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover;">
                            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.65); color:white; font-size:9px; padding:3px; text-align:center; font-weight:800;">${timeStr}</div>
                        </div>
                    `;


                shelf.prepend(item);
              }
            };

            // Update both shelves (main dashboard and modal)
            addToShelf('primaryRecentCaptures');
            addToShelf('recentCapturesContainer');

          } else {
            throw new Error(result.error);
          }


        } catch (err: any) {
          console.error('Capture error:', err);
          showToast(`Lỗi: ${err.message}`, true);
        }


      });
    });

    // Populate Existing Captures from "Kho" (History)
    const loadCapturesFromKho = async () => {
      try {
        const listUrl = 'http://127.0.0.1:46123/api/captures-list';
        const res = await fetch(listUrl);
        const data = await res.json();
        if (data.captures && data.captures.length > 0) {
          // We add them in reverse to ensure the newest is still at the start after prepend
          // Actually they are already sorted by time (descending), so just add them
          data.captures.reverse().forEach((filename: string) => {
            const shelf = document.getElementById('primaryRecentCaptures');
            if (shelf) {
              const timeStr = filename.split('_')[2]?.replace('.jpg', '') || 'Lịch sử';
              if (shelf.innerText.includes('Bạn hãy chụp')) shelf.innerHTML = '';
              const item = document.createElement('div');
              item.className = 'recent-capture-item';
              item.style.flex = '0 0 120px';
              item.style.height = '85px';
              item.innerHTML = `
                            <div style="position:relative; width:100%; height:100%; border-radius: 8px; overflow:hidden; border:2px solid #0ea5e9; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor:pointer;" onclick="window.open('http://127.0.0.1:46123/api/captures/${filename}', '_blank')">
                                <img src="http://127.0.0.1:46123/api/captures/${filename}" style="width:100%; height:100%; object-fit:cover;">
                                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.65); color:white; font-size:8px; padding:3px; text-align:center;">${timeStr}</div>
                            </div>
                        `;
              shelf.prepend(item);
            }
          });
        }
      } catch (err) {
        console.error('History load error:', err);
      }
    };
    loadCapturesFromKho();




    // Toggle Captures Drawer (Bottom)
    document.getElementById('capturesToggleBtnBottom')?.addEventListener('click', () => {
      const sidebar = document.getElementById('bottomCaptures');
      const btn = document.getElementById('capturesToggleBtnBottom');
      if (sidebar && btn) {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        btn.innerText = isCollapsed ? '∧' : '∨';
      }
    });



    document.getElementById('cameraLiveClose')?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Filter Logic
    const sideLogFilter = document.getElementById('sideLogFilter') as HTMLSelectElement;
    sideLogFilter?.addEventListener('change', () => {
      const type = sideLogFilter.value;
      document.querySelectorAll('.camera-logs-section .forensic-log-item-light').forEach(item => {
        const itemType = (item as HTMLElement).dataset.aiType;
        (item as HTMLElement).style.display = (type === 'ALL' || itemType === type) ? '' : 'none';
      });
    });

    const camFilter = document.getElementById('camFilterSelect') as HTMLSelectElement;

    const performFilter = () => {
      if (!camFilter) return;
      const camId = camFilter.value;
      document.querySelectorAll('.cam-card-v2').forEach(card => {
        const id = (card as HTMLElement).dataset.camId;
        (card as HTMLElement).style.display = (camId === 'ALL' || id === camId) ? '' : 'none';
      });
    };

    camFilter?.addEventListener('change', performFilter);
  }

  private startAISimulation(): void {
    if (this.aiInterval) clearInterval(this.aiInterval);

    this.aiInterval = setInterval(() => {
      const cameraElements = document.querySelectorAll('.cam-card-v2');
      cameraElements.forEach(card => {
        const camId = (card as HTMLElement).dataset.camId!;
        this.updateHUD(camId);
      });

      // Sync modal HUD if open (Optional, but don't re-inject iframe HTML)
      if (this.currentModalCamId) {
        // Only update specific HUD elements if needed, not the video frame
      }
    }, 1000);
  }

  private async updateHUD(camId: string): Promise<void> {
    const overlay = document.getElementById(`ai-overlay-${camId}`);
    const breakerPanel = document.getElementById(`breaker-panel-${camId}`);
    if (!overlay) return;

    // AI logic disabled at user request to show only live video
    overlay.innerHTML = `<div class="ai-status-indicator"><div class="pulse-dot-cyan"></div><span class="ai-status-text">LIVE VIEWING</span></div>`;
    if (breakerPanel) breakerPanel.style.display = 'none';
  }

  destroy(): void {
    if (this.aiInterval) clearInterval(this.aiInterval);
    if (this.hubConnection) {
      this.hubConnection.stop();
      this.hubConnection = null;
    }
  }
}
