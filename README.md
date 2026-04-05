# StationMonitor – Hệ thống Giám sát Trạm Điện Thông Minh

Phần mềm giám sát trạm biến áp gồm: cảm biến nhiệt độ/phóng điện (PLC Siemens S7-1200), camera an ninh/nhiệt ảnh (Hikvision), và AI phát hiện xâm nhập (YOLO – Phase 4).

---

## Cấu trúc dự án

```
StationMonitor/
├── backend/            ASP.NET Core 8 API
│   └── Dockerfile      Cấu hình đóng gói cho Linux/Jetson
├── frontend/           Vite + TypeScript
├── docker-compose.yml  Cấu hình chạy đa dịch vụ (DB, MQTT, API)
├── setup-env.bat       Cài đặt môi trường (Windows)
├── deploy-jetson.sh    Cài đặt môi trường (Linux/Jetson)
├── start.bat           Khởi động tất cả (Windows)
├── stop.bat            Dừng tất cả (Windows)
└── requirements.txt    Python deps cho AI module
```

---

## 🚀 Clone & Chạy (Người mới bắt đầu)

> Chỉ cần **2 bước** để chạy được dự án từ đầu.

### Bước 1 — Clone code về máy
```bash
git clone https://github.com/tdk12111990-droid/stationmonitor.git
cd stationmonitor
```

### Bước 2 — Cài đặt môi trường (Chạy 1 lần duy nhất)
Chuột phải vào **`setup-env.bat`** → chọn **"Run as Administrator"**

Script này sẽ tự động:
- ✅ Kiểm tra và cài .NET 8, Node.js, Docker, Git, DBeaver, Python
- ✅ Tạo container TimescaleDB (Database) tự động
- ✅ Cài thư viện Python cho AI module

> ⚠️ Nếu script yêu cầu **khởi động lại máy** (sau khi cài Docker) → Khởi động lại rồi chạy lại `setup-env.bat` một lần nữa.

### Bước 3 — Chạy hệ thống hàng ngày
Double-click **`start.bat`** — trình duyệt sẽ tự động mở.

```
Tài khoản mặc định:
  Username: admin
  Password: Admin@123
```

---

## 🔄 Cập nhật khi có code mới

Khi nhận được thông báo có bản cập nhật mới, chạy lệnh:

```bash
git pull
```

Nếu có thay đổi về thư viện (thông báo trong release notes):
```bash
# Cập nhật thư viện Frontend
cd frontend && npm install && cd ..

# Cập nhật thư viện Backend
cd backend && dotnet restore && cd ..
```

Sau đó chạy lại `start.bat` như bình thường.

---

## 🚢 Triển khai lên Jetson Orin Nano (Linux/ARM64)

Dự án đã được đóng gói sẵn để chạy trên Jetson mà **không cần cài đặt thủ công** từng phần mềm.

1. **Zip** toàn bộ thư mục `StationMonitor` và copy sang Jetson.
2. Mở Terminal tại thư mục dự án trên Jetson và chạy:
   ```bash
   chmod +x deploy-jetson.sh
   sudo ./deploy-jetson.sh
   ```
3. Xem chi tiết tại: [Hướng dẫn Triển khai Jetson](.system_generated/artifacts/walkthrough.md) (Xem trong file `walkthrough.md` nếu đường dẫn lỗi).

---

## 📤 Đẩy code lên GitHub (Dành cho Developer)

```bash
# 1. Kiểm tra những gì đã thay đổi
git status

# 2. Thêm tất cả file đã sửa
git add .

# 3. Tạo commit với mô tả rõ ràng
git commit -m "feat: mô tả tính năng mới"
#  hoặc:
git commit -m "fix: mô tả lỗi đã sửa"
#  hoặc:
git commit -m "docs: cập nhật tài liệu"

# 4. Đẩy lên GitHub
git push
```

### Quy ước đặt tên commit:
| Prefix | Ý nghĩa | Ví dụ |
|:---|:---|:---|
| `feat:` | Tính năng mới | `feat: thêm trang báo cáo PDF` |
| `fix:` | Sửa lỗi | `fix: sửa lỗi camera 153 màn đen` |
| `docs:` | Cập nhật tài liệu | `docs: thêm hướng dẫn cài đặt` |
| `refactor:` | Dọn dẹp code | `refactor: tái cấu trúc DashboardPage` |
| `chore:` | Việc lặt vặt | `chore: cập nhật .gitignore` |

---

## 📚 Tài liệu chi tiết

| Tài liệu | Nội dung |
|----------|---------|
| `backend/README.md` | Hướng dẫn chạy backend, cấu hình DB, JWT |
| `backend/docs/progress.md` | Nhật ký tiến độ theo từng Phase |
| `backend/docs/bugs_and_fixes.md` | Lỗi đã gặp và cách xử lý |
| `backend/docs/plan_backend.md` | Kế hoạch backend đầy đủ |
| `frontend/FRONTEND_GUIDE.md` | Kiến trúc frontend, Mobile/PWA strategy |

---

## 📊 Trạng thái các Phase

| Phase | Nội dung | Trạng thái |
|-------|---------|-----------|
| Phase 1 | Frontend 13 trang, Auth, Router | ✅ Hoàn thành |
| Phase 2 | Backend API, PLC polling, SignalR, go2rtc, Device CRUD | ✅ Hoàn thành |
| Phase 3 | Rule Engine, Alert System, Cloudflare Tunnel | 🔄 Đang làm |
| Phase 4 | AI YOLO pipeline, báo cáo PDF, Mobile PWA | ⏳ Chưa bắt đầu |
