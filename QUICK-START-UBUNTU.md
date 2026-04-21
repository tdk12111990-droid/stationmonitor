# Quick Start — Ubuntu DL380 Deployment

## 🚀 Từ Zero đến Running trong 10 phút

---

## **Bước 1: Chuẩn bị Server**

### Yêu cầu
- ✅ Ubuntu 22.04 LTS (hoặc 20.04)
- ✅ Quyền `sudo`
- ✅ Mạng kết nối (để tải Docker + SDK)
- ✅ IP cố định (ví dụ: 192.168.10.50)

### Cấu hình IP tĩnh (nếu chưa có)

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

**Nội dung:**
```yaml
network:
  version: 2
  ethernets:
    ens3:
      dhcp4: no
      addresses:
        - 192.168.10.50/24
      gateway4: 192.168.10.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

**Áp dụng:**
```bash
sudo netplan apply
ip addr show
```

---

## **Bước 2: Clone Project từ GitHub**

```bash
# Chọn thư mục (ví dụ /opt)
cd /opt
sudo mkdir -p stationmonitor
sudo chown $USER:$USER stationmonitor
cd stationmonitor

# Clone repo
git clone https://github.com/tdk12111990-droid/stationmonitor.git .
git checkout main

# Kiểm tra
ls -la
# Phải thấy: backend/, frontend/, sdk-relay/, docker-compose.yml, scripts/
```

---

## **Bước 3: Setup Môi trường (Lần đầu)**

```bash
# Chạy script setup (cài Docker, tạo folders, kiểm tra SDK)
sudo bash scripts/setup-ubuntu.sh
```

**Script sẽ:**
- ✅ Cài Docker + Docker Compose v2
- ✅ Tạo data directories (pgdata, mosquitto, media)
- ✅ Cấu hình Mosquitto
- ✅ Kiểm tra SDK Linux
- ✅ Kiểm tra xung đột cổng

**Kết quả:**
```
========================================================
   SETUP HOÀN TẤT!

✅ Docker v20.x.x
✅ Docker Compose v2.x.x
✅ Dữ liệu: /opt/stationmonitor/data/
✅ Mosquitto: Đã cấu hình

⚠️  Cảnh báo: SDK Linux chưa được cài
   Để tải: https://www.hikvision.com/en/support/
========================================================
```

---

## **Bước 4: Tải Linux SDK (Nếu cần)**

Nếu script báo "SDK Linux chưa được cài":

```bash
# 1. Tải từ Hikvision (v6.x.x Linux)
# → Lưu file vào ~/HCNetSDK_V6.x.x_build_linux64.tar.gz

# 2. Giải nén vào đúng vị trí
cd /opt/stationmonitor/sdk-relay/test_sdk/lib/linux
tar -xzf ~/HCNetSDK_V6.x.x_build_linux64.tar.gz

# 3. Cấp quyền
chmod +x *.so
chmod -R +x HCNetSDKCom/

# 4. Kiểm tra
ls -la libhcnetsdk.so
# Phải thấy file này
```

---

## **Bước 5: Khởi động Hệ thống**

```bash
cd /opt/stationmonitor

# Build Docker images + khởi động
docker compose up -d --build
```

**Đợi ~2-3 phút để build xong**

```
Creating stationmonitor-db ... done
Creating stationmonitor-mqtt ... done
Creating stationmonitor-streaming ... done
Creating stationmonitor-backend ... done
Creating stationmonitor-ai ... done
```

---

## **Bước 6: Kiểm tra Hệ thống**

### Xem trạng thái container
```bash
docker compose ps
```

**Phải thấy:**
```
NAME                        STATUS              PORTS
stationmonitor-db           Up 2 minutes        5432/tcp
stationmonitor-mqtt         Up 2 minutes        1883/tcp, 9001/tcp
stationmonitor-streaming    Up 2 minutes        1984/tcp, 8554/tcp
stationmonitor-backend      Up 2 minutes        5056/tcp
stationmonitor-ai           Up 2 minutes
```

### Kiểm tra API hoạt động
```bash
curl http://localhost:5056/api/v1/health
```

**Kết quả (phải có):**
```json
{"status":"ok"}
```

### Kiểm tra Database
```bash
docker compose exec stationmonitor-db psql -U postgres -d stationmonitor -c "SELECT COUNT(*) FROM \"Devices\";"
```

### Xem log real-time
```bash
docker compose logs -f stationmonitor-backend
```

**Dừng:** Ctrl+C

---

## **Bước 7: Cấu hình Desktop App (Tại Trạm)**

Trên máy Windows dev:

```bash
cd StationMonitor/frontend

# Sửa .env.station với IP DL380
nano .env.station
```

**Nội dung:**
```
VITE_API_URL=http://192.168.10.50:5056
VITE_GO2RTC_URL=http://192.168.10.50:1984
```

**Build desktop app:**
```bash
cp .env.station .env.local
npm run tauri build

# Output: src-tauri/target/release/bundle/msi/StationMonitor_*.msi
```

**Copy file .msi sang máy tại trạm → cài đặt → chạy**

---

## **Bước 8: Verify Hệ thống**

### API Endpoints

```bash
# Tất cả endpoint phải return 200 (hoặc 401 nếu không auth)

# 1. Health check
curl http://192.168.10.50:5056/api/v1/health

# 2. Get devices (phải auth)
curl -H "Authorization: Bearer TOKEN" \
  http://192.168.10.50:5056/api/v1/devices

# 3. go2rtc streams
curl http://192.168.10.50:1984/api/streams

# 4. MQTT (phải kết nối port 1883)
telnet 192.168.10.50 1883
```

### Camera Connection

```bash
# Kiểm tra từ trong container
docker compose exec stationmonitor-ai ping 192.168.10.152
docker compose exec stationmonitor-ai ping 192.168.10.153

# Phải thấy "PONG" → camera reachable
```

### Xem Stream

```bash
# Trên máy khác trong LAN (hoặc desktop app)
# Mở browser: http://192.168.10.50:1984/stream.html?src=camera_152_normal
```

---

## **Bước 9: Update Code (Sau này)**

Khi có code update mới từ GitHub:

```bash
cd /opt/stationmonitor

# Pull + rebuild + restart
bash scripts/update.sh
```

hoặc thủ công:
```bash
git pull origin main
docker compose down
docker compose up -d --build
docker compose logs -f
```

---

## **🔧 Troubleshooting**

### Docker không chạy
```bash
sudo systemctl start docker
sudo systemctl enable docker
docker ps
```

### Container startup lâu
```bash
# Xem log chi tiết
docker compose logs stationmonitor-backend

# Đợi ~30-60 giây cho database migrate xong
```

### API không phản hồi
```bash
# Kiểm tra backend log
docker compose logs stationmonitor-backend --tail=50

# Restart backend
docker compose restart stationmonitor-backend
```

### Camera không kết nối
```bash
# Kiểm tra SDK Linux
ls -la sdk-relay/test_sdk/lib/linux/libhcnetsdk.so

# Xem AI log
docker compose logs stationmonitor-ai --tail=50

# Ping camera
docker compose exec stationmonitor-ai ping 192.168.10.152
```

### Port conflict
```bash
# Tìm process chiếm port
lsof -i :5056

# Dừng Docker
docker compose down

# Hoặc dừng service khác
sudo systemctl stop postgresql
```

---

## **📊 Ports & URLs**

| Service | URL | Port |
|---------|-----|------|
| Backend API | http://192.168.10.50:5056 | 5056 |
| go2rtc | http://192.168.10.50:1984 | 1984 |
| RTSP Stream | rtsp://192.168.10.50:8554 | 8554 |
| MQTT | 192.168.10.50:1883 | 1883 |
| PostgreSQL | localhost:5432 | 5432 |

---

## **📋 Essential Commands**

```bash
# Start/Stop
docker compose up -d --build       # Start all services
docker compose down                # Stop all services
docker compose down -v             # Stop + delete volumes

# Logs
docker compose logs -f             # All logs
docker compose logs -f stationmonitor-backend   # Backend only
docker compose logs --tail=100     # Last 100 lines

# Status
docker compose ps                  # List containers
docker compose exec stationmonitor-db psql -U postgres -d stationmonitor -c "SELECT NOW();"

# Backup/Restore
docker compose exec -T stationmonitor-db pg_dump -U postgres stationmonitor > backup.sql
docker compose exec -T stationmonitor-db psql -U postgres stationmonitor < backup.sql

# Clean up
docker system prune -a             # Remove unused images
```

---

## **✅ Checklist**

- [ ] Ubuntu 22.04 LTS cài xong
- [ ] IP tĩnh 192.168.10.50 đặt xong
- [ ] Code clone từ GitHub
- [ ] `setup-ubuntu.sh` chạy thành công
- [ ] Linux SDK tải & giải nén
- [ ] `docker compose up -d --build` chạy thành công
- [ ] `docker compose ps` hiển thị 5 container running
- [ ] `curl http://localhost:5056/api/v1/health` return 200
- [ ] Camera ping được từ AI container
- [ ] Desktop app .msi build xong
- [ ] Desktop app cài & kết nối được server

---

## **Hỗ trợ**

- **Docs:** `DEPLOYMENT-GUIDE.md`
- **Scripts:** `scripts/README.md`
- **SDK:** `sdk-relay/SDK-STRUCTURE.md`
- **GitHub:** https://github.com/tdk12111990-droid/stationmonitor

---

**Xong! System chạy bình thường. 🚀**
