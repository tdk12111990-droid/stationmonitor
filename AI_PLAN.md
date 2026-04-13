# StationMonitor — Kế hoạch AI (Phase AI-1, AI-2, AI-3)
> Cập nhật: 2026-04-07
> **Quyết định kiến trúc: dùng gRPC** để extensible cho real-time streaming sau này.
> File contract: `ai-python/ai_service.proto`

---

## 1. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                     NGUỒN DỮ LIỆU AI                         │
│  [Camera RTSP]                [Camera ISAPI Event Stream]    │
│  [Acoustic Imager ISAPI]                                     │
└───────────────────────────┬─────────────────┬───────────────┘
                            │ RTSP frames      │ ISAPI XML events
                            ▼                  ▼
              ┌─────────────────────┐  ┌────────────────────┐
              │   ai-python/        │  │ CameraEventWorker  │
              │   (Jetson Orin Nano)│  │ (.NET Background)  │
              │                    │  │                    │
              │ OpenCV pull frame  │  │ Poll ISAPI 5s      │
              │ YOLO inference     │  │ Parse XML event    │
              │ Face recognition   │  │ fire/smoke/thermal │
              │ Trend ARIMA/LSTM   │  │ VCA/PD             │
              └─────────┬───────────┘  └─────────┬──────────┘
                        │                         │
                        │ gRPC (port 50051)        │ internal call
                        ▼                         ▼
              ┌──────────────────────────────────────────────┐
              │              StationMonitor.Api (.NET 8)      │
              │  AiGrpcClient  ←→  AiDetectionService        │
              │  CameraEventWorker                            │
              │  DetectionsController                         │
              │  → lưu DetectionEvent + MediaFile             │
              │  → trigger Rule Engine → Alert                │
              │  → SignalR push → Frontend/Mobile             │
              └──────────────────────────────────────────────┘
```

---

## 2. Quyết định kiến trúc

| Câu hỏi | Quyết định | Lý do |
|---------|-----------|-------|
| gRPC hay HTTP POST? | **gRPC** | Extensible cho streaming real-time, latency thấp, type-safe contract |
| Python push hay .NET pull? | **gRPC server streaming** | Python stream liên tục, .NET nhận qua `StreamDetections` RPC |
| Lưu ảnh ở đâu? | **Local disk** `wwwroot/detections/` | Static files, tương lai có thể add R2/S3 |
| ThermalFrame lưu thế nào? | **JSON float32 array** trong DB | Dễ query, không cần binary blob |
| Confidence threshold | **Lưu trong SystemSettings** | Admin chỉnh qua UI, per-type |
| Face recognition scope | **Phase 2** (sau YOLO xong) | Cần build DB ảnh nhân viên trước |
| Dahua camera | **Không hỗ trợ lúc đầu** | Chỉ Hikvision |

---

## 3. gRPC Contract — `ai_service.proto`

File: `ai-python/ai_service.proto`

### 6 RPC Methods

| RPC | Kiểu | Mô tả |
|-----|------|-------|
| `Detect` | Unary | Gửi 1 frame JPEG → nhận kết quả ngay |
| `StreamDetections` | Server streaming | Python stream kết quả liên tục về .NET |
| `AnalyzeTrend` | Unary | Gửi time-series 30 ngày → dự báo RUL + slope |
| `CrossValidate` | Unary | Thermal alert + frame → YOLO kiểm tra có phải động vật không |
| `GetStatus` | Unary | Lấy trạng thái Jetson (GPU%, FPS, models) |
| `ReloadModel` | Unary | Hot-reload model mới mà không restart server |

### Luồng chính

**Real-time streaming (StreamDetections):**
```
.NET gọi:  aiClient.StreamDetections(new StreamRequest { CameraId = "cam-152", ModelType = "intrusion" })
Python trả: yield DetectionResult { detections=[{label="snake", confidence=0.91, bbox=...}] }
           yield DetectionResult { ... }  ← liên tục
.NET nhận:  await foreach (var result in stream) { await ProcessDetection(result); }
```

**Phân tích trend (AnalyzeTrend):**
```
.NET gửi:  30 ngày SensorReadings cho 1 pointId
Python trả: { slope=+0.8/day, r2=0.94, days_to_threshold=9.5, model="ARIMA(2,1,2)" }
.NET lưu:  vào DB + hiển thị trên AnalyticsPage
```

**Cross-validation (CrossValidate):**
```
Camera nhiệt báo thermalException tại bbox(120,80,200,150)
.NET gửi frame + ROI sang Python
Python chạy YOLO tại vùng ROI
Python trả: { is_animal=true, label="cat", confidence=0.87,
              recommendation="Hủy cảnh báo — phát hiện mèo nằm sưởi" }
.NET: hủy alert "thermal", tạo alert "animal_intrusion"
```

---

## 4. Phân chia: Camera tự làm vs Jetson

### Luồng A — Camera tự làm (ISAPI polling, không cần Jetson)

`CameraEventWorker` (.NET) poll ISAPI event stream → parse XML → tạo `DetectionEvent`

| Tính năng | Camera | ISAPI Event Type |
|-----------|--------|-----------------|
| Đo nhiệt độ vùng/điểm | DS-2TD2637T-7/QY | `thermalException` |
| Phát hiện cháy | DS-2TD2637T-7/QY | `fireDetection` |
| Phát hiện khói | DS-2TD2637T-7/QY | `smokeDetection` |
| Phát hiện phóng điện PD | DS-QAAI264G1-P | `acousticException` |
| Hàng rào ảo VCA | Tất cả cam | `linedetection` / `fielddetection` |
| Xâm nhập vùng | Tất cả cam | `regionEntrance` |
| Phân loại người/xe | Cam nhiệt + thường | Deep learning on-cam |

**XML ISAPI event mẫu (CameraEventWorker cần parse):**
```xml
<EventTriggerNotificationList>
  <EventTriggerNotification>
    <ipAddress>192.168.10.152</ipAddress>
    <eventType>thermalException</eventType>
    <dateTime>2026-04-07T10:30:00+07:00</dateTime>
    <ThermalExceptionInfo>
      <temperature>87.5</temperature>
      <maxTemperature>92.1</maxTemperature>
    </ThermalExceptionInfo>
  </EventTriggerNotification>
</EventTriggerNotificationList>
```

### Luồng B — Custom AI trên Jetson (gRPC)

| Model | Nhận diện | RPC dùng |
|-------|-----------|----------|
| YOLOv8n — Intrusion | Chuột, rắn, chim, thằn lằn, người lạ | `StreamDetections` |
| YOLOv8n — Equipment | Tổ chim, dây diều, dầu chảy, bụi/nhện, ngập nước | `StreamDetections` |
| Template/CV — Status | Khóa Remote/Local, đèn đỏ/xanh/vàng | `Detect` (định kỳ) |
| ARIMA/LSTM — Trend | Dự báo RUL, slope nâng cao | `AnalyzeTrend` |
| ArcFace — Face (**Phase 2**) | Nhận dạng nhân viên | `Detect` với model_type="face" |

---

## 5. Cấu trúc thư mục

```
D:\StationMonitor\
│
├── ai-python/                          ← chạy trên Jetson
│   ├── ai_service.proto                ← gRPC contract (source of truth)
│   ├── ai_service_pb2.py               ← generated (chạy protoc)
│   ├── ai_service_pb2_grpc.py          ← generated (chạy protoc)
│   ├── requirements.txt
│   ├── main.py                         ← gRPC server startup
│   ├── config.py                       ← RTSP URLs, model paths, thresholds
│   ├── servicer.py                     ← implement AiServiceServicer
│   ├── camera_worker.py                ← OpenCV RTSP → frame queue
│   ├── detector.py                     ← YOLOv8/TensorRT inference
│   ├── trend_analyzer.py               ← ARIMA/LSTM time-series
│   ├── face_recognizer.py              ← ArcFace (Phase 2)
│   ├── status_reader.py                ← Template matching đèn/khóa
│   ├── models/                         ← .pt / .engine weights (gitignore)
│   └── systemd/
│       └── ai-server.service
│
├── backend/
│   ├── StationMonitor.AI/              ← NEW C# project (gRPC client)
│   │   ├── StationMonitor.AI.csproj
│   │   ├── Protos/
│   │   │   └── ai_service.proto        ← copy/link từ ai-python/
│   │   ├── AiGrpcClient.cs             ← wrapper gRPC calls
│   │   └── AiDetectionService.cs       ← business logic
│   │
│   ├── StationMonitor.Api/Controllers/
│   │   └── DetectionsController.cs     ← NEW
│   └── StationMonitor.Workers/
│       └── CameraEventWorker.cs        ← NEW (ISAPI polling)
│
└── frontend/src/pages/
    └── DetectionsPage.ts               ← NEW
```

---

## 6. Cài đặt dependencies

### .NET — thêm vào `StationMonitor.AI.csproj`
```xml
<PackageReference Include="Grpc.Net.Client" Version="2.65.0" />
<PackageReference Include="Google.Protobuf" Version="3.28.3" />
<PackageReference Include="Grpc.Tools" Version="2.65.0">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>

<!-- Auto-generate C# từ .proto -->
<ItemGroup>
  <Protobuf Include="Protos\ai_service.proto" GrpcServices="Client" />
</ItemGroup>
```

### Python — `ai-python/requirements.txt`
```txt
# gRPC
grpcio==1.66.1
grpcio-tools==1.66.1    # để generate code từ .proto

# Web API (optional, cho /status endpoint HTTP)
fastapi==0.115.0
uvicorn==0.31.0

# Camera + AI
opencv-python==4.10.0.84
numpy==1.26.4
ultralytics==8.3.0       # YOLOv8/v11

# Time-series analytics
statsmodels==0.14.4      # ARIMA
# tensorflow-lite          # LSTM (chỉ cần nếu dùng LSTM, nặng hơn)

# Face recognition (Phase 2)
# onnxruntime==1.19.0
# insightface==0.7.3      # ArcFace

# TensorRT — cài qua apt trên JetPack, không pip
```

---

## 7. Generate code từ .proto

### Python
```bash
cd ai-python
pip install grpcio-tools
python -m grpc_tools.protoc \
  -I. \
  --python_out=. \
  --grpc_python_out=. \
  ai_service.proto
# Tạo ra: ai_service_pb2.py, ai_service_pb2_grpc.py
```

### .NET (tự động khi build)
```bash
cd backend
dotnet build StationMonitor.sln
# Grpc.Tools tự generate C# từ Protos/ai_service.proto khi build
```

---

## 8. Backend .NET — AiGrpcClient.cs

```csharp
// StationMonitor.AI/AiGrpcClient.cs
public class AiGrpcClient
{
    private readonly AiService.AiServiceClient _client;

    public AiGrpcClient(IConfiguration config)
    {
        var jetsonUrl = config["AI:JetsonGrpcUrl"] ?? "http://localhost:50051";
        var channel = GrpcChannel.ForAddress(jetsonUrl);
        _client = new AiService.AiServiceClient(channel);
    }

    // Gửi 1 frame → kết quả ngay
    public async Task<DetectResponse> DetectAsync(string cameraId, byte[] frameJpeg, string modelType = "intrusion")
    {
        return await _client.DetectAsync(new DetectRequest
        {
            CameraId  = cameraId,
            FrameJpeg = Google.Protobuf.ByteString.CopyFrom(frameJpeg),
            ModelType = modelType,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
    }

    // Stream liên tục từ Python
    public AsyncServerStreamingCall<DetectionResult> StreamDetections(string cameraId, string modelType = "all")
    {
        return _client.StreamDetections(new StreamRequest
        {
            CameraId      = cameraId,
            ModelType     = modelType,
            MinConfidence = 0.6f
        });
    }

    // Phân tích trend time-series
    public async Task<TrendResponse> AnalyzeTrendAsync(string deviceId, string pointId,
        IEnumerable<(long ts, float val)> samples, int horizonDays = 30)
    {
        var req = new TrendRequest
        {
            DeviceId     = deviceId,
            PointId      = pointId,
            HorizonDays  = horizonDays,
            AnalysisType = "arima"
        };
        req.Samples.AddRange(samples.Select(s => new Sample { Timestamp = s.ts, Value = s.val }));
        return await _client.AnalyzeTrendAsync(req);
    }

    // Cross-validate: thermal alert → hỏi YOLO có phải động vật không
    public async Task<CrossValidateResponse> CrossValidateAsync(
        string cameraId, byte[] frameJpeg, BoundingBox roi, string triggerType, float triggerValue)
    {
        return await _client.CrossValidateAsync(new CrossValidateRequest
        {
            CameraId     = cameraId,
            FrameJpeg    = Google.Protobuf.ByteString.CopyFrom(frameJpeg),
            Roi          = roi,
            TriggerType  = triggerType,
            TriggerValue = triggerValue
        });
    }

    public async Task<StatusResponse> GetStatusAsync()
        => await _client.GetStatusAsync(new Empty());
}
```

---

## 9. Python — servicer.py (skeleton)

```python
# ai-python/servicer.py
import grpc
import ai_service_pb2 as pb2
import ai_service_pb2_grpc as pb2_grpc
from detector import YoloDetector
from trend_analyzer import TrendAnalyzer
from camera_worker import CameraWorker

class AiServicer(pb2_grpc.AiServiceServicer):

    def __init__(self):
        self.detectors = {
            "intrusion": YoloDetector("models/intrusion.engine"),
            "equipment": YoloDetector("models/equipment.engine"),
        }
        self.trend_analyzer = TrendAnalyzer()
        self.camera_worker = CameraWorker()

    # Unary: 1 frame → kết quả
    async def Detect(self, request, context):
        detector = self.detectors.get(request.model_type, self.detectors["intrusion"])
        results = detector.infer(bytes(request.frame_jpeg))
        return pb2.DetectResponse(
            camera_id  = request.camera_id,
            detections = [pb2.Detection(
                label      = r["label"],
                confidence = r["confidence"],
                type       = r["type"],
                severity   = r["severity"],
                bbox       = pb2.BoundingBox(**r["bbox"]),
            ) for r in results],
            latency_ms = detector.last_latency_ms,
            model_used = detector.model_name,
        )

    # Server streaming: liên tục push về .NET
    async def StreamDetections(self, request, context):
        async for frame, timestamp in self.camera_worker.stream(request.camera_id):
            detector = self.detectors.get(request.model_type, self.detectors["intrusion"])
            results = detector.infer(frame)
            high_conf = [r for r in results if r["confidence"] >= request.min_confidence]
            if high_conf:
                yield pb2.DetectionResult(
                    camera_id  = request.camera_id,
                    detections = [pb2.Detection(**r) for r in high_conf],
                    timestamp  = timestamp,
                )

    # Trend analysis
    async def AnalyzeTrend(self, request, context):
        samples = [(s.timestamp, s.value) for s in request.samples]
        result = self.trend_analyzer.analyze(samples, request.horizon_days, request.analysis_type)
        return pb2.TrendResponse(**result)

    # Cross-validate
    async def CrossValidate(self, request, context):
        frame = bytes(request.frame_jpeg)
        roi   = (request.roi.x, request.roi.y, request.roi.width, request.roi.height)
        result = self.detectors["intrusion"].infer_roi(frame, roi)
        is_animal = result[0]["type"] == "animal" if result else False
        is_person = result[0]["type"] == "intrusion" if result else False
        label = result[0]["label"] if result else "unknown"
        return pb2.CrossValidateResponse(
            is_equipment   = not is_animal and not is_person,
            is_animal      = is_animal,
            is_person      = is_person,
            label          = label,
            confidence     = result[0]["confidence"] if result else 0.0,
            recommendation = f"Phát hiện {label} — {'hủy cảnh báo thiết bị' if is_animal else 'giữ cảnh báo'}",
        )

    async def GetStatus(self, request, context):
        import psutil, subprocess
        return pb2.StatusResponse(
            status     = "running",
            gpu_usage  = 42.0,  # TODO: đọc từ tegrastats
            gpu_temp   = 55.0,
            uptime_sec = int(psutil.boot_time()),
            models     = [pb2.ModelInfo(
                model_id   = name,
                model_type = name,
                is_active  = True,
                format     = "tensorrt",
            ) for name in self.detectors],
        )

    async def ReloadModel(self, request, context):
        try:
            self.detectors[request.model_type] = YoloDetector(request.model_path)
            return pb2.ReloadModelResponse(success=True, message=f"Loaded {request.model_path}")
        except Exception as e:
            return pb2.ReloadModelResponse(success=False, message=str(e))
```

---

## 10. Python — main.py (gRPC server startup)

```python
# ai-python/main.py
import asyncio
import grpc
import ai_service_pb2_grpc as pb2_grpc
from servicer import AiServicer

async def serve():
    server = grpc.aio.server()
    pb2_grpc.add_AiServiceServicer_to_server(AiServicer(), server)
    listen_addr = "[::]:50051"
    server.add_insecure_port(listen_addr)
    print(f"gRPC AI Server listening on {listen_addr}")
    await server.start()
    await server.wait_for_termination()

if __name__ == "__main__":
    asyncio.run(serve())
```

---

## 11. Config .NET (appsettings.json)

```json
"AI": {
  "JetsonGrpcUrl": "http://192.168.10.YYY:50051",
  "AiToken": "your-secret-token",
  "Confidence": {
    "Intrusion": 0.60,
    "Equipment": 0.65,
    "Face": 0.75
  },
  "MinSeverityForAlert": "warning"
}
```

---

## 12. Backend API endpoints (DetectionsController)

```
POST /api/v1/detections/ingest          ← nhận từ CameraEventWorker (ISAPI)
GET  /api/v1/detections                 ← lịch sử (filter: cameraId, type, from, to, severity)
GET  /api/v1/detections/{id}            ← chi tiết
GET  /api/v1/detections/stats           ← đếm theo type/camera/ngày
DELETE /api/v1/detections/{id}          ← admin xóa
GET  /api/v1/ai/status                  ← proxy gRPC GetStatus → Jetson
GET  /api/v1/ai/models                  ← danh sách AiModelVersion trong DB
PUT  /api/v1/ai/models/{id}/activate    ← gọi gRPC ReloadModel
```

---

## 13. MediaFile & ThermalFrame

**MediaFile — khi nào lưu:**
- Mỗi DetectionEvent có ảnh crop → lưu `wwwroot/detections/{yyyy-MM-dd}/{filename}`
- Ghi MediaFile entity: { path, sizeBytes, mimeType, cameraId, detectionEventId }
- Tự xóa sau 30 ngày (cleanup worker)
- Serve qua static files: `GET /detections/{date}/{file}`

**ThermalFrame — cấu trúc:**
```json
{
  "width": 160, "height": 120,
  "data": [[25.1, 26.3, ...], ...],
  "minTemp": 22.0, "maxTemp": 92.1
}
```
Lưu dưới dạng JSONB trong PostgreSQL. Chỉ tạo khi source="isapi" + type="thermal".

---

## 14. SignalR — DetectionNew event

```json
{
  "event": "DetectionNew",
  "data": {
    "id": "uuid",
    "cameraId": "cam-152",
    "cameraName": "Camera 152 - Sân ngoài",
    "source": "yolo",
    "type": "animal",
    "label": "snake",
    "confidence": 0.91,
    "severity": "alarm",
    "boundingBox": { "x": 120, "y": 80, "width": 200, "height": 150 },
    "imageUrl": "/detections/2026-04-07/cam152_xxx.jpg",
    "frameWidth": 1920,
    "frameHeight": 1080,
    "timestamp": "2026-04-07T10:30:00Z"
  }
}
```
`imageUrl` là URL tĩnh, không nhúng base64 trong SignalR.

---

## 15. Deploy Jetson Orin Nano

```bash
# 1. Cài JetPack 6.x (Ubuntu 22.04 + TensorRT sẵn)
sudo apt install tensorrt python3-pip python3-venv

# 2. Clone + setup
git clone ... /home/jetson/stationmonitor
cd /home/jetson/stationmonitor/ai-python
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 3. Generate gRPC code
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. ai_service.proto

# 4. Export YOLO model sang TensorRT
yolo export model=best.pt format=engine device=0 imgsz=640

# 5. Start
sudo systemctl enable ai-server && sudo systemctl start ai-server

# 6. Verify
grpcurl -plaintext localhost:50051 ai.AiService/GetStatus
```

---

## 16. Thứ tự triển khai

```
Bước 1  ─ DetectionsController + AiDetectionService (.NET)   Không cần Jetson
Bước 2  ─ CameraEventWorker ISAPI polling (.NET)             Không cần Jetson
Bước 3  ─ DetectionsPage frontend                            Không cần Jetson
Bước 4  ─ StationMonitor.AI project + AiGrpcClient (.NET)    Không cần Jetson (client sẵn sàng)
Bước 5  ─ ai-python/ gRPC server skeleton                    Test trên PC CPU
Bước 6  ─ Train YOLO model + export TensorRT                 Cần GPU
Bước 7  ─ Deploy lên Jetson                                  Cần phần cứng
Bước 8  ─ Face recognition (Phase 2)                         Cần DB ảnh nhân viên
```
