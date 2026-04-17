# 📤 Hướng dẫn Push Code lên Jetson Nhanh

> **Để cập nhật code trên Jetson** khi có thay đổi hoặc bug fix

---

## ⚡ Cách nhanh nhất (dùng SCP)

### Scenario 1: Cập nhật chỉ Frontend

```bash
# Từ máy tính bạn (Windows PowerShell)
cd D:\StationMonitor\frontend

# Copy frontend folder lên Jetson
scp -r src/ jetson@192.168.1.100:/home/jetson/StationMonitor/frontend/

# Hoặc copy toàn bộ frontend
scp -r . jetson@192.168.1.100:/home/jetson/StationMonitor/frontend/
```

### Scenario 2: Cập nhật chỉ Backend

```bash
# Từ máy tính bạn
cd D:\StationMonitor\backend

# Copy source code
scp -r StationMonitor.* jetson@192.168.1.100:/home/jetson/StationMonitor/backend/

# SSH vào Jetson, rebuild backend
ssh jetson@192.168.1.100
cd ~/StationMonitor
docker compose up -d --build stationmonitor-backend
```

### Scenario 3: Cập nhật toàn bộ (Code + Config)

```bash
# Từ máy tính bạn
# Copy toàn bộ source code
scp -r D:\StationMonitor jetson@192.168.1.100:/home/jetson/

# SSH vào Jetson
ssh jetson@192.168.1.100
cd ~/StationMonitor

# Restart hệ thống
docker compose down
sudo ./deploy-jetson.sh
```

---

## 🔄 Cách dùng Git (nếu có repo)

### Nếu Jetson đã clone từ git:

```bash
# SSH vào Jetson
ssh jetson@192.168.1.100
cd ~/StationMonitor

# Update code
git pull origin main

# Rebuild (nếu có thay đổi backend)
docker compose up -d --build stationmonitor-backend

# Hoặc restart toàn bộ
docker compose down
sudo ./deploy-jetson.sh
```

---

## 📋 Kiểm tra sau khi update

```bash
# 1. Kiểm tra container chạy
docker compose ps

# 2. Kiểm tra log
docker compose logs -f stationmonitor-backend

# 3. Test API
curl http://localhost:5056

# 4. Kiểm tra frontend (nếu update frontend)
# Mở browser: http://192.168.1.100:5173 (dev)
# Hoặc rebuild desktop app nếu production
```

---

## 🔧 Nếu Backend lỗi sau update

```bash
# Xem log chi tiết
docker compose logs stationmonitor-backend

# Nếu lỗi database
docker compose logs stationmonitor-db

# Rebuild lại
docker compose down
docker compose up -d --build

# Hoặc chạy script
sudo ./deploy-jetson.sh
```

---

## ⚠️ Cách Push với `.env` khác (test vs production)

Nếu muốn 2 environment khác nhau:

### Ở nhà (test):
```bash
# Set env test
export JETSON_API_URL=http://192.168.1.100:5056
export VITE_API_URL=http://192.168.1.100:5056
export VITE_GO2RTC_URL=http://192.168.1.100:1984

# Build frontend
cd frontend
npm run desktop:build:full
```

### Tại trạm (production):
```bash
# Set env production
export JETSON_API_URL=http://192.168.10.50:5056
export VITE_API_URL=http://192.168.10.50:5056
export VITE_GO2RTC_URL=http://192.168.10.50:1984

# Build frontend
cd frontend
npm run desktop:build:full
```

---

## 📝 Useful Commands

```bash
# Copy một file duy nhất
scp D:\StationMonitor\file.txt jetson@192.168.1.100:/home/jetson/StationMonitor/

# Copy từ Jetson về máy tính (download)
scp jetson@192.168.1.100:/home/jetson/StationMonitor/file.txt D:\StationMonitor\

# SSH + command trực tiếp (không vào shell)
ssh jetson@192.168.1.100 "cd ~/StationMonitor && docker compose ps"

# Restart Jetson
ssh jetson@192.168.1.100 "sudo reboot"

# Kiểm tra disk space
ssh jetson@192.168.1.100 "df -h"

# Kiểm tra memory
ssh jetson@192.168.1.100 "free -h"
```

---

## 💡 Tips

- Dùng **SCP** nếu code nhỏ hoặc không có git
- Dùng **Git** nếu code lớn hoặc nhiều người
- Luôn backup `/data` folder trước khi update (database + media files)
- Test trên dev environment trước, sau đó push lên production

