# StationMonitor – Hệ thống Giám sát Trạm Điện Thông Minh

Phần mềm giám sát trạm biến áp gồm: cảm biến nhiệt độ/phóng điện (PLC Siemens S7-1200), camera an ninh/nhiệt ảnh (Hikvision), và AI phát hiện xâm nhập (YOLO – Phase 3).

---

## Cấu trúc dự án

```
StationMonitor/
├── backend/        ASP.NET Core 8 API  (port 5056)
├── frontend/       Vite + TypeScript   (port 5173)
├── start.bat       Khởi động tất cả service
├── stop.bat        Dừng tất cả service
└── requirements.txt  Python deps cho AI module (Phase 3)
```

---

## Cài đặt & Chạy

### Yêu cầu hệ thống (System Requirements)

Để chạy dự án, bạn cần cài đặt các thành phần sau. Bạn có thể cài đặt thủ công hoặc dùng lệnh tự động:

#### 🚀 Cách 1: Cài đặt tự động (Khuyên dùng Windows)
Chuột phải vào file **`setup-env.bat`** tại thư mục gốc và chọn **"Run as Administrator"**. Lệnh này sẽ tự động tải và cài đặt:
- .NET 8 SDK
- Node.js 20+
- Docker Desktop (cho Database)
- DBeaver (Công cụ quản lý DB)
- Git

#### 🛠️ Cách 2: Cài đặt thủ công
- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [DBeaver Community](https://dbeaver.io/download/)
- Python 3.11+ (chỉ cần khi làm AI module – Phase 3)

### 1. Khởi động Database (TimescaleDB)
```bash
docker run -d --name stationmonitor-db \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_DB=stationmonitor \
  -p 5432:5432 \
  -v D:/docker-data/stationmonitor-db:/var/lib/postgresql/data \
  timescale/timescaledb:latest-pg16
```

### 2. Cài dependencies Frontend
```bash
cd frontend
npm install
```

### 3. Cài dependencies Backend
```bash
cd backend
dotnet restore
```

### 4. Chạy hệ thống
```
Double-click start.bat
```
Hoặc chạy từng service thủ công — xem hướng dẫn chi tiết trong `backend/README.md`.

---

## Tài khoản mặc định
| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Admin@123` |

---

## Tài liệu chi tiết

| Tài liệu | Nội dung |
|----------|---------|
| `backend/README.md` | Hướng dẫn chạy backend, cấu hình DB, JWT |
| `backend/docs/progress.md` | Nhật ký tiến độ theo từng Phase |
| `backend/docs/bugs_and_fixes.md` | Lỗi đã gặp và cách xử lý |
| `backend/docs/plan_backend.md` | Kế hoạch backend đầy đủ |
| `frontend/CLAUDE.md` | Kiến trúc frontend, hướng dẫn dev |

---

## Trạng thái các Phase

| Phase | Nội dung | Trạng thái |
|-------|---------|-----------|
| Phase 1 | Frontend 13 trang, Auth, Router | ✅ Hoàn thành |
| Phase 2 | Backend API, PLC polling, SignalR, go2rtc, Device CRUD | ✅ Hoàn thành |
| Phase 3 | Rule Engine alerts, Cloudflare Tunnel (remote access) | 🔄 Đang làm |
| Phase 4 | AI YOLO pipeline, báo cáo PDF tự động | ⏳ Chưa bắt đầu |
