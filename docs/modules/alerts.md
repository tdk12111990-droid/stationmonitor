# Module: Rule Engine & Alerts

> Đánh giá ngưỡng realtime, tạo cảnh báo, gửi email, lưu bằng chứng.

---

## Thành phần

| Thành phần | Vị trí | Vai trò |
|------------|--------|---------|
| `RulesController` | `StationMonitor.Api/Controllers` | CRUD rule (`/api/v1/rules`) |
| `AlertsController` | `StationMonitor.Api/Controllers` | List/ack/close (`/api/v1/alerts`) |
| `RuleEvaluationWorker` | `StationMonitor.Workers/Polling` | Đánh giá mỗi 5s |
| `EarlyWarningWorker` | `StationMonitor.Workers/Polling` | Cảnh báo sớm (trend 7 ngày) |
| `EmailService` | `StationMonitor.Services/Email` | SMTP Gmail |
| `ThermalEvidenceService` | `StationMonitor.Services/Camera` | Snapshot + clip khi alert |

## Cấu trúc Rule

```json
{
  "id": "uuid",
  "deviceId": "uuid",
  "pointId": "P1",
  "name": "Nhiệt độ cao - pha A",
  "expression": "value > 85",
  "warningThreshold": 75,
  "criticalThreshold": 85,
  "hysteresis": 2,
  "cooldownMinutes": 5,
  "enabled": true
}
```

## Pipeline

```
SensorReadings (TimescaleDB)
        │
        ▼ (mỗi 5s)
RuleEvaluationWorker
  ├── Load rules enabled
  ├── Load latest reading per point (DISTINCT ON)
  ├── Evaluate expression
  │   ├── Pass → reset confirm_count
  │   └── Fail → confirm_count++
  └── confirm_count ≥ camera_filter_time_s / 5
        │
        ▼
   Alert (status=open)
        │
        ├── ThermalEvidenceService → snapshot + clip
        ├── EmailService → gửi admin + subscribed users
        └── SignalR "AlertNew" → Frontend toast
```

## Hysteresis & Cooldown

**Hysteresis**: giá trị phải giảm dưới `threshold - hysteresis` mới coi là "hết alert" — tránh flapping khi value dao động quanh ngưỡng.

**Cooldown**: sau khi close alert, rule bị tắt trong `cooldownMinutes` để tránh spam cùng 1 sự kiện.

## Trạng thái Alert

| Status | Mô tả | Ai set |
|--------|-------|--------|
| `open` | Mới tạo | Worker |
| `acknowledged` | User đã xem | `POST /api/v1/alerts/{id}/ack` |
| `closed` | User đóng hoặc value hết vi phạm | `POST /api/v1/alerts/{id}/close` hoặc Worker |

## Đã xong

- [x] CRUD rules (warning/critical/hysteresis/cooldown)
- [x] RuleEvaluationWorker với confirm delay theo Settings
- [x] ThermalEvidenceService — ảnh + clip 10s tự động
- [x] Email notification qua SMTP Gmail
- [x] SignalR realtime toast
- [x] Alert history filter theo device/severity/time

## Còn lại / Tương lai

- [ ] Hysteresis reset logic bị gap khi value dao động nhanh — cần kiểm tra
- [ ] EarlyWarningWorker: phát hiện trend tăng 7 ngày → cảnh báo sớm trước khi tới critical
- [ ] Multi-channel notify (Telegram, Zalo) — hiện chỉ email
- [ ] Alert grouping (gộp các alert cùng device trong 1h)
- [ ] Auto-close alert khi value về normal > 5 phút (giảm tải ack thủ công)

## Config keys (SystemSettings)

| Key | Default | Mục đích |
|-----|---------|----------|
| `camera_filter_time_s` | 10 | Confirm delay trước khi tạo alert (giây) |
| `email_enabled` | true | Bật/tắt gửi email |
| `email_recipients` | - | Danh sách CC (ngoài user subscribed) |
| `early_warning_days` | 7 | Window cho trend detection |

## Test

```bash
# Tạo rule
curl -X POST http://localhost:5056/api/v1/rules \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"deviceId":"...","pointId":"P1","warningThreshold":75,"criticalThreshold":85}'

# Inject value vượt ngưỡng
curl -X POST http://localhost:5056/api/v1/measurements/ingest \
  -d '[{"pointId":"P1","value":95,"time":"..."}]'

# Chờ 10s → check alert
curl http://localhost:5056/api/v1/alerts -H "Authorization: Bearer $TOKEN"
```

## Known issues

- Flapping alert khi value = threshold ± 0.1 → tăng hysteresis
- Email fail im lặng nếu SMTP auth sai → check log `EmailService`
