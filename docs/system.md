# Kiến trúc hệ thống — StationMonitor

> Tài liệu này tóm tắt kiến trúc và thiết kế hệ thống.
> Chi tiết đầy đủ xem tại `docs/archive/phan1-4*.md`.

---

## Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD (Supabase)                          │
│   Database dài hạn · API Gateway · Push Notification (FCM)      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS / WebSocket
┌──────────────────────▼──────────────────────────────────────────┐
│                   SERVER TẠI TRẠM (Windows PC)                  │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   sdk-relay/    │  │  backend/ (.NET) │  │  media-server/│  │
│  │ enhanced_relay  │  │  Port 5056       │  │  go2rtc :1984 │  │
│  │ Hikvision SDK   │  │  TimescaleDB     │  │  ffmpeg       │  │
│  │ 10 điểm nhiệt  │→│  SignalR Hub      │←│  RTSP→WebRTC  │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   frontend/ (Vite :5173)                  │   │
│  │  Dashboard · Camera · Alerts · Rules · Analytics         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────┘
                                   │ LAN nội bộ
┌──────────────────────────────────▼──────────────────────────────┐
│                       THIẾT BỊ TẠI TRẠM                         │
│                                                                  │
│  Camera 152 (192.168.10.152)     PLC Siemens S7-1200            │
│  ├── Channel 101: Quang học       (192.168.10.100)              │
│  └── Channel 201: Nhiệt (384×288) DB32.DBW0/2/4/6              │
│                                                                  │
│  Camera 153 (192.168.10.153)     Modbus TCP/RTU                 │
│  └── Phóng điện (PD)             BACnet, SNMP, IEC-104          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Luồng dữ liệu chính

### Nhiệt độ realtime (10 điểm)
```
Cam 152 → SDK (HCNetSDK.dll) → enhanced_relay.py
       → HTTP POST /api/v1/measurements/ingest
       → SignalR "SensorUpdate"
       → Frontend canvas overlay (màu xanh/vàng/đỏ theo rule)
```

### Alert pipeline
```
SensorReadings → RuleEvaluationWorker (mỗi 5s)
              → confirm N lần (camera_filter_time_s / 5)
              → Alert created → ThermalEvidenceService
              → go2rtc snapshot + ffmpeg clip
              → SignalR "AlertNew" → Toast UI
              → Email notify (SMTP Gmail)
```

### Video stream
```
Cam 152/153 → RTSP → go2rtc (push mode :8554)
            → WebRTC → Frontend <video> element
            → Canvas overlay (measurement points)
```

---

## Cấu hình quan trọng

| Thành phần | File config |
|------------|-------------|
| Backend ports, JWT, SMTP | `backend/StationMonitor.Api/appsettings.json` |
| go2rtc streams, ffmpeg | `media-server/go2rtc.yaml` |
| Python relay env vars | `sdk-relay/.env` hoặc OS env |
| Frontend API URL | `frontend/.env` (`VITE_API_URL`) |

### Env vars cho sdk-relay
```bash
CAMERA_IP=192.168.10.152
CAMERA_USER=admin
CAMERA_PASSWORD=Demo@2024
API_URL=http://localhost:5056/api/v1
WWWROOT_PATH=D:\StationMonitor\backend\StationMonitor.Api\wwwroot
```

---

## Phase tiếp theo — Jetson AI

Khi triển khai Jetson Nano:
- `jetson/` sẽ chứa model code (YOLOv8, anomaly detection)
- Jetson kết nối vào LAN, nhận RTSP từ camera 153
- Gửi DetectionEvent về backend qua `POST /api/v1/measurements/ingest`
- Xem chi tiết: `ROADMAP.md`

---

*Cập nhật lần cuối: 2026-04-18*
