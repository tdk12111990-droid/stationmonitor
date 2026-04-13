# StationMonitor — Analytics & AI Nâng cao
> Cập nhật: 2026-04-07
> Ghi lại những gì đã làm, chưa làm, và kế hoạch cụ thể.
> Đọc cùng với AI_PLAN.md (phần camera/detection).

---

## 1. Tổng quan — Đã làm vs Còn thiếu

### Đã có (nhưng chỉ ở mức cơ bản)

| Component | File | Thực tế làm gì | Mức độ |
|-----------|------|---------------|--------|
| EarlyWarningWorker | Workers/Polling/EarlyWarningWorker.cs | OLS Linear Regression 7 ngày, ngưỡng cứng 0.5°C/day và 0.3 dB/day, dedup 12h | Tạm ổn |
| HealthScoreWorker | Workers/Polling/HealthScoreWorker.cs | Cộng penalty đơn giản: alarm=-20, warning=-5, violate=-25/-10, offline=-20 | Đơn giản |
| RuleEvaluationWorker | Workers/Polling/RuleEvaluationWorker.cs | So sánh threshold 1 lần, chặn nếu alert đang open | **Thiếu hysteresis** |
| DataQualityPipeline | Workers/Quality/DataQualityPipeline.cs | Range + Spike + Deadband + Moving Average | Tốt |
| AnalyticsController | Api/Controllers/AnalyticsController.cs | /trend: OLS slope + phân loại rising/stable/falling | Tạm ổn |
| CircuitBreaker | Workers/Quality/CircuitBreaker.cs | Closed/Open/HalfOpen chuẩn, timeout 2 phút | Tốt |

### Chưa làm — Danh sách ưu tiên

| # | Tính năng | Ưu tiên | Cần Jetson? | File cần sửa/tạo |
|---|-----------|---------|------------|-----------------|
| **1** | Hysteresis / Cooldown trong Rule Engine | 🔴 Rất cao | Không | RuleEvaluationWorker.cs |
| **2** | Delta-T giữa 3 pha nhiệt độ | 🔴 Cao | Không | EarlyWarningWorker.cs + mới |
| **3** | PD frequency counting (tần suất tăng vọt) | 🔴 Cao | Không | EarlyWarningWorker.cs |
| **4** | Load correlation (tải ↔ nhiệt) | 🔴 Cao | Không | EarlyWarningWorker.cs |
| **5** | Health Score có trọng số + temporal decay | 🟡 Trung bình | Không | HealthScoreWorker.cs |
| **6** | ARIMA / LSTM trend nâng cao | 🟢 Thấp | **Có (Python)** | ai-python/trend_analyzer.py |
| **7** | AI Cross-validation (thermal ↔ YOLO) | 🟢 Thấp | **Có (Jetson)** | AiDetectionService.cs |

---

## 2. Lỗ hổng nghiêm trọng — Flapping (Alert Spam)

### Vấn đề
`RuleEvaluationWorker` chỉ chặn tạo alert mới khi alert đang `open`.
Khi alert bị close (manually hoặc auto), nếu sensor dao động quanh ngưỡng → spam alert liên tục:

```
14:00:00 → 80.1°C → Alert #1 tạo, status=open
14:00:05 → 79.9°C → Alert #1 close (do ai đó ACK hoặc auto-clear)
14:00:10 → 80.1°C → Alert #2 tạo ngay ← SPAM
14:00:15 → 79.9°C → Alert #2 close
... lặp vô tận, nhân viên phát điên
```

### Giải pháp — Hysteresis 2 ngưỡng + Cooldown

**Nguyên lý:**
- Ngưỡng kích hoạt (trigger): 80°C
- Ngưỡng tắt cảnh báo (clear): 77°C (thấp hơn 3°C = hysteresis band)
- Cooldown: sau khi alert close → không tạo mới trong 5 phút

**Kế hoạch sửa `RuleEvaluationWorker.cs`:**
```csharp
// Thêm vào Rule entity (hoặc parse từ JSON condition):
// { "point": "temp1", "op": ">", "value": 80, "clearValue": 77, "cooldownMin": 5, "confirmSec": 300 }

// Logic mới:
// 1. Nếu alert đang open:
//    - Chỉ close khi value < clearValue (không phải < triggerValue)
// 2. Nếu alert vừa close:
//    - Ghi lastClosedAt vào RuleTriggerLog hoặc in-memory dict
//    - Không tạo mới trong cooldownMin phút
// 3. Nếu muốn kích hoạt:
//    - Phải vượt ngưỡng liên tục trong confirmSec giây (5 phút)
//    - Đếm số lần đọc liên tiếp vượt ngưỡng, chỉ tạo alert khi đủ số lần
```

**Thêm vào Rule JSON condition:**
```json
{
  "point": "DB32_Temp_Phase1",
  "op": ">",
  "value": 80,
  "clearValue": 77,
  "cooldownMin": 5,
  "confirmReadings": 3
}
```

---

## 3. Delta-T — Phân tích chênh lệch nhiệt 3 pha

### Tại sao quan trọng
Nhiệt độ Pha A = 70°C có thể bình thường nếu tải cao.
Nhưng nếu Pha A = 70°C, Pha B = 68°C, Pha C = 45°C → **Pha C lạnh bất thường** → tiếp điểm hoặc dây dẫn có vấn đề.

### Công thức Delta-T
```
ΔT_max = max(TempA, TempB, TempC) - min(TempA, TempB, TempC)

Bình thường:   ΔT < 5°C
Cảnh báo sớm: ΔT > 10°C
Alarm:         ΔT > 15°C hoặc 1 pha lệch > 20% so với pha trung bình
```

### Kế hoạch thêm vào EarlyWarningWorker.cs
```csharp
// Hàm mới: AnalyzeDeltaT(deviceId, readings)
// 1. Lấy 3 pointId nhiệt độ của cùng thiết bị
//    (DB32 offset 0=Pha1, 2=Pha3, 4=Pha2)
// 2. Tính ΔT = max - min của 3 pha tại cùng timestamp
// 3. Nếu ΔT > 10°C liên tục 3 readings → Alert "Chênh lệch nhiệt bất thường"
//    level=warning, message="MBA chính: Chênh lệch nhiệt giữa các pha 12.3°C (Pha A=70, B=68, C=57)"
// 4. Dedup 6h
```

---

## 4. PD Frequency Counting — Đếm tần suất phóng điện

### Vấn đề hiện tại
EarlyWarningWorker chỉ nhìn vào **giá trị dB tăng dần** (slope).
Nhưng phóng điện thực sự nguy hiểm = **số sự kiện PD tăng vọt**, dù mỗi lần biên độ nhỏ.

### Ví dụ
```
Tuần trước: 2 sự kiện PD/ngày, 3.5 dB trung bình
Tuần này:  18 sự kiện PD/ngày, 3.2 dB trung bình ← biên độ giảm nhưng TẦN SUẤT tăng 9x
→ Đây là dấu hiệu cách điện suy giảm nghiêm trọng (PRPD: corona/surface discharge)
```

### Kế hoạch
```csharp
// Hàm mới: AnalyzePdFrequency(deviceId, readings, days=7)
// 1. Lấy readings PD trong 7 ngày
// 2. Đếm số readings vượt ngưỡng "sự kiện PD" (ví dụ > 2.0 dB) theo từng ngày
// 3. Tính tỉ lệ: tuần này / tuần trước
// 4. Nếu tăng > 3x → Alert warning "Tần suất phóng điện tăng 9x so với tuần trước"
// 5. Nếu tăng > 5x → Alert alarm

// Lưu ý: cần định nghĩa "sự kiện PD" = reading > baseline_noise_threshold
// baseline = median(readings_30_ngày_trước)
```

---

## 5. Load Correlation — Đối chiếu tải với nhiệt độ (CBM thật sự)

### Đây là gì
Tiêu chuẩn CBM (Condition-Based Maintenance) yêu cầu biết thiết bị **hoạt động bình thường không**, không chỉ biết nó nóng hay lạnh.

**Logic:**
- Tải MBA tăng 50% → nhiệt tăng theo đường cong vật lý → bình thường
- Tải MBA giữ nguyên → nhiệt tự nhiên tăng vọt → **bất thường → cảnh báo**

### Công thức đơn giản (không cần ML)
```
Thermal_Efficiency = Temperature / Current_Load_Percent

Baseline (30 ngày): mean(Thermal_Efficiency) ± 2σ
Alert nếu: Thermal_Efficiency > baseline + 2σ liên tục 30 phút
```

### Kế hoạch
```csharp
// Hàm mới trong EarlyWarningWorker hoặc class riêng LoadCorrelationAnalyzer:
// 1. Lấy SensorReadings: pointId nhiệt độ + pointId dòng điện (từ PLC DB32)
// 2. Tính thermal_efficiency = temp / (current + 0.001) cho từng timestamp
// 3. Tính baseline = mean + 2*stddev của 30 ngày trước
// 4. Nếu hiện tại > baseline → Alert "Hiệu suất nhiệt bất thường: tải 60% nhưng nhiệt độ như tải 90%"
// 5. Dedup 1h
```

---

## 6. Health Score Nâng cao

### Hiện tại (đơn giản)
```
Score = 100 - (alarms × 20) - (warnings × 5) - (violation × 25) - (offline × 20)
```
Tất cả alarm được trừ như nhau, alarm hôm qua = alarm 10 ngày trước.

### Nâng cấp đề xuất
```
Score = 100
      - Σ(alarm_penalty × decay_factor(age))    // penalty giảm dần theo tuổi
      - Σ(warning_penalty × decay_factor(age))
      - trend_penalty(slope)                     // nếu đang tăng nhanh → trừ thêm
      - delta_t_penalty(ΔT)                      // chênh pha → trừ thêm
      - pd_frequency_penalty(freq_ratio)         // PD tăng vọt → trừ thêm
      - maintenance_overdue_penalty(days)        // quá hạn bảo trì → trừ thêm

decay_factor(age_days) = e^(-0.1 × age_days)  // exponential decay, 7 ngày còn 50%
```

### Kế hoạch sửa HealthScoreWorker.cs
- Thêm decay factor cho từng alert theo tuổi (ngày)
- Thêm trend component từ EarlyWarningWorker output
- Thêm Delta-T component
- Thêm PD frequency component
- Config trọng số trong SystemSettings (admin có thể chỉnh)

---

## 7. AI Cross-validation (cần Jetson)

### Mục tiêu
Tránh báo nhầm: Camera nhiệt thấy điểm nóng → có thể là con mèo nằm sưởi, không phải sự cố thiết bị.

### Luồng
```
Camera nhiệt ISAPI → thermalException → AiDetectionService
  → confidence < 90% → gửi frame sang Jetson: "Kiểm tra có phải người/động vật không?"
  → YOLO trả về: { label: "cat", confidence: 0.87 }
  → Hủy alert quá nhiệt thiết bị
  → Tạo alert "Động vật xâm nhập" thay thế
```

### Kế hoạch
```csharp
// Trong AiDetectionService.ProcessAsync():
// Nếu source == "isapi" && type == "thermal" && confidence < 0.9:
//   → POST http://jetson:8000/validate { frame_url, roi: boundingBox }
//   → Jetson chạy YOLO, trả về { isAnimal: true, label: "cat", confidence: 0.87 }
//   → Nếu isAnimal → đổi type = "intrusion/animal", label = "cat"
//   → Nếu isPerson → đổi type = "intrusion/person"
//   → Nếu isEquipment → giữ nguyên thermal alert
```

---

## 8. ARIMA / LSTM (cần Python trên Jetson)

### Khi nào cần
Linear Regression đủ cho xu hướng đơn giản.
ARIMA/LSTM cần khi:
- Dự báo giá trị cụ thể trong tương lai ("sau 14 ngày sẽ đạt 80°C")
- Phát hiện pattern chu kỳ (nhiệt tăng theo mùa, theo giờ cao điểm)
- Dự báo RUL (Remaining Useful Life) của thiết bị

### Kế hoạch (Phase sau)
```
.NET gửi: POST http://jetson:8000/analyze/trend
Body: { deviceId, pointId, data: [{time, value},...], horizon_days: 30 }

Python trả: {
  "predicted_values": [{time, value, confidence_interval},...],
  "days_to_threshold": 14.5,
  "model": "ARIMA(2,1,2)",
  "r_squared": 0.94
}

.NET nhận → lưu vào DB → hiển thị trên AnalyticsPage
```

---

## 9. Thứ tự triển khai đề xuất

```
Bước 1  Fix Flapping (Hysteresis + Cooldown)     ← RuleEvaluationWorker.cs    Làm ngay
Bước 2  Delta-T phân tích 3 pha                  ← EarlyWarningWorker.cs      Làm ngay
Bước 3  PD Frequency Counting                    ← EarlyWarningWorker.cs      Làm ngay
Bước 4  Load Correlation (CBM thật sự)           ← LoadCorrelationAnalyzer.cs Làm ngay
Bước 5  Health Score nâng cao                    ← HealthScoreWorker.cs       Sau Bước 2-4
Bước 6  Frontend hiển thị: Delta-T, PD Freq      ← AnalyticsPage.ts           Sau Bước 2-3
Bước 7  AI Cross-validation thermal ↔ YOLO       ← AiDetectionService.cs      Cần Jetson
Bước 8  ARIMA/LSTM trend dự báo                  ← ai-python/trend_analyzer   Cần Jetson
```

**Bước 1-5 không cần Jetson, làm được ngay.**

---

## 10. Mapping điểm cảm biến PLC (quan trọng)

Dữ liệu đọc từ PLC S7-1200 DB32:

| Offset | PointId | Mô tả | Đơn vị | Dùng cho |
|--------|---------|-------|--------|---------|
| 0 | DB32_0 | Nhiệt độ Pha A (Pha 1) | °C | Delta-T, Load Correlation |
| 2 | DB32_2 | Nhiệt độ Pha C (Pha 3) | °C | Delta-T |
| 4 | DB32_4 | Nhiệt độ Pha B (Pha 2) | °C | Delta-T |
| 8 | DB32_8 | Phóng điện (PD) | dB | PD Frequency |
| ? | DB32_? | Dòng điện (Current) | A | Load Correlation ← **cần xác nhận offset** |

> ⚠️ Offset dòng điện chưa xác nhận — cần kiểm tra lại với kỹ thuật viên PLC hoặc đọc PlcPollingWorker.cs
