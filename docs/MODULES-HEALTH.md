# Module Health — Đánh giá chất lượng từng module

> Scoring: ⭐⭐⭐⭐⭐ = Excellent · ⭐⭐⭐⭐ = Good · ⭐⭐⭐ = Fair · ⭐⭐ = Needs work · ⭐ = Critical

---

## Tóm tắt nhanh

| Module | Code | Tests | Docs | Perf | Overall | Status |
|--------|------|-------|------|------|---------|--------|
| **Camera & Thermal** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Sprint vừa xong |
| **Rule Engine & Alerts** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Stable |
| **Analytics & Reports** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Stable |
| **Protocols** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ 19/19 tests pass |
| **Auth & Users** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Stable |
| **Mobile App** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | 🔄 50% (chờ SignalR) |
| **Jetson AI** | ⭐ | ⭐ | ⭐⭐ | N/A | ⭐⭐ | ⏳ Pending hardware |

---

## Chi tiết từng module

---

### 1️⃣ Camera & Thermal Overlay

**Score: ⭐⭐⭐⭐ (4/5)**

#### Code Quality ⭐⭐⭐⭐
- ✅ RealtimeMonitorPageV2.ts: tính toán letterbox đúng, xử lý edge case (video unload)
- ✅ ThermalEvidenceService: ffmpeg pipeline ổn định, error handling tốt
- ⚠️ enhanced_relay.py: có thể refactor để tách SDK logic và HTTP ingest

#### Test Coverage ⭐⭐⭐
- ✅ test-api.mjs: canvas overlay, point color, ingest
- ✅ E2E Playwright: realtime monitor page load, click point
- ❌ Chưa có: unit test cho letterbox offset calculation, ffmpeg timeout handling

#### Documentation ⭐⭐⭐⭐⭐
- ✅ `docs/modules/camera.md`: đầy đủ luồng, config, letterbox công thức
- ✅ `docs/MODULES-STRUCTURE.md`: file mapping rõ ràng
- ✅ Inline comment trong RealtimeMonitorPageV2.ts giải thích offset

#### Performance ⭐⭐⭐⭐
- ✅ Canvas overlay 10 điểm: 60 FPS
- ✅ Relay ingest: 2-5s sampling (vượt yêu cầu 30 phút)
- ⚠️ ThermalEvidenceService: ffmpeg clip 10s có thể block nếu đó cao

#### Issues & Debt
- [ ] Canvas điểm lệch khi video chưa load metadata → fix await loadedmetadata
- [ ] SignalR URL hardcode → đã fix, cần test cuối
- [ ] Relay wwwroot path inconsistency → đã fix, verify

**Action:** Close sprint + E2E test toàn flow (rule thay đổi → màu → alert → ảnh).

---

### 2️⃣ Rule Engine & Alerts

**Score: ⭐⭐⭐⭐ (4/5)**

#### Code Quality ⭐⭐⭐⭐
- ✅ RuleEvaluationWorker: hysteresis, cooldown logic đúng
- ✅ RulesController: CRUD validation tốt
- ⚠️ AlertService: email template là hardcode string, nên move sang config

#### Test Coverage ⭐⭐⭐
- ✅ test-api.mjs: create rule, inject value, trigger alert, ack/close
- ✅ .NET unit test: rule evaluation logic
- ❌ Chưa có: hysteresis flapping scenario test, cooldown race condition

#### Documentation ⭐⭐⭐⭐⭐
- ✅ `docs/modules/alerts.md`: pipeline đầy đủ, hysteresis giải thích
- ✅ MODULES-STRUCTURE.md: file mapping
- ✅ Code comment: ý nghĩa confirm_count, clearValue

#### Performance ⭐⭐⭐
- ✅ Worker 5s cycle: nhẹ, không block
- ⚠️ Email gửi synchronous → có thể delay alert nếu SMTP timeout
- ⚠️ Query DISTINCT ON heavy nếu có 1M rows SensorReadings (cần index)

#### Issues & Debt
- [ ] Email timeout silent fail → wrap trong try-catch + log
- [ ] Hysteresis flapping khi value = threshold ± 0.1 → increase hysteresis default
- [ ] Auto-close alert khi value < threshold 5 phút chưa làm

**Action:** Auto-close implement (1 ngày), email async (1 ngày).

---

### 3️⃣ Analytics & Reports

**Score: ⭐⭐⭐⭐ (4/5)**

#### Code Quality ⭐⭐⭐⭐
- ✅ AnalyticsService: SQL query tối ưu (time_bucket, DISTINCT ON)
- ✅ ReportsService: PDF/XLSX generation clean
- ⚠️ EarlyWarningWorker: skeleton chưa implement linear regression

#### Test Coverage ⭐⭐⭐
- ✅ test-api.mjs: history query, export, correlation
- ✅ E2E: AnalyticsPage load, tab switch
- ❌ Chưa có: large dataset performance test (1M+ rows), downsample accuracy

#### Documentation ⭐⭐⭐⭐
- ✅ `docs/modules/analytics.md`: query design, health score formula
- ✅ MODULES-STRUCTURE.md: file mapping
- ⚠️ EarlyWarningWorker chưa có doc chi tiết (skeleton)

#### Performance ⭐⭐⭐
- ✅ time_bucket query: < 100ms cho 1 năm data (TimescaleDB)
- ⚠️ HealthScoreWorker hàng giờ: có thể slow nếu 100+ device
- ⚠️ PDF generation: chậm với > 1000 dòng alert

#### Issues & Debt
- [ ] EarlyWarningWorker: implement linear regression (2 ngày)
- [ ] Scheduled report email: cron job (2 ngày)
- [ ] Continuous aggregate cho fast year/month query

**Action:** Early Warning implement (P2), report scheduling (2 tuần).

---

### 4️⃣ Industrial Protocols

**Score: ⭐⭐⭐⭐ (4/5)**

#### Code Quality ⭐⭐⭐⭐
- ✅ Driver interface clean, strategy pattern
- ✅ S7/Modbus/BACnet/SNMP: error handling tốt, retry logic
- ✅ Config JSONB flexible

#### Test Coverage ⭐⭐⭐⭐
- ✅ test-protocol.mjs: **19/19 PASS**
- ✅ Simulators: mock tất cả giao thức
- ✅ .NET unit test: config parsing, type conversion

#### Documentation ⭐⭐⭐⭐
- ✅ `docs/modules/protocols.md`: tất cả protocol, config examples
- ✅ MODULES-STRUCTURE.md: file + config structure
- ✅ Device discovery modal UI documented

#### Performance ⭐⭐⭐⭐
- ✅ PlcPollingWorker: pool connection, không mở/đóng mỗi lần
- ✅ S7/Modbus: 2-5s cycle không tắc
- ✅ Simulator: mock instant response

#### Issues & Debt
- [ ] IEC-104: skeleton sẵn, cần implement (phase P2)
- [ ] PTZ ONVIF: skeleton, cần wire commands (1 tuần)
- [ ] Write support: chưa làm (backlog)

**Action:** IEC-104 implement (P2, 5 ngày), PTZ wire (1 tuần).

---

### 5️⃣ Authentication & Authorization

**Score: ⭐⭐⭐⭐ (4/5)**

#### Code Quality ⭐⭐⭐⭐
- ✅ JwtService: RS256, token generation/verify
- ✅ 3 roles: admin/operator/viewer, attribute-based
- ✅ Audit middleware: tự ghi POST/PUT/DELETE

#### Test Coverage ⭐⭐⭐⭐
- ✅ test-api.mjs: login, refresh, protected endpoint
- ✅ Role-based access test
- ✅ Audit log test

#### Documentation ⭐⭐⭐⭐
- ✅ `docs/modules/auth.md`: flow, roles, default account
- ✅ MODULES-STRUCTURE.md
- ✅ Code comment: token expiry, refresh rotation

#### Performance ⭐⭐⭐⭐
- ✅ JWT verify: < 1ms
- ✅ Middleware minimal overhead

#### Issues & Debt
- [ ] 2FA: chưa làm (backlog)
- [ ] Rate limit brute-force: chưa làm (security)
- [ ] Refresh token rotation race condition: lock per user needed

**Action:** Rate limit + lock (security, 3 ngày), 2FA (backlog).

---

### 6️⃣ Mobile App (React Native)

**Score: ⭐⭐⭐ (3/5)**

#### Code Quality ⭐⭐⭐
- ✅ Setup Expo SDK 54, navigation structure
- ⚠️ API client: HTTP working, SignalR incomplete
- ❌ Push notification: skeleton only

#### Test Coverage ⭐⭐
- ❌ Manual test only, no E2E automation
- ❌ Unit test: chưa viết

#### Documentation ⭐⭐⭐
- ✅ `docs/modules/mobile.md`: stack, build steps
- ⚠️ SignalR integration doc: missing
- ❌ Push notification flow: doc chưa chi tiết

#### Performance ⭐⭐
- ⚠️ Chưa test trên real device, unknown bottleneck
- ⚠️ Video stream: cần check latency

#### Issues & Debt
- [ ] SignalR realtime: 2 ngày implement
- [ ] Push notification FCM: 2 ngày
- [ ] Offline cache: 1 ngày
- [ ] APK production: 1 ngày

**Action:** Next sprint (tuần 2): SignalR + FCM + APK (5 ngày).

---

### 7️⃣ Jetson AI (Pending)

**Score: ⭐⭐ (2/5)**

#### Code Quality ⭐
- ⚠️ DetectionsController: skeleton only
- ❌ Python AI sidecar: chưa viết
- ❌ YOLO training: chưa bắt đầu

#### Test Coverage ⭐
- ❌ Không có test (hardware không có)

#### Documentation ⭐⭐
- ✅ `docs/modules/jetson-ai.md`: plan chi tiết
- ⚠️ gRPC contract: proto file sẵn nhưng chưa code

#### Performance N/A
- ⏳ Chợ Jetson hardware

#### Issues & Debt
- [ ] SDK relay port sang Jetson: 5 ngày (khi có hardware)
- [ ] YOLOv8 dataset + train: 10 ngày
- [ ] TensorRT deploy: 5 ngày

**Action:** Chợ Jetson Orin Nano, sau đó bắt đầu AI-1 (tuần 5+).

---

## Priority Fix List

| Priority | Module | Issue | ETA | Assigned |
|----------|--------|-------|-----|----------|
| 🔴 **Critical** | Camera | Test E2E đầy đủ | **1 day** | Now |
| 🔴 | Alerts | Email async (timeout risk) | 1 day | Week 1 |
| 🟡 **High** | Alerts | Auto-close alert | 1 day | Week 1 |
| 🟡 | Analytics | EarlyWarning linear regression | 2 days | Week 2 |
| 🟡 | Mobile | SignalR integration | 2 days | Week 2 |
| 🟡 | Mobile | Push notification FCM | 2 days | Week 2 |
| 🟢 **Medium** | Protocols | IEC-104 implement | 5 days | Phase P2 |
| 🟢 | Protocols | PTZ ONVIF wire | 5 days | Phase P2 |
| 🟢 | Auth | Rate limit + lock | 3 days | Security |

---

## Overall Project Health

```
✅ Stable (P1-11): 80% features complete
🔄 In Progress (Camera sprint): test needed
📅 Upcoming (Mobile/Deploy): 3 weeks
⏳ Blocked (Jetson AI): waiting hardware
```

**Risk factors:**
- ⚠️ Email timeout silent fail → low priority but should fix
- ⚠️ Large dataset performance unknown → benchmark needed
- ⚠️ Mobile SignalR incomplete → blocking app release

**Confidence: MEDIUM** → 16/18 required features done, design good, cần close sprint + deploy setup.
