# Module: Camera & Thermal Overlay

> Thu thập dữ liệu nhiệt + quang học từ camera Hikvision, hiển thị 10 điểm đo realtime trên video.

---

## Thành phần

| Thành phần | Vị trí | Vai trò |
|------------|--------|---------|
| `sdk-relay/enhanced_relay.py` | Python | Đọc thermal SDK (HCNetSDK.dll), push HTTP vào backend, đẩy RTSP lên go2rtc |
| `media-server/go2rtc.yaml` | go2rtc config | Nhận RTSP push, xuất WebRTC cho frontend |
| `StationMonitor.Api/Controllers/MeasurementsController.cs` | Backend | Nhận ingest (`POST /api/v1/measurements/ingest`) |
| `StationMonitor.Services/Camera/ThermalEvidenceService.cs` | Backend | Chụp snapshot + clip ffmpeg khi có alert |
| `frontend/src/pages/RealtimeMonitorPageV2.ts` | Frontend | Canvas overlay 10 điểm với letterbox correction |

## Luồng dữ liệu

```
Cam 152 (192.168.10.152)
  ├── Channel 101 (quang học, 1920×1080)
  └── Channel 201 (thermal, 384×288)
         │
         │ RTSP
         ▼
   enhanced_relay.py
     ├── HCNetSDK → 10 điểm nhiệt (JSON) → POST /api/v1/measurements/ingest
     └── RTSP push → go2rtc :8554 → WebRTC :1984

Backend
   ├── SensorReadings (TimescaleDB hypertable)
   ├── SignalR "SensorUpdate" → Frontend
   └── RuleEvaluationWorker (5s) → Alert + ThermalEvidenceService
```

## Canvas overlay — Letterbox correction

Thermal stream 384×288 (4:3) hiển thị trong cell 16:9 → có padding 2 bên.
Công thức trong `RealtimeMonitorPageV2.ts`:

```ts
const videoAspect = 384 / 288;             // 1.333
const cellAspect  = cellWidth / cellHeight;
const scale       = videoAspect / cellAspect;
const xOffset     = (1 - scale) / 2;
const screenX     = (xOffset + point.x * scale) * cellWidth;
```

10 điểm đo nằm trong khoảng `x = [0.05, 0.95]`, `y = [0.1, 0.9]` của ảnh thermal.

## Màu điểm theo rule

Cache trong `_thresholds` (map pointId → {warning, critical}):
- `value < warning` → xanh `#22c55e`
- `warning ≤ value < critical` → vàng `#eab308`
- `value ≥ critical` → đỏ `#ef4444`

`loadThresholds()` gọi `GET /api/v1/rules` lần đầu load, cache 30s.

## Alert pipeline (thermal)

1. `RuleEvaluationWorker` chạy mỗi 5s → query `SensorReadings` mới nhất
2. Với mỗi rule vi phạm → increment `confirm_count`
3. Khi `confirm_count ≥ camera_filter_time_s / 5` → tạo `Alert`
4. `ThermalEvidenceService`:
   - Snapshot: `GET http://localhost:1984/api/frame.jpeg?src={go2rtc_id}` → `wwwroot/evidence/{alertId}.jpg`
   - Clip: `ffmpeg -rtsp_transport tcp -i rtsp://... -t 10 wwwroot/evidence/{alertId}.mp4`
5. SignalR `AlertNew` → Toast + đánh dấu điểm đỏ

## Đã xong

- [x] Dual-device ingest (thermal + optical) từ cùng `enhanced_relay.py`
- [x] Canvas letterbox correction — điểm align đúng trong video
- [x] Màu xanh/vàng/đỏ theo rule (cache 30s)
- [x] `camera_filter_time_s` từ Settings áp dụng vào RuleEvaluationWorker
- [x] ThermalEvidenceService lưu ảnh vào `StationMonitor.Api/wwwroot/evidence/`
- [x] Fix crash `/api/v1/points` (GetInt16, IsDBNull)
- [x] Fix SignalR URL hardcode → full URL từ `API_BASE_URL`

## Còn lại / Tương lai

- [ ] Camera 153 (phóng điện) — tách luồng, không overlay điểm nhiệt
- [ ] ISAPI webhook từ camera → `CameraWebhookController` (motion, line crossing)
- [ ] Chuyển SDK sang Jetson (phase AI-1), giảm tải server Windows
- [ ] Retention evidence files (cron xóa > 30 ngày)

## Config keys

| Setting | Default | File |
|---------|---------|------|
| `camera_filter_time_s` | 10 | SystemSettings table |
| `RTSP_URL` | `rtsp://.../Streaming/Channels/201` | `sdk-relay/.env` |
| `Media.FFmpegPath` | `d:\StationMonitor\media-server\ffmpeg.exe` | `appsettings.json` |
| `Go2Rtc.ApiUrl` | `http://localhost:1984` | `appsettings.json` |

## Test

```bash
# Khởi động full stack
start.bat

# Kiểm tra relay đang push
curl http://localhost:1984/api/streams | jq '.camera_152_thermal'

# Kiểm tra ingest
curl -X POST http://localhost:5056/api/v1/measurements/ingest \
  -H "Content-Type: application/json" \
  -d '[{"deviceId":"...","pointId":"P1","value":85.5,"time":"2026-04-18T10:00:00Z"}]'

# Frontend → /realtime → xem 10 điểm đổi màu
```

## Known issues

Xem `backend/docs/KNOWN-ISSUES.md`:
- Letterbox offset sai nếu video chưa load metadata → gọi sau `loadedmetadata`
- SignalR auto-reconnect fail khi token expire → cần refresh trước khi connect lại
