@echo off
echo ==========================================
echo STATION MONITOR - ENHANCED VIEWER STARTUP
echo ==========================================

cd /d d:\StationMonitor\frontend\bin
start "go2rtc Server" go2rtc.exe

timeout /t 5

cd /d d:\StationMonitor\ai-python
echo Starting Enhanced Stream Relay (Python)...
start "AI Stream Relay" python enhanced_relay.py

echo.
echo ==========================================
echo SERVICES STARTED
echo - go2rtc: Admin at http://localhost:1984
echo - Relay: Processing Cam 152 (10 points)
echo ==========================================
pause
