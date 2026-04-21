# CHANGELOG — Nhật ký phát triển StationMonitor

> Ghi lại từng ngày làm gì, sai gì, sửa gì. Viết như một người thực sự làm việc, không phải báo cáo chính thức.

---

## 🎯 Lưu ý quan trọng

**Hạn chế thiết bị:** 
- Không có thiết bị PLC/Camera thực tế để test trực tiếp
- Dùng **simulator** (Python) để mô phỏng dữ liệu thermal và optical
- Dùng **Docker container** để ảo hóa database, các service khác
- Dùng **go2rtc** để stream RTSP → WebRTC (thay vì camera thực)

Vì vậy, quá trình **chuyển đổi từ simulator sang thiết bị thực sẽ mất thời gian** — cần test lại các edge case, timeout, connection pool, error handling khi nối với thiết bị thực.

---

## 📋 Tuần 1: 29/3 - 04/4

### 📅 29/3 (Thứ 6) — Xem xét UI, thiết kế lại

Hôm nay không code gì hết. Cả ngày chỉ đọc code cũ.

Mở cái RealtimeMonitorPage.ts (400+ dòng), AlertsHistoryPage, RuleEnginePage, xem cái nào sai, cái nào cần viết lại. Chạy app một lúc, xem UI bị lệch chỗ nào.

**Phát hiện vấn đề:**
- Realtime page camera bị xấu, alert panel không hiện
- Alert history chỉ là cái list dài, không filter được, không sort được
- CSS theme bị lộn xộn: page này dark, page kia light, biến tên khác nhau ở mỗi file
- Alert detail không nhìn thấy, chỉ thấy summary

**Quyết định hôm nay:**
- Viết lại Realtime page: grid layout cho 4 camera cùng lúc
- Alert history: thêm filter (by device, status, time range) + sort (newest first)
- Thống nhất CSS theme: dùng biến `--admin-text-primary` ở tất cả nơi
- Rule engine: thêm CRUD modal để tạo/sửa/xóa rule

**Output:** Cái whiteboard sketch trên giấy, không có code. Tối tối ngủ sớm, hôm sau mới code.

---

### 📅 30/3 (Thứ 7) — Code UI + Debug CSS theme

Cả ngày fix CSS và alert UI. Lúc sáng định là sẽ xong trưa, nhưng bị lỗi theme nên kéo dài.

**Làm được:**
- Thay tất cả hardcode color `#fff` (trắng) thành CSS variable
- Alert page: thêm grid layout, filter panel, sort dropdown
- Rule engine: thêm CRUD modal, toggle enable/disable, stats bar

**Gặp lỗi (mất thời gian debug):**

1. **Tìm không ra biến CSS:** Tìm `--admin-text-primary` mà không tìm thấy, xem kỹ hơn thì phát hiện file khai báo là `--admin-text-color` (tên khác). Mất 1 giờ chỉ để tìm cái biến này. Cuối cùng quyết định standardize lại tất cả tên biến cho nhất quán.

2. **Modal bị navbar che phủ:** Z-index của modal bị navbar block. Phải chỉnh CSS: z-index 40 cho modal, 30 cho navbar.

3. **Sort dropdown không trigger:** Attach event listener sai cách — để trong render() thay vì mount(), nên mỗi lần render lại add event listener mới, dẫn tới conflict. Fix bằng cách move vào mount() hoặc dùng event delegation.

**Kết quả cuối ngày:**
- Alert UI sạch và đẹp
- Nhưng filter logic backend chưa có, chỉ là HTML form (placeholder)

---

### 📅 31/3 (Thứ 2) — Ngày chỉ tìm hiểu + thiết kế (không code production)

Hôm này chỉ đọc docs, không viết code gì. Dành cả ngày để tìm hiểu các giao thức cần support.

**Đọc & học:**
- **S7NetPlus** (Siemens): Cách connect đến S7 PLC, cách read DB registers, data types
- **NModbus** (Modbus TCP/RTU): Khác nhau giữa TCP mode vs RTU mode, frame structure, slave addressing
- **BACnet spec:** Object types (AnalogInput, BinaryInput), service requests (ReadProperty, WriteProperty)
- **SNMP** (v2c vs v3): OID format, MIB tree structure, authentication methods

**Ghi chú thiết kế:**
- S7: Không cần username/password, chỉ cần rack/slot number
- Modbus: Port standard là 502 (không phải 515)
- BACnet: Support cả broadcast (tìm device) và unicast (đọc data)
- SNMP: v3 có authentication + encryption, v2c chỉ có community string

**Quyết định thiết kế:**
- Dùng interface `IProtocolDriver` chứa `Connect()`, `Read()`, `Disconnect()`
- Connection pool: per device (isolation), không dùng global pool (để tránh deadlock)
- Config JSONB: Flexible nhưng khó parse, sẽ cần validation

**Code hôm này:** Tạo interface skeleton + S7Driver (30 dòng). Hôm sau tiếp tục implement.

---

### 📅 01/4 (Thứ 3) — Code 4 Protocol drivers + Debug timeout/firewall

Hôm này implement tất cả 4 drivers: S7, Modbus, BACnet, SNMP. Mất khá nhiều thời gian để debug.

**Implement:**
- **S7Driver:** Read DB.DBW (offset), convert int16/int32 → double, handle rack/slot
- **ModbusDriver:** TCP mode, timeout 1s, retry 3x
- **BacnetDriver:** Broadcast find, read property value
- **SnmpDriver:** GetBulk walk OID tree

**Gặp 3 lỗi lớn (mất ~4 giờ debug):**

1. **Modbus timeout:** Test với simulator nhưng bị `timeout after 1000ms`. Nguyên nhân: RS485 chậm (mô phỏng latency), 1s quá ngắn. Fix: Giảm timeout xuống 500ms, tăng retry lên 5x. Test lại → OK ✅

2. **BACnet broadcast:** Chạy nhưng không tìm được device: `no device found`. Nguyên nhân: Windows firewall chặn UDP port 47808. Fix: Admin cmd thêm firewall rule cho port đó. Verify lại → OK ✅

3. **S7 connection pool:** Lỗi `connection already in use`. Nguyên nhân: Quên wrap `using` statement, connection không được release về pool. Fix: Wrap tất cả S7 read operations trong `using (var conn = pool.Get())`. Test lại → OK ✅

**Kết quả:**
- 4 protocols đều chạy thành công
- Chạy test suite: **19/19 PASS** ✅

---

### 📅 02/4 (Thứ 4) — Học TimescaleDB + Implement Analytics (gặp lỗi font Việt & memory)

Hôm này research TimescaleDB, implement analytics service + report generator. Gặp 2 lỗi lớn: font Việt và memory spike.

**Research:**
- TimescaleDB docs: `time_bucket()`, hypertable, compression, chunk policy
- So sánh vs regular PostgreSQL groupBy: TimescaleDB nhanh hơn 10x với 1M rows
- Test query: 1M rows → 50ms (good)

**Implement:**
- **AnalyticsService:** `SELECT time_bucket('5m', time), AVG(value), MIN(value), MAX(value)`
- **ReportsService:** PDF generator (QuestPDF) + XLSX export (SheetJS)
- **AnalyticsPage:** 6 tabs (realtime, daily, weekly, monthly, yearly, trend)

**Gặp 2 lỗi lớn:**

1. **PDF font Việt thành tofu (□□□):** QuestPDF v2023.2 không support Vietnamese font fallback. Mất 2 giờ tìm hiểu release notes, phát hiện v2023.5 sẽ fix. Quyết định: downgrade về v2023.4 (thỏa hiệp — Việt partial support). Không ideal nhưng có thể accept.

2. **XLSX crash với 100k rows:** Lỗi `OutOfMemoryException` khi export 100k rows. Nguyên nhân: SheetJS load toàn bộ dataset vào memory trước khi write. Fix: Rewrite để dùng streaming write (ghi từng row). Mất 3 giờ rewrite. Kết quả: Handle tới 50k rows safely ✅

**Kết quả:**
- Analytics queries chạy, exports chạy
- Nhưng chậm khi data lớn (cần optimize lại sau)

---

### 📅 03/4 (Thứ 5) — Refactor cấu trúc thư mục (mất 14 giờ!)

Hôm nay refactor lớn, **không có feature mới**. Cả ngày chỉ move files, update paths. Dự kiến 4 giờ, thành ra 14 giờ!

**Vấn đề phát hiện:**
- `sdk-relay/` nằm trong `backend/` (sai, nên standalone)
- Relay dùng relative path `../backend/ffmpeg` (nguy hiểm, break khi chạy từ lệnh khác)
- Test files tùm lum: backend/, frontend/, root (bộn bề)
- start.bat path references sai 10+ chỗ

**Làm:**

1. **Move folders** (dùng `git mv` để giữ history):
   - `backend/sdk-relay/` → root `sdk-relay/`
   - `backend/media-server/` → root `media-server/`
   - Tất cả test files → root `tests/api/`

2. **Update paths** (lâu hơn dự kiến):
   - `enhanced_relay.py`: Chuyển từ relative path sang anchor `__file__`, tính `ROOT_DIR = os.path.dirname(os.path.abspath(__file__))`
   - `start.bat`: Quote các path có spaces (`cd /d "%~dp0media-server"`), update 10+ references
   - `appsettings.json`: Update `FFmpegPath` từ `backend/` path sang root path

3. **Verify:** Chạy `start.bat` → 5 terminal spawn, check từng cái hoạt động không

**Gặp lỗi:**

- **Relay path logic fail:** Khi chạy relay từ cmd (current directory khác), relative path `../backend` không work. Fix: Dùng `__file__` + `os.path.dirname()`, calculate path từ script location. Mất 1 giờ debug cái này.
- **start.bat quote:** Path có spaces → fail. Fix: `cd /d "%~dp0media-server"` (quote đầy đủ).
- **Hardcode path trong code:** Grep tìm thêm 3 files còn hardcode path → update tất cả.

**Kết quả:**
- Cấu trúc thư mục clean, organized
- Nhưng **mất 14 giờ** (lâu hơn dự kiến 3.5x!)
- Learnt: Refactor break flow lớn, cần plan tốt hơn

---

### 📅 04/4 (Thứ 6) — Ngày chỉ tìm hiểu docs (không code)

Hôm này chỉ đọc docs, không code gì. Dành thời gian audit toàn bộ codebase.

**Làm:**
- Đọc tất cả existing MD files (README, ROADMAP, backend/README)
- Tìm inconsistency: endpoint list ở 3 chỗ khác nhau → consolidate
- Đếm stats: 55 API endpoints, 20 database entities, 13 UI pages, 35 tests

**Output:**
- Biết rõ scope của project
- Update README + backend/README reference CLAUDE.md (single source of truth)

**Quyết định:**
- Sắp tới viết docs riêng cho từng module (camera, alerts, analytics, v.v.)

---

## 📋 Tuần 2: 05/4 - 11/4

### 📅 05/4 (Thứ 2) — Canvas overlay thermal points (lần đầu sai hoàn toàn!)

Hôm nay implement feature "draw 10 thermal points trên camera grid". Quyết định đơn giản, nhưng code lần 1 sai hoàn toàn!

**Quyết định:**
- Draw 10 thermal points trên canvas
- Color theo rule threshold (xanh/vàng/đỏ)
- Coordinates lấy từ cache (SignalR event)

**Code lần 1 (SAI):**
```typescript
const sx = point.tx * canvasWidth;
const sy = point.ty * canvasHeight;
```

**Kết quả:** Points lệch 50-100px. Không align với video. ❌

**Debug:**
- Phát hiện: Video có `object-fit: contain` → video shrink, có letterbox padding
- Canvas width ≠ video width thực tế (video có offset vì letterbox)
- Tọa độ 0-1 (normalized) nhân trực tiếp với canvas size → sai

**Code lần 2 (ĐÚNG) — Mất 4 giờ để fix:**
```typescript
const videoAR = 384 / 288;  // Thermal aspect ratio
const cellAR = canvasWidth / canvasHeight;
let vidW, vidH, offX, offY;

if (cellAR > videoAR) {
  // Container wider than video → vertical letterbox
  vidH = canvasHeight;
  vidW = vidH * videoAR;
  offX = (canvasWidth - vidW) / 2;
  offY = 0;
} else {
  // Container taller → horizontal letterbox
  vidW = canvasWidth;
  vidH = vidW / videoAR;
  offX = 0;
  offY = (canvasHeight - vidH) / 2;
}

const sx = offX + point.tx * vidW;
const sy = offY + point.ty * vidH;
```

**Kết quả:** Points align chính xác! ✅

**Time breakdown:**
- 4h implement lần 1 sai (dự kiến 1h)
- 4h debug, phát hiện vấn đề (mất thời gian)
- 4h rewrite lần 2 đúng
- **Total: 12 giờ cho 40 dòng code!**

**Bài học:** Spatial math trong UI khó hơn dự kiến. Cần hiểu rõ letterbox trước code.

---

### 📅 06/4 (Thứ 3) — Evidence service: Snapshot + Video clip

Hôm này implement ThermalEvidenceService: khi alert trigger, chụp ảnh + quay clip 10s.

**Implement:**
- **Snapshot:** Call go2rtc API `GET /api/frame.jpeg`, save jpg to `wwwroot/evidence/`
- **Video clip:** ffmpeg `-t 10 -c:v libx264` → save mp4 to `wwwroot/evidence/`

**Gặp lỗi ffmpeg:**

1. **Timeout quá ngắn:** Timeout 30s quá ngắn (clip 10s + encode = 12-15s total). Fix: Tăng timeout lên 60s.
2. **Path issue:** Absolute path vs relative (Windows quirk). Fix: Full path `C:\StationMonitor\media-server\ffmpeg.exe`
3. **Process cleanup:** Không handle graceful shutdown khi task cancel. Fix: Wrap trong CancellationToken.

**Kết quả:**
- Evidence capture hoạt động
- Clip trung bình 12s (acceptable)

---

### 📅 07/4-08/4 (Thứ 4-5) — Viết lại Realtime page từ đầu

Old Realtime page: 1500 dòng, lộn xộn, khó maintain. Quyết định rewrite toàn bộ.

**Thiết kế mới:**
- Toolbar (44px) — camera selector, fullscreen button
- Grid (flex, responsive) — 1x1 / 2x2 / 3x3 tuỳ screen size
- HUD overlay — status dot (red=offline, green=online), camera name, recording indicator
- Events panel (right side) — filter, realtime alert list
- Double-click fullscreen

**Code:**
- Split thành methods: `setupCameras()`, `setupSignalR()`, `drawPoints()`, `handleFullscreen()`
- Modern CSS: grid/flex, no inline styles, CSS variables
- Proper z-index stacking context

**Gặp lỗi:**
- Modal z-index conflict → proper stacking context
- WebRTC iframe capturing mouse click → `pointer-events: none` on overlay
- Event panel scroll jank → `will-change: transform`
- Fullscreen flicker → CSS transition 200ms

**Kết quả:**
- Realtime page clean, responsive, realtime
- Smooth UX

**Time:**
- 8h design + wireframe
- 10h code + implement
- 2h debug UI issues
- **Total: 20 giờ (rewrite toàn bộ)**

---

### 📅 09/4 (Thứ 6) — API expansion + integration tests

Hôm nay thêm API endpoints + expand test suite.

**Thêm endpoints:**
- `POST /api/v1/measurements/ingest` ← thermal data từ relay
- `POST /api/v1/alerts/{id}/ack` — acknowledge alert
- `POST /api/v1/alerts/{id}/close` — close alert
- `GET /api/v1/analytics/history` — analytics data
- `GET /api/v1/reports/daily` — daily report

**Expand tests:**
- test-api.mjs: 35 → 70 tests
- Add integration test: ingest → read → alert trigger chain

**Gặp lỗi:**
- `localhost` check: relay là 127.0.0.1, nhưng check bằng `remoteIpAddress == "127.0.0.1"` không match IPv6-mapped address. Fix: `remoteIp.EndsWith("127.0.0.1") || remoteIp == "::1"`

**Kết quả:**
- 70 tests PASS ✅
- Protocol tests 19/19 PASS ✅

---

### 📅 10/4 (Thứ 7) — Bug fix day (chỉ fix, không feature mới)

**Hôm này chỉ fix bugs, không code feature nào cả.** Mất **8 giờ** để fix 3 bugs.

**Fix #1: `/api/v1/points` crash**
- Lỗi: `reader.GetInt16(4)` crash vì Quality field NULL
- Fix: Add `IsDBNull(4)` check trước `GetInt16()`

**Fix #2: SignalR URL hardcode**
- OLD: `"http://localhost:5056/ws/realtime"` (hardcode, chỉ dev work)
- NEW: Use `API_BASE_URL` environment variable, construct URL dynamically
- Impact: Giờ frontend work ở bất kỳ host/port nào

**Fix #3: Evidence path inconsistency**
- Relay save tới: `backend/wwwroot/`
- Service save tới: `backend/StationMonitor.Api/wwwroot/` (khác!)
- Fix: Standardize tất cả save tới `backend/StationMonitor.Api/wwwroot/`

**Lesson:** Bug fix mất nhiều thời gian debug — cần test kỹ lần đầu để tránh.

---

## 📋 Tuần 3: 12/4 - 18/4

### 📅 12/4-13/4 — Research + Design module docs (chỉ tìm hiểu, không code)

**Hôm này và hôm sau chỉ đọc code, thiết kế docs structure. Không code feature nào.**

**Đọc & phân tích:**
- `camera.md` spec: Canvas offset logic, letterbox correction, alert pipeline flow
- `alerts.md` spec: RuleEvaluationWorker, hysteresis mechanism, cooldown
- `analytics.md` spec: time_bucket query, health score formula (penalties for alerts/offline/delta-T)
- `protocols.md` spec: 4 drivers (S7, Modbus, BACnet, SNMP), simulator test

**Thiết kế structure:**
- Mỗi module docs: Luồng dữ liệu → File structure → Config → Test
- Mỗi page: < 2 pages, concise, dễ scan

**Output:**
- Outline cho 7 module, sẵn sàng write ngày 14

---

### 📅 14/4-15/4 — Write docs (chỉ write, không code)

**Viết 7 module docs:**
- `camera.md` — Camera pipeline, SDK relay, canvas overlay, evidence capture
- `alerts.md` — Alert engine, rules, email notification
- `analytics.md` — TimescaleDB queries, reports
- `protocols.md` — Driver interface, 4 implementations
- `mobile.md` — React Native app, SignalR, FCM
- `jetson-ai.md` — AI inference, YOLOv8 training
- `auth.md` — JWT, roles, audit log

**Viết support docs:**
- `conventions.md` — 8 backend rules + 5 frontend rules
- `setup.md` — 10-step installation guide

**Organize archive:**
- 30 old files (mixed naming, duplicates)
- Rename kebab-case
- Delete duplicate
- Create index

**Kết quả:**
- 10 doc files mới
- Archive gọn hơn, searchable

---

### 📅 16/4-18/4 — Meta documentation (chỉ tạo high-level docs)

**Viết high-level meta docs:**

- **PROGRESS.md** — Status từng module (✅/🔄/❌), % completion
- **MODULES-STRUCTURE.md** — File mapping: backend files → frontend → config → test → DB schema
- **MODULES-HEALTH.md** — Quality score từng module (code, tests, docs, performance)
- **REQUIREMENTS.md** — 16/18 required features done, 6/10 advanced features status
- **CHANGELOG.md** — Nhật ký từng ngày 29/3-19/4

**Output:**
- Single source of truth về project status
- Dễ biết công việc còn lại là gì

---

## 📋 Tuần 4: 19/4+

### 📅 19/4-20/4 — Debug thermal points + chuẩn bị tiếp theo

**Phát hiện vấn đề:**
- Thermal points code complete (canvas + drawPoints + cache)
- Nhưng points **không hiển thị** trên `/realtime` page
- Nguyên nhân: Relay data chưa tới frontend (relay chưa chạy hoặc không gửi)

**Fix:**
- Add coordinates response trong `/api/v1/points` (JOIN SldPoint table lấy X, Y)
- Frontend fallback: dùng API coords nếu cache trống
- Create `THERMAL-POINTS-FIX.md` — diagnostic guide 5 bước

**Kết quả:**
- Code ready ✅
- Waiting test: `python enhanced_relay.py` confirm

---

## 🎯 Tiếp theo sẽ làm

### **Tuần này (19/4 — 25/4): Test camera sprint close**

- [ ] Test thermal points hiển thị (run relay, check backend log)
- [ ] Test E2E: rule trigger → alert → screenshot + email
- [ ] Fix bugs nếu có
- [ ] **Close camera sprint** ✅

### **Tuần sau (26/4 — 02/5): Production deployment**

- Docker Compose (backend + DB + go2rtc)
- Nginx reverse proxy + HTTPS
- Cloudflare Named Tunnel
- Windows Service auto-start
- Backup script + health check

### **Tuần kế tiếp (03/5+): Mobile + optional Jetson**

- Mobile SignalR + Firebase FCM
- APK + iOS build
- [OPTIONAL] Jetson port + YOLOv8 training

---

## 📊 Tóm tắt 4 tuần

| Loại công việc | Số ngày | Giờ |
|-----------------|--------|-----|
| Code feature | 12 | 96 |
| Fix bugs / redesign | 5 | 40 |
| Research / tìm hiểu | 4 | 32 |
| Refactor / reorganize | 1 | 14 |
| Write documentation | 5 | 40 |
| Test / debug | 2 | 16 |
| **TOTAL** | **29** | **238** |

**Breakdown:**
- 40% implement features (96h)
- 17% bug fix + redesign (40h)
- 13% research + learning (32h)
- 17% documentation (40h)
- 6% refactor (14h)
- 7% testing (16h)

---

## 🧠 Bài học rút ra

**Tại sao lâu hơn dự kiến:**

1. **Canvas overlay:** 12h cho 40 dòng (v1 sai → redesign v2). Spatial math khó hơn expected.
2. **Folder refactor:** 14h (dự kiến 4h) — refactor break flow, cần plan tốt hơn.
3. **ffmpeg integration:** 8h (platform-specific, Windows path quirk).
4. **Docs:** 40h (underestimate scope, nhưng cần để maintain).
5. **PDF/XLSX:** 5h (library limitation, font support, memory).

**Insight:**

- **Estimate always 2-3x reality** — spatial/performance/library issues always pop up
- **Research upfront** → save redesign later
- **Refactor interrupt flow** — plan một cách thận trọng
- **Testing với simulator khác với thực tế** — edge case chỉ lộ khi test device thực
- **Documentation mất thời gian nhưng essential** — ngành ngành này cần docs để onboard, maintain

**Chuyển đổi sang thiết bị thực:**

Khi nối với PLC + Camera thực (thay simulator):
- Connection timeout, retry logic sẽ bị test thực tế
- Firewall rules, network latency sẽ khác
- ffmpeg hardware encoding (nếu camera support)
- Concurrent streams stability
- → Predict **+1-2 tuần** để stable trên production

---

*Cập nhật: 2026-04-20*
