@echo off
title StationMonitor - Setup Moi Truong
chcp 65001 >nul 2>&1
echo.
echo  ================================================
echo   STATION MONITOR - SETUP MOI TRUONG TU DONG
echo   Chay file nay 1 lan duy nhat sau khi clone code
echo  ================================================
echo.

cd /d "%~dp0"

:: ─── Kiem tra quyen Administrator ────────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [LOI] Vui long chuot phai va chon "Run as Administrator"!
    pause & exit /b
)

echo ================================================================
echo  BUOC 1: Cai dat phan mem he thong (neu chua co)
echo ================================================================
echo.

:: 1. .NET 8 SDK
where dotnet >nul 2>&1
if %errorlevel%==0 (
    echo [OK] .NET SDK da co san - bo qua.
) else (
    echo [1/5] Dang cai dat .NET 8 SDK...
    winget install --id Microsoft.DotNet.SDK.8 --silent --accept-package-agreements --accept-source-agreements
    echo [OK] .NET 8 hoan tat.
)

:: 2. Node.js LTS
where node >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Node.js da co san - bo qua.
) else (
    echo [2/5] Dang cai dat Node.js LTS...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements
    echo [OK] Node.js hoan tat.
)

:: 3. Docker Desktop
where docker >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Docker da co san - bo qua.
) else (
    echo [3/5] Dang cai dat Docker Desktop...
    winget install --id Docker.DockerDesktop --silent --accept-package-agreements
    echo [OK] Docker hoan tat. Can KHOI DONG LAI MAY roi chay lai file nay!
    pause & exit /b
)

:: 4. Git
where git >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Git da co san - bo qua.
) else (
    echo [4/5] Dang cai dat Git...
    winget install --id Git.Git --silent --accept-package-agreements
    echo [OK] Git hoan tat.
)

:: 5. DBeaver (Quan ly Database)
if exist "%LOCALAPPDATA%\Programs\DBeaverCommunity\dbeaver.exe" (
    echo [OK] DBeaver da co san - bo qua.
) else (
    echo [5/5] Dang cai dat DBeaver...
    winget install --id dbeaver.dbeaver --silent --accept-package-agreements
    echo [OK] DBeaver hoan tat.
)

:: 6. Python 3.11 (AI Module)
where python >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Python da co san - bo qua.
) else (
    echo [6/6] Dang cai dat Python 3.11...
    winget install --id Python.Python.3.11 --silent --accept-package-agreements
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
    echo [OK] Python hoan tat.
)

echo.
echo ================================================================
echo  BUOC 2: Cai thu vien Python (cho AI Module - Phase 3)
echo ================================================================
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo [OK] Thu vien Python da cai xong.

echo.
echo ================================================================
echo  BUOC 3: Tao Database TimescaleDB tu dong
echo ================================================================

:: Kiem tra Docker engine co dang chay khong
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker Desktop chua duoc mo. Dang mo Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo     Vui long cho Docker khoi dong xong (30-60 giay) roi chay lai file nay.
    pause & exit /b
)

:: Kiem tra container da ton tai chua
docker ps -a --filter "name=stationmonitor-db" | findstr "stationmonitor-db" >nul 2>&1
if %errorlevel%==0 (
    :: Container ton tai → dam bao no dang chay
    docker start stationmonitor-db >nul 2>&1
    echo [OK] Container stationmonitor-db da ton tai va dang chay.
) else (
    echo Dang tao container TimescaleDB lan dau...
    echo (Co the mat 1-2 phut de tai image lan dau)
    docker run -d --name stationmonitor-db ^
      --restart unless-stopped ^
      -e POSTGRES_PASSWORD=postgres123 ^
      -e POSTGRES_DB=stationmonitor ^
      -p 5432:5432 ^
      -v "%USERPROFILE%\docker-data\stationmonitor-db:/var/lib/postgresql/data" ^
      timescale/timescaledb:latest-pg16
    
    if %errorlevel%==0 (
        echo [OK] Database TimescaleDB da duoc tao va dang chay!
        echo      Data luu tai: %USERPROFILE%\docker-data\stationmonitor-db
    ) else (
        echo [LOI] Khong the tao container. Kiem tra lai Docker Desktop.
        pause & exit /b
    )
)

echo.
echo  ================================================================
echo   SETUP HOAN TAT!
echo.
echo   Tat ca phan mem da duoc cai dat:
echo     .NET 8 SDK, Node.js, Docker, Git, DBeaver, Python
echo.
echo   Database TimescaleDB da san sang tai:
echo     Host     : localhost
echo     Port     : 5432
echo     Database : stationmonitor
echo     Password : postgres123
echo.
echo   BUOC TIEP THEO: Double-click start.bat de chay du an!
echo  ================================================================
echo.
pause
