# Nhật ký tiến độ — StationMonitor Backend

---

## Phase 1 — Nền tảng ✅ (2026-04-02 → 2026-04-03)

### Đã làm

#### Môi trường
- Cài .NET 8 SDK
- Cài Docker Desktop
- Chạy TimescaleDB container: `timescale/timescaledb:latest-pg16`
  - Port: `5432`, DB: `stationmonitor`, Password: `postgres123`
  - Data lưu tại: `D:/docker-data/stationmonitor-db`

#### Project structure
- Solution `StationMonitor` với 5 projects:
  - `StationMonitor.Api` — REST API, Controllers, Program.cs
  - `StationMonitor.Data` — EF Core, 20 entities, migrations
  - `StationMonitor.Services` — Business logic
  - `StationMonitor.Workers` — Background workers (chưa implement)
  - `StationMonitor.Analytics` — Analytics (chưa implement)

#### Database
- 20 entities tạo đúng thứ tự FK
- Migration `InitialCreate` tạo đủ 20 bảng
- TimescaleDB hypertable cho `SensorReadings` (partition by `Time`)
- Seed admin tự động khi DB trống

#### Auth API
- `POST /api/v1/auth/login` → JWT + RefreshToken
- `GET /api/v1/auth/me` → thông tin user từ JWT
- BCrypt hash password
- JWT expire 60 phút, config trong `appsettings.json`
- LoginLog ghi mỗi lần đăng nhập thành công

#### Frontend kết nối
- `AuthService.ts` sửa từ mock → gọi API thật
- CSP trong `index.html` thêm `http://localhost:5056`
- Backend chạy port `5056`

---

### Lỗi gặp và cách sửa

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| `NU1202` package not compatible | NuGet tự lấy version 10.x cho .NET 10 | Chỉ định `--version 8.0.11` |
| `address already in use :5055` | Process dotnet cũ chưa tắt | Đổi port sang `5056` trong `launchSettings.json` |
| CSP blocked fetch | `localhost:5056` chưa có trong whitelist | Thêm vào `connect-src` trong `index.html` |
| 401 khi login từ frontend | localStorage còn cache password cũ `admin123` | Xóa `station_*` keys trong localStorage |
| bin/obj bị commit vào git | `.gitignore` tạo sau `git add` | `git rm -r --cached bin/ obj/`, commit lại |

---

### Tài khoản mặc định
- Username: `admin`
- Password: `Admin@123`
- Role: `admin`

---

## Phase 2 — Data thật ✅ (2026-04-03)

### Backend
- [x] `StationsController` — GET /api/v1/stations
- [x] `DevicesController` — CRUD thiết bị, filter by type, test connection, LAN scan
- [x] `MeasurementsController` — GET /api/v1/points (DISTINCT ON TimescaleDB), GET /api/v1/history
- [x] `PlcPollingWorker` — Đọc PLC S7-1200 tại 192.168.10.100 mỗi 3s
  - DB32: offset 0=Pha1°C, offset 2=Pha3°C, offset 4=Pha2°C, offset 8=PD dB
  - Lưu vào `SensorReadings`, push qua SignalR
- [x] `IRealtimeNotifier` interface — tách circular dependency Workers↔Api
- [x] `SignalRNotifier` + `RealtimeHub` — push `SensorUpdate`, `Alert`, `DeviceStatus`
- [x] CORS fix — `WithOrigins` + `AllowCredentials()` cho SignalR
- [x] Seed data — tự tạo trạm + PLC + 3 camera khi DB trống

### Frontend
- [x] `StationApiService.ts` — wrapper gọi backend với JWT tự động
- [x] `DashboardPage` — KPI nhiệt độ + PD cập nhật từ PLC thật mỗi 5s
- [x] `RealtimeMonitorPage` — camera load từ DB API thay vì hardcode
- [x] SignalR client kết nối `/ws/realtime`, nhận `SensorUpdate` realtime

### Kết quả đo thực tế (PLC 192.168.10.100)
- Nhiệt độ Pha 1/2/3: **30°C**
- Phóng điện PD: **-60 dB**

### Lỗi gặp trong Phase 2 — xem `bugs_and_fixes.md` mục 8-13

## Phase 3 — Quản lý thiết bị + go2rtc + Cảnh báo ✅ (2026-04-04)

### 3A. Trang Quản lý thiết bị (Frontend UI) ✅
- [x] Danh sách thiết bị (camera, PLC, cảm biến) theo trạm
- [x] Thêm thiết bị mới (form: tên, IP, loại, RTSP path)
- [x] Xóa thiết bị → tự hủy stream go2rtc nếu là camera
- [x] Sửa cấu hình thiết bị (IP, tên)
- [x] Nút Test kết nối → hiện latency + trạng thái

### 3B. go2rtc — Backend quản lý config ✅
- [x] Backend sync tất cả camera từ DB → go2rtc khi khởi động
- [x] Thêm camera → tự gọi go2rtc REST API (RegisterCameraStreamAsync)
- [x] Xóa camera → tự gọi go2rtc REST API (UnregisterCameraStreamAsync)
- [x] Frontend vẫn kết nối trực tiếp go2rtc để xem video (không đổi)
- [x] go2rtc URL cấu hình qua `VITE_GO2RTC_URL` trong `frontend/.env`
- NOTE: Video stream KHÔNG đi qua backend (tránh bottleneck)

### 3C. Rule Engine + Cảnh báo ✅
- [x] CRUD Rules (ngưỡng nhiệt độ, PD) — RulesController.cs
- [x] `RuleEvaluationWorker` chạy mỗi 5s sau PLC poll
- [x] Alert lifecycle: open → ack → close
- [x] SignalR push alert về dashboard realtime

### 3D. Tunnel ra ngoài (xem từ điện thoại) ✅
- [x] `cloudflare-tunnel.bat` — script hỗ trợ Quick Tunnel + Named Tunnel
- [x] Frontend dùng `VITE_GO2RTC_URL` từ `.env` (không còn hardcode localhost:1984)
- [ ] Test thực tế xem camera từ 4G (cần cloudflared cài + chạy tunnel)

### Tests Phase 3 ✅ (2026-04-04)
- `test-api.mjs` — 26 tests PASSED (Phase 1+2+3): Rules CRUD + Alert trigger + ACK + Close
- `e2e/phase3-rules-alerts.spec.ts` — 10 UI tests: Rule Engine UI + Alerts History UI + go2rtc env URL
- TypeScript: `npx tsc --noEmit` PASS

---

## Phase 4 — Quản lý người dùng + Audit + Cài đặt ✅ (2026-04-04)

### 4A. User Management ✅
- [x] `UsersController` — CRUD users (GET/POST/PUT/DELETE `/api/v1/users`)
- [x] Phân quyền: admin/manager/operator, admin-only cho CRUD
- [x] Vô hiệu hóa user (soft delete — giữ lại audit log)
- [x] Đổi mật khẩu: admin không cần old password, user thường phải cung cấp
- [x] Frontend `UserManagementPage` — bảng phân quyền, modal thêm/sửa/đổi mật khẩu

### 4B. Audit Log ✅
- [x] `AuditMiddleware` — tự động ghi POST/PUT/DELETE vào `AuditLogs`
- [x] `AuditLogController` — GET `/api/v1/logs/audit` + GET `/api/v1/logs/login`
- [x] Frontend `AuditLogPage` — 2 tab: Hành động + Đăng nhập
- [x] Fix: AuditMiddleware trả 500 nếu không bỏ qua /auth/* → đã lọc

### 4C. System Settings ✅
- [x] `SystemSettingsController` — GET/PUT `/api/v1/settings` (admin-only PUT)
- [x] Default settings: polling_interval_s=3, alert_email, timezone
- [x] Frontend `SettingsPage` — load + save từ API thật
- [x] Fix: refresh token dùng `StationId=userId` vi phạm FK → đổi key `refresh_token_{userId}` + dùng station ID thật

### Tests Phase 4 ✅ (2026-04-04)
- `test-api.mjs` — 35 tests PASSED (Phase 1+2+3+4): Users CRUD + AuditLog + Settings
- `e2e/phase4-users-settings.spec.ts` — 11 UI tests: Users + AuditLog + Settings
- TypeScript: `npx tsc --noEmit` PASS

---

## Phase 5 — AI + Desktop + Mobile (TODO)

- [ ] Python YOLO gRPC sidecar (chạy trên Jetson GPU)
- [ ] Tauri desktop build (Windows/Linux)
- [ ] Mobile view qua go2rtc HLS

## Phase 5 — Production (TODO)

- [ ] Docker Compose: backend + TimescaleDB + go2rtc trên Jetson
- [ ] Reports PDF (QuestPDF)
- [ ] Cloud sync (backup lên Supabase)
- [ ] Monitoring Jetson CPU/GPU/Temp
