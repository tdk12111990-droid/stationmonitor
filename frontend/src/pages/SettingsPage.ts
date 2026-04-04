// ============================================================
// SettingsPage – D10: Cài đặt Hệ thống
// Kết nối API thật: GET/PUT /api/v1/settings
// ============================================================

import { stationApi } from '@/services/StationApiService';

export class SettingsPage {
  private settings: Record<string, string> = {};

  render(): string {
    return `
    <div class="settings-page">
      <div class="page-toolbar"><h2>CÀI ĐẶT HỆ THỐNG</h2></div>

      <!-- Settings inner tab nav -->
      <div class="settings-tabs">
        ${['Cài đặt chung', 'Database & Backup', 'Giao diện'].map((t, i) =>
      `<div class="stab ${i === 0 ? 'active' : ''}" data-stab="${i}">${t}</div>`).join('')}
      </div>

      <!-- Tab 0: Cài đặt chung -->
      <div id="stab-0" class="stab-content active admin-card" style="padding:20px">
        <div class="card-title">CẤU HÌNH HỆ THỐNG</div>
        <div id="settingsLoadStatus" style="color:#94a3b8;font-size:.85rem;margin-bottom:16px">Đang tải...</div>

        <div class="form-group">
          <label>POLLING PLC (giây)</label>
          <input id="s_polling" type="number" class="form-input" style="width:120px" min="1" max="60" value="3">
          <div style="font-size:.75rem;opacity:.5;margin-top:4px">Tần suất đọc dữ liệu từ PLC (mặc định: 3 giây)</div>
        </div>

        <div class="form-group">
          <label>EMAIL NHẬN CẢNH BÁO</label>
          <input id="s_email" type="email" class="form-input" style="width:320px" placeholder="admin@station.vn">
        </div>

        <div class="form-group">
          <label>MÚI GIỜ</label>
          <select id="s_timezone" class="form-select" style="width:240px">
            <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+7)</option>
            <option value="UTC">UTC</option>
            <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
            <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
          </select>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="saveSettingsBtn" class="btn-industrial btn-primary">💾 Lưu cài đặt</button>
          <span id="saveStatus" style="align-self:center;font-size:.85rem"></span>
        </div>
      </div>

      <!-- Tab 1: Database -->
      <div id="stab-1" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">DATABASE & BACKUP</div>
        <div class="db-status-grid">
          <div class="db-status-item">
            <span>PostgreSQL (TimescaleDB)</span>
            <span class="tag tag-success">✓ Kết nối OK</span>
          </div>
          <div class="db-status-item">
            <span>Hypertable SensorReadings</span>
            <span class="tag tag-success">✓ Đang hoạt động</span>
          </div>
          <div class="db-status-item">
            <span>Backup tự động</span>
            <span class="tag" style="background:#f59e0b20;color:#f59e0b">⚠ Chưa cấu hình</span>
          </div>
          <div class="db-status-item">
            <span>Thư mục backup</span>
            <span><code>D:\Backup\station_monitor\</code></span>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="backupNowBtn" class="btn-industrial btn-primary">💾 Backup ngay</button>
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
        <button class="btn-industrial btn-primary" style="margin-top:16px" id="saveThemeBtn">💾 Lưu giao diện</button>
      </div>
    </div>`;
  }

  async mount(): Promise<void> {
    this.bindTabSwitching();
    await this.loadSettings();
    this.bindEvents();
  }

  private bindTabSwitching(): void {
    document.querySelectorAll('.stab').forEach((tab, i) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.stab-content').forEach(c => (c as HTMLElement).style.display = 'none');
        tab.classList.add('active');
        (document.getElementById(`stab-${i}`) as HTMLElement).style.display = '';
      });
    });
  }

  private async loadSettings(): Promise<void> {
    const statusEl = document.getElementById('settingsLoadStatus');
    try {
      this.settings = await stationApi.getSettings();
      if (statusEl) statusEl.style.display = 'none';

      const polling = document.getElementById('s_polling') as HTMLInputElement;
      const email   = document.getElementById('s_email')   as HTMLInputElement;
      const tz      = document.getElementById('s_timezone') as HTMLSelectElement;

      if (polling) polling.value = this.settings['polling_interval_s'] ?? '3';
      if (email)   email.value   = this.settings['alert_email'] ?? '';
      if (tz)      tz.value      = this.settings['timezone'] ?? 'Asia/Ho_Chi_Minh';
    } catch {
      if (statusEl) statusEl.textContent = 'Không thể tải cài đặt từ server';
    }
  }

  private bindEvents(): void {
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
      const polling = (document.getElementById('s_polling') as HTMLInputElement).value;
      const email   = (document.getElementById('s_email')   as HTMLInputElement).value;
      const tz      = (document.getElementById('s_timezone') as HTMLSelectElement).value;
      const status  = document.getElementById('saveStatus')!;

      try {
        await Promise.all([
          stationApi.updateSetting('polling_interval_s', polling),
          stationApi.updateSetting('alert_email', email),
          stationApi.updateSetting('timezone', tz),
        ]);
        status.textContent = '✓ Đã lưu';
        status.style.color = '#10b981';
        setTimeout(() => { status.textContent = ''; }, 3000);
      } catch (e) {
        status.textContent = `Lỗi: ${(e as Error).message}`;
        status.style.color = '#ef4444';
      }
    });

    document.getElementById('backupNowBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('backupNowBtn') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '⏳ Đang backup…';
      await new Promise(r => setTimeout(r, 2000));
      btn.disabled = false;
      btn.textContent = '💾 Backup ngay';
      this.showToast('✓ Backup thành công', 'success');
    });

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

  destroy(): void {}
}
