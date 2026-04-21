# Hướng dẫn Simulator & Protocol Test

## Cấu trúc

```
StationMonitor.Simulators/
├── Program.cs              # Entry point, xử lý args
├── ModbusTcpSimulator.cs   # Giả lập thiết bị Modbus TCP
├── MqttSimulator.cs        # Giả lập IoT sensor MQTT
├── Iec104Simulator.cs      # Giả lập IEC 60870-5-104 server
└── ProtocolTestRunner.cs   # Test suite (KHÔNG dùng database)

StationMonitor.Services/
├── ProtocolConnectionTester.cs  # Test kết nối từ backend API
├── AutoDiscoveryService.cs      # Tự động phát hiện thiết bị
└── Camera/
    ├── OnvifService.cs          # ONVIF WS-Discovery, snapshot, PTZ
    └── HikvisionIsapiService.cs # Hikvision ISAPI

StationMonitor.Workers/Quality/
├── DataQualityPipeline.cs  # Range → Spike → Deadband → MovingAvg
├── CircuitBreaker.cs       # Ngắt kết nối tự động khi lỗi liên tục
└── RetryHelper.cs          # Exponential backoff + jitter
```

---

## Chạy Simulator

> **Lưu ý:** Simulator KHÔNG ghi vào database, chỉ dùng để test kết nối.

```bash
cd backend

# Modbus TCP server tại port 502
dotnet run --project StationMonitor.Simulators -- modbus

# IEC-104 server tại port 2404  
dotnet run --project StationMonitor.Simulators -- iec104

# MQTT publisher (cần Mosquitto đang chạy)
dotnet run --project StationMonitor.Simulators -- mqtt

# Tất cả cùng lúc
dotnet run --project StationMonitor.Simulators -- all
```

### Modbus TCP Simulator — Registers

| Address | Tên điểm đo       | Scale | Unit |
|---------|-------------------|-------|------|
| HR[0]   | nhiệt_độ_pha_1    | ×0.1  | °C   |
| HR[2]   | nhiệt_độ_pha_3    | ×0.1  | °C   |
| HR[4]   | nhiệt_độ_pha_2    | ×0.1  | °C   |
| HR[6]   | độ_ẩm             | ×0.1  | %    |
| HR[8]   | phóng_điện_PD     | ×0.1  | dB   |
| HR[10]  | điện_áp           | ×0.1  | V    |
| HR[12]  | dòng_điện         | ×0.1  | A    |

### IEC-104 Simulator — Điểm đo

| IOA  | Tên             | Unit |
|------|-----------------|------|
| 1001 | nhiệt_độ_pha_1  | °C   |
| 1002 | nhiệt_độ_pha_2  | °C   |
| 1003 | nhiệt_độ_pha_3  | °C   |
| 2001 | công_suất       | MW   |
| 2002 | điện_áp         | kV   |
| 3001 | trạng_thái_cb   |      |

### MQTT Simulator — Topics

Format payload: `{ "device_id": "sensor-01", "point_id": "nhiet_do", "value": 72.5, "unit": "°C" }`

| Topic                            | Giá trị    |
|----------------------------------|------------|
| sensors/sensor-01/nhiet-do       | 60–90 °C   |
| sensors/sensor-01/do-am          | 30–85 %    |
| sensors/sensor-02/phong-dien     | 5–50 dB    |
| sensors/sensor-03/ap-suat        | 95–110 kPa |
| sensors/sensor-03/rung-dong      | 0–10 mm/s  |

---

## Chạy Test Suite

### 1. Simulator self-test (KHÔNG cần backend, KHÔNG cần DB)

```bash
cd backend

# Tất cả tests
dotnet run --project StationMonitor.Simulators -- test

# Chỉ test DataQualityPipeline + CircuitBreaker (nhanh, không cần network)
dotnet run --project StationMonitor.Simulators -- test quality

# Test Modbus TCP (tự khởi động server tại port 15020, test xong tự tắt)
dotnet run --project StationMonitor.Simulators -- test modbus

# Test IEC-104 (tự khởi động server tại port 12404)
dotnet run --project StationMonitor.Simulators -- test iec104

# Test MQTT (cần Mosquitto broker đang chạy)
dotnet run --project StationMonitor.Simulators -- test mqtt
```

Kết quả mẫu:
```
╔══════════════════════════════════════════════════╗
║   PROTOCOL TEST RUNNER — không ghi vào database  ║
╚══════════════════════════════════════════════════╝

📡 MODBUS TCP TESTS (port 15020)
──────────────────────────────────
  ✅ Modbus TCP: kết nối TCP
  ✅ Modbus TCP: đọc FC3 holding register
        Register[0] raw = 700 → giá trị 70.0°C
  ✅ Modbus TCP: đọc 7 registers
  ✅ Modbus TCP: unit ID khác vẫn phản hồi
  ✅ Modbus TCP: addr ngoài range → data trống hoặc zeros

──────────────────────────────────────────────────
  KẾT QUẢ: 5 PASS  |  0 FAIL  |  5 tổng
──────────────────────────────────────────────────
```

### 2. Backend unit tests

```bash
cd backend
dotnet test StationMonitor.Tests/StationMonitor.Tests.csproj
# → 47 PASS
```

### 3. Protocol API test (cần backend chạy)

```bash
# Terminal 1: khởi động simulator
cd backend
dotnet run --project StationMonitor.Simulators -- modbus

# Terminal 2: khởi động backend
start.bat

# Terminal 3: chạy API test
cd D:\StationMonitor
node test-protocol.mjs
```

---

## API Protocol Endpoints

| Method | Endpoint                          | Mô tả                                     |
|--------|-----------------------------------|-------------------------------------------|
| GET    | `/api/v1/protocols/serial-ports`  | Danh sách cổng COM trên máy chủ           |
| POST   | `/api/v1/protocols/test-connection` | Test kết nối thiết bị (không ghi DB)    |
| GET    | `/api/v1/protocols/scan?ip=X`     | Quét port + probe protocol tại IP X       |
| GET    | `/api/v1/protocols/discover`      | Ping sweep + port scan toàn subnet        |
| GET    | `/api/v1/protocols/discover-onvif`| WS-Discovery tìm camera ONVIF            |

### POST `/api/v1/protocols/test-connection`

```json
// Modbus TCP
{ "protocol": "modbus_tcp", "config": "{\"ip\":\"192.168.10.10\",\"port\":502,\"unit_id\":1}" }

// IEC-104
{ "protocol": "iec104", "config": "{\"ip\":\"192.168.10.50\",\"port\":2404}" }

// Siemens S7
{ "protocol": "s7", "config": "{\"ip\":\"192.168.10.100\"}" }

// Ping / TCP check
{ "protocol": "ping", "config": "{\"ip\":\"192.168.10.1\",\"port\":80}" }

// Modbus RTU (kiểm tra cổng COM)
{ "protocol": "modbus_rtu", "config": "{\"port\":\"COM3\"}" }
```

Response:
```json
{
  "success": true,
  "protocol": "modbus_tcp",
  "target": "192.168.10.10:502",
  "latencyMs": 12,
  "message": "Đọc thành công 8 holding registers trong 12ms",
  "points": [
    { "pointId": "HR[0]", "value": 700, "unit": "raw" }
  ]
}
```

---

## Cấu hình Device cho từng Protocol

### Modbus TCP

```json
{
  "ip": "192.168.10.10",
  "port": 502,
  "unit_id": 1,
  "poll_interval_ms": 3000,
  "registers": [
    { "address": 0, "count": 1, "point_id": "nhiet_do_pha_1", "scale": 0.1, "unit": "°C" },
    { "address": 2, "count": 1, "point_id": "nhiet_do_pha_3", "scale": 0.1, "unit": "°C" }
  ]
}
```

### Modbus RTU

```json
{
  "port": "COM3",
  "baud_rate": 9600,
  "parity": "None",
  "stop_bits": 1,
  "unit_id": 1,
  "poll_interval_ms": 5000,
  "registers": [
    { "address": 0, "count": 1, "point_id": "nhiet_do", "scale": 0.1, "unit": "°C" }
  ]
}
```

### MQTT (SystemSettings key: `mqtt_config`)

```json
{
  "broker": "192.168.10.200",
  "port": 1883,
  "client_id": "station-monitor",
  "station_id": "<guid-trạm>",
  "topics": ["sensors/#"]
}
```

### IEC-104

```json
{
  "ip": "192.168.10.50",
  "port": 2404,
  "ca": 1,
  "poll_interval_ms": 5000
}
```
