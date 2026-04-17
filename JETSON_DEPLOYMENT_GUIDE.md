# 📋 Hướng dẫn Deploy StationMonitor trên Jetson Orin Nano

> **Ngày cập nhật:** 2026-04-17  
> **Mục tiêu:** Deploy backend + frontend trên Jetson, kết nối với PC tại trạm qua LAN

---

## 🎯 Kiến trúc Deployment

```
Jetson Orin Nano (tại trạm LAN: 192.168.10.X)
  ├─ Backend ASP.NET Core (5056)
  ├─ PostgreSQL / TimescaleDB (5432)
  ├─ MQTT Broker (1883)
  ├─ go2rtc Streaming (1984)
  └─ Background Workers
     
PC tại trạm (cùng LAN)
  └─ Desktop App Tauri (frontend)
     └─ Kết nối Jetson:5056 qua LAN
     
Máy tính user (home/office)
  └─ Tailscale VPN
     └─ Có thể monitor/debug remote (tùy chọn)
```

---

## 📦 Bước 1: Chuẩn bị Jetson (tại nhà test trước)

### 1.1 Check JetPack OS
```bash
# Kiểm tra OS
nvidia-smi
uname -a

# JetPack phiên bản nào (tối thiểu 5.x)
cat /etc/nv_tegra_release
```

### 1.2 Cài Docker + Docker Compose
```bash
# Update apt
sudo apt update && sudo apt upgrade -y

# Cài Docker
sudo apt install -y docker.io

# Cài Docker Compose v2 (bắt buộc, không phải python version)
sudo apt install -y docker-compose-v2

# Kiểm tra
docker --version
docker compose version
```

### 1.3 Cấp quyền Docker cho user (tùy chọn, để chạy không cần sudo)
```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🚀 Bước 2: Clone Code + Deploy lên Jetson

### 2.1 Copy code từ máy tính của bạn sang Jetson
```bash
# Từ PowerShell/Terminal trên máy tính bạn:
# (Giả sử Jetson IP: 192.168.1.100 ở nhà, hoặc IP thực tế của Jetson)

scp -r D:\StationMonitor jetson@192.168.1.100:/home/jetson/

# Nếu chưa cài OpenSSH trên Jetson, cài trước:
# ssh jetson@192.168.1.100 "sudo apt install openssh-server"
```

Hoặc dùng git (nếu repo đã có):
```bash
ssh jetson@192.168.1.100
cd /home/jetson
git clone <repo_url> StationMonitor
cd StationMonitor
git checkout main
```

### 2.2 Chạy deployment script trên Jetson
```bash
# SSH vào Jetson
ssh jetson@192.168.1.100

# Vào thư mục project
cd ~/StationMonitor

# Chạy script với quyền sudo
chmod +x deploy-jetson.sh
sudo ./deploy-jetson.sh
```

**Script sẽ:**
- ✅ Kiểm tra Docker/Docker Compose
- ✅ Tạo thư mục dữ liệu (`./data/pgdata`, `./data/mosquitto`, etc.)
- ✅ Build backend Docker image
- ✅ Chạy `docker compose up -d` để start 4 container:
  - `stationmonitor-db` (PostgreSQL)
  - `stationmonitor-mqtt` (Mosquitto)
  - `stationmonitor-backend` (ASP.NET Core)
  - `stationmonitor-streaming` (go2rtc)

### 2.3 Kiểm tra containers đang chạy
```bash
# Kiểm tra status
docker compose ps

# Xem log (để debug nếu có lỗi)
docker compose logs -f

# Kiểm tra API response
curl http://localhost:5056
```

Mong muốn output (ít nhất):
```
CONTAINER ID   IMAGE          STATUS              PORTS
xxx            timescale:...  Up 2 minutes        5432->5432
xxx            mosquitto:...  Up 2 minutes        1883->1883
xxx            go2rtc:...     Up 2 minutes (host)
xxx            xxx-backend    Up 1 minute         5056->8080
```

---

## 💻 Bước 3: Build Frontend Desktop cho PC tại trạm

### 3.1 Build frontend với Jetson IP

Trên máy tính của bạn (hoặc máy tính trạm sau này):

```bash
cd D:\StationMonitor\frontend

# Set env variable cho production (Jetson IP ở nhà test: 192.168.1.100)
# Trên Windows PowerShell:
$env:VITE_API_URL = "http://192.168.1.100:5056"
$env:VITE_GO2RTC_URL = "http://192.168.1.100:1984"

# Trên Linux/Mac bash:
export VITE_API_URL=http://192.168.1.100:5056
export VITE_GO2RTC_URL=http://192.168.1.100:1984

# Build desktop app
npm install
npm run desktop:build:full
```

**Output:** `target/release/bundle/msi/` hoặc `target/release/bundle/exe/`

### 3.2 Test trên máy tính của bạn trước

Nếu muốn test ở nhà trước khi đưa lên máy trạm:

```bash
# Trên máy tính bạn (cùng LAN với Jetson nhà):
npm run dev

# Hoặc chạy desktop app từ build output
./target/release/StationMonitor.exe (Windows)
# hoặc
./target/release/StationMonitor (Linux/Mac)
```

Khi app mở, kiểm tra:
- ✅ Có thể login (admin / Admin@123)
- ✅ Dashboard load được SLD diagram
- ✅ Realtime Monitor thấy camera streams
- ✅ Alerts History, Analytics load dữ liệu

---

## 📊 Bước 4: Test Backend trên LAN ở nhà

### 4.1 Kiểm tra API từ máy tính khác (mô phỏng PC trạm)

Trên máy tính của bạn:

```bash
# Test API
curl http://192.168.1.100:5056

# Test SignalR
# (Desktop app sẽ tự kết nối qua ws://192.168.1.100:5056/ws/realtime)

# Test go2rtc
# Mở browser: http://192.168.1.100:1984/
```

### 4.2 Kiểm tra database

```bash
# Từ Jetson, kết nối PostgreSQL
psql -h localhost -U postgres -d stationmonitor -c "SELECT version();"

# Mật khẩu: postgres123 (từ docker-compose.yml)
```

---

## 🔄 Bước 5: Chuẩn bị xuống trạm thực tế

### 5.1 Cập nhật Jetson IP cho config

Khi biết IP Jetson tại trạm (ví dụ: `192.168.10.50`), rebuild frontend:

```bash
cd D:\StationMonitor\frontend

# Windows PowerShell:
$env:VITE_API_URL = "http://192.168.10.50:5056"
$env:VITE_GO2RTC_URL = "http://192.168.10.50:1984"

# Build desktop app lại
npm run desktop:build:full
```

### 5.2 Copy installer lên PC tại trạm

```bash
# Copy MSI installer từ target/release/bundle/msi/ sang PC trạm
# Hoặc copy build folder nếu chạy dev mode
```

### 5.3 Kiểm tra Jetson IP thực tế tại trạm

```bash
# Từ Jetson, check IP
ifconfig | grep inet

# Hoặc từ PC tại trạm
ping 192.168.10.X
```

---

## 🛠️ Bước 6: Troubleshooting

### Container không chạy
```bash
# Xem log chi tiết
docker compose logs stationmonitor-backend

# Rebuild
docker compose down
docker compose up -d --build

# Nếu port bị chiếm
lsof -i :5056
lsof -i :1984
lsof -i :5432
lsof -i :1883
```

### Frontend không kết nối backend
- ✅ Kiểm tra `VITE_API_URL` environment variable
- ✅ Kiểm tra firewall: port 5056, 1984 mở không?
- ✅ Kiểm tra SignalR kết nối: browser DevTools → Network → WS (WebSocket)

### Database lỗi
```bash
# Kiểm tra database
docker compose logs stationmonitor-db

# Xóa dữ liệu cũ nếu cần (cẩn thận!)
rm -rf ./data/pgdata

# Restart
docker compose down
docker compose up -d --build
```

---

## 📝 File cấu hình quan trọng

| File | Mục đích | Ghi chú |
|------|---------|--------|
| `docker-compose.yml` | Docker services | Chỉ cần chạy `deploy-jetson.sh` |
| `backend/Dockerfile` | Backend image | Multi-stage build, tối ưu ARM64 |
| `frontend/.env.production` | Frontend env (nếu có) | Chưa có, dùng VITE_API_URL env var |
| `frontend/src/utils/env.ts` | Import VITE_* vars | Đã fix để dùng env variables |
| `deploy-jetson.sh` | Deployment script | Chạy 1 lần, setup hệ thống |

---

## 🔐 Bước 7: Production Security (Nên làm)

### 7.1 Thay secret key
```bash
# docker-compose.yml line 69, thay:
Jwt__Key=StationMonitor_SuperSecret_Key_2026_ChangeInProduction!

# Tạo key mới:
openssl rand -base64 32
```

### 7.2 Thay PostgreSQL password
```bash
# docker-compose.yml line 17:
POSTGRES_PASSWORD=postgres123

# Đổi thành password mạnh khác
```

### 7.3 Cập nhật appsettings.json (nếu cần)
```json
{
  "ConnectionStrings": {
    "Default": "Host=stationmonitor-db;Port=5432;Database=stationmonitor;Username=postgres;Password=<NEW_PASSWORD>"
  },
  "Jwt": {
    "Key": "<NEW_JWT_KEY>",
    "Issuer": "StationMonitor",
    "Audience": "StationMonitorApp"
  }
}
```

---

## ✅ Checklist trước deploy xuống trạm

- [ ] Jetson chạy thành công ở nhà (test 2-3 ngày)
- [ ] Frontend build xong với Jetson IP ở nhà
- [ ] Kiểm tra API + SignalR + go2rtc hoạt động
- [ ] Database có dữ liệu test
- [ ] Thay secret key + password (nếu là production)
- [ ] Kiểm tra network LAN tại trạm (camera, PLC, Jetson cùng subnet)
- [ ] Chuẩn bị PC tại trạm (OS, network config)
- [ ] Chuẩn bị Tailscale (nếu muốn remote access)

---

## 🚀 Khi xuống trạm thực tế

1. **Jetson:** Mang xuống, kết nối LAN, chạy `docker compose up -d`
2. **PC tại trạm:** Cài desktop app, chạy
3. **Test:** Login, dashboard, camera, alerts
4. **Network:** Kiểm tra camera/PLC kết nối được tới Jetson
5. **Backup:** Copy `/data` folder thường xuyên (database + media)

---

## 📞 Liên hệ / Debug

- Logs: `docker compose logs -f`
- API test: `curl -H "Authorization: Bearer <TOKEN>" http://192.168.10.X:5056/api/v1/...`
- Frontend: DevTools (F12) → Console / Network tab

