# StationMonitor — MASTER PLAN & CONTEXT LOG
> File này là nguồn sự thật duy nhất cho mọi Claude session. Đọc đầu tiên trước khi làm bất cứ thứ gì.
> Cập nhật lần cuối: 2026-04-05
> Checklist chi tiết từng phase: xem **TODO_PHASES.md**

---

## 0. Tổng quan hệ thống

**Mục đích:** Giám sát trạm biến áp 110kV không người trực — thu thập dữ liệu PLC/Modbus tự động, phát hiện cảnh báo nhiệt/phóng điện qua camera AI, thông báo đúng người đúng lúc.

**Kiến trúc triển khai:**
```
[PLC S7-1200 192.168.10.100]  →  Backend (.NET 8 port 5056)  →  Frontend (Vite port 5173)
[Camera 152/153 RTSP]         →  go2rtc (port 1984)          →  WebRTC iframe
[Python AI Server]            →  gRPC                        →  Backend (làm sau cùng)
[TimescaleDB PostgreSQL 5432] ←  Backend lưu trữ             →  Supabase Cloud (Phase 10)
```

**Tài khoản mặc định:** `admin / Admin@123`
**Stack:** ASP.NET Core 8 · Vanilla TypeScript + Vite · TimescaleDB · go2rtc · SignalR

---

## ══════════════════════════════════════════
## PHẦN 1 — ĐÃ HOÀN THÀNH
## ══════════════════════════════════════════

### Phase 1 — Nền tảng Auth ✅ (2026-04-02)
- JWT login/refresh, BCrypt, LoginLog
- 20 EF Core entities, migration, seed admin
- Frontend AuthService kết nối API thật

### Phase 2 — Dữ liệu thật ✅ (2026-04-03)
- `PlcPollingWorker` đọc PLC S7-1200 mỗi 3s → SensorReadings → SignalR push
- DB32: offset 0=Pha1°C, 2=Pha3°C, 4=Pha2°C, 8=PD dB
- `StationsController`, `DevicesController` (CRUD + test connection)
- `MeasurementsController` (DISTINCT ON TimescaleDB)
- Frontend: DashboardPage KPI từ PLC thật, RealtimeMonitorPage camera từ DB
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

### Phase 5 — Dashboard SLD + SLD Editor ✅ (2026-04-05)
- `SldController`: GET sld, POST upload SVG, POST/PUT/DELETE points
- `DashboardPage.ts` viết lại hoàn toàn: SLD full-screen, pan/zoom, floating panels KPI/alert/camera
- Device Drawer: slide trái khi Edit mode, thiết bị chưa pin lên sơ đồ
- Drag-drop thiết bị từ drawer → SVG canvas → tạo node
- Click node → panel chỉnh X/Y/R/Label trực tiếp (live preview)
- `app.UseStaticFiles()` serve `wwwroot/sld/*.svg`
- Custom confirm modal (`utils/confirm.ts`) thay toàn bộ `window.confirm()` (6 files)
- TypeScript 0 lỗi · 35 API tests PASSED

### AnalyticsPage v2 — Viết lại hoàn toàn ✅ (2026-04-05)
- **6 tab**: Tổng quan · Nhiệt độ · Phóng điện · Tương quan · Cảnh báo · Sức khỏe
- Tách hoàn toàn °C và dB — không bao giờ cùng trục Y
- **Threshold động từ Rules**: không hardcode hằng số — `parseThresholds(rules)` → map `pointId → [{value,level,op}]`
  - Nếu có rule → vẽ đường ngưỡng trên biểu đồ (cam=warning, đỏ=alarm)
  - Nếu không có rule → không vẽ, hiển thị "Chưa cài ngưỡng"
  - `valColor(val, pointId, default)` dùng cho KPI cards overview
  - `tempCellColor(val, pointId)` dùng cho heatmap cells
- Heatmap: `border-collapse:separate;border-spacing:2px`, cell `width:22px` — không bị kéo giãn
- Correlation tab: Pearson r, scatter chart, dual-axis overlay
- Health tab: score bars (100 − alarms×4 − warnings×1), risk table
- TypeScript 0 lỗi sau khi hoàn thiện

---

## ══════════════════════════════════════════
## PHẦN 2 — CÒN LÀM (KHÔNG CẦN AI)
## ══════════════════════════════════════════

### Phase 6 — Reports PDF ✅ (2026-04-05)
- **Tab 1 — Xuất dữ liệu**: XLSX export cảm biến theo ngày/khoảng thời gian
  - 3 sheet: Dữ liệu cảm biến (pivot theo thời gian) · Thống kê · Cảnh báo
  - Chọn cảm biến, khoảng cách mẫu (raw/1/5/15/30/60 phút), xem trước 30 dòng + biểu đồ
  - `GET /api/v1/history/bulk` (TimescaleDB `time_bucket`) — trả về pivot sẵn
  - SheetJS (xlsx) tạo XLSX phía frontend
- **Tab 2 — Báo cáo phân tích**: PDF báo cáo đầy đủ
  - HTML preview với biểu đồ inline (Chart.js)
  - KPI 4 ô, bảng thống kê cảm biến, phân tích PD, danh sách sự kiện
  - Backend: `POST /api/v1/reports/generate` → QuestPDF → lưu PDF vào `wwwroot/reports/`
  - `GET /api/v1/reports`, `GET /api/v1/reports/{id}/download`, `DELETE /api/v1/reports/{id}`
  - Hangfire `RecurringJob` tạo daily report lúc 00:05 tự động
  - Lịch sử báo cáo trong left panel, download/xóa từng báo cáo
- TypeScript 0 lỗi · Backend build thành công

---
### Phase 6 — Reports PDF 📄 (KẾ HOẠCH CŨ — đã thay bằng trên)
**Mục tiêu:** Xuất báo cáo PDF hàng ngày/tháng/sự kiện, scheduler tự động gửi email.

**Backend:**
- Cài `QuestPDF` + `Hangfire`
- `ReportsController`: POST generate, GET list, GET download
- `ReportGeneratorService`: daily (min/max/avg nhiệt, số PD, alerts), monthly (trend bảng số), event (1 alert + history)
- `ReportSchedulerWorker` (Hangfire): tự tạo báo cáo định kỳ
- Lưu PDF vào `wwwroot/reports/` + ghi entity `Report` vào DB
- Entity `Report` đã có trong migrations

**Frontend:**
- `ReportsPage` (đã có skeleton) → kết nối API thật
- Chọn loại báo cáo + khoảng thời gian → download PDF

---

### Phase 7 — Notifications (Email + FCM) 🔔
**Mục tiêu:** Khi có Alert mới → gửi ra ngoài qua Email và điện thoại.

**Backend:**
- Email: cài `MailKit`, config SMTP trong appsettings.json
  - `EmailNotifyService.SendAlertEmailAsync()` → HTML email kèm giá trị + link dashboard
  - Tích hợp vào `RuleEvaluationWorker` khi tạo Alert
- FCM: cài `FirebaseAdmin` SDK
  - User có `fcm_token` field → khi login gửi token lên
  - `FcmNotifyService.SendAlertPushAsync()`
- Ghi `NotifyLog` (sent/failed) — entity đã có trong migrations

**Frontend:**
- SettingsPage thêm tab "Thông báo": nhập email + nút test gửi thử
- `PUT /api/v1/settings/alert_email` đã có → chỉ cần kết nối

---

### Phase 8 — Maintenance Tracking ✅ (2026-04-05)
- Entity `MaintenanceTask`: StationId, DeviceId, Title, Type, ScheduledDate, AssignedTo, Status, Checklist (JSONB), Notes, SourceAlertId
- Migration: `AddMaintenanceTask` — applied thành công
- **9 API endpoints**: CRUD + start + complete + from-alert + upcoming + suggestions
- **`MaintenanceReminderWorker`** (mỗi 1h): auto-overdue, tạo Alert nhắc nhở 7d/1d/hôm nay/quá hạn, chống spam bằng `[MT:{taskId}]` marker
- Alert tích hợp: Source="maintenance", level warning→alarm theo giai đoạn; auto-close khi complete task
- **Đề xuất thống kê** (không cần AI): thiết bị >3 alarm/7 ngày, quá hạn, chưa bảo trì 30 ngày
- Frontend: stats 4 ô, panel đề xuất, filter tabs, bảng task + expand checklist, modal tạo/sửa với checklist động theo type
- **46/46 API tests PASSED**

### Phase 8 — Maintenance Tracking 🔧
**Mục tiêu:** Lịch bảo trì thiết bị, checklist, assign người phụ trách.

**Backend:**
- `MaintenanceController`: CRUD task bảo trì (tên, thiết bị, ngày, người thực hiện)
- `PUT /api/v1/maintenance/{id}/complete` → đánh dấu hoàn thành
- Checklist dạng JSONB `{ item, done }[]` trong `actions`
- Nút "Tạo task bảo trì từ alert" → link từ AlertsController

**Frontend:**
- `MaintenancePage` (đã có skeleton) → kết nối API thật
- Timeline tasks sắp đến hạn trên Dashboard (indicator nhỏ)

---

### Phase 9 — Analytics nâng cao 📈
**Mục tiêu:** Phân tích xu hướng, cảnh báo sớm, điểm sức khỏe thiết bị — dựa thuần thống kê (không cần AI).

**Backend:**
- `EarlyWarningWorker` (mỗi 30 phút):
  - Phân tích nhiệt độ tăng đều X°C/ngày liên tục 7 ngày → tạo Alert level='warning'
  - Thông báo: "MBA chính xu hướng tăng nhiệt, dự kiến vượt ngưỡng sau ~14 ngày"
- `HealthScoreCalculator`:
  - Tính điểm sức khỏe 0-100 cho mỗi thiết bị (dựa trên alert history + sensor trend)
  - Score < 60 → đề xuất bảo trì
- `DailyAggregator`: tổng hợp min/max/avg mỗi ngày cho báo cáo nhanh

**Frontend:**
- Dashboard: thêm widget điểm sức khỏe cho các thiết bị chính
- AnalyticsPage: biểu đồ trend + cảnh báo sớm

---

### Phase 10 — Cloud Sync (Supabase) ☁️
**Mục tiêu:** Backup dữ liệu lên cloud, xem dashboard từ ngoài LAN.

**Backend:**
- `StorageMonitorWorker`: theo dõi disk space, tự compress SensorReadings cũ
- `CloudSyncWorker`: đọc `SyncQueue` → gửi batch lên Supabase PostgreSQL
- Federated Query: data cũ hơn 90 ngày → tự query Supabase
- Config: `SUPABASE_URL`, `SUPABASE_KEY` trong appsettings.json
- Entity `SyncQueue` đã có trong migrations

---

### Phase 11 — Protocol + Hạ tầng 🔌
**Mục tiêu:** Tích hợp giao thức công nghiệp, phân quyền nâng cao, kiểm thử.

**Backend:**
- `ModbusPollingWorker`: đọc cảm biến Modbus RTU/TCP (NModbus)
- `IEC104Worker`: kết nối liên tục Trung tâm điều độ EVN (lib60870.NET)
- `PermissionService`: phân quyền theo trạm — Operator chỉ xem trạm được phân
- `RuleTriggerLog`: ghi log khi rule trigger (entity có rồi, chưa ghi)
- `GET /api/v1/alerts/export` và `GET /api/v1/history/export` (CSV)
- `PATCH /api/v1/rules/{id}/toggle` — bật/tắt rule nhanh
- `StationMonitor.Tests`: unit + integration tests (RuleEngine, AlertService)

---

## ══════════════════════════════════════════
## PHẦN 3 — PHẦN AI (LÀM SAU CÙNG)
## ══════════════════════════════════════════
> Tách riêng vì phụ thuộc vào phần cứng Jetson + Python AI Server.
> Chỉ setup khi các Phase 1-11 hoàn chỉnh và ổn định.

### Phase AI-1 — Python AI Sidecar (gRPC)
- Python gRPC server (`ai_service.proto`)
- `yolo_detector.py`: YOLO + TensorRT trên Jetson GPU
- `thermal_analyzer.py`: phân tích camera nhiệt RAW
- `pd_detector.py`: phát hiện phóng điện từ camera 153
- Chạy song song với .NET backend, giao tiếp qua `localhost:50051`

### Phase AI-2 — Backend AI Integration
- Cài `Grpc.Net.Client`
- `AiDetectionService`: nhận kết quả từ Python → lưu `DetectionEvent` → trigger rule engine
- `MediaFileService`: tự chụp ảnh/clip khi phát hiện, lưu local + sync R2
- `ThermalFrameService`: lưu ma trận nhiệt RAW từng pixel
- `AiModelVersion`: quản lý version model đang deploy
- Entity 4 cái trên đã có trong migrations (DetectionEvent, MediaFile, ThermalFrame, AiModelVersion)
- Tích hợp `DetectionEvent` vào Alert lifecycle: `source='ai_detection'`

### Phase AI-3 — Frontend AI
- Camera overlay: bounding boxes từ AI lên iframe WebRTC
- `DetectionsPage`: lịch sử phát hiện, lọc theo camera/loại/thời gian
- `MediaPage`: xem ảnh/clip tự động + chụp thủ công
- Thermal map viewer: hiển thị ma trận nhiệt từng pixel màu gradient
- Dashboard: badge đỏ khi AI phát hiện bất thường

---

## 4. Thứ tự ưu tiên tổng thể

```
✅ Phase 1  Auth
✅ Phase 2  PLC + Data realtime
✅ Phase 3  Rule Engine + Alerts + Camera
✅ Phase 4  Users + Audit + Settings
✅ Phase 5  Dashboard SLD + Editor
── Phase 6  Reports PDF
── Phase 7  Notifications Email + FCM
── Phase 8  Maintenance tracking
── Phase 9  Analytics nâng cao (thuần thống kê)
── Phase 10 Cloud Sync Supabase
── Phase 11 Protocol + Hạ tầng (IEC-104, Modbus, Tests)
── AI-1     Python gRPC AI sidecar
── AI-2     Backend AI integration
── AI-3     Frontend AI overlay
```

---

## 5. 20 Entities — Tiến độ

| # | Entity | Trạng thái | Phase |
|---|--------|------------|-------|
| 1 | Station | ✅ | 1 |
| 2 | Device | ✅ | 2 |
| 3 | User | ✅ | 4 |
| 4 | SldFile | ✅ entity + controller | 5 |
| 5 | SldPoint | ✅ entity + controller | 5 |
| 6 | SensorReading | ✅ hypertable + polling | 2 |
| 11 | Alert | ✅ full lifecycle | 3 |
| 12 | AlertHistory | ✅ | 3 |
| 13 | Rule | ✅ CRUD + evaluator | 3 |
| 15 | AuditLog | ✅ middleware tự động | 4 |
| 16 | LoginLog | ✅ | 1 |
| 18 | SystemSettings | ✅ | 4 |
| 14 | RuleTriggerLog | ⚠️ entity có, chưa ghi khi trigger | 11 |
| 19 | Report | ❌ | 6 |
| 17 | NotifyLog | ❌ | 7 |
| 20 | SyncQueue | ❌ | 10 |
| 7 | DetectionEvent | ❌ chỉ làm khi có AI | AI-2 |
| 8 | MediaFile | ❌ chỉ làm khi có AI | AI-2 |
| 9 | ThermalFrame | ❌ chỉ làm khi có AI | AI-2 |
| 10 | AiModelVersion | ❌ chỉ làm khi có AI | AI-2 |

---

## 6. Bug đã fix — KHÔNG lặp lại

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
| 19 | TS error: `sldFileId` declared never read | Field chỉ ghi, không đọc | Xóa field | DashboardPage.ts |
| 20 | TS error: `e` unused trong dragend listener | Event param không dùng | Đổi thành `_e` | DashboardPage.ts |
| 21 | DELETE /users test fail 400 sau lần 2 | User test đã inactive từ lần chạy trước | Cho phép 400 ("đã inactive") cũng pass | test-api.mjs |
| 22 | R slider không live preview trên canvas | Chỉ update text, không update SVG circle | Cập nhật `cx/cy/r` trực tiếp trên DOM | DashboardPage.ts |

---

## 7. Nguyên tắc kỹ thuật (không được quên)

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
✅ Dùng stationApi (StationApiService.ts) cho MỌI API call
✅ JWT token key: 'station_token' trong localStorage
✅ go2rtc URL: từ VITE_GO2RTC_URL env var, KHÔNG hardcode localhost:1984
✅ Camera config: có thể là JSON string từ backend → parse trước khi dùng
✅ Modal pattern: add/remove class 'active' để show/hide
✅ Page pattern: render() → mount() → destroy()
✅ Confirm dialog: dùng confirmDialog() từ utils/confirm.ts, KHÔNG dùng window.confirm()
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

## 8. API Endpoints hiện có (35 tests pass)

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

GET  /api/v1/sld/{stationId}              → svgUrl + points + unpinned devices
POST /api/v1/sld/{stationId}/upload       → upload SVG background
POST /api/v1/sld/{stationId}/points       → thêm node (drag-drop)
PUT  /api/v1/sld/points/{id}              → cập nhật x, y, r, label
DELETE /api/v1/sld/points/{id}            → gỡ node khỏi sơ đồ

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

## 9. Lệnh thường dùng

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

# DB
docker start timescaledb
```

---

## 10. File structure quan trọng

```
StationMonitor/
├── MASTER_PLAN.md               ← File này — đọc đầu tiên
├── CLAUDE.md                    ← Rules cho Claude (stack, ports, commands)
├── test-api.mjs                 ← 35 API tests (node test-api.mjs)
├── start.bat / stop.bat         ← Khởi động/dừng hệ thống
│
├── backend/
│   ├── CLAUDE.md                ← Backend-specific rules
│   ├── docs/
│   │   ├── plan_backend.md      ← Kiến trúc đầy đủ 20 entities + workflows
│   │   ├── progress.md          ← Log tiến độ
│   │   ├── bugs_and_fixes.md    ← Lỗi đã gặp
│   │   └── devlog.md            ← Nhật ký theo ngày
│   └── StationMonitor.Api/
│       ├── Controllers/         ← Auth, Stations, Devices, Rules, Alerts, Users, Logs, Settings, Sld
│       ├── Middleware/          ← AuditMiddleware.cs
│       ├── wwwroot/sld/         ← SVG files upload
│       └── Program.cs
│
└── frontend/
    ├── CLAUDE.md                ← Frontend-specific rules
    ├── src/
    │   ├── pages/               ← Dashboard, Realtime, Alerts, Rules, Users, Settings, AuditLog...
    │   ├── services/
    │   │   └── StationApiService.ts  ← Wrapper API duy nhất
    │   └── utils/
    │       ├── env.ts           ← GO2RTC_URL từ env var
    │       └── confirm.ts       ← Custom confirm modal (thay window.confirm)
    └── e2e/                     ← Playwright tests
```
