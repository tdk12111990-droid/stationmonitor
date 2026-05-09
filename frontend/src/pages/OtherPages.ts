import { stationApi, Station as IStation, UserItem } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

export class UserManagementPage {
  private users: UserItem[] = [];
  private editingId: string | null = null;

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>QUẢN LÝ TÀI KHOẢN</h2>
        <button id="addUserBtn" class="btn-industrial btn-primary">+ Thêm tài khoản</button>
      </div>

      <div class="admin-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="userTableBody">
            <tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8">⏳ Đang tải dữ liệu...</td></tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:30px;">
        <h3 style="font-size:0.9rem; color:#64748b; font-weight:800; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
          <span>📑 BẢNG PHÂN QUYỀN </span>
          <div style="flex:1; height:1px; background:linear-gradient(90deg, #e2e8f0, transparent);"></div>
        </h3>
        <div class="admin-card" style="padding:0; overflow:hidden; border-style:dashed;">
          <table class="data-table" style="text-align:center">
            <thead>
              <tr>
                <th style="text-align:left">TÍNH NĂNG / VAI TRÒ</th>
                <th style="text-align:center">OPERATOR</th>
                <th style="text-align:center">MANAGER</th>
                <th style="text-align:center">ADMIN</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="text-align:left">Xem Dashboard & Realtime</td><td>✅</td><td>✅</td><td>✅</td></tr>
              <tr><td style="text-align:left">Xem Báo cáo & Lịch sử</td><td>✅</td><td>✅</td><td>✅</td></tr>
              <tr><td style="text-align:left">Quản lý Bảo trì</td><td>❌</td><td>✅</td><td>✅</td></tr>
              <tr><td style="text-align:left">Xem Audit Logs</td><td>❌</td><td>✅</td><td>✅</td></tr>
              <tr><td style="text-align:left">Quản lý Thiết bị & Trạm</td><td>❌</td><td>❌</td><td>✅</td></tr>
              <tr><td style="text-align:left">Quản lý Người dùng & Rule</td><td>❌</td><td>❌</td><td>✅</td></tr>
              <tr><td style="text-align:left">Cấu hình Hệ thống</td><td>❌</td><td>❌</td><td>✅</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal User -->
    <div id="userModal" class="modal-overlay">
      <div class="modal-content" style="max-width:500px">
        <div class="modal-header">
          <h3 id="userModalTitle">Thêm tài khoản</h3>
          <button id="userModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid-2">
            <div class="form-group">
              <label>Tên đăng nhập *</label>
              <input id="uUsername" type="text" class="form-input" placeholder="vd: tung.nt">
            </div>
            <div id="passGroup" class="form-group">
              <label>Mật khẩu *</label>
              <input id="uPassword" type="password" class="form-input" placeholder="Tối thiểu 6 ký tự">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Họ và tên</label>
              <input id="uFullName" type="text" class="form-input" placeholder="Nguyễn Văn A">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="uEmail" type="email" class="form-input" placeholder="example@gmail.com">
            </div>
            <div class="form-group">
              <label>Vai trò</label>
              <select id="uRole" class="form-select">
                <option value="operator">👷 Operator (Vận hành)</option>
                <option value="manager">🧑‍💼 Manager (Quản lý)</option>
                <option value="admin">🛡️ Admin (Hệ thống)</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="userModalCancel" class="btn-industrial">Hủy</button>
          <button id="userModalSave" class="btn-industrial btn-primary">💾 Lưu tài khoản</button>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    this.loadUsers();
    this.bindEvents();
  }

  private async loadUsers() {
    try {
      this.users = await stationApi.getUsers();
      this.renderTable();
    } catch (e) {
      console.error(e);
      document.getElementById('userTableBody')!.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444">❌ Lỗi tải dữ liệu</td></tr>';
    }
  }

  private renderTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    if (!this.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">Chưa có tài khoản nào</td></tr>';
      return;
    }
    tbody.innerHTML = this.users.map(u => `
      <tr>
        <td><b>${u.username}</b></td>
        <td>${u.fullName || '---'}</td>
        <td>${u.email || '---'}</td>
        <td><span class="tag tag-role-${u.role}">${u.role.toUpperCase()}</span></td>
        <td>
          <span class="status-dot" style="background:${u.isActive ? '#10b981' : '#ef4444'}"></span>
          ${u.isActive ? 'Hoạt động' : 'Vô hiệu'}
        </td>
        <td style="font-size:.75rem;opacity:.6">${new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-industrial btn-sm edit-user-btn" data-id="${u.id}" title="Sửa">✏️</button>
          <button class="btn-industrial btn-sm del-user-btn" data-id="${u.id}" title="Vô hiệu hóa" ${!u.isActive ? 'disabled' : ''}>🗑</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.edit-user-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = (b as HTMLElement).dataset.id!;
        const user = this.users.find(u => u.id === id);
        if (user) this.openModal(user);
      });
    });

    document.querySelectorAll('.del-user-btn').forEach(b => {
      b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.id!;
        const user = this.users.find(u => u.id === id);
        if (!user) return;
        if (!await confirmDialog({
          title: 'Vô hiệu hóa tài khoản',
          message: `Bạn có chắc muốn vô hiệu hóa tài khoản "${user.username}"?`,
          confirmText: 'Vô hiệu hóa',
          danger: true
        })) return;
        try {
          await stationApi.deactivateUser(id);
          this.loadUsers();
        } catch (e: any) { alert(e.message); }
      });
    });
  }

  private openModal(user?: UserItem) {
    this.editingId = user?.id || null;
    const modal = document.getElementById('userModal')!;
    const title = document.getElementById('userModalTitle')!;
    title.textContent = user ? `Sửa tài khoản: ${user.username}` : 'Thêm tài khoản mới';

    const uName = document.getElementById('uUsername') as HTMLInputElement;
    const uPass = document.getElementById('uPassword') as HTMLInputElement;
    const uFull = document.getElementById('uFullName') as HTMLInputElement;
    const uMail = document.getElementById('uEmail') as HTMLInputElement;
    const uRole = document.getElementById('uRole') as HTMLSelectElement;
    const passGroup = document.getElementById('passGroup')!;

    uName.value = user?.username || '';
    uName.disabled = !!user;
    uPass.value = '';
    passGroup.style.display = user ? 'none' : 'block';
    uFull.value = user?.fullName || '';
    uMail.value = user?.email || '';
    uRole.value = user?.role || 'operator';

    modal.classList.add('active');
  }

  private bindEvents() {
    document.getElementById('addUserBtn')?.addEventListener('click', () => this.openModal());
    document.getElementById('userModalClose')?.addEventListener('click', () => document.getElementById('userModal')?.classList.remove('active'));
    document.getElementById('userModalCancel')?.addEventListener('click', () => document.getElementById('userModal')?.classList.remove('active'));

    document.getElementById('userModalSave')?.addEventListener('click', async () => {
      const uName = (document.getElementById('uUsername') as HTMLInputElement).value.trim();
      const uPass = (document.getElementById('uPassword') as HTMLInputElement).value;
      const uFull = (document.getElementById('uFullName') as HTMLInputElement).value.trim();
      const uMail = (document.getElementById('uEmail') as HTMLInputElement).value.trim();
      const uRole = (document.getElementById('uRole') as HTMLSelectElement).value;

      try {
        if (this.editingId) {
          await stationApi.updateUser(this.editingId, { fullName: uFull, email: uMail, role: uRole });
        } else {
          if (!uName || !uPass) { alert('Vui lòng nhập Username và Password'); return; }
          await stationApi.createUser({ username: uName, password: uPass, fullName: uFull, email: uMail, role: uRole });
        }
        document.getElementById('userModal')?.classList.remove('active');
        this.loadUsers();
      } catch (e: any) { alert(e.message); }
    });
  }

  destroy(): void { }
}

// ============================================================
// MultisitePage – SOC DASHBOARD (Auto-Seed Fix)
// ============================================================

export class MultisitePage {
  private map: any;
  private stations: IStation[] = [];
  private markers: any[] = [];
  private editingStationId: string | null = null;
  private isEditMode: boolean = false;

  render(): string {
    return `
    <div style="position:relative; width:100%; height:100%; overflow:hidden; background:#f8fafc; font-family:'Inter', sans-serif;">
      <div id="multisiteMap" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:1;"></div>
      <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:2; background:radial-gradient(circle at center, transparent 70%, rgba(255,255,255,0.3) 100%); pointer-events:none;"></div>
      
      <div style="position:absolute; top:20px; left:20px; z-index:1000; display:flex; align-items:center; gap:12px;">
        <div style="background:rgba(255,255,255,0.9); backdrop-filter:blur(16px); padding:10px 20px; border-radius:12px; border:1px solid #fff; box-shadow: 0 8px 25px rgba(0,0,0,0.05); display:flex; align-items:center; gap:12px;">
          <div style="width:10px; height:10px; background:#3b82f6; border-radius:50%; box-shadow: 0 0 12px rgba(59,130,246,0.5);"></div>
          <span style="font-size:0.85rem; font-weight:900; color:#0f172a; letter-spacing:0.5px; text-transform:uppercase;">🗺️ SOC MONITORING - LONG AN</span>
        </div>
        <button id="globalSettingsBtn" title="Quản lý trạm"
                style="width:42px; height:42px; border-radius:12px; border:1px solid #fff; background:rgba(255,255,255,0.9); backdrop-filter:blur(16px); cursor:pointer; box-shadow:0 8px 25px rgba(0,0,0,0.05); display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#475569; transition:all 0.3s;">
          ⚙️
        </button>
      </div>

      <div id="editModeToast" style="position:absolute; top:80px; left:20px; z-index:1000; display:none; background:#3b82f6; color:#fff; padding:8px 16px; border-radius:8px; font-size:0.75rem; font-weight:800; box-shadow:0 10px 20px rgba(59,130,246,0.3);">
         🖱️ CHẾ ĐỘ CHỈNH SỬA: Kéo các điểm trên bản đồ để thay đổi vị trí.
      </div>

      <div style="position:absolute; top:20px; right:20px; width:280px; z-index:1000; background:rgba(255,255,255,0.85); backdrop-filter:blur(24px); border-radius:20px; border:1px solid rgba(255,255,255,0.6); padding:18px; box-shadow:0 15px 40px rgba(0,0,0,0.08); display:none;">
        <div style="font-size:0.65rem; color:#64748b; font-weight:800; margin-bottom:15px; letter-spacing:1px; display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
          <span>TÌNH TRẠNG CẢNH BÁO</span><span id="stationCount">0 TRẠM</span>
        </div>
        <div id="stationRows" style="display:flex; flex-direction:column; gap:10px;"></div>
      </div>

      <div id="stationCardsBottom" style="position:absolute; bottom:25px; left:50%; transform:translateX(-50%); width:96%; max-width:1400px; z-index:1000; display:none; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;"></div>

      <div id="stationModal" class="modal-industrial">
        <div class="modal-content" style="max-width:600px; background:#fff; border-radius:24px;">
          <div class="modal-header" style="border-bottom:1px solid #f1f5f9; padding:20px;">
            <h3 style="color:#0f172a; margin:0; font-size:1.1rem;">DANH SÁCH & CẤU HÌNH TRẠM</h3>
            <button class="modal-close" id="stModalClose" style="font-size:1.5rem; color:#94a3b8;">&times;</button>
          </div>
          <div class="modal-body" style="padding:20px; max-height:60vh; overflow-y:auto;">
             <div id="stManagerList" style="margin-bottom:20px;"></div>
             <hr style="border:0; border-top:1px solid #f1f5f9; margin:20px 0;">
             <div id="stEditorArea">
                <div style="font-weight:900; font-size:0.7rem; color:#3b82f6; margin-bottom:15px; text-transform:uppercase;">✏️ CHI TIẾT TRẠM</div>
                <div class="form-group" style="margin-bottom:12px;"><label>Tên trạm</label><input type="text" id="st_name" style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0;"></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f0f9ff; padding:12px; border-radius:12px; border:1px solid #bae6fd;">
                   <div class="form-group"><label>Cảnh báo</label><input type="number" id="st_alerts" style="width:100%; padding:8px; border-radius:6px; border:1px solid #bae6fd;"></div>
                   <div class="form-group"><label>Nhiệt độ</label><input type="number" id="st_temp" style="width:100%; padding:8px; border-radius:6px; border:1px solid #bae6fd;"></div>
                </div>
             </div>
          </div>
          <div class="modal-footer" style="padding:20px; border-top:1px solid #f1f5f9; display:flex; gap:10px;">
            <button id="stAddNewBtn" style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px 15px; border-radius:10px; font-weight:800; cursor:pointer;">➕ THÊM MỚI</button>
            <div style="flex:1;"></div>
            <button class="btn-industrial" id="stModalCancel" style="background:#f1f5f9; color:#475569;">ĐÓNG</button>
            <button class="btn-industrial btn-primary" id="stModalSave" style="padding:10px 25px;">LƯU LẠI</button>
          </div>
        </div>
      </div>

      <style>
        .map-label-content { background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 4px 10px; border-radius: 6px; border: 1px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); white-space: nowrap; transform: translateY(-35px) translateX(-50%); position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; z-index: 1000; }
        .map-label-content::after { content: ''; position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #fff; }
        .pulse-red { animation: pulse-red-dot 2s infinite; }
        @keyframes pulse-red-dot { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
        .pulse-green { animation: pulse-green-dot 2s infinite; }
        @keyframes pulse-green-dot { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
      </style>
    </div>`;
  }

  mount(): void {
    const L = (window as any).L; if (!L) return;
    this.map = L.map('multisiteMap', { zoomControl: false, attributionControl: false }).setView([10.6, 106.5], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(this.map);
    this.loadStations();
    this.bindEvents();
  }

  private async loadStations(): Promise<void> {
    try {
      let dbStations = await stationApi.getStations();
      
      // Đảm bảo luôn có các trạm hiển thị trên UI
      const virtualStations = [
        { id: 'virtual-la-1', name: '110kV LONG AN (Trạm 1)', location: JSON.stringify({ lat: 10.63, lng: 106.50, alerts: 3, temp: 42, pd: 0 }), code: 'LA001', status: 'online' },
        { id: 'virtual-la-2', name: '110kV LONG AN (Trạm 2)', location: JSON.stringify({ lat: 10.68, lng: 106.55, alerts: 0, temp: 32, pd: 0 }), code: 'LA002', status: 'online' },
        { id: 'virtual-tt',  name: '110kV TÂN TRỤ', location: JSON.stringify({ lat: 10.51, lng: 106.52, alerts: 0, temp: 34, pd: 0 }), code: 'TT001', status: 'online' }
      ];

      // Nếu trong DB chưa có các trạm này, ta add tạm vào list để hiện UI
      virtualStations.forEach(vs => {
        if (!dbStations.some(s => s.name === vs.name)) {
          dbStations.push(vs as any);
        }
      });

      // Ghi đè tọa độ từ localStorage nếu người dùng đã từng kéo thả
      this.stations = dbStations.map(s => {
        const savedLoc = localStorage.getItem(`station_pos_${s.id}`);
        if (savedLoc) {
          try {
            const pos = JSON.parse(savedLoc);
            const meta = this.parseLoc(s.location);
            meta.lat = pos.lat; meta.lng = pos.lng;
            return { ...s, location: JSON.stringify(meta) };
          } catch { return s; }
        }
        return s;
      });

      this.renderUI();
      this.renderMarkers();
    } catch (e) { console.error(e); }
  }

  private parseLoc(loc: any) {
    try { return loc ? JSON.parse(loc) : { lat: 10.6, lng: 106.5, alerts: 0, temp: 35, pd: 0 }; }
    catch { return { lat: 10.6, lng: 106.5, alerts: 0, temp: 35, pd: 0 }; }
  }

  private renderUI(): void {
    const rows = document.getElementById('stationRows');
    const cards = document.getElementById('stationCardsBottom');
    if (!rows || !cards) return;
    document.getElementById('stationCount')!.textContent = `${this.stations.length} TRẠM`;
    const data = this.stations.map(s => ({ ...s, meta: this.parseLoc(s.location) }));
    rows.innerHTML = data.sort((a, b) => b.meta.alerts - a.meta.alerts).map(s => {
      const color = s.meta.alerts > 0 ? '#ef4444' : '#10b981';
      return `<div style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:10px; background:rgba(255,255,255,0.5); border:1px solid #f1f5f9;">
        <div style="width:8px; height:8px; background:${color}; border-radius:50%;"></div>
        <div style="flex:1; font-size:0.7rem; font-weight:800; color:#1e293b; overflow:hidden; text-overflow:ellipsis;">${s.name}</div>
        <div style="font-size:0.65rem; font-weight:900; color:${color};">${s.meta.alerts}</div>
      </div>`;
    }).join('');
    cards.style.display = 'grid'; // Hiện dãy thẻ phía dưới
    const displayData = data.slice(0, 4); // Lấy tối đa 4 trạm để hiện cards
    
    let cardsHtml = displayData.map(s => {
      const color = s.meta.alerts > 0 ? '#ef4444' : '#10b981';
      const realStation = this.stations.find(x => !x.id.startsWith('virtual'));
      const targetId = s.id.startsWith('virtual') ? (realStation?.id || s.id) : s.id;
      
      return `<div class="multisite-card-light" style="background:rgba(255,255,255,0.95); border-radius:16px; padding:18px; border:1px solid #fff; box-shadow:0 10px 30px rgba(0,0,0,0.05); cursor:pointer; transition: transform 0.2s;" onclick="(window as any).router.navigate('dashboard', { stationId: '${targetId}' })" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
        <div style="font-size:0.6rem; color:#3b82f6; font-weight:900; margin-bottom:4px; letter-spacing:1px;">HỆ THỐNG GIÁM SÁT</div>
        <div style="font-weight:900; font-size:0.9rem; color:#0f172a; margin-bottom:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.name}</div>
        <div style="display:flex; gap:10px;">
          <div style="flex:1; background:#f8fafc; padding:8px; border-radius:10px; border:1px solid #f1f5f9;">
            <div style="font-size:0.55rem; color:#94a3b8; font-weight:700;">NHIỆT ĐỘ</div>
            <div style="font-size:1.1rem; font-weight:900; color:#1e293b;">${s.meta.temp}°C</div>
          </div>
          <div style="flex:1; background:#f8fafc; padding:8px; border-radius:10px; border:1px solid #f1f5f9;">
            <div style="font-size:0.55rem; color:#94a3b8; font-weight:700;">CẢNH BÁO</div>
            <div style="font-size:1.1rem; font-weight:900; color:${color};">${s.meta.alerts}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Thêm ô "THÊM TRẠM MỚI" ở cuối (chỉ là UI)
    cardsHtml += `
      <div style="background:rgba(255,255,255,0.4); border-radius:16px; padding:18px; border:2px dashed rgba(255,255,255,0.8); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; gap:10px; opacity:0.7; transition:all 0.2s;" onmouseover="this.style.opacity='1';this.style.background='rgba(255,255,255,0.6)'" onmouseout="this.style.opacity='0.7';this.style.background='rgba(255,255,255,0.4)'">
        <div style="width:40px; height:40px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:#64748b; box-shadow:0 4px 12px rgba(0,0,0,0.05);">+</div>
        <div style="font-size:0.75rem; font-weight:900; color:#475569; letter-spacing:1px;">THÊM TRẠM MỚI</div>
      </div>
    `;

    cards.innerHTML = cardsHtml;
  }

  private renderMarkers(): void {
    const L = (window as any).L; if (!L || !this.map) return;
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    this.stations.forEach(s => {
      const meta = this.parseLoc(s.location);
      const isWarn = meta.alerts > 0;
      const color = isWarn ? '#ef4444' : '#10b981';
      const markerIcon = L.divIcon({
        className: 'custom-dot-label',
        html: `<div style="position:relative; width:12px; height:12px;">
                 <div class="map-label-content"><span style="font-size:0.6rem; font-weight:900;">${s.name}</span><span style="font-size:0.55rem; font-weight:800; color:${color};">${meta.alerts} ⚠️ • ${meta.temp}°C</span></div>
                 <div style="width:12px; height:12px; background:${color}; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.2);" class="${isWarn ? 'pulse-red' : 'pulse-green'}"></div>
               </div>`,
        iconSize: [12, 12], iconAnchor: [6, 6]
      });
      const marker = L.marker([meta.lat, meta.lng], { icon: markerIcon, draggable: this.isEditMode }).addTo(this.map);
      
      const realStation = this.stations.find(x => !x.id.startsWith('virtual'));
      const targetId = s.id.startsWith('virtual') ? (realStation?.id || s.id) : s.id;

      marker.on('dragend', async (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        meta.lat = lat; meta.lng = lng;
        
        // Luôn lưu vào localStorage để ghi nhớ ở frontend
        localStorage.setItem(`station_pos_${s.id}`, JSON.stringify({ lat, lng }));

        if (!s.id.startsWith('virtual')) {
          try {
            await stationApi.updateStation(s.id, { location: JSON.stringify(meta) });
          } catch (err) { console.error('Save position to server failed', err); }
        }
        
        const idx = this.stations.findIndex(x => x.id === s.id);
        if (idx !== -1 && this.stations[idx]) this.stations[idx].location = JSON.stringify(meta);
      });

      marker.on('click', () => { if (!this.isEditMode) (window as any).router.navigate('dashboard', { stationId: targetId }); });
      this.markers.push(marker);
    });
  }

  private toggleEditMode(enable: boolean): void {
    this.isEditMode = enable;
    const btn = document.getElementById('globalSettingsBtn');
    const toast = document.getElementById('editModeToast');
    if (enable) { btn?.classList.add('active'); toast!.style.display = 'block'; }
    else { btn?.classList.remove('active'); toast!.style.display = 'none'; }
    this.renderMarkers();
  }

  private bindEvents(): void {
    document.getElementById('globalSettingsBtn')?.addEventListener('click', () => {
      this.toggleEditMode(!this.isEditMode);
      if (this.isEditMode) { this.renderManagerList(); document.getElementById('stationModal')?.classList.add('active'); }
    });
    document.getElementById('stModalClose')?.addEventListener('click', () => { document.getElementById('stationModal')?.classList.remove('active'); this.toggleEditMode(false); });
    document.getElementById('stModalCancel')?.addEventListener('click', () => { document.getElementById('stationModal')?.classList.remove('active'); this.toggleEditMode(false); });
    document.getElementById('stAddNewBtn')?.addEventListener('click', () => { this.editingStationId = null;['st_name', 'st_alerts', 'st_temp'].forEach(k => (document.getElementById(k) as HTMLInputElement).value = ''); });
    document.getElementById('stModalSave')?.addEventListener('click', async () => {
      const name = (document.getElementById('st_name') as HTMLInputElement).value;
      const alerts = parseInt((document.getElementById('st_alerts') as HTMLInputElement).value);
      const temp = parseInt((document.getElementById('st_temp') as HTMLInputElement).value);
      const existing = this.stations.find(x => x.id === this.editingStationId);
      const meta = existing ? this.parseLoc(existing.location) : { lat: 10.6, lng: 106.5, alerts: 0, temp: 35, pd: 0 };
      meta.alerts = alerts; meta.temp = temp;
      const location = JSON.stringify(meta);
      try {
        if (this.editingStationId) await stationApi.updateStation(this.editingStationId, { name, location });
        else await stationApi.createStation({ name, location, code: 'ST-' + Date.now() });
        await this.loadStations();
      } catch (e) { alert('Lỗi: ' + (e as Error).message); }
    });
  }

  private renderManagerList(): void {
    const list = document.getElementById('stManagerList'); if (!list) return;
    list.innerHTML = this.stations.map(s => `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9;"><div style="font-size:0.8rem; font-weight:700;">${s.name}</div><div style="display:flex; gap:10px;"><button onclick="window.multisite.editStation('${s.id}')" style="background:none; border:none; cursor:pointer;">✏️</button><button onclick="window.multisite.deleteStation('${s.id}')" style="background:none; border:none; cursor:pointer;">🗑️</button></div></div>`).join('');
    (window as any).multisite = {
      editStation: (id: string) => {
        this.editingStationId = id; const s = this.stations.find(x => x.id === id); if (!s) return;
        const m = this.parseLoc(s.location);
        (document.getElementById('st_name') as HTMLInputElement).value = s.name;
        (document.getElementById('st_alerts') as HTMLInputElement).value = String(m.alerts);
        (document.getElementById('st_temp') as HTMLInputElement).value = String(m.temp);
      },
      deleteStation: async (id: string) => { if (!await confirmDialog('Xác nhận xóa?')) return; await stationApi.deleteStation(id); await this.loadStations(); this.renderManagerList(); }
    };
  }

  destroy(): void { if (this.map) this.map.remove(); }
}
