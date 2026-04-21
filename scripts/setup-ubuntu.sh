#!/bin/bash
# ============================================================
# setup-ubuntu.sh — Setup môi trường Ubuntu cho StationMonitor
# Cài Docker, chuẩn bị dữ liệu, kiểm tra SDK, khởi động hệ thống
# ============================================================

set -e  # Exit on error

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Đường dẫn
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ════════════════════════════════════════════════════════════
# HEADER
# ════════════════════════════════════════════════════════════

clear
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}   STATION MONITOR — Setup Ubuntu Deployment${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo "📦 Project: $PROJECT_DIR"
echo "🔧 Script:  $SCRIPT_DIR"
echo ""

# ════════════════════════════════════════════════════════════
# 1. CHECK PERMISSIONS
# ════════════════════════════════════════════════════════════

echo -e "${YELLOW}[1/8] Kiểm tra quyền...${NC}"
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Vui lòng chạy với sudo:${NC}"
  echo "   sudo bash ./scripts/setup-ubuntu.sh"
  exit 1
fi
echo -e "${GREEN}✅ Quyền sudo OK${NC}"

# ════════════════════════════════════════════════════════════
# 2. UPDATE SYSTEM
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[2/8] Cập nhật hệ thống...${NC}"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git net-tools lsof
echo -e "${GREEN}✅ Hệ thống cập nhật${NC}"

# ════════════════════════════════════════════════════════════
# 3. INSTALL DOCKER
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[3/8] Cài Docker...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker đã cài sẵn${NC}"
else
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Add user to docker group
    usermod -aG docker $SUDO_USER 2>/dev/null || true
    echo -e "${GREEN}✅ Docker cài xong${NC}"
fi

# ════════════════════════════════════════════════════════════
# 4. INSTALL DOCKER COMPOSE V2
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[4/8] Cài Docker Compose v2...${NC}"
if docker compose version &> /dev/null; then
    echo -e "${GREEN}✅ Docker Compose đã cài sẵn${NC}"
else
    apt-get install -y -qq docker-compose-v2
    echo -e "${GREEN}✅ Docker Compose cài xong${NC}"
fi

# ════════════════════════════════════════════════════════════
# 5. CREATE DATA DIRECTORIES
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[5/8] Tạo thư mục dữ liệu...${NC}"
mkdir -p "$PROJECT_DIR/data/pgdata"
mkdir -p "$PROJECT_DIR/data/mosquitto/config"
mkdir -p "$PROJECT_DIR/data/mosquitto/data"
mkdir -p "$PROJECT_DIR/data/mosquitto/log"
mkdir -p "$PROJECT_DIR/data/media"

chmod 777 "$PROJECT_DIR/data/pgdata"
chmod 777 "$PROJECT_DIR/data/mosquitto"
chmod 777 "$PROJECT_DIR/data/media"

echo -e "${GREEN}✅ Thư mục dữ liệu đã tạo${NC}"

# ════════════════════════════════════════════════════════════
# 6. CREATE MOSQUITTO CONFIG
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[6/8] Cấu hình Mosquitto...${NC}"
MQ_CONFIG="$PROJECT_DIR/data/mosquitto/config/mosquitto.conf"
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
    chmod 644 "$MQ_CONFIG"
    echo -e "${GREEN}✅ Mosquitto config tạo xong${NC}"
else
    echo -e "${GREEN}✅ Mosquitto config đã tồn tại${NC}"
fi

# ════════════════════════════════════════════════════════════
# 7. CHECK SDK LINUX
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[7/8] Kiểm tra SDK Linux...${NC}"
SDK_PATH="$PROJECT_DIR/sdk-relay/test_sdk/lib/linux"
if [ -f "$SDK_PATH/libhcnetsdk.so" ]; then
    echo -e "${GREEN}✅ Linux SDK libhcnetsdk.so tồn tại${NC}"
    ls -lh "$SDK_PATH"/*.so | wc -l | xargs echo "   Số file .so:"
else
    echo -e "${RED}⚠️  Cảnh báo: SDK Linux chưa được cài${NC}"
    echo "   Để tải SDK Linux:"
    echo "   1. Tải từ Hikvision: https://www.hikvision.com/en/support/"
    echo "   2. Giải nén vào: $SDK_PATH"
    echo "   3. chmod +x $SDK_PATH/*.so"
    echo ""
    echo "   Hoặc nếu đã có file tải, chạy:"
    echo "   tar -xzf ~/HCNetSDK_V6.x.x_build_linux64.tar.gz -C $SDK_PATH"
fi

# ════════════════════════════════════════════════════════════
# 8. CHECK PORTS
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[8/8] Kiểm tra xung đột cổng...${NC}"
PORTS=(5432 1883 1984 5056 8554)
PORT_CONFLICT=0
for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Cảnh báo: Cổng $port đang bị chiếm${NC}"
        PORT_CONFLICT=1
    else
        echo -e "${GREEN}✅ Cổng $port sẵn sàng${NC}"
    fi
done

# ════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}========================================================${NC}"
echo -e "${GREEN}   SETUP HOÀN TẤT!${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo "📋 Tóm tắt:"
echo "   ✅ Docker v$(docker --version | awk '{print $3}')"
echo "   ✅ Docker Compose v$(docker compose version --short)"
echo "   ✅ Dữ liệu: $PROJECT_DIR/data/"
echo "   ✅ Mosquitto: Đã cấu hình"
echo ""
if [ $PORT_CONFLICT -eq 0 ]; then
    echo -e "${GREEN}✅ Tất cả cổng sẵn sàng${NC}"
else
    echo -e "${YELLOW}⚠️  Một số cổng bị chiếm — có thể gây lỗi${NC}"
fi
echo ""
echo "📌 Bước tiếp theo:"
echo "   1. Kiểm tra SDK Linux:"
echo "      ls -la $SDK_PATH/libhcnetsdk.so"
echo ""
echo "   2. Chạy hệ thống:"
echo "      cd $PROJECT_DIR"
echo "      docker compose up -d --build"
echo ""
echo "   3. Kiểm tra trạng thái:"
echo "      docker compose ps"
echo "      docker compose logs -f"
echo ""
echo -e "${BLUE}========================================================${NC}"
