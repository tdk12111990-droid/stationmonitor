#!/bin/bash

# ============================================================
# StationMonitor — Dừng toàn bộ hệ thống (Linux/Ubuntu)
# ============================================================
# Sử dụng: ./stop-all.sh
# ============================================================

echo ""
echo "=================================================="
echo " STATION MONITOR - DUNG TAT CA SERVICE"
echo "=================================================="
echo ""

# Lấy thư mục gốc
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════
# Dừng Frontend (npm)
# ═══════════════════════════════════════════════════════
echo "Dung Frontend..."
pkill -f "npm run dev" || true
sleep 1

# ═══════════════════════════════════════════════════════
# Dừng Notification System (Python)
# ═══════════════════════════════════════════════════════
echo "Dung Camera Notifications..."
pkill -f "python.*main.py" || true
sleep 1

# ═══════════════════════════════════════════════════════
# Dừng Backend (Docker)
# ═══════════════════════════════════════════════════════
echo "Dung Backend (Docker)..."

if command -v docker-compose &> /dev/null; then
    sudo docker-compose down
elif command -v docker &> /dev/null; then
    sudo docker compose down
else
    echo "⚠️  Docker khong tim thay"
fi

echo ""
echo "✅ Tat ca service da dung."
echo ""
