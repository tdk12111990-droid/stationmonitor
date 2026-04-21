#!/bin/bash
# ============================================================
# update.sh — Script cập nhật tự động cho Jetson Nano
# Dùng để pull code mới nhất từ GitHub và khởi động lại Docker.
# ============================================================

GREEN='\033[0,32m'
YELLOW='\033[1,33m'
NC='\033[0m'

echo -e "${YELLOW}--- Đang tải mã nguồn mới từ GitHub ---${NC}"
git pull

echo -e "${YELLOW}--- Đang build và khởi động lại các dịch vụ Docker ---${NC}"
# Sử dụng --build để đảm bảo các thay đổi trong AI Engine được cập nhật
docker compose up -d --build

echo -e "${GREEN}--- CẬP NHẬT HOÀN TẤT! ---${NC}"
docker compose ps
