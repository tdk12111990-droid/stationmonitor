#!/bin/bash

# ============================================================
# StationMonitor — Khởi động toàn bộ hệ thống (Linux/Ubuntu)
# ============================================================
# Sử dụng: ./run-all.sh
# ============================================================

set -e

echo ""
echo "=================================================="
echo " STATION MONITOR - KHOI DONG HE THONG (LINUX)"
echo "=================================================="
echo ""

# Lấy thư mục gốc của script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════
# [1/4] Khởi động Backend (Docker Compose)
# ═══════════════════════════════════════════════════════
echo "[1/4] Khoi dong Backend (Docker)..."

if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    sudo docker compose up -d
    sleep 5
    echo "✅ Backend dang chay tren port 5056"
elif command -v docker-compose &> /dev/null; then
    sudo docker-compose up -d
    sleep 5
    echo "✅ Backend dang chay tren port 5056"
else
    echo "❌ Loi: Docker chua duoc cai dat!"
    exit 1
fi

# ═══════════════════════════════════════════════════════
# [2/4] Khởi động Camera Notification System (Python)
# ═══════════════════════════════════════════════════════
echo "[2/4] Khoi dong Camera Notification System..."

NOTIFY_DIR="$SCRIPT_DIR/sdk-relay/notifications"

if [ ! -d "$NOTIFY_DIR" ]; then
    echo "❌ Loi: Folder notifications khong ton tai!"
    exit 1
fi

# Kiểm tra Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Loi: Python3 chua duoc cai dat!"
    exit 1
fi

# Cài đặt dependencies (nếu chưa có)
if [ ! -d "$NOTIFY_DIR/venv" ]; then
    echo "📦 Tao virtual environment..."
    cd "$NOTIFY_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
    cd "$SCRIPT_DIR"
else
    echo "✅ Virtual environment da ton tai"
fi

# Khởi động notification system ở background
echo "🚀 Khoi dong notification listener..."
nohup bash -c "cd '$NOTIFY_DIR' && source venv/bin/activate && python main.py" > "$NOTIFY_DIR/notifications.log" 2>&1 &
NOTIFY_PID=$!
echo "✅ Notification System (PID: $NOTIFY_PID)"
sleep 2

# ═══════════════════════════════════════════════════════
# [3/4] Kiểm tra ffmpeg (cần cho video recording)
# ═══════════════════════════════════════════════════════
echo "[3/4] Kiem tra ffmpeg..."

if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  Canh bao: ffmpeg chua duoc cai dat!"
    echo "   Cai dat: sudo apt-get install ffmpeg"
    echo "   (Video recording se khong hoat dong)"
else
    echo "✅ ffmpeg ready"
fi

# ═══════════════════════════════════════════════════════
# [4/4] Khởi động Frontend (npm)
# ═══════════════════════════════════════════════════════
echo "[4/4] Khoi dong Frontend (Vite)..."

cd "$SCRIPT_DIR/frontend"

# Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Cai dat thu vien Frontend (lan dau)..."
    npm install
fi

echo ""
echo "=================================================="
echo " TAT CA SERVICE DA KHOI DONG!"
echo ""
echo " Frontend              : http://localhost:5173"
echo " Backend API           : http://localhost:5056"
echo " go2rtc                : http://localhost:1984"
echo " Camera Notifications  : sdk-relay/notifications"
echo ""
echo " Logs:"
echo "   Frontend: console ben duoi"
echo "   Backend: docker logs (docker)"
echo "   Notify:  tail -f sdk-relay/notifications/notifications.log"
echo ""
echo " De dung toan bo he thong: Press Ctrl+C"
echo "=================================================="
echo ""

# Chạy frontend (foreground, giữ script chạy)
npm run dev -- --host
