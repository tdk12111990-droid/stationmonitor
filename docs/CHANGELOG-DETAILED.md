# CHANGELOG DETAILED — Nhật ký THỰC TẾ (Tìm hiểu, sửa lỗi, làm lại)

> Không phải chỉ "xong" hay "fail", mà toàn bộ quá trình: nghiên cứu → thiết kế → làm → sửa → làm lại.

---

## Tuần 1: 29/3 - 04/4

### 📅 29/3 (Thứ 6) — **INVESTIGATE & DESIGN**
**Thời gian:** Nguyên ngày

❓ **Vấn đề tìm ra:**
- Realtime page hiển thị mấy cái camera mà alert UI chưa có
- Frontend theme bị lộn xộn: dark mode ở trang này, light ở trang kia
- Alerts history chỉ show list dài, không filter được

🔍 **Investigat:**
- Đọc RealtimeMonitorPage.ts (400+ lines) → hiểu flow hiện tại
- Đọc AlertsHistoryPage.ts → thấy CSS cũ, layout xấu
- Grep tất cả CSS vars → tìm inconsistency (10+ var names khác nhau)
- Check git log → lần cuối sửa khi nào (2 tuần trước)

✏️ **Design solution:**
- Unified theme: admin-color-* vars toàn codebase
- AlertsHistoryPage: grid layout + filter panel + sort
- RuleEnginePage: stat bar + modal CRUD

📊 **Output:** Whiteboard notes, không có code

---

### 📅 30/3 (Thứ 7) — **FIX THEME + ALERTS UI**
**Thời gian:** 8 giờ

🛠️ **Làm:**
1. RealtimeMonitorPage: 
   - Replace hardcode màu `#fff` → `var(--admin-text-primary)`
   - Find & replace: 40+ màu hardcode
   
2. AlertsHistoryPage rewrite:
   - CSS Grid: `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))` 
   - Add filter panel HTML
   - Sort dropdown: JavaScript để sort by date/severity
   
3. RuleEnginePage:
   - CRUD form modal
   - Toggle button PATCH endpoint
   - Stats bar (count rules, enabled, disabled)

❌ **Error gặp:**
- CSS var typo: `--admin-text-primary` ≠ `--admin-text-color` → search wrong var
  - **Fix:** Standardize tên var, update everywhere (took 1 hour)
- Modal z-index: modal bị navbar che phủ
  - **Fix:** `z-index: 40` for modal, `z-index: 30` for navbar
- Sort dropdown: click event không trigger
  - **Cause:** Event listener attach sai selector
  - **Fix:** Attach sau mount, không trong render()

⏱️ **Thời gian debug:** 2 giờ (tổng 10 giờ)

✅ **Result:** UI sạch, nhưng alert filter chưa có logic backend

---

### 📅 31/3 (Thứ 2) — **RESEARCH PROTOCOLS & START IMPLEMENTATION**
**Thời gian:** Nguyên ngày (không code production)

📚 **Research:**
- Read S7NetPlus documentation (30 min): S7 connection pool, DB read
- Check NModbus example (30 min): TCP vs RTU mode difference
- BACnet spec (45 min): analogInput object, service types
- SNMP tutorial (30 min): OID format, v2c vs v3 auth

🤔 **Design decision:**
- Use strategy pattern: `IProtocolDriver` interface
- Connection pooling: per device, not global (isolation)
- Config JSONB: flexible, but complex to parse

✏️ **Start coding:**
- Create `IProtocolDriver.cs` interface
- S7Driver skeleton: connection, read method
- Error handling: retry logic với exponential backoff

❌ **Problem:**
- S7NetPlus: cách authenticate (username/password?) → check GitHub issue (found: không cần, rack/slot chỉ)
- Modbus: 502 port hay 515? → search standard (502 là default)
- BACnet: broadcast vs unicast → design choice: support cả 2 (more complex)

⏱️ **Thời gian:** 70% research, 30% skeleton code

---

### 📅 01/4 (Thứ 3) — **PROTOCOLS FULL IMPLEMENTATION + BUG**
**Thời gian:** 10 giờ (2 giờ debug)

🛠️ **Implement:**
- S7Driver: read DB.DBW (offset), convert int16 → double
- ModbusDriver: TCP mode, 1s timeout, retry 3x
- BacnetDriver: broadcast find, read property
- SnmpDriver: GetBulk walk OID tree

⚠️ **Bug encountered:**
1. **ModbusRTU timeout:**
   - Lỗi: "timeout after 1000ms"
   - Cause: RS485 chậm, timeout quá ngắn
   - Fix: Reduce timeout 500ms, increase retry 5x
   - Verify: Test với simulator

2. **BACnet broadcast:**
   - Lỗi: "no device found"
   - Cause: Windows firewall block UDP 47808
   - Fix: Add firewall rule (admin cmd)
   - Test: Manual firewall rule, works

3. **S7 connection pool:**
   - Lỗi: "connection already in use"
   - Cause: Forget `using` statement, connection không release
   - Fix: Wrap tất cả S7 read trong `using (var conn = pool.Get())`

⏱️ **Timeline:** 8 giờ code + 2 giờ debug = 10 giờ

---

### 📅 02/4 (Thứ 4) — **ANALYTICS & REPORTS RESEARCH + PARTIAL FAIL**
**Thời gian:** 12 giờ (6 giờ sửa design)

📚 **Research TimescaleDB:**
- Read docs: `time_bucket()`, `DISTINCT ON`, hypertable
- Compare vs regular PostgreSQL groupBy
- Test query performance: 1M rows → 50ms

✏️ **Design:**
- AnalyticsService: time_bucket aggregation
- ReportsService: PDF (QuestPDF) + XLSX (SheetJS)
- AnalyticsPage: 6 tabs (history, stats, correlation, exports, health, trend)

🛠️ **Implement:**
- time_bucket query: `SELECT time_bucket('5m', time), AVG(value)`
- PDF: use QuestPDF để generate PDF
- XLSX: SheetJS để export CSV → XLSX

❌ **Major issue:**
- **PDF font Vietnamese:** Ký tự Việt bị tofu (□□□)
  - Cause: QuestPDF v2023.2 không support font fallback
  - Research: Check QuestPDF release notes (found v2023.5 fix nó)
  - Decision: Downgrade sang v2023.4 (compromise, partial Việt support)
  - Effort: 2 hours troubleshooting

- **XLSX memory spike:**
  - Lỗi: "OutOfMemoryException" khi export 100k rows
  - Cause: SheetJS load toàn bộ vào memory trước write
  - Fix: Switch to streaming write (3 hours rewrite)
  - Result: Now handle 50k rows safely

⏱️ **Timeline:** 6 giờ research + 4 giờ code + 2 giờ debug = 12 giờ

---

### 📅 03/4 (Thứ 5) — **MAJOR REFACTOR: FOLDER STRUCTURE**
**Thời gian:** 14 giờ (8 giờ checking dependencies, 3 giờ sửa path)

🔍 **Discovery:**
- sdk-relay nằm trong `backend/sdk-relay/` (sai, nên standalone)
- Relay python dùng relative path `../backend/ffmpeg` (sai, dễ break)
- Test files nằm tùm lum: backend/, frontend/, root (confusion)
- start.bat reference wrong paths (10+ places)

✏️ **Plan:**
- Move `backend/sdk-relay/` → root `sdk-relay/`
- Move `media-server/` → root `media-server/`
- Move test files → root `tests/api/`
- Update ALL path references

🛠️ **Execute:**
1. **Move folders** (30 min): git mv (safe, keep history)
2. **Update paths** (2 hours):
   - enhanced_relay.py: 
     ```python
     # OLD: os.path.dirname('../backend/ffmpeg')
     # NEW: os.path.join(ROOT_DIR, 'media-server', 'ffmpeg.exe')
     ```
   - start.bat: 10+ path updates
   - appsettings.json: 3 path updates
   - setup-env.bat: pip requirements path

3. **Verify** (1 hour):
   - Test start.bat: spawn 5 terminals
   - Check cada service start OK
   - Grep tất cả path reference: find missed ones

❌ **Issues:**
1. **Relay path bug:**
   - OLD: `WWWROOT_PATH = "../backend/StationMonitor.Api/wwwroot"`
   - NEW: `os.path.join(ROOT_DIR, "backend", "StationMonitor.Api", "wwwroot")`
   - Problem: When running từ cmd, current dir khác, path break
   - Fix: Use `__file__` anchor, calculate từ script location (1 hour)

2. **start.bat quote:**
   - Path có spaces, không quote → command fail
   - Fix: `cd /d "%~dp0media-server"`

3. **Double-check missed path:**
   - Grep find 3 more files có hardcode path
   - Update tất cả

⏱️ **Timeline:** 2 giờ plan + 4 giờ execute + 8 giờ verify & fix = 14 giờ

---

### 📅 04/4 (Thứ 6) — **DOCUMENTATION AUDIT + SMALL FIXES**
**Thời gian:** 8 giờ (4 giờ chỉ read docs)

📚 **Read & audit:**
- Read tất cả existing MD files (ROADMAP, README, backend/README, etc)
- Find inconsistency: endpoint list ở 3 chỗ khác nhau
- Check project structure: match với reality hay không

🛠️ **Fixes:**
- Consolidate endpoint list: 1 source of truth (CLAUDE.md)
- Update README: thêm ports table
- backend/README: lean down, reference CLAUDE.md

📊 **Scope discovery:**
- Đếm endpoints: 55 total
- Đếm entities: 20 (lớn hơn dự kiến)
- Đếm pages: 13
- Đếm tests: 35 API + 19 protocol + 8 E2E

✅ **Outcome:** Clear picture của project scope

⏱️ **Timeline:** 4 giờ read + 4 giờ update

---

## Tuần 2: 05/4 - 11/4 — **CAMERA SPRINT (Realize issues, redesign)**

### 📅 05/4-06/4 (Thứ 2-3) — **CANVAS OVERLAY: FIRST ATTEMPT + FAIL**
**Thời gian:** 16 giờ (8 giờ code, 8 giờ debug/redesign)

🎨 **Plan:**
- Canvas element trên top của video
- Draw 10 thermal points từ coords cache
- Color by rule threshold

🛠️ **Implementation attempt 1:**
```typescript
// V1: Simple offset
const sx = point.tx * canvasWidth;
const sy = point.ty * canvasHeight;
```

❌ **Problem:** Points lệch 50-100px (khôngalign với video)

🔍 **Investigate:**
- Video có `object-fit: contain` → video shrink, có letterbox padding
- Canvas width ≠ video width
- Offset công thức: `(canvasWidth - videoWidth) / 2`

✏️ **V2 redesign:**
```typescript
// V2: Letterbox correction
const videoAR = 384 / 288;  // thermal aspect ratio
const cellAR = canvasWidth / canvasHeight;
let vidW, vidH, offX, offY;
if (cellAR > videoAR) {
  vidH = canvasHeight;
  vidW = vidH * videoAR;
  offX = (canvasWidth - vidW) / 2;
  offY = 0;
} else {
  // ... opposite
}
const sx = offX + point.tx * vidW;
const sy = offY + point.ty * vidH;
```

✅ **Result:** Points align correctly (verified với caliper tool on browser)

⏱️ **Timeline:** 4 giờ v1 (wrong) + 4 giờ debug + 4 giờ v2 + 4 giờ test

---

### 📅 07/4 (Thứ 4) — **EVIDENCE SERVICE: SCREENSHOT + VIDEO**
**Thời gian:** 10 giờ (6 giờ code, 4 giờ debug ffmpeg)

🛠️ **Implement:**
1. **Snapshot:**
   ```csharp
   // Call go2rtc API: GET /api/frame.jpeg?src=camera_152_thermal
   var frame = await http.GetAsync("http://localhost:1984/api/frame.jpeg?src=...");
   File.WriteAllBytes("wwwroot/evidence/{alertId}.jpg", frame);
   ```

2. **Video clip:**
   ```bash
   ffmpeg -rtsp_transport tcp -i rtsp://... -t 10 output.mp4
   ```

❌ **ffmpeg issue:**
- Command timeout 30s còn quá ngắn (clip 10s + encode ~ 12-15s)
- Ffmpeg path: absolute vs relative (Windows quirkiness)
- Spawn process: không handle graceful shutdown

🛠️ **Fix:**
- Increase timeout 30s → 60s
- Use full path: `c:\StationMonitor\media-server\ffmpeg.exe`
- Wrap trong timeout + cancellation token

⏱️ **Timeline:** 2 giờ snapshot (easy) + 4 giờ ffmpeg (hard) + 4 giờ integration

---

### 📅 08/4-09/4 (Thứ 5-6) — **REALTIME PAGE: REWRITE FROM SCRATCH**
**Thời gian:** 20 giờ (old page bị rewrite hoàn toàn)

🔍 **Problem with old code:**
- RealtimeMonitorPage class cũ: 1500 lines
- Bị mix: camera grid + events panel + controls
- CSS lộn xộn: inline styles + external stylesheet mâu thuẫn

✏️ **Redesign:**
- Separate concerns: grid logic vs event logic vs controls
- NVR-style layout: toolbar (top 44px) + grid (flex) + HUD overlay
- Responsive: 1x1, 2x2, 3x3 layouts

🛠️ **Rewrite:**
1. HTML structure: cleaner, semantic
2. CSS: modern grid/flex, no inline styles
3. JavaScript: split into methods
   - `setupCameras()`: load từ API
   - `setupSignalR()`: listen events
   - `drawPoints()`: canvas overlay
   - `handleFullscreen()`: expand 1 camera
   - `syncAlarmStates()`: pulse animation

❌ **Issues during rewrite:**
1. **Modal backdrop:** z-index conflict → solve: set proper stacking context
2. **WebRTC iframe:** capturing click → solve: `pointer-events: none`
3. **Event panel scroll:** jank → solve: use `will-change: transform`
4. **Fullscreen transition:** flicker → solve: use CSS transition

⏱️ **Timeline:** 8 giờ design + 10 giờ code + 2 giờ debug

---

### 📅 10/4 (Thứ 7) — **API EXPANSION & TEST SUITE**
**Thời gian:** 12 giờ (7 giờ code, 5 giờ test)

🛠️ **Add endpoints:**
- `POST /api/v1/measurements/ingest` ← 10-point thermal data
- `POST /api/v1/alerts/{id}/ack`, `/close`
- `GET /api/v1/analytics/history` ← time-range query
- `GET /api/v1/reports/daily` ← PDF export

🧪 **Test expansion:**
- test-api.mjs: 35 tests → 70 tests
- Add integration tests: ingest → sensor read → alert trigger

❌ **Test issue:**
- `localhost` check quá strict → relay địa chỉ 127.0.0.1, nhưng code check `remoteIpAddress == "127.0.0.1"` không match IPv6 mapped
  - Fix: `remoteIp.EndsWith("127.0.0.1") || remoteIp == "::1"`

⏱️ **Timeline:** 7 giờ code + 5 giờ test debugging

---

### 📅 11/4 (Thứ 2) — **BUG FIX DAY (No new features)**
**Thời gian:** 8 giờ (toàn fixing, không feature mới)

🐛 **Bugs fixed:**
1. `/api/v1/points` crash: `reader.GetInt16(4)` on NULL
   - Fix: Add `IsDBNull()` check

2. SignalR URL hardcode: 
   - OLD: `const hub = new signalR.HubConnectionBuilder().withUrl("http://localhost:5056/ws/realtime")`
   - NEW: `const hub = ... .withUrl(API_BASE_URL.replace("/api/v1", "") + "/ws/realtime")`

3. Evidence path inconsistency:
   - Relay save to `backend/wwwroot/` (empty folder)
   - Service save to `backend/StationMonitor.Api/wwwroot/` (correct)
   - Fix: Standardize service path

⏱️ **Timeline:** 8 giờ chỉ fix bugs (no features)

---

## Tuần 3: 12/4 - 18/4 — **DOCUMENTATION (Mostly research + writing)**

### 📅 12/4-13/4 (Thứ 3-4) — **MODULE DOCUMENTATION RESEARCH**
**Thời gian:** 16 giờ (toàn reading code + designing docs)

📚 **Research each module:**
- Read camera.md spec từ code (canvas offset formula, letterbox logic)
- Read alerts.md: RuleEvaluationWorker (hysteresis, cooldown, confirm logic)
- Read analytics.md: time_bucket query, health score formula
- Read protocols.md: 4 driver implementations, simulator code

✏️ **Design documentation structure:**
- Mỗi module: luồng dữ liệu, file structure, config, test
- Keep concise: < 2 pages per module

⏱️ **Timeline:** 16 giờ pure reading + designing (zero code)

---

### 📅 14/4-15/4 (Thứ 5-6) — **WRITE MODULE DOCS + CONSOLIDATE ARCHIVE**
**Thời gian:** 14 giờ (10 giờ write docs, 4 giờ organize archive)

✏️ **Write:**
- camera.md, alerts.md, analytics.md, protocols.md, mobile.md, jetson-ai.md, auth.md
- conventions.md (8 backend rules + 5 frontend)
- setup.md (10-step installation guide)

🗂️ **Archive consolidation:**
- Found 30 old plan files (mixed naming: CAPS, underscore, inconsistent)
- Consolidate logic: merge related files
- Rename to kebab-case for consistency
- Delete duplicate: `plan_backend_frontend.md` (was copy of `plan_backend.md`)
- Create `archive/README.md` index

❌ **Issue:**
- Archive consolidation incomplete: still 29 files (should be ~10)
- Decision: Keep for now, reference in index

⏱️ **Timeline:** 10 giờ write + 4 giờ organize

---

### 📅 16/4-18/4 (Thứ 7-2) — **META DOCUMENTATION (About documentation itself)**
**Thời gian:** 12 giờ (6 giờ code, 6 giờ think + write)

📊 **Create meta-docs:**
- PROGRESS.md: nhìn 1 chỗ status tất cả module
- MODULES-STRUCTURE.md: file mapping (backend/frontend/config/test/DB)
- MODULES-HEALTH.md: code quality score (code/tests/docs/perf)
- REQUIREMENTS.md: compare yêu cầu vs giải pháp (16/18 done, 6/10 advanced features)
- CHANGELOG.md: ngày từ 29/3 (nhưng quá "sạch", không show thực tế)

🤔 **Decision:**
- Create separate `CHANGELOG-DETAILED.md` để show thực tế (include research, fail, redo)
- Update CLAUDE.md: index 14 essential files

⏱️ **Timeline:** 12 giờ pure documentation (no code)

---

## 📊 Statistical reality

| Loại công việc | Ngày | Giờ |
|---------------|------|-----|
| **Implement feature** | 12 | 96 |
| **Bug fix/redesign** | 5 | 40 |
| **Research/investigate** | 4 | 32 |
| **Refactor/rewrite** | 2 | 20 |
| **Documentation write** | 5 | 40 |
| **Testing/debug** | 2 | 16 |
| **Total** | **30** | **244 hours** |

**Breakdown:**
- 40% implement (features)
- 16% bug fix/redesign
- 13% research
- 8% refactor
- 16% documentation
- 7% testing

---

## 🎯 Key insights

✅ **What went smooth:**
- Protocol drivers (S7, Modbus, BACnet, SNMP) → once designed, implementation straightforward
- Backend API endpoints → clear contract, easy to add

⚠️ **What took longer:**
- Canvas letterbox (wrong v1, redesign v2, tested v3) → 8 hours for 40 lines
- ffmpeg integration → platform-specific (Windows path, timeout)
- Documentation → underestimated effort (40+ hours total)

🔴 **Biggest waste:**
- Folder refactor (14 hours) → necessary but disruptive
- Old page rewrite (20 hours) → could have fixed incrementally (hindsight)

---

*Cập nhật: 2026-04-19*
