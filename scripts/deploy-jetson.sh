#!/bin/bash
# ============================================================
# deploy-jetson.sh — Script cài đặt tự động cho Jetson Orin Nano
# Đảm bảo môi trường sạch, kiểm tra lỗi và khởi chạy hệ thống.
# ============================================================

# Định dạng màu sắc để báo lỗi/thông báo
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   STATION MONITOR — Docker Deployment (Jetson/Ubuntu)${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Kiểm tra quyền Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[LOI] Vui lòng chạy script này với quyền sudo (sudo ./deploy-jetson.sh)${NC}"
  exit 1
fi

# 2. Kiểm tra Docker
echo -e "--- [1/5] Kiểm tra môi trường Docker ---"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[LOI] Docker chưa được cài đặt trên máy này.${NC}"
    echo -e "Vui lòng cài đặt Docker: sudo apt-get install docker.io"
    exit 1
else
    echo -e "${GREEN}[OK] Docker đã sẵn sàng.${NC}"
fi

# 3. Kiểm tra Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}[LOI] Docker Compose (v2) chưa được cài đặt.${NC}"
    echo -e "Vui lòng cài đặt Docker Compose: sudo apt-get install docker-compose-v2"
    exit 1
else
    echo -e "${GREEN}[OK] Docker Compose đã sẵn sàng.${NC}"
fi

# 4. Kiểm tra xung đột cổng
echo -e "--- [2/5] Kiểm tra xung đột cổng ---"
PORTS=(5432 1883 5056 1984 8554)
for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}[CANH BAO] Cổng $port đang bị chiếm bởi một tiến trình khác.${NC}"
        echo -e "Hệ thống sẽ thử kết nối với dịch vụ hiện có hoặc báo lỗi nếu không tương thích."
    fi
done

# 5. Tạo các thư mục dữ liệu (Persistent Data)
echo -e "--- [3/5] Khởi tạo thư mục dữ liệu ---"
DIRS=(
    "./data/pgdata"
    "./data/mosquitto/config"
    "./data/mosquitto/data"
    "./data/mosquitto/log"
    "./data/media"
)

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo -e "Đã tạo: $dir"
    else
        echo -e "Thư mục đã tồn tại: $dir (Dùng tiếp dữ liệu cũ)"
    fi
done

# 6. Cấu hình mặc định cho Mosquitto (nếu chưa có)
MQ_CONFIG="./data/mosquitto/config/mosquitto.conf"
if [ ! -f "$MQ_CONFIG" ]; then
    cat > "$MQ_CONFIG" << 'EOF'
# Mosquitto configuration
persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

# MQTT protocol
listener 1883
protocol mqtt
allow_anonymous true

# WebSocket protocol
listener 9001
protocol websockets
allow_anonymous true
EOF
    echo -e "${GREEN}[OK] Đã tạo file cấu hình Mosquitto mặc định.${NC}"
fi

# 7. Build và khởi động bằng Docker Compose
echo -e "--- [4/5] Đang build và khởi động hệ thống ---"
echo -e "Quá trình này có thể mất vài phút tùy tốc độ mạng và SD card..."

docker compose up -d --build

# Kiểm tra kết quả lệnh vừa chạy
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN}   ✅ TRIỂN KHAI THÀNH CÔNG!${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo ""
    echo "🌐 Hệ thống chạy tại:"
    echo "   • Backend API    : http://localhost:5056"
    echo "   • Streaming      : http://localhost:1984 (go2rtc)"
    echo "   • MQTT           : localhost:1883"
    echo "   • PostgreSQL     : localhost:5432"
    echo ""
    echo "📊 Kiểm tra trạng thái:"
    echo "   docker compose ps"
    echo "   docker compose logs -f stationmonitor-backend"
    echo ""
    echo "📌 Lệnh hữu ích:"
    echo "   Dừng:     docker compose down"
    echo "   Restart:  docker compose restart"
    echo "   Cập nhật: bash ../scripts/update.sh"
    echo ""
    echo -e "${GREEN}====================================================${NC}"
else
    echo -e "${RED}❌ Lỗi xảy ra trong docker-compose up${NC}"
    echo -e "Kiểm tra log:"
    echo -e "   docker compose logs --tail=50"
    exit 1
fi

# 8. Xem log nhanh
echo -e "--- [5/5] Kiểm tra trạng thái các container ---"
docker compose ps
