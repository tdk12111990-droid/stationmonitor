#!/bin/bash

# ============================================================
# StationMonitor — Script khởi động toàn bộ hệ thống (Linux)
# ============================================================

# 1. Khởi động Backend (Docker)
echo "--------------------------------------------------------"
echo "1/2: Đang khởi động Backend (Docker Containers)..."
sudo docker compose up -d

if [ $? -eq 0 ]; then
    echo "✅ Backend đã khởi động thành công."
else
    echo "❌ Lỗi khi khởi động Backend!"
    exit 1
fi

# 2. Khởi động Frontend (NPM)
echo "--------------------------------------------------------"
echo "2/2: Đang khởi động Frontend (Vite Development)..."
cd frontend

# Kiểm tra thư mục node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Đang cài đặt thư viện Frontend (lần đầu)..."
    npm install
fi

echo "🚀 Đang mở giao diện Web tại cổng 5173..."
echo "💡 Bạn có thể truy cập qua Tailscale tại: http://$(tailscale ip -4):5173"
echo "--------------------------------------------------------"

# Chạy frontend (lệnh này sẽ giữ terminal để bạn xem log)
npm run dev -- --host
