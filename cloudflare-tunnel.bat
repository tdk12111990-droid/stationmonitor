@echo off
:: ============================================================
:: cloudflare-tunnel.bat — Expose StationMonitor ra internet
:: Yêu cầu: cloudflared đã cài (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
:: Cách dùng: Double-click hoặc chạy từ cmd
:: ============================================================

title StationMonitor — Cloudflare Tunnel

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         CLOUDFLARE TUNNEL - StationMonitor          ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Kiểm tra cloudflared đã cài chưa
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo  [!] cloudflared chưa được cài đặt.
    echo  [i] Tải tại: https://github.com/cloudflare/cloudflared/releases
    echo  [i] Hoặc dùng winget:
    echo      winget install Cloudflare.cloudflared
    echo.
    pause
    exit /b 1
)

echo  [OK] cloudflared đã sẵn sàng.
echo.

:: Kiểm tra backend đang chạy
curl -s http://localhost:5056/api/v1/stations -o nul 2>&1
if errorlevel 1 (
    echo  [!] Backend chưa chạy tại localhost:5056
    echo  [i] Hãy chạy start.bat trước.
    echo.
    pause
    exit /b 1
)
echo  [OK] Backend đang chạy tại localhost:5056.

:: Kiểm tra go2rtc đang chạy
curl -s http://localhost:1984 -o nul 2>&1
if errorlevel 1 (
    echo  [!] go2rtc chưa chạy tại localhost:1984
    echo  [i] Hãy chạy start.bat trước.
    echo.
    pause
    exit /b 1
)
echo  [OK] go2rtc đang chạy tại localhost:1984.
echo.

echo  Chọn chế độ tunnel:
echo  [1] Quick Tunnel (không cần tài khoản, URL ngẫu nhiên, hết hạn sau vài giờ)
echo  [2] Named Tunnel   (cần đăng nhập Cloudflare, URL cố định)
echo.
set /p MODE="Chọn [1/2]: "

if "%MODE%"=="2" goto named_tunnel

:: ── QUICK TUNNEL ──────────────────────────────────────────
:quick_tunnel
echo.
echo  [*] Khởi động Quick Tunnel cho Backend (port 5056)...
echo  [i] URL sẽ hiện sau vài giây. Copy URL backend rồi:
echo      Sửa frontend/.env: VITE_API_URL=https://^<url-backend^>
echo      Sửa frontend/.env: VITE_GO2RTC_URL=https://^<url-go2rtc^>
echo      Rồi rebuild: cd frontend ^&^& npm run build
echo.

:: Mở 2 terminal riêng cho backend và go2rtc tunnel
start "Tunnel: Backend :5056" cmd /k "cloudflared tunnel --url http://localhost:5056"
timeout /t 3 /nobreak >nul
start "Tunnel: go2rtc :1984" cmd /k "cloudflared tunnel --url http://localhost:1984"

echo.
echo  [OK] Đã mở 2 tunnel windows.
echo  [i] Nhìn vào 2 cửa sổ mới để lấy URL tunnel.
echo.
echo  === SAU KHI CÓ URL ===
echo  1. Sửa frontend/.env:
echo       VITE_GO2RTC_URL=https://^<go2rtc-url^>
echo       VITE_API_URL=https://^<backend-url^>
echo  2. Rebuild frontend:
echo       cd frontend
echo       npm run build
echo  3. Serve static (hoặc deploy lên Netlify/Vercel)
echo.
pause
goto end

:: ── NAMED TUNNEL (cần Cloudflare account) ─────────────────
:named_tunnel
echo.
echo  [*] Named Tunnel — Yêu cầu tài khoản Cloudflare
echo.
echo  Bước 1: Đăng nhập Cloudflare
cloudflared login

echo.
echo  Bước 2: Nhập tên tunnel (VD: stationmonitor-home)
set /p TUNNEL_NAME="Tên tunnel: "

echo.
echo  [*] Tạo tunnel "%TUNNEL_NAME%"...
cloudflared tunnel create %TUNNEL_NAME%

echo.
echo  [i] Tạo file config: C:\Users\%USERNAME%\.cloudflared\%TUNNEL_NAME%.yml
echo  [i] Nội dung gợi ý:
echo.
echo  tunnel: %TUNNEL_NAME%
echo  credentials-file: C:\Users\%USERNAME%\.cloudflared\^<tunnel-id^>.json
echo  ingress:
echo    - hostname: api.yourdomain.com
echo      service: http://localhost:5056
echo    - hostname: cam.yourdomain.com
echo      service: http://localhost:1984
echo    - service: http_status:404
echo.
echo  [*] Sau khi tạo config, chạy:
echo      cloudflared tunnel run %TUNNEL_NAME%
echo.
pause

:end
echo.
echo  Đóng cửa sổ này để dừng tất cả tunnel.
