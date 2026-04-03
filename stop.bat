@echo off
title StationMonitor - Dung he thong
echo.
echo  ================================================
echo   STATION MONITOR - DUNG TAT CA SERVICE
echo  ================================================
echo.

echo Dung Frontend...
taskkill /FI "WindowTitle eq Frontend*" /F >nul 2>&1

echo Dung Backend API...
taskkill /FI "WindowTitle eq Backend API*" /F >nul 2>&1
taskkill /IM dotnet.exe /F >nul 2>&1

echo Dung go2rtc...
taskkill /FI "WindowTitle eq go2rtc*" /F >nul 2>&1
taskkill /IM go2rtc.exe /F >nul 2>&1

echo Dung Sidecar...
taskkill /FI "WindowTitle eq Sidecar*" /F >nul 2>&1

echo.
echo  Tat ca service da dung.
timeout /t 2 /nobreak >nul
