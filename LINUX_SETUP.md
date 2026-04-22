# StationMonitor — Hướng Dẫn Chạy Trên Linux/Ubuntu

## 📋 Yêu Cầu Hệ Thống

- **OS**: Ubuntu 20.04+ / Debian 11+
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Node.js**: 16+
- **Python**: 3.8+
- **FFmpeg**: 4.2+ (tùy chọn, để ghi video)

## 🚀 Cài Đặt (Lần Đầu)

### 1. Cài Đặt Các Công Cụ Cần Thiết

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài Docker
sudo apt install -y docker.io docker-compose

# Cài Node.js (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Cài Python 3 + pip
sudo apt install -y python3 python3-pip python3-venv

# Cài FFmpeg (để ghi video từ camera)
sudo apt install -y ffmpeg

# Cho phép user chạy Docker mà không cần sudo (tuỳ chọn)
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone / Setup Project

```bash
# Vào thư mục project
cd /path/to/StationMonitor

# Cấp quyền execute cho scripts
chmod +x run-all.sh stop-all.sh

# Cấu hình camera (nếu cần)
nano sdk-relay/notifications/config.json
```

### 3. Tạo .env File (Tùy Chọn)

Nếu Backend cần cấu hình:
```bash
# backend/.env
ASPNETCORE_ENVIRONMENT=Production
DATABASE_URL=postgresql://user:password@localhost:5432/stationmonitor
```

---

## ▶️ Chạy Hệ Thống

### Cách 1: Chạy Tất Cả (Khuyên Dùng)

```bash
./run-all.sh
```

Sẽ tự động khởi động:
- ✅ Backend (Docker) — port 5056
- ✅ Camera Notifications (Python) — đợi input từ camera
- ✅ Frontend (Vite) — port 5173

Kết quả:
```
===================================================
 TAT CA SERVICE DA KHOI DONG!

 Frontend    : http://localhost:5173
 Backend API : http://localhost:5056
 go2rtc      : http://localhost:1984
===================================================
```

### Cách 2: Chạy Riêng Lẻ (Để Debug)

**Terminal 1 — Backend:**
```bash
sudo docker-compose up
```

**Terminal 2 — Notification System:**
```bash
cd sdk-relay/notifications
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

**Terminal 3 — Frontend:**
```bash
cd frontend
npm install  # nếu lần đầu
npm run dev -- --host
```

---

## 🛑 Dừng Hệ Thống

```bash
# Nếu đang chạy run-all.sh:
# Nhấn Ctrl+C

# Hoặc từ terminal khác:
./stop-all.sh
```

---

## 📱 Truy Cập

### Localhost
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5056
- **go2rtc**: http://localhost:1984

### Qua Tailscale (Remote)
```bash
# Xem IP Tailscale
tailscale ip -4

# Truy cập
http://<TAILSCALE_IP>:5173
```

### Qua SSH Tunnel
```bash
# Từ máy local
ssh -L 5173:localhost:5173 user@remote-host
# Rồi mở http://localhost:5173
```

---

## 🔍 Kiểm Tra Logs

### Frontend
```bash
# Đang chạy trong terminal, xem ngay
```

### Backend (Docker)
```bash
docker-compose logs -f
```

### Notification System
```bash
tail -f sdk-relay/notifications/notifications.log
```

---

## ❌ Khắc Phục Lỗi

### "Docker daemon is not running"
```bash
sudo systemctl start docker
# Hoặc
sudo /etc/init.d/docker start
```

### "Cannot connect to backend (5056)"
```bash
# Kiểm tra container
docker-compose ps

# Xem logs
docker-compose logs -f

# Nếu cần, rebuild
docker-compose down
docker-compose up -d
```

### "Port 5173 already in use"
```bash
# Tìm process
lsof -i :5173

# Kill process
kill -9 <PID>

# Hoặc dùng port khác
cd frontend
npm run dev -- --host --port 5174
```

### "FFmpeg not found"
```bash
sudo apt install ffmpeg
# Rồi khởi động lại notification system
```

### "Python venv error"
```bash
cd sdk-relay/notifications
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 📊 Monitoring

### Kiểm tra status tất cả services
```bash
# Docker containers
docker-compose ps

# Python processes
ps aux | grep python

# Node.js processes
ps aux | grep node
```

### Xem resource usage
```bash
# Docker stats
docker stats

# System stats
htop
```

---

## 🔐 Bảo Mật (Production)

### 1. Đổi mật khẩu admin
```bash
# Khi login lần đầu
Username: admin
Password: Admin@123
# Đổi ngay tại: Settings
```

### 2. Bật HTTPS
Sử dụng reverse proxy (nginx/Apache) hoặc Let's Encrypt.

### 3. Firewall
```bash
sudo ufw enable
sudo ufw allow 5056
sudo ufw allow 5173
sudo ufw allow 22
```

### 4. Backup Database
```bash
# Hằng ngày
docker-compose exec -T postgres pg_dump -U stationmonitor stationmonitor > backup_$(date +%Y%m%d).sql
```

---

## 📝 Cấu Hình Nâng Cao

### Camera Settings (Web UI)
Trang **Settings → Hành động Liên kết (Camera)**:
- Capture Photo
- Record Video (10-15s)
- Cooldown (chống spam)
- Filter Time (chống nhiễu)

### Thay Đổi IP Camera
```bash
nano sdk-relay/notifications/config.json

# Sửa:
"camera_152": {
  "ip": "192.168.X.X",  // IP mới
  ...
}

# Khởi động lại notification system
./stop-all.sh
./run-all.sh
```

### Tăng/Giảm Thời Gian Ghi Video
```bash
# File: sdk-relay/notifications/camera_152.py
# Dòng ~334
duration=15  # Đổi thành 10, 20, 30 tùy ý

# Rồi restart
```

---

## 🆘 Support

Nếu gặp lỗi:

1. **Kiểm tra logs** (xem trên)
2. **Kiểm tra network**:
   ```bash
   ping 192.168.10.152  # Camera IP
   curl http://localhost:5056  # Backend
   ```
3. **Restart tất cả**:
   ```bash
   ./stop-all.sh
   sleep 5
   ./run-all.sh
   ```

---

**Hướng dẫn này cho Ubuntu 20.04+. Các phiên bản khác có thể cần điều chỉnh tương tự.**
