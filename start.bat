@echo off
title StationMonitor - Khoi dong he thong
echo.
echo  ================================================
echo   STATION MONITOR - KHOI DONG HE THONG
echo  ================================================
echo.

cd /d "%~dp0"

echo [1/4] Kiem tra go2rtc...
netstat -ano | findstr "LISTENING" | findstr ":1984" >nul 2>&1
if %errorlevel%==0 (
    echo  go2rtc dang chay - bo qua
) else (
    echo  Khoi dong go2rtc...
    start "go2rtc" /d "%~dp0media-server" cmd /k go2rtc.exe -config go2rtc.yaml
    timeout /t 2 /nobreak >nul
)

echo [2/4] Kiem tra Backend API...
netstat -ano | findstr "LISTENING" | findstr ":5056" >nul 2>&1
if %errorlevel%==0 (
    echo  Backend dang chay tren port 5056 - bo qua
) else (
    echo  Khoi dong Backend...
    start "Backend API" /d "%~dp0backend\StationMonitor.Api" cmd /k dotnet run
    timeout /t 5 /nobreak >nul
)

echo [3/4] Kiem tra Local API Sidecar...
netstat -ano | findstr "LISTENING" | findstr ":46123" >nul 2>&1
if %errorlevel%==0 (
    echo  Sidecar dang chay - bo qua
) else (
    echo  Khoi dong Sidecar...
    start "Sidecar" /d "%~dp0frontend" cmd /k node src-tauri/sidecar/local-api-server.mjs --port 46123
    timeout /t 2 /nobreak >nul
)

echo [3.5/4] Khoi dong AI Stream Relay...
start "AI Stream Relay" /d "%~dp0sdk-relay" cmd /k python enhanced_relay.py
timeout /t 3 /nobreak >nul

echo [3.7/4] Khoi dong Camera Notification System...
start "Camera Notifications" /d "%~dp0sdk-relay\notifications" cmd /k python main.py
timeout /t 2 /nobreak >nul

echo [4/4] Khoi dong Frontend...
start "Frontend" /d "%~dp0frontend" cmd /k npm run dev

echo.
echo  ================================================
echo   TAT CA SERVICE DA KHOI DONG!
echo.
echo   Frontend              : http://localhost:5173
echo   Backend API           : http://localhost:5056
echo   go2rtc                : http://localhost:1984
echo   AI Stream Relay       : sdk-relay (enhanced_relay.py)
echo   Camera Notifications  : sdk-relay/notifications (main.py)
echo.
echo   * Thong bao Camera (Thermal + Acoustic) tu dong
echo     duoc cap nhat tren Dashboard va AlertsHistory
echo   * Enhanced Viewer kich hoat khi xem Camera 152
echo  ================================================
echo.
echo   Dang mo trinh duyet...
timeout /t 2 /nobreak >nul
start http://localhost:5173
echo.
pause
