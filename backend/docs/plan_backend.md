# Kế Hoạch Backend — Hệ Thống Giám Sát Trạm Biến Áp

---

## 0. Backend Làm Gì — Giải Quyết Vấn Đề Gì

### Bức tranh tổng thể

Hệ thống điện lực (EVN) vận hành hàng chục trạm biến áp 110kV không người trực. Mỗi trạm có:
- PLC/RTU đọc hàng chục điểm đo điện áp, dòng điện, nhiệt độ liên tục
- 3-10 camera (nhiệt, phóng điện, quan sát) ghi hình 24/7
- Sự cố xảy ra bất kỳ lúc nào, cần phát hiện và phản ứng trong vài phút

**Vấn đề không có phần mềm này:**
```
Người trực ban phải đọc số liệu thủ công → chậm, dễ bỏ sót
Sự cố nhiệt xảy ra từ từ → không ai biết cho đến khi cháy nổ
Camera nhiều nhưng không ai xem liên tục → an ninh hổng
Dữ liệu lưu rải rác, không có lịch sử → không lập kế hoạch bảo trì được
Nhiều trạm → không có cái nhìn tổng thể
```

**Backend giải quyết:**
```
Tự động thu thập → Tự động phân tích → Tự động cảnh báo → Lưu trữ dài hạn
```

---

### Backend làm những gì cụ thể

#### A. Thu thập dữ liệu liên tục (Data Acquisition)
```
PlcPollingWorker    → Đọc PLC S7 mỗi 3-5s → lưu sensor_readings
ModbusPollingWorker → Đọc cảm biến mỗi 5-10s → lưu sensor_readings
AiDetectionService  → Nhận kết quả YOLO từ Python → lưu detection_events
                      + thermal_frames (ma trận nhiệt RAW)
                      + media_files (ảnh/clip tự động)
```
> Không cần người thao tác. Máy tự làm 24/7.

#### B. Xử lý & ra quyết định (Processing)
```
RuleEvaluationWorker → So sánh giá trị với rule đã cấu hình
                       Nhiệt độ MBA > 80°C kéo dài 10 phút → tạo Alert
EarlyWarningWorker   → Phân tích xu hướng 30 ngày
                       Nhiệt tăng đều 0.5°C/ngày → cảnh báo sớm trước khi vượt ngưỡng
HealthScoreCalculator→ Tính điểm sức khỏe thiết bị 0-100
                       Score < 60 → đề xuất bảo trì
```
> Hệ thống tự suy luận, không chờ người phát hiện.

#### C. Thông báo đúng người đúng lúc (Notification)
```
AlertNotifyWorker → Alert mới → SignalR (màn hình trực ban sáng đỏ ngay)
                             → Firebase FCM (điện thoại rung ngay dù app đóng)
                             → Email kèm ảnh nhiệt
                             → IEC-104 → Trung tâm điều độ EVN
NotifyLog         → Ghi lại từng kênh đã gửi thành công chưa
```
> Đúng người, đúng kênh, có bằng chứng đã gửi.

#### D. Lưu trữ & truy xuất (Storage)
```
TimescaleDB local  → Full resolution 90 ngày (compress sau 7 ngày)
Supabase Cloud     → Raw 30 ngày + Hourly 1 năm + Daily 10 năm
StorageMonitorWorker → Disk đầy → tự sync + giải phóng, luôn giữ ≥30 ngày
Federated Query    → Hỏi data 3 năm trước → backend tự lấy từ cloud
```
> Không bao giờ mất dữ liệu. Truy xuất bất kỳ thời điểm nào.

#### E. Giao diện & API (Interface)
```
REST API 48+ endpoints → Desktop App (LAN) + Mobile (Cloud) + Bên thứ 3 (API Key)
SignalR WebSocket      → Real-time không cần refresh
Báo cáo PDF            → Tự động gửi email hàng ngày/tháng
```
> Mọi client, mọi nền tảng đều dùng chung 1 backend.

#### F. Quản trị & kiểm soát (Governance)
```
AuditMiddleware → Tự động ghi mọi thao tác: ai làm gì lúc nào
LoginLog        → Theo dõi đăng nhập bất thường
PermissionService → Phân quyền theo trạm: Operator chỉ xem trạm được phân
RuleTriggerLog  → Rule nào kích hoạt bao nhiêu lần → biết rule nào hiệu quả
```
> Hệ thống lớn cần traceability — biết mọi thứ đã xảy ra.

---

### Tại sao cần thiết kế như hệ thống lớn

| Vấn đề thực tế | Giải pháp trong thiết kế |
|---|---|
| 10 trạm × 100 sensor × 1 đọc/5s = 120 triệu rows/tháng | TimescaleDB hypertable + compression |
| Mất mạng tại trạm thường xuyên | Offline-first, SyncQueue, không mất data |
| Sự cố lúc 3 giờ sáng, không ai trực | Workers chạy nền 24/7, tự cảnh báo |
| Cần tra cứu sự cố 2 năm trước | Federated Query lấy từ cloud |
| Deploy lên Jetson ARM64 | Docker cross-platform |
| Thêm trạm mới | docker compose up, không sửa code |
| PLC đổi sang OPC-UA | Chỉ thay IPlcDataReader impl |
| Worker crash giữa chừng | restart=always + HealthCheck |

---

## 1. Quyết Định Database: PostgreSQL + TimescaleDB

### Lý do chọn PostgreSQL (không dùng SQLite)

| Tiêu chí | SQLite | PostgreSQL |
|---|---|---|
| Đa người dùng đồng thời | Kém (file lock) | Tốt (MVCC) |
| Đa trạm từ cloud | Không phù hợp | Native |
| Time-series (10 năm+) | Chậm khi scale | Dùng TimescaleDB extension |
| Đồng bộ cloud ↔ trạm | Phức tạp | Cùng stack với Supabase |
| EVN production deployment | Không đủ | Đạt tiêu chuẩn |

### Stack database thống nhất

- **Trạm (Jetson/Server)**: TimescaleDB local (PostgreSQL + extension time-series)
- **Cloud**: Supabase PostgreSQL
- Một stack duy nhất → đồng bộ dễ dàng, không cần chuyển đổi format

---

## 2. Kiến Trúc Backend Tổng Thể

```
┌──────────────────────────────────────────────────────────────────────────┐
│              StationMonitor.Backend (ASP.NET Core 8 — tại trạm)          │
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐ │
│  │  REST API    │  │ SignalR Hub  │  │  Workers    │  │  Analytics    │ │
│  │ /api/v1/... │  │ /ws/realtime │  │  (nền)      │  │  (định kỳ)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └──────┬────────┘ │
│         │                 │                  │                │          │
│  ┌──────▼─────────────────▼──────────────────▼────────────────▼────────┐ │
│  │                         Service Layer                                │ │
│  │  Plc  Modbus  IEC104  RuleEngine  Alerts  Detection  Auth  Sync     │ │
│  │  Notifications  Camera  Sld  Reports  CloudSync  Storage            │ │
│  └──────────────────────────────────┬────────────────────────────────── ┘ │
│                                     │                                    │
│  ┌──────────────────────────────────▼──────────────────────────────────┐ │
│  │              Data Layer (EF Core + Repositories)                    │ │
│  └──────────────────────────────────┬───────────────────────────────────┘ │
│                                     │                                    │
│  ┌──────────────────────────────────▼───────────────────────────────────┐ │
│  │  TimescaleDB — 17 bảng                                               │ │
│  │  sensor_readings (hypertable) · detection_events · alerts            │ │
│  │  sld_files · sld_points · devices · rules · users · audit_log ...   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
        │ gRPC                    │ HTTPS sync              │ Cloud modules
        ▼                         ▼                         ▼
  StationMonitor              Supabase Cloud          StationMonitor
  .AI.Python                  (PostgreSQL)            .Cloud
  (YOLO+TensorRT)             + Cloudflare R2         (Workers + Edge Fn)
```

---

## 3. Toàn Bộ 20 Thực Thể

| STT | Thực thể | Vai trò |
|---|---|---|
| 1 | **Station** | Trạm biến áp |
| 2 | **Device** | Thiết bị: PLC, cảm biến, camera, RTU |
| 3 | **User** | Tài khoản người dùng + phân quyền |
| 4 | **SldFile** | File SVG sơ đồ một sợi (theo version) |
| 5 | **SldPoint** | Vị trí chấm giám sát trên sơ đồ (x, y, r) |
| 6 | **SensorReading** | Dữ liệu đo lường số từ PLC/Modbus (hypertable) |
| 7 | **DetectionEvent** | Kết quả AI: hotspot, PD, xâm nhập + link tới MediaFile |
| 8 | **MediaFile** | Quản lý file ảnh/clip: local path + R2 URL + sync status |
| 9 | **ThermalFrame** | Ma trận nhiệt RAW từng pixel của camera nhiệt |
| 10 | **AiModelVersion** | Phiên bản model AI đang deploy (YOLO, PD, intrusion) |
| 11 | **Alert** | Cảnh báo — trạng thái hiện tại |
| 12 | **AlertHistory** | Lịch sử: ai ACK, ai đóng, ghi chú xử lý |
| 13 | **Rule** | Quy tắc cảnh báo tự động (AND/OR conditions) |
| 14 | **RuleTriggerLog** | Rule nào kích hoạt lúc nào, giá trị bao nhiêu |
| 15 | **AuditLog** | Mọi thao tác: ai sửa gì, trước/sau |
| 16 | **LoginLog** | Đăng nhập / đăng xuất / thất bại / hết hạn |
| 17 | **NotifyLog** | FCM/email đã gửi — thành công hay thất bại |
| 18 | **SystemSettings** | Cài đặt key-value theo từng trạm |
| 19 | **Report** | Báo cáo đã tạo: metadata + URL file PDF |
| 20 | **SyncQueue** | Hàng đợi offline-first sync lên cloud |

---

## 4. Cấu Trúc Database (TimescaleDB)

```sql
-- =============================================
-- NHÓM 1: CẤU HÌNH HỆ THỐNG
-- =============================================

CREATE TABLE stations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  code         TEXT UNIQUE,             -- mã trạm EVN
  location     JSONB,                   -- {lat, lng, address}
  status       TEXT DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   UUID REFERENCES stations(id),
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,           -- 'plc_s7' | 'modbus' | 'camera_thermal' | 'camera_pd' | 'camera_cctv'
  protocol     TEXT,                    -- 'snap7' | 'modbus_tcp' | 'modbus_rtu' | 'rtsp'
  config       JSONB,                   -- IP, port, DB address, register map...
  status       TEXT DEFAULT 'online',   -- 'online' | 'offline' | 'maintenance'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name    TEXT,
  email        TEXT,
  role         TEXT NOT NULL,           -- 'operator' | 'manager' | 'admin'
  station_ids  UUID[],                  -- trạm được phép truy cập
  is_active    BOOL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   UUID REFERENCES stations(id),
  device_id    UUID REFERENCES devices(id),
  name         TEXT NOT NULL,
  condition    JSONB NOT NULL,          -- {type:'threshold', point:'nhiet_do', op:'>', value:80, duration_s:600}
  actions      JSONB NOT NULL,          -- [{type:'alert', level:'alarm'}, {type:'notify', channel:'fcm'}]
  enabled      BOOL DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   UUID REFERENCES stations(id),
  key          TEXT NOT NULL,
  value        JSONB NOT NULL,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, key)
);
-- Ví dụ key: 'alert_email_list', 'polling_interval_s', 'iec104_server_ip', 'cloud_sync_enabled'

-- =============================================
-- NHÓM 2: SƠ ĐỒ MỘT SỢI
-- =============================================

CREATE TABLE sld_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   UUID REFERENCES stations(id),
  version      INT NOT NULL DEFAULT 1,
  svg_url      TEXT,                    -- URL file SVG trên R2/filesystem
  svg_content  TEXT,                   -- hoặc lưu thẳng nội dung SVG vào DB
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  is_active    BOOL DEFAULT TRUE
);

CREATE TABLE sld_points (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sld_file_id  UUID REFERENCES sld_files(id),
  device_id    UUID REFERENCES devices(id),
  point_id     TEXT NOT NULL,           -- "pha_A", "nhiet_mba_chinh"
  label        TEXT,                    -- tên hiển thị trên sơ đồ
  x            FLOAT NOT NULL,          -- tọa độ trên SVG
  y            FLOAT NOT NULL,
  r            FLOAT DEFAULT 8          -- bán kính chấm
);

-- =============================================
-- NHÓM 3: DỮ LIỆU ĐO LƯỜNG (TIME-SERIES)
-- =============================================

CREATE TABLE sensor_readings (
  time         TIMESTAMPTZ NOT NULL,
  station_id   UUID NOT NULL,
  device_id    UUID NOT NULL,
  point_id     TEXT NOT NULL,           -- "pha_A", "nhiet_mba_chinh"
  value        DOUBLE PRECISION,
  unit         TEXT,                    -- "°C", "kV", "A"
  quality      SMALLINT DEFAULT 0       -- 0=good, 1=bad, 2=uncertain
);
SELECT create_hypertable('sensor_readings', 'time');
-- Tự động tạo chunk theo tuần, nén sau 7 ngày

-- =============================================
-- NHÓM 4: AI DETECTION
-- =============================================

-- Version model AI đang deploy
CREATE TABLE ai_model_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type    TEXT NOT NULL,          -- 'thermal_yolo' | 'pd_detector' | 'intrusion'
  version       TEXT NOT NULL,          -- '1.0.0', '1.2.3'
  deployed_at   TIMESTAMPTZ NOT NULL,
  accuracy      FLOAT,                  -- mAP hoặc F1 score khi test
  notes         TEXT,
  is_active     BOOL DEFAULT TRUE
);

-- Kết quả phát hiện từ AI
CREATE TABLE detection_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id        UUID REFERENCES devices(id),
  station_id       UUID REFERENCES stations(id),
  model_version_id UUID REFERENCES ai_model_versions(id),
  detection_type   TEXT NOT NULL,       -- 'thermal_hotspot' | 'partial_discharge' | 'corona' | 'intrusion' | 'equipment_fault'
  detected_at      TIMESTAMPTZ NOT NULL,
  confidence       FLOAT,               -- độ tin cậy AI (0.0 → 1.0)
  bounding_boxes   JSONB,               -- [{x,y,w,h, label, temp}, ...]
  max_temp         FLOAT,               -- nhiệt độ cao nhất (camera nhiệt)
  affected_zone    TEXT,                -- "MBA chính", "Thanh cái A"
  alert_id         UUID,                -- nếu event này tạo ra Alert
  metadata         JSONB                -- dữ liệu thô thêm từ model
  -- image/video không lưu URL ở đây → xem media_files.detection_id
);

-- Quản lý file ảnh + video clip (local + R2 cloud)
CREATE TABLE media_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id    UUID REFERENCES stations(id),
  device_id     UUID REFERENCES devices(id),
  detection_id  UUID REFERENCES detection_events(id), -- null nếu chụp thủ công
  taken_by      UUID REFERENCES users(id),            -- null nếu AI tự chụp
  file_type     TEXT NOT NULL,          -- 'image' | 'video_clip' | 'thermal_map'
  source        TEXT NOT NULL,          -- 'ai_detection' | 'manual_snapshot' | 'event_trigger'
  storage       TEXT NOT NULL,          -- 'local' | 'r2_cloud' | 'both'
  file_path     TEXT,                   -- đường dẫn local /data/media/...
  file_url      TEXT,                   -- URL R2 cloud
  file_size_kb  INT,
  duration_s    INT,                    -- chỉ cho video_clip
  captured_at   TIMESTAMPTZ NOT NULL,
  synced        BOOL DEFAULT FALSE,     -- đã sync lên R2 chưa
  synced_at     TIMESTAMPTZ
);

-- Ma trận nhiệt RAW từng pixel (camera nhiệt)
CREATE TABLE thermal_frames (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id  UUID REFERENCES detection_events(id),
  camera_id     UUID REFERENCES devices(id),
  captured_at   TIMESTAMPTZ NOT NULL,
  width         INT,                    -- số cột pixel
  height        INT,                    -- số hàng pixel
  temp_matrix   JSONB,                  -- [[25.1,26.3,...],[...]] ma trận °C từng pixel
  temp_min      FLOAT,
  temp_max      FLOAT,
  temp_avg      FLOAT,
  hotspot_x     INT,                    -- tọa độ pixel nóng nhất
  hotspot_y     INT,
  hotspot_temp  FLOAT,
  emissivity    FLOAT DEFAULT 0.95      -- hệ số bức xạ thiết bị
);

-- =============================================
-- NHÓM 5: CẢNH BÁO
-- =============================================

CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id     UUID REFERENCES stations(id),
  device_id      UUID REFERENCES devices(id),
  rule_id        UUID REFERENCES rules(id),
  detection_id   UUID REFERENCES detection_events(id), -- nếu do AI phát hiện
  source         TEXT NOT NULL,         -- 'rule_engine' | 'ai_detection' | 'manual'
  level          TEXT NOT NULL,         -- 'warning' | 'alarm'
  status         TEXT DEFAULT 'open',   -- 'open' | 'acked' | 'closed'
  message        TEXT,
  value          DOUBLE PRECISION,
  triggered_at   TIMESTAMPTZ NOT NULL,
  acked_at       TIMESTAMPTZ,
  acked_by       UUID REFERENCES users(id),
  ack_note       TEXT,
  closed_at      TIMESTAMPTZ,
  image_url      TEXT
);

CREATE TABLE alert_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id       UUID REFERENCES alerts(id),
  status         TEXT NOT NULL,         -- 'triggered' | 'acked' | 'closed' | 'reopened'
  changed_by     UUID REFERENCES users(id),
  changed_at     TIMESTAMPTZ DEFAULT NOW(),
  note           TEXT
);

-- =============================================
-- NHÓM 6: LOG HỆ THỐNG
-- =============================================

CREATE TABLE rule_trigger_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID REFERENCES rules(id),
  device_id      UUID REFERENCES devices(id),
  station_id     UUID REFERENCES stations(id),
  triggered_at   TIMESTAMPTZ DEFAULT NOW(),
  condition_snapshot JSONB,             -- condition lúc trigger (phòng rule bị sửa sau)
  value_at_trigger DOUBLE PRECISION,
  alert_id       UUID REFERENCES alerts(id)
);

CREATE TABLE audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  action         TEXT NOT NULL,         -- 'create' | 'update' | 'delete' | 'ack_alert' | 'export' | 'view_camera'
  entity_type    TEXT,                  -- 'device' | 'rule' | 'alert' | 'user'
  entity_id      UUID,
  old_value      JSONB,
  new_value      JSONB,
  ip_address     TEXT,
  ts             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE login_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  username       TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  action         TEXT NOT NULL,         -- 'login' | 'logout' | 'failed' | 'token_expired'
  ts             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notify_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id       UUID REFERENCES alerts(id),
  channel        TEXT NOT NULL,         -- 'fcm' | 'email' | 'iec104'
  recipient      TEXT,                  -- email hoặc FCM token
  status         TEXT NOT NULL,         -- 'sent' | 'failed'
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  error_msg      TEXT
);

-- =============================================
-- NHÓM 7: BÁO CÁO & ĐỒNG BỘ
-- =============================================

CREATE TABLE reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id     UUID REFERENCES stations(id),
  type           TEXT NOT NULL,         -- 'daily' | 'monthly' | 'event' | 'cbm'
  period_from    TIMESTAMPTZ,
  period_to      TIMESTAMPTZ,
  file_url       TEXT,                  -- URL file PDF
  generated_by   UUID REFERENCES users(id),
  generated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL,         -- bảng nào cần sync
  entity_id      UUID NOT NULL,
  payload        JSONB NOT NULL,        -- dữ liệu cần gửi lên cloud
  retry_count    INT DEFAULT 0,
  status         TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  sent_at        TIMESTAMPTZ
);
```

---

## 5. Luồng Dữ Liệu Qua Các Bảng

```
PLC/Modbus ──────────────────────────────────────► sensor_readings (6)
                                                          │
                                                   Rule Engine đọc
                                                          │
Camera → AI Engine ──► detection_events (7)               │
    │         │               │                           │
    │         │         thermal_frames (9)         Rule Engine
    │         │         (ma trận nhiệt RAW)               │
    │         │                                       alerts (11)
    │         │                                           │
    │    media_files (8) ◄─────────────────────┐   ┌─────┼──────────┐
    │    (ảnh + clip)                           │   ▼     ▼          ▼
    │         │                          alert_history  notify_log  rule_trigger_log
    │         │ synced=false                   (12)      (17)         (14)
    │         ▼
    │   local filesystem
    │   /data/media/...
    │         │
    │   CloudSyncWorker
    │         │
    │         ▼
    │   Cloudflare R2 (cloud)
    │   media_files.synced=true
    │
    └── AiModelVersion (10) ─── version model nào phát hiện

User thao tác ──► audit_log (15)
User đăng nhập ──► login_log (16)
Operator chụp ảnh thủ công ──► media_files (8, taken_by=user)
Tạo báo cáo ──► reports (19)
Mất mạng ──► sync_queue (20) ──► khi có mạng ──► Supabase Cloud
```

---

## 6. Luồng Xử Lý Cảnh Báo (Alert Lifecycle)

### Giai đoạn 1 — Phát sinh cảnh báo

```
┌─────────────────────────────────────────────────────────────────┐
│  NGUỒN 1: Rule Engine (sensor vượt ngưỡng)                       │
│                                                                   │
│  PLC Poll → sensor_readings → Rule Evaluator                     │
│                                    │                             │
│                        Kiểm tra tất cả rules của trạm           │
│                                    │                             │
│                        Rule thỏa điều kiện?                      │
│                           YES ──► Tạo Alert (status='open')     │
│                                   Ghi rule_trigger_log           │
│                           NO  ──► Bỏ qua                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  NGUỒN 2: AI Detection (camera phát hiện)                        │
│                                                                   │
│  Camera frame → Python AI → gRPC → .NET Backend                 │
│                                    │                             │
│                        Lưu detection_events                      │
│                                    │                             │
│                        Confidence > ngưỡng?                      │
│                           YES ──► Tạo Alert (source='ai')       │
│                                   alert.detection_id = event.id  │
│                           NO  ──► Chỉ lưu event, không tạo alert│
└─────────────────────────────────────────────────────────────────┘
```

### Giai đoạn 2 — Thông báo tức thì

```
Alert được tạo (status='open')
        │
        ├──► SignalR push → Desktop App / Web (hiện ngay trên màn hình)
        │
        ├──► Firebase FCM → Điện thoại người phụ trách (dù app đang đóng)
        │
        ├──► Email → Danh sách email trong system_settings
        │
        ├──► IEC-60870-5-104 → Trung tâm điều độ (nếu là Alarm)
        │
        └──► Ghi notify_log (từng kênh — sent hay failed)
```

### Giai đoạn 3 — Người vận hành xử lý (ACK)

```
Operator nhìn thấy cảnh báo trên dashboard
        │
        ▼
  Click "Xác nhận tiếp nhận" (ACK)
        │
        ├──► alerts.status = 'acked'
        ├──► alerts.acked_by = user.id
        ├──► alerts.acked_at = NOW()
        ├──► alerts.ack_note = "Đã cử người kiểm tra MBA chính"
        │
        ├──► Ghi alert_history (status='acked', changed_by, note)
        ├──► Ghi audit_log (action='ack_alert')
        │
        └──► SignalR push → Cập nhật trạng thái trên tất cả màn hình
```

### Giai đoạn 4 — Đóng cảnh báo

```
Xử lý xong, nhiệt độ về bình thường
        │
  Tự động (Rule Engine):           Hoặc Thủ công (Manager):
  Giá trị về dưới ngưỡng           Click "Đóng cảnh báo"
  trong X phút liên tiếp                  │
        │                                 │
        └────────────┬────────────────────┘
                     │
              alerts.status = 'closed'
              alerts.closed_at = NOW()
                     │
              Ghi alert_history (status='closed')
              Ghi audit_log
                     │
              SignalR push → Cập nhật dashboard
                     │
              Đưa vào sync_queue → Sync lên cloud
```

### Toàn bộ vòng đời (State Machine)

```
          ┌─────────────┐
          │   TRIGGERED  │ ◄── Rule Engine / AI Detection
          └──────┬───────┘
                 │ Tạo Alert (status='open')
                 ▼
          ┌─────────────┐
          │    OPEN      │ ◄── Hiển thị đỏ/vàng trên dashboard
          └──────┬───────┘     Push FCM + Email
                 │ Operator ACK
                 ▼
          ┌─────────────┐
          │    ACKED     │ ◄── Đã tiếp nhận, đang xử lý
          └──────┬───────┘
                 │ Xử lý xong / Giá trị về ngưỡng
                 ▼
          ┌─────────────┐
          │   CLOSED     │ ◄── Lưu vào history, sync cloud
          └─────────────┘
                 │ (nếu tình trạng tái diễn)
                 ▼
          ┌─────────────┐
          │  REOPENED    │ ◄── Tạo alert mới, ghi alert_history
          └─────────────┘
```

---

## 7. API Endpoints

```
=== STATIONS ===
GET    /api/v1/stations                    — Danh sách trạm + trạng thái
GET    /api/v1/stations/{id}               — Chi tiết một trạm
POST   /api/v1/stations                    — Thêm trạm mới (Admin)

=== DEVICES ===
GET    /api/v1/stations/{id}/devices       — Thiết bị trong trạm
POST   /api/v1/devices                     — Thêm thiết bị
PUT    /api/v1/devices/{id}                — Sửa cấu hình
DELETE /api/v1/devices/{id}                — Xóa thiết bị
POST   /api/v1/devices/{id}/test           — Test kết nối

=== SLD ===
GET    /api/v1/stations/{id}/sld           — Lấy SLD active + tọa độ các điểm
POST   /api/v1/stations/{id}/sld           — Upload SVG mới
PUT    /api/v1/sld/points/{id}             — Cập nhật vị trí điểm (x,y,r)

=== MEASUREMENTS ===
GET    /api/v1/points                      — Giá trị tức thời toàn trạm
GET    /api/v1/history?device=&from=&to=   — Lịch sử time-series
GET    /api/v1/history/export              — Export CSV

=== DETECTIONS ===
GET    /api/v1/detections?camera=&from=    — Lịch sử AI detection
GET    /api/v1/detections/{id}             — Chi tiết 1 event (ảnh, clip, bbox)
GET    /api/v1/detections/{id}/thermal     — Ma trận nhiệt RAW của event

=== MEDIA ===
GET    /api/v1/media?device=&from=&type=   — Danh sách file theo camera/loại
GET    /api/v1/media/{id}/download         — Tải file ảnh/clip
POST   /api/v1/media/snapshot              — Chụp ảnh thủ công từ operator
DELETE /api/v1/media/{id}                  — Xóa file (Admin)

=== AI MODELS ===
GET    /api/v1/ai/models                   — Danh sách version model
GET    /api/v1/ai/models/active            — Model đang dùng
POST   /api/v1/ai/models                   — Deploy model mới (Admin)

=== ALERTS ===
GET    /api/v1/alerts?status=open          — Cảnh báo đang mở
GET    /api/v1/alerts/{id}                 — Chi tiết + lịch sử xử lý
POST   /api/v1/alerts/{id}/ack             — ACK + ghi chú
POST   /api/v1/alerts/{id}/close           — Đóng cảnh báo
GET    /api/v1/alerts/export               — Export CSV

=== RULES ===
GET    /api/v1/rules                       — Danh sách rule
POST   /api/v1/rules                       — Tạo rule mới
PUT    /api/v1/rules/{id}                  — Sửa rule
PATCH  /api/v1/rules/{id}/toggle           — Bật/tắt rule
GET    /api/v1/rules/{id}/history          — Lịch sử kích hoạt

=== REPORTS ===
POST   /api/v1/reports/generate            — Tạo báo cáo PDF
GET    /api/v1/reports/{id}/download       — Tải PDF

=== AUTH ===
POST   /api/v1/auth/login                  — Đăng nhập → JWT
POST   /api/v1/auth/refresh                — Refresh token
GET    /api/v1/auth/me                     — Thông tin user hiện tại

=== ADMIN ===
GET    /api/v1/users                       — Danh sách user (Admin)
POST   /api/v1/users                       — Tạo user mới
GET    /api/v1/logs/audit                  — Audit log
GET    /api/v1/logs/login                  — Login log

=== REAL-TIME ===
WS     /ws/realtime                        — SignalR: sensor, alerts, status
```

---

## 8. Background Workers (Hosted Services)

```
── Polling ──────────────────────────────────────────────────────────────
PlcPollingWorker        — Đọc S7 PLC mỗi 3-5 giây (snap7 FFI)
ModbusPollingWorker     — Đọc cảm biến Modbus mỗi 5-10 giây

── Processing ───────────────────────────────────────────────────────────
RuleEvaluationWorker    — Đánh giá rules sau mỗi batch data mới
AlertNotifyWorker       — Gửi push (Firebase FCM) + email khi có alarm

── Protocol ─────────────────────────────────────────────────────────────
IEC104Worker            — Kết nối liên tục đến Trung tâm điều độ (lib60870.NET)

── Sync ─────────────────────────────────────────────────────────────────
CloudSyncWorker         — Sync sensor batch lên Supabase mỗi 5 phút
StorageMonitorWorker    — Giám sát disk, adaptive retention, tự giải phóng khi đầy

── Scheduler ────────────────────────────────────────────────────────────
ReportSchedulerWorker   — Tự động tạo báo cáo định kỳ (Hangfire)

── Analytics ────────────────────────────────────────────────────────────
EarlyWarningWorker      — Phân tích xu hướng nhiệt, cảnh báo sớm mỗi 30 phút
```

---

## 9. Thư Viện .NET Sử Dụng

| Thư viện | Mục đích |
|---|---|
| **ASP.NET Core 8** | API framework |
| **SignalR** | WebSocket real-time |
| **Entity Framework Core + Npgsql** | ORM cho PostgreSQL |
| **Npgsql.EntityFrameworkCore.PostgreSQL** | TimescaleDB support |
| **lib60870.NET** | IEC-60870-5-104 protocol |
| **NModbus** | Modbus RTU/TCP |
| **snap7** (P/Invoke) | Siemens S7 PLC qua native DLL |
| **Grpc.Net.Client** | gRPC client — gọi Python AI Engine |
| **QuestPDF** | Tạo báo cáo PDF |
| **Serilog** | Structured logging |
| **Hangfire** | Report scheduler + cron jobs |
| **FirebaseAdmin** | Push notification FCM |
| **MailKit** | Gửi email SMTP |
| **Supabase-csharp** | Supabase client cho cloud sync |

---

## 10. Giao Tiếp Với Python AI Engine

Python chỉ làm AI (YOLO + TensorRT), giao tiếp với .NET qua **gRPC**:

```protobuf
service AiEngine {
  rpc AnalyzeFrame (FrameRequest) returns (DetectionResult);
  rpc StreamDetections (CameraRequest) returns (stream Detection);
}

message DetectionResult {
  repeated Detection detections = 1;
  float hotspot_temp = 2;
  string camera_id = 3;
  int64 timestamp_ms = 4;
}
```

- .NET backend gọi Python gRPC sidecar
- Python trả kết quả phát hiện (hotspot, PD event, người xâm nhập)
- .NET lưu vào detection_events và kích hoạt rule engine

---

## 11. Triển Khai Theo 2 Mô Hình

### Model A — Jetson Orin Nano (trạm thí nghiệm, ≤4 camera)

```
Jetson 8GB RAM:
├── go2rtc (streaming)           ~150MB
├── Python AI + TensorRT         ~3-4GB GPU memory
├── ASP.NET Core Backend         ~300MB
├── TimescaleDB                  ~512MB (shared_buffers=128MB)
└── Còn dư: ~2GB buffer
```

### Model B — Server riêng (>4 camera)

```
Server (i7 16GB):
├── ASP.NET Core Backend         ~500MB
├── TimescaleDB                  ~4GB (shared_buffers=2GB)
└── go2rtc streaming             ~500MB

Jetson (chuyên AI):
├── Python AI Engine + TensorRT  Toàn bộ GPU memory
└── gRPC server port 50051
```

---

## 12. Cấu Trúc Thư Mục Dự Án Backend

```
StationMonitor.Backend/
│
├── StationMonitor.Api/                  # API layer
│   ├── Controllers/
│   │   ├── StationsController.cs
│   │   ├── DevicesController.cs
│   │   ├── SldController.cs
│   │   ├── MeasurementsController.cs
│   │   ├── DetectionsController.cs
│   │   ├── MediaController.cs           # upload thủ công + download file
│   │   ├── AlertsController.cs
│   │   ├── RulesController.cs
│   │   ├── ReportsController.cs
│   │   ├── AuthController.cs
│   │   └── AdminController.cs
│   ├── Hubs/
│   │   └── RealtimeHub.cs               # SignalR WebSocket
│   ├── Middleware/
│   │   ├── AuthMiddleware.cs            # xác thực JWT
│   │   ├── AuditMiddleware.cs           # tự ghi audit_log mỗi request
│   │   └── ErrorHandlingMiddleware.cs
│   ├── DTOs/                            # request/response models
│   │   ├── AlertDto.cs
│   │   ├── SensorReadingDto.cs
│   │   ├── DeviceDto.cs
│   │   └── ...
│   └── Program.cs
│
├── StationMonitor.Workers/              # Background workers (Hosted Services)
│   ├── Polling/
│   │   ├── PlcPollingWorker.cs          # đọc PLC S7 mỗi 3-5s
│   │   └── ModbusPollingWorker.cs       # đọc cảm biến mỗi 5-10s
│   ├── Processing/
│   │   ├── RuleEvaluationWorker.cs      # đánh giá rule sau mỗi batch data
│   │   └── AlertNotifyWorker.cs         # gửi FCM/email khi có alert mới
│   ├── Protocol/
│   │   └── IEC104Worker.cs              # kết nối điều độ liên tục
│   ├── Sync/
│   │   └── CloudSyncWorker.cs           # sync lên Supabase offline-first
│   └── Scheduler/
│       └── ReportSchedulerWorker.cs     # tạo báo cáo định kỳ
│
├── StationMonitor.Services/             # Business logic thuần
│   ├── Plc/
│   │   └── PlcDataReader.cs             # snap7 FFI — đọc raw data từ PLC
│   ├── Modbus/
│   │   └── ModbusDataReader.cs          # NModbus — đọc cảm biến
│   ├── RuleEngine/
│   │   ├── RuleEvaluator.cs             # đánh giá condition AND/OR
│   │   ├── ConditionParser.cs           # parse JSONB condition từ DB
│   │   └── ActionExecutor.cs            # thực thi action (alert/notify/log)
│   ├── Alerts/
│   │   ├── AlertService.cs              # tạo, ACK, đóng alert
│   │   ├── AlertHistoryService.cs       # ghi alert_history
│   │   └── NotificationService.cs       # FCM + Email + ghi notify_log
│   ├── Detection/
│   │   ├── AiDetectionService.cs        # nhận kết quả từ Python gRPC → lưu DB
│   │   ├── MediaFileService.cs          # lưu file local + sync R2 + xóa khi đầy
│   │   └── ThermalFrameService.cs       # lưu ma trận nhiệt RAW
│   ├── Camera/
│   │   └── Go2RtcService.cs             # quản lý stream go2rtc
│   ├── Sld/
│   │   └── SldService.cs                # upload SVG, lưu tọa độ điểm
│   ├── CloudSync/
│   │   ├── SyncQueueService.cs          # thêm vào sync_queue
│   │   └── SupabaseSyncService.cs       # gửi lên Supabase
│   ├── Reports/
│   │   └── ReportGenerator.cs           # QuestPDF → xuất PDF
│   ├── Auth/
│   │   ├── AuthService.cs               # login, JWT, refresh token
│   │   └── PermissionService.cs         # kiểm tra quyền theo trạm
│   └── IEC104/
│       └── IEC104Service.cs             # lib60870.NET
│
├── StationMonitor.Data/                 # Data layer
│   ├── Entities/                        # 20 thực thể
│   │   ├── Station.cs
│   │   ├── Device.cs
│   │   ├── User.cs
│   │   ├── SldFile.cs
│   │   ├── SldPoint.cs
│   │   ├── SensorReading.cs
│   │   ├── DetectionEvent.cs
│   │   ├── MediaFile.cs                 # ảnh + clip local/R2
│   │   ├── ThermalFrame.cs              # ma trận nhiệt RAW từng pixel
│   │   ├── AiModelVersion.cs            # version model đang deploy
│   │   ├── Alert.cs
│   │   ├── AlertHistory.cs
│   │   ├── Rule.cs
│   │   ├── RuleTriggerLog.cs
│   │   ├── AuditLog.cs
│   │   ├── LoginLog.cs
│   │   ├── NotifyLog.cs
│   │   ├── SystemSettings.cs
│   │   ├── Report.cs
│   │   └── SyncQueue.cs
│   ├── Repositories/                    # truy vấn DB tập trung
│   │   ├── AlertRepository.cs
│   │   ├── SensorRepository.cs
│   │   ├── DeviceRepository.cs
│   │   └── ...
│   ├── Migrations/
│   └── AppDbContext.cs
│
├── StationMonitor.Analytics/            # Phân tích nâng cao (chạy nền định kỳ)
│   ├── EarlyWarning/
│   │   ├── TrendAnalyzer.cs             # phát hiện xu hướng tăng nhiệt dần
│   │   ├── AnomalyDetector.cs           # phát hiện bất thường so lịch sử
│   │   └── EarlyWarningWorker.cs        # chạy mỗi 15-30 phút
│   ├── PredictiveMaintenance/
│   │   ├── HealthScoreCalculator.cs     # tính điểm sức khỏe thiết bị (0-100)
│   │   ├── MaintenancePredictor.cs      # dự đoán thời điểm cần bảo trì
│   │   └── CbmReportBuilder.cs          # tạo báo cáo CBM tự động
│   ├── Statistics/
│   │   ├── DailyAggregator.cs           # tổng hợp min/max/avg mỗi ngày
│   │   └── StationComparer.cs           # so sánh nhiều trạm cùng lúc
│   └── Correlation/
│       └── MultiSensorCorrelator.cs     # tìm liên hệ giữa các sensor
│                                        # vd: nhiệt tăng + PD tăng = nguy hiểm cao
│
├── StationMonitor.AI.Python/            # Python gRPC AI sidecar
│   ├── ai_engine.py                     # gRPC server
│   ├── yolo_detector.py                 # YOLO + TensorRT
│   ├── thermal_analyzer.py              # phân tích camera nhiệt
│   ├── pd_detector.py                   # phát hiện phóng điện
│   └── proto/
│       └── ai_service.proto
│
├── StationMonitor.Database/             # Database scripts & policies
│   ├── Scripts/
│   │   ├── 001_init_timescaledb.sql     # tạo hypertable, compression policy
│   │   ├── 002_seed_stations.sql        # dữ liệu mẫu trạm thí nghiệm
│   │   ├── 003_seed_devices.sql         # thiết bị mẫu (PLC, camera)
│   │   └── 004_seed_rules.sql           # rule mẫu (nhiệt > 80°C → alarm)
│   └── Policies/
│       ├── retention_policy.sql         # xóa data cũ hơn 10 năm
│       └── compression_policy.sql       # nén data cũ hơn 7 ngày
│
├── StationMonitor.Tests/                # Unit + Integration tests
│   ├── RuleEngine.Tests/
│   ├── AlertService.Tests/
│   ├── Analytics.Tests/
│   └── Api.Tests/
│
├── docker-compose.yml                   # local dev
├── docker-compose.prod.yml              # production Jetson
└── .env.example
```

### Vai trò từng module

| Module | Vai trò |
|---|---|
| `Workers/Polling/` | Vòng lặp đọc PLC/Modbus liên tục nền |
| `Workers/Processing/` | Đánh giá rule + gửi thông báo sau mỗi batch data |
| `Workers/Protocol/` | Duy trì kết nối IEC-104 với điều độ |
| `Workers/Sync/` | Sync cloud offline-first khi có mạng |
| `Services/RuleEngine/` | Parser + Evaluator + ActionExecutor tách rõ |
| `Services/Detection/` | Nhận kết quả AI → lưu DB → trigger rule |
| `Services/Auth/` | JWT + phân quyền theo trạm |
| `Data/Repositories/` | Tập trung truy vấn DB, không rải trong service |
| `Middleware/` | Auth + Audit tự động mỗi request |
| `DTOs/` | Tách model API khỏi DB entity |
| `Analytics/EarlyWarning/` | Phát hiện xu hướng xấu trước khi vượt ngưỡng |
| `Analytics/PredictiveMaintenance/` | Tính điểm sức khỏe, đề xuất bảo trì CBM |
| `Analytics/Statistics/` | Tổng hợp daily/monthly cho báo cáo |
| `Analytics/Correlation/` | Tìm liên hệ giữa các sensor khác nhau |
| `Database/Scripts/` | Migration + seed data mẫu |
| `Database/Policies/` | Retention + compression TimescaleDB |
| `Tests/` | Test rule engine, alert, analytics |

### Luồng Early Warning

```
sensor_readings (lịch sử 30 ngày)
        │
        ▼
EarlyWarningWorker chạy mỗi 30 phút
        │
TrendAnalyzer: nhiệt độ tăng 0.5°C/ngày liên tục 7 ngày?
        │
        ▼
Tạo Alert (level='warning', source='early_warning')
        │
Thông báo: "MBA chính xu hướng tăng nhiệt,
            dự kiến vượt ngưỡng sau ~14 ngày"
```

### Các module có thể thêm sau vào Analytics

| Module | Mô tả |
|---|---|
| `SeasonalPattern` | So sánh với cùng kỳ năm trước |
| `LoadForecasting` | Dự đoán tải theo mùa/giờ cao điểm |
| `FaultClassifier` | Phân loại loại sự cố dựa trên pattern |

---

## 13. Chiến Lược Database 2 Tầng & Đồng Bộ Cloud

### Phân tầng lưu trữ

```
┌──────────────────────────────────────────────────────────────┐
│                   JETSON tại trạm (HOT)                       │
│              TimescaleDB — full resolution                    │
│                                                               │
│  Mặc định giữ: 90 ngày                                       │
│  Nén tự động sau: 7 ngày (TimescaleDB compression)           │
│  Xóa khi: đủ 90 ngày HOẶC disk vượt ngưỡng                  │
│  Điều kiện bắt buộc: phải sync xong lên cloud trước khi xóa │
└───────────────────────────┬──────────────────────────────────┘
                            │ sync định kỳ + event-driven
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   SUPABASE Cloud (WARM + COLD)                │
│                                                               │
│  Raw data: 30 ngày gần nhất                                  │
│  Hourly summary: 1 năm                                       │
│  Daily summary: 10 năm+                                      │
│  Tất cả trạm gộp chung — phân biệt bằng station_id          │
└──────────────────────────────────────────────────────────────┘
```

---

### Adaptive Retention — Xử lý khi disk đầy sớm

Ví dụ: SSD 64GB, dùng tới 80% mà mới chỉ 10 ngày → tự động kích hoạt:

```
StorageMonitorWorker kiểm tra mỗi giờ
        │
   < 70% → bình thường, giữ nguyên 90 ngày
        │
   70–80% → sync data cũ hơn 30 ngày → xóa local
        │
   80–90% → sync data cũ hơn 7 ngày → xóa local
        │
   > 90%  → sync TẤT CẢ lên cloud → chỉ giữ 3 ngày
            + gửi cảnh báo admin ngay
```

**Nguyên tắc bất biến — không được bỏ qua:**
```
KHÔNG xóa local nếu chưa xác nhận cloud đã nhận đủ
```

| Tình huống | Xử lý |
|---|---|
| Mất mạng khi đang sync | Dừng, không xóa, retry sau 30 phút |
| Sync thành công 1 phần | Chỉ xóa phần cloud đã xác nhận |
| Cloud trả lỗi | Giữ nguyên local, log lỗi, alert admin |
| Disk > 90% mà mất mạng | Cảnh báo khẩn admin, KHÔNG tự xóa |

---

### Tần suất Sync — Lựa chọn tối ưu

Câu hỏi: sync mỗi 5 phút hay 30 phút?

**Câu trả lời: chia theo loại dữ liệu — hệ thống lớn đều làm vậy**

| Loại data | Sync khi nào | Lý do |
|---|---|---|
| **Alert, DetectionEvent** | Ngay lập tức (event-driven) | Mobile cần nhận push ngay |
| **SensorReading** | Mỗi 5 phút (batch) | Balance giữa độ trễ và tải mạng |
| **AuditLog, NotifyLog** | Mỗi 15 phút | Không cần real-time |
| **Hourly aggregate** | Mỗi giờ (Hangfire job) | Tạo summary cho báo cáo |
| **Daily aggregate** | 00:05 hàng ngày | Tổng hợp ngày hôm trước |

> Mobile app lấy sensor data từ cloud → cần cloud trễ tối đa 5 phút so với trạm → sync 5 phút là đủ.

**Hệ thống lớn (OSIsoft PI, Ignition, AWS IoT) làm thế nào:**
- Alert/event: push ngay (event-driven, MQTT hoặc webhook)
- Time-series: batch 1-5 phút
- Aggregate: hourly/daily job
- Không ai sync raw data real-time — quá tốn băng thông

---

### Modules bổ sung cho Storage & Sync

```
StationMonitor.Workers/
└── Sync/
    ├── CloudSyncWorker.cs               # sync sensor batch mỗi 5 phút
    └── StorageMonitorWorker.cs          # giám sát disk, adaptive retention

StationMonitor.Services/
└── CloudSync/
    ├── SyncQueueService.cs
    ├── SupabaseSyncService.cs
    ├── SupabaseClient.cs
    ├── SyncConflictResolver.cs
    └── StoragePolicy.cs                 # tính ngưỡng, quyết định xóa bao nhiêu

StationMonitor.Database/
└── Scripts/
    ├── retention_policy.sql             # time-based: xóa sau 90 ngày
    └── compression_policy.sql           # nén data sau 7 ngày
```

---

### Cấu hình ngưỡng trong SystemSettings (Admin chỉnh được)

```json
{ "key": "storage_warn_pct",     "value": 70 }
{ "key": "storage_sync_pct",     "value": 80 }
{ "key": "storage_urgent_pct",   "value": 90 }
{ "key": "retention_normal_days","value": 90 }
{ "key": "retention_warn_days",  "value": 30 }
{ "key": "retention_urgent_days","value": 7  }
{ "key": "retention_min_days",   "value": 3  }
{ "key": "sync_interval_min",    "value": 5  }
```

---

### Khả năng mở rộng

**Thêm trạm mới:**
```
Cài Docker trên Jetson mới → docker compose up
→ Trạm tự đăng ký lên cloud → xuất hiện trên bản đồ
→ Tự sync theo cùng cơ chế, station_id riêng biệt
```

**Thêm thiết bị trong trạm:**
```
Thêm PLC/cảm biến → thêm 1 row bảng devices + cấu hình
→ TimescaleDB tự xử lý tải tăng thêm, không sửa schema
```

**Ước tính dung lượng:**

| Quy mô | Sensor | Readings/ngày | Local/tháng | Cloud/năm |
|---|---|---|---|---|
| Trạm nhỏ | 20 | 345,600 | ~500MB | ~2GB |
| Trạm lớn | 100 | 1,728,000 | ~2.5GB | ~10GB |
| 10 trạm lớn | 1,000 | 17,280,000 | ~25GB | ~100GB |

> TimescaleDB compression giảm 90-95% → thực tế nhỏ hơn nhiều.

---

## 14. Luồng Truy Cập Theo Từng Client

### Sơ đồ tổng quan

```
┌──────────────────────────────────────────────────────────────────┐
│                    Jetson Backend (tại trạm)                      │
└──────┬─────────────┬──────────────┬──────────────┬───────────────┘
       │             │              │              │
  Desktop App   Mobile (LAN)  Mobile (remote)  Bên thứ 3
  (Tauri/Win)   cùng wifi      ngoài trạm      (phần mềm EVN)
       │             │              │              │
  HTTP LAN      HTTP LAN      HTTPS Cloud     REST + API Key
  không qua     không qua     → Supabase      HTTPS + JWT
  cloud         cloud         → trả về data
```

### Luồng viết báo cáo từ máy trạm Desktop

```
Desktop App
    │
    ├─► POST /api/v1/reports/generate
    │         { type:'daily', date:'2026-04-01', devices:[...] }
    │
    │   Backend:
    │   1. Query sensor_readings từ local TimescaleDB
    │   2. Query alerts trong khoảng thời gian
    │   3. QuestPDF render → file PDF
    │   4. Lưu reports table + file local storage
    │
    ◄─── { report_id, download_url }
    │
    ├─► GET /api/v1/reports/{id}/download
    ◄─── file PDF → Desktop lưu ra máy hoặc in trực tiếp
```

### API cho bên thứ 3 (EVN SCADA, phần mềm quản lý)

```
Xác thực: X-Api-Key: <key> (riêng biệt với JWT người dùng)
Phân quyền: chỉ đọc, không được ACK hay thay đổi cấu hình

GET  /api/v1/external/points       → giá trị tức thời
GET  /api/v1/external/alerts       → cảnh báo đang mở
GET  /api/v1/external/history      → lịch sử theo thời gian
WS   /ws/external/realtime         → stream real-time
```

---

## 15. Chính Sách Lưu Trữ & Truy Ngược Lịch Sử

### Giữ tối thiểu 30 ngày — không thể thấp hơn

```
Disk < 70%  → giữ 90 ngày (bình thường)
Disk 70–80% → giữ 60 ngày (xóa bớt nhưng vẫn > 30)
Disk 80–90% → giữ 30 ngày (giới hạn tối thiểu)
Disk > 90%  → GIỮ 30 NGÀY, KHÔNG XÓA THÊM
              → Cảnh báo khẩn admin
              → Nén mạnh hơn (TimescaleDB manual compress)
              → KHÔNG BAO GIỜ xóa xuống dưới 30 ngày
```

**Lý do giữ tối thiểu 30 ngày:**
- Mất mạng dài ngày → vẫn có data để xem và vận hành
- Cần so sánh tuần trước / tháng trước ngay tại trạm
- Báo cáo tháng cần đủ data local để tạo nhanh không chờ cloud

### Truy ngược lịch sử từ cloud (Federated Query)

```
Desktop / Mobile hỏi data cũ hơn 90 ngày
        │
GET /api/v1/history?from=2025-01-01&to=2025-02-01&source=auto
        │
  source=auto → Backend kiểm tra local trước
        │
   Có local? ──► trả về ngay
        │
   Không có? ──► Federated Query → Supabase cloud
                        │
                 Supabase trả về data
                        │
                 Backend pass-through về client
                 (không lưu lại local)
```

**Mobile ở ngoài LAN:**
```
Mobile → Supabase cloud trực tiếp → không cần qua Jetson
```

### API history bổ sung

```
GET /api/v1/history?from=&to=&source=auto
    source=auto  → tự tìm local trước, không có thì lấy cloud
    source=local → chỉ lấy local (nhanh)
    source=cloud → chỉ lấy cloud (data cũ nhiều năm)

POST /api/v1/reports/generate          → báo cáo từ local data
POST /api/v1/reports/generate-cloud    → báo cáo từ cloud (data cũ)
GET  /api/v1/reports                   → danh sách báo cáo đã tạo
GET  /api/v1/reports/{id}/download     → tải PDF
```

---

## 16. Kế Hoạch Triển Khai (4 Phase)

### Phase 1 — Core Backend (2-3 tuần)
- [ ] Setup project StationMonitor.Backend (ASP.NET Core 8)
- [ ] Docker Compose: TimescaleDB + Backend + go2rtc
- [ ] Database migrations — 17 bảng + hypertable + index
- [ ] PLC Polling Worker (snap7) — đọc sensor thật từ PLC
- [ ] REST API: /points, /alerts, /history
- [ ] SignalR real-time → Frontend nhận data live
- [ ] JWT auth + phân quyền 3 cấp (Operator / Manager / Admin)
- [ ] AuditMiddleware + LoginLog

### Phase 2 — Alert & Rule Engine (1-2 tuần)
- [ ] Rule Engine: AND/OR conditions, ngưỡng nhiệt độ, tốc độ tăng nhiệt
- [ ] Alert lifecycle: trigger → ACK → close (đầy đủ state machine)
- [ ] AlertHistory ghi mọi thay đổi trạng thái
- [ ] Firebase FCM push notification đến mobile
- [ ] Email alert (MailKit) + NotifyLog
- [ ] Âm thanh cảnh báo trên frontend (Audio API)

### Phase 3 — Cloud Sync, Storage & Reports (1-2 tuần)
- [ ] StorageMonitorWorker — adaptive retention, giữ tối thiểu 30 ngày
- [ ] CloudSyncWorker — batch 5 phút + event-driven cho alert
- [ ] SyncConflictResolver — xử lý xung đột sau mất mạng
- [ ] Federated Query — truy ngược lịch sử từ cloud
- [ ] PDF report generator (QuestPDF)
- [ ] ReportSchedulerWorker (Hangfire)
- [ ] IEC-60870-5-104 kết nối Trung tâm điều độ
- [ ] StationMonitor.Cloud — Supabase Edge Functions + Cloudflare Workers
- [ ] Mobile app lấy data từ cloud khi ngoài LAN

### Phase 4 — AI, Analytics & Scale (2-3 tuần)
- [ ] Python AI gRPC sidecar (YOLO + TensorRT)
- [ ] thermal_analyzer, pd_detector chạy trên Jetson GPU
- [ ] detection_events → rule engine → alert tự động từ AI
- [ ] EarlyWarningWorker — phân tích xu hướng mỗi 30 phút
- [ ] HealthScoreCalculator — điểm sức khỏe thiết bị 0-100
- [ ] MultiSensorCorrelator — phát hiện nhiệt + PD đồng thời
- [ ] Modbus sensors
- [ ] PTZ ONVIF control API
- [ ] Multi-station support từ cloud dashboard

---

---

## 17. DevOps & Vận Hành

### Health Checks — Tự biết khi nào có vấn đề

```
GET /health          → Tổng trạng thái (Healthy / Degraded / Unhealthy)
GET /health/live     → Service còn sống không (Docker dùng để restart)
GET /health/ready    → Sẵn sàng nhận request chưa (DB connected?)
```

```csharp
// Kiểm tra từng thành phần
DatabaseHealthCheck   → ping TimescaleDB
PlcHealthCheck        → ping PLC connection
AiEngineHealthCheck   → ping gRPC Python AI sidecar
Go2RtcHealthCheck     → ping go2rtc port 1984
```

### Docker — Auto restart khi crash

```yaml
# docker-compose.prod.yml
services:
  backend:
    restart: unless-stopped
    healthcheck:
      test: curl -f http://localhost:5000/health/live
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  timescaledb:
    restart: unless-stopped
    healthcheck:
      test: pg_isready -U postgres
      interval: 10s
      retries: 5
```

### Logging — Structured JSON với Serilog

```json
{
  "timestamp": "2026-04-01T03:15:22Z",
  "level": "Warning",
  "module": "PlcPollingWorker",
  "message": "PLC connection lost, retry 2/5",
  "station_id": "abc-123",
  "traceId": "xyz-789"
}
```

- Mọi log có `module`, `station_id`, `traceId` → grep nhanh khi có lỗi
- Lưu ra file `/logs/app-{date}.log` + stdout (Docker logs)
- Log level per module: Production dùng Warning+, Dev dùng Debug

### Metrics — Prometheus + Grafana (tùy chọn)

```
GET /metrics  → Prometheus scrape

Metrics theo dõi:
- plc_poll_duration_ms         → PLC poll mất bao lâu
- sensor_readings_per_second   → throughput dữ liệu
- alert_queue_size             → queue xử lý cảnh báo
- sync_queue_pending           → bao nhiêu record chờ sync
- db_connection_pool_used      → DB connections đang dùng
- disk_usage_percent           → dung lượng SSD Jetson
```

---

## 18. Bảo Mật (Nội Bộ LAN)

### Phân tầng bảo mật

```
LAN trạm (nội bộ):
├── HTTP ok (không cần HTTPS trong LAN kín)
├── JWT bắt buộc cho mọi request
├── Phân quyền theo role + station_id
└── Rate limiting: max 100 req/phút per IP

Cloud API (qua internet):
├── HTTPS bắt buộc (Supabase, FCM, R2)
├── JWT hoặc API Key
└── TLS 1.2+

Bên thứ 3 EVN SCADA:
├── API Key riêng biệt (không dùng JWT user)
├── Chỉ đọc, không ghi
└── Giới hạn IP whitelist (nếu cần)
```

### Thêm vào Services/Security/

```
RateLimitService.cs   → max request/phút per IP, chống loop bug
InputValidator.cs     → FluentValidation tất cả request body
SecretManager.cs      → Đọc secrets từ .env, không hardcode
```

### Secrets management

```bash
# .env.local (không commit git)
DB_PASSWORD=xxx
FIREBASE_KEY=xxx
SUPABASE_KEY=xxx
SNAP7_PLC_IP=192.168.1.50

# docker-compose đọc từ .env
environment:
  - DB_PASSWORD=${DB_PASSWORD}
```

### Thư viện bảo mật thêm

| Thư viện | Mục đích |
|---|---|
| **AspNetCore.RateLimit** | Rate limiting per IP |
| **FluentValidation** | Validate input request body |
| **AspNetCore.Authentication.JwtBearer** | JWT middleware |

---

## 19. Maintainability — Dễ Sửa Chữa

### Interface cho từng service — dễ swap, dễ test

```
StationMonitor.Data/Interfaces/
├── IPlcDataReader.cs       → swap snap7 → OPC-UA không ảnh hưởng Worker
├── IModbusDataReader.cs    → swap TCP → RTU không sửa gì khác
├── INotificationService.cs → swap FCM → SMS dễ dàng
├── IStorageService.cs      → swap local → S3 → R2
└── IAiEngineClient.cs      → swap Python AI → khác nếu cần
```

### Khi có lỗi — biết xem file nào

| Triệu chứng | Xem ở đâu |
|---|---|
| PLC không đọc được | `PlcPollingWorker.cs` + `PlcDataReader.cs` + `PlcHealthCheck.cs` |
| Alert không gửi FCM | `AlertNotifyWorker.cs` + `FcmPushService.cs` + `notify_log` table |
| Sync cloud chậm | `CloudSyncWorker.cs` + `sync_queue` table + `SyncConflictResolver.cs` |
| Báo cáo sai số liệu | `ReportGenerator.cs` + `SensorRepository.cs` |
| AI không phát hiện | `AiDetectionService.cs` + `ai_engine.py` + gRPC logs |
| Disk đầy bất ngờ | `StorageMonitorWorker.cs` + `media_files` table + `storage_warn_pct` setting |

### Error handling nhất quán

```csharp
// Mọi Worker đều theo pattern:
try {
    await DoWork();
} catch (PlcConnectionException ex) {
    _logger.LogWarning("PLC lost: {msg}", ex.Message);
    await _alertService.CreateSystemAlert("plc_offline", stationId);
    await Task.Delay(retryDelay);  // exponential backoff
} catch (Exception ex) {
    _logger.LogError(ex, "Unexpected error in {worker}", nameof(PlcPollingWorker));
    // không crash worker, log và tiếp tục
}
```

---

## 20. Scalability — Khả Năng Mở Rộng

### Connection Pooling

```
PostgreSQL: Npgsql pool size = 20 connections
gRPC AI:    1 channel dùng chung toàn app (không tạo mới mỗi request)
go2rtc:     1 instance phục vụ tất cả camera trong trạm
```

### Aggregate tables — Query nhanh khi data lớn

```sql
-- Thay vì query 10 triệu raw rows để vẽ chart 1 năm:
SELECT * FROM sensor_readings WHERE time > now() - interval '1 year'
-- → chậm (scan hàng triệu rows)

-- Dùng aggregate:
SELECT * FROM sensor_daily WHERE day > now() - interval '1 year'
-- → nhanh (chỉ 365 rows/device)
```

```
sensor_readings  → full resolution, giữ 90 ngày
sensor_hourly    → tổng hợp/giờ, giữ 1 năm     (DailyAggregator chạy mỗi giờ)
sensor_daily     → tổng hợp/ngày, giữ 10 năm   (DailyAggregator chạy 00:05)
```

### Thêm trạm mới — không sửa code

```bash
# Trạm mới chỉ cần:
1. Cài Docker trên Jetson mới
2. Copy .env với IP PLC + camera của trạm mới
3. docker compose up -d
# → Tự đăng ký lên Supabase → xuất hiện trên bản đồ đa trạm
```

### Thêm loại thiết bị mới — mở rộng qua Interface

```
Hiện tại: snap7 (S7), NModbus (Modbus)
Tương lai: OPC-UA, DNP3, PROFINET
→ Chỉ cần implement IPlcDataReader mới
→ Không sửa Worker, không sửa RuleEngine, không sửa DB
```

---

## 21. Tóm Tắt Kiến Trúc Hệ Thống Lớn

```
┌─────────────────────────────────────────────────────────────────────┐
│  THIẾT KẾ ĐỂ CHẠY ỔN ĐỊNH 24/7 KHÔNG NGƯỜI TRỰC                    │
│                                                                      │
│  Thu thập   → Workers poll 3-5s, không gián đoạn                   │
│  Xử lý      → RuleEngine + EarlyWarning tự động                    │
│  Thông báo  → Multi-channel: UI + FCM + Email + IEC104             │
│  Lưu trữ    → 2 tầng: Local 90 ngày + Cloud 10 năm                │
│  Phục hồi   → Docker restart, SyncQueue gửi bù, offline-first     │
│  Quan sát   → HealthCheck + Metrics + Structured Logs              │
│  Bảo mật    → JWT + RateLimit + Input validation + Secrets env     │
│  Mở rộng    → Interface pattern + Aggregate tables + Docker        │
│  Sửa chữa   → Module rõ ràng + Interface + Error pattern nhất quán│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 22. Toàn Bộ REST API Endpoints

> **Base URL tại trạm (LAN):** `http://<jetson-ip>:5000/api/v1`  
> **Base URL qua cloud:** `https://api.stationmonitor.vn/api/v1`  
> **Auth:** Header `Authorization: Bearer <JWT token>` — trừ `/auth/login`  
> **Phân quyền:** `[A]` = Admin | `[M]` = Manager | `[O]` = Operator | `[3]` = Third-party API Key

---

### 22.1 Auth — Xác thực

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `POST` | `/auth/login` | Đăng nhập → trả JWT + refresh token | Public |
| `POST` | `/auth/logout` | Hủy token hiện tại | Đã đăng nhập |
| `POST` | `/auth/refresh` | Gia hạn JWT bằng refresh token | Public |
| `PUT` | `/auth/change-password` | Đổi mật khẩu bản thân | Đã đăng nhập |
| `POST` | `/auth/fcm-token` | Đăng ký FCM token cho thiết bị mobile | Đã đăng nhập |
| `DELETE` | `/auth/fcm-token` | Hủy đăng ký FCM token khi logout mobile | Đã đăng nhập |
| `GET` | `/auth/me` | Thông tin tài khoản đang đăng nhập | Đã đăng nhập |

**Request login:**
```json
POST /auth/login
{ "username": "operator1", "password": "..." }

Response:
{ "accessToken": "eyJ...", "refreshToken": "...", "expiresIn": 3600,
  "user": { "id": "...", "fullName": "Nguyễn Văn A", "role": "operator", "stationIds": ["..."] } }
```

---

### 22.2 Stations — Trạm biến áp

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations` | Danh sách tất cả trạm + trạng thái tổng | O,M,A,3 |
| `GET` | `/stations/:id` | Chi tiết 1 trạm | O,M,A,3 |
| `POST` | `/stations` | Thêm trạm mới | A |
| `PUT` | `/stations/:id` | Cập nhật thông tin trạm | A |
| `DELETE` | `/stations/:id` | Xóa trạm (soft delete) | A |
| `GET` | `/stations/:id/dashboard` | Dashboard tổng hợp: sensor mới nhất + alerts đang mở + health score | O,M,A,3 |
| `GET` | `/stations/:id/status` | Trạng thái kết nối: PLC online/offline, camera online/offline | O,M,A |
| `GET` | `/stations/:id/health-score` | Điểm sức khỏe từng thiết bị (0–100) | O,M,A |

**Response `/stations/:id/dashboard`:**
```json
{
  "station": { "id": "...", "name": "TBA Bình Chánh 110kV", "status": "active" },
  "openAlerts": 2,
  "criticalAlerts": 0,
  "deviceCount": 12,
  "offlineDevices": 0,
  "latestReadings": [
    { "deviceId": "...", "deviceName": "MBA Chính", "pointName": "temp_phase_a", "value": 67.3, "unit": "°C", "ts": "..." }
  ],
  "healthScore": 84
}
```

---

### 22.3 Devices — Thiết bị

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/devices` | Danh sách thiết bị trong trạm | O,M,A |
| `GET` | `/stations/:sid/devices/:id` | Chi tiết thiết bị + cấu hình | M,A |
| `POST` | `/stations/:sid/devices` | Thêm thiết bị mới (PLC/cảm biến/camera) | A |
| `PUT` | `/stations/:sid/devices/:id` | Cập nhật cấu hình thiết bị | A |
| `DELETE` | `/stations/:sid/devices/:id` | Xóa thiết bị | A |
| `POST` | `/stations/:sid/devices/:id/test-connection` | Test kết nối thử đến thiết bị | A |
| `GET` | `/stations/:sid/devices/:id/status` | Trạng thái kết nối real-time | O,M,A |
| `PUT` | `/stations/:sid/devices/:id/maintenance` | Bật/tắt chế độ bảo trì (tạm dừng poll) | M,A |

---

### 22.4 Measurements — Dữ liệu đo lường

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/measurements/latest` | Giá trị đo mới nhất tất cả sensor trong trạm | O,M,A,3 |
| `GET` | `/stations/:sid/measurements/latest/:deviceId` | Giá trị mới nhất 1 thiết bị | O,M,A,3 |
| `GET` | `/stations/:sid/measurements/history` | Lịch sử theo khoảng thời gian | O,M,A,3 |
| `GET` | `/stations/:sid/measurements/aggregate` | Dữ liệu tổng hợp (hourly/daily) | O,M,A,3 |
| `GET` | `/stations/:sid/measurements/export` | Xuất CSV/Excel theo khoảng thời gian | M,A |
| `GET` | `/stations/:sid/measurements/stats` | Min/max/avg/stddev theo thời gian | O,M,A,3 |

**Query params `/measurements/history`:**
```
?deviceId=...&pointName=temp_phase_a
&from=2025-01-01T00:00:00Z&to=2025-01-07T00:00:00Z
&interval=5m          ← raw | 5m | 15m | 1h | 1d
&limit=1000
```

**Query params `/measurements/aggregate`:**
```
?deviceId=...&resolution=hourly|daily
&from=2025-01-01&to=2025-06-01
```

---

### 22.5 SLD — Sơ đồ một sợi

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/sld` | SVG sơ đồ một sợi phiên bản hiện tại | O,M,A |
| `GET` | `/stations/:sid/sld/versions` | Danh sách các phiên bản SVG đã upload | M,A |
| `GET` | `/stations/:sid/sld/:version` | SVG phiên bản cụ thể | M,A |
| `POST` | `/stations/:sid/sld` | Upload SVG mới (tạo version mới) | A |
| `GET` | `/stations/:sid/sld/points` | Tất cả điểm giám sát trên sơ đồ + giá trị hiện tại | O,M,A |
| `POST` | `/stations/:sid/sld/points` | Thêm điểm giám sát mới lên sơ đồ | A |
| `PUT` | `/stations/:sid/sld/points/:id` | Cập nhật vị trí/liên kết của điểm | A |
| `DELETE` | `/stations/:sid/sld/points/:id` | Xóa điểm giám sát | A |
| `GET` | `/stations/:sid/sld/realtime` | Tất cả điểm + giá trị real-time (polling) | O,M,A |

**Response `/sld/points`:**
```json
[
  {
    "id": "...", "label": "MBA Chính - Pha A",
    "x": 245.5, "y": 380.2, "radius": 8,
    "deviceId": "...", "pointName": "temp_phase_a",
    "value": 67.3, "unit": "°C", "status": "warning",
    "ts": "2025-04-01T10:30:00Z"
  }
]
```

---

### 22.6 Alerts — Cảnh báo

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/alerts` | Danh sách cảnh báo (filter theo status/level) | O,M,A,3 |
| `GET` | `/stations/:sid/alerts/:id` | Chi tiết cảnh báo + lịch sử xử lý | O,M,A |
| `POST` | `/stations/:sid/alerts/:id/ack` | Xác nhận đã nhận cảnh báo + ghi chú | O,M,A |
| `POST` | `/stations/:sid/alerts/:id/close` | Đóng cảnh báo + kết quả xử lý | M,A |
| `POST` | `/stations/:sid/alerts/:id/reopen` | Mở lại cảnh báo đã đóng | M,A |
| `POST` | `/stations/:sid/alerts/:id/assign` | Phân công cho người xử lý | M,A |
| `POST` | `/stations/:sid/alerts/:id/comment` | Thêm ghi chú xử lý (nhiều lần) | O,M,A |
| `GET` | `/stations/:sid/alerts/statistics` | Thống kê alert theo ngày/loại/level | M,A |
| `GET` | `/alerts/all` | Tất cả alert của tất cả trạm (đa trạm) | A |
| `GET` | `/alerts/open` | Alert đang mở toàn hệ thống | M,A |

**Query params `/alerts`:**
```
?status=open|acked|closed
&level=info|warning|alarm|critical
&source=rule|ai|manual
&from=...&to=...
&assignedTo=userId
&page=1&pageSize=20
```

**Request ACK:**
```json
POST /alerts/:id/ack
{ "note": "Đã cử người kiểm tra hiện trường lúc 10:35" }
```

---

### 22.7 Rules — Quy tắc cảnh báo

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/rules` | Danh sách rules trong trạm | M,A |
| `GET` | `/stations/:sid/rules/:id` | Chi tiết rule + lịch sử kích hoạt | M,A |
| `POST` | `/stations/:sid/rules` | Tạo rule mới | A |
| `PUT` | `/stations/:sid/rules/:id` | Cập nhật rule | A |
| `DELETE` | `/stations/:sid/rules/:id` | Xóa rule | A |
| `PUT` | `/stations/:sid/rules/:id/enable` | Bật rule | A |
| `PUT` | `/stations/:sid/rules/:id/disable` | Tắt rule (không xóa) | A |
| `POST` | `/stations/:sid/rules/:id/test` | Test rule với giá trị mẫu xem có trigger không | A |
| `GET` | `/stations/:sid/rules/:id/trigger-log` | Lịch sử rule đã trigger bao nhiêu lần | M,A |

**Request tạo rule:**
```json
POST /rules
{
  "name": "MBA Chính quá nhiệt nghiêm trọng",
  "deviceId": "...",
  "conditions": {
    "operator": "AND",
    "items": [
      { "pointName": "temp_phase_a", "op": ">", "value": 85, "unit": "°C" },
      { "pointName": "temp_phase_a", "op": "sustained", "duration": 300 }
    ]
  },
  "level": "critical",
  "actions": ["alert", "fcm", "email", "iec104"],
  "cooldown": 600
}
```

---

### 22.8 Detections — Kết quả AI

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/detections` | Danh sách detection events | O,M,A,3 |
| `GET` | `/stations/:sid/detections/:id` | Chi tiết event + ảnh + bounding box | O,M,A |
| `GET` | `/stations/:sid/detections/thermal` | Chỉ detection từ camera nhiệt | O,M,A |
| `GET` | `/stations/:sid/detections/pd` | Chỉ detection phóng điện | O,M,A |
| `GET` | `/stations/:sid/detections/intrusion` | Chỉ detection xâm nhập | O,M,A |
| `GET` | `/stations/:sid/detections/statistics` | Thống kê theo loại/ngày/camera | M,A |
| `GET` | `/stations/:sid/detections/:id/thermal-frame` | Ma trận nhiệt RAW (nếu có) | M,A |

**Query params `/detections`:**
```
?type=thermal|pd|intrusion
&cameraId=...
&from=...&to=...
&minConfidence=0.7
&hasAlert=true
&page=1&pageSize=20
```

---

### 22.9 Media — File ảnh & video clip

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/media` | Danh sách media files | O,M,A |
| `GET` | `/stations/:sid/media/:id` | Metadata file | O,M,A |
| `GET` | `/stations/:sid/media/:id/download` | Tải file gốc | O,M,A |
| `GET` | `/stations/:sid/media/:id/thumbnail` | Ảnh thu nhỏ (JPEG 256px) | O,M,A |
| `POST` | `/stations/:sid/media/upload` | Upload ảnh thủ công của kỹ thuật viên | O,M,A |
| `DELETE` | `/stations/:sid/media/:id` | Xóa file (chỉ file thủ công) | A |
| `GET` | `/stations/:sid/media/:id/sync-status` | Trạng thái sync lên Cloudflare R2 | A |

**Query params `/media`:**
```
?deviceId=...&type=image|video
&source=ai|manual
&from=...&to=...
&page=1&pageSize=30
```

---

### 22.10 Camera — Streaming & điều khiển

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/cameras` | Danh sách camera + stream URL | O,M,A |
| `GET` | `/stations/:sid/cameras/:id` | Chi tiết camera + stream URLs | O,M,A |
| `GET` | `/stations/:sid/cameras/:id/stream-urls` | WebRTC/HLS/MSE URLs từ go2rtc | O,M,A |
| `POST` | `/stations/:sid/cameras/:id/snapshot` | Chụp ảnh tức thì từ camera | O,M,A |
| `POST` | `/stations/:sid/cameras/:id/ptz` | Điều khiển PTZ (pan/tilt/zoom) — ONVIF | M,A |
| `POST` | `/stations/:sid/cameras/:id/ptz/preset/:presetId` | Di chuyển về preset đã lưu | M,A |
| `GET` | `/stations/:sid/cameras/:id/ptz/presets` | Danh sách preset PTZ | M,A |
| `POST` | `/stations/:sid/cameras/:id/ptz/presets` | Lưu vị trí hiện tại thành preset | A |
| `GET` | `/stations/:sid/cameras/:id/status` | Online/offline, FPS hiện tại | O,M,A |

**Response `/stream-urls`:**
```json
{
  "cameraId": "...", "cameraName": "Camera Nhiệt MBA Chính",
  "streams": {
    "webrtc": "http://192.168.1.10:1984/api/ws?src=thermal_main",
    "mse":    "http://192.168.1.10:1984/api/ws?src=thermal_main&mode=mse",
    "hls":    "http://192.168.1.10:1984/api/stream.m3u8?src=thermal_main"
  }
}
```

---

### 22.11 AI Models — Phiên bản model

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/ai-models` | Danh sách tất cả model versions đã deploy | A |
| `GET` | `/ai-models/active` | Model đang active theo từng loại | M,A |
| `POST` | `/ai-models` | Upload model version mới (metadata) | A |
| `PUT` | `/ai-models/:id/activate` | Set model này là active | A |
| `GET` | `/ai-models/:id/performance` | Accuracy, FPS, false positive rate | A |

---

### 22.12 Reports — Báo cáo

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/stations/:sid/reports` | Danh sách báo cáo đã tạo | M,A |
| `GET` | `/stations/:sid/reports/:id` | Metadata báo cáo | M,A |
| `GET` | `/stations/:sid/reports/:id/download` | Tải file PDF | M,A |
| `POST` | `/stations/:sid/reports/generate` | Tạo báo cáo thủ công | M,A |
| `GET` | `/stations/:sid/reports/schedule` | Lịch báo cáo tự động | A |
| `PUT` | `/stations/:sid/reports/schedule` | Cập nhật lịch báo cáo tự động | A |

**Request tạo báo cáo:**
```json
POST /reports/generate
{
  "type": "daily|monthly|event|cbm",
  "periodFrom": "2025-03-01T00:00:00Z",
  "periodTo": "2025-03-31T23:59:59Z",
  "sendEmail": true,
  "recipients": ["manager@evn.vn"]
}
```

---

### 22.13 Users — Quản lý tài khoản (Admin)

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/admin/users` | Danh sách tất cả người dùng | A |
| `GET` | `/admin/users/:id` | Chi tiết tài khoản | A |
| `POST` | `/admin/users` | Tạo tài khoản mới | A |
| `PUT` | `/admin/users/:id` | Cập nhật thông tin | A |
| `PUT` | `/admin/users/:id/role` | Đổi role | A |
| `PUT` | `/admin/users/:id/stations` | Cập nhật danh sách trạm được phân | A |
| `PUT` | `/admin/users/:id/deactivate` | Vô hiệu hóa tài khoản | A |
| `PUT` | `/admin/users/:id/reset-password` | Reset mật khẩu (gửi email) | A |

---

### 22.14 Audit & Logs — Nhật ký hệ thống

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/admin/audit-log` | Nhật ký thao tác toàn hệ thống | A |
| `GET` | `/admin/login-log` | Lịch sử đăng nhập + thất bại | A |
| `GET` | `/admin/notify-log` | Log FCM/Email đã gửi | A |
| `GET` | `/admin/audit-log/export` | Xuất CSV nhật ký theo khoảng thời gian | A |

**Query params `/audit-log`:**
```
?userId=...&action=ack_alert|update_rule|delete_device
&entityType=alert|device|rule|user
&from=...&to=...&page=1&pageSize=50
```

---

### 22.15 System Settings — Cài đặt hệ thống

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/admin/settings` | Tất cả cài đặt hệ thống | A |
| `GET` | `/admin/settings/:key` | Giá trị 1 key | A |
| `PUT` | `/admin/settings/:key` | Cập nhật giá trị | A |
| `PUT` | `/admin/settings/batch` | Cập nhật nhiều key cùng lúc | A |
| `GET` | `/admin/settings/storage` | Trạng thái lưu trữ: disk usage, retention policy | A |
| `GET` | `/admin/settings/sync-status` | Trạng thái sync cloud: last sync, queue size | A |

**Response `/settings/storage`:**
```json
{
  "diskTotal": "256GB", "diskUsed": "187GB", "diskPct": 73,
  "retentionDays": 90, "effectiveRetention": 90,
  "oldestRecord": "2024-10-15T00:00:00Z",
  "syncQueuePending": 3,
  "lastSyncSuccess": "2025-04-01T10:25:00Z"
}
```

---

### 22.16 Health & Metrics — Hệ thống

| Method | Endpoint | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/health` | Docker healthcheck — trả 200 nếu backend OK | Public |
| `GET` | `/health/detail` | Trạng thái từng component: DB, PLC, Cloud | A |
| `GET` | `/metrics` | Prometheus metrics (dùng cho Grafana) | Internal |
| `GET` | `/admin/system/info` | Version backend, uptime, platform | A |
| `GET` | `/admin/system/workers` | Trạng thái từng background worker | A |

**Response `/health/detail`:**
```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "healthy", "latencyMs": 4 },
    "plcConnection": { "status": "healthy", "devicesOnline": 3, "devicesOffline": 0 },
    "cloudSync": { "status": "healthy", "lastSyncAgo": "4m32s" },
    "aiEngine": { "status": "healthy", "fps": 28.5 },
    "go2rtc": { "status": "healthy", "activeCameras": 4 }
  }
}
```

---

### 22.17 WebSocket — SignalR Real-time

**Kết nối:** `ws://<host>:5000/ws/realtime`  
**Auth:** Gửi JWT trong query `?access_token=<JWT>` hoặc header

#### Events server → client

| Event | Payload | Khi nào |
|---|---|---|
| `alert:new` | `{ alertId, stationId, level, message, ts }` | Alert mới được tạo |
| `alert:acked` | `{ alertId, ackedBy, ts }` | Alert được ACK |
| `alert:closed` | `{ alertId, closedBy, ts }` | Alert được đóng |
| `sensor:update` | `{ stationId, deviceId, pointName, value, unit, ts }` | Giá trị đo cập nhật (mỗi 5s) |
| `device:status` | `{ deviceId, status: 'online'|'offline', ts }` | Thiết bị đổi trạng thái |
| `detection:new` | `{ eventId, type, cameraId, confidence, thumbnailUrl, ts }` | AI phát hiện sự kiện |
| `system:disk` | `{ diskPct, retentionDays }` | Cảnh báo disk đầy |
| `worker:status` | `{ workerName, status, message }` | Worker gặp lỗi |

#### Client → server (Join group)

```javascript
// Client tham gia nhận update của trạm cụ thể
connection.invoke("JoinStation", stationId);

// Rời group
connection.invoke("LeaveStation", stationId);
```

---

### 22.18 Third-party API — Tích hợp phần mềm ngoài

> Dùng **API Key** thay JWT. Header: `X-Api-Key: <key>`  
> Tạo API Key trong Admin → Settings → Integrations

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/v1/stations` | Danh sách trạm và trạng thái tổng |
| `GET` | `/v1/stations/:sid/points/latest` | Tất cả điểm đo mới nhất |
| `GET` | `/v1/stations/:sid/history` | Lịch sử dữ liệu theo thời gian |
| `GET` | `/v1/alerts` | Danh sách cảnh báo đang mở |
| `POST` | `/v1/alerts/:id/ack` | Xác nhận từ phần mềm ngoài |
| `GET` | `/v1/stations/:sid/reports/latest` | Báo cáo mới nhất |
| `WebSocket` | `/v1/ws/subscribe` | Subscribe nhận alert real-time |

> Phục vụ: phần mềm báo cáo EVN, hệ thống quản lý tài sản, SCADA tích hợp.

---

### 22.19 Tổng kết số lượng API

| Nhóm | Số endpoints | Ghi chú |
|---|---|---|
| Auth | 7 | Login, logout, refresh, FCM token |
| Stations | 8 | CRUD + dashboard + health |
| Devices | 8 | CRUD + test connection + maintenance |
| Measurements | 6 | Latest + history + aggregate + export |
| SLD | 9 | Upload SVG + quản lý điểm giám sát |
| Alerts | 10 | CRUD + ACK + close + comment + statistics |
| Rules | 9 | CRUD + enable/disable + test + log |
| Detections | 7 | Filter theo loại + thermal frame |
| Media | 7 | Upload + download + thumbnail |
| Camera | 9 | Stream URLs + PTZ + preset + snapshot |
| AI Models | 5 | Version management |
| Reports | 6 | Generate + download + schedule |
| Users (Admin) | 8 | CRUD + role + reset password |
| Audit & Logs | 4 | Audit + login + notify log |
| System Settings | 6 | Key-value + storage + sync status |
| Health & Metrics | 5 | Docker healthcheck + Prometheus |
| WebSocket | 8 events | SignalR real-time |
| Third-party | 6 | API Key auth |
| **Tổng** | **~128** | REST + WebSocket |

---

*Tài liệu này là kế hoạch kỹ thuật cho backend. Tham chiếu: phan1-tong-quan-he-thong.md, phan2-chuc-nang-phan-mem.md, phan3-ket-noi-giao-thuc.md, phan4-ha-tang-phan-cung.md*
