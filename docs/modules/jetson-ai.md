# Module: Jetson AI (Planned)

> Chuyển workload AI + SDK relay lên Jetson Orin Nano, giảm tải server Windows.

---

## Tại sao Jetson?

| Vấn đề hiện tại | Giải pháp Jetson |
|-----------------|------------------|
| SDK Hikvision chạy trên Windows, tốn CPU server | Chuyển sang Jetson gần camera |
| Model AI (YOLO, anomaly) cần GPU | Jetson Orin Nano có 1024 CUDA cores |
| Latency cao nếu gửi video stream full qua backend | Jetson inference tại chỗ, chỉ gửi event |

## Phase plan

### AI-1: Deploy sdk-relay lên Jetson

- Port `sdk-relay/enhanced_relay.py` sang Linux ARM64
- HCNetSDK có sẵn bản `.so` cho ARM64 (vendor từ Hikvision)
- Jetson kết nối LAN nội bộ camera 152
- Gửi data về `http://<server-ip>:5056/api/v1/measurements/ingest`

### AI-2: Model phóng điện (Camera 153)

- Collect dataset: 500-1000 ảnh phóng điện từ lịch sử camera 153
- Train YOLOv8 nano (detect spark/arc)
- Deploy với TensorRT (FP16) → ~30 FPS trên Orin Nano
- Inference loop:
  ```python
  for frame in rtsp_stream:
    detections = yolo.predict(frame, conf=0.5)
    if detections:
      POST /api/v1/detections {"type":"pd","bbox":[...],"confidence":0.87}
  ```

### AI-3: Dashboard AI

- Trang `DetectionsPage.ts` mới
- Hiển thị detection events (không dùng canvas overlay nhiệt)
- Filter theo camera, type, confidence, time
- Export report AI

## Hardware target

| Spec | Min | Recommended |
|------|-----|-------------|
| Jetson model | Nano 4GB | **Orin Nano 8GB** |
| Storage | 32GB SD | 128GB NVMe |
| Power | 5V 4A | Barrel jack PD |
| Network | WiFi | **Ethernet** (stable RTSP) |

## Thành phần backend (sẵn sàng)

| Endpoint | Status |
|----------|--------|
| `POST /api/v1/measurements/ingest` | ✅ Thermal data |
| `POST /api/v1/detections` (DetectionsController) | ✅ Khung, cần AI push |
| `GET /api/v1/detections` | ✅ List |
| Detection → Alert mapping | ⏸ Chưa có |

## Deployment flow

```bash
# Trên Jetson
ssh nvidia@<jetson-ip>
git clone https://<repo>/stationmonitor-jetson
cd stationmonitor-jetson

# Dependencies
sudo apt install python3-pip libopencv-dev
pip install -r requirements.txt
pip install ultralytics onnxruntime-gpu

# Systemd service
sudo cp stationmonitor-relay.service /etc/systemd/system/
sudo systemctl enable --now stationmonitor-relay

# Model download
wget https://internal/models/pd-detector-v1.pt -O models/pd.pt
```

## Inference API design

Để decouple model khỏi relay, chạy FastAPI service local:

```
┌─────────────────────────────┐
│ Jetson Orin Nano            │
│                             │
│ ┌──────────┐  ┌───────────┐│
│ │ relay.py │→ │ :8000     ││
│ │ (RTSP)   │  │ FastAPI   ││
│ └──────────┘  │ (inference)││
│       │       └───────────┘│
│       │ HTTP POST           │
│       ▼                     │
│ Backend :5056/detections    │
└─────────────────────────────┘
```

## Milestones

| Mốc | Deliverable | ETA |
|-----|-------------|-----|
| M1 | Jetson boot + SSH + GPU verified | Week 1 |
| M2 | sdk-relay chạy trên Jetson, thermal data ingest OK | Week 2 |
| M3 | YOLOv8 train dataset + baseline model | Week 4 |
| M4 | TensorRT export + FPS benchmark | Week 5 |
| M5 | Detection pipeline end-to-end → backend | Week 6 |
| M6 | Dashboard AI page | Week 7 |

## Known concerns

- HCNetSDK ARM64 có sẵn nhưng phiên bản cũ (2020) → có thể thiếu API mới
- Nếu Jetson mất điện → relay down → mất data. Cần fallback trên server?
- Thermal vs quang học: Jetson chỉ xử lý 1 loại hay cả hai? → quyết định phase AI-1

Xem thêm: `docs/archive/ARCHITECTURE_SDK_JETSON.md` (thiết kế chi tiết gốc).
