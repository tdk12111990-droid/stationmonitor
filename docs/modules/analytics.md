# Module: Analytics, Reports & Health Score

> Truy vấn lịch sử, xuất báo cáo, tính điểm sức khỏe thiết bị.

---

## Thành phần

| Thành phần | Vị trí | Vai trò |
|------------|--------|---------|
| `AnalyticsController` | `StationMonitor.Api/Controllers` | Truy vấn time-series, thống kê |
| `StationMonitor.Analytics` | Project riêng | Queries phức tạp (downsample, gap-fill) |
| `ReportsController` | `StationMonitor.Api/Controllers` | Export PDF/XLSX |
| `HealthScoreWorker` | `StationMonitor.Workers/Quality` | Tính điểm hàng giờ |
| `EarlyWarningWorker` | `StationMonitor.Workers/Polling` | Detect trend tăng |

## Endpoints

```
GET /api/v1/analytics/history?pointId=...&from=...&to=...&bucket=5m
GET /api/v1/analytics/summary?deviceId=...&days=30
GET /api/v1/analytics/health/{deviceId}
GET /api/v1/reports/daily?date=2026-04-18
GET /api/v1/reports/alerts?from=...&to=...&format=pdf
```

## TimescaleDB hypertable

Bảng `SensorReadings` là hypertable:
```sql
SELECT create_hypertable('"SensorReadings"', 'Time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX ON "SensorReadings" ("PointId", "Time" DESC);
```

Downsample với `time_bucket`:
```sql
SELECT time_bucket('5 minutes', "Time") AS bucket,
       AVG("Value") AS avg, MAX("Value") AS max
FROM "SensorReadings"
WHERE "PointId" = @pid AND "Time" >= @from
GROUP BY bucket ORDER BY bucket;
```

## Health Score

Worker chạy mỗi giờ, tính điểm 0-100 cho mỗi device:

```
score = 100
  - 5  per warning alert trong 24h
  - 15 per critical alert trong 24h
  - 10 nếu > 1h không có data (offline)
  - 5  nếu có Delta-T giữa các pha > 10°C
```

Kết quả lưu trong `DeviceHealthScores` table, hiển thị ở Dashboard.

## Delta-T Logic

So sánh nhiệt độ giữa 3 pha (A/B/C) của cùng thiết bị:
- `|T_A - T_B| > 10°C` → bất thường → flag `delta_t_warning`
- Thường báo hiệu lệch pha, tiếp xúc kém

## Reports

| Loại | Endpoint | Output |
|------|----------|--------|
| Daily summary | `/reports/daily` | PDF — min/max/avg theo device |
| Alert history | `/reports/alerts` | PDF/XLSX — list alert + evidence link |
| Monthly report | `/reports/monthly` | PDF — xu hướng 30 ngày |
| Custom export | `/analytics/export` | CSV/XLSX raw |

Dùng QuestPDF cho PDF, ClosedXML cho XLSX.

## Đã xong

- [x] Time-series query với downsample (bucket tùy biến)
- [x] Export CSV/XLSX
- [x] Daily PDF report
- [x] HealthScoreWorker (cơ bản)
- [x] EarlyWarningWorker skeleton

## Còn lại / Tương lai

- [ ] EarlyWarningWorker: trend detection thực tế (linear regression 7 ngày)
- [ ] Delta-T alert dedicated (hiện chỉ hiển thị, chưa tạo alert)
- [ ] Compare mode: so sánh 2 device / 2 khoảng thời gian trên cùng chart
- [ ] Anomaly detection ML (phase AI — sau khi có Jetson)
- [ ] Continuous aggregates (TimescaleDB) cho query nhanh tháng/năm
- [ ] Scheduled report email (daily 7am, monthly 1st)

## Biểu đồ frontend

- `AnalyticsPage.ts` — Chart.js line chart, zoom, pan
- Legend: mỗi pointId 1 line, màu tự động
- Auto-refresh 30s nếu chọn "Live" mode

## Test

```bash
# Query history
curl "http://localhost:5056/api/v1/analytics/history?pointId=P1&from=2026-04-01&to=2026-04-18&bucket=1h"

# Export daily report
curl "http://localhost:5056/api/v1/reports/daily?date=2026-04-18" -o report.pdf
```

## Known issues

- Query > 30 ngày chậm nếu không có continuous aggregate
- PDF font tiếng Việt cần QuestPDF v2023.5+ với font fallback
