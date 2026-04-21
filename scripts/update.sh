#!/bin/bash
# ============================================================
# update.sh — Cập nhật code + rebuild Docker
# Kéo code mới từ GitHub, rebuild, restart hệ thống
# ============================================================

set -e

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}   STATION MONITOR — Update & Rebuild${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""

# Kiểm tra có phải trong git repo không
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Không phải git repository${NC}"
    exit 1
fi

# 1. Pull code từ GitHub
echo -e "${YELLOW}[1/3] Kéo code mới từ GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code đã cập nhật${NC}"

# 2. Rebuild Docker
echo ""
echo -e "${YELLOW}[2/3] Build Docker images...${NC}"
docker compose build --no-cache
echo -e "${GREEN}✅ Build hoàn tất${NC}"

# 3. Restart services
echo ""
echo -e "${YELLOW}[3/3] Khởi động lại dịch vụ...${NC}"
docker compose down
docker compose up -d --build
echo -e "${GREEN}✅ Dịch vụ đã khởi động${NC}"

# Summary
echo ""
echo -e "${BLUE}========================================================${NC}"
echo -e "${GREEN}   ✅ CẬP NHẬT HOÀN TẤT!${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo "📊 Trạng thái:"
docker compose ps
echo ""
echo "📋 Tiếp theo:"
echo "   Xem log: docker compose logs -f"
echo ""
