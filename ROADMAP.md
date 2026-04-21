# StationMonitor — ROADMAP

> File này là **nguồn sự thật duy nhất** về kế hoạch và tiến độ dự án.
> Cập nhật file này khi hoàn thành phase hoặc thay đổi kế hoạch.

---

## PHASES ĐÃ HOÀN THÀNH

| Phase | Tên | Mô tả ngắn |
|-------|-----|------------|
| 1 | Auth & JWT | Đăng nhập, refresh token, role-based access |
| 2 | Station & Device CRUD | Quản lý trạm, thiết bị, cấu hình |
| 3 | PLC Polling | Siemens S7-1200, Modbus, lưu SensorReadings |
| 4 | Realtime SignalR | Hub `/ws/realtime`, SensorUpdate, AlertNew |
| 5 | Analytics | Lịch sử time-series, export CSV/XLSX |
| 6 | Rule Engine | Tạo/sửa rule, đánh giá 5s, alert + maintenance action |
| 7 | Alert Management | Danh sách alert, lịch sử, đóng/xác nhận |
| 8 | Maintenance | Task CRUD, lịch bảo dưỡng, lịch sử thực hiện |
| 9 | Health Score | Tính điểm sức khỏe thiết bị theo rule |
| 10 | Cloud Sync | Supabase sync queue, retry logic |
| 11 | Protocol Support | Modbus TCP/RTU, BACnet, SNMP |

---

## SPRINT HIỆN TẠI — Camera & AI Pipeline

### Mục tiêu
- Hiển thị 10 điểm đo nhiệt lên camera 152 (thermal + quang học)
- Màu sắc điểm theo rule: xanh / vàng / đỏ
- Khi vượt ngưỡng ~10s → Alert + chụp ảnh bằng chứng
- Camera 153 (phóng điện) không hiển thị điểm nhiệt

### Trạng thái
| Hạng mục | Trạng thái |
|----------|-----------|
| enhanced_relay.py gửi data 2 thiết bị (thermal + optical) | ✅ Xong |
| Canvas overlay với letterbox correction (thermal 384×288) | ✅ Xong |
| Màu xanh/vàng/đỏ theo rule (loadThresholds + _thresholds cache) | ✅ Xong |
| RuleEvaluationWorker đọc camera_filter_time_s (10s delay) | ✅ Xong |
| Fix crash /api/v1/points (GetInt16, IsDBNull) | ✅ Xong |
| Fix SignalR URL → full URL với API_BASE_URL | ✅ Xong |
| ThermalEvidenceService chụp snapshot khi alert | ✅ Xong |
| **Test end-to-end: sửa rule → đổi màu → alert → ảnh** | 🔄 Cần test |

### Cần làm để hoàn thành sprint
1. Restart backend để apply tất cả thay đổi
2. Chạy `start.bat` và test pipeline đầy đủ
3. Verify camera_filter_time_s từ Settings page được áp dụng đúng

---

## PHASE TIẾP THEO — Jetson AI Integration

### AI-1: Kết nối Jetson Nano
- Deploy enhanced_relay.py lên Jetson
- Jetson nhận RTSP từ camera 152, xử lý SDK thermal
- Gửi data về backend qua HTTP ingest

### AI-2: Phát hiện phóng điện (Camera 153)
- Chạy model YOLOv8/anomaly detection trên Jetson
- Ingest kết quả về backend dưới dạng DetectionEvent
- Hiển thị trên frontend (không dùng canvas overlay nhiệt)

### AI-3: Dashboard AI
- Trang riêng cho AI events (detection history, heatmap)
- Filter theo camera, loại sự kiện, thời gian
- Export report

---

## PHASE SAU — Mobile App

- React Native app (thư mục `app-mobile/`)
- Xem realtime alerts, danh sách trạm
- Push notification khi có alarm

---

## Cấu trúc tài liệu

```
ROADMAP.md                  File này — phases & kế hoạch
PROGRESS.md                 Tiến độ từng module (nhìn 1 chỗ thấy hết)
SPRINT.md                   Sprint hiện tại, bugs đang track
CLAUDE.md                   Hướng dẫn cho Claude Code (index tài liệu)

docs/
  system.md                 Kiến trúc tổng thể
  setup.md                  Hướng dẫn cài đặt từng thành phần
  conventions.md            Quy tắc code bắt buộc
  modules/
    camera.md               SDK relay, canvas overlay, thermal pipeline
    alerts.md               Rule engine, alert lifecycle, evidence
    analytics.md            Time-series, health score, reports
    protocols.md            Modbus, S7, BACnet, SNMP, IEC-104
    mobile.md               React Native, push notification
    jetson-ai.md            Jetson AI phases plan
    auth.md                 JWT, roles, audit log
  archive/                  Tài liệu cũ (29 file)

backend/docs/
  KNOWN-ISSUES.md           Bug đã gặp và cách fix (đọc trước khi debug)
  CHANGELOG.md              Nhật ký kỹ thuật theo ngày
```

---

*Cập nhật lần cuối: 2026-04-19*
