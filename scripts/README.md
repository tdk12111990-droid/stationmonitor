# Deployment Scripts — StationMonitor

## Tổng quan

Ba script chính để cài đặt, deploy, và cập nhật hệ thống trên Ubuntu/Jetson:

| Script | Mục đích | Chạy khi nào |
|--------|---------|------------|
| `setup-ubuntu.sh` | Cài Docker, tạo directories, kiểm tra SDK | **Lần đầu tiên** trên server mới |
| `deploy-jetson.sh` | Tạo data volumes, config Mosquitto, khởi động Docker | Sau `setup-ubuntu.sh`, hoặc **khởi động lại** hệ thống |
| `update.sh` | Pull code từ GitHub, rebuild, restart | Mỗi khi có **code update** mới |

---

## 1. Setup Ubuntu (Lần đầu)

### Yêu cầu
- Ubuntu 22.04 LTS trở lên
- User có quyền `sudo`
- Mạng Internet để tải Docker + SDK

### Chạy

```bash
cd /opt/stationmonitor
sudo bash scripts/setup-ubuntu.sh
```

### Quy trình

```
[1/8] Kiểm tra quyền sudo
[2/8] Cập nhật hệ thống (apt update, apt upgrade)
[3/8] Cài Docker & Docker Compose v2
[4/8] Cài Docker Compose v2
[5/8] Tạo data directories (pgdata, mosquitto, media)
[6/8] Cấu hình Mosquitto (config file)
[7/8] Kiểm tra SDK Linux
[8/8] Kiểm tra xung đột cổng (5432, 1883, 1984, 5056, 8554)
```

### Kết quả
- ✅ Docker chạy bình thường
- ✅ Quyền truy cập docker group đã cấp
- ✅ Thư mục dữ liệu sẵn sàng
- ✅ Mosquitto config tạo xong
- ⚠️ SDK Linux: Nếu chưa có → hướng dẫn tải

### Tiếp theo
```bash
cd /opt/stationmonitor
docker compose up -d --build
```

---

## 2. Deploy Docker (Khởi động hệ thống)

### Yêu cầu
- `setup-ubuntu.sh` đã chạy xong
- Docker & Docker Compose v2 đã cài

### Chạy

```bash
cd /opt/stationmonitor
bash scripts/deploy-jetson.sh
```

hoặc chạy trực tiếp:
```bash
docker compose up -d --build
```

### Quy trình

```
[1/5] Kiểm tra Docker
[2/5] Kiểm tra Docker Compose
[3/5] Kiểm tra xung đột cổng
[4/5] Tạo data directories (nếu chưa có)
[5/5] Cấu hình Mosquitto (nếu chưa có)
[6/6] Build & khởi động Docker Compose
```

### Kết quả
```
========================================================
   ✅ TRIỂN KHAI THÀNH CÔNG!
========================================================

🌐 Hệ thống chạy tại:
   • Backend API    : http://localhost:5056
   • Streaming      : http://localhost:1984 (go2rtc)
   • MQTT           : localhost:1883
   • PostgreSQL     : localhost:5432

📊 Kiểm tra trạng thái:
   docker compose ps
   docker compose logs -f stationmonitor-backend
```

### Verify

```bash
# Xem danh sách container
docker compose ps

# Kiểm tra API
curl http://localhost:5056/api/v1/health

# Xem log real-time
docker compose logs -f

# Kiểm tra cơ sở dữ liệu
docker compose exec stationmonitor-db psql -U postgres -d stationmonitor -c "SELECT COUNT(*) FROM \"Devices\";"
```

---

## 3. Update & Rebuild

### Chạy

```bash
cd /opt/stationmonitor
bash scripts/update.sh
```

### Quy trình

```
[1/3] Git pull từ GitHub (kéo code mới)
[2/3] Docker build (rebuild images)
[3/3] Docker restart (khởi động lại containers)
```

### Cách thủ công (nếu script gặp lỗi)

```bash
cd /opt/stationmonitor

# 1. Pull code
git pull origin main

# 2. Rebuild & restart
docker compose down
docker compose up -d --build

# 3. Kiểm tra
docker compose ps
docker compose logs -f
```

---

## Troubleshooting

### Script permission denied
```bash
chmod +x scripts/*.sh
bash scripts/setup-ubuntu.sh
```

### Docker daemon not running
```bash
# Khởi động Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Kiểm tra
docker ps
```

### SDK Linux chưa cài
```bash
# Vào thư mục
cd sdk-relay/test_sdk/lib/linux

# Kiểm tra nếu có file
ls -la libhcnetsdk.so

# Nếu chưa có: Tải từ Hikvision
# 1. Vào https://www.hikvision.com/en/support/
# 2. Tải HCNetSDK_V6.x.x_build_Linux_x64
# 3. Giải nén:
tar -xzf ~/HCNetSDK_V6.x.x_build_linux64.tar.gz -C .
chmod +x *.so
chmod -R +x HCNetSDKCom/
```

### Port conflict
```bash
# Tìm process chiếm cổng
lsof -i :5056

# Dừng Docker hoàn toàn
docker compose down -v

# Dừng service khác chiếm port
sudo systemctl stop postgresql
```

### Database error
```bash
# Xem log database
docker compose logs stationmonitor-db

# Restart database
docker compose restart stationmonitor-db

# Kiểm tra data volume
ls -la data/pgdata/
```

### Camera/SDK không kết nối
```bash
# Xem log AI relay
docker compose logs stationmonitor-ai

# Kiểm tra SDK Linux
ls -la sdk-relay/test_sdk/lib/linux/libhcnetsdk.so

# Ping camera từ trong container
docker compose exec stationmonitor-ai ping 192.168.10.152
```

---

## Environment Variables

### `.env` file (tuỳ chọn)

```bash
# Tạo file .env trong project root
cat > .env << 'EOF'
# Camera settings
CAMERA_IP=192.168.10.152
CAMERA_USER=admin
CAMERA_PASSWORD=Demo@2024

# SDK/Relay
GO2RTC_RTSP_URL=rtsp://stationmonitor-streaming:8554
API_URL=http://stationmonitor-backend:8080/api/v1

# Database
POSTGRES_PASSWORD=postgres123
EOF

# Chạy với env
docker compose --env-file .env up -d
```

---

## Quick Reference

### Start/Stop

```bash
# Khởi động
docker compose up -d --build

# Dừng (giữ data)
docker compose down

# Xóa hoàn toàn (xóa data)
docker compose down -v
```

### Logs

```bash
# Tất cả log
docker compose logs --tail=100 -f

# Log backend
docker compose logs -f stationmonitor-backend

# Log camera relay
docker compose logs -f stationmonitor-ai

# Lưu log ra file
docker compose logs > logs_$(date +%Y%m%d_%H%M%S).txt
```

### Services

```bash
# Xem status
docker compose ps

# Restart một service
docker compose restart stationmonitor-backend

# Stop một service
docker compose stop stationmonitor-streaming

# Start một service
docker compose start stationmonitor-streaming
```

### Database Backup

```bash
# Backup
docker compose exec -T stationmonitor-db pg_dump -U postgres stationmonitor > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
docker compose exec -T stationmonitor-db psql -U postgres stationmonitor < backup_20260421.sql
```

---

## Ports Used

| Port | Service | URL |
|------|---------|-----|
| 5432 | PostgreSQL | localhost:5432 |
| 1883 | MQTT | localhost:1883 |
| 1984 | go2rtc API | http://localhost:1984 |
| 5056 | Backend API | http://localhost:5056 |
| 8554 | RTSP re-stream | rtsp://localhost:8554 |
| 8555 | WebRTC | localhost:8555 (tcp/udp) |

---

## Support

- **Documentation:** `DEPLOYMENT-GUIDE.md`
- **SDK Setup:** `sdk-relay/SDK-STRUCTURE.md`
- **Logs:** `docker compose logs -f`
- **GitHub:** https://github.com/tdk12111990-droid/stationmonitor
