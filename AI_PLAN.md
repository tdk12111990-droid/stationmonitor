# Trạng thái hiện tại & Hướng tiếp theo

## ✅ Đã hoàn thành
1.  **Rule Engine**: Đã gộp tất cả các rules vào nhóm duy nhất là **"Tủ 471"** (xử lý triệt để vấn đề split nhóm).
2.  **test_sdk**: Đã refactor cấu hình tập trung vào `config.py`, hỗ trợ `run_viewer` và `run_web` từ thư mục gốc.

## 🚀 Kế hoạch tiếp theo (Expert View Integration)
Chúng ta sẽ đưa luồng xử lý cao cấp từ `run_viewer` (OpenCV, Dual-stream, Calibration) vào StationMonitor.

### Phương pháp: **AI Stream Relay**
Tôi sẽ tạo một dịch vụ Python (AI Relay) thực hiện:
- Đọc 2 luồng Camera.
- Ghép hình ảnh (Side-by-side).
- Vẽ các điểm nhiệt độ từ SDK lên khung hình.
- Đẩy luồng đã xử lý vào `go2rtc` để Frontend hiển thị như một camera thông thường.

### Câu hỏi cần xác nhận:
1.  **Thiết bị chạy**: Bạn định chạy Backend trên **máy tính (Windows)** hay **Jetson Nano**? (Xử lý video bằng OpenCV sẽ tốn CPU hơn bình thường).
2.  **Hiển thị**: Bạn muốn gộp 2 cam vào thành **1 khung hình duy nhất** (tiết kiệm slot trên Grid) hay vẫn để 2 khung hình riêng?
3.  **Quản lý điểm**: Bạn muốn công cụ vẽ/căn chỉnh điểm đo (Calibration) nằm trực tiếp trên web StationMonitor hay dùng tool `test_sdk` riêng để setup?

Mời bạn xem chi tiết tại [implementation_plan.md](file:///C:/Users/DELL/.gemini/antigravity/brain/01b26a69-73e5-44e2-bedc-f50c6609ee17/implementation_plan.md) và cho tôi ý kiến để thực hiện.
