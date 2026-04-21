# Module Structure — Cấu trúc file chi tiết

> Mỗi module gồm những file nào, ai phụ trách, dependencies giữa module.

---

## Module: Camera & Thermal Overlay

**Spec:** `docs/modules/camera.md`

### Backend files

```
backend/StationMonitor.Api/
├── Controllers/
│   ├── MeasurementsController.cs         POST /api/v1/measurements/ingest (nhận data từ relay)
│   └── CameraWebhookController.cs        GET ISAPI webhook từ camera (motion, line crossing)
├── Hubs/
│   └── RealtimeHub.cs                    SignalR "SensorUpdate" broadcast (10 điểm màu)

backend/StationMonitor.Services/
├── Camera/
│   ├── ThermalEvidenceService.cs         Chụp snapshot + ffmpeg clip khi alert
│   ├── Go2RtcService.cs                  Gọi go2rtc API lấy frame.jpeg
│   └── HikvisionSdkService.cs            (deprecated — logic move sang Python relay)

backend/StationMonitor.Workers/Polling/
├── RuleEvaluationWorker.cs               Đánh giá rule 5s, confirm delay từ camera_filter_time_s
└── PlcPollingWorker.cs                   (shared) Lấy dữ liệu từ relay ingest → SensorReadings

backend/StationMonitor.Data/
├── Entities/
│   ├── SensorReading.cs                  TimescaleDB hypertable (10 điểm × nhiều thiết bị)
│   ├── Device.cs                         Thiết bị (camera 152, 153, PLC, etc.)
│   ├── Point.cs                          10 điểm đo (P1-P10) trên device
│   └── Alert.cs                          Alert khi vượt rule
└── Migrations/
    └── *_AddThermalTables.cs             Hypertable cho SensorReadings
```

### Frontend files

```
frontend/src/
├── pages/
│   ├── RealtimeMonitorPageV2.ts          Canvas overlay 10 điểm (letterbox correction)
│   └── AlertsHistoryPage.ts              Xem danh sách alert (evidence ảnh + clip)
├── services/
│   ├── StationApiService.ts              GET /api/v1/points (lấy giá trị tức thời 10 điểm)
│   └── SignalRClient.ts                  Connect /ws/realtime, listen SensorUpdate event
├── utils/
│   └── ThermalOverlayUtils.ts            Hàm tính offset letterbox, vẽ điểm, màu rule
└── styles/
    └── realtime-monitor.css              Canvas + grid layout
```

### Config files

```
backend/StationMonitor.Api/
└── appsettings.json
    ├── "Media": { "FFmpegPath": "d:\\StationMonitor\\media-server\\ffmpeg.exe" }
    ├── "Go2Rtc": { "ApiUrl": "http://localhost:1984" }
    └── ConnectionStrings (DB connection)

media-server/
└── go2rtc.yaml
    ├── streams:
    │   ├── camera_152_normal: rtsp://192.168.10.152:554/Streaming/Channels/101
    │   ├── camera_152_thermal: rtsp://192.168.10.152:554/Streaming/Channels/201
    │   └── camera_153_pd: rtsp://192.168.10.153:554/Streaming/Channels/101
    └── bin: d:\StationMonitor\media-server\ffmpeg.exe

sdk-relay/
├── enhanced_relay.py                     Đọc SDK → ingest thermal + optical data
├── hikvision/
│   ├── hcnet_sdk.py                      Wrapper HCNetSDK.dll (ctypes)
│   └── camera_service.py                 Logic đọc 10 điểm
└── .env
    ├── CAMERA_IP=192.168.10.152
    ├── API_URL=http://localhost:5056/api/v1
    └── WWWROOT_PATH=D:\StationMonitor\backend\StationMonitor.Api\wwwroot
```

### Test files

```
tests/api/
└── test-api.mjs
    ├── Measurements ingest test
    ├── Points read test
    └── Alert creation test (rule trigger)

frontend/e2e/
├── camera.spec.ts                        E2E: overlay points, color by rule, click point
└── alerts.spec.ts                        E2E: alert list, evidence image
```

### Database tables

```
"SensorReadings"                           Hypertable (PointId, Time, Value, DeviceId)
  ├── Indexes: (PointId, Time DESC)
  └── Data retention: TimescaleDB policy (auto-drop > 2 years)

"Points"                                   Định danh 10 điểm (P1, P2, ..., P10)
  ├── PointId (PK)
  ├── DeviceId (FK)
  └── Name, Position (x,y trên SLD), Unit

"Devices"                                  Camera 152, 153, etc.
  ├── DeviceId (PK)
  ├── Config (JSONB): protocol, IP, port, points list
  └── Status: online/offline
```

### Dependencies

```
Camera module depends on:
  ├── Rule Engine (rule evaluation → alert)
  ├── Alerts (create alert record)
  ├── Realtime (SignalR broadcast)
  └── TimescaleDB (store readings)

Independent of:
  ├── Mobile app
  ├── Jetson AI
  └── Protocols (Modbus, etc.)
```

---

## Module: Rule Engine & Alerts

**Spec:** `docs/modules/alerts.md`

### Backend files

```
backend/StationMonitor.Api/
├── Controllers/
│   ├── RulesController.cs                POST/GET /api/v1/rules (CRUD rule)
│   └── AlertsController.cs               GET/POST /api/v1/alerts (ack, close, history)

backend/StationMonitor.Services/
├── Alert/
│   ├── RuleService.cs                    Evaluate rule expression (value > 85)
│   ├── AlertService.cs                   Create/update/close alert
│   └── EmailService.cs                   Gửi email notification (MailKit)

backend/StationMonitor.Workers/Polling/
└── RuleEvaluationWorker.cs               Core worker (5s cycle)
    ├── Load enabled rules
    ├── Get latest reading per point (DISTINCT ON)
    ├── Evaluate expression
    ├── Hysteresis check (clearValue)
    ├── Cooldown check
    ├── confirm_count++ khi fail
    └── Create Alert nếu confirm_count ≥ camera_filter_time_s / 5

backend/StationMonitor.Data/
├── Entities/
│   ├── Rule.cs                           (name, expression, warningThreshold, critical, hysteresis, cooldown)
│   └── Alert.cs                          (status: open/ack/closed, createdAt, confirmedAt)
└── Migrations/
    └── *_AddRuleEngine.cs
```

### Frontend files

```
frontend/src/
├── pages/
│   ├── RuleEnginePage.ts                 CRUD rule, toggle enable/disable, stats
│   └── AlertsHistoryPage.ts              Alert list, ack, close, detail, timeline
├── services/
│   └── StationApiService.ts              GET/POST /api/v1/rules, /alerts
└── components/
    └── RuleModal.ts                      Modal tạo/sửa rule
```

### Config files

```
backend/appsettings.json
├── "Email":
│   ├── "Host": "smtp.gmail.com"
│   ├── "Port": "587"
│   ├── "User": "..."
│   └── "Password": "..."
└── "Smtp": { ... }

SystemSettings table (database)
├── Key: "camera_filter_time_s", Value: "10"  (confirm delay)
├── Key: "email_enabled", Value: "true"
└── Key: "email_recipients", Value: "[...]"
```

### Test files

```
tests/api/
└── test-api.mjs
    ├── Create rule test
    ├── Rule evaluation (inject value > threshold)
    ├── Alert creation test
    ├── Ack/close alert test
    └── Email mock test
```

### Database tables

```
"Rules"
  ├── RuleId (PK), DeviceId (FK)
  ├── PointId, Expression, WarningThreshold, CriticalThreshold
  ├── Hysteresis, CooldownMinutes, Enabled
  └── CreatedAt, UpdatedAt

"Alerts"
  ├── AlertId (PK), RuleId (FK), PointId, DeviceId
  ├── Status (open/ack/closed)
  ├── Value (giá trị lúc trigger)
  ├── CreatedAt, ConfirmedAt, ClosedAt
  └── Evidence (path ảnh/clip)

"SystemSettings"
  ├── Key: "camera_filter_time_s", Value: "10"
  └── Mutable via PUT /api/v1/settings/{key}
```

### Dependencies

```
Rule Engine depends on:
  ├── Camera module (get latest SensorReadings)
  ├── Email service (notify)
  ├── ThermalEvidenceService (capture ảnh)
  └── SignalR (broadcast AlertNew)

Independent of:
  ├── Protocols
  └── Jetson AI
```

---

## Module: Analytics & Reports

**Spec:** `docs/modules/analytics.md`

### Backend files

```
backend/StationMonitor.Api/
├── Controllers/
│   ├── AnalyticsController.cs            GET /api/v1/analytics/history (time-series)
│   └── ReportsController.cs              GET /api/v1/reports/daily, alerts (PDF/XLSX)

backend/StationMonitor.Services/
├── Analytics/
│   ├── AnalyticsService.cs               Query TimescaleDB (time_bucket, downsample)
│   ├── ReportsService.cs                 Generate PDF (QuestPDF) + XLSX (ClosedXML)
│   └── LoadCorrelationAnalyzer.cs        CBM logic (thermal vs load)

backend/StationMonitor.Analytics/
└── (Dedicated project)
    ├── TimeSeriesQuery.cs
    ├── CorrelationAnalyzer.cs
    └── HealthScoreCalculator.cs

backend/StationMonitor.Workers/Quality/
├── HealthScoreWorker.cs                  Tính score 0-100 hàng giờ
└── EarlyWarningWorker.cs                 Trend detection (skeleton)
```

### Frontend files

```
frontend/src/
├── pages/
│   ├── AnalyticsPage.ts                  6 tabs: trend, correlation, health, export
│   └── ReportsPage.ts                    Generate + download PDF/XLSX
├── components/
│   └── ChartComponent.ts                 Chart.js double-axis chart
└── services/
    └── StationApiService.ts              GET analytics endpoints
```

### Config files

```
backend/appsettings.json
├── "TimescaleDB": { "DataRetentionDays": 730 }
└── "ReportSettings": { "TimeZone": "+07:00" }
```

### Test files

```
tests/api/
└── test-api.mjs
    ├── Analytics history query test (5m bucket)
    ├── Correlation test
    ├── Health score calculation test
    └── Report export test
```

### Database tables

```
"SensorReadings"
  └── Hypertable với DISTINCT ON (PointId, Time DESC) — fast trend query

"DeviceHealthScores"
  ├── DeviceId, Score (0-100), CalculatedAt
  └── Penalty breakdown (warnings, criticals, delta_t, offline)

"EarlyWarnings"
  ├── DeviceId, PointId, TrendType (rising, falling)
  ├── ProjectedDaysToThreshold
  └── CreatedAt
```

### Dependencies

```
Analytics depends on:
  ├── Camera module (SensorReadings data)
  ├── Rule Engine (Alert history)
  ├── TimescaleDB (hypertable, time_bucket)
  └── Email (scheduled report)

Independent of:
  ├── Protocols
  └── Jetson AI
```

---

## Module: Industrial Protocols

**Spec:** `docs/modules/protocols.md`

### Backend files

```
backend/StationMonitor.Services/Protocol/
├── IProtocolDriver.cs                    Interface
├── S7Driver.cs                           Siemens S7-1200 (S7NetPlus)
├── ModbusDriver.cs                       Modbus TCP/RTU (NModbus)
├── BacnetDriver.cs                       BACnet/IP (BACnet.Core)
├── SnmpDriver.cs                         SNMP v2c/v3 (SnmpSharpNet)
└── IEC104Driver.cs                       (Skeleton — phase P2)

backend/StationMonitor.Workers/Polling/
├── PlcPollingWorker.cs                   Main worker (per device, pick driver by protocol)
└── ProtocolConnectionTester.cs           Diagnostic (test connect, read test value)

backend/StationMonitor.Api/
└── Controllers/
    ├── ProtocolController.cs             GET /api/v1/protocol/test (test connection)
    └── DevicesController.cs              Config device với protocol + params
```

### Frontend files

```
frontend/src/
├── pages/
│   └── DeviceManagementPage.ts           3-tab discovery modal (LAN scan, ONVIF, test)
└── components/
    └── ProtocolConfigModal.ts            Form cấu hình S7/Modbus/BACnet/SNMP
```

### Config files

```
Device.Config (JSONB trong database)
├── S7:
│   { "protocol": "s7", "ip": "192.168.10.100", "rack": 0, "slot": 1,
│     "points": [{"id": "P1", "db": 32, "offset": 0, "type": "int16"}] }
├── Modbus:
│   { "protocol": "modbus-tcp", "ip": "192.168.10.50", "port": 502,
│     "points": [{"id": "V", "register": 40001, "type": "float32"}] }
└── BACnet:
    { "protocol": "bacnet", "ip": "192.168.10.60", "deviceInstance": 1234,
      "points": [{"id": "T1", "objectType": "analogInput", "instance": 0}] }
```

### Test files

```
tests/api/
└── test-protocol.mjs                     19 tests (19/19 PASS)
    ├── S7 read/write
    ├── Modbus TCP/RTU
    ├── BACnet discover + read
    └── SNMP Get/GetBulk

backend/StationMonitor.Simulators/
├── S7Simulator.cs                        Mock S7 server :102
├── ModbusSimulator.cs                    Mock Modbus :5020
├── BacnetSimulator.cs                    Mock BACnet :47808
└── SnmpSimulator.cs                      Mock SNMP :5161
```

### Dependencies

```
Protocols depends on:
  ├── Camera module (device configuration)
  ├── Analytics (store readings)
  └── Alerts (trigger rules)

Independent of:
  ├── Mobile app
  └── Jetson AI
```

---

## Summary — Module Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│          TimescaleDB (central data lake)            │
└────────┬──────────────┬──────────────┬──────────────┘
         │              │              │
    ┌────▼────┐  ┌─────▼─────┐  ┌────▼─────┐
    │ Camera  │  │ Protocols │  │ Analytics│
    └────┬────┘  └─────┬─────┘  └────┬─────┘
         │             │             │
         ▼             ▼             ▼
    ┌──────────────────────────────────┐
    │      Rule Engine & Alerts        │
    │    (RuleEvaluationWorker)        │
    └──────┬──────────────┬────────────┘
           │              │
           ▼              ▼
      SignalR         Email Service
      (realtime)      (notification)
           │              │
           ▼              ▼
    ┌──────────────────────────────────┐
    │   Frontend Dashboard & Mobile    │
    └──────────────────────────────────┘
```

**Ngoài tương tác:** Jetson AI (gRPC), Supabase (cloud sync), Authentication (JWT).
