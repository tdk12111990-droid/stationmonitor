#!/bin/bash

# ============================================================
# run-all-desktop.sh — Khởi động hệ thống & Mở App Desktop
# ============================================================

echo "=================================================="
echo " STATION MONITOR - KHOI DONG APP DESKTOP"
echo "=================================================="

# 1. Khởi động Backend
echo "[1/3] Khoi dong Backend (Docker)..."
sudo docker compose up -d

# Cleanup stale processes
echo "Dang don dep cac tien trinh cu..."
sudo pkill -f enhanced_relay.py || true
sudo pkill -f main.py || true
sudo pkill -f ai_api.py || true
sleep 2

# 2. Khởi động Relay AI & Notifications
echo "[2/3] Khoi dong AI Relay & Notifications..."
# Chạy ngầm AI API Receiver (Cổng 8080) để nhận dự báo
nohup python3 sdk-relay/ai_api.py > ai_api.log 2>&1 &

# Chạy ngầm AI Relay (Gửi nhiệt độ đi)
nohup python3 sdk-relay/enhanced_relay.py > ai_relay.log 2>&1 &

# Chạy ngầm notification
cd sdk-relay/notifications
source venv/bin/activate
nohup python3 main.py > notifications.log 2>&1 &
cd ../..

# 3. Khởi động Desktop App
echo "[3/3] Khoi dong Desktop App (Tauri)..."
cd frontend
npm run desktop:dev
