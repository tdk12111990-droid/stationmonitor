// ============================================================
// SettingsPage – D10: Cài đặt Hệ thống
// ============================================================

import { getSystemMetrics } from '@/services/MockDataService';


export class SettingsPage {
  render(): string {
    const metrics = getSystemMetrics();
    return `
    <div class="settings-page">
      <div class="page-toolbar"><h2>CÀI ĐẶT HỆ THỐNG</h2></div>

      <!-- Settings inner tab nav -->
      <div class="settings-tabs">
        ${['Thông báo', 'Database & Backup', 'Giao diện'].map((t, i) =>
      `<div class="stab ${i === 0 ? 'active' : ''}" data-stab="${i}">${t}</div>`).join('')}
      </div>

      <!-- Tab 0: Thông báo -->
      <div id="stab-0" class="stab-content active admin-card" style="padding:20px">
        <div class="card-title">CẤU HÌNH THÔNG BÁO</div>
        <div class="form-group">
          <label>EMAIL NHẬN CẢNH BÁO</label>
          <div id="emailList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
            <!-- TODO: load danh sách email từ GET /api/v1/system-settings?key=alert_email_list -->
          </div>
          <button id="addEmailBtn" class="btn-industrial">+ Thêm email</button>
        </div>
        <div class="form-group">
          <label>SMS (CHỈ CRITICAL)</label>
          <input type="text" class="form-input" placeholder="Chưa cấu hình" style="width:200px">
        </div>
        <div class="form-group">
          <label>GỬI THÔNG BÁO KHI</label>
          <label class="checkbox-label"><input type="checkbox" checked> WARNING → Email + Desktop</label>
          <label class="checkbox-label"><input type="checkbox" checked> CRITICAL → Email + Desktop + SMS</label>
          <label class="checkbox-label"><input type="checkbox" checked> FIRE_RISK → Tất cả kênh + Còi hú</label>
        </div>
        <button id="testNotifBtn" class="btn-industrial">📨 Gửi thông báo test</button>
        <button class="btn-industrial btn-primary" style="margin-left:8px">💾 Lưu cài đặt thông báo</button>
      </div>

      <!-- Tab 1: Database -->
      <div id="stab-1" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">DATABASE & BACKUP</div>
        <div class="db-status-grid">
          <div class="db-status-item">
            <span>PostgreSQL</span>
            <span class="${metrics.db_connected ? 'tag-success' : 'tag-danger'} tag">
              ${metrics.db_connected ? '✓ Kết nối OK' : '✗ Mất kết nối'}
            </span>
          </div>
          <div class="db-status-item">
            <span>Dung lượng Database</span>
            <span>– (chưa kết nối)</span>
          </div>
          <div class="db-status-item">
            <span>Số bản ghi cảm biến</span>
            <span>– (chưa kết nối)</span>
          </div>
          <div class="db-status-item">
            <span>Backup tự động</span>
            <span class="tag tag-success">✓ Bật – 02:00 AM mỗi ngày</span>
          </div>
          <div class="db-status-item">
            <span>Lần backup cuối</span>
            <span>– (chưa có backup)</span>
          </div>
          <div class="db-status-item">
            <span>Thư mục backup</span>
            <span><code>D:\Backup\station_monitor\</code></span>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="backupNowBtn" class="btn-industrial btn-primary">💾 Backup ngay</button>
          <button class="btn-industrial">📁 Xem thư mục backup</button>
        </div>
      </div>

      <!-- Tab 2: Giao diện -->
      <div id="stab-2" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">CÀI ĐẶT GIAO DIỆN</div>
        <div class="form-group">
          <label>THEME</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[['default', 'Sáng tiêu chuẩn'], ['dark', 'Tối công nghiệp'], ['blue', 'Xanh chuyên nghiệp']].map(([v, l]) => `
            <div class="theme-option" data-theme="${v}">
              <div class="theme-preview" style="background:${v === 'dark' ? '#0f172a' : v === 'blue' ? '#ebf0f7' : '#f3f4f6'};border-color:${v === 'blue' ? '#2563eb' : 'transparent'}"></div>
              <span>${l}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>TỐC ĐỘ CẬP NHẬT BIỂU ĐỒ</label>
          <select class="form-select" style="width:160px">
            <option>1 giây</option>
            <option>2 giây</option>
            <option>5 giây</option>
          </select>
        </div>
        <button class="btn-industrial btn-primary">💾 Lưu giao diện</button>
      </div>

      <!-- Tab 3: Kết nối Backend -->
      <div id="stab-3" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">KẾT NỐI BACKEND</div>
        <p style="font-size:.85rem;opacity:.7;margin-bottom:16px">
          Cấu hình địa chỉ API server để kết nối dữ liệu thật từ backend.
        </p>
        <div class="form-group">
          <label>API SERVER URL</label>
          <input type="text" class="form-input" placeholder="http://192.168.1.x:5000" style="width:300px">
        </div>
        <button class="btn-industrial btn-primary" style="margin-top:12px">💾 Lưu & Kiểm tra kết nối</button>
      </div>
    </div>`;
  }

  mount(): void {
    // Inner tab switching
    document.querySelectorAll('.stab').forEach((tab, i) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.stab-content').forEach(c => (c as HTMLElement).style.display = 'none');
        tab.classList.add('active');
        (document.getElementById(`stab-${i}`) as HTMLElement).style.display = '';
      });
    });

    document.getElementById('addEmailBtn')?.addEventListener('click', () => {
      const list = document.getElementById('emailList')!;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px';
      row.innerHTML = `<input type="email" class="form-input" placeholder="email@domain.com"><button class="btn-industrial btn-sm btn-danger">✕</button>`;
      row.querySelector('button')?.addEventListener('click', () => row.remove());
      list.appendChild(row);
    });

    document.getElementById('testNotifBtn')?.addEventListener('click', () => {
      this.showToast('✓ Đã gửi thông báo test đến tất cả địa chỉ', 'success');
    });

    document.getElementById('backupNowBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('backupNowBtn') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '⏳ Đang backup…';
      await new Promise(r => setTimeout(r, 2000));
      btn.disabled = false;
      btn.textContent = '💾 Backup ngay';
      this.showToast('✓ Backup thành công – 2.4 GB', 'success');
    });


    // Theme switcher
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const theme = (opt as HTMLElement).dataset.theme || 'default';
        const container = document.querySelector('.admin-container');
        container?.classList.remove('theme-blue', 'theme-dark');
        if (theme !== 'default') container?.classList.add(`theme-${theme}`);
        localStorage.setItem('station-theme', theme);
        document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
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
}
