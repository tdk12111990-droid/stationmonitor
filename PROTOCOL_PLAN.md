# PROTOCOL_PLAN.md — Kế hoạch Tích hợp Giao thức & Cảm biến
> StationMonitor — Trạm biến áp 110kV không người trực
> Cập nhật: 2026-04-05

---

## 1. Bảng Protocol & Packages

### 1A. Industrial Protocols

| # | Protocol | Thiết bị thực tế | Port | .NET Package | Worker | Ưu tiên |
|---|----------|-----------------|------|--------------|--------|---------|
| 1 | **Siemens S7** (1200/1500/300) | PLC chính trạm | TCP 102 | `S7netplus 0.20.0` | `PlcPollingWorker` ✅ | P0 Done |
| 2 | **Modbus TCP** | PM800 đo điện, relay SEL | TCP 502 | `FluentModbus 5.1.2` | `ModbusTcpWorker` | P1 |
| 3 | **Modbus RTU** | Cảm biến RS485: dầu, ẩm | COM/RS485 | `FluentModbus` + `System.IO.Ports` | `ModbusRtuWorker` | P2 |
| 4 | **IEC 60870-5-104** | Trung tâm điều độ EVN | TCP 2404 | `lib60870.NET` (OSS) | `Iec104Worker` | P3 |
| 5 | **OPC-UA** | Thiết bị hiện đại | TCP 4840 | `OPCFoundation.NetStandard.Opc.Ua` | `OpcUaWorker` | P4 |
| 6 | **DNP3** | RTU cũ EVN | TCP 20000 | `Automatak.DNP3` | `Dnp3Worker` | P5 |

### 1B. Sensor Interfaces

| # | Loại | Thiết bị | Interface | Qua Worker nào |
|---|------|----------|-----------|----------------|
| 1 | **4–20mA** | Đo nhiệt độ dầu, áp suất SF6 | ADC gateway → Modbus RTU | `ModbusRtuWorker` |
| 2 | **PT100/PT1000** | Nhiệt độ cuộn dây MBA | RTD module RS485 | `ModbusRtuWorker` |
| 3 | **Thermocouple K/J** | Nhiệt độ tiếp điểm | TC module RS485 | `ModbusRtuWorker` |
| 4 | **RS485 Modbus RTU** | Relay bảo vệ, đồng hồ tại chỗ | COM port | `ModbusRtuWorker` |
| 5 | **LoRaWAN** | Cảm biến không dây tầm xa | MQTT (via LoRa gateway) | `MqttSubscriberWorker` |
| 6 | **Zigbee** | Cảm biến mesh | MQTT (Zigbee2MQTT) | `MqttSubscriberWorker` |
| 7 | **WiFi MQTT** | ESP32/ESP8266 IoT | MQTT broker | `MqttSubscriberWorker` |
| 8 | **1-Wire (DS18B20)** | Nhiệt độ điểm chạm | USB gateway → MQTT | `MqttSubscriberWorker` |

### 1C. Camera Protocols

| # | Protocol | Camera | Tích hợp | Ưu tiên |
|---|----------|--------|----------|---------|
| 1 | **RTSP** | Hikvision 152/153 | go2rtc → WebRTC ✅ | P0 Done |
| 2 | **ONVIF WS-Discovery** | Mọi camera IP chuẩn | UDP broadcast 3702, PTZ control | P2 |
| 3 | **Hikvision ISAPI** | Camera Hikvision | REST API, snapshot, event stream | P2 |
| 4 | **Dahua HTTP API** | Camera Dahua | REST API | P3 |
| 5 | **HTTP MJPEG** | Camera giá rẻ | HttpClient stream | P4 |

---

## 2. Kiến trúc Tổng thể

```
FIELD DEVICES (LAN 192.168.10.0/24)
  PLC S7-1200  ──TCP:102──┐
  Modbus meter ──TCP:502──┤
  RS485 sensor ──COM:────-┤
  IEC-104 RTU  ──TCP:2404─┤    POLLING WORKERS (.NET 8)
  OPC-UA node  ──TCP:4840─┤─▶  PlcPollingWorker     ─┐
  Camera RTSP  ──TCP:554──┤    ModbusTcpWorker      ─┤
  LoRa Gateway ──MQTT─────┤    ModbusRtuWorker      ─┤─▶ DataQualityPipeline
  Zigbee2MQTT  ──MQTT─────┘    MqttSubscriberWorker ─┤     │ Range check
                                Iec104Worker         ─┤     │ Spike detect
  Camera ONVIF ──UDP:3702──▶   OpcUaWorker          ─┘     │ Deadband filter
                                                             │ Moving average
                                                             ▼
                                                     SensorReadings (TimescaleDB)
                                                     Quality: 0=good 1=bad 2=uncertain
                                                             │
  AutoDiscoveryService ──────────────────────────▶  API + SignalR → Frontend
  ProtocolController (status + manual poll + scan)
```

---

## 3. Thứ tự Implement (Ưu tiên)

```
P1: ModbusTcpWorker      ← thiết bị phổ biến nhất tại trạm 110kV
P1: DataQualityPipeline  ← dùng cho tất cả worker
P1: CircuitBreaker       ← chống crash khi thiết bị mất điện
P2: ModbusRtuWorker      ← cảm biến RS485
P2: MqttSubscriberWorker ← cảm biến IoT/wireless
P2: Simulators project   ← test không cần phần cứng
P3: IEC-104 skeleton     ← bắt buộc với EVN
P3: OnvifService         ← camera PTZ + discovery
P4: AutoDiscoveryService ← scan mạng tự động
P4: OpcUaWorker          ← thiết bị hiện đại
P5: DnP3Worker           ← niche
```

---

## 4. Cấu trúc Thư mục

```
StationMonitor.Workers/
├── Polling/
│   ├── PlcPollingWorker.cs          ✅ S7
│   ├── ModbusTcpWorker.cs           ← P1
│   ├── ModbusRtuWorker.cs           ← P2
│   ├── MqttSubscriberWorker.cs      ← P2
│   ├── Iec104Worker.cs              ← P3
│   ├── OpcUaWorker.cs               ← P4
│   └── Dnp3Worker.cs                ← P5
├── Camera/
│   ├── OnvifService.cs              ← P3
│   ├── HikvisionIsapiService.cs     ← P3
│   └── DahuaApiService.cs           ← P4
├── Discovery/
│   ├── AutoDiscoveryService.cs      ← P4
│   └── ProtocolProbeService.cs      ← P4
└── Quality/
    ├── DataQualityPipeline.cs       ← P1 (dùng cho mọi worker)
    ├── CircuitBreaker.cs            ← P1
    ├── RangeValidator.cs            ← P1
    ├── DeadbandFilter.cs            ← P1
    ├── RateOfChangeChecker.cs       ← P1
    └── MovingAverageFilter.cs       ← P1

StationMonitor.Simulators/           ← Console app riêng
├── SimulatorBase.cs
├── ModbusTcpSimulator.cs
├── MqttSimulator.cs
├── Iec104Simulator.cs
└── Program.cs
```

---

## 5. Config JSONB theo loại Device

### Siemens S7 (đã có)
```json
{
  "ip": "192.168.10.100", "rack": 0, "slot": 1,
  "db": 32, "offset": 0, "length": 10, "cpu_type": "S71200",
  "poll_interval_ms": 3000
}
```

### Modbus TCP
```json
{
  "ip": "192.168.10.110", "port": 502, "unit_id": 1,
  "poll_interval_ms": 5000,
  "register_map": [
    { "point_id": "voltage_a", "address": 3000, "function": 4,
      "data_type": "float32_be", "unit": "V", "scale": 1.0 },
    { "point_id": "current_a", "address": 3002, "function": 4,
      "data_type": "float32_be", "unit": "A", "scale": 1.0 },
    { "point_id": "power_kw",  "address": 3004, "function": 4,
      "data_type": "int32_be",  "unit": "kW", "scale": 0.1 }
  ],
  "quality": {
    "range": { "voltage_a": { "min": 0, "max": 150000 } },
    "deadband": { "voltage_a": 100, "current_a": 0.5 },
    "spike_rate": { "voltage_a": 5000 },
    "stale_timeout_s": 30
  }
}
```

### Modbus RTU (RS485)
```json
{
  "com_port": "COM3", "baud_rate": 9600, "parity": "None",
  "data_bits": 8, "stop_bits": 1, "unit_id": 5,
  "poll_interval_ms": 10000,
  "register_map": [
    { "point_id": "oil_temp",  "address": 0, "function": 3,
      "data_type": "int16", "unit": "°C", "scale": 0.1 },
    { "point_id": "oil_level", "address": 1, "function": 3,
      "data_type": "uint16", "unit": "%", "scale": 0.1 }
  ]
}
```

### 4-20mA / PT100 / Thermocouple qua gateway ADC→Modbus
```json
{
  "ip": "192.168.10.115", "port": 502, "unit_id": 1,
  "gateway_type": "adam6017",
  "channels": [
    { "channel": 0, "point_id": "temp_winding_a", "sensor_type": "4_20ma",
      "unit": "°C", "raw_min": 3277, "raw_max": 16383, "eng_min": 0, "eng_max": 150 },
    { "channel": 1, "point_id": "temp_oil_top",   "sensor_type": "pt100",  "unit": "°C" },
    { "channel": 2, "point_id": "temp_core",       "sensor_type": "tc_k",   "unit": "°C" }
  ]
}
```

### MQTT (LoRa / Zigbee / WiFi)
```json
{
  "broker_ip": "192.168.10.1", "broker_port": 1883,
  "username": "station", "password": "mqtt_pass",
  "topic_prefix": "station/TBA001/sensor",
  "qos": 1, "keep_alive_s": 60,
  "auto_register_devices": true,
  "payload_format": "json",
  "payload_map": { "value_field": "value", "unit_field": "unit", "ts_field": "ts" }
}
```

### IEC 60870-5-104
```json
{
  "ip": "192.168.10.200", "port": 2404, "common_address": 1,
  "k": 12, "w": 8, "t0": 30, "t1": 15, "t2": 10, "t3": 20,
  "mode": "controlling",
  "enabled": false,
  "data_objects": [
    { "point_id": "voltage_a", "ioa": 1001, "type_id": 13 },
    { "point_id": "current_a", "ioa": 1002, "type_id": 13 }
  ]
}
```

### OPC-UA
```json
{
  "endpoint_url": "opc.tcp://192.168.10.120:4840/",
  "security_policy": "None",
  "username": "opcuser", "password": "opc_pass",
  "poll_interval_ms": 5000,
  "node_ids": [
    { "point_id": "voltage_a", "node_id": "ns=2;s=Station.Transformer.VoltageA", "unit": "V" },
    { "point_id": "temperature", "node_id": "ns=2;i=1234", "unit": "°C" }
  ]
}
```

### Camera RTSP + ONVIF (mở rộng)
```json
{
  "ip": "192.168.10.152", "rtsp_path": "/Streaming/Channels/101",
  "username": "admin", "password": "Demo@2024",
  "go2rtc_id": "camera_152_normal",
  "protocol": "hikvision",
  "onvif_port": 80,
  "snapshot_url": "/ISAPI/Streaming/channels/1/picture",
  "ptz_enabled": true,
  "motion_detection": true
}
```

---

## 6. Data Quality Pipeline

### Pipeline theo thứ tự (mọi giá trị đều qua đây)

| Bước | Check | Hành động fail | Ghi DB? |
|------|-------|---------------|---------|
| 1 | CRC/Checksum (Modbus tự handle) | Quality=1 Bad, skip | Không |
| 2 | Range validation (min/max config) | Quality=2 Uncertain | Có |
| 3 | Rate-of-change spike check | Quality=2 Uncertain | Có |
| 4 | Deadband filter | Bỏ qua (unchanged) | Không |
| 5 | Moving average (window N) | Lưu `{pointId}_avg` | Có |
| 6 | Stale detection | Tạo Alert, Quality=2 | Có |

### Config quality trong Device.Config JSONB
```json
"quality": {
  "range":        { "pointId": { "min": -10, "max": 120 } },
  "deadband":     { "pointId": 0.5 },
  "spike_rate":   { "pointId": 10.0 },
  "moving_avg_window": 5,
  "stale_timeout_s": 30
}
```

---

## 7. Error Handling Strategy

### Retry với Exponential Backoff
```
Attempt 1: 1s → 2: 2s → 3: 4s → 4: 8s → 5: 16s → max 60s + jitter ±20%
```

### Circuit Breaker (per Device)
```
CLOSED ──5 lỗi liên tiếp──▶ OPEN ──30s timeout──▶ HALF-OPEN ──success──▶ CLOSED
                                                        │──fail──▶ OPEN
```

### Fallback to Last-Known-Good
- Giữ giá trị cuối cùng Quality=Good trong memory cache
- Trả về với flag `stale=true` qua SignalR
- Frontend hiển thị màu xám + "⚠ dữ liệu cũ (Xs trước)"

### Alert khi mất kết nối
```
> 10s offline → Alert warning "Thiết bị {name} không phản hồi"
> 60s offline → Alert alarm   "Mất kết nối {name} quá 1 phút"
Reconnect     → Auto-close alert + ghi AlertHistory
```

### Dead Letter Queue
- DB ngắt → đẩy vào circular buffer 10,000 entries
- Retry khi DB phục hồi
- Buffer đầy → drop oldest + log warning

---

## 8. Simulators Setup

### Modbus TCP Simulator
```bash
# Chạy simulator (giả lập PM800 đo điện)
dotnet run --project StationMonitor.Simulators -- modbus-tcp --port 502

# Kết nối worker đến simulator
# Device.Config: { "ip": "127.0.0.1", "port": 502, "unit_id": 1, ... }
```

### MQTT Simulator
```bash
# Cần Mosquitto broker chạy local
mosquitto -p 1883

# Chạy MQTT publisher giả
dotnet run --project StationMonitor.Simulators -- mqtt --broker 127.0.0.1

# Topics: station/TBA001/sensor/temp_oil → {"value":65.3,"unit":"°C","ts":1712345678}
```

### IEC-104 Simulator
```bash
dotnet run --project StationMonitor.Simulators -- iec104 --port 2404 --ca 1
```

### Modbus RTU Simulator (cần com0com)
```
1. Tải com0com: https://sourceforge.net/projects/com0com/
2. Cài và tạo virtual COM pair: COM10 ↔ COM11
3. Worker kết nối COM10, simulator chạy COM11
dotnet run --project StationMonitor.Simulators -- modbus-rtu --port COM11
```

### Camera RTSP Simulator
```bash
# Cần ffmpeg
ffmpeg -re -loop 1 -i test_image.jpg -vf "drawtext=text='%{localtime}'" \
       -f rtsp rtsp://localhost:8554/sim_cam

# go2rtc config thêm: sim_cam: rtsp://localhost:8554/sim_cam
```

---

## 9. API Endpoints Mới

```
GET  /api/v1/protocol/status              → trạng thái tất cả workers + circuit state
POST /api/v1/protocol/discover            → kích hoạt auto-discovery scan
POST /api/v1/protocol/{deviceId}/poll     → manual poll ngay lập tức

GET  /api/v1/discovery/scan?subnet=192.168.10   → ping sweep
GET  /api/v1/discovery/probe?ip=192.168.10.110  → protocol probe 1 IP
POST /api/v1/discovery/onvif                    → ONVIF WS-Discovery broadcast

POST /api/v1/cameras/{id}/snapshot        → chụp ảnh ngay
POST /api/v1/cameras/{id}/ptz/move        → PTZ { pan, tilt, zoom }
GET  /api/v1/cameras/{id}/onvif/info      → ONVIF device info
```

---

## 10. Packages cần cài

```bash
# Workers project
dotnet add StationMonitor.Workers package FluentModbus       --version 5.1.2
dotnet add StationMonitor.Workers package MQTTnet            --version 4.3.6.1186
dotnet add StationMonitor.Workers package System.IO.Ports    --version 8.0.0

# lib60870 (IEC-104): clone từ https://github.com/mz-automation/lib60870
# Sau đó: dotnet add StationMonitor.Workers reference ../lib60870/lib60870.NET/lib60870

# OPC-UA (P4)
dotnet add StationMonitor.Workers package OPCFoundation.NetStandard.Opc.Ua --version 1.4.372.395
```
