# KẾ HOẠCH NÂNG CẤP VÒNG ĐỜI CẢNH BÁO (ALARM WORKFLOW PLAN)

*Tài liệu phác thảo kiến trúc luồng xử lý cảnh báo (Sinh ra -> Chờ duyệt -> Duyệt -> Đóng) dành cho Dự án StationMonitor.*

---

## 1. CẤU HÌNH LUẬT VÀ GIAO DIỆN CHUYÊN SÂU (FRONTEND & DATABASE)
Hệ thống UI được thiết kế thông minh, tái sử dụng trên diện rộng và chống rác:
- **Tại Trang Quản lý Luật (Rule Engine Page):** Mỗi điểm (Point 1 -> 10) có 2 ô cấu hình riêng biệt:
  - Ô **Pre-Alarm:** Mức cảnh cáo (Màu Cam). Ví dụ: 55°C. Xóa trống ô này = Tắt mức Cảnh Cáo.
  - Ô **Alarm:** Mức Báo động Kích Nổ (Màu Đỏ). Ví dụ: 70°C. Xóa trống ô này = Tắt mức Báo Động.
  - Test Case: P1 = Alarm 30°C ở chế độ mặc định OFF. Từ P2-P10 = 55°C/70°C.
- **Tại Trang Cài Đặt Chung (Settings Page):** Dựng UI Linkage Actions. Có nút Delay Filter Time, Checkbox Email, Checkbox Quay Video/Chụp Ảnh.
- **Bộ Hiển Thị Lan Tỏa (Omni-Logging):** Bất cứ nơi nào hiển thị Danh sách Cảnh Báo (như **DashboardPage, RealtimeMonitorPage, AlertsHistoryPage, AuditLogPage**) đều chung 1 thiết kế: Có **Ảnh Thumbnail cực mịn**, và Bấm vào tự động đè Modal HD/Video Playback ra giữa màn hình!

## 2. NÂNG CẤP LÕI PYTHON (AI / OPENCV TRẠM GÁC)
Lõi `enhanced_relay.py` sẽ đóng vai trò Mắt Thần, xử lý cực kì tinh vi:
- **(A) Đổi màu Realtime và Chấm Crosshair:** Nhận diện mức độ từ Backend.
  - Bình thường: Nhiệt độ + Chấm Crosshair ngắm bắn là O Xanh Lá.
  - Vượt Pre-Alarm (Cam): Chấm ngắm bắn và Chữ giật sang **Màu Cam**.
  - Vượt Alarm (Đỏ): Chấm ngắm Crosshair và Chữ giật đùng đùng **MÀU ĐỎ CỜ**. Ngay lập tức Nổ Alert!
- **(A) Đổi màu Realtime Nhúng thẳng Video:** 
  - Nhiệt an toàn: Xanh Lá nhẹ nhàng.
  - Vượt ngưỡng Cam: Chữ hiện viền **Màu Cam**.
  - Vượt Báo Động Đỏ: Chữ giật chớp **MÀU ĐỎ CỜ**. 
- **(B) Phản Ứng Đa Tầng Cực Lanh Kèm LƯU LÙI QUÁ KHỨ (Pre-Recording):**
  - OpenCV sẽ tích hợp một bộ nhớ tạm RAM Lưu 5 giây quá khứ (Rolling Buffer). 
  - Khi có cảnh báo xác nhận (Đã vượt đủ 10 giây Filter Time), nó sẽ **CHỤP** 1 bức ảnh gửi đi. 
  - ĐỒNG THỜI, nó gom 5 giây quá khứ + quay thêm 5 giây tương lai = Video 10 giây. Điều này giúp Video báo động sẽ thấy rõ CẢNH TƯỢNG TRƯỚC KHI BỐC CHÁY! Đây là công nghệ độc quyền của các hệ thống ngàn đô.
  - Vẫn giữ nguyên logic chống bão `Cooldown 15 phút` để không làm cháy nghẹn Ổ cứng Server.
- **(C) Upload Đa Luồng (Async Threading):** 
  - Bắn file Ảnh/Video MP4 lên Web ngầm (Thread), không tranh cướp tốc độ hiển thị khung hình Live 20fps của người trực. Mượt mà láng lẩy!
- **(D) Ép Cân Tối Đa (Video Edge Compression):**
  - Không xài chuẩn `mp4v` thô kệch của OpenCV vì 10s có thể phình tới 15MB. Python sẽ sử dụng lệnh ngầm gọi `FFMPEG libx264` với chuẩn `CRF-28` để ép cục Video 10 giây xuống **chỉ còn dưới 1 MB** trước khi đẩy lên mạng! Vừa nhẹ ổ cứng, vừa nhẹ cáp quang.

## 2B. GỢI Ý THÊM NHỮNG TÍNH NĂNG "HOT" CHO BẢN SETTING:
- **Lịch Giám Sát (Scheduling):** Có thể cài đặt: Chỉ được phép bật luật P1 báo động từ 18:00 đêm đến 06:00 sáng.
- **Chế độ Bảo Trì (Mute / Snooze):** Nút tắt gác nhanh 1 Điểm trong vòng 60 phút khi có nhân viên đang đứng cầm máy sưởi/khò sửa chữa, tránh hệ thống gào thét báo cháy.
- **Leo Thang Cảnh Báo (Escalation):** Cảnh báo nào quá 5 phút chưa có ai nhấn Nút `[ĐÃ XỬ LÝ (ACK)]` thì tự động bắn Email khẩn cấp cho Quản trị viên trạm.

## 3. CƠ CHẾ VÒNG ĐỜI TRÊN WEB (LIFECYCLE ALARM)
Đây là tiêu chuẩn An ninh mức độ 1: *"Cảnh báo chỉ Tắt khi Con người Khớp lệnh"*.
- **Sinh ra (Triggered):** Ghi nhận mốc sinh ra sự kiện (`TriggeredAt`). Backend nhận File ảnh/File MP4.
- **Duy trì Khủng Hoảng (Persistent Pulse):** Alert ở trạng thái `Open`. Giao diện màn hình `RealtimeMonitorPage` sẽ áp hiệu ứng viền Đỏ Nhấp Nháy (Border Pulsing) bo quanh Camera 152. Dù nhiệt độ ngoài thực địa có nguội đi, cái viền Đỏ Cảnh cáo vẫn Cứ Nháy liên hồi! Nháy cho tới khi có ai đó check.
- **Thu thập (Thumbnail Logic):** Danh sách "Nhật ký cảnh báo" bên phải màn hình nếu Cảnh báo đó do Camera thì sẽ thu nhỏ Cục Ảnh chèn vô (Thumbnail). Báo bằng Cảm Biến Khói/Rò rỉ (không hình) thì để dạng Icon Chuông cháy cho khỏi vỡ UI.
- **Khép Án (Closing & Resolving):** Người trực click vào Alert, nhập Log "Đã check, báo cháy giả dọn rác bốc khói", rổi bấm `[ACK / CLOSE ALERT]`. Lúc đó thời gian chốt sổ `ClosedAt` (Kết thúc) mới được tính. Lúc này Khung Stream Camera mới Tạm dứt Nháy đỏ.

## 4. GIAO DIỆN XEM CHỨNG CỨ (MODAL / DETAIL PAGE)
- **Đang ở Realtime Trang Trực Ca:** Double-click hoặc bấm `[Mở]` ở thẻ Lịch sử, Web sẽ nhảy ra một **Modal Popup** cực cuốn: Nửa trên chiếu Ảnh Cực Đại, nửa dưới chèn Thẻ `<video controls>` để Play lại 10 Giây tội phạm vừa qua. Không cần rời trang Live!
- **Đang ở trang Overview/Dashboard:** Bấm vào báo động rẽ thẳng Tab chuyên dụng `Alert Detail Page` chứa đầy đủ Nhật ký điều tra.

---

## 5. BẢN ĐỒ KỸ THUẬT: CÁC FILE CHÍNH XÁC PHẢI SỬA

### 5.1 Giai đoạn Backend (C# .NET & SQL)
- `StationMonitor.Api/Controllers/RulesController.cs`: Rút JSON Config mới (`WarningThreshold`, `AlarmThreshold`, `FilterTime`, `LinkageActions`). Bắt buộc code **tương thích ngược (Backward Compatibility)** để không làm gãy Các Rule cảm biến khí gas tủ 471 hiện tại.
- `StationMonitor.Api/Controllers/CameraWebhookController.cs`: Nâng cấp hàm đón nhận `multipart/form-data`, móc thêm đuôi file `*.mp4` (Bên cạnh ảnh JPG) lưu vào ổ đĩa.
- `StationMonitor.Api/Controllers/AlertsController.cs`: Tạo Endpoint mới `[POST] /api/v1/alerts/{id}/close`. Bổ sung cột Entity cấu trúc DB để hứng mốc `ClosedAt`.

### 5.2 Giai đoạn Lõi Camera AI (Python)
- `ai-python/enhanced_relay.py`: 
  - Nối API Web kéo JSON Rule (Tránh hardcode `P1>30`).
  - Viết hàm Timeout lọc Nhiễu thời gian. Làm hiệu ứng đổi chữ Màu Đỏ/Cam `cv2.putText`.
  - Thay đổi Upload: Tách thành 2 luồng Thread. (1 Thread bắn ảnh luôn lập tức, 1 Thread đếm chờ 10s FFMPEG lưu MP4 xong mới ôm file bắn lén về Web). (Giữ file backup `enhanced_relay_v1.py` để nếu văng FFMPEG thì Rollback).

### 5.3 Giai đoạn Frontend (React Web)
- `frontend/src/pages/RuleEnginePage.ts`: Dựng lại Form Setting mô phỏng Checkbox theo giao diện phần cứng Hikvision.
- `frontend/src/pages/RealtimeMonitorPage.ts`: Tạo thẻ nháy viền. Bắt logic websocket SignalR đổi trạng thái Open/Closed của Panel nháy đèn. Đóng gói Modal UI xem báo động.
- `frontend/src/pages/AlertsHistoryPage.ts`: Dựng ô Thumbnail vuông chứa ảnh mini. Gắn nút Xác nhận Close.

## 6. CHIẾN LƯỢC TEST CHỐNG ĐỔ VỠ (REGRESSION TESTS)
Vì lần này chọc vào lõi CSDL Vòng Đời rất sâu, quy trình test trước khi bàn giao bao gồm:
1. **Kiểm tra Gãy Cảm Biến Cũ:** Đặt Rule đôi cho Camera xong, giả lập bắn báo động cho cái *Cảm Biến Tủ 471* để xem giao diện UI và Backend lúc xử lý Cảm biến không ảnh có gãy hay báo Null Reference Exception không!?
2. **Kiểm tra Payload Server:** Bắn thử Video nặng 3MB-5MB xem kịch bản IIS/Kestrel C# có bị nhổ rẹt ra lỗi `413 Payload Too Large` không. (Nếu có phải mở Config giới hạn băng thông trong AppSettings).
3. **Kiểm tra Kẹt Giao Tiếp Web-Socket UI:** Mở 2 Tab Realtime cùng lúc. Tại Tab 1 tắt báo động, nghiệm thu 1 giây sau bên Tab 2 viền camera phải ngừng nháy Đỏ! Test việc đồng nhất thời gian thực.
