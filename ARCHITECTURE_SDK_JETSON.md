# Kiến Trúc: SDK + Jetson AI Service

## 📐 Tổng Quan

```
┌─────────────────────────────────────────────────────┐
│ STATION PC (Windows x64)                            │
│                                                      │
│ Backend Service (ASP.NET Core)                      │
│ ├─ Controllers (AlertsController, etc)              │
│ ├─ Services                                         │
│ │   ├─ CameraSDKService (grab raw data)             │
│ │   ├─ AIInferenceService (call Jetson)             │
│ │   └─ AlertService (handle alerts)                 │
│ ├─ Workers                                          │
│ │   ├─ CameraGrabWorker (1 per camera)              │
│ │   ├─ InferenceWorker (2-3 workers)                │
│ │   └─ HealthCheckWorker                            │
│ ├─ Database (PostgreSQL)                            │
│ ├─ SignalR Hub (realtime notify)                    │
│ └─ REST API (:5056)                                 │
│                                                      │
└─────────────────────────────────────────────────────┘
           ↕ gRPC hoặc HTTP (port 5000)
┌─────────────────────────────────────────────────────┐
│ JETSON (ARM64 Linux)                                │
│                                                      │
│ AI Inference Service (Python/FastAPI)               │
│ ├─ Models                                           │
│ │   ├─ Fire detection model                         │
│ │   ├─ Smoke detection model                        │
│ │   └─ Thermal anomaly model                        │
│ ├─ Inference Engine                                 │
│ ├─ REST API (:8000)                                 │
│ │   ├─ POST /api/v1/infer (main endpoint)           │
│ │   ├─ GET /health (status check)                   │
│ │   └─ GET /models (list available models)          │
│ └─ Health Monitor                                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🔌 API Interface: Station ↔ Jetson

### **Endpoint 1: Inference (Main)**

```
POST http://jetson:8000/api/v1/infer

Request:
{
    "camera_id": "192.168.10.152",
    "frame_id": 12345,
    "timestamp": "2026-04-17T14:32:45Z",
    
    "thermal_frame": {
        "width": 96,
        "height": 96,
        "data": "base64_encoded_thermal_matrix",
        "format": "float32"
    },
    
    "optical_frame": {
        "width": 1920,
        "height": 1080,
        "data": "base64_encoded_rgb",
        "format": "uint8"
    },
    
    "metadata": {
        "sensor_temperature": 25.5,
        "emissivity": 0.95,
        "distance_m": 3.2
    }
}

Response (200 OK):
{
    "frame_id": 12345,
    "camera_id": "192.168.10.152",
    "timestamp": "2026-04-17T14:32:45Z",
    "inference_time_ms": 450,
    
    "detections": [
        {
            "class": "fire",
            "confidence": 0.95,
            "bbox": {
                "x": 100,
                "y": 200,
                "width": 150,
                "height": 250
            }
        },
        {
            "class": "smoke",
            "confidence": 0.42,
            "bbox": null
        }
    ],
    
    "summary": {
        "fire_detected": true,
        "fire_confidence": 0.95,
        "smoke_detected": true,
        "smoke_confidence": 0.42,
        "thermal_anomaly": false
    }
}

Response (503 Service Unavailable):
{
    "error": "Model inference timeout",
    "details": "Inference took >3000ms"
}
```

### **Endpoint 2: Health Check**

```
GET http://jetson:8000/api/v1/health

Response:
{
    "status": "healthy",
    "models": {
        "fire_detection": "loaded",
        "smoke_detection": "loaded",
        "thermal_anomaly": "loaded"
    },
    "gpu_memory_mb": 2048,
    "gpu_memory_available_mb": 512,
    "inference_queue": 2,
    "uptime_seconds": 86400
}
```

### **Endpoint 3: Model Info**

```
GET http://jetson:8000/api/v1/models

Response:
{
    "models": [
        {
            "name": "fire_detection",
            "version": "1.0",
            "input_size": [224, 224],
            "output_classes": ["no_fire", "fire"],
            "accuracy": 0.98
        },
        {
            "name": "smoke_detection",
            "version": "1.2",
            "input_size": [320, 320],
            "output_classes": ["no_smoke", "smoke"],
            "accuracy": 0.95
        }
    ]
}
```

---

## 📂 Project Structure: Backend (Station PC)

```
StationMonitor.Api/
├─ Program.cs (DI + Startup)
├─ appsettings.json
├─ Controllers/
│   ├─ AlertsController.cs
│   ├─ CameraController.cs
│   └─ DevicesController.cs
│
├─ Services/
│   ├─ Camera/
│   │   └─ CameraSDKService.cs (Grab raw frame via SDK)
│   │
│   ├─ AI/
│   │   ├─ JetsonAIService.cs (Call Jetson /infer)
│   │   └─ InferenceCache.cs (Cache recent frames)
│   │
│   ├─ Alert/
│   │   ├─ AlertService.cs (Handle detections)
│   │   └─ AlertNotificationService.cs (SignalR)
│   │
│   └─ Health/
│       └─ JetsonHealthService.cs (Monitor Jetson)
│
├─ Workers/
│   ├─ CameraGrabWorker.cs (grab frames from SDK)
│   ├─ InferenceWorker.cs (send to Jetson, handle results)
│   └─ HealthCheckWorker.cs (check Jetson alive)
│
├─ Models/
│   ├─ CameraFrame.cs
│   ├─ InferenceRequest.cs
│   ├─ InferenceResponse.cs
│   └─ DetectionResult.cs
│
├─ Hubs/
│   └─ SignalRNotifier.cs (realtime alerts)
│
└─ Data/
    ├─ Entities/
    │   ├─ DetectionEvent.cs
    │   └─ Alert.cs
    │
    └─ Migrations/
```

---

## 💻 Code: CameraSDKService.cs

```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace StationMonitor.Services.Camera;

/// <summary>
/// Grab raw thermal + optical frames từ camera using SDK
/// </summary>
public class CameraSDKService
{
    private readonly ILogger<CameraSDKService> _logger;
    private readonly HCNetSDK _sdk;
    
    // Frame queues (per camera)
    private readonly ConcurrentDictionary<string, BlockingCollection<CameraFrame>> 
        _frameQueues = new();

    public CameraSDKService(ILogger<CameraSDKService> logger)
    {
        _logger = logger;
        _sdk = new HCNetSDK(); // Initialize SDK
        _sdk.Init();
    }

    /// <summary>
    /// Bắt đầu grab frames từ camera
    /// </summary>
    public void StartGrabbing(string cameraIp, string user, string password)
    {
        if (_frameQueues.ContainsKey(cameraIp))
        {
            _logger.LogWarning("Camera {IP} already grabbing", cameraIp);
            return;
        }

        var queue = new BlockingCollection<CameraFrame>(maxSize: 30);
        _frameQueues.TryAdd(cameraIp, queue);

        _logger.LogInformation("Starting grab from {IP}", cameraIp);

        // Run in background
        _ = Task.Run(() => GrabLoop(cameraIp, user, password, queue));
    }

    /// <summary>
    /// Loop chính: grab frames từ SDK
    /// </summary>
    private async Task GrabLoop(
        string cameraIp,
        string user,
        string password,
        BlockingCollection<CameraFrame> queue)
    {
        try
        {
            // Login with SDK
            var userId = _sdk.Login(cameraIp, 8000, user, password);
            if (userId < 0)
            {
                _logger.LogError("SDK login failed for {IP}", cameraIp);
                return;
            }

            _logger.LogInformation("SDK login success for {IP}", cameraIp);

            int frameId = 0;

            while (true)
            {
                try
                {
                    // Grab thermal frame (96x96 float32)
                    var thermalFrame = _sdk.GetThermalFrame(userId);
                    if (thermalFrame == null)
                        continue;

                    // Grab optical frame (1920x1080 RGB)
                    var opticalFrame = _sdk.GetOpticalFrame(userId);
                    if (opticalFrame == null)
                        continue;

                    // Get metadata
                    var metadata = _sdk.GetMetadata(userId);

                    // Package frame
                    var frame = new CameraFrame
                    {
                        CameraId = cameraIp,
                        FrameId = frameId++,
                        Timestamp = DateTime.UtcNow,
                        ThermalMatrix = thermalFrame,  // 96x96 array
                        OpticalFrame = opticalFrame,    // 1920x1080 RGB
                        SensorTemperature = metadata.SensorTemp,
                        Emissivity = metadata.Emissivity,
                        Distance = metadata.Distance
                    };

                    // Add to queue (drop if full)
                    if (!queue.TryAdd(frame, TimeSpan.FromMilliseconds(100)))
                    {
                        _logger.LogWarning("Frame queue full for {IP}, dropping frame", cameraIp);
                    }

                    // ~30 FPS
                    await Task.Delay(33);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Grab error for {IP}", cameraIp);
                    await Task.Delay(1000);
                }
            }
        }
        finally
        {
            _frameQueues.TryRemove(cameraIp, out _);
            _logger.LogInformation("Grabbing stopped for {IP}", cameraIp);
        }
    }

    /// <summary>
    /// Get next frame từ queue (consumer side)
    /// </summary>
    public bool TryGetFrame(string cameraIp, out CameraFrame frame)
    {
        frame = null;
        
        if (!_frameQueues.TryGetValue(cameraIp, out var queue))
            return false;

        return queue.TryTake(out frame, TimeSpan.FromMilliseconds(100));
    }

    public IEnumerable<string> GetActiveCameras() 
        => _frameQueues.Keys;
}
```

---

## 🤖 Code: JetsonAIService.cs

```csharp
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace StationMonitor.Services.AI;

/// <summary>
/// Call Jetson AI inference service
/// </summary>
public class JetsonAIService
{
    private readonly ILogger<JetsonAIService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _jetsonUrl;

    public JetsonAIService(
        ILogger<JetsonAIService> logger,
        IHttpClientFactory httpClientFactory,
        IConfiguration config)
    {
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("jetson");
        _jetsonUrl = config["Jetson:BaseUrl"] ?? "http://192.168.1.100:8000";
    }

    /// <summary>
    /// Gửi frame lên Jetson để inference
    /// </summary>
    public async Task<InferenceResponse> InferAsync(CameraFrame frame)
    {
        try
        {
            // Prepare request
            var request = new InferenceRequest
            {
                CameraId = frame.CameraId,
                FrameId = frame.FrameId,
                Timestamp = frame.Timestamp,
                ThermalFrame = EncodeFrame(frame.ThermalMatrix, "thermal"),
                OpticalFrame = EncodeFrame(frame.OpticalFrame, "optical"),
                Metadata = new InferenceMetadata
                {
                    SensorTemperature = frame.SensorTemperature,
                    Emissivity = frame.Emissivity,
                    DistanceM = frame.Distance
                }
            };

            var json = JsonSerializer.Serialize(request);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Call Jetson
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var response = await _httpClient.PostAsync(
                $"{_jetsonUrl}/api/v1/infer",
                content);
            sw.Stop();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Jetson inference failed: {StatusCode}", response.StatusCode);
                return null;
            }

            var responseJson = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<InferenceResponse>(responseJson);

            _logger.LogDebug("Inference {FrameId}: {InferenceTime}ms", 
                frame.FrameId, sw.ElapsedMilliseconds);

            return result;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Jetson connection error");
            return null;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Jetson inference timeout");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Inference error");
            return null;
        }
    }

    /// <summary>
    /// Encode frame to base64
    /// </summary>
    private FrameData EncodeFrame(object frameData, string type)
    {
        var bytes = type == "thermal"
            ? ThermalToBytes((float[,])frameData)
            : OpticalToBytes((byte[,,])frameData);

        return new FrameData
        {
            Data = Convert.ToBase64String(bytes),
            Format = "base64"
        };
    }

    private byte[] ThermalToBytes(float[,] thermal)
    {
        // Convert 96x96 float array to bytes
        var bytes = new byte[thermal.Length * 4];
        var offset = 0;
        for (int i = 0; i < thermal.GetLength(0); i++)
        {
            for (int j = 0; j < thermal.GetLength(1); j++)
            {
                Array.Copy(BitConverter.GetBytes(thermal[i, j]), 0, bytes, offset, 4);
                offset += 4;
            }
        }
        return bytes;
    }

    private byte[] OpticalToBytes(byte[,,] optical)
    {
        // Flatten 1920x1080x3 array
        var bytes = new byte[optical.Length];
        Buffer.BlockCopy(optical, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    /// <summary>
    /// Check Jetson health
    /// </summary>
    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"{_jetsonUrl}/api/v1/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
```

---

## 👷 Code: InferenceWorker.cs

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace StationMonitor.Workers;

/// <summary>
/// Background worker: grab frame → infer → save result
/// Chạy 2-3 cái để parallel processing
/// </summary>
public class InferenceWorker : BackgroundService
{
    private readonly ILogger<InferenceWorker> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly string _workerId;

    public InferenceWorker(
        ILogger<InferenceWorker> logger,
        IServiceProvider serviceProvider,
        string workerId = "default")
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
        _workerId = workerId;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Worker {WorkerId} started", _workerId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var cameraService = scope.ServiceProvider
                    .GetRequiredService<CameraSDKService>();
                var aiService = scope.ServiceProvider
                    .GetRequiredService<JetsonAIService>();
                var alertService = scope.ServiceProvider
                    .GetRequiredService<AlertService>();

                // Round-robin: check all cameras
                foreach (var cameraId in cameraService.GetActiveCameras())
                {
                    // Try to get frame from queue
                    if (!cameraService.TryGetFrame(cameraId, out var frame))
                        continue;

                    // Send to Jetson for inference
                    var result = await aiService.InferAsync(frame);
                    if (result == null)
                    {
                        _logger.LogWarning("Inference failed for frame {FrameId}", frame.FrameId);
                        continue;
                    }

                    // Process results
                    await alertService.ProcessDetectionAsync(frame, result);

                    // Log every 100 frames
                    if (frame.FrameId % 100 == 0)
                    {
                        _logger.LogInformation(
                            "Worker {WorkerId}: processed {FrameId} from {Camera}",
                            _workerId, frame.FrameId, cameraId);
                    }
                }

                // Small delay to prevent tight loop
                await Task.Delay(1, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Worker {WorkerId} error", _workerId);
                await Task.Delay(1000, stoppingToken);
            }
        }

        _logger.LogInformation("Worker {WorkerId} stopped", _workerId);
    }
}
```

---

## 🐍 Code: Jetson FastAPI Service

```python
# jetson_ai/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import onnxruntime as ort
import base64
import logging
import time

app = FastAPI(title="StationMonitor AI Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========== Models ==========
class ThermalFrame(BaseModel):
    width: int
    height: int
    data: str  # base64
    format: str = "float32"

class OpticalFrame(BaseModel):
    width: int
    height: int
    data: str  # base64
    format: str = "uint8"

class InferenceRequest(BaseModel):
    camera_id: str
    frame_id: int
    timestamp: str
    thermal_frame: ThermalFrame
    optical_frame: OpticalFrame
    metadata: dict

class Detection(BaseModel):
    class_name: str
    confidence: float
    bbox: dict = None

class InferenceResponse(BaseModel):
    frame_id: int
    camera_id: str
    timestamp: str
    inference_time_ms: int
    detections: list[Detection]
    summary: dict

# ========== Load Models ==========
class ModelManager:
    def __init__(self):
        self.fire_model = ort.InferenceSession("models/fire_detection.onnx")
        self.smoke_model = ort.InferenceSession("models/smoke_detection.onnx")
        self.thermal_model = ort.InferenceSession("models/thermal_anomaly.onnx")
        logger.info("Models loaded")
    
    def infer_fire(self, frame):
        # Preprocess & inference
        input_data = self._preprocess(frame, (224, 224))
        outputs = self.fire_model.run(None, {"input": input_data})
        confidence = float(outputs[0][0][1])  # fire class
        return confidence
    
    def infer_smoke(self, frame):
        input_data = self._preprocess(frame, (320, 320))
        outputs = self.smoke_model.run(None, {"input": input_data})
        confidence = float(outputs[0][0][1])  # smoke class
        return confidence
    
    def _preprocess(self, frame, target_size):
        # Normalize, resize, etc
        frame = cv2.resize(frame, target_size)
        frame = frame.astype(np.float32) / 255.0
        frame = np.expand_dims(frame, 0)  # Add batch dim
        return frame

models = ModelManager()

# ========== Endpoints ==========
@app.post("/api/v1/infer")
async def infer(request: InferenceRequest):
    start_time = time.time()
    
    try:
        # Decode frames
        thermal = _decode_thermal(request.thermal_frame.data)  # 96x96
        optical = _decode_optical(request.optical_frame.data)   # 1920x1080
        
        # Inference
        fire_conf = models.infer_fire(optical)
        smoke_conf = models.infer_smoke(optical)
        
        # Thermal anomaly (use thermal frame)
        thermal_anomaly = np.max(thermal) > 60  # Simple threshold
        
        # Build detections
        detections = []
        if fire_conf > 0.5:
            detections.append({
                "class": "fire",
                "confidence": fire_conf,
                "bbox": None
            })
        if smoke_conf > 0.5:
            detections.append({
                "class": "smoke",
                "confidence": smoke_conf,
                "bbox": None
            })
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        return InferenceResponse(
            frame_id=request.frame_id,
            camera_id=request.camera_id,
            timestamp=request.timestamp,
            inference_time_ms=elapsed_ms,
            detections=detections,
            summary={
                "fire_detected": fire_conf > 0.5,
                "fire_confidence": fire_conf,
                "smoke_detected": smoke_conf > 0.5,
                "smoke_confidence": smoke_conf,
                "thermal_anomaly": thermal_anomaly
            }
        )
    
    except Exception as e:
        logger.error(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/health")
async def health():
    return {
        "status": "healthy",
        "models": ["fire_detection", "smoke_detection", "thermal_anomaly"],
        "gpu_available": True
    }

@app.get("/api/v1/models")
async def list_models():
    return {
        "models": [
            {"name": "fire_detection", "version": "1.0"},
            {"name": "smoke_detection", "version": "1.2"},
            {"name": "thermal_anomaly", "version": "1.0"}
        ]
    }

def _decode_thermal(data: str):
    bytes_data = base64.b64decode(data)
    return np.frombuffer(bytes_data, dtype=np.float32).reshape((96, 96))

def _decode_optical(data: str):
    bytes_data = base64.b64decode(data)
    return np.frombuffer(bytes_data, dtype=np.uint8).reshape((1080, 1920, 3))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 🚀 Deployment: appsettings.json

```json
{
  "Jetson": {
    "BaseUrl": "http://192.168.1.100:8000",
    "HealthCheckIntervalSeconds": 10,
    "InferenceTimeoutSeconds": 3
  },
  
  "Camera": {
    "Cameras": [
      {
        "Id": "192.168.10.152",
        "User": "admin",
        "Password": "Demo@2024"
      },
      {
        "Id": "192.168.10.153",
        "User": "tladmin",
        "Password": "Ab@12345"
      }
    ]
  },
  
  "Workers": {
    "GrabWorkers": 1,
    "InferenceWorkers": 2,
    "HealthCheckIntervalSeconds": 30
  },
  
  "Logging": {
    "LogLevel": {
      "Default": "Information"
    }
  }
}
```

---

## 📝 Program.cs Setup

```csharp
var builder = WebApplicationBuilder.CreateBuilder(args);

// Services
builder.Services.AddScoped<CameraSDKService>();
builder.Services.AddScoped<JetsonAIService>();
builder.Services.AddScoped<AlertService>();

// HttpClient for Jetson
builder.Services.AddHttpClient("jetson", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

// Workers
builder.Services.AddHostedService(sp =>
    new CameraGrabWorker(
        sp.GetRequiredService<ILogger<CameraGrabWorker>>(),
        sp,
        sp.GetRequiredService<IConfiguration>()
    )
);

builder.Services.AddHostedService(sp =>
    new InferenceWorker(
        sp.GetRequiredService<ILogger<InferenceWorker>>(),
        sp,
        workerId: "worker-1"
    )
);

builder.Services.AddHostedService(sp =>
    new InferenceWorker(
        sp.GetRequiredService<ILogger<InferenceWorker>>(),
        sp,
        workerId: "worker-2"
    )
);

builder.Services.AddHostedService<HealthCheckWorker>();

// Swagger, SignalR, etc
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

var app = builder.Build();

// Middleware
app.UseSwagger();
app.UseRouting();
app.MapControllers();
app.MapHub<SignalRNotifier>("/ws/realtime");

app.Run();
```

---

## 📊 Luồng Dữ Liệu Đầy Đủ

```
[Station PC - Backend]

CameraGrabWorker (background thread)
├─ Call: CameraSDKService.StartGrabbing(cameraId)
├─ SDK grab frame every 33ms
├─ Add frame to queue
└─ Repeat

InferenceWorker #1 (background thread)
├─ Loop: Check all cameras
├─ CameraSDKService.TryGetFrame(cameraId)
├─ If frame exists:
│  ├─ JetsonAIService.InferAsync(frame)
│  │  └─ POST http://jetson:8000/api/v1/infer
│  ├─ Wait for response (~500ms)
│  ├─ AlertService.ProcessDetectionAsync(result)
│  │  └─ Save to DB, trigger SignalR
│  └─ Log result
└─ Repeat

InferenceWorker #2 (same as #1, parallel)

[Jetson - AI Service]

FastAPI Server
├─ GET /api/v1/health (check alive)
├─ GET /api/v1/models (list models)
└─ POST /api/v1/infer
   ├─ Decode base64 frames
   ├─ Run inference on models
   ├─ Return detections
   └─ Respond in ~450ms

[Frontend]

SignalR realtime
├─ Receive alert from SignalRNotifier
├─ Show notification
└─ Update Dashboard
```

---

## ✅ Tóm Tắt Cơ Cấu

| Layer | Tech | Purpose |
|-------|------|---------|
| **Camera** | SDK | Grab raw thermal + optical frames |
| **Queue** | ConcurrentBag | Buffer frames (decouple grab from inference) |
| **Backend** | ASP.NET Core | REST API, SignalR, Database |
| **Jetson API** | FastAPI + ONNX | Inference service (stateless) |
| **Workers** | Async/Await | Grab + Inference parallel |
| **Database** | PostgreSQL | Persist detections + alerts |
| **Realtime** | SignalR | Push notifications to Frontend |

---

## 🎯 Lợi Ích

1. ✅ **SDK vẫn dùng** - Grab raw data từ camera
2. ✅ **Jetson chỉ inference** - Lightweight, easy to scale
3. ✅ **Backend on Station** - Familiar, easy debug
4. ✅ **Parallel processing** - 2-3 workers = higher throughput
5. ✅ **Resilient** - If Jetson down, can still grab frames (buffer them)
6. ✅ **Scalable** - Add more workers if needed
7. ✅ **Cross-platform** - Jetson service has REST API (can call from anywhere)
