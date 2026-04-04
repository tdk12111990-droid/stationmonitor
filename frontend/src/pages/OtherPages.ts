// ============================================================
// UserManagementPage – D09: Quản lý Người dùng (stub)
// ============================================================

// TODO: load từ GET /api/v1/users

export class UserManagementPage {
  render(): string {
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>QUẢN LÝ NGƯỜI DÙNG</h2>
        <button id="addUserBtn" class="btn-industrial btn-primary">+ Thêm tài khoản</button>
      </div>
      <div class="admin-card" style="padding:0">
        <table class="data-table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
          <tbody>
            <tr><td colspan="6" style="text-align:center;color:#475569;padding:32px">Chưa có dữ liệu — kết nối backend để tải danh sách người dùng</td></tr>
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

    <div id="userModal" class="modal-overlay">
      <div class="modal-content" style="width:520px">
        <div class="modal-header">
          <h3>THÊM TÀI KHOẢN</h3>
          <button id="userModalClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group"><label>Họ tên</label><input id="uf_name" type="text" class="form-input" placeholder="Nguyễn Văn A"></div>
          <div class="form-group"><label>Tên đăng nhập</label><input id="uf_user" type="text" class="form-input" placeholder="nguyen.va"></div>
          <div class="form-group"><label>Email</label><input id="uf_email" type="email" class="form-input" placeholder="user@station.vn"></div>
          <div class="form-grid-2">
            <div class="form-group"><label>Mật khẩu</label><input id="uf_pass" type="password" class="form-input" placeholder="••••••••"></div>
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

          <div class="form-group" style="margin-top:8px">
            <label>Nhận thông báo</label>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
              <label class="checkbox-label"><input type="checkbox" checked> Push notification</label>
              <label class="checkbox-label"><input type="checkbox" checked> Email khi CRITICAL</label>
              <label class="checkbox-label"><input type="checkbox"> SMS khi CRITICAL</label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="userModalCancel" class="btn-industrial">Hủy</button>
          <button id="userModalSave" class="btn-industrial btn-primary">Lưu tài khoản</button>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    const modal = document.getElementById('userModal');
    const closeModal = () => modal?.classList.remove('active');

    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      modal?.classList.add('active');
    });
    document.getElementById('userModalClose')?.addEventListener('click', closeModal);
    document.getElementById('userModalCancel')?.addEventListener('click', closeModal);

    // Save button — validate and add user to table
    document.getElementById('userModalSave')?.addEventListener('click', () => {
      const name = (document.getElementById('uf_name') as HTMLInputElement)?.value.trim();
      const user = (document.getElementById('uf_user') as HTMLInputElement)?.value.trim();
      const email = (document.getElementById('uf_email') as HTMLInputElement)?.value.trim();
      const pass = (document.getElementById('uf_pass') as HTMLInputElement)?.value;
      const pass2 = (document.getElementById('uf_pass2') as HTMLInputElement)?.value;
      const role = (document.querySelector('input[name="uf_role"]:checked') as HTMLInputElement)?.value || 'operator';

      if (!name || !user || !email) { alert('Vui lòng điền đầy đủ thông tin!'); return; }
      if (pass !== pass2) { alert('Mật khẩu xác nhận không khớp!'); return; }
      if (pass.length < 6) { alert('Mật khẩu phải ít nhất 6 ký tự!'); return; }

      // Add row to table
      const tbody = document.querySelector('.data-table tbody');
      if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><b>${name}</b></td>
          <td><code>${user}</code></td>
          <td>${email}</td>
          <td><span class="tag tag-role-${role}">${role.toUpperCase()}</span></td>
          <td><span class="tag tag-success">🟢 Hoạt động</span></td>
          <td>
            <button class="btn-industrial btn-sm">✏</button>
            <button class="btn-industrial btn-sm btn-danger">🗑</button>
          </td>`;
        tbody.appendChild(tr);
      }

      closeModal();
      // Show success toast
      const toast = document.createElement('div');
      toast.className = 'toast toast-success';
      toast.textContent = `✅ Đã thêm tài khoản "${name}" thành công!`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('toast-show'));
      setTimeout(() => { toast.classList.remove('toast-show'); setTimeout(() => toast.remove(), 300); }, 3000);
    });

    // Unlock button
    document.querySelectorAll('.unlock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = (btn as HTMLElement).closest('tr');
        const tag = row?.querySelector('.tag-danger');
        if (tag) { tag.classList.replace('tag-danger', 'tag-success'); tag.textContent = '🟢 Hoạt động'; }
        btn.remove();
      });
    });
  }
}

// ============================================================
// SystemStatusPage – D07: Trạng thái Hệ thống  
// ============================================================

import { getSystemMetrics } from '@/services/MockDataService';
import { loadScadaPoints } from '@/services/storage';
import { GO2RTC_URL } from '@/utils/env';

export class SystemStatusPage {
  private updateInterval?: ReturnType<typeof setInterval>;

  render(): string {
    const m = getSystemMetrics();
    const pct = (v: number, max: number) => Math.round(v / max * 100);
    return `
    <div class="status-page" style="display:flex;flex-direction:column;gap:20px">
      <div class="page-toolbar"><h2>TRẠNG THÁI HỆ THỐNG</h2></div>

      <!-- Resource row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        ${[
        { label: 'CPU', value: m.cpu_percent, max: 100, unit: '%', color: m.cpu_percent > 80 ? '#ef4444' : '#10b981' },
        { label: 'RAM', value: m.ram_used_gb, max: m.ram_total_gb, unit: `GB / ${m.ram_total_gb} GB`, color: '#3b82f6' },
        { label: 'Disk', value: m.disk_used_gb, max: m.disk_total_gb, unit: `GB / ${m.disk_total_gb} GB`, color: '#8b5cf6' },
      ].map(r => `
        <div class="admin-card" style="padding:20px">
          <div class="card-title">${r.label}</div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${pct(r.value, r.max)}%;background:${r.color}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.85rem">
            <span style="color:${r.color};font-weight:700">${pct(r.value, r.max)}%</span>
            <span style="opacity:.5">${r.value} ${r.unit}</span>
          </div>
        </div>`).join('')}
      </div>

      <!-- Connectivity -->
      <div class="admin-card" style="padding:20px">
        <div class="card-title">KẾT NỐI</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
          ${[
        { label: 'PostgreSQL Database', ok: m.db_connected, note: 'localhost:5432' },
        { label: 'Convex Cloud', ok: m.cloud_connected, note: 'production.convex.cloud' },
        { label: 'Lần đồng bộ cuối', ok: true, note: '2 phút trước' },
      ].map(c => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
            <span style="font-size:1.5rem">${c.ok ? '✅' : '❌'}</span>
            <div>
              <div style="font-weight:600;font-size:.9rem">${c.label}</div>
              <div style="font-size:.75rem;opacity:.5">${c.note}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Device Heartbeats -->
      <div class="admin-card" style="padding:20px">
        <div class="card-title" id="healthTitle">HEARTBEAT THIẾT BỊ (Đang tải...)</div>
        <div id="healthDevicesList" style="display:flex;flex-direction:column;gap:8px">
          <div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">Đang tải tín hiệu SCADA...</div>
        </div>
      </div>
    </div>`;
  }

  mount(): void {
    loadScadaPoints().then(points => {
      const title = document.getElementById('healthTitle');
      const list = document.getElementById('healthDevicesList');
      if (!title || !list) return;

      const onCount = points.filter(p => p.status === 'Normal').length;
      title.textContent = `HEARTBEAT THIẾT BỊ (${onCount}/${points.length} online)`;

      if (points.length === 0) {
        list.innerHTML = '<div style="padding:10px;color:#94a3b8;text-align:center">Không có thiết bị kết nối.</div>';
        return;
      }

      list.innerHTML = points.map(p => {
        const isNormal = p.status === 'Normal';
        const pCol = isNormal ? '#10b981' : p.status === 'Warning' ? '#f59e0b' : '#ef4444';
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:3px solid ${pCol}">
            <span style="color:${pCol}">${isNormal ? '🟢' : '🔴'}</span>
            <span style="flex:1;font-weight:600">${p.name} <span class="tag ${isNormal ? 'tag-success' : 'tag-danger'}" style="margin-left:8px;font-size:10px">${p.status}</span></span>
            <span style="font-size:.75rem;opacity:.5">IP: ${p.ipAddress || 'N/A'}</span>
            <span style="font-size:.75rem;opacity:.5">IP: ${p.ipAddress || 'N/A'}</span>
          </div>`;
      }).join('');
    });

    // TODO: cập nhật CPU/RAM từ GET /api/v1/system/metrics
  }

  destroy(): void { if (this.updateInterval) clearInterval(this.updateInterval); }
}


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

// ============================================================
// RuleEnginePage – D14: Cấu hình Rule Engine (stub)
// ============================================================

export class RuleEnginePage {
  render(): string {
    // TODO: load từ GET /api/v1/rules
    const rules: { name: string; condition: string; action: string; on: boolean }[] = [];
    return `
    <div class="list-page">
      <div class="page-toolbar">
        <h2>CẤU HÌNH RULE ENGINE</h2>
        <button class="btn-industrial btn-primary" id="addRuleBtn">+ Tạo Rule mới</button>
      </div>
      <div class="admin-card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>Tên Rule</th><th>Điều kiện (IF)</th><th>Hành động (THEN)</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
          <tbody>
            ${rules.map(r => `
            <tr>
              <td><b>${r.name}</b></td>
              <td><code style="font-size:.8rem;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${r.condition}</code></td>
              <td><span class="tag tag-role-${r.action === 'CRITICAL' ? 'admin' : r.action === 'WARNING' ? 'manager' : 'operator'}">${r.action}</span></td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" ${r.on ? 'checked' : ''} class="rule-toggle">
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td>
                <button class="btn-industrial btn-sm">✏</button>
                <button class="btn-industrial btn-sm btn-danger">🗑</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  mount(): void {
    document.querySelectorAll('.rule-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const on = (e.target as HTMLInputElement).checked;
        const row = (e.target as HTMLElement).closest('tr');
        row?.style.setProperty('opacity', on ? '1' : '0.4');
      });
    });
  }
}
