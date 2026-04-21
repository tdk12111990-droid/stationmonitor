# Module: Industrial Protocols

> Thu thập data từ PLC & thiết bị đo qua nhiều giao thức công nghiệp.

---

## Protocols hỗ trợ

| Protocol | Status | Use case | Library |
|----------|--------|----------|---------|
| Siemens S7 | ✅ Done | PLC S7-1200 (192.168.10.100) | S7NetPlus |
| Modbus TCP | ✅ Done | Power meter, PLC generic | NModbus |
| Modbus RTU | ✅ Done | RS485 qua USB adapter | NModbus.SerialPort |
| BACnet/IP | ✅ Done | BMS, HVAC | BACnet.Core |
| SNMP v2c/v3 | ✅ Done | Switch, UPS | SnmpSharpNet |
| IEC-60870-5-104 | 🔄 Planned (P2) | SCADA cao thế | IEC104.NET |
| DNP3 | ⏸ Backlog | Utility protocol | - |
| OPC UA | ⏸ Backlog | Modern PLC | - |

## Thành phần

| File | Vai trò |
|------|---------|
| `StationMonitor.Workers/Polling/PlcPollingWorker.cs` | Worker chính, đọc device config → chọn driver |
| `StationMonitor.Services/Protocol/S7Driver.cs` | Siemens S7 (DB read) |
| `StationMonitor.Services/Protocol/ModbusDriver.cs` | Modbus TCP/RTU |
| `StationMonitor.Services/Protocol/BacnetDriver.cs` | BACnet/IP |
| `StationMonitor.Services/Protocol/SnmpDriver.cs` | SNMP |
| `StationMonitor.Simulators/` | Mock server để test (19/19 tests pass) |

## Device config (JSONB)

Config stored trong `Devices.Config`:

```json
// S7-1200
{
  "protocol": "s7",
  "ip": "192.168.10.100",
  "rack": 0, "slot": 1,
  "points": [
    {"id": "P1", "db": 32, "offset": 0, "type": "int16", "scale": 0.1}
  ]
}

// Modbus TCP
{
  "protocol": "modbus-tcp",
  "ip": "192.168.10.50", "port": 502, "unitId": 1,
  "points": [
    {"id": "V", "register": 40001, "type": "float32"}
  ]
}

// BACnet
{
  "protocol": "bacnet",
  "ip": "192.168.10.60", "deviceInstance": 1234,
  "points": [
    {"id": "T1", "objectType": "analogInput", "instance": 0}
  ]
}
```

## Polling cycle

```
PlcPollingWorker (interval = device.PollIntervalSec, default 2s)
  ├── Foreach enabled device:
  │   ├── Pick driver theo protocol
  │   ├── Connect (pooled per device)
  │   ├── Read all points in 1 call (batch)
  │   └── INSERT SensorReadings
  └── On error → log + retry với exponential backoff
```

## JsonElement parsing

Config là JSONB → dùng helper:
```csharp
string GetString(JsonElement je, string key)
  => je.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";
int GetInt(JsonElement je, string key, int dflt = 0)
  => je.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : dflt;
```

## Simulators

`StationMonitor.Simulators/` chạy mock servers để dev/test không cần hardware:
```bash
cd backend/StationMonitor.Simulators
dotnet run -- --s7          # S7 mock tại :102
dotnet run -- --modbus      # Modbus tại :5020
dotnet run -- --bacnet      # BACnet tại :47808
```

Test suite: `node tests/api/test-protocol.mjs` → 19/19 pass.

## Đã xong

- [x] S7 driver (DB read int16/int32/float)
- [x] Modbus TCP + RTU
- [x] BACnet/IP (analogInput, analogValue)
- [x] SNMP v2c (OID read, Get/GetBulk)
- [x] Connection pooling + retry
- [x] Simulators cho 4 protocol

## Còn lại / Tương lai

- [ ] IEC-104 driver (phase P2) — cần cho SCADA cao thế
- [ ] DNP3 cho utility protocol (backlog)
- [ ] OPC UA modern PLC (backlog)
- [ ] Diagnostic page: quality code per point (good/bad/uncertain)
- [ ] Write support (hiện chỉ read) — cho remote control thiết bị
- [ ] Heartbeat/keepalive monitoring → auto-reconnect

## Known issues

- Modbus RTU timeout dài (1s) khi nhiều slave → cần tune `ReadTimeout`
- SNMP v3 authPriv chưa test kỹ với Cisco IOS
- BACnet broadcast trên multi-NIC có thể bị firewall Windows chặn

## Test

```bash
# Unit tests
cd backend && dotnet test --filter "FullyQualifiedName~Protocol"

# Integration với simulator
cd backend/StationMonitor.Simulators && dotnet run -- --modbus &
node tests/api/test-protocol.mjs
```
