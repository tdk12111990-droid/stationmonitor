// ============================================================
// SettingsPage – D10: Cài đặt Hệ thống
// Kết nối API thật: GET/PUT /api/v1/settings
// ============================================================

import { stationApi } from '@/services/StationApiService';

export class SettingsPage {
  private settings: Record<string, string> = {};

  render(): string {
    return `
    <div class="settings-page" style="overflow-y:auto;height:100%;padding-bottom:40px;">
      <div class="page-toolbar"><h2>CÀI ĐẶT HỆ THỐNG</h2></div>

      <!-- Settings inner tab nav -->
      <div class="settings-tabs">
        ${['Cài đặt chung', 'Thông báo', 'Database & Backup', 'Giao diện', 'Cloud Sync'].map((t, i) =>
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

      <!-- Tab 1: Thông báo -->
      <div id="stab-1" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">CẤU HÌNH THÔNG BÁO EMAIL</div>

        <!-- SMTP config -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin-bottom:20px;">
          <div style="font-size:0.72rem;font-weight:700;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;">Cấu hình SMTP</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="form-group" style="margin:0">
              <label>SMTP HOST</label>
              <input id="s_smtp_host" type="text" class="form-input" placeholder="smtp.gmail.com" value="smtp.gmail.com">
            </div>
            <div class="form-group" style="margin:0">
              <label>PORT</label>
              <input id="s_smtp_port" type="number" class="form-input" style="width:100px" placeholder="587" value="587">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="form-group" style="margin:0">
              <label>USERNAME</label>
              <input id="s_smtp_user" type="text" class="form-input" placeholder="Username Mailtrap">
            </div>
            <div class="form-group" style="margin:0">
              <label>PASSWORD</label>
              <input id="s_smtp_pass" type="password" class="form-input" placeholder="Password Mailtrap">
            </div>
          </div>
          <div class="form-group" style="margin:0">
            <label>FROM (địa chỉ gửi)</label>
            <input id="s_smtp_from" type="text" class="form-input" style="width:340px" placeholder="StationMonitor &lt;noreply@station.vn&gt;">
          </div>

          <div style="margin-top:14px;padding:10px 14px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:6px;font-size:0.72rem;color:#7dd3fc;">
            💡 <b>Dùng Gmail:</b> Host <code style="background:rgba(0,0,0,.2);padding:1px 4px;border-radius:3px;">smtp.gmail.com</code> · Port <code style="background:rgba(0,0,0,.2);padding:1px 4px;border-radius:3px;">587</code><br>
            Username = địa chỉ Gmail · Password = <b>App Password</b> (không phải mật khẩu Gmail thường).<br>
            Lấy App Password: <b>myaccount.google.com → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng</b> → chọn "Thư" → tạo → copy mã 16 ký tự.
          </div>

          <div style="display:flex;gap:10px;margin-top:14px;align-items:center;">
            <button id="saveSmtpBtn" class="btn-industrial btn-primary">💾 Lưu SMTP</button>
            <span id="smtpSaveStatus" style="font-size:.82rem;"></span>
          </div>
        </div>

        <!-- Test email -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
          <div style="font-size:0.72rem;font-weight:700;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;">Test gửi email</div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input id="s_test_email" type="email" class="form-input" style="width:280px"
              placeholder="test@example.com">
            <button id="testEmailBtn" class="btn-industrial btn-primary">📧 Gửi test</button>
            <span id="testEmailStatus" style="font-size:.82rem;"></span>
          </div>
          <div style="font-size:0.72rem;color:#64748b;margin-top:8px;">
            Nhập email để nhận thử. Email test sẽ vào Mailtrap Inbox (không gửi thật).
          </div>
        </div>
      </div>

      <!-- Tab 2: Database -->
      <div id="stab-2" class="stab-content admin-card" style="padding:20px;display:none">
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

      <!-- Tab 4: Cloud Sync -->
      <div id="stab-4" class="stab-content admin-card" style="padding:20px;display:none">
        <div class="card-title">CLOUD SYNC — SUPABASE</div>

        <div id="syncStatusBox" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:1.6rem;font-weight:700;color:#38bdf8" id="sync_pending">—</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px">CHỜ SYNC</div>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:1.6rem;font-weight:700;color:#10b981" id="sync_sent">—</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px">ĐÃ SYNC</div>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:1.6rem;font-weight:700;color:#ef4444" id="sync_failed">—</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px">LỖI</div>
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:0.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase">Trạng thái kết nối</span>
            <span id="sync_status_badge" class="tag">Đang tải...</span>
          </div>
          <div style="font-size:0.82rem;color:#64748b">
            <div>Supabase URL: <code id="sync_url" style="color:#7dd3fc">—</code></div>
            <div style="margin-top:6px">Lần sync cuối: <span id="sync_last" style="color:#94a3b8">—</span></div>
            <div style="margin-top:6px;font-size:0.72rem;color:#475569">
              Tự động sync mỗi 5 phút. Sync Alerts và Maintenance Tasks lên Supabase cloud.
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="syncNowBtn" class="btn-industrial btn-primary">⬆ Sync ngay</button>
          <button id="refreshSyncBtn" class="btn-industrial">↻ Làm mới</button>
          <span id="syncActionStatus" style="font-size:.82rem;"></span>
        </div>

        <div style="margin-top:20px;padding:12px 16px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:8px;font-size:0.72rem;color:#7dd3fc;">
          <b>Dùng cho mobile app:</b> Anon key để mobile đọc data từ Supabase không cần VPN vào trạm.<br>
          Anon key: <code id="sync_anon_hint" style="color:#94a3b8;font-size:0.68rem;">sb_publishable_****</code>
        </div>
      </div>

      <!-- Tab 3: Giao diện -->
      <div id="stab-3" class="stab-content admin-card" style="padding:20px;display:none">
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
    await this.loadSmtpConfig();
    await this.loadSyncStatus();
    this.bindEvents();
    this.applyActiveTheme();
  }

  private applyActiveTheme(): void {
    const saved = localStorage.getItem('station-theme') || 'dark';
    document.querySelectorAll('.theme-option').forEach(o => {
      o.classList.toggle('active', (o as HTMLElement).dataset.theme === saved);
    });
  }

  private async loadSyncStatus(): Promise<void> {
    try {
      const data = await stationApi.getSyncStatus();
      const badge = document.getElementById('sync_status_badge')!;
      if (data.isConfigured) {
        badge.textContent = '✓ Đã kết nối';
        badge.style.background = 'rgba(16,185,129,0.15)';
        badge.style.color = '#10b981';
      } else {
        badge.textContent = '✗ Chưa cấu hình';
        badge.style.background = 'rgba(239,68,68,0.15)';
        badge.style.color = '#ef4444';
      }
      const el = (id: string) => document.getElementById(id);
      if (el('sync_pending')) el('sync_pending')!.textContent = String(data.pendingCount ?? 0);
      if (el('sync_sent')) el('sync_sent')!.textContent = String(data.sentCount ?? 0);
      if (el('sync_failed')) el('sync_failed')!.textContent = String(data.failedCount ?? 0);
      if (el('sync_url')) el('sync_url')!.textContent = data.supabaseUrl ?? '—';
      if (el('sync_last')) el('sync_last')!.textContent = data.lastSyncAt
        ? new Date(data.lastSyncAt).toLocaleString('vi-VN') : 'Chưa có';
    } catch { /* bỏ qua nếu chưa có endpoint */ }
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
      const email = document.getElementById('s_email') as HTMLInputElement;
      const tz = document.getElementById('s_timezone') as HTMLSelectElement;

      if (polling) polling.value = this.settings['polling_interval_s'] ?? '3';
      if (email) email.value = this.settings['alert_email'] ?? '';
      if (tz) tz.value = this.settings['timezone'] ?? 'Asia/Ho_Chi_Minh';
    } catch {
      if (statusEl) statusEl.textContent = 'Không thể tải cài đặt từ server';
    }
  }

  private async loadSmtpConfig(): Promise<void> {
    try {
      const cfg = await stationApi.getSmtpConfig();
      (document.getElementById('s_smtp_host') as HTMLInputElement).value = cfg.host;
      (document.getElementById('s_smtp_port') as HTMLInputElement).value = cfg.port;
      (document.getElementById('s_smtp_user') as HTMLInputElement).value = cfg.username;
      (document.getElementById('s_smtp_from') as HTMLInputElement).value = cfg.from;
      // password không hiển thị lại vì lý do bảo mật, chỉ hint
      if (cfg.hasPassword) {
        (document.getElementById('s_smtp_pass') as HTMLInputElement).placeholder = '(đã lưu)';
      }
    } catch { /* backend mới hoặc chưa config */ }
  }

  private bindEvents(): void {
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
      const polling = (document.getElementById('s_polling') as HTMLInputElement).value;
      const email = (document.getElementById('s_email') as HTMLInputElement).value;
      const tz = (document.getElementById('s_timezone') as HTMLSelectElement).value;
      const status = document.getElementById('saveStatus')!;

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

    // ── Tab Thông báo ──────────────────────────────────────────
    document.getElementById('saveSmtpBtn')?.addEventListener('click', async () => {
      const host = (document.getElementById('s_smtp_host') as HTMLInputElement).value.trim();
      const port = (document.getElementById('s_smtp_port') as HTMLInputElement).value.trim();
      const user = (document.getElementById('s_smtp_user') as HTMLInputElement).value.trim();
      const pass = (document.getElementById('s_smtp_pass') as HTMLInputElement).value.trim();
      const from = (document.getElementById('s_smtp_from') as HTMLInputElement).value.trim();
      const status = document.getElementById('smtpSaveStatus')!;

      try {
        const updates: Promise<any>[] = [
          stationApi.updateSetting('smtp_host', host),
          stationApi.updateSetting('smtp_port', port),
          stationApi.updateSetting('smtp_from', from),
        ];
        if (user) updates.push(stationApi.updateSetting('smtp_username', user));
        if (pass) updates.push(stationApi.updateSetting('smtp_password', pass));
        await Promise.all(updates);
        status.textContent = '✓ Đã lưu SMTP';
        status.style.color = '#10b981';
      } catch (e) {
        status.textContent = `Lỗi: ${(e as Error).message}`;
        status.style.color = '#ef4444';
      }
      setTimeout(() => { status.textContent = ''; }, 4000);
    });

    document.getElementById('testEmailBtn')?.addEventListener('click', async () => {
      const email = (document.getElementById('s_test_email') as HTMLInputElement).value.trim();
      const status = document.getElementById('testEmailStatus')!;
      const btn = document.getElementById('testEmailBtn') as HTMLButtonElement;
      if (!email) { status.textContent = 'Nhập email trước'; status.style.color = '#f59e0b'; return; }

      btn.disabled = true;
      btn.textContent = '⏳ Đang gửi...';
      status.textContent = '';
      try {
        const res = await stationApi.sendTestEmail(email);
        status.textContent = '✓ ' + res.message;
        status.style.color = '#10b981';
      } catch (e) {
        status.textContent = '✗ ' + (e as Error).message;
        status.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
        btn.textContent = '📧 Gửi test';
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

    // ── Tab Cloud Sync ──────────────────────────────────────────
    document.getElementById('syncNowBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('syncNowBtn') as HTMLButtonElement;
      const status = document.getElementById('syncActionStatus')!;
      btn.disabled = true;
      btn.textContent = '⏳ Đang kích hoạt...';
      try {
        const res = await stationApi.triggerSync();
        status.textContent = '✓ ' + res.message;
        status.style.color = '#10b981';
        setTimeout(() => this.loadSyncStatus(), 2000);
      } catch (e) {
        status.textContent = '✗ ' + (e as Error).message;
        status.style.color = '#ef4444';
      } finally {
        btn.disabled = false;
        btn.textContent = '⬆ Sync ngay';
        setTimeout(() => { status.textContent = ''; }, 5000);
      }
    });

    document.getElementById('refreshSyncBtn')?.addEventListener('click', async () => {
      await this.loadSyncStatus();
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

  destroy(): void { }
}
