@echo off
title StationMonitor - Cai dat moi truong tu dong
echo.
echo  ================================================
echo   STATION MONITOR - SETUP ENVIRONMENT
echo  ================================================
echo.

:: Kiem tra quyen Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [LOI] Vui long chay file nay bang quyen Administrator (Chuot phai ^> Run as Administrator)!
    echo.
    pause
    exit /b
)

echo [INFO] Dang kiem tra va cai dat cac thanh phan he thong qua Winget...
echo.

:: 1. .NET 8 SDK
echo [1/5] Dang cai dat .NET 8 SDK...
winget install --id Microsoft.DotNet.SDK.8 --silent --accept-package-agreements --accept-source-agreements
if %errorLevel% equ 0 (echo [OK] .NET 8 hoan tat.) else (echo [!] .NET 8 co the da co san.)

:: 2. Node.js LTS
echo.
echo [2/5] Dang cai dat Node.js LTS...
winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements
if %errorLevel% equ 0 (echo [OK] Node.js hoan tat.) else (echo [!] Node.js co the da co san.)

:: 3. Docker Desktop
echo.
echo [3/5] Dang cai dat Docker Desktop...
echo [!] Luu y: Docker can khoi dong lai may sau khi cai dat.
winget install --id Docker.DockerDesktop --silent --accept-package-agreements
if %errorLevel% equ 0 (echo [OK] Docker hoan tat.) else (echo [!] Docker co the da co san.)

:: 4. DBeaver Community
echo.
echo [4/5] Dang cai dat DBeaver (Manage Database)...
winget install --id dbeaver.dbeaver --silent --accept-package-agreements
if %errorLevel% equ 0 (echo [OK] DBeaver hoan tat.) else (echo [!] DBeaver co the da co san.)

:: 5. Git
echo.
echo [5/5] Dang cai dat Git...
winget install --id Git.Git --silent --accept-package-agreements
if %errorLevel% equ 0 (echo [OK] Git hoan tat.) else (echo [!] Git co the da co san.)

echo.
echo  ================================================
echo   CAI DAT HOAN TAT! 
echo   Vui long khoi dong lai may de cac thay doi co hieu luc.
echo  ================================================
echo.
pause
