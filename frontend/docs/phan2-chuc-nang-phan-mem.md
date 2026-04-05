# PHẦN 2 — CHỨC NĂNG PHẦN MỀM
## Mô Tả Chi Tiết Các Module Chức Năng

---

# PHẦN 2A — QUẢN LÝ ĐA TRẠM
## Giám Sát Tập Trung Nhiều Trạm Biến Áp

---

## 2A.1 Màn Hình Tổng Quan Đa Trạm

Đây là màn hình đầu tiên người dùng cấp quản lý nhìn thấy sau khi đăng nhập. Toàn bộ các trạm biến áp trong hệ thống được hiển thị tập trung trên **một bản đồ địa lý tương tác**, cho phép nắm bắt tình trạng toàn hệ thống chỉ trong vài giây.

### Tính năng chính

- **Bản đồ trạm**: Hiển thị vị trí địa lý từng trạm trên bản đồ, có thể zoom in/out, di chuyển tự do
- **Trạng thái trực quan**: Mỗi trạm hiển thị màu theo tình trạng vận hành:
  - 🟢 **Xanh** — Bình thường, không có cảnh báo
  - 🟡 **Vàng** — Có cảnh báo mức Warning, cần theo dõi
  - 🔴 **Đỏ** — Có cảnh báo mức Alarm, cần xử lý ngay
  - ⚫ **Xám** — Mất kết nối, không nhận được dữ liệu
- **Thông tin nhanh**: Di chuột vào trạm hiển thị popup tóm tắt — nhiệt độ cao nhất, số cảnh báo đang mở, trạng thái kết nối, thời gian cập nhật gần nhất
- **Bảng danh sách trạm**: Song song với bản đồ, hiển thị danh sách dạng bảng có thể sắp xếp, lọc theo tên, khu vực, trạng thái
- **Thống kê tổng hợp**: Góc màn hình hiển thị tổng số trạm, số trạm đang có cảnh báo, tổng số sự kiện chưa xử lý trong ngày

### Luồng thao tác điển hình

1. Quản lý đăng nhập → thấy ngay bản đồ toàn bộ trạm
2. Phát hiện trạm đỏ → click vào xem popup tóm tắt
3. Click **"Vào chi tiết"** → chuyển sang Dashboard của trạm đó
4. Xử lý xong → quay lại bản đồ theo dõi tiếp

---

## 2A.2 So Sánh Giữa Các Trạm

Người quản lý cấp cao có thể so sánh tình trạng vận hành giữa nhiều trạm cùng lúc:

- **So sánh nhiệt độ**: Biểu đồ đặt song song nhiệt độ trung bình / cao nhất của các trạm theo thời gian
- **Xếp hạng trạm**: Danh sách trạm sắp xếp theo mức độ cảnh báo, nhiệt độ cao, số sự kiện
- **Báo cáo tổng hợp đa trạm**: Xuất báo cáo so sánh tất cả trạm theo ngày / tháng / năm

---

## 2A.3 Quản Lý Cấu Hình Đa Trạm

- **Thêm trạm mới**: Nhập thông tin trạm, địa chỉ kết nối, vị trí địa lý — trạm mới xuất hiện ngay trên bản đồ
- **Phân quyền theo trạm**: Mỗi tài khoản có thể được cấp quyền truy cập một hoặc nhiều trạm cụ thể
- **Cấu hình tập trung**: Thay đổi ngưỡng cảnh báo, danh sách người nhận thông báo cho từng trạm từ một giao diện duy nhất

---
---

# PHẦN 2B — CHỨC NĂNG CHI TIẾT TỪNG TRẠM
## Các Module Vận Hành Tại Từng Trạm Biến Áp

---

## 2B.1 Dashboard — Trung Tâm Điều Hành Trạm

Dashboard là màn hình chính khi vận hành một trạm cụ thể. Toàn bộ thông tin quan trọng được hiển thị đồng thời trên một màn hình duy nhất.

### Sơ đồ một sợi tương tác
- Sơ đồ một sợi của trạm hiển thị ở trung tâm màn hình, độ phân giải cao, có thể zoom và kéo thả tự do
- Mỗi thiết bị trên sơ đồ có **chấm màu** thể hiện trạng thái nhiệt độ theo thời gian thực
- Click vào thiết bị bất kỳ → xem ngay giá trị tức thời, lịch sử 24h, xu hướng nhiệt
- Kéo thả vị trí các điểm giám sát để khớp với thực tế lắp đặt
- Zoom to/nhỏ sơ đồ, các điểm giám sát tự động di chuyển theo

### Các ô thông tin nổi (có thể thu gọn)
- **Chỉ số hệ thống**: Nhiệt độ cao nhất, số sự kiện phóng điện, số thiết bị online, số cảnh báo đang mở
- **Nhật ký cảnh báo**: Danh sách sự kiện mới nhất, cập nhật tự động, nền trắng dễ đọc
- **Camera live**: Khung xem camera trực tiếp ngay trên dashboard, có nút chuyển sang xem toàn màn hình

### Thanh công cụ
- Khóa/mở khóa chế độ chỉnh sửa vị trí điểm giám sát
- Thêm điểm giám sát mới lên sơ đồ
- Fit sơ đồ vừa màn hình
- Bộ lọc hiển thị theo loại thiết bị

---

## 2B.2 Giám Sát Camera Trực Tiếp

Màn hình xem toàn bộ hệ thống camera của trạm.

### Tính năng chính
- **Xem đa camera**: Hiển thị đồng thời nhiều luồng camera trên cùng một màn hình, bố cục lưới có thể tùy chỉnh (1/4/9 camera)
- **Phóng to một camera**: Double-click vào bất kỳ camera nào để xem toàn màn hình
- **Camera nhiệt**: Hiển thị ảnh nhiệt màu giả (false color), tự động đánh dấu điểm nóng vượt ngưỡng
- **Camera phóng điện**: Hiển thị và ghi lại hiện tượng phóng điện cục bộ (PD) tại các vị trí thiết bị
- **Chụp ảnh thủ công**: Lưu ảnh tại thời điểm bất kỳ kèm ghi chú
- **AI overlay**: Khung nhận diện tự động hiển thị trên video — người, thiết bị bất thường, điểm nóng
- **Lịch sử ảnh sự kiện**: Xem lại ảnh và video đã lưu khi có sự kiện cảnh báo

---

## 2B.3 Nhật Ký & Xử Lý Cảnh Báo

Trung tâm quản lý toàn bộ sự kiện cảnh báo của trạm.

### Tính năng chính
- **Danh sách cảnh báo real-time**: Cập nhật tức thì khi có sự kiện mới, sắp xếp theo thời gian mới nhất
- **Phân loại mức độ**: Warning (vàng) / Alarm (đỏ) / Normal (xanh)
- **Bộ lọc đa chiều**: Lọc theo thiết bị, loại cảnh báo, mức độ, khoảng thời gian, người xử lý
- **Xác nhận xử lý (ACK)**: Ghi nhận đã tiếp nhận sự kiện, ai xử lý, thời gian xử lý
- **Ghi chú xử lý**: Người vận hành ghi lại nguyên nhân và biện pháp đã thực hiện
- **Xem chi tiết**: Click vào sự kiện → xem biểu đồ nhiệt độ tại thời điểm xảy ra, ảnh camera kèm theo
- **Xuất CSV**: Xuất toàn bộ lịch sử cảnh báo để lưu hồ sơ hoặc phân tích thêm

---

## 2B.4 Phân Tích & Xu Hướng

Công cụ phân tích dữ liệu lịch sử, hỗ trợ ra quyết định bảo trì và vận hành.

### Tính năng chính
- **Biểu đồ xu hướng**: Hiển thị lịch sử nhiệt độ của bất kỳ điểm đo nào theo thời gian tùy chọn — 1 giờ / 1 ngày / 1 tuần / 1 tháng / 1 năm
- **So sánh đa thiết bị**: Đặt nhiều thiết bị trên cùng biểu đồ để so sánh xu hướng nhiệt
- **Live mode**: Biểu đồ tự cập nhật theo thời gian thực, quan sát diễn biến ngay khi đang xảy ra
- **Phân bổ cảnh báo**: Biểu đồ thống kê tỷ lệ loại cảnh báo, thiết bị nào phát sinh nhiều nhất
- **Nhận diện bất thường**: Hệ thống tự động đánh dấu các điểm dữ liệu bất thường trên biểu đồ

---

## 2B.5 Báo Cáo

Tạo và quản lý báo cáo vận hành trạm.

### Các loại báo cáo
- **Báo cáo ngày**: Tổng hợp toàn bộ hoạt động trong ngày — nhiệt độ max/min/trung bình, danh sách cảnh báo, thống kê thiết bị
- **Báo cáo tháng / năm**: Thống kê dài hạn, biểu đồ xu hướng, so sánh các kỳ
- **Báo cáo sự kiện**: Tạo ngay sau sự kiện quan trọng, kèm ảnh camera, diễn biến nhiệt độ và ghi chú xử lý
- **Báo cáo bảo trì CBM**: Đánh giá tình trạng thiết bị dựa trên dữ liệu thực, đề xuất lịch bảo trì tiếp theo

### Tính năng
- Xem trước báo cáo trước khi xuất
- Xuất PDF chuẩn, sẵn sàng trình ký và lưu hồ sơ
- Tùy chỉnh nội dung báo cáo: chọn thiết bị, khoảng thời gian, loại dữ liệu cần đưa vào
- Tự động gửi báo cáo định kỳ qua email theo lịch đã cấu hình

---

## 2B.6 Rule Engine — Quy Tắc Cảnh Báo Tự Động

Công cụ cho phép người quản trị tự định nghĩa các quy tắc cảnh báo mà không cần can thiệp vào phần mềm.

### Tính năng chính
- **Tạo quy tắc tùy chỉnh**: Định nghĩa điều kiện kích hoạt cảnh báo theo ngưỡng nhiệt độ, tốc độ tăng nhiệt, thời gian kéo dài
- **Điều kiện kết hợp**: Kết hợp nhiều điều kiện (AND/OR) — ví dụ: "nhiệt độ MBA > 80°C VÀ kéo dài hơn 10 phút"
- **Hành động tự động**: Mỗi quy tắc có thể kích hoạt gửi email, push notification, hoặc ghi sự kiện
- **Bật/tắt linh hoạt**: Tắt tạm thời một quy tắc trong khi bảo trì mà không cần xóa
- **Lịch sử kích hoạt**: Xem lại quy tắc nào đã kích hoạt bao nhiêu lần, thời điểm nào

---

## 2B.7 Quản Lý Thiết Bị

Quản lý toàn bộ danh mục thiết bị, cảm biến và camera trong trạm.

### Tính năng chính
- **Danh sách thiết bị**: Xem toàn bộ thiết bị đang giám sát, trạng thái kết nối, thông số kỹ thuật
- **Thêm / sửa / xóa**: Cập nhật thông tin thiết bị, địa chỉ IP, giao thức kết nối
- **Kiểm tra kết nối**: Test kết nối đến thiết bị ngay trong giao diện
- **Chế độ bảo trì**: Đặt thiết bị vào trạng thái bảo trì — hệ thống tạm dừng cảnh báo cho thiết bị đó, tránh cảnh báo giả trong thời gian sửa chữa
- **Lịch sử thiết bị**: Xem lại toàn bộ sự kiện cảnh báo của từng thiết bị từ khi lắp đặt

---

## 2B.8 Quản Lý Người Dùng & Phân Quyền

Quản lý tài khoản và quyền truy cập trong hệ thống.

### Phân cấp quyền hạn

| Cấp độ | Quyền hạn |
|---|---|
| **Operator** (Trực ban) | Xem dashboard, nhận cảnh báo, ghi nhận xử lý |
| **Manager** (Quản lý trạm) | Toàn bộ quyền Operator + xem báo cáo, phê duyệt bảo trì, cấu hình ngưỡng |
| **Admin** (Quản trị hệ thống) | Toàn quyền: thêm thiết bị, quản lý tài khoản, cấu hình hệ thống |

### Tính năng
- Tạo, sửa, khóa tài khoản người dùng
- Phân quyền truy cập theo trạm — mỗi tài khoản chỉ thấy trạm được cấp phép
- **Audit Log**: Toàn bộ thao tác của người dùng được ghi lại tự động — ai đăng nhập, ai xem gì, ai thay đổi gì, lúc nào
- Cài đặt phiên làm việc: thời gian tự động đăng xuất khi không hoạt động

---

## 2B.9 Cài Đặt Hệ Thống

Cấu hình chung cho toàn bộ hệ thống tại trạm.

### Các nhóm cài đặt
- **Thông báo**: Danh sách email nhận cảnh báo, loại cảnh báo nào gửi thông báo, giờ im lặng
- **Kết nối**: Địa chỉ server, cổng kết nối, thông số giao thức IEC 104 lên Trung tâm điều độ
- **Lưu trữ & Backup**: Cấu hình tự động backup lên cloud, chu kỳ backup, dung lượng lưu trữ cục bộ
- **Giao diện**: Ngôn ngữ hiển thị, theme sáng/tối, đơn vị đo lường
- **Thông tin trạm**: Tên trạm, mã trạm, địa chỉ, thông số kỹ thuật cơ bản

---

*Tài liệu này mô tả chi tiết các chức năng phần mềm theo góc nhìn người dùng cuối.
Kiến trúc kỹ thuật và giao thức kết nối được trình bày trong Phần 3 và Phần 4.*
