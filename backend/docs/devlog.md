# DevLog — StationMonitor

> Nhật ký phát triển theo ngày. Ghi lại những gì đã làm, lỗi gặp, và quyết định kỹ thuật quan trọng.

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
- Root cause 2: DB config camera 153 dùng credentials sai (`admin/Demo@2024`) → đúng là `tladmin/Ab@12345`, update qua `PUT /api/v1/devices/{id}`
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
| 16 | Camera phóng điện không load — credentials sai trong DB | Update DB via `PUT /api/v1/devices/{id}` với `tladmin/Ab@12345` |
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
- [ ] Restart go2rtc để camera 153 hiển thị video (go2rtc.yaml đã update)
- [ ] Phase 3: Rule Engine + Alerts + Cloudflare Tunnel
