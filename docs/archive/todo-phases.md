# TODO — Các Phase Còn Lại
> Đọc file này khi bắt đầu 1 phase mới. Tick ✅ khi xong từng mục.

---

## Phase 6 — Reports PDF ✅ (2026-04-05)

### Đã cài
- ✅ `QuestPDF 2024.3.0`
- ✅ `Hangfire.AspNetCore 1.8.9`
- ✅ `Hangfire.PostgreSql 1.20.9`

### Backend ✅
- ✅ `ReportsController`: `POST /api/v1/reports/generate`, `GET /api/v1/reports`, `GET /api/v1/reports/{id}/download`, `DELETE /api/v1/reports/{id}`
- ✅ `ReportGeneratorService` (QuestPDF): Daily, Monthly, Event reports
- ✅ `ReportSchedulerWorker` (Hangfire RecurringJob): auto daily report lúc 00:05
- ✅ Lưu PDF vào `wwwroot/reports/{id}.pdf` + entity `Report` vào DB
- ✅ Hangfire dashboard tại `/hangfire`

### Frontend ✅
- ✅ `ReportsPage`: Tab 1 XLSX export, Tab 2 PDF báo cáo phân tích
- ✅ SheetJS (xlsx) — 3 sheet: Dữ liệu, Thống kê, Cảnh báo
- ✅ Preview 30 dòng + biểu đồ trước khi export
- ✅ Lịch sử báo cáo + download/xóa

---

## Phase 7 — Notifications ✅ (2026-04-05)

### Setup bên ngoài
- ✅ Mailtrap SMTP config trong appsettings.json
- ✅ Firebase không dùng (chỉ làm email)

### Đã cài
- ✅ `MailKit 4.3.0`

### Backend ✅
- ✅ `EmailNotifyService`: HTML email khi Alert mới
- ✅ Tích hợp vào `RuleEvaluationWorker` khi tạo Alert
- ✅ Ghi `NotifyLog` (sent/failed) vào DB
- ✅ `GET /api/v1/notifications/smtp-config`
- ✅ `POST /api/v1/notifications/test-email`

### Frontend ✅
- ✅ SettingsPage thêm tab "Thông báo"
- ✅ Input email, nút test gửi thử

---

## Phase 8 — Maintenance Tracking ✅ (2026-04-05)

### Backend ✅
- ✅ Migration `AddMaintenanceTask` — entity `MaintenanceTask` với Checklist JSONB
- ✅ 9 API endpoints: CRUD + start + complete + from-alert + upcoming + suggestions
- ✅ `MaintenanceReminderWorker` (mỗi 1h): auto-overdue, nhắc nhở 7d/1d/hôm nay/quá hạn
- ✅ Alert tích hợp: tạo từ maintenance, source="maintenance", auto-close khi complete

### Frontend ✅
- ✅ `MaintenancePage`: stats 4 ô, đề xuất, filter tabs, bảng + checklist, modal
- ✅ Form tạo/sửa task với checklist động theo type

---

## Phase 9 — Analytics nâng cao ✅ (2026-04-05)

### Backend ✅
- ✅ `EarlyWarningWorker` (mỗi 30 phút): slope > 0.3°C/ngày 7 ngày → Alert level='warning'
- ✅ `HealthScoreCalculator` (mỗi giờ): score 0-100, lưu SystemSettings, < 60 → tạo maintenance task
- ✅ `GET /api/v1/analytics/health?stationId=`
- ✅ `GET /api/v1/analytics/trend?stationId=&days=`

### Frontend ✅
- ✅ AnalyticsPage v2 — 6 tab: Tổng quan, Nhiệt độ, Phóng điện, Tương quan, Cảnh báo, Sức khỏe
- ✅ Threshold động từ Rules, Pearson correlation, health score bars

---

## Phase 10 — Cloud Sync (Supabase) ✅ (2026-04-06)

### Supabase project
- ✅ URL: `https://nezuteiwukcheqpzitcn.supabase.co`
- ✅ Bảng `alerts` + `maintenance_tasks` tạo bằng `supabase_setup.sql`
- ✅ RLS: anon key chỉ SELECT, service_role INSERT/UPDATE

### Cài đặt
- ✅ Không cần SDK — dùng HttpClient gọi REST API trực tiếp

### Backend ✅
- ✅ `SupabaseService` — HttpClient upsert, `Prefer: resolution=merge-duplicates`, IsConfigured flag
- ✅ `CloudSyncWorker` — mỗi 5 phút, batch 50 items, retry 3 lần, đánh dấu sent/failed
- ✅ `RuleEvaluationWorker` — hook thêm Alert vào SyncQueue sau khi tạo
- ✅ `GET /api/v1/sync/status` — pendingCount, sentCount, failedCount, lastSyncAt, isConfigured
- ✅ `POST /api/v1/sync/trigger` (admin) — reset failed → pending

### Frontend ✅
- ✅ SettingsPage tab "Cloud Sync" — 3 counter, badge kết nối, nút Sync ngay + Làm mới
- ✅ `StationApiService`: `getSyncStatus()`, `triggerSync()`

### Cách test
1. Settings → tab "Cloud Sync" → badge "✓ Đã kết nối"
2. Trigger 1 rule → Alert tạo → SyncQueue +1 pending → hiện trên UI
3. Bấm "Sync ngay" → đợi CloudSyncWorker chạy (~5 phút hoặc restart backend)
4. Supabase Dashboard → Table Editor → `alerts` → thấy record
5. `GET /api/v1/sync/status` → `sentCount` tăng

---

## Phase 11 — Protocol + Hạ tầng ✅ (2026-04-05)

### Backend ✅
- ✅ `DataQualityPipeline` — Range → Spike detect → Deadband → Moving average
- ✅ `CircuitBreaker` — Closed/Open/HalfOpen, tự recover sau timeout
- ✅ `RetryHelper` — Exponential backoff + jitter
- ✅ `ModbusTcpWorker` — FC3 holding registers, circuit breaker, poll throttle
- ✅ `ModbusRtuWorker` — Serial port, shared client per port, SemaphoreSlim mutex
- ✅ `MqttSubscriberWorker` — Subscribe broker, auto-register device mới vào DB
- ✅ `Iec104Worker` — TCP connect, STARTDT, General Interrogation (skeleton)
- ✅ `OnvifService` — WS-Discovery multicast, GetSnapshotUri, PTZ
- ✅ `HikvisionIsapiService` — Snapshot JPEG, PTZ, event stream, device info
- ✅ `AutoDiscoveryService` — Ping sweep → port scan → Modbus probe → ONVIF
- ✅ `ProtocolConnectionTester` — Test kết nối không ghi DB, trả latency + data
- ✅ `ProtocolController` — 5 endpoints: discover, scan, discover-onvif, test-connection, serial-ports
- ✅ `PermissionService` — Operator chỉ xem trạm được assign (StationIds[])
- ✅ `StorageMonitorWorker` — cảnh báo disk < 10%/5%, dedup 6h/12h
- ✅ `RuleTriggerLog` — ghi log mỗi khi rule trigger
- ✅ `AuditLogController` mở rộng — username/fullName join, filter from/to, notify + rule-trigger tabs
- ✅ `PATCH /api/v1/rules/{id}/toggle` — bật/tắt rule nhanh
- ✅ `GET /api/v1/alerts/export` + `GET /api/v1/history/export` — CSV

### Simulators ✅ (KHÔNG ghi DB)
- ✅ `StationMonitor.Simulators` — project console riêng biệt
- ✅ `ModbusTcpSimulator` — raw TCP server, 7 registers, update mỗi 3s
- ✅ `MqttSimulator` — 6 sensor points, publish mỗi 5s
- ✅ `Iec104Simulator` — STARTDT + GI + spontaneous update mỗi 5s
- ✅ `ProtocolTestRunner` — 19/19 PASS, không cần phần cứng

### Tests ✅
- ✅ 47 unit tests PASS (`StationMonitor.Tests`)
- ✅ 19 protocol self-tests PASS
- ✅ `test-protocol.mjs` — 13 API test cases

### Docs ✅
- ✅ `SIMULATOR_GUIDE.md` — hướng dẫn đầy đủ
- ✅ `PROTOCOL_PLAN.md` — kế hoạch giao thức

---

## Thứ tự ưu tiên hiện tại

```
✅ Phase 6  → Reports PDF + XLSX
✅ Phase 7  → Notifications Email
✅ Phase 8  → Maintenance tracking
✅ Phase 9  → Analytics nâng cao
✅ Phase 11 → Protocol + Simulators + Tests
✅ Phase 10 → Cloud Sync Supabase  ← XONG (2026-04-06)
── AI-1     → Python gRPC AI sidecar (chờ phần cứng Jetson)
── AI-2     → Backend AI integration
── AI-3     → Frontend AI overlay
```
