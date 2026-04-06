// ============================================================
// UserManagementPage – D09: Quản lý Người dùng
// Kết nối API thật: GET/POST/PUT/DELETE /api/v1/users
// ============================================================

import { stationApi, type UserItem } from '@/services/StationApiService';
import { confirmDialog } from '@/utils/confirm';

export class UserManagementPage {
  private users: UserItem[] = [];
  private editingUserId: string | null = null;

  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>QUẢN LÝ NGƯỜI DÙNG</h2>
        <button id="addUserBtn" class="btn-industrial btn-primary">+ Thêm tài khoản</button>
      </div>
      <div class="admin-card" style="padding:0">
        <table class="data-table" id="userTable">
          <thead><tr>
            <th>Họ tên</th><th>Tên đăng nhập</th><th>Email</th>
            <th>Vai trò</th><th>Trạng thái</th><th>Hành động</th>
          </tr></thead>
          <tbody id="userTableBody">
            <tr><td colspan="6" style="text-align:center;color:#475569;padding:32px">Đang tải...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Role permissions summary -->
      <div class="admin-card" style="padding:20px;margin-top:16px">
        <div class="card-title">BẢNG PHÂN QUYỀN</div>
        <table class="data-table">
          <thead><tr><th>Tính năng</th><th>Operator</th><th>Manager</th><th>Admin</th></tr></thead>
          <tbody>
            ${[
        ['Xem Dashboard', '✅', '✅', '✅'],
        ['Acknowledge Alarm', '✅', '✅', '✅'],
        ['Xem báo cáo', '✅', '✅', '✅'],
        ['Tạo & Gửi báo cáo', '❌', '✅', '✅'],
        ['Cấu hình ngưỡng', '❌', '❌', '✅'],
        ['Quản lý thiết bị', '❌', '❌', '✅'],
        ['Quản lý người dùng', '❌', '❌', '✅'],
        ['Xem Audit Log', '❌', '✅', '✅'],
        ['Cài đặt hệ thống', '❌', '❌', '✅'],
      ].map(([f, ...r]) => `<tr><td>${f}</td>${r.map(v => `<td style="text-align:center">${v}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Thêm / Sửa tài khoản -->
    <div id="userModal" class="modal-overlay">
      <div class="modal-content" style="width:520px">
        <div class="modal-header">
          <h3 id="userModalTitle">THÊM TÀI KHOẢN</h3>
          <button id="userModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group" id="usernameGroup">
            <label>Tên đăng nhập <span style="color:#ef4444">*</span></label>
            <input id="uf_user" type="text" class="form-input" placeholder="nguyen.va">
          </div>
          <div class="form-group"><label>Họ tên</label><input id="uf_name" type="text" class="form-input" placeholder="Nguyễn Văn A"></div>
          <div class="form-group"><label>Email</label><input id="uf_email" type="email" class="form-input" placeholder="user@station.vn"></div>
          <div class="form-grid-2" id="passwordGroup">
            <div class="form-group"><label>Mật khẩu <span style="color:#ef4444">*</span></label><input id="uf_pass" type="password" class="form-input" placeholder="••••••••"></div>
            <div class="form-group"><label>Xác nhận mật khẩu</label><input id="uf_pass2" type="password" class="form-input" placeholder="••••••••"></div>
          </div>
          <div class="form-group" style="margin-top:8px">
            <label>Vai trò</label>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
              <label class="checkbox-label"><input type="radio" name="uf_role" value="operator" checked> <b>Operator</b> <span style="opacity:.5;margin-left:4px">– Xem + Acknowledge</span></label>
              <label class="checkbox-label"><input type="radio" name="uf_role" value="manager"> <b>Manager</b> <span style="opacity:.5;margin-left:4px">– Operator + Tạo báo cáo</span></label>
              <label class="checkbox-label"><input type="radio" name="uf_role" value="admin"> <b>Admin</b> <span style="opacity:.5;margin-left:4px">– Toàn quyền</span></label>
            </div>
          </div>
          <div class="form-group" id="isActiveGroup" style="display:none;margin-top:8px">
            <label class="checkbox-label">
              <input type="checkbox" id="uf_isActive" checked> Tài khoản đang hoạt động
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button id="userModalCancel" class="btn-industrial">Hủy</button>
          <button id="userModalSave" class="btn-industrial btn-primary">Lưu tài khoản</button>
        </div>
      </div>
    </div>

    <!-- Modal: Đổi mật khẩu -->
    <div id="pwModal" class="modal-overlay">
      <div class="modal-content" style="width:420px">
        <div class="modal-header">
          <h3>ĐỔI MẬT KHẨU</h3>
          <button id="pwModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Mật khẩu mới <span style="color:#ef4444">*</span></label><input id="pw_new" type="password" class="form-input" placeholder="••••••••"></div>
          <div class="form-group"><label>Xác nhận mật khẩu mới</label><input id="pw_confirm" type="password" class="form-input" placeholder="••••••••"></div>
        </div>
        <div class="modal-footer">
          <button id="pwModalCancel" class="btn-industrial">Hủy</button>
          <button id="pwModalSave" class="btn-industrial btn-primary">Đổi mật khẩu</button>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    this.loadUsers();
    this.bindEvents();
  }

  private async loadUsers(): Promise<void> {
    try {
      this.users = await stationApi.getUsers();
      this.renderTable();
    } catch (e) {
      const tbody = document.getElementById('userTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:32px">Lỗi tải danh sách: ${(e as Error).message}</td></tr>`;
    }
  }

  private renderTable(): void {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    if (this.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#475569;padding:32px">Chưa có người dùng nào</td></tr>`;
      return;
    }
    tbody.innerHTML = this.users.map(u => {
      const roleColor = u.role === 'admin' ? '#ef4444' : u.role === 'manager' ? '#f59e0b' : '#10b981';
      const roleLabel = u.role === 'admin' ? 'ADMIN' : u.role === 'manager' ? 'MANAGER' : 'OPERATOR';
      const statusTag = u.isActive
        ? `<span class="tag tag-success">Hoạt động</span>`
        : `<span class="tag tag-danger">Vô hiệu</span>`;
      return `<tr data-user-id="${u.id}">
        <td><b>${u.fullName || '—'}</b></td>
        <td><code>${u.username}</code></td>
        <td>${u.email || '—'}</td>
        <td><span class="tag" style="background:${roleColor}20;color:${roleColor}">${roleLabel}</span></td>
        <td>${statusTag}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-industrial btn-sm edit-user-btn" data-id="${u.id}" title="Sửa thông tin">✏</button>
          <button class="btn-industrial btn-sm change-pw-btn" data-id="${u.id}" title="Đổi mật khẩu">🔑</button>
          ${u.isActive ? `<button class="btn-industrial btn-sm btn-danger deactivate-btn" data-id="${u.id}" data-name="${u.username}" title="Vô hiệu hóa">🚫</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    // Bind row action buttons
    tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        this.openEditModal(id);
      });
    });
    tbody.querySelectorAll('.change-pw-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        this.openChangePasswordModal(id);
      });
    });
    tbody.querySelectorAll('.deactivate-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const name = (btn as HTMLElement).dataset.name!;
        if (!await confirmDialog({ title: 'Vô hiệu hóa tài khoản', message: `Vô hiệu hóa tài khoản "${name}"?`, confirmText: 'Vô hiệu hóa', danger: true })) return;
        try {
          await stationApi.deactivateUser(id);
          this.showToast(`Đã vô hiệu hóa tài khoản "${name}"`, 'success');
          await this.loadUsers();
        } catch (e) {
          this.showToast(`Lỗi: ${(e as Error).message}`, 'error');
        }
      });
    });
  }

  private openAddModal(): void {
    this.editingUserId = null;
    const titleEl = document.getElementById('userModalTitle');
    const userGroup = document.getElementById('usernameGroup');
    const pwGroup = document.getElementById('passwordGroup');
    const isActiveGroup = document.getElementById('isActiveGroup');
    if (titleEl) titleEl.textContent = 'THÊM TÀI KHOẢN';
    if (userGroup) userGroup.style.display = '';
    if (pwGroup) pwGroup.style.display = '';
    if (isActiveGroup) isActiveGroup.style.display = 'none';
    // Clear fields
    ['uf_user', 'uf_name', 'uf_email', 'uf_pass', 'uf_pass2'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = '';
    });
    (document.querySelector('input[name="uf_role"][value="operator"]') as HTMLInputElement)!.checked = true;
    document.getElementById('userModal')?.classList.add('active');
  }

  private openEditModal(id: string): void {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    this.editingUserId = id;
    const titleEl = document.getElementById('userModalTitle');
    const userGroup = document.getElementById('usernameGroup');
    const pwGroup = document.getElementById('passwordGroup');
    const isActiveGroup = document.getElementById('isActiveGroup');
    if (titleEl) titleEl.textContent = `SỬA TÀI KHOẢN — ${user.username}`;
    if (userGroup) userGroup.style.display = 'none'; // không cho sửa username
    if (pwGroup) pwGroup.style.display = 'none'; // đổi pw qua modal riêng
    if (isActiveGroup) isActiveGroup.style.display = '';
    // Fill fields
    (document.getElementById('uf_name') as HTMLInputElement).value = user.fullName || '';
    (document.getElementById('uf_email') as HTMLInputElement).value = user.email || '';
    (document.getElementById('uf_isActive') as HTMLInputElement).checked = user.isActive;
    const roleRadio = document.querySelector(`input[name="uf_role"][value="${user.role}"]`) as HTMLInputElement;
    if (roleRadio) roleRadio.checked = true;
    document.getElementById('userModal')?.classList.add('active');
  }

  private openChangePasswordModal(id: string): void {
    this.editingUserId = id;
    (document.getElementById('pw_new') as HTMLInputElement).value = '';
    (document.getElementById('pw_confirm') as HTMLInputElement).value = '';
    document.getElementById('pwModal')?.classList.add('active');
  }

  private bindEvents(): void {
    const closeUserModal = () => {
      document.getElementById('userModal')?.classList.remove('active');
      this.editingUserId = null;
    };
    const closePwModal = () => {
      document.getElementById('pwModal')?.classList.remove('active');
    };

    document.getElementById('addUserBtn')?.addEventListener('click', () => this.openAddModal());
    document.getElementById('userModalClose')?.addEventListener('click', closeUserModal);
    document.getElementById('userModalCancel')?.addEventListener('click', closeUserModal);
    document.getElementById('pwModalClose')?.addEventListener('click', closePwModal);
    document.getElementById('pwModalCancel')?.addEventListener('click', closePwModal);

    // Save user (add or edit)
    document.getElementById('userModalSave')?.addEventListener('click', async () => {
      const name  = (document.getElementById('uf_name') as HTMLInputElement).value.trim();
      const email = (document.getElementById('uf_email') as HTMLInputElement).value.trim();
      const role  = (document.querySelector('input[name="uf_role"]:checked') as HTMLInputElement)?.value || 'operator';

      if (this.editingUserId) {
        // Edit mode
        const isActive = (document.getElementById('uf_isActive') as HTMLInputElement).checked;
        try {
          await stationApi.updateUser(this.editingUserId, { fullName: name, email, role, isActive });
          this.showToast('Cập nhật tài khoản thành công', 'success');
          closeUserModal();
          await this.loadUsers();
        } catch (e) {
          this.showToast(`Lỗi: ${(e as Error).message}`, 'error');
        }
      } else {
        // Add mode
        const username = (document.getElementById('uf_user') as HTMLInputElement).value.trim();
        const pass  = (document.getElementById('uf_pass') as HTMLInputElement).value;
        const pass2 = (document.getElementById('uf_pass2') as HTMLInputElement).value;

        if (!username) { this.showToast('Vui lòng nhập tên đăng nhập', 'error'); return; }
        if (pass !== pass2) { this.showToast('Mật khẩu xác nhận không khớp', 'error'); return; }
        if (pass.length < 6) { this.showToast('Mật khẩu phải ít nhất 6 ký tự', 'error'); return; }

        try {
          await stationApi.createUser({ username, password: pass, fullName: name, email, role });
          this.showToast(`Đã thêm tài khoản "${username}" thành công`, 'success');
          closeUserModal();
          await this.loadUsers();
        } catch (e) {
          this.showToast(`Lỗi: ${(e as Error).message}`, 'error');
        }
      }
    });

    // Change password
    document.getElementById('pwModalSave')?.addEventListener('click', async () => {
      if (!this.editingUserId) return;
      const newPw  = (document.getElementById('pw_new') as HTMLInputElement).value;
      const confirm2 = (document.getElementById('pw_confirm') as HTMLInputElement).value;
      if (newPw !== confirm2) { this.showToast('Mật khẩu xác nhận không khớp', 'error'); return; }
      if (newPw.length < 6) { this.showToast('Mật khẩu phải ít nhất 6 ký tự', 'error'); return; }
      try {
        await stationApi.changePassword(this.editingUserId, { newPassword: newPw });
        this.showToast('Đổi mật khẩu thành công', 'success');
        closePwModal();
      } catch (e) {
        this.showToast(`Lỗi: ${(e as Error).message}`, 'error');
      }
    });
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  destroy(): void { /* nothing to cleanup */ }
}



import { GO2RTC_URL } from '@/utils/env';

// ============================================================
// MultisitePage – D13: Tổng quan Đa trạm (stub)
// ============================================================

export class MultisitePage {
  private map: any;
  // TODO: load từ GET /api/v1/stations
  private stations: { id: string; name: string; lat: number; lng: number; status: string; kpi: { temp: number; pd: number; alerts: number; devices: string }; cameraSrc: string }[] = [];

  render(): string {
    return `
    <div style="position:relative; width:100%; height:100%; overflow:hidden; background:#0a0e14;">

      <!-- Bản đồ full screen -->
      <div id="multisiteMap" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:1;"></div>

      <!-- Header nổi góc trái -->
      <div style="position:absolute; top:15px; left:15px; z-index:1000;
                  background:rgba(15,23,42,0.85); backdrop-filter:blur(12px);
                  padding:8px 16px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
                  display:flex; align-items:center; gap:12px;">
        <span style="font-size:0.85rem; font-weight:800; color:#fff; letter-spacing:1px;">🗺️ TỔNG QUAN ĐA TRẠM</span>
      </div>

      <!-- Station cards nổi phía dưới -->
      <div style="position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
                  width:95%; max-width:1300px; z-index:1000;
                  display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
        ${this.stations.map(s => {
      const isWarn = s.status === 'WARNING';
      const borderColor = isWarn ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)';
      return `
          <div style="background:rgba(15,23,42,0.92); backdrop-filter:blur(12px);
                      border:1px solid ${borderColor}; border-radius:14px; padding:14px;
                      box-shadow:0 8px 32px rgba(0,0,0,0.6); transition:transform 0.2s;"
               onmouseover="this.style.transform='translateY(-4px)'"
               onmouseout="this.style.transform='translateY(0)'">

            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center;
                        margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="font-weight:800; font-size:0.85rem; color:#fff;">${s.name}</span>
              <span style="font-size:0.62rem; font-weight:900; padding:3px 8px; border-radius:4px;
                           background:${isWarn ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)'};
                           color:${isWarn ? '#ef4444' : '#10b981'};">
                ${isWarn ? '⚠️ CẢNH BÁO' : '🟢 ONLINE'}
              </span>
            </div>

            <!-- KPI 2x2 -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
              <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:8px 10px;">
                <div style="font-size:0.62rem; color:#64748b; margin-bottom:2px;">🌡️ Nhiệt độ cao nhất</div>
                <div style="font-size:1.1rem; font-weight:800; color:${s.kpi.temp > 40 ? '#ef4444' : '#f8fafc'};">
                  ${s.kpi.temp}°C
                </div>
              </div>
              <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:8px 10px;">
                <div style="font-size:0.62rem; color:#64748b; margin-bottom:2px;">⚡ Sự kiện PD</div>
                <div style="font-size:1.1rem; font-weight:800; color:${s.kpi.pd > 5 ? '#f59e0b' : '#f8fafc'};">
                  ${s.kpi.pd}
                </div>
              </div>
              <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:8px 10px;">
                <div style="font-size:0.62rem; color:#64748b; margin-bottom:2px;">🔔 Cảnh báo chưa xử lý</div>
                <div style="font-size:1.1rem; font-weight:800; color:${s.kpi.alerts > 0 ? '#ef4444' : '#f8fafc'};">
                  ${s.kpi.alerts}
                </div>
              </div>
              <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:8px 10px;">
                <div style="font-size:0.62rem; color:#64748b; margin-bottom:2px;">📡 Thiết bị online</div>
                <div style="font-size:1.1rem; font-weight:800; color:#f8fafc;">${s.kpi.devices}</div>
              </div>
            </div>

            <!-- Nút vào trạm -->
            <button onclick="window.router.navigate('dashboard', { stationId: '${s.id}', stationName: '${s.name}' })"
                    style="width:100%; padding:8px; border:none; border-radius:8px; cursor:pointer;
                           background:rgba(14,165,233,0.2); color:#38bdf8; font-weight:800;
                           font-size:0.75rem; border:1px solid rgba(14,165,233,0.3);
                           transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(14,165,233,0.35)'"
                    onmouseout="this.style.background='rgba(14,165,233,0.2)'">
              VÀO TRẠM →
            </button>
          </div>`
    }).join('')}
      </div>

    </div>`;
  }

  mount(): void {
    const L = (window as any).L;
    if (!L) return;
    this.map = L.map('multisiteMap', { zoomControl: false }).setView([10.7769, 106.7009], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(this.map);

    this.stations.forEach(s => {
      const isWarning = s.status === 'WARNING';
      const markerIcon = L.divIcon({
        className: 'custom-gis-marker',
        html: `<div class="marker-ping-v3 ${isWarning ? 'pulse-red' : ''}"></div><div class="marker-label-v3">${s.id}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      const marker = L.marker([s.lat, s.lng], { icon: markerIcon }).addTo(this.map);
      marker.bindPopup(`
        <div class="gis-popup" style="width: 240px; color: #fff;">
          <h4 style="margin: 0 0 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">${s.name}</h4>
          <div class="gis-popup-v3-cam">
             <iframe src="${GO2RTC_URL}/stream.html?src=${s.cameraSrc}&mode=mse"></iframe>
          </div>
          <button class="btn-industrial btn-primary" style="width:100%;" onclick="window.router.navigate('dashboard', { stationId: '${s.id}', stationName: '${s.name}' })">CHI TIẾT TRẠM</button>
        </div>
      `);
    });

    // Fix: Force redraw map because of early mount
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
  }


  destroy(): void {
    if (this.map) { this.map.remove(); this.map = null; }
  }
}

// RuleEnginePage đã chuyển sang RuleEnginePage.ts
