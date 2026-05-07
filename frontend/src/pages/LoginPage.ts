// ============================================================
// LoginPage – Trang Đăng nhập (D01)
// ============================================================

import { authService } from '@/services/AuthService';
import { router } from '@/router/Router';

export class LoginPage {
  render(): string {
    return `
    <style>
      .gm-login-wrapper {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: url('/slide2.png') no-repeat center center fixed;
        background-color: #0f172a;
        background-size: cover;
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
      }
      .gm-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.6); z-index: 1;
      }
      .gm-glass-panel {
        position: relative; z-index: 2;
        width: 380px; padding: 40px;
        background: rgba(255, 255, 255, 0.05); 
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); 
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); 
        text-align: center; color: #ffffff;
      }
      .gm-logo {
        width: 90px; height: 90px; margin: 0 auto 20px;
        filter: drop-shadow(0 0 15px rgba(68, 255, 136, 0.5));
      }
      .gm-glass-panel h2 { 
        margin: 0 0 8px; font-size: 20px; font-weight: 700; 
        text-transform: uppercase; letter-spacing: 1px;
        color: #44ff88; text-shadow: 0 0 10px rgba(68, 255, 136, 0.5); 
      }
      .gm-slogan {
        margin: 0 0 28px;
        font-size: 12px;
        color: rgba(255,255,255,0.55);
        font-style: italic;
        letter-spacing: 0.5px;
        line-height: 1.6;
        border-top: 1px solid rgba(255,255,255,0.1);
        padding-top: 10px;
        margin-top: 4px;
      }
      .gm-input-group { margin-bottom: 25px; text-align: left; }
      .gm-input-group label { display: block; font-size: 12px; margin-bottom: 8px; color: #cbd5e1; font-weight: 600; text-transform: uppercase; }
      .gm-input-group input {
        width: 100%; box-sizing: border-box; padding: 14px 15px;
        background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px; color: white; font-size: 16px; transition: 0.3s;
      }
      .gm-input-group input:focus {
        outline: none; border-color: #44ff88; background: rgba(0, 0, 0, 0.6);
        box-shadow: 0 0 12px rgba(68, 255, 136, 0.3);
      }
      .gm-btn-login {
        width: 100%; padding: 14px;
        background: linear-gradient(135deg, #0284c7, #2563eb); 
        border: none; border-radius: 8px;
        color: white; font-size: 15px; font-weight: bold; cursor: pointer;
        text-transform: uppercase; letter-spacing: 1px; transition: 0.3s; margin-top: 10px;
      }
      .gm-btn-login:hover {
        box-shadow: 0 5px 20px rgba(37, 99, 235, 0.6); transform: translateY(-2px); 
      }
      .gm-error {
        color: #ff4444; font-size: 13px; margin-bottom: 15px; background: rgba(255,0,0,0.1); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,0,0,0.3);
      }
      .gm-pw-wrap { position: relative; }
      .gm-pw-wrap input { padding-right: 44px; }
      .gm-eye-btn {
        position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: rgba(255,255,255,0.4); font-size: 18px; padding: 4px;
        transition: color 0.2s;
        line-height: 1;
      }
      .gm-eye-btn:hover { color: rgba(255,255,255,0.9); }
    </style>
    <div class="gm-login-wrapper">
      <div class="gm-overlay"></div>
      <div class="gm-glass-panel">
        <img src="/favico/logo.svg" alt="Station Monitor Logo" class="gm-logo">
        <h2>Hệ Thống Giám Sát</h2>
        <p class="gm-slogan">"Giám sát liên tục — Phát hiện sớm — Cảnh báo đúng lúc"</p>

        <div id="loginError" class="gm-error" style="display:none"></div>

        <form id="loginForm" autocomplete="off">
          <div class="gm-input-group">
            <label>Tên đăng nhập</label>
            <input type="text" id="loginUsername" placeholder="Ví dụ: admin" required>
          </div>
          <div class="gm-input-group">
            <label>Mật khẩu</label>
            <div class="gm-pw-wrap">
              <input type="password" id="loginPassword" placeholder="••••••••" required>
              <button type="button" id="togglePwBtn" class="gm-eye-btn" title="Hiện/Ẩn mật khẩu">
                <svg id="eyeIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="gm-input-group">
            <label>License Key</label>
            <input type="text" id="loginLicenseKey" placeholder="SM-XXXX-XXXX-XXXX" required style="letter-spacing: 0.1em; text-transform: uppercase;">
          </div>
          <button type="submit" id="loginBtn" class="gm-btn-login">
            <span id="loginBtnText">ĐĂNG NHẬP</span>
            <span id="loginBtnSpinner" style="display:none">⏳</span>
          </button>
        </form>
      </div>
    </div>`;
  }

  mount(): void {
    // Toggle password visibility
    document.getElementById('togglePwBtn')?.addEventListener('click', () => {
      const inp = document.getElementById('loginPassword') as HTMLInputElement;
      const icon = document.getElementById('eyeIcon')!;
      const isHidden = inp.type === 'password';
      inp.type = isHidden ? 'text' : 'password';
      // Đổi icon: mắt mở → mắt gạch (eye-off)
      icon.innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    });

    // Form submit
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('loginUsername') as HTMLInputElement).value.trim();
      const password = (document.getElementById('loginPassword') as HTMLInputElement).value;
      const licenseKey = (document.getElementById('loginLicenseKey') as HTMLInputElement).value.trim();
      const errorEl = document.getElementById('loginError')!;
      const btn = document.getElementById('loginBtn') as HTMLButtonElement;
      const btnText = document.getElementById('loginBtnText')!;
      const btnSpinner = document.getElementById('loginBtnSpinner')!;

      if (!licenseKey) {
        errorEl.textContent = 'License key là bắt buộc';
        errorEl.style.display = 'block';
        return;
      }

      // Loading state
      btn.disabled = true;
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline';
      errorEl.style.display = 'none';

      // Simulate async (future: Tauri invoke)
      await new Promise(r => setTimeout(r, 600));

      const result = await authService.login(username, password, licenseKey);

      btn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';

      if (result.success) {
        // Lưu license key vào localStorage để auto-fill lần sau
        localStorage.setItem('station_license_key', licenseKey);
        router.navigate('dashboard');
      } else {
        errorEl.textContent = result.error || 'Đăng nhập thất bại';
        errorEl.style.display = 'block';
        // Shake animation
        errorEl.classList.remove('shake');
        void errorEl.offsetWidth; // reflow
        errorEl.classList.add('shake');
      }
    });

    // Enter key
    document.getElementById('loginPassword')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        (document.getElementById('loginForm') as HTMLFormElement)?.requestSubmit();
      }
    });

    // Auto-format license key: uppercase, add dashes
    document.getElementById('loginLicenseKey')?.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      let value = inp.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      // Auto-insert dashes: SM-XXXX-XXXX-XXXX
      if (value.length > 0) {
        value = value.replace(/^([A-Z]{2})-?/, '$1-');
        if (value.length > 8) value = value.substring(0, 8) + '-' + value.substring(8);
        if (value.length > 13) value = value.substring(0, 13) + '-' + value.substring(13);
        if (value.length > 18) value = value.substring(0, 18);
      }
      inp.value = value;
    });

    // Restore saved license key
    const savedLicenseKey = localStorage.getItem('station_license_key');
    if (savedLicenseKey) {
      (document.getElementById('loginLicenseKey') as HTMLInputElement).value = savedLicenseKey;
    }

    // Focus username on load
    setTimeout(() => (document.getElementById('loginUsername') as HTMLInputElement)?.focus(), 100);
  }
}
