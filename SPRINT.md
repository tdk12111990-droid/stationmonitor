# SPRINT — Camera & AI Pipeline

> Sprint hiện tại. Cập nhật hàng ngày. Xem lịch sử phase → `ROADMAP.md`.

---

## Mục tiêu sprint

Hoàn thiện pipeline: thermal data → canvas overlay → rule alert → bằng chứng ảnh/video.

---

## Trạng thái

| # | Hạng mục | Status | Ghi chú |
|---|----------|--------|---------|
| 1 | `enhanced_relay.py` gửi dual-device (thermal + optical) | ✅ Xong | |
| 2 | Canvas letterbox correction (384×288 → 16:9 cell) | ✅ Xong | Offset = `(1 - scale) / 2` |
| 3 | Màu điểm xanh/vàng/đỏ theo rule cache | ✅ Xong | `loadThresholds()` cache 30s |
| 4 | `RuleEvaluationWorker` đọc `camera_filter_time_s` | ✅ Xong | 10s delay từ Settings |
| 5 | Fix crash `/api/v1/points` (GetInt16, IsDBNull) | ✅ Xong | |
| 6 | Fix SignalR URL → full URL (`API_BASE_URL`) | ✅ Xong | |
| 7 | `ThermalEvidenceService` chụp snapshot khi alert | ✅ Xong | Lưu `wwwroot/evidence/` |
| 8 | **Test end-to-end đầy đủ** | 🔄 Cần test | Restart → `start.bat` → verify |

---

## Cần làm để close sprint

```bash
# 1. Restart backend (apply tất cả thay đổi)
cd backend/StationMonitor.Api && dotnet run

# 2. Khởi động đầy đủ
start.bat

# 3. Mở trình duyệt → /realtime
# 4. Xác nhận 10 điểm overlay đúng màu
# 5. Đặt rule ngưỡng thấp (~30°C) → chờ 10s → kiểm tra:
#    - Alert hiện trong /alerts
#    - Ảnh bằng chứng có trong wwwroot/evidence/
#    - Email nhận được (nếu SMTP đã config)
# 6. Restore rule ngưỡng thực tế
```

---

## Bugs đang theo dõi

| ID | Mô tả | Priority | File | Status |
|----|-------|----------|------|--------|
| B-01 | Điểm nhiệt không hiển thị (relay chưa chạy hoặc không gửi) | 🔴 **Critical** | `THERMAL-POINTS-FIX.md` | Cần kiểm tra |
| B-02 | Canvas điểm lệch khi video chưa load metadata | Medium | `RealtimeMonitorPageV2.ts` | |
| B-03 | SignalR reconnect fail sau token expire | Low | `stationApi.ts` | |
| B-04 | Hysteresis gap flapping khi value ≈ threshold | Low | `RuleEvaluationWorker.cs` | |

---

## Sprint tiếp theo — Jetson AI

Sau khi close sprint này:

| Mốc | Mục tiêu |
|-----|----------|
| AI-1 | Port `sdk-relay` lên Jetson Orin Nano (Linux ARM64) |
| AI-2 | Tách camera 153 (phóng điện) — không overlay điểm nhiệt |
| AI-3 | Train YOLOv8 phát hiện phóng điện |

Chi tiết: `docs/modules/jetson-ai.md`

---

*Cập nhật: 2026-04-19*
