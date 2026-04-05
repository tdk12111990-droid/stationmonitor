# TODO — Các Phase Còn Lại
> Đọc file này khi bắt đầu 1 phase mới. Tick ✅ khi xong từng mục.

---

## Phase 6 — Reports PDF 📄
> Không cần setup gì thêm. Làm ngay.

### Cần cài
- [ ] `dotnet add package QuestPDF --version 2024.3.0` (backend)
- [ ] `dotnet add package Hangfire.AspNetCore --version 1.8.9` (scheduler)
- [ ] `dotnet add package Hangfire.PostgreSql --version 1.20.9` (Hangfire dùng DB đã có)

### Backend
- [ ] `ReportsController`: `POST /api/v1/reports/generate`, `GET /api/v1/reports`, `GET /api/v1/reports/{id}/download`
- [ ] `ReportGeneratorService` (QuestPDF):
  - [ ] Daily: nhiệt độ min/max/avg 3 pha, số PD events, danh sách alerts trong ngày
  - [ ] Monthly: tổng hợp theo bảng số, top alerts, thiết bị maintenance nhiều nhất
  - [ ] Event: chi tiết 1 alert + AlertHistory + giá trị sensor xung quanh thời điểm
- [ ] `ReportSchedulerWorker` (Hangfire): tự tạo daily report lúc 00:05 mỗi ngày
- [ ] Lưu PDF vào `wwwroot/reports/{id}.pdf` + ghi entity `Report` vào DB
- [ ] Đăng ký Hangfire trong `Program.cs` + dashboard UI tại `/hangfire`

### Frontend
- [ ] `ReportsPage`: kết nối API thật (xóa mock)
- [ ] Form: chọn loại (daily/monthly/event) + date range + nút "Tạo báo cáo"
- [ ] Danh sách báo cáo đã tạo + nút Download
- [ ] Nút "Tải về" → `GET /api/v1/reports/{id}/download` → blob download

### Test
- [ ] Thêm tests vào `test-api.mjs` cho Reports endpoints

---

## Phase 7 — Notifications 🔔
> Cần setup Mailtrap + Firebase trước khi làm.

### Setup bên ngoài (làm trước)
- [ ] **Mailtrap**: vào mailtrap.io → tạo account → Inboxes → lấy SMTP Host/Port/Username/Password
- [ ] **Firebase**: console.firebase.google.com → tạo project → Project Settings → Service Accounts → "Generate new private key" → tải file `firebase-adminsdk.json` về → để vào `backend/StationMonitor.Api/`
- [ ] Điền vào `appsettings.json`:
  ```json
  "Smtp": { "Host": "...", "Port": 587, "User": "...", "Pass": "..." },
  "Firebase": { "CredentialFile": "firebase-adminsdk.json" }
  ```

### Cần cài
- [ ] `dotnet add package MailKit --version 4.3.0`
- [ ] `dotnet add package FirebaseAdmin --version 2.4.0`

### Backend
- [ ] `EmailNotifyService`: gửi HTML email khi có Alert mới (kèm tên thiết bị, giá trị, thời điểm)
- [ ] `FcmNotifyService`: gửi push notification qua Firebase
- [ ] `AlertNotifyWorker`: sau khi tạo Alert → gọi Email + FCM → ghi `NotifyLog`
- [ ] `NotifyLog` entity: đã có trong migrations, ghi sent/failed + channel + recipient
- [ ] `POST /api/v1/settings/test-notify` → gửi email/FCM thử

### Frontend
- [ ] SettingsPage: thêm tab "Thông báo"
  - [ ] Input: danh sách email nhận cảnh báo
  - [ ] Input: FCM token (người dùng tự paste hoặc tự lấy từ service worker)
  - [ ] Nút "Gửi thử" → `POST /api/v1/settings/test-notify`

### Test thử FCM không cần điện thoại
- Vào Firebase Console → Cloud Messaging → "Send test message" → paste FCM token → gửi

---

## Phase 8 — Maintenance Tracking 🔧
> Không cần setup gì. Làm ngay sau Phase 7.

### Backend
- [ ] Migration: thêm entity `MaintenanceTask` (tên, deviceId, scheduledAt, assignedTo, status, checklist JSONB)
- [ ] `MaintenanceController`:
  - [ ] `GET /api/v1/maintenance?stationId=&status=`
  - [ ] `POST /api/v1/maintenance` → tạo task
  - [ ] `PUT /api/v1/maintenance/{id}` → cập nhật
  - [ ] `PUT /api/v1/maintenance/{id}/complete` → đánh dấu xong
  - [ ] `DELETE /api/v1/maintenance/{id}`
- [ ] `AlertsController`: thêm `POST /api/v1/alerts/{id}/create-task` → tạo MaintenanceTask từ alert

### Frontend
- [ ] `MaintenancePage`: kết nối API thật (xóa mock/localStorage)
- [ ] Form tạo task: tên, chọn thiết bị, ngày lên lịch, người phụ trách, checklist items
- [ ] Danh sách tasks: filter theo status (pending/in_progress/done)
- [ ] Dashboard: hiển thị số task sắp đến hạn (badge nhỏ)

### Test
- [ ] Thêm tests vào `test-api.mjs`

---

## Phase 9 — Analytics nâng cao 📈
> Không cần setup. Chạy trên dữ liệu SensorReadings đã có.
> Nếu DB ít data: seed thêm dữ liệu giả vào `SensorReadings` để test trend.

### Backend
- [ ] `EarlyWarningWorker` (chạy mỗi 30 phút):
  - [ ] Lấy SensorReadings 7 ngày gần nhất cho mỗi điểm đo
  - [ ] Tính slope (hồi quy tuyến tính đơn giản) → nếu tăng đều > 0.3°C/ngày → tạo Alert level='warning', source='early_warning'
  - [ ] Message: "Xu hướng tăng nhiệt MBA chính, dự kiến vượt ngưỡng sau ~X ngày"
- [ ] `HealthScoreCalculator` (chạy mỗi giờ):
  - [ ] Score 0-100 cho mỗi Device dựa trên: số alert 30 ngày, tần suất offline, trend sensor
  - [ ] Lưu score vào `SystemSettings` với key `health_score_{deviceId}`
  - [ ] Score < 60 → tạo MaintenanceTask đề xuất tự động
- [ ] `GET /api/v1/analytics/health` → trả điểm sức khỏe tất cả thiết bị
- [ ] `GET /api/v1/analytics/trend?deviceId=&pointId=` → dữ liệu trend 30 ngày

### Frontend
- [ ] Dashboard: widget điểm sức khỏe (màu xanh/vàng/đỏ) cho các thiết bị chính
- [ ] AnalyticsPage: thêm tab "Xu hướng" + biểu đồ trend với đường dự báo

---

## Phase 10 — Cloud Sync (Supabase) ☁️
> Cần tạo Supabase project trước.

### Setup bên ngoài (làm trước)
- [ ] Vào supabase.com → tạo project miễn phí → lấy:
  - `Project URL`: `https://xxxx.supabase.co`
  - `anon key`: từ Settings → API
- [ ] Điền vào `appsettings.json`:
  ```json
  "Supabase": { "Url": "https://xxxx.supabase.co", "Key": "eyJ..." }
  ```
- [ ] Tạo các bảng tương ứng trên Supabase (chạy SQL script từ `plan_backend.md`)

### Cần cài
- [ ] `dotnet add package supabase-csharp --version 0.16.0`

### Backend
- [ ] `SyncQueueService`: thêm entity vào `SyncQueue` khi tạo/cập nhật Alert, SensorReading batch
- [ ] `CloudSyncWorker` (mỗi 5 phút): đọc `SyncQueue` pending → gửi lên Supabase → đánh dấu sent
- [ ] `StorageMonitorWorker`: kiểm tra disk mỗi giờ → nếu < 10GB free → compress SensorReadings cũ hơn 7 ngày
- [ ] Federated Query: nếu query history > 90 ngày → tự fallback lấy từ Supabase
- [ ] `GET /api/v1/sync/status` → trạng thái sync (pending count, last sync time, disk usage)

### Frontend
- [ ] SettingsPage: tab "Cloud" → hiển thị trạng thái sync, disk usage, nút "Sync ngay"

---

## Phase 11 — Protocol + Hạ tầng 🔌
> Modbus cần ModRSsim2 để giả lập. IEC-104 làm khung trước, test sau khi có đối tác.

### Setup bên ngoài
- [ ] **ModRSsim2**: tải tại sourceforge.net/projects/modrssim2 → chạy → config Modbus TCP port 502
  - Tạo vài register giả: holding register 0=nhiệt độ(×10), 1=dòng điện(×10)

### Cần cài
- [ ] `dotnet add package NModbus --version 3.0.2` (Modbus)
- [ ] `dotnet add package lib60870 --version 2.3.2` (IEC-104)

### Backend
- [ ] `ModbusPollingWorker`: đọc Modbus TCP mỗi 5s → lưu SensorReadings (giống PlcPollingWorker)
- [ ] `IEC104Worker`: kết nối IEC-104 server → nhận ASDU → map sang SensorReadings
  - Làm khung đầy đủ nhưng để `Enabled = false` trong settings cho đến khi có đối tác thật
- [ ] `RuleTriggerLog`: trong `RuleEvaluationWorker`, thêm ghi log khi rule trigger
- [ ] `PermissionService`: operator chỉ xem trạm được phân trong `User.station_ids`
- [ ] `PATCH /api/v1/rules/{id}/toggle` → bật/tắt rule nhanh
- [ ] `GET /api/v1/alerts/export?from=&to=` → CSV
- [ ] `GET /api/v1/history/export?deviceId=&from=&to=` → CSV

### Test
- [ ] `StationMonitor.Tests` project: unit test RuleEvaluator, AlertService
- [ ] Thêm test Modbus vào `test-api.mjs`

---

## Thứ tự nên làm

```
Phase 6  → Làm ngay (0 setup)
Phase 8  → Làm ngay (0 setup)
Phase 7  → Sau khi setup Mailtrap + Firebase (20 phút setup)
Phase 9  → Sau Phase 6-7 (cần có đủ data)
Phase 10 → Sau khi setup Supabase (10 phút setup)
Phase 11 → Sau Phase 10 (cần ModRSsim2)
```
