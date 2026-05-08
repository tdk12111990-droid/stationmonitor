# 🚀 Hướng dẫn Setup Jetson Orin Nano (Mới mua)

> **Thời gian:** 1-2 giờ  
> **Yêu cầu:** Jetson Orin Nano, SD card 64GB, nguồn 5A

---

## 1️⃣ **Bước 1: Flash JetPack (OS + CUDA + cuDNN)**

### Chuẩn bị
- **Tải JetPack 6.x** (Ubuntu 22.04 + CUDA 12.x)
  - Link: https://developer.nvidia.com/embedded/jetpack-sdk-61
  - **Chọn:** Jetson Orin Nano → JetPack 6.1 (latest)

- **Tải Balena Etcher** (flash tool)
  - https://www.balena.io/etcher/

### Flash SD Card
```bash
# Windows/Mac/Linux
1. Mở Balena Etcher
2. Select image → JetPack-6.1-xxx.img.xz (download sẵn)
3. Select drive → SD card của bạn (cẩn thận: sẽ xóa!)
4. Flash → chờ 10-15 phút
5. Đợi "Flash complete" xong, lấy SD card ra
```

---

## 2️⃣ **Bước 2: Boot lần đầu & Khởi tạo OS**

### Hardware Setup
```
Jetson Orin Nano physical:
┌─────────────────┐
│  ← UART (debug) │
│  USB-C (power)  │  ← Nối nguồn 5A tại đây
│  USB-A (host)   │
│  HDMI (monitor) │
│  microSD slot   │  ← Insert SD card đã flash
└─────────────────┘
```

### Khởi động
1. **Insert SD card** vào Jetson (khe ở dưới cùng)
2. **Nối cáp USB-C nguồn 5A**
3. **Nối HDMI** vào màn hình
4. **Nối USB mouse + keyboard**
5. LED sẽ sáng xanh → Jetson khởi động

### Setup GUI (lần đầu)
```
Jetson sẽ hỏi:
  ✅ Chọn ngôn ngữ: English
  ✅ Keyboard layout: English (US)
  ✅ WiFi: Kết nối hoặc bỏ qua (dùng Ethernet tốt hơn)
  ✅ Tài khoản: 
     Username: jetson
     Password: jetson123 (hoặc tùy chọn)
  ✅ NVIDIA account (optional, có thể skip)
  
  → Chờ 5-10 phút cài xong
```

**Result:** Jetson khởi động vào Desktop với Ubuntu 22.04

---

## 3️⃣ **Bước 3: Kết nối mạng & SSH**

### Via HDMI (hoặc SSH từ máy khác)

**Option A: Trên Jetson (HDMI)**
```bash
# Mở Terminal (Ctrl+Alt+T)

# Lấy IP address
ip addr show

# Kết quả: inet 192.168.x.x (ghi nhớ)
```

**Option B: SSH từ Windows/Mac/Linux**
```bash
# Từ máy tính chính của bạn
ssh jetson@192.168.x.x
# Nhập password: jetson123

# Lúc này bạn control Jetson remote qua terminal
```

**Recommend:** Dùng SSH + Terminal thay vì HDMI (dễ hơn)

---

## 4️⃣ **Bước 4: Update & Install Docker**

```bash
# SSH vào Jetson
ssh jetson@192.168.x.x

# Update package manager
sudo apt update
sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y
sudo usermod -aG docker jetson

# Logout & login lại để áp dụng group permissions
exit
ssh jetson@192.168.x.x

# Verify Docker
docker --version
# Output: Docker version 20.10.x...
```

---

## 5️⃣ **Bước 5: Install Docker Compose v2**

```bash
# Download docker-compose plugin
mkdir -p ~/.docker/cli-plugins/
curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose

# Verify
docker compose version
# Output: Docker Compose version v2.x...
```

---

## 6️⃣ **Bước 6: Clone StationMonitor & Deploy**

```bash
# Tạo working directory
mkdir -p ~/projects
cd ~/projects

# Clone repo
git clone https://github.com/your-org/StationMonitor.git
cd StationMonitor

# Copy .env nếu cần (hoặc giữ default)
# (Kiểm tra docker-compose.yml có port/password nào cần sửa)

# Deploy hệ thống
docker compose up -d

# Chờ 2-3 phút để containers start
docker compose ps

# Output:
# CONTAINER ID   IMAGE                              STATUS
# xxx            stationmonitor-db                  Up 2 minutes (healthy)
# xxx            eclipse-mosquitto:latest           Up 2 minutes
# xxx            alexxit/go2rtc:latest              Up 2 minutes
# xxx            stationmonitor-backend             Up 1 minute
```

---

## 7️⃣ **Bước 7: Verify Các Services**

### Check Database
```bash
# Kết nối PostgreSQL từ local
docker exec -it stationmonitor-db psql -U postgres -d stationmonitor -c "\dt"

# Output: Danh sách bảng (Devices, Sensors, Alerts, v.v.)
```

### Check Backend API
```bash
# Từ máy khác trong mạng
curl http://192.168.x.x:5056/api/v1/health

# Output:
# {"status":"healthy","uptime":"00:05:23","db":"connected"}
```

### Check go2rtc Streaming
```bash
# Truy cập web UI
http://192.168.x.x:1984

# Output: Danh sách streams (camera_152_normal, camera_152_thermal, v.v.)
```

### Check MQTT Broker
```bash
# Test connection
docker exec -it stationmonitor-mqtt mosquitto_sub -h localhost -t "#" -n

# Nếu không có output, broker đang chạy tốt
```

---

## 8️⃣ **Bước 8: Cấu hình Camera (Hikvision 152/153)**

```bash
# SSH vào Jetson
ssh jetson@192.168.x.x

# Chỉnh sửa go2rtc.yaml
nano ~/projects/StationMonitor/frontend/go2rtc.yaml
```

**Config camera:**
```yaml
streams:
  camera_152_normal:
    - rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/101
  camera_152_thermal:
    - rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/201
  camera_153_pd:
    - rtsp://admin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101
```

**Lưu:**
```
Ctrl+O → Enter → Ctrl+X
```

**Reload go2rtc:**
```bash
docker compose restart stationmonitor-streaming
# Chờ 10s
```

---

## 9️⃣ **Bước 9: Kiểm tra Frontend (từ máy tính)**

**Lưu ý:** Trên Jetson chạy backend API, frontend vẫn chạy trên máy Windows của bạn

```bash
# Từ máy Windows (D:\StationMonitor)
npm install
npm run dev

# Output:
# http://localhost:5173

# Trình duyệt:
# http://localhost:5173
# 
# → Login: admin / Admin@123
# → Dashboard hiển thị, camera stream chạy
```

**Nếu camera không hiện:**
- Kiểm tra IP Jetson trong frontend/.env
- `VITE_API_URL=http://192.168.x.x:5056`

---

## 🔟 **Bước 10: Performance Tuning (Optional)**

### Check GPU Usage
```bash
# SSH vào Jetson
ssh jetson@192.168.x.x

# Cài tegrastats
sudo apt install -y nvidia-jetson-stats

# Chạy
jtop

# Output:
# GPU: 10% | Mem: 4G/16G | Temp: 45°C
# (Theo dõi realtime)
```

### Cấu hình CPU Governor (tối ưu hiệu suất)
```bash
# Chọn performance mode (mặc định: ondemand)
echo "performance" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Verify
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
# Output: performance
```

---

## ⚠️ **Troubleshooting**

| Vấn đề | Giải pháp |
|--------|----------|
| Docker không chạy | `sudo systemctl start docker` |
| Containers không start | `docker compose logs backend` → xem lỗi |
| Mất kết nối SSH | Kiểm tra IP, `sudo systemctl restart networking` |
| Database connection error | `docker compose restart stationmonitor-db` |
| Camera không stream | Kiểm tra RTSP URL, đổi port nếu dùng proxy |
| Jetson quá nóng (>65°C) | Tắt các container không dùng, tăng cooling |

---

## 📋 **Checklist Setup**

- [ ] JetPack 6.x flashed vào SD card
- [ ] Jetson boot + SSH hoạt động
- [ ] Docker + Docker Compose cài xong
- [ ] StationMonitor clone + `docker compose up -d`
- [ ] Tất cả 4 containers chạy (healthy)
- [ ] Camera stream hiển thị trên go2rtc web UI
- [ ] Frontend kết nối Backend API (`/api/v1/health` = 200)
- [ ] Dashboard hiển thị dữ liệu từ PLC
- [ ] Performance tuning hoàn thành

---

## 🎉 **Setup xong! Tiếp theo:**

1. **Cấu hình Camera Webhooks** (phía Hikvision web)
   - URL: `http://192.168.x.x:5056/api/v1/camera-webhook`

2. **Cấu hình PLC kết nối** (Device Management)
   - IP: 192.168.10.100

3. **Deploy AI gRPC Service** (khi cần)
   - Python sidecar chạy trên cổng 50051

4. **Tuning Rules & Alerts**
   - Thông qua frontend Rule Engine

---

**Cần hỗ trợ?** Check docker logs:
```bash
docker compose logs -f backend
```
