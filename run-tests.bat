@echo off
chcp 65001 >nul
echo ============================================================
echo  STATION MONITOR - SYSTEM HEALTH CHECK
echo  Ngày: %date% %time%
echo ============================================================
echo.

set PASS=0
set FAIL=0
set LOG=D:\StationMonitor\test-results.txt

echo STATION MONITOR - TEST RESULTS > %LOG%
echo Ngày: %date% %time% >> %LOG%
echo ============================================================ >> %LOG%
echo. >> %LOG%

:: ============================================================
:: TEST 1: Frontend TypeScript Compilation
:: ============================================================
echo [TEST 1] Frontend TypeScript Compilation...
cd /d D:\StationMonitor\frontend
call npx tsc --noEmit 2> %TEMP%\tsc_err.txt
if %errorlevel% == 0 (
    echo   ✅ PASS - TypeScript biên dịch thành công
    echo [PASS] TEST 1: Frontend TypeScript Compilation >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - Có lỗi TypeScript
    echo [FAIL] TEST 1: Frontend TypeScript Compilation >> %LOG%
    echo --- Lỗi chi tiết: >> %LOG%
    type %TEMP%\tsc_err.txt >> %LOG%
    echo --- >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 2: Frontend Vite Build
:: ============================================================
echo [TEST 2] Frontend Vite Production Build...
cd /d D:\StationMonitor\frontend
call npm run build 2> %TEMP%\vite_err.txt
if %errorlevel% == 0 (
    echo   ✅ PASS - Vite build thành công
    echo [PASS] TEST 2: Frontend Vite Build >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - Vite build thất bại
    echo [FAIL] TEST 2: Frontend Vite Build >> %LOG%
    echo --- Lỗi chi tiết: >> %LOG%
    type %TEMP%\vite_err.txt >> %LOG%
    echo --- >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 3: Frontend dist folder exists
:: ============================================================
echo [TEST 3] Kiểm tra thư mục dist đã được tạo...
if exist "D:\StationMonitor\frontend\dist\index.html" (
    echo   ✅ PASS - dist/index.html tồn tại
    echo [PASS] TEST 3: dist/index.html exists >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - dist/index.html không tồn tại
    echo [FAIL] TEST 3: dist/index.html missing >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 4: .NET SDK installed
:: ============================================================
echo [TEST 4] Kiểm tra .NET SDK...
dotnet --version > %TEMP%\dotnet_ver.txt 2>&1
if %errorlevel% == 0 (
    set /p DOTNET_VER=<%TEMP%\dotnet_ver.txt
    echo   ✅ PASS - .NET SDK version: %DOTNET_VER%
    echo [PASS] TEST 4: .NET SDK installed >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - .NET SDK chưa được cài đặt
    echo [FAIL] TEST 4: .NET SDK not installed >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 5: Backend Build (dotnet build)
:: ============================================================
echo [TEST 5] Backend .NET Build...
cd /d D:\StationMonitor\backend
dotnet build StationMonitor.sln --nologo -v q 2> %TEMP%\dotnet_err.txt
if %errorlevel% == 0 (
    echo   ✅ PASS - Backend build thành công
    echo [PASS] TEST 5: Backend dotnet build >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - Backend build thất bại
    echo [FAIL] TEST 5: Backend dotnet build >> %LOG%
    echo --- Lỗi chi tiết: >> %LOG%
    type %TEMP%\dotnet_err.txt >> %LOG%
    echo --- >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 6: PostgreSQL service running
:: ============================================================
echo [TEST 6] Kiểm tra PostgreSQL đang chạy...
sc query postgresql-x64-17 >nul 2>&1
if %errorlevel% == 0 (
    sc query postgresql-x64-17 | findstr "RUNNING" >nul 2>&1
    if %errorlevel% == 0 (
        echo   ✅ PASS - PostgreSQL service đang chạy
        echo [PASS] TEST 6: PostgreSQL running >> %LOG%
        set /a PASS+=1
    ) else (
        echo   ❌ FAIL - PostgreSQL service không RUNNING
        echo [FAIL] TEST 6: PostgreSQL not running >> %LOG%
        set /a FAIL+=1
    )
) else (
    sc query postgresql-x64-16 >nul 2>&1
    if %errorlevel% == 0 (
        echo   ✅ PASS - PostgreSQL v16 service tìm thấy
        echo [PASS] TEST 6: PostgreSQL v16 found >> %LOG%
        set /a PASS+=1
    ) else (
        sc query postgresql-x64-15 >nul 2>&1
        if %errorlevel% == 0 (
            echo   ✅ PASS - PostgreSQL v15 service tìm thấy
            echo [PASS] TEST 6: PostgreSQL v15 found >> %LOG%
            set /a PASS+=1
        ) else (
            echo   ⚠️  WARN - Không tìm thấy PostgreSQL service
            echo [WARN] TEST 6: PostgreSQL service not found >> %LOG%
            set /a FAIL+=1
        )
    )
)
echo.

:: ============================================================
:: TEST 7: Backend API connectivity (port 5056)
:: ============================================================
echo [TEST 7] Kiểm tra Backend API (port 5056)...
curl -s -o nul -w "%%{http_code}" http://localhost:5056/api/v1/auth/login > %TEMP%\api_code.txt 2>nul
set /p API_CODE=<%TEMP%\api_code.txt
if "%API_CODE%"=="000" (
    echo   ⚠️  WARN - Backend API chưa chạy (port 5056 không phản hồi)
    echo [WARN] TEST 7: Backend API not running on port 5056 >> %LOG%
    set /a FAIL+=1
) else (
    echo   ✅ PASS - Backend API phản hồi (HTTP %API_CODE%)
    echo [PASS] TEST 7: Backend API responding (HTTP %API_CODE%) >> %LOG%
    set /a PASS+=1
)
echo.

:: ============================================================
:: TEST 8: Key files integrity
:: ============================================================
echo [TEST 8] Kiểm tra các file quan trọng...
set MISSING=0
if not exist "D:\StationMonitor\frontend\src\pages\LoginPage.ts" (set /a MISSING+=1 & echo   ❌ LoginPage.ts missing)
if not exist "D:\StationMonitor\frontend\src\services\AuthService.ts" (set /a MISSING+=1 & echo   ❌ AuthService.ts missing)
if not exist "D:\StationMonitor\frontend\src\components\AppShell.ts" (set /a MISSING+=1 & echo   ❌ AppShell.ts missing)
if not exist "D:\StationMonitor\frontend\src\main.ts" (set /a MISSING+=1 & echo   ❌ main.ts missing)
if not exist "D:\StationMonitor\frontend\public\favico\logo.svg" (set /a MISSING+=1 & echo   ❌ logo.svg missing)
if not exist "D:\StationMonitor\backend\StationMonitor.sln" (set /a MISSING+=1 & echo   ❌ StationMonitor.sln missing)
if not exist "D:\StationMonitor\backend\StationMonitor.Api\Program.cs" (set /a MISSING+=1 & echo   ❌ Program.cs missing)
if not exist "D:\StationMonitor\backend\StationMonitor.Workers\Polling\PlcPollingWorker.cs" (set /a MISSING+=1 & echo   ❌ PlcPollingWorker.cs missing)
if %MISSING% == 0 (
    echo   ✅ PASS - Tất cả file quan trọng đều tồn tại
    echo [PASS] TEST 8: All key files exist >> %LOG%
    set /a PASS+=1
) else (
    echo   ❌ FAIL - Thiếu %MISSING% file
    echo [FAIL] TEST 8: Missing %MISSING% key files >> %LOG%
    set /a FAIL+=1
)
echo.

:: ============================================================
:: TEST 9: No WorldMonitor branding in key files
:: ============================================================
echo [TEST 9] Quét tàn dư WorldMonitor trong code chính...
findstr /i /c:"world-monitor" D:\StationMonitor\frontend\package.json >nul 2>&1
if %errorlevel% == 0 (
    echo   ❌ FAIL - package.json vẫn còn "world-monitor"
    echo [FAIL] TEST 9: package.json still has world-monitor >> %LOG%
    set /a FAIL+=1
) else (
    findstr /i /c:"WorldMonitor" D:\StationMonitor\frontend\index.html >nul 2>&1
    if %errorlevel% == 0 (
        echo   ❌ FAIL - index.html vẫn còn "WorldMonitor"
        echo [FAIL] TEST 9: index.html still has WorldMonitor >> %LOG%
        set /a FAIL+=1
    ) else (
        echo   ✅ PASS - Không còn dấu vết WorldMonitor trong file chính
        echo [PASS] TEST 9: No WorldMonitor branding in key files >> %LOG%
        set /a PASS+=1
    )
)
echo.

:: ============================================================
:: SUMMARY
:: ============================================================
echo ============================================================
echo  KẾT QUẢ: %PASS% PASSED / %FAIL% FAILED
echo  Chi tiết lưu tại: %LOG%
echo ============================================================

echo. >> %LOG%
echo ============================================================ >> %LOG%
echo KẾT QUẢ: %PASS% PASSED / %FAIL% FAILED >> %LOG%
echo ============================================================ >> %LOG%

echo.
echo Nhấn phím bất kỳ để đóng...
pause >nul
