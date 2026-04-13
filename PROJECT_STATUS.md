# StationMonitor — Trạng thái Dự án Toàn diện
> Cập nhật: 2026-04-07
> File này là snapshot đầy đủ nhất về những gì đã làm, chưa làm, test ra sao.

---

## 1. Frontend Pages (14 trang)

| Page | File | API | Tính năng chính |
|------|------|-----|----------------|
| Dashboard | DashboardPage.ts | ✅ Real | SLD diagram, KPI sensors, alert badge, camera preview |
| Realtime Monitor | RealtimeMonitorPage.ts | ✅ Real | Camera grid go2rtc, SignalR SensorUpdate, status |
| Alerts History | AlertsHistoryPage.ts | ✅ Real | CSS Grid list, sort, filter, inline detail panel slide-in |
| Alert Detail | AlertDetailPage.ts | ✅ Real | Chi tiết alert, ACK/close, timeline lịch sử |
| Analytics | AnalyticsPage.ts | ✅ Real | 6 tab: Tổng quan, Nhiệt độ, PD, Tương quan, Cảnh báo, Sức khỏe |
| Reports | ReportsPage.ts | ✅ Real | XLSX export, PDF generate/download/delete, lịch sử |
| Maintenance | MaintenancePage.ts | ✅ Real | Task CRUD, checklist, workflow start/complete, đề xuất |
| Device Management | DeviceManagementPage.ts | ✅ Real | Device CRUD, test connection |
| User Management | OtherPages.ts | ✅ Real | User CRUD, change password, deactivate |
| Rule Engine | RuleEnginePage.ts | ✅ Real | Rule CRUD, toggle PATCH, edit modal, stats bar |
| Settings | SettingsPage.ts | ✅ Real | System settings, Cloud Sync tab, test email |
| Audit Log | AuditLogPage.ts | ✅ Real | Audit/Login/Rule-trigger/Notify logs, filter |
| Multisite | OtherPages.ts | ✅ Real | Danh sách trạm (chưa có map) |
| AI Debug | AiDebugPage.ts | ❌ Stub | Ẩn khỏi menu, chưa implement |

---

## 2. Backend Controllers & Endpoints (16 controllers, 55+ endpoints)

| Controller | Endpoints | Ghi chú |
|-----------|-----------|---------|
| AuthController | 3 | POST /login, POST /refresh, GET /me |
| StationsController | 3 | GET, GET {id}, POST — **thiếu PUT/DELETE** |
| DevicesController | 7 | CRUD + test connection + scan |
| MeasurementsController | 4 | /points, /history, /history/bulk, /history/export |
| RulesController | 6 | CRUD + PATCH {id}/toggle |
| AlertsController | 6 | GET all + {id} + ack + close + export + test |
| UsersController | 5 | GET + POST + PUT + change-password + DELETE |
| SystemSettingsController | 2 | GET + PUT {key} |
| AuditLogController | 4 | audit + login + rule-triggers + notify |
| MaintenanceController | 9 | CRUD + start + complete + from-alert + upcoming + suggestions |
| ReportsController | 4 | generate + list + download + delete |
| SldController | 5 | GET + upload SVG + add/update/delete points |
| AnalyticsController | 2 | /health + /trend |
| NotificationsController | 3 | smtp-config + test-email + test-email/direct |
| SyncController | 2 | /status + /trigger |
| ProtocolController | 5 | discover + discover-onvif + scan + test-connection + serial-ports |

---

## 3. Frontend API Service (47 methods)

Stations(2) · Devices(7) · Measurements(3) · Rules(5) · Alerts(4) · Logs(4) · Users(5) · Settings(2) · SLD(5) · Reports(4) · Maintenance(9) · Notifications(2) · Analytics(2) · Sync(2)

---

## 4. Navigation / Menu

**Tất cả user:**
- Dashboard, Realtime Monitor, Alerts History, Analytics, Reports, Maintenance, Audit Log, Multisite

**Admin only:**
- Device Management, User Management, Rule Engine

**Bottom:**
- Settings, Logout

**Ẩn (không trong menu):**
- Alert Detail (navigate từ Alerts History)
- AI Debug (chưa hoàn thiện)

---

## 5. Tests

### Backend Unit Tests (4 files, 434 LOC)
| File | Nội dung |
|------|---------|
| AlertLifecycleTests.cs | Alert tạo, ACK, close workflow |
| EarlyWarningTests.cs | EarlyWarningWorker detection |
| RuleEvaluatorTests.cs | Rule evaluation operators |
| StorageMonitorTests.cs | Storage monitor |

### API Integration Tests — test-api.mjs (42 test cases)
| Phase | Nội dung |
|-------|---------|
| Phase 1 | Auth: login, token |
| Phase 2A | Stations |
| Phase 2B | Devices CRUD + test connection |
| Phase 2C | Measurements + sensor history |
| Phase 3 | Rules CRUD |
| Phase 4 | Alerts ACK/close |
| Phase 5 | Audit logs |
| Phase 6 | Users CRUD |
| Phase 7 | Settings GET/PUT |
| Phase 8 | Maintenance CRUD + workflow |
| **Thiếu** | Phase 9 Analytics, Phase 10 Sync, Export endpoints |

### E2E Playwright (5 spec files)
| File | Nội dung |
|------|---------|
| phase1-auth.spec.ts | Login, logout, navigation guard |
| phase2-data.spec.ts | Dashboard, devices, sensors |
| phase3-rules-alerts.spec.ts | Rules CRUD, alerts filter/sort |
| phase4-users-settings.spec.ts | Users CRUD, settings, theme |
| phase5-plus.spec.ts | Reports, maintenance, analytics |

### Protocol Tests — test-protocol.mjs
- 13 test cases cho 5 ProtocolController endpoints
- 19/19 unit tests riêng cho Modbus/MQTT/IEC-104

---

## 6. Gaps — Backend có nhưng Frontend chưa có

| Gap | Backend endpoint | Mức độ |
|-----|-----------------|--------|
| Export alert CSV | GET /alerts/export | Nhỏ — cần thêm 1 nút |
| Export history CSV | GET /history/export | Nhỏ — cần thêm 1 nút |
| SMTP config đầy đủ | GET /notifications/smtp-config | Trung bình — SettingsPage chỉ test email |
| Protocol Discovery UI | GET /protocol/discover, /discover-onvif, /scan | Trung bình — DeviceManagement thiếu UI |
| StationsController PUT/DELETE | Chưa có backend | Nhỏ |
| DetectionsPage (AI) | Chưa có cả backend lẫn frontend | Lớn — chờ AI phase |

---

## 7. Logic Backend — Chưa đủ (cần làm trước khi view)

| Vấn đề | File | Mức độ |
|--------|------|--------|
| **Flapping/Spam alert** — không có hysteresis/cooldown | RuleEvaluationWorker.cs | 🔴 Rất cao — bug vận hành |
| **Delta-T 3 pha** — không so sánh chênh lệch nhiệt giữa Pha A/B/C | EarlyWarningWorker.cs | 🔴 Cao — CBM yêu cầu |
| **PD frequency counting** — chỉ nhìn biên độ dB, không đếm tần suất | EarlyWarningWorker.cs | 🔴 Cao — PD thật sự nguy hiểm |
| **Load correlation** — không đối chiếu dòng tải với nhiệt | Chưa có class | 🔴 Cao — CBM thật sự |
| **Health Score decay** — alert cũ = alert mới, không có temporal decay | HealthScoreWorker.cs | 🟡 Trung bình |
| **StationsController PUT/DELETE** | StationsController.cs | 🟡 Trung bình |

Chi tiết đầy đủ: xem `ANALYTICS_PLAN.md`

---

## 8. AI Phase — Kế hoạch (chờ Jetson)

- Giao tiếp: **gRPC** (không HTTP POST)
- Contract: `ai-python/ai_service.proto` — 6 RPC methods
- Bước 1-4 làm được ngay (không cần Jetson): DetectionsController, CameraEventWorker, DetectionsPage, AiGrpcClient
- Chi tiết đầy đủ: xem `AI_PLAN.md`

---

## 9. Mobile App — Trạng thái

- Stack: React Native Expo SDK 54
- Kết nối: Cloudflare Tunnel → backend
- Step 1-5 xong: env, notifications, SignalR, trend API, live camera stream
- Step 6 (device detail real trend) và build APK tạm hoãn
- Chi tiết: xem `MOBILE_PLAN.md`

---

## 10. Thứ tự ưu tiên làm tiếp

```
🔴 Rất cao — ảnh hưởng vận hành ngay:
  1. Hysteresis + Cooldown (fix flapping alert spam)
  2. Delta-T phân tích 3 pha nhiệt độ
  3. PD Frequency Counting

🟡 Trung bình — hoàn thiện logic trước khi view:
  4. Load Correlation (CBM thật sự)
  5. Health Score nâng cao (decay + weights)
  6. SMTP config đầy đủ trong SettingsPage
  7. StationsController PUT/DELETE

🟢 Nhỏ — view/UI, backend sẵn sàng:
  8. Nút export CSV trên AlertsHistoryPage
  9. Nút export CSV trên AnalyticsPage/ReportsPage
  10. Protocol Discovery UI trong DeviceManagement
  11. Mở rộng test-api.mjs Phase 9-10

⚪ Chờ phần cứng/data:
  12. MultisitePage map (chờ lat/lng)
  13. DetectionsPage (chờ AI backend)
  14. AI Phase 1-3 (chờ Jetson)
  15. ARIMA/LSTM (chờ Python/Jetson)
```
