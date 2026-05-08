# DevLog — StationMonitor

> Nhật ký phát triển theo ngày. Ghi lại những gì đã làm, lỗi gặp, và quyết định kỹ thuật quan trọng.

---

## 2026-04-07 — Analytics nâng cao + UI hoàn thiện + Test mở rộng

### Nhóm 1 — Fix logic backend (không cần Jetson)

**G1-1: Fix Flapping Alert — Hysteresis + Cooldown**
- File: `StationMonitor.Workers/Polling/RuleEvaluationWorker.cs` + `RuleEvaluator.cs`
- Vấn đề: sensor dao động quanh ngưỡng 80°C → alert spam liên tục vì không có cooldown
- Giải pháp:
  - `RuleEvaluator.ParseConditionExtended()` đọc thêm 3 field optional từ condition JSON:
    - `clearValue`: ngưỡng phục hồi (hysteresis), mặc định = threshold ± 3
    - `cooldownMin`: chặn tạo alert mới N phút sau khi close, mặc định = 5
    - `confirmReadings`: cần N lần đọc liên tiếp vượt ngưỡng trước khi trigger, mặc định = 1
  - `EvaluateClear()`: ngược chiều với trigger (ví dụ trigger ">80" → clear khi "≤77")
  - **Auto-close alert**: nếu alert đang open và giá trị xuống dưới `clearValue` → tự đóng + ghi AlertHistory "auto_closed" + bắt đầu cooldown
  - In-memory `_confirmCounts` và `_cooldownUntil` per ruleId

**G1-2: Delta-T phân tích chênh lệch nhiệt 3 pha**
- File: `EarlyWarningWorker.cs` — thêm `AnalyzeDeltaTAsync()`
- Logic: lấy latest reading của nhiet_do_pha_1/2/3, tính ΔT = max - min
  - ΔT > 10°C → warning "Chênh lệch nhiệt bất thường"
  - ΔT > 15°C → alarm (tiếp điểm hỏng nghiêm trọng)
- Dedup 6h theo marker `[EW:DELTAT:{deviceId}]`
- Dùng raw SQL `DISTINCT ON (DeviceId, PointId)` với IN clause (tránh Npgsql dependency)

**G1-3: PD Frequency Counting — đếm tần suất phóng điện**
- File: `EarlyWarningWorker.cs` — thêm `AnalyzePdFrequencyAsync()`
- Logic: đếm số readings PD > 2.0 dB theo từng tuần (tuần này vs tuần trước)
  - Tăng > 3x → warning
  - Tăng > 5x → alarm
- Dedup 12h theo marker `[EW:PDFREQ:{deviceId}]`

### Nhóm 2 — Hoàn thiện backend

**G2-4: LoadCorrelationAnalyzer (mới)**
- File mới: `StationMonitor.Workers/Polling/LoadCorrelationAnalyzer.cs`
- CBM thật sự: tính `thermal_efficiency = temp / (current + 0.001)`, so với baseline 30 ngày (mean + 2σ)
- Kích hoạt khi admin set `current_point_id` trong SystemSettings
- Nếu chưa cấu hình → bỏ qua (graceful skip)
- Dùng `SensorRow` record (strongly-typed thay vì dynamic để tránh compile error)

**G2-5: Health Score nâng cao**
- File: `HealthScoreWorker.cs` — rewrite formula
- Thêm exponential decay: `penalty × e^(-0.1 × age_days)` — alert 7 ngày trước còn ~50% trọng lượng
- Thêm Delta-T penalty: ΔT ≥ 15°C → -20, ΔT ≥ 10°C → -10
- Thêm PD frequency penalty: tăng ≥ 5x → -20, ≥ 3x → -10
- Ghi thêm `alarmCount`, `warningCount` vào JSON để frontend hiển thị

**G2-7: StationsController PUT + DELETE**
- File: `StationsController.cs`
- Thêm `PUT /api/v1/stations/{id}` — cập nhật name/code/location/status (admin only)
- Thêm `DELETE /api/v1/stations/{id}` — xóa trạm (admin only)
  - Kiểm tra có device → trả 400 "Xóa thiết bị trước" để tránh orphan data

**G2-6: SMTP config** — Đã có sẵn đầy đủ trong SettingsPage, không cần làm thêm

### Nhóm 3 — UI + Tests

**G3-8: Nút Export CSV**
- `AlertsHistoryPage.ts`: thêm nút `⬇ CSV`, gọi `GET /alerts/export` với filter hiện tại (status, from, to)
- `AnalyticsPage.ts`: thêm nút `⬇ CSV` trên thanh tab bar, gọi `GET /history/export`

**G3-9: Protocol Discovery UI**
- File: `DeviceManagementPage.ts` — mở rộng modal "Quét LAN" thành modal 3 tab
  - **Tab 0 — Quét LAN**: scan subnet, hiển thị IP/type/ports/online status
  - **Tab 1 — ONVIF**: gọi `GET /protocol/discover-onvif`, hiển thị camera + snapshotUri
  - **Tab 2 — Test kết nối**: nhập IP/port/protocol → `POST /protocol/test-connection`, hiển thị latency + data đọc được

**G3-10: Mở rộng test-api.mjs**
- Từ 42 → ~70 test cases, thêm:
  - Phase 9: Analytics (health scores, trend, trend?days=3)
  - Phase 10: Cloud Sync (status, trigger)
  - Phase 11: Protocol (serial-ports, scan IP, discover, discover-onvif, test-connection)
  - Export: alerts/export CSV, history/export CSV
  - Reports: generate, download, delete
  - SLD: GET sld/{stationId}
  - Notifications: smtp-config
  - Stations: PUT, DELETE (dùng trạm test tạo/xóa)

### Kết quả
- Backend build: ✅ 0 errors (6 warnings cũ — package version mismatch, không ảnh hưởng)
- Frontend TypeScript: ✅ 0 errors
- Files mới: `LoadCorrelationAnalyzer.cs`, `ai-python/ai_service.proto`, `AI_PLAN.md`, `ANALYTICS_PLAN.md`, `PROJECT_STATUS.md`
- Files sửa: RuleEvaluationWorker, RuleEvaluator, EarlyWarningWorker, HealthScoreWorker, StationsController, AlertsHistoryPage, AnalyticsPage, DeviceManagementPage, test-api.mjs

### Lỗi gặp và fix
- `LoadCorrelationAnalyzer`: dùng `IList<dynamic>` không cast được từ anonymous type → đổi sang `SensorRow` record (strongly-typed)
- `EarlyWarningWorker`: dùng `Npgsql.NpgsqlParameter` không có reference trong Workers project → đổi sang IN clause hardcode
- `HealthScoreWorker`: inject `IRealtimeNotifier` — thêm vào constructor (cần notifier cho tương lai)

---

## 2026-04-02 — Khởi tạo Backend (Phase 1)

### Làm gì

**Chuẩn bị môi trường**
- Cài .NET 8 SDK trên Windows 11
- Cài Docker Desktop, chạy TimescaleDB container `timescale/timescaledb:latest-pg16`
  - Port 5432, DB `stationmonitor`, password `postgres123`
  - Data persist tại `D:/docker-data/stationmonitor-db`

**Tạo solution từ đầu**
- Solution `StationMonitor` gồm 5 projects: Api, Data, Services, Workers, Analytics
- 20 EF Core entities: User, Device, Station, SensorReading, Alert, Rule, AuditLog, v.v.
- Migration `InitialCreate` tạo đủ bảng, seed admin mặc định

**Auth API**
- `POST /api/v1/auth/login` → JWT (expire 60 phút) + ghi LoginLog
- `GET /api/v1/auth/me` → decode JWT trả thông tin user
- BCrypt hash password

**Frontend kết nối**
- Sửa `AuthService.ts` từ mock cứng (`admin/admin123`) → gọi `POST /api/v1/auth/login` thật
- Thêm `http://localhost:5056` vào CSP `connect-src` trong `index.html`

### Lỗi gặp hôm nay

| # | Lỗi | Fix |
|---|-----|-----|
| 1 | `NU1202` — NuGet tự lấy package version 10.x không tương thích .NET 8 | Chỉ định `--version 8.0.11` |
| 2 | `address already in use :5055` | Đổi sang port `5056` |
| 3 | CSP blocked fetch tới `localhost:5056` | Thêm vào `connect-src` trong `index.html` |
| 4 | 401 login dù password đúng | localStorage còn cache `station_token` mock cũ → xóa trong DevTools |
| 5 | `bin/obj` bị commit vào git | `git rm -r --cached` → commit lại |

### Kết quả cuối ngày
- Backend chạy ổn tại `http://localhost:5056`
- Login từ frontend thật sự qua JWT
- DB có schema đầy đủ, seed admin `admin/Admin@123`

---

## 2026-04-03 — Phase 2: Dữ liệu thật + Camera + Tests

### Làm gì

**Backend Phase 2**
- `StationsController` — `GET /api/v1/stations`
- `DevicesController` — CRUD thiết bị, filter by type, test connection, LAN scan
- `MeasurementsController` — `GET /api/v1/points` dùng `DISTINCT ON` TimescaleDB để lấy giá trị mới nhất mỗi điểm
- `PlcPollingWorker` — đọc PLC Siemens S7-1200 tại `192.168.10.100` mỗi 3 giây
  - DB32: offset 0 = Pha1°C, offset 2 = Pha3°C, offset 4 = Pha2°C, offset 8 = PD dB
  - Lưu vào `SensorReadings`, push realtime qua SignalR
- `IRealtimeNotifier` interface tách circular dependency (Workers → Api)
- `SignalRNotifier` + `RealtimeHub` — push event `SensorUpdate`, `Alert`, `DeviceStatus`
- CORS fix: dùng `WithOrigins("http://localhost:5173")` + `AllowCredentials()` thay vì `AllowAnyOrigin`
- Seed data: tự tạo trạm + PLC + 3 camera khi DB trống

**Frontend Phase 2**
- `StationApiService.ts` — wrapper gọi backend với JWT auto-inject
- `DashboardPage` — KPI nhiệt độ + PD cập nhật từ PLC thật mỗi 5s
- `RealtimeMonitorPage` — camera load từ DB API thay vì hardcode
- SignalR client kết nối `/ws/realtime`, nhận `SensorUpdate` realtime

**Fix camera phóng điện (192.168.10.153) màn đen**
- Root cause 1: `go2rtc.yaml` hardcode `hikvision_sub` trỏ vào channel `/102` (audio-only, không có video) → sửa sang `/101`
- Root cause 2: DB config camera 153 dùng credentials sai (`admin/Demo@2024`) → đúng là `admin/Demo@2024`, update qua `PUT /api/v1/devices/{id}`
- Root cause 3: Camera từ chối reconnect sau khi xóa stream đột ngột → cập nhật `go2rtc.yaml` và restart go2rtc

**Remove Ngrok references**
- `ScadaApiService.ts`: đổi `API_BASE_URL` từ Ngrok URL hết hạn → `http://localhost:5056`
- `DashboardPage.ts` + `RealtimeMonitorPage.ts`: bỏ import `scadaApi`, dùng `StationApiService` thay thế

**Viết Playwright E2E tests**
- `playwright.config.ts` — config test, baseURL `http://localhost:5173`
- `e2e/helpers.ts` — `loginAsAdmin()`, `navigateTo()`
- `e2e/phase1-auth.spec.ts` — 6 tests: login fail/success, navigation, logout
- `e2e/phase2-data.spec.ts` — 8 tests: dashboard render, camera count ≥3, camera iframe src, device CRUD, SignalR negotiate, sensor API

**Init monorepo git**
- Gộp frontend + backend vào 1 repo tại `D:\StationMonitor`
- Commit `chore: init monorepo - merge frontend + backend` lúc 17:43

### Lỗi gặp hôm nay

| # | Lỗi | Fix |
|---|-----|-----|
| 6 | Docker daemon không chạy khi mở terminal mới | Mở Docker Desktop, chờ icon taskbar xanh |
| 7 | Firefox không kết nối localhost | Dùng Chrome thay thế |
| 8 | Workers → Api circular dependency | Tạo `IRealtimeNotifier` interface ở Services layer |
| 9 | `Plc.DBReadAsync` không tồn tại trong S7.Net Plus | Đúng là `ReadAsync` với đầy đủ params |
| 10 | `InvalidCastException` parse JSONB config từ DB | Tạo helper `GetString/GetInt` kiểm tra `JsonElement` trước khi convert |
| 11 | EF Core `GroupBy + First()` không dịch được sang SQL | Dùng raw SQL với `DISTINCT ON` của PostgreSQL |
| 12 | Raw SQL dùng `"sensor_readings"` → table not found | Tên bảng EF Core là `"SensorReadings"` (case-sensitive, cần quote) |
| 13 | SignalR CORS lỗi với `AllowAnyOrigin + Credentials` | Dùng `WithOrigins("http://localhost:5173") + AllowCredentials()` |
| 14 | Frontend nhận `Config` camera là JSON string thay vì object | Parse trong `StationApiService.ts`: `JSON.parse(d.config)` nếu là string |
| 15 | Camera phóng điện màn đen — channel 102 audio-only | Đổi sang channel 101 trong `go2rtc.yaml` |
| 16 | Camera phóng điện không load — credentials sai trong DB | Update DB via `PUT /api/v1/devices/{id}` với `admin/Demo@2024` |
| 17 | Camera 153 từ chối reconnect sau disconnect đột ngột | Restart go2rtc để tạo fresh connection |
| 18 | `DevicesController` không re-register go2rtc khi update | Thêm `RegisterCameraStreamAsync` sau `SaveChangesAsync` trong `Update()` |
| 19 | DashboardPage gọi Ngrok cũ → NetworkError | Remove import scadaApi, đổi sang StationApiService |
| 20 | go2rtc.yaml hardcode tên stream xung đột với DB go2rtc_id | Đặt tên yaml nhất quán với `go2rtc_id` trong DB |
| 21 | Playwright tests fail — selectors sai (`.admin-card`, nav IDs) | Dùng `.admin-header`, `device-management`, `rule-engine` từ error-context |
| 22 | UI tests fail — `loginAsAdmin` dùng `Admin@123` nhưng AuthService mock `admin123` | Fix AuthService → gọi backend thật, mock bị xóa hoàn toàn |
| 23 | SignalR test fail — URL `/hubs/realtime/negotiate` → 404 | URL đúng là `/ws/realtime/negotiate` (từ `app.MapHub<RealtimeHub>("/ws/realtime")`) |

### Kết quả cuối ngày
- **14/14 API tests PASS** (`node test-api.mjs`)
- **14/14 Playwright UI tests PASS** (Phase 1: 6/6, Phase 2: 8/8)
- Dữ liệu thật từ PLC: Pha1/2/3 ~30°C, PD ~-60 dB
- Camera 152 hoạt động ổn (normal + thermal)
- Camera 153 phóng điện: config đã fix, chờ restart go2rtc để verify video

### Todo còn lại
- [x] Restart go2rtc để camera 153 hiển thị video (go2rtc.yaml đã update)
- [x] Phase 3-9, 11: Hoàn thành

---

## 2026-04-05 — Phase 11: Protocol + Hạ tầng + Simulators

### Làm gì

**Quality infrastructure**
- `DataQualityPipeline` — Range → Spike (3σ) → Deadband → Moving average
- `CircuitBreaker` — 3 states (Closed/Open/HalfOpen), auto-recover
- `RetryHelper` — exponential backoff + jitter

**Protocol Workers** (tất cả extend `BackgroundService`, inject `IServiceScopeFactory`)
- `ModbusTcpWorker` — FluentModbus 5.2.0 FC3, sync helper do Span<T> constraint
- `ModbusRtuWorker` — serial port, shared client per port, mutex
- `MqttSubscriberWorker` — MQTTnet 4.x, auto-register device mới
- `Iec104Worker` — TCP skeleton, STARTDT + General Interrogation

**Camera Services**
- `OnvifService` — UDP WS-Discovery, SOAP GetSnapshotUri
- `HikvisionIsapiService` — ISAPI HTTP, snapshot, PTZ, event stream

**Discovery & Testing**
- `AutoDiscoveryService` — ping sweep → port scan → protocol probe
- `ProtocolConnectionTester` — test kết nối không ghi DB
- `ProtocolController` — 5 endpoints

**Infrastructure**
- `PermissionService`, `StorageMonitorWorker`, `RuleTriggerLog`
- Mở rộng `AuditLogController`, thêm rules toggle, CSV export

**Simulators** (project riêng — `StationMonitor.Simulators`)
- `ModbusTcpSimulator` — raw TcpListener (không dùng FluentModbus server)
- `MqttSimulator`, `Iec104Simulator`
- `ProtocolTestRunner` — 19/19 PASS

### Lỗi gặp và cách sửa

| # | Lỗi | Fix |
|---|-----|-----|
| 1 | CS9051: `file class` trong method signature | Đổi sang `internal sealed class` |
| 2 | CS8652: Span<T> in async | Tách sync helper `ReadAllRegisters()` ra khỏi async method |
| 3 | `ModbusTcpClient.Connect(string, int)` không tồn tại | `Connect(new IPEndPoint(IPAddress.Parse(ip), port))` |
| 4 | `ModbusRtuClient.DataBits` không tồn tại | Xóa dòng đó |
| 5 | `ModbusTcpServer` API FluentModbus 5.2.0 thay đổi | Rewrite simulator dùng raw `TcpListener` |
| 6 | `Device.IsActive` không tồn tại | Dùng `d.Status != "maintenance"` |
| 7 | `db.DataPoints` không tồn tại | Dùng `SensorReading` với string `PointId` trực tiếp |
| 8 | `Math.Min(ushort, 250)` ambiguous CS0121 | Cast: `Math.Min((int)length, 250)` |
| 9 | Program.cs `return int` (CS0126) | Wrap trong `static async Task<int> MainAsync(args)` |
| 10 | `SystemSettings.Value` là string, không phải JsonElement | Dùng `setting.Value` trực tiếp |

### Kết quả cuối ngày
- **47/47 unit tests PASS** (`dotnet test`)
- **19/19 protocol self-tests PASS** (`dotnet run -- test`)
- **35/35 API tests PASS** (`node test-api.mjs`) → đã nâng lên 47 sau Phase 8
- `test-protocol.mjs` — 13 test cases
- Simulator chạy ổn: Modbus TCP + IEC-104 + MQTT
- Đánh giá scale: 1-10 trạm ngay bây giờ, mở rộng dễ do StationId đã có ở mọi entity

### Quyết định kỹ thuật quan trọng
- **Simulator không dùng DB**: project riêng hoàn toàn, chỉ dùng System.Net.Sockets + MQTTnet
- **Test ports tách biệt**: 15020 (Modbus test), 12404 (IEC-104 test) ≠ production 502/2404
- **FluentModbus server API**: không dùng do API unstable giữa versions — dùng raw TCP thay
- **`internal` thay `file`**: config DTOs trong Workers phải `internal` để tránh CS9051
- **Scale strategy**: StationId trên mọi entity + TimescaleDB partition đủ cho 50+ trạm không cần refactor

---

## 2026-04-06 (session 2) — UI Polish + RuleEngine + UserManagement

### Làm gì

**Theme & màu sắc (fix gốc)**
- `AppShell.ts`: đọc `localStorage['station-theme']` khi render, apply `theme-dark/theme-light/...` class → toàn bộ trang đồng bộ theme
- `index.html`: thống nhất key từ `station-monitor-theme` → `station-theme`
- `SettingsPage`: highlight đúng theme đang active

**AuditLogPage**
- Đổi tất cả `var(--bg)`, `var(--surface)`, `var(--border)` → `var(--admin-bg)`, `var(--admin-card-bg)`, `var(--admin-border)` trong inline `<style>`

**RealtimeMonitorPage (camera)**
- Đổi toàn bộ hardcode trắng sang admin vars: `.monitor-toolbar`, `.camera-logs-section`, `.sidebar-edge-toggle`, `.cam-log-item`, v.v.

**AlertsHistoryPage**
- Thêm time range filter (hôm nay/hôm qua/7d/30d/tất cả) + scroll tbody
- Thêm sort dropdown với icon + dấu ✓, `position:fixed` để tránh clip bởi overflow
- Backend `AlertsController.GetAll` thêm `from`/`to` params
- `StationApiService.getAlerts()` thêm from/to
- Fix column misalignment: đổi từ `<table table-layout:fixed>` sang **CSS Grid** (`grid-template-columns: 155px 100px 1fr 70px 120px 100px`) — triệt để hơn, không còn bug browser table layout
- Thêm inline detail panel (slide-in từ phải, 420px): click dòng → panel mở, hiện timeline lịch sử, nút ACK/Đóng/Phân tích ngay trong trang, không navigate sang trang riêng

**AlertDetailPage**
- Viết lại hoàn chỉnh: bỏ IndexedDB mock → gọi `stationApi.getAlertDetail(id)` thật
- Timeline lịch sử xử lý, nút ACK/Close với confirm

**RuleEnginePage** (hoàn thiện)
- Viết lại `RuleEnginePage.ts`: CSS Grid list, stats bar (tổng/bật/alarm), toggle dùng `PATCH /api/v1/rules/{id}/toggle` thay vì PUT
- Thêm nút ✏ Sửa — modal điền sẵn thông tin, save gọi `PUT`
- `StationApiService`: thêm `toggleRule()` → PATCH
- Xóa stub `RuleEnginePage` thừa trong `OtherPages.ts`

**UserManagementPage**
- Đã đầy đủ từ trước (CRUD + change-password + deactivate + toast)
- Xác nhận CSS classes hợp lệ, không cần sửa

### Lỗi gặp
| # | Lỗi | Fix |
|---|-----|-----|
| 1 | Table column misalign — `<col style="width:auto">` với `table-layout:fixed` cho width gần 0 | Bỏ hoàn toàn `<table>`, dùng CSS Grid |
| 2 | Sort dropdown bị clip bởi `overflow:auto` | `position:fixed` + `getBoundingClientRect()` + `appendChild(document.body)` |
| 3 | `display:flex` trên `<span>` trong `<th>` làm cột co giãn không đúng với `table-layout:auto` | Giải quyết triệt để khi chuyển sang Grid |

### Kết quả
- TypeScript 0 lỗi (`npx tsc --noEmit`)
- Chuyển sang phase Mobile App

---

## 2026-04-06 — Phase 10: Cloud Sync Supabase

### Làm gì

**Supabase setup**
- Tạo project `nezuteiwukcheqpzitcn` trên supabase.com (free tier)
- Chạy `supabase_setup.sql` → tạo bảng `alerts` + `maintenance_tasks`
- Bật RLS: anon key chỉ SELECT (mobile app), service_role INSERT/UPDATE (backend)
- Không dùng supabase-csharp SDK — dùng HttpClient gọi REST API `/rest/v1/{table}` trực tiếp

**Backend**
- `SupabaseService` (Services): HttpClient wrapper, upsert dùng `Prefer: resolution=merge-duplicates`, có flag `IsConfigured` kiểm tra trước khi gọi
- `CloudSyncWorker` (Workers/Polling): chạy mỗi 5 phút, delay 30s sau startup, batch 50 items/lần, retry tối đa 3 lần rồi đánh dấu failed
- `RuleEvaluationWorker`: sau `SaveChangesAsync` → thêm Alert vào SyncQueue với payload JSON đầy đủ
- `SyncController`: `GET /api/v1/sync/status`, `POST /api/v1/sync/trigger` (admin only)
- Config trong `appsettings.json` section `Supabase`: Url, ServiceKey, AnonKey

**Frontend**
- SettingsPage: thêm tab thứ 5 "Cloud Sync"
- `StationApiService`: `getSyncStatus()`, `triggerSync()`
- UI: 3 counter card (pending/sent/failed), badge kết nối, nút Sync ngay + Làm mới

### Quyết định kỹ thuật
- **HttpClient thay SDK**: supabase-csharp có vấn đề dependency với .NET 8 → dùng HttpClient thẳng, đơn giản hơn, kiểm soát được header
- **Chỉ sync Alert + Maintenance**: không sync SensorReadings (tốn quota 500MB) — alert/maintenance ít bản ghi, quan trọng hơn cho mobile
- **Retry 3 lần**: tránh stuck khi Supabase tạm lỗi, sau 3 lần mới đánh failed, admin có thể reset qua `/sync/trigger`
- **AnonKey lưu appsettings**: dành cho mobile app đọc sau này

### Kết quả
- Build thành công, 0 errors
- TypeScript 0 lỗi
- Supabase: bảng tạo thành công, RLS active

