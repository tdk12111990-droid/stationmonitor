# Setup Guide — StationMonitor

> Hướng dẫn cài đặt từng thành phần. Chạy lần đầu hoặc setup máy mới.

---

## Yêu cầu hệ thống

| Thành phần | Version tối thiểu |
|------------|-------------------|
| Windows | 10 Pro / 11 (cho HCNetSDK.dll) |
| .NET SDK | 8.0.x |
| Node.js | 18 LTS hoặc 20 LTS |
| Python | 3.11+ |
| Docker Desktop | 4.x (cho TimescaleDB) |
| Git | 2.40+ |

---

## 1. Database (TimescaleDB)

```bash
# Chạy container
docker run -d --name stationmonitor-db \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_DB=stationmonitor \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg16

# Verify
docker exec stationmonitor-db psql -U postgres -c "SELECT version();"
```

Chạy migration:
```bash
cd backend
dotnet ef database update \
  --project StationMonitor.Data \
  --startup-project StationMonitor.Api
```

Seed dữ liệu mẫu (optional):
```bash
dotnet run --project StationMonitor.Api -- --seed
```

---

## 2. Backend (ASP.NET Core 8)

```bash
# Build
cd backend
dotnet restore
dotnet build StationMonitor.sln

# Config (copy & sửa)
cp StationMonitor.Api/appsettings.json.example StationMonitor.Api/appsettings.json
# Sửa: ConnectionStrings, Jwt.Key, Smtp, Go2Rtc, Media.FFmpegPath
```

`appsettings.json` quan trọng:
```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=stationmonitor;Username=postgres;Password=postgres123"
  },
  "Jwt": {
    "Key": "CHANGE-ME-minimum-64-characters-secret-key-here-!",
    "ExpiryMinutes": 480
  },
  "Go2Rtc": { "ApiUrl": "http://localhost:1984" },
  "Media":  { "FFmpegPath": "d:\\StationMonitor\\media-server\\ffmpeg.exe" },
  "Smtp": {
    "Host": "smtp.gmail.com", "Port": "587",
    "User": "your@gmail.com", "Password": "app-password"
  }
}
```

Chạy:
```bash
cd backend/StationMonitor.Api
dotnet run
# API: http://localhost:5056
# Swagger: http://localhost:5056/swagger (dev mode)
```

Đăng nhập mặc định: `admin / Admin@123` → **đổi ngay**.

---

## 3. Frontend (Vite + TypeScript)

```bash
cd frontend
npm install

# Config
cp .env.example .env
# Sửa VITE_API_URL=http://localhost:5056/api/v1
```

Chạy:
```bash
npm run dev
# http://localhost:5173
```

Build production:
```bash
npm run build
# → frontend/dist/ (serve bằng nginx hoặc IIS)
```

TypeScript check:
```bash
npx tsc --noEmit
```

---

## 4. go2rtc (RTSP → WebRTC)

Binary `media-server/go2rtc.exe` đã có trong repo (gitignored nếu > 100MB).

```bash
cd media-server
go2rtc.exe -config go2rtc.yaml
# WebRTC: http://localhost:1984
# RTSP push: rtsp://localhost:8554
```

`go2rtc.yaml` — stream từ camera thật:
```yaml
streams:
  camera_152_normal:
    - rtsp://admin:Demo@2024@192.168.10.152:554/Streaming/Channels/101
  camera_152_thermal:
    - rtsp://admin:Demo@2024@192.168.10.152:554/Streaming/Channels/201
  camera_153_pd:
    - rtsp://tladmin:Ab@12345@192.168.10.153:554/Streaming/Channels/101
```

---

## 5. SDK Relay (Python — Thermal Camera)

> **Lưu ý**: Relay cần Windows vì HCNetSDK.dll là Windows-only.
> Để deploy lên Jetson → xem `docs/modules/jetson-ai.md`.

```bash
cd sdk-relay

# Tạo virtualenv
python -m venv .venv
.venv\Scripts\activate

# Cài thư viện
pip install -r requirements.txt
```

`requirements.txt`:
```
requests==2.31.0
python-dotenv==1.0.0
ctypes-callable==0.1.0
```

Config `.env`:
```bash
CAMERA_IP=192.168.10.152
CAMERA_USER=admin
CAMERA_PASSWORD=Demo@2024
API_URL=http://localhost:5056/api/v1
WWWROOT_PATH=D:\StationMonitor\backend\StationMonitor.Api\wwwroot
```

Chạy:
```bash
python enhanced_relay.py
```

SDK DLLs cần có trong `sdk-relay/test_sdk/`:
- `HCNetSDK.dll`
- `HCCore.dll`
- `AudioRender.dll`
- (và các dll phụ khác từ Hikvision SDK package)

---

## 6. Khởi động nhanh — toàn hệ thống

```bash
# Cài đặt lần đầu (chạy với quyền Admin)
scripts\setup-env.bat

# Khởi động tất cả service
start.bat

# Dừng
stop.bat
```

Thứ tự khởi động khi thủ công:
1. Docker DB (luôn chạy nền)
2. Backend (`dotnet run`)
3. go2rtc (`go2rtc.exe -config go2rtc.yaml`)
4. SDK Relay (`python enhanced_relay.py`)
5. Frontend (`npm run dev`)

---

## 7. Mobile App (React Native)

```bash
cd app-mobile
npm install

# Dev với Expo Go
npx expo start
# → Quét QR trên máy Android/iOS

# Build APK
cd android
./gradlew assembleRelease
```

Cần: JDK 17, Android SDK (API 34), Expo CLI.

---

## 8. Cloudflare Tunnel (Remote access)

Expose backend ra internet:
```bash
scripts\cloudflare-tunnel.bat
```

Hoặc thủ công:
```bash
cloudflared tunnel --url http://localhost:5056
```

URL tunnel `https://xxx.trycloudflare.com` → cập nhật vào `app-mobile/.env` để app mobile kết nối từ xa.

---

## 9. Tests

```bash
# API integration (cần backend đang chạy)
node tests/api/test-api.mjs

# Protocol tests
node tests/api/test-protocol.mjs

# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Frontend E2E (cần backend + frontend đang chạy)
cd frontend && npx playwright test

# Backend unit tests
cd backend && dotnet test

# Health check tổng thể
scripts\run-tests.bat
```

---

## 10. Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|-----|-------------|-----|
| `ECONNREFUSED 5056` | Backend chưa chạy | `cd backend/StationMonitor.Api && dotnet run` |
| `ECONNREFUSED 5432` | DB container chưa chạy | `docker start stationmonitor-db` |
| `DLL not found` | Thiếu HCNetSDK.dll | Copy từ Hikvision SDK package vào `sdk-relay/test_sdk/` |
| `CORS error` | Frontend URL khác 5173 | Sửa `WithOrigins` trong `Program.cs` |
| `JWT invalid` | Key < 64 chars | Tăng độ dài `Jwt.Key` trong `appsettings.json` |
| Canvas điểm lệch | letterbox chưa load | Đảm bảo gọi overlay sau `loadedmetadata` |
| `go2rtc no stream` | Camera offline | Kiểm tra ping camera + RTSP URL credentials |
