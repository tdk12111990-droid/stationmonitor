#!/bin/bash
# ============================================================
# deploy.sh — Script cài đặt tự động cho Server Linux (x86_64)
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   STATION MONITOR — TRIỂN KHAI SERVER LINUX        ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Kiểm tra quyền Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[LOI] Vui lòng chạy script này với quyền sudo (sudo ./scripts/deploy.sh)${NC}"
  exit 1
fi

# 2. Kiểm tra Docker
echo -e "--- [1/4] Kiểm tra môi trường Docker ---"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[LOI] Docker chưa được cài đặt.${NC}"
    echo -e "Cài đặt: sudo apt-get update && sudo apt-get install docker.io docker-compose-v2 -y"
    exit 1
fi
echo -e "${GREEN}[OK] Docker đã sẵn sàng.${NC}"

# 3. Tạo thư mục dữ liệu
echo -e "--- [2/4] Khởi tạo thư mục dữ liệu ---"
mkdir -p ./data/pgdata ./data/mosquitto/config ./data/mosquitto/data ./data/mosquitto/log ./data/media

# 4. Cấu hình Mosquitto
MQ_CONFIG="./data/mosquitto/config/mosquitto.conf"
if [ ! -f "$MQ_CONFIG" ]; then
    echo "persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
listener 1883
allow_anonymous true" > "$MQ_CONFIG"
fi

# 5. Build và chạy
echo -e "--- [3/4] Đang build và khởi động bằng Docker Compose ---"
docker compose up -d --build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN}   TRIỂN KHAI THÀNH CÔNG!                           ${NC}"
    echo -e " - Web Dashboard: http://localhost:5173 (Cần chạy npm run dev ở frontend)"
    echo -e " - Backend API  : http://localhost:5056"
    echo -e "${GREEN}====================================================${NC}"
else
    echo -e "${RED}[LOI] Không thể khởi động hệ thống.${NC}"
    exit 1
fi

# 6. Trạng thái
echo -e "--- [4/4] Trạng thái các dịch vụ ---"
docker compose ps
