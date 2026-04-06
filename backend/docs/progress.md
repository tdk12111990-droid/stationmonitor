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

## Phase 5 — Dashboard SLD + SLD Editor ✅ (2026-04-05)

### Backend
- [x] `SldController` — GET/POST upload SVG, POST/PUT/DELETE points
- [x] `app.UseStaticFiles()` serve `wwwroot/sld/*.svg`
- [x] EF entities: `SldFile`, `SldPoint`

### Frontend
- [x] `DashboardPage` viết lại hoàn toàn — SLD full-screen, pan/zoom, floating panels
- [x] Device Drawer slide trái (Edit mode), drag-drop node từ drawer → SVG
- [x] Click node → panel chỉnh X/Y/R/Label (live preview)
- [x] `utils/confirm.ts` — custom confirm modal thay `window.confirm()` toàn bộ 6 files

### Tests
- `test-api.mjs` — 35 tests PASSED
- TypeScript: `npx tsc --noEmit` PASS

---

## AnalyticsPage v2 ✅ (2026-04-05)

- [x] 6 tab: Tổng quan · Nhiệt độ · Phóng điện · Tương quan · Cảnh báo · Sức khỏe
- [x] Tách °C và dB — không bao giờ cùng trục Y
- [x] Threshold động từ Rules: `parseThresholds()` → map pointId → [{value,level,op}]
- [x] `valColor()`, `tempCellColor()` dùng ngưỡng từ rules thay hardcode
- [x] Heatmap fix: `border-collapse:separate`, cell `width:22px`
- [x] Correlation tab: Pearson r, scatter, dual-axis
- [x] Health tab: score bars, risk table

---

## Phase 6 — Reports PDF ✅ (2026-04-05)

### Backend
- [x] `GET /api/v1/history/bulk` — TimescaleDB `time_bucket`, nhiều điểm đo
- [x] `ReportsController` — generate, list, download, delete
- [x] `ReportGeneratorService` — QuestPDF tạo PDF: KPI, bảng thống kê, danh sách alert
- [x] `ReportSchedulerWorker` — Hangfire `RecurringJob` tự tạo daily report lúc 00:05
- [x] Package: QuestPDF 2024.3.0, Hangfire.AspNetCore 1.8.9, Hangfire.PostgreSql 1.20.9
- [x] PDF lưu vào `wwwroot/reports/{id}.pdf`

### Frontend
- [x] `ReportsPage` viết lại hoàn toàn — 2 tab
  - Tab 1: Xuất dữ liệu XLSX (SheetJS) — 3 sheet, xem trước + biểu đồ
  - Tab 2: Báo cáo phân tích PDF — preview HTML + download từ server
- [x] `chartjs-adapter-date-fns` — fix lỗi time scale Chart.js

---

## Phase 8 — Maintenance Tracking ✅ (2026-04-05)

### Backend
- [x] Entity `MaintenanceTask` — 11 fields, Checklist dạng JSONB
- [x] Migration `AddMaintenanceTask` — applied thành công
- [x] `MaintenanceController` — 9 endpoints:
  - `GET /api/v1/maintenance` — list, filter stationId/status/deviceId
  - `POST /api/v1/maintenance` — tạo task
  - `PUT /api/v1/maintenance/{id}` — cập nhật
  - `DELETE /api/v1/maintenance/{id}` — admin/manager
  - `POST /api/v1/maintenance/{id}/start` → in_progress
  - `POST /api/v1/maintenance/{id}/complete` → completed, auto-close reminder alerts
  - `POST /api/v1/maintenance/from-alert/{alertId}` — tạo từ alert
  - `GET /api/v1/maintenance/upcoming` — task trong N ngày tới
  - `GET /api/v1/maintenance/suggestions` — đề xuất thống kê (>3 alarm/7d, quá hạn, chưa bảo trì 30d)
- [x] `MaintenanceReminderWorker` (mỗi 1h):
  - Auto-mark overdue tasks
  - Tạo Alert Source="maintenance" theo giai đoạn: 7d trước → warning, 1d trước → warning, hôm nay → alarm (mỗi 4h), quá hạn → alarm (1 lần/ngày)
  - Chống spam: check `[MT:{taskId}]` marker trước khi tạo alert mới
  - Auto-close reminder alerts khi task complete

### Frontend
- [x] `MaintenancePage` viết lại hoàn toàn — dark theme
  - Stats 4 ô: Tổng / Đang chờ / Đang làm / Quá hạn
  - Panel đề xuất (stat-based, placeholder cho AI sau)
  - Filter tabs: Tất cả / Đang chờ / Đang làm / Quá hạn / Hoàn thành
  - Bảng task + expand checklist inline, progress bar
  - Modal tạo/sửa với checklist động theo loại bảo trì

### Tests
- `test-api.mjs` — **46/46 tests PASSED** (Phase 1+2+3+4+8)
- TypeScript: `npx tsc --noEmit` PASS
- Build: `dotnet build StationMonitor.sln` PASS (0 errors)

---

## Phase 9 — Early Warning + Health Score + Analytics API ✅ (2026-04-05)

### Backend
- [x] `EarlyWarningWorker` (mỗi 30 phút):
  - Linear regression (OLS) trên dữ liệu 7 ngày cho mỗi cặp (DeviceId, PointId)
  - Ngưỡng: nhiệt độ >0.5°C/ngày, PD >0.3 dB/ngày → tạo Alert Source="early_warning"
  - Dedup: marker `[EW:{pointId}:{deviceId}]` — không tạo lại trong 12h
  - Push SignalR realtime khi tạo alert
- [x] `HealthScoreWorker` (mỗi 1 giờ):
  - Điểm 0–100 mỗi thiết bị: base 100 - alarm penalty - warning penalty - threshold penalty - offline penalty
  - Lưu vào SystemSettings key: `health_{deviceId}` (JSONB: score, risk, deviceName, ts)
  - Risk levels: good (≥80) · fair (≥60) · poor (≥40) · critical (<40)
- [x] `AnalyticsController`:
  - `GET /api/v1/analytics/health?stationId=` — trả điểm sức khỏe + risk cho mỗi thiết bị
  - `GET /api/v1/analytics/trend?stationId=&days=` — tính slope/ngày on-demand, trả trend (rising/falling/stable)

### Frontend
- [x] `StationApiService`: thêm `getHealthScores()`, `getTrends()`, interface `HealthScore`, `TrendItem`
- [x] `DashboardPage` health widget:
  - Panel "Sức khỏe hệ thống" dưới KPI, collapse được
  - Hiển thị score + risk label + progress bar màu động mỗi 2 phút
  - Tự định vị ngay dưới KPI panel (positionHealthWidget)
- [x] `DashboardPage` SLD node nâng cấp:
  - Tooltip hover: hiển thị giá trị cảm biến realtime (từ cache `this.sensors`, cập nhật mỗi 5s)
  - Click popup (view mode): panel dữ liệu + mini SVG sparkline 1 giờ qua
  - Edit mode: click vẫn mở edit panel như cũ
- [x] `AnalyticsPage` tab Sức khỏe nâng cấp:
  - Dùng API `getHealthScores()` thay tính cục bộ, fallback về tính từ alerts nếu API chưa có
  - Bảng xu hướng 7 ngày từ `getTrends()`: slope/ngày + trend icon

### Build
- `dotnet build StationMonitor.sln` PASS (0 errors)
- `npx tsc --noEmit` PASS

---

## Phase 7 — Email Notifications ✅ (2026-04-05)

### Backend
- [x] `EmailNotifyService` (MailKit 4.3.0): `SendAlertEmailAsync()` + `SendTestEmailAsync()`
  - HTML email với màu sắc theo level (alarm=đỏ, warning=vàng)
  - Config SMTP qua `appsettings.json` section `"Smtp"`
  - Default: Mailtrap sandbox (`sandbox.smtp.mailtrap.io:2525`)
- [x] `NotificationsController`:
  - `GET /api/v1/notifications/smtp-config` — đọc cấu hình hiện tại
  - `POST /api/v1/notifications/test-email` — gửi email test
- [x] `RuleEvaluationWorker`: tích hợp gửi email khi tạo alert mới (fire-and-forget)
  - Đọc `alert_email` từ SystemSettings → gửi nếu có
- [x] `appsettings.json`: thêm section `"Smtp"` với Mailtrap defaults

### Phase 11 quick wins ✅
- [x] `PATCH /api/v1/rules/{id}/toggle` — bật/tắt rule nhanh (admin/manager)
- [x] `GET /api/v1/alerts/export` — xuất CSV cảnh báo (filter: status/from/to)
- [x] `GET /api/v1/history/export` — xuất CSV lịch sử cảm biến (filter: deviceId/pointId/from/to)
- [x] Bỏ `SystemStatusPage` — page dùng mock data cũ, không còn cần thiết

### Frontend
- [x] `SettingsPage`: thêm tab "Thông báo" (tab 1)
  - Form SMTP: host/port/username/password/from
  - Load config từ `GET /notifications/smtp-config`
  - Lưu SMTP: ghi vào SystemSettings (smtp_host/port/username/password/from)
  - Nút "Gửi test": gọi `POST /notifications/test-email`
  - Hint Mailtrap (link + hướng dẫn lấy credentials)

### Setup test email (Mailtrap)
1. Đăng ký miễn phí tại https://mailtrap.io
2. Vào Inbox → SMTP Settings → lấy Username + Password
3. Vào Settings → tab Thông báo → điền Username/Password → Lưu SMTP
4. Nhập email → Gửi test → kiểm tra Mailtrap Inbox

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

---

## Phase 11 — Protocol + Hạ tầng ✅ (2026-04-05)

### Quality Infrastructure
- `DataQualityPipeline` — Range check → Spike detect (3σ) → Deadband suppression → Moving average window
  - State per pointId: `_lastValue` dict, `_avgWindow` Queue<double>
  - Returns `QualityResult { IsValid, Value, Reason }`
- `CircuitBreaker` — Closed → Open → HalfOpen → Closed
  - Threshold failures → Open, timeout → HalfOpen probe, 1 success → Closed
  - Methods: `IsAllowed()`, `RecordSuccess()`, `RecordFailure()`
- `RetryHelper` — `ExecuteAsync(action, maxRetries, baseDelay, logger, context, ct)`
  - Exponential backoff: `delay * 2^(attempt-1) + jitter(0-500ms)`

### Protocol Workers
- `ModbusTcpWorker` — FC3 holding registers, circuit breaker, **sync helper** để tránh Span-in-async
  - Device filter: `d.Type == "modbus_tcp" && d.Status != "maintenance"`
  - Config JSON: `{ ip, port, unit_id, poll_interval_ms, registers: [{address, point_id, scale, unit}] }`
  - `Connect(new IPEndPoint(IPAddress.Parse(ip), port))` — FluentModbus 5.2.0 API
- `ModbusRtuWorker` — shared client per port, SemaphoreSlim mutex
  - Set `BaudRate`/`Parity`/`StopBits` thành properties trước, rồi `Connect(portName)`
  - Không có `DataBits` property trên `ModbusRtuClient`
- `MqttSubscriberWorker` — subscribe broker, auto-register device mới vào DB
  - Config từ `SystemSettings.Key == "mqtt_config"` (JSON string)
  - Payload: `{ device_id, point_id, value, unit }`
  - Config class phải `internal` (không dùng `file` modifier — CS9051)
- `Iec104Worker` — skeleton: TCP connect, STARTDT, General Interrogation
  - Filter: `d.Type == "iec104" && d.Status != "maintenance"`

### Camera Services
- `OnvifService` — WS-Discovery UDP multicast 239.255.255.250:3702, GetSnapshotUri SOAP, PTZ
- `HikvisionIsapiService` — Snapshot JPEG, PTZ continuous, event multipart stream, device info

### Discovery & Testing
- `AutoDiscoveryService` — ping sweep (parallel) → port scan (502/102/2404/1883/80/554) → Modbus handshake probe → ONVIF
- `ProtocolConnectionTester` — `TestAsync(protocol, configJson, ct)` → `ProtocolTestResult`
  - Supports: modbus_tcp, modbus_rtu, s7, iec104, ping
  - **sync** `ReadModbusRegisters()` để tránh Span<T> in async
- `ProtocolController` — 5 endpoints, `[Authorize(Roles = "admin,manager")]`

### Infrastructure Additions
- `PermissionService` — Operator filter theo `User.StationIds[]`
- `StorageMonitorWorker` — cảnh báo disk < 10% (alarm), < 5% (critical), dedup 6h/12h
- `RuleTriggerLog` — ghi log khi rule trigger trong `RuleEvaluationWorker`
- `AuditLogController` mở rộng — username join, filter from/to, tabs notify + rule-triggers
- `PATCH /api/v1/rules/{id}/toggle`, `GET /api/v1/alerts/export`, `GET /api/v1/history/export`

### Simulators (Project riêng — KHÔNG ghi DB)
- `StationMonitor.Simulators` — console app, không ref Api/Data projects
- `ModbusTcpSimulator` — raw TcpListener (không dùng FluentModbus server — API thay đổi), 7 registers, big-endian
- `MqttSimulator` — MQTTnet 4.3.7.1207, 6 sensor points, publish mỗi 5s
- `Iec104Simulator` — TCP server, STARTDT con (0x0B), GI response, spontaneous update mỗi 5s
- `ProtocolTestRunner` — 19/19 PASS, test ports 15020 + 12404 (tránh xung đột 502/2404)

### Tests
- `StationMonitor.Tests` — 47/47 unit tests PASS
- Protocol self-tests — 19/19 PASS (không cần DB, không cần phần cứng)
- `test-protocol.mjs` — 13 API test cases

### Key bugs fixed (Phase 11)
- CS9051: `file` class không dùng được trong method signature → đổi sang `internal`
- CS8652: Span<T> không cross async/await → extract sync helper method
- FluentModbus `Connect()` signature: phải dùng `IPEndPoint`, không phải `(string, int)`
- `ModbusRtuClient.DataBits` không tồn tại — xóa
- `Device.IsActive` không tồn tại → dùng `d.Status != "maintenance"`
- `ModbusTcpServer` API FluentModbus 5.2.0 thay đổi → rewrite với raw TcpListener
- `SensorReading.PointId` là `string`, không có `DataPoints` entity
- `Math.Min(ushort, int)` ambiguous → cast explicit

---

## Phase 10 — Cloud Sync Supabase ✅ (2026-04-06)

### Đã làm

#### Supabase
- Project: `https://nezuteiwukcheqpzitcn.supabase.co`
- Bảng `alerts` + `maintenance_tasks` với RLS (anon SELECT, service_role INSERT/UPDATE)
- Script: `D:\StationMonitor\supabase_setup.sql`

#### Backend
- `StationMonitor.Services/SupabaseService.cs` — HttpClient REST API wrapper
- `StationMonitor.Workers/Polling/CloudSyncWorker.cs` — sync mỗi 5 phút, batch 50, retry 3 lần
- `StationMonitor.Api/Controllers/SyncController.cs` — status + trigger endpoints
- `StationMonitor.Workers/Polling/RuleEvaluationWorker.cs` — hook thêm SyncQueue khi tạo Alert
- `appsettings.json` — section `Supabase`: Url, ServiceKey, AnonKey

#### Frontend
- `SettingsPage.ts` — tab "Cloud Sync" (tab thứ 5)
- `StationApiService.ts` — `getSyncStatus()`, `triggerSync()`, interface `SyncStatus`

#### API mới
- `GET /api/v1/sync/status` → `{ isConfigured, pendingCount, sentCount, failedCount, lastSyncAt, supabaseUrl }`
- `POST /api/v1/sync/trigger` (admin) → reset failed items, trigger sync sớm

### Cách test
```bash
# 1. Xem trạng thái
curl -H "Authorization: Bearer <token>" http://localhost:5056/api/v1/sync/status

# 2. Trigger sync ngay
curl -X POST -H "Authorization: Bearer <token>" http://localhost:5056/api/v1/sync/trigger

# 3. Kiểm tra Supabase
# → supabase.com/dashboard/project/nezuteiwukcheqpzitcn/editor → bảng alerts
```
