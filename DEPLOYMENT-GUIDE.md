# Hướng dẫn Deploy StationMonitor lên Ubuntu Server (HPE DL380)

## 1. Chuẩn bị Server

### 1.1 Cài đặt OS
- Ubuntu 22.04 LTS (hoặc 20.04)
- Cấp quyền admin cho user cài đặt
- Kết nối mạng LAN với camera/PLC (192.168.10.0/24)

### 1.2 Cấu hình IP tĩnh cho DL380
```bash
# Chỉnh sửa netplan
sudo nano /etc/netplan/00-installer-config.yaml
```

**Nội dung mẫu:**
```yaml
network:
  version: 2
  ethernets:
    ens3:  # Tên interface, dùng `ip link` để kiểm tra
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
ip addr show  # Kiểm tra IP
```

---

## 2. Cài đặt Docker & Dependencies

```bash
# Update hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Cài Docker Compose
sudo apt install docker-compose-v2 -y

# Kiểm tra
docker --version
docker compose version

# Cài Git
sudo apt install git -y

# Cài PostgreSQL client (để backup/restore DB nếu cần)
sudo apt install postgresql-client -y
```

---

## 3. Clone Project từ GitHub

```bash
# Chọn thư mục (ví dụ /opt)
cd /opt
sudo mkdir -p stationmonitor
sudo chown $USER:$USER stationmonitor
cd stationmonitor

# Clone repo
git clone https://github.com/tdk12111990-droid/stationmonitor.git .
git checkout main
```

---

## 4. Tải Linux SDK cho Camera (Hikvision)

### 4.1 Tải từ Hikvision Developer Center
1. Vào https://www.hikvision.com/en/support/
2. Tìm **HCNetSDK Linux Version** (v6.x.x trở lên)
3. Tải file `.tar.gz` hoặc `.zip`

### 4.2 Giải nén vào đúng vị trí
```bash
cd /opt/stationmonitor/sdk-relay/test_sdk/lib

# Nếu file là .tar.gz
tar -xzf ~/HCNetSDK_V6.x.x_build_Linux_x64.tar.gz -C ./linux/

# Nếu file là .zip
unzip ~/HCNetSDK_V6.x.x_build_Linux_x64.zip -d ./linux/

# Kiểm tra
ls -la ./linux/
# Phải thấy: libhcnetsdk.so, libPlayCtrl.so, HCNetSDKCom/...
```

### 4.3 Cấp quyền
```bash
chmod +x ./linux/*.so
chmod -R +x ./linux/HCNetSDKCom/
```

---

## 5. Cấu hình Database & Environment

### 5.1 Tạo thư mục data
```bash
cd /opt/stationmonitor

mkdir -p data/pgdata
mkdir -p data/mosquitto/config
mkdir -p data/mosquitto/data
mkdir -p data/mosquitto/log
mkdir -p data/media

chmod 777 data/pgdata
chmod 777 data/mosquitto
```

### 5.2 Tạo Mosquitto config
```bash
cat > data/mosquitto/config/mosquitto.conf << 'EOF'
listener 1883
protocol mqtt

listener 9001
protocol websockets

allow_anonymous true
EOF

chmod 644 data/mosquitto/config/mosquitto.conf
```

### 5.3 Cấu hình env var cho camera/PLC (tuỳ chọn)
```bash
# Tạo .env file cho docker-compose (nếu muốn override)
cat > .env << 'EOF'
CAM152_IP=192.168.10.152
CAM153_IP=192.168.10.153
PLC_IP=192.168.10.100
CAMERA_USER=admin
CAMERA_PASSWORD=Demo@2024
EOF

chmod 600 .env  # Chỉ cho phép chủ sở hữu đọc
```

---

## 6. Kiểm tra kết nối trước khi chạy

```bash
# Ping camera & PLC
ping -c 2 192.168.10.152
ping -c 2 192.168.10.153
ping -c 2 192.168.10.100

# Kiểm tra RTSP stream có sẵn không
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/192.168.10.152/554' && echo "Port 554 open" || echo "Port 554 closed"
```

---

## 7. Build & Chạy Docker Compose

### 7.1 Build image lần đầu
```bash
cd /opt/stationmonitor

docker compose build --no-cache

# Nếu muốn xem log chi tiết
docker compose build --progress=plain
```

### 7.2 Khởi động services
```bash
# Chạy ở background
docker compose up -d

# Hoặc chạy foreground để xem log (Ctrl+C để dừng)
docker compose up
```

### 7.3 Kiểm tra services
```bash
# Xem trạng thái tất cả container
docker compose ps

# Xem log từng service
docker compose logs stationmonitor-db        # Database
docker compose logs stationmonitor-backend   # Backend API
docker compose logs stationmonitor-streaming # go2rtc
docker compose logs stationmonitor-ai        # SDK Relay

# Theo dõi log real-time
docker compose logs -f stationmonitor-backend
```

---

## 8. Kiểm tra API hoạt động

```bash
# Chờ backend khởi động (~30 giây)
sleep 30

# Kiểm tra health check
curl http://localhost:5056/api/v1/health

# Nếu return: {"status":"ok"} → Backend OK

# Kiểm tra go2rtc
curl http://localhost:1984/api/streams

# Kiểm tra database
docker compose exec stationmonitor-db psql -U postgres -d stationmonitor -c "SELECT COUNT(*) FROM \"Devices\";"
```

---

## 9. Mở Firewall (nếu cần)

```bash
sudo ufw allow 5056/tcp  # Backend API
sudo ufw allow 1984/tcp  # go2rtc HTTP
sudo ufw allow 8554/tcp  # go2rtc RTSP
sudo ufw allow 1883/tcp  # MQTT
sudo ufw allow 5432/tcp  # PostgreSQL (chỉ localhost + Docker network)
```

---

## 10. Cấu hình Desktop App (tại Trạm)

### 10.1 Cấu hình .env cho desktop app
```bash
# Trên máy dev (Windows)
cd StationMonitor/frontend

# Sửa .env.station với IP DL380
nano .env.station
```

**Nội dung:**
```
VITE_API_URL=http://192.168.10.50:5056
VITE_GO2RTC_URL=http://192.168.10.50:1984
```

### 10.2 Build desktop app
```bash
# Copy config
cp .env.station .env.local

# Build (tạo file .msi cho Windows)
npm run tauri build

# File output: src-tauri/target/release/bundle/msi/StationMonitor_*.msi
```

### 10.3 Cài đặt trên máy tại trạm
- Copy file `.msi` sang máy tại trạm
- Double-click để cài đặt
- Chạy ứng dụng → tự kết nối đến `192.168.10.50:5056`

---

## 11. Backup & Restore Database

### 11.1 Backup
```bash
# Backup toàn bộ DB
docker compose exec -T stationmonitor-db pg_dump -U postgres stationmonitor > backup_$(date +%Y%m%d_%H%M%S).sql

# Kiểm tra file
ls -lh backup_*.sql
```

### 11.2 Restore
```bash
# Khôi phục từ backup
docker compose exec -T stationmonitor-db psql -U postgres stationmonitor < backup_20260421_143000.sql
```

---

## 12. Dừng & Xóa Services

### 12.1 Dừng tạm (giữ data)
```bash
docker compose down
```

### 12.2 Xóa hoàn toàn (xóa cả data)
```bash
docker compose down -v  # -v = xóa volume
rm -rf data/
```

---

## 13. Troubleshooting

### 13.1 Backend không kết nối được DB
```bash
# Kiểm tra DB có chạy không
docker compose ps | grep db

# Kiểm tra log DB
docker compose logs stationmonitor-db | tail -50

# Restart DB
docker compose restart stationmonitor-db
```

### 13.2 Camera không kết nối được
```bash
# Kiểm tra log relay
docker compose logs stationmonitor-ai | tail -50

# Kiểm tra IP camera từ trong container
docker compose exec stationmonitor-ai ping 192.168.10.152

# Kiểm trap firewall server
sudo ufw status
```

### 13.3 go2rtc không stream được
```bash
# Kiểm tra log streaming
docker compose logs stationmonitor-streaming | tail -50

# Kiểm tra go2rtc API
curl http://localhost:1984/api/streams

# Restart go2rtc
docker compose restart stationmonitor-streaming
```

### 13.4 Desktop app không kết nối server
- Kiểm tra IP server trong `.env.local` có đúng không
- Kiểm tra firewall máy tại trạm `ping 192.168.10.50`
- Kiểm tra backend API chạy: `curl http://192.168.10.50:5056/api/v1/health`

---

## 14. Cập nhật Code từ GitHub

```bash
cd /opt/stationmonitor

# Lấy code mới
git pull origin main

# Rebuild & restart
docker compose up -d --build
```

---

## 15. Monitoring & Logs (Tuỳ chọn)

### 15.1 Xem tất cả log
```bash
docker compose logs --tail=100 -f
```

### 15.2 Xem log từ file
```bash
# Log sẽ lưu trong container, không xuất ra host
# Để lưu log ra file host:

docker compose logs > all_logs_$(date +%Y%m%d_%H%M%S).txt
```

### 15.3 Dọn dẹp log cũ (nếu disk đầy)
```bash
# Docker log có thể chiếm không gian lớn
docker system prune -a  # Cẩn thận: xóa tất cả unused images

# Hoặc giới hạn log size
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF

sudo systemctl restart docker
```

---

## Quick Start Summary

```bash
# 1. Setup server
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Clone & prepare
cd /opt
git clone https://github.com/tdk12111990-droid/stationmonitor.git
cd stationmonitor
mkdir -p data/{pgdata,mosquitto,media}

# 3. Tải SDK Linux
# → Giải nén vào sdk-relay/test_sdk/lib/linux/

# 4. Chạy
docker compose up -d --build

# 5. Kiểm tra
sleep 30
curl http://localhost:5056/api/v1/health
docker compose ps
```

---

## Contacts & Support

- **GitHub:** https://github.com/tdk12111990-droid/stationmonitor
- **Backend logs:** `docker compose logs stationmonitor-backend`
- **API Docs:** `http://192.168.10.50:5056/swagger` (nếu Swagger enabled)
