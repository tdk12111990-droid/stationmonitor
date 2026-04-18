@echo off
title StationMonitor - Khoi dong he thong
echo.
echo  ================================================
echo   STATION MONITOR - KHOI DONG HE THONG (EXEC MODE)
echo  ================================================
echo.

cd /d "%~dp0"

echo [1/4] Kiem tra go2rtc...
netstat -ano | findstr "LISTENING" | findstr ":1984" >nul 2>&1
if %errorlevel%==0 (
    echo  go2rtc dang chay - bo qua
) else (
    echo  Khoi dong go2rtc...
    start "go2rtc" cmd /k "cd /d "%~dp0frontend" && bin\go2rtc.exe -config go2rtc.yaml"
    timeout /t 2 /nobreak >nul
)

echo [2/4] Kiem tra Backend API...
netstat -ano | findstr "LISTENING" | findstr ":5056" >nul 2>&1
if %errorlevel%==0 (
    echo  Backend dang chay tren port 5056 - bo qua
) else (
    echo  Khoi dong Backend...
    start "Backend API" cmd /k "cd /d "%~dp0backend\StationMonitor.Api" && dotnet run"
    timeout /t 5 /nobreak >nul
)

echo [3/4] Kiem tra Local API Sidecar...
netstat -ano | findstr "LISTENING" | findstr ":46123" >nul 2>&1
if %errorlevel%==0 (
    echo  Sidecar dang chay - bo qua
) else (
    echo  Khoi dong Sidecar...
    start "Sidecar" cmd /k "cd /d "%~dp0frontend" && node src-tauri/sidecar/local-api-server.mjs --port 46123"
    timeout /t 2 /nobreak >nul
)

echo [3.5/4] Khoi dong AI Stream Relay...
cd /d "%~dp0"
echo  Khoi dong AI Engine (Stream Relay)...
start "AI Stream Relay" cmd /k "cd /d "%~dp0backend\StationMonitor.Api\AI" && python enhanced_relay.py"
timeout /t 3 /nobreak >nul

echo [4/4] Khoi dong Frontend...
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  ================================================
echo   TAT CA SERVICE DA KHOI DONG!
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:5056
echo   go2rtc   : http://localhost:1984
echo.
echo   * Chế độ Enhanced Viewer tự động kích hoạt
echo     khi bạn xem Camera 152 trên Web.
echo  ================================================
echo.
echo   Dang mo trinh duyet...
timeout /t 2 /nobreak >nul
start http://localhost:5173
echo.
pause
