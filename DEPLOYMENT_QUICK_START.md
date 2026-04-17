# 🚀 StationMonitor Deployment — Quick Start

**Dự án của bạn đã sẵn sàng 95%** để deploy lên Jetson. Dưới đây là 5 bước nhanh nhất:

---

## 📋 Tình hình hiện tại (2026-04-17)

✅ **Hoàn thành:**
- Backend: 16 controllers, 55+ endpoints, đầy đủ logic CBM/Health Score
- Frontend: 14 pages, tất cả kết nối API thật
- Database: PostgreSQL TimescaleDB, 20+ tables
- Workers: Protocol (Modbus/MQTT/IEC-104), EarlyWarning, HealthScore
- Tests: 42 API tests, 5 E2E Playwright specs
- Docker: Multi-stage Dockerfile, docker-compose.yml sẵn sàng
- **Vừa fix:** Frontend hardcode localhost → dùng env variables ✨

❌ **Chưa làm:**
- Jetson chưa cài đặt (bạn vừa mua)
- Frontend chưa build với Jetson IP
- Chưa test trên LAN thực tế

---

## 🎯 5 Bước Deploy (ước tính 1-2 ngày test ở nhà)

### **Bước 1: Chuẩn bị Jetson (30 phút)**

```bash
# SSH vào Jetson, cài Docker
ssh jetson@<JETSON_IP>
sudo apt update
sudo apt install -y docker.io docker-compose-v2

# Kiểm tra
docker --version
docker compose version
```

---

### **Bước 2: Push code lên Jetson (15 phút)**

**Windows PowerShell:**
```powershell
# Copy code lên Jetson
scp -r D:\StationMonitor jetson@192.168.1.100:/home/jetson/

# Hoặc dùng git (nếu có)
ssh jetson@192.168.1.100
cd /home/jetson
git clone <repo> StationMonitor
cd StationMonitor
```

---

### **Bước 3: Chạy Deploy Script (5-10 phút)**

```bash
# Từ Jetson
cd ~/StationMonitor
chmod +x deploy-jetson.sh
sudo ./deploy-jetson.sh

# Chờ... (build backend Docker image ~ 3-5 phút)
# Output: ✅ TRIỂN KHAI THÀNH CÔNG!

# Kiểm tra container
docker compose ps
```

**Bước này sẽ:**
- ✅ Tạo thư mục `/data` (database, MQTT, media)
- ✅ Build backend Docker image (ARM64)
- ✅ Start 4 container: DB, MQTT, Backend, go2rtc

---

### **Bước 4: Build Frontend (10 phút)**

**Trên máy tính bạn:**

```powershell
cd D:\StationMonitor\frontend

# Set env cho Jetson IP ở nhà (192.168.1.100 example)
$env:VITE_API_URL = "http://192.168.1.100:5056"
$env:VITE_GO2RTC_URL = "http://192.168.1.100:1984"

# Build desktop app
npm install
npm run desktop:build:full

# Output: target/release/bundle/msi/StationMonitor.msi (hoặc .exe)
```

---

### **Bước 5: Test (1 ngày)**

**Kiểm tra Backend:**
```bash
# Từ máy tính bạn (hoặc Jetson)
curl http://192.168.1.100:5056
# Output: {"message":"hello"} ✅
```

**Kiểm tra Frontend:**
1. **Dev mode (nhanh):**
   ```bash
   cd frontend
   npm run dev
   # Mở browser: http://localhost:5173
   # Login: admin / Admin@123
   ```

2. **Desktop app (production-like):**
   - Chạy installer: `target/release/bundle/msi/StationMonitor.msi`
   - App sẽ kết nối tới Jetson 192.168.1.100:5056

**Kiểm tra từng feature:**
- ✅ Dashboard → SLD diagram load
- ✅ Realtime Monitor → Camera streams
- ✅ Alerts History → Dữ liệu load
- ✅ Analytics → 6 tabs, chart render
- ✅ Settings → Cloud Sync status

---

## 📊 Network Setup ở nhà test

```
Jetson (192.168.1.100)
  ├─ Backend: 5056
  ├─ go2rtc: 1984
  ├─ PostgreSQL: 5432
  └─ MQTT: 1883
       ↑
   Cùng WiFi/LAN
       ↓
Máy tính bạn (192.168.1.X)
  ├─ Frontend dev: 5173
  ├─ Desktop app: frontend.exe
  └─ Tailscale VPN (optional, để remote access)
```

---

## ⚡ Khi xuống trạm thực tế

1. **Đổi Jetson IP** trong frontend env:
   ```powershell
   $env:VITE_API_URL = "http://192.168.10.50:5056"  # IP thực tế tại trạm
   npm run desktop:build:full
   ```

2. **Cài đặt Jetson tại trạm:**
   - Kết nối LAN với camera/PLC/PC
   - Chạy `docker compose up -d`

3. **Cài PC tại trạm:**
   - Copy desktop app installer
   - Chạy installer, app tự kết nối Jetson

4. **Kiểm tra:**
   - Login → Dashboard → Camera → Alerts

---

## 🔐 Bước Extra: Security (nên làm trước production)

Edit `docker-compose.yml`:
```yaml
environment:
  - Jwt__Key=<GEN_NEW_KEY_OPENSSL_RAND>  # thay secret
  - POSTGRES_PASSWORD=<NEW_STRONG_PASSWORD>  # thay DB password
```

---

## 📚 Tài liệu chi tiết

- **`JETSON_DEPLOYMENT_GUIDE.md`** — Hướng dẫn đầy đủ từng bước
- **`PUSH_TO_JETSON.md`** — Cách push code update khi có bug fix
- **`docker-compose.yml`** — Container config
- **`deploy-jetson.sh`** — Deployment script (chỉ cần chạy 1 lần)

---

## ✅ Checklist trước bắt đầu

- [ ] Jetson đã cài JetPack OS chưa?
- [ ] Có cáp Ethernet / WiFi kết nối Jetson?
- [ ] Biết IP của Jetson ở nhà chưa?
- [ ] Đã read `JETSON_DEPLOYMENT_GUIDE.md`?
- [ ] Clone/pull code mới nhất?

---

## 🆘 Nếu gặp vấn đề

| Vấn đề | Giải pháp |
|--------|----------|
| Container không chạy | `docker compose logs stationmonitor-backend` |
| Frontend không kết nối backend | Check `VITE_API_URL`, ping IP Jetson |
| Database error | `docker compose down && docker compose up -d --build` |
| Port bị chiếm | `lsof -i :5056` → kill process |
| Jetson chậm | Kiểm tra CPU/Memory: `docker stats` |

---

## 🎉 Khi xong

- Backend + Frontend chạy trên Jetson ✅
- Có thể monitor 24/7 từ PC tại trạm ✅
- Có thể debug remote qua Tailscale (tùy chọn) ✅
- Sẵn sàng cho AI Phase (khi có data) ✅

**Ước tính toàn bộ process: 2-3 ngày ở nhà test, 1 ngày deploy tại trạm.**

