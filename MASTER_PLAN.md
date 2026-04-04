# StationMonitor — MASTER PLAN & CONTEXT LOG
> File này là nguồn sự thật duy nhất cho mọi Claude session. Đọc đầu tiên trước khi làm bất cứ thứ gì.
> Cập nhật lần cuối: 2026-04-04

---

## 0. Tổng quan hệ thống

**Mục đích:** Giám sát trạm biến áp 110kV không người trực — thu thập dữ liệu PLC/Modbus tự động, phát hiện cảnh báo nhiệt/phóng điện qua camera AI, thông báo đúng người đúng lúc.

**Kiến trúc triển khai:**
```
[PLC S7-1200 192.168.10.100]  →  Backend (.NET 8 port 5056)  →  Frontend (Vite port 5173)
[Camera 152/153 RTSP]         →  go2rtc (port 1984)          →  WebRTC iframe
[Python AI Server]            →  gRPC                        →  Backend (Phase cuối)
[TimescaleDB PostgreSQL 5432] ←  Backend lưu trữ             →  Supabase Cloud (TODO)
```

**Tài khoản mặc định:** `admin / Admin@123`  
**Stack:** ASP.NET Core 8 · Vanilla TypeScript + Vite · TimescaleDB · go2rtc · SignalR

---

## 1. Trạng thái hiện tại — ĐÃ HOÀN THÀNH

### Phase 1 — Nền tảng Auth ✅ (2026-04-02)
- JWT login/refresh, BCrypt, LoginLog
- 20 EF Core entities, migration, seed admin
- Frontend AuthService kết nối API thật

### Phase 2 — Dữ liệu thật ✅ (2026-04-03)
- `PlcPollingWorker` đọc PLC S7-1200 mỗi 3s → SensorReadings → SignalR push
- DB32: offset 0=Pha1°C, 2=Pha3°C, 4=Pha2°C, 8=PD dB
- `StationsController`, `DevicesController` (CRUD + test connection)
- `MeasurementsController` (DISTINCT ON TimescaleDB)
- Frontend DashboardPage KPI từ PLC thật, RealtimeMonitorPage camera từ DB
- SignalR client nhận SensorUpdate realtime

### Phase 3 — Rule Engine + Camera + Cảnh báo ✅ (2026-04-04)
- `RulesController` CRUD + `RuleEvaluationWorker` (mỗi 5s)
- Alert lifecycle: open → acked → closed + AlertHistory
- go2rtc sync từ DB khi startup, add/remove stream qua REST API
- `VITE_GO2RTC_URL` env var (không hardcode localhost)
- Cloudflare tunnel script

### Phase 4 — Users + Audit + Settings ✅ (2026-04-04)
- `UsersController` CRUD (admin-only) + soft delete + change password
- `AuditMiddleware` tự động ghi mọi POST/PUT/DELETE
- `AuditLogController` GET audit/login logs
- `SystemSettingsController` GET/PUT settings (polling_interval_s, alert_email, timezone)
- Frontend: UserManagementPage, AuditLogPage, SettingsPage (kết nối API thật)

**Tests hiện tại:** 35 API tests PASSED · TypeScript 0 lỗi

---

## 2. Kế hoạch các Phase tiếp theo

### Phase 5 — Dashboard SLD redesign + SLD Editor 🎯 (TIẾP THEO)

**Tại sao quan trọng:** Dashboard hiện tại chỉ là KPI cards đơn giản. Prototype trong `dashboard-setup-demo.html` cho thấy vision thật: SLD (sơ đồ một sợi) full-screen với floating panels KPI + alerts + camera, Edit mode để kéo thả thiết bị lên sơ đồ.

**5A. Thiết kế lại DashboardPage**
- Layout mới theo `dashboard-setup-demo.html`:
  - Background: SVG sơ đồ một sợi full viewport (`#070b14`)
  - Sidebar nav: icon-only 60px màu xanh `#2563eb`
  - Floating panel trái: KPI (nhiệt độ, PD, thiết bị online)
  - Floating panel phải: Alert log + camera thumbnail
  - Toolbar trung tâm: tên trạm + filter + nút Edit mode
  - Status bar dưới: kết nối PLC, SignalR, thời gian thực
- KPI vẫn lấy từ `/api/v1/points` (đã có)
- Alert log lấy từ `/api/v1/alerts?status=open&limit=10` (đã có)

**5B. Backend SLD API**
- `SldController`:
  - `GET /api/v1/sld/{stationId}` → `{ svgUrl, points: SldPoint[] }`
  - `POST /api/v1/sld/{stationId}/upload` → upload SVG file
  - `POST /api/v1/sld/points` → tạo điểm mới (deviceId, x, y, label)
  - `PUT /api/v1/sld/points/{id}` → di chuyển điểm
  - `DELETE /api/v1/sld/points/{id}` → xóa điểm
- Entity `SldFile` + `SldPoint` đã có trong migrations, chưa có Controller

**5C. SLD Editor UI (DashboardPage)**
- Edit Mode Toggle: nút `[📝 Chỉnh sơ đồ]` trong toolbar
- Device Drawer: slide từ trái, hiện thiết bị chưa được pin
  - Lấy từ `GET /stations/{id}/devices` filter chưa có SldPoint
  - Mỗi item draggable
- SVG Canvas: pan & zoom, grid overlay khi edit
- Drop device → gọi `POST /api/v1/sld/points` → dot xuất hiện
- Smart Dots: màu theo alert status (xanh/vàng/đỏ), tooltip realtime từ SignalR
- Upload SVG background: input file → `POST /api/v1/sld/{stationId}/upload`

**5D. StationApiService update:**
```typescript
getSld(stationId: string): Promise<{ svgUrl: string; points: SldPoint[] }>
saveSldPoint(data: { stationId, deviceId, x, y, label }): Promise<SldPoint>
moveSldPoint(id: string, x: number, y: number): Promise<SldPoint>
deleteSldPoint(id: string): Promise<void>
uploadSldSvg(stationId: string, file: File): Promise<{ svgUrl: string }>
```

---

### Phase 6 — Reports PDF 📄

**Mục tiêu:** Tạo báo cáo PDF hàng ngày/tháng/sự kiện, gửi email tự động.

**Backend:**
- Cài `QuestPDF` (MIT license, .NET 8 compatible)
- `ReportsController`:
  - `POST /api/v1/reports/generate` → { type: 'daily'|'monthly'|'event', stationId, from, to }
  - `GET /api/v1/reports` → danh sách báo cáo đã tạo
  - `GET /api/v1/reports/{id}/download` → stream PDF file
- `ReportGeneratorService`:
  - Daily: nhiệt độ min/max/avg 3 pha, số sự kiện PD, danh sách alerts
  - Monthly: tổng hợp, trend charts (dạng bảng số), thiết bị maintenance
  - Event: chi tiết 1 alert + lịch sử ACK + thống kê liên quan
- Lưu PDF vào `D:/StationMonitor/reports/` + ghi `Report` entity vào DB

**Frontend:**
- `ReportsPage` (đã có skeleton) → kết nối API thật
- Nút "Tạo báo cáo" → chọn loại + khoảng thời gian → download PDF

---

### Phase 7 — Notifications (Email + FCM) 🔔

**Mục tiêu:** Khi có Alert mới → push ra ngoài không chỉ qua SignalR.

**Backend:**
- Email (SMTP):
  - Cài `MailKit` package
  - Config trong `appsettings.json`: SMTP host/port/user/pass
  - `EmailNotifyService.SendAlertEmailAsync()` → gửi HTML email kèm giá trị + link tới dashboard
  - Tích hợp vào `RuleEvaluationWorker` khi tạo Alert
  - Ghi `NotifyLog` (sent/failed)
- FCM Firebase (sau Email):
  - Cài `FirebaseAdmin` SDK
  - User có `fcm_token` field → khi login mobile gửi token lên
  - `FcmNotifyService.SendAlertPushAsync()`

**Frontend:**
- SettingsPage thêm tab "Thông báo": nhập email + test button (gửi email thử)
- `PUT /api/v1/settings/alert_email` đã có → chỉ cần kết nối

---

### Phase 8 — Maintenance tracking 🔧

**Mục tiêu:** Lịch bảo trì thiết bị, checklist, assign người phụ trách.

**Backend:**
- `MaintenanceController`:
  - CRUD task bảo trì: tên, thiết bị, ngày lên lịch, người thực hiện
  - `PUT /api/v1/maintenance/{id}/complete` → đánh dấu hoàn thành
  - Checklist: array `{ item, done }` trong `actions` JSONB
- Tích hợp với Alert: nút "Tạo task bảo trì từ alert"

**Frontend:**
- `MaintenancePage` (đã có skeleton) → kết nối API thật
- Hiện timeline tasks sắp đến hạn trên Dashboard (TODO indicator)

---

### Phase 9 — Cloud Sync (Supabase) ☁️

**Mục tiêu:** Backup dữ liệu lên cloud, xem dashboard từ ngoài LAN.

**Backend:**
- `StorageMonitorWorker`: theo dõi disk space, tự compress SensorReadings cũ
- `CloudSyncWorker`: đọc `SyncQueue` → gửi lên Supabase PostgreSQL (REST API)
- Federated Query: nếu data cũ hơn 90 ngày → tự query Supabase
- Config: `SUPABASE_URL`, `SUPABASE_KEY` trong `appsettings.json`

---

### Phase 10 — AI Detection (YOLO + Thermal) 🤖 [LÀM CUỐI]

**Mục tiêu:** Camera nhiệt + camera PD → Python AI → phát hiện hotspot/phóng điện → Alert tự động.

**Kiến trúc:**
```
Camera Frame → go2rtc (RTSP)
                    ↓ (snapshot mỗi Xs)
              Python AI Server (YOLO + TensorRT trên Jetson GPU)
                    ↓ (gRPC)
              Backend .NET → DetectionEvent → Alert (nếu confidence > threshold)
                    ↓
              SignalR push → Frontend (bounding boxes overlay trên camera iframe)
```

**Backend:**
- gRPC server nhận `DetectionEvent` từ Python
- `DetectionController`: GET events, filter by type/camera/time
- `MediaFileService`: lưu snapshot + clip khi phát hiện
- `ThermalFrameService`: parse ma trận nhiệt RAW

**Python sidecar:**
- YOLO model cho thermal hotspot detection
- Partial discharge visual detection
- gRPC client gọi backend

---

## 3. Thứ tự ưu tiên

```
Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10
SLD+UI    Reports    Email      Bảo trì   Cloud      AI
```

Lý do:
- Phase 5 (SLD) thay đổi trải nghiệm người dùng lớn nhất, nên làm trước để mọi page sau có cùng layout
- Phase 6 (Reports) cần dữ liệu từ Phase 1-4 → đúng thời điểm
- Phase 7 (Email) bổ sung notifications cho alerts (Phase 3)
- Phase 8 (Maintenance) follow-up tự nhiên từ alerts
- Phase 9 (Cloud) đòi hỏi data ổn định trước khi sync
- Phase 10 (AI) cần phần cứng Jetson, làm cuối khi mọi thứ khác hoàn chỉnh

---

## 4. Bug đã fix — KHÔNG lặp lại

| # | Lỗi | Nguyên nhân | Fix | File |
|---|-----|-------------|-----|------|
| 1 | NuGet lấy package 10.x | .NET 10 vs .NET 8 | Chỉ định `--version 8.0.11` | Mọi package |
| 2 | Port bị chiếm | Process cũ | `taskkill /F /PID` hoặc đổi port | launchSettings.json |
| 3 | bin/obj trong git | .gitignore tạo muộn | `git rm -r --cached` | .gitignore |
| 4 | CSP blocked fetch | Port backend không trong whitelist | Thêm `http://localhost:5056` vào connect-src | index.html |
| 5 | 401 dù password đúng | localStorage cache token cũ | Xóa `station_*` keys trong DevTools | AuthService |
| 6 | Docker daemon không chạy | Docker Desktop chưa mở | Mở Docker Desktop, chờ icon xanh | - |
| 7 | Firefox localhost 5056 | IPv6 loopback Windows | Dùng Chrome/Edge, hoặc `about:config → network.dns.disableIPv6=true` | - |
| 8 | Circular dependency Workers↔Api | Workers cần SignalR nhưng nằm trong Api | Interface `IRealtimeNotifier` trong Services | IRealtimeNotifier.cs |
| 9 | `plc.DBReadAsync` không tồn tại | S7.Net Plus API khác | Dùng `ReadAsync(DataType.DataBlock, ...)` | PlcPollingWorker.cs |
| 10 | `InvalidCastException` JSONB | JsonElement không cast được | Helper `GetString()`/`GetInt()` kiểm tra type | DevicesController.cs |
| 11 | EF Core GroupBy không dịch SQL | EF8 không support `.GroupBy().First()` | Dùng `DISTINCT ON` raw SQL TimescaleDB | MeasurementsController.cs |
| 12 | Table not found lowercase | PostgreSQL case-sensitive | Dùng `"SensorReadings"` với nháy kép | Mọi raw SQL |
| 13 | SignalR CORS + Credentials | `AllowAnyOrigin` không tương thích `AllowCredentials` | `WithOrigins(specific_url)` | Program.cs |
| 14 | Camera config JSON string | Backend trả string, frontend expect object | `JSON.parse(d.config)` trong StationApiService | StationApiService.ts |
| 15 | Camera 153 màn đen (channel sai) | Channel /102 là audio-only | Đổi sang /101 (main stream) | go2rtc.yaml, DB |
| 16 | Camera 153 credentials sai | DB dùng admin/Demo@2024, thực tế là tladmin/Ab@12345 | Update DB qua PUT /api/v1/devices/{id} | DB config |
| 17 | Camera 153 từ chối reconnect | Hikvision giới hạn RTSP slots | Restart go2rtc sau khi update yaml | go2rtc.yaml |
| 18 | Login 500 — FK violation SystemSettings | `StationId = userId` vi phạm FK constraint | Dùng station ID thật + key `refresh_token_{userId}` | AuthController.cs |

---

## 5. Nguyên tắc kỹ thuật quan trọng (không được quên)

### Backend .NET 8
```
✅ Package version: luôn dùng --version 8.0.x
✅ PostgreSQL table name: luôn dùng "PascalCase" có nháy kép trong raw SQL
✅ JSONB parsing: dùng JsonElement helper, KHÔNG Convert.ToInt32(JsonElement)
✅ EF Core GroupBy → dùng DISTINCT ON raw SQL
✅ SignalR CORS: WithOrigins(specific) + AllowCredentials, KHÔNG AllowAnyOrigin
✅ Background Workers: inject IServiceScopeFactory, KHÔNG inject DbContext trực tiếp
✅ Refresh token: key = "refresh_token_{userId}", StationId = station.Id thật
✅ Middleware order: UseCors → UseAuthentication → UseAuthorization → UseMiddleware
```

### Frontend TypeScript
```
✅ Dùng stationApi (StationApiService.ts) cho MỌI API call, KHÔNG dùng ScadaApiService
✅ JWT token key: 'station_token' trong localStorage
✅ go2rtc URL: từ VITE_GO2RTC_URL env var, KHÔNG hardcode localhost:1984
✅ Camera config: có thể là JSON string từ backend → parse trước khi dùng
✅ Modal pattern: add/remove class 'active' để show/hide
✅ Page pattern: render() → mount() → destroy()
✅ Chạy npx tsc --noEmit sau mỗi lần sửa TypeScript
```

### Phần cứng thực tế
```
PLC S7-1200: 192.168.10.100, DB32, rack=0, slot=1
Camera 152 (Hikvision): admin / Demo@2024
  - Normal: rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/101
  - Thermal: rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/201
Camera 153 (Hikvision): tladmin / Ab@12345
  - PD: rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101
go2rtc IDs: camera_152_normal, camera_152_thermal, camera_153_pd
Hikvision channels: 101=Main H264, 102=Sub/Audio-only, 201=Thermal
```

---

## 6. File structure quan trọng

```
StationMonitor/
├── MASTER_PLAN.md           ← File này — đọc đầu tiên
├── CLAUDE.md                ← Rules cho Claude (stack, ports, commands)
├── test-api.mjs             ← 35 API tests (node test-api.mjs)
├── start.bat / stop.bat     ← Khởi động/dừng hệ thống
├── dashboard-setup-demo.html ← Prototype UI cho Phase 5 (SLD Dashboard)
│
├── backend/
│   ├── CLAUDE.md            ← Backend-specific rules
│   ├── docs/
│   │   ├── plan_backend.md  ← Kế hoạch chi tiết 20 entities + workflows
│   │   ├── progress.md      ← Log tiến độ theo phase
│   │   ├── bugs_and_fixes.md ← Lỗi đã gặp (17 bugs documented)
│   │   └── devlog.md        ← Nhật ký theo ngày
│   └── StationMonitor.Api/
│       ├── Controllers/     ← Auth, Stations, Devices, Rules, Alerts, Users, Logs, Settings
│       ├── Middleware/      ← AuditMiddleware.cs
│       └── Program.cs
│
├── frontend/
│   ├── CLAUDE.md            ← Frontend-specific rules
│   ├── FRONTEND_GUIDE.md    ← Tech guide (GIS, deck.gl, etc — từ template cũ, ít liên quan)
│   ├── docs/
│   │   └── plan_sld_editor.md ← Thiết kế SLD Editor (Phase 5)
│   ├── e2e/                 ← Playwright tests (phase1,2,3,4)
│   └── src/
│       ├── pages/           ← Dashboard, Realtime, Alerts, Rules, Users, Settings, AuditLog...
│       ├── services/
│       │   └── StationApiService.ts  ← Wrapper API duy nhất cần dùng
│       └── utils/env.ts     ← GO2RTC_URL từ env var
```

---

## 7. API Endpoints hiện có (35 tests pass)

```
POST /api/v1/auth/login         → JWT token
POST /api/v1/auth/refresh       → refresh JWT
GET  /api/v1/auth/me            → thông tin user hiện tại

GET  /api/v1/stations           → danh sách trạm

GET  /api/v1/stations/{id}/devices?type= → thiết bị theo trạm
POST /api/v1/devices            → tạo thiết bị
PUT  /api/v1/devices/{id}       → sửa thiết bị
DELETE /api/v1/devices/{id}     → xóa thiết bị
POST /api/v1/devices/{id}/test  → test kết nối

GET  /api/v1/points?stationId=  → sensor readings mới nhất (DISTINCT ON)
GET  /api/v1/history?deviceId=&pointId=&from=&to=&limit=

GET  /api/v1/rules              → danh sách rules
POST /api/v1/rules              → tạo rule
GET  /api/v1/rules/{id}
PUT  /api/v1/rules/{id}
DELETE /api/v1/rules/{id}

GET  /api/v1/alerts?status=&limit= → danh sách alerts
GET  /api/v1/alerts/{id}           → detail + history
POST /api/v1/alerts/{id}/ack       → ACK alert
POST /api/v1/alerts/{id}/close     → đóng alert

GET  /api/v1/users              → danh sách users (admin only)
POST /api/v1/users              → tạo user (admin only)
PUT  /api/v1/users/{id}         → sửa user (admin only)
POST /api/v1/users/{id}/change-password
DELETE /api/v1/users/{id}       → vô hiệu hóa (admin only)

GET  /api/v1/logs/audit?action=&entityType=&limit=
GET  /api/v1/logs/login?limit=

GET  /api/v1/settings           → key-value settings
PUT  /api/v1/settings/{key}     → cập nhật setting (admin only)

WS   /ws/realtime               → SignalR hub (SensorUpdate, Alert, DeviceStatus)
```

---

## 8. Lệnh thường dùng

```bash
# Khởi động
start.bat                       # Backend + Frontend + go2rtc

# Tests
node test-api.mjs               # 35 API tests
cd frontend && npx tsc --noEmit # TypeScript check
cd frontend && npx playwright test # E2E tests (cần server đang chạy)

# Backend chỉ
cd backend && dotnet build StationMonitor.sln
cd backend/StationMonitor.Api && dotnet run --no-build

# Kill backend bị lock
powershell -Command "Stop-Process -Name 'StationMonitor.Api' -Force"

# Frontend chỉ
cd frontend && npm run dev

# DB (TimescaleDB Docker)
docker start timescaledb   # nếu container đã tạo rồi
```

---

## 9. Ngữ cảnh đặc biệt cần nhớ

- **`dashboard-setup-demo.html`** là prototype HTML/CSS đã confirm cho Phase 5. CSS variables, layout floating panels, drawer sidebar, SVG canvas — tất cả đã có sẵn, cần port sang TypeScript/DashboardPage.ts.
- **`frontend/docs/plan_sld_editor.md`** mô tả chi tiết UX của SLD Editor.
- **`backend/docs/plan_backend.md`** là thiết kế kiến trúc đầy đủ 20 entities, đọc trước khi thêm entity mới.
- **DashboardPage hiện tại** là KPI cards đơn giản — Phase 5 sẽ thay thế hoàn toàn bằng SLD full-viewport.
- **AnalyticsPage** có biểu đồ lịch sử nhiệt độ/PD từ `/api/v1/history` — giữ nguyên, không thay.
- **RealtimeMonitorPage** là trang camera riêng — vẫn giữ, Dashboard chỉ show camera thumbnail nhỏ.
- **ScadaApiService.ts** là file cũ từ mock era — KHÔNG dùng nữa, chỉ dùng `stationApi` từ `StationApiService.ts`.
- **EF Core migrations**: khi thêm entity mới → `dotnet ef migrations add <Name>` → `dotnet ef database update`.
- **go2rtc**: không chạy trong Docker, chạy trực tiếp qua `go2rtc.exe`, config trong `go2rtc.yaml`.
- **Camera 153 PD**: hay bị disconnect, cần restart go2rtc nếu màn đen.
