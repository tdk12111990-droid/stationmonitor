# PHẦN 1 — TỔNG QUAN HỆ THỐNG
## Phần Mềm Giám Sát Trạm Biến Áp Thông Minh
### TBA 110kV — Giám Sát Online Không Người Trực

---

## 1. Giới Thiệu

Hệ thống **Giám Sát Trạm Biến Áp Thông Minh** là nền tảng phần mềm chuyên dụng được xây dựng dành riêng cho công tác quản lý vận hành trạm biến áp 110kV không người trực. Hệ thống tích hợp đồng bộ ba lớp công nghệ: **giám sát nhiệt độ online**, **camera thông minh có AI**, và **thu thập dữ liệu SCADA** — tất cả hiển thị tập trung trên một giao diện duy nhất, truy cập từ xa 24/7.

Mục tiêu cốt lõi: **Phát hiện sớm nguy cơ sự cố thiết bị trước khi xảy ra**, giúp đơn vị quản lý vận hành chủ động xử lý, giảm thời gian mất điện và chi phí sửa chữa.

---

## 2. Phạm Vi Áp Dụng

Hệ thống được thiết kế triển khai cho:

- **Trạm biến áp 110kV không người trực** (TBA 110kV và các trạm tương đương)
- Giám sát toàn bộ thiết bị sơ cấp trong trạm: máy biến áp, máy cắt, dao cách ly, thanh cái, cáp và các thiết bị đo lường bảo vệ
- Kết nối về **Trung tâm điều độ** theo giao thức chuẩn IEC-60870-5-104
- Có khả năng **mở rộng linh hoạt** — thêm thiết bị, thêm điểm đo, thêm trạm mới mà không cần thay đổi kiến trúc hệ thống

---

## 3. Những Gì Hệ Thống Sẽ Làm Được

### 3.1 Giám Sát Nhiệt Độ Online

Hệ thống sẽ thu thập và hiển thị **liên tục, tự động** nhiệt độ tại các điểm thiết bị trong trạm thông qua hệ thống cảm biến không dây và camera nhiệt. Mỗi điểm đo được hiển thị theo thời gian thực trên sơ đồ một sợi tương tác, với màu sắc phân biệt rõ ràng theo trạng thái:

**Bình thường → Cảnh báo → Nguy hiểm**

Số lượng điểm giám sát có thể **mở rộng theo nhu cầu thực tế** của từng trạm mà không giới hạn.

---

### 3.2 Hiển Thị Sơ Đồ Một Sợi Tương Tác

Toàn bộ thiết bị trong trạm được thể hiện trên **sơ đồ một sợi SVG độ phân giải cao**, tích hợp trực tiếp vào giao diện phần mềm. Người vận hành sẽ:

- Nhìn thấy trạng thái nhiệt độ từng thiết bị ngay trên sơ đồ — không cần mở bảng phụ
- Click vào bất kỳ thiết bị nào để xem **chi tiết giá trị tức thời, lịch sử 24h, xu hướng nhiệt**
- Phát hiện ngay điểm nóng bất thường qua màu sắc cảnh báo tự động
- Xem hình ảnh từ camera tương ứng với thiết bị đang chọn

---

### 3.3 Hệ Thống Camera Giám Sát Tích Hợp

Hệ thống tích hợp đồng thời nhiều loại camera phục vụ các mục đích khác nhau:

- **Camera nhiệt**: Phát hiện điểm nóng, theo dõi phát nhiệt thiết bị, hỗ trợ chuẩn đoán sự cố từ xa
- **Camera phát hiện phóng điện**: Giám sát hiện tượng phóng điện cục bộ (PD) tại các vị trí thiết bị quan trọng
- **Camera quan sát**: Giám sát an ninh, phát hiện người ra vào khu vực trạm

Tất cả luồng camera được xem trực tiếp (live stream) và lưu trữ tự động khi phát hiện sự kiện bất thường.

---

### 3.4 AI Phát Hiện Nguy Cơ Sự Cố

Module trí tuệ nhân tạo tích hợp sẽ:

- **Tự động phân tích** xu hướng nhiệt độ của từng thiết bị theo thời gian
- **Dự báo sớm** khả năng sự cố dựa trên tốc độ tăng nhiệt bất thường
- **Phát hiện người lạ** trong khu vực trạm qua camera quan sát
- **Chẩn đoán nguyên nhân** cảnh báo nhiệt: tiếp xúc kém, quá tải, môi trường
- **Đề xuất hành động** xử lý tương ứng với từng loại cảnh báo

---

### 3.5 Cảnh Báo Thông Minh — Đúng Người, Đúng Lúc

Hệ thống sẽ cảnh báo **chủ động, tự động** theo nhiều kênh:

- **Giao diện phần mềm**: Popup, âm thanh, màu đỏ nhấp nháy ngay tại màn hình vận hành
- **Email**: Gửi báo cáo cảnh báo kèm ảnh nhiệt đến danh sách người phụ trách
- **Push notification** đến điện thoại di động
- **IEC-60870-5-104**: Tự động gửi điểm cảnh báo về **Trung tâm điều độ** theo chuẩn giao thức ngành điện

Ngưỡng cảnh báo được cấu hình linh hoạt theo từng loại thiết bị và có thể điều chỉnh bởi người quản trị mà không cần can thiệp vào phần mềm.

---

### 3.6 Lịch Sử & Phân Tích Dữ Liệu

Toàn bộ dữ liệu nhiệt độ và sự kiện cảnh báo được lưu trữ dài hạn vào **cơ sở dữ liệu thời gian thực**, cho phép:

- Xem lại **biểu đồ nhiệt độ** của bất kỳ điểm đo nào trong khoảng thời gian tùy chọn (1 giờ / 1 ngày / 1 tuần / 1 tháng / 1 năm)
- **Phân tích xu hướng** dài hạn để lập kế hoạch bảo trì thiết bị
- **Tra cứu lịch sử cảnh báo** với bộ lọc đa chiều: thiết bị, loại cảnh báo, thời gian, người xử lý
- **Xuất dữ liệu** dạng CSV hoặc Excel để phân tích thêm bên ngoài

---

### 3.7 Báo Cáo Tự Động

Hệ thống sẽ tự động tạo và gửi báo cáo theo lịch đã cấu hình:

- **Báo cáo ngày**: Tổng hợp nhiệt độ max/min/trung bình toàn trạm, danh sách cảnh báo trong ngày
- **Báo cáo tháng**: Thống kê thiết bị theo trạng thái, biểu đồ xu hướng nhiệt, số lần cảnh báo
- **Báo cáo sự kiện**: Phát sinh ngay sau mỗi sự kiện cảnh báo quan trọng, kèm ảnh và đề xuất xử lý
- **Báo cáo bảo trì**: Lịch bảo trì định kỳ theo CBM (Condition-Based Maintenance) dựa trên tình trạng thực tế thiết bị

Tất cả báo cáo xuất được dưới dạng **PDF chuẩn**, sẵn sàng trình ký và lưu hồ sơ.

---

### 3.8 Quản Lý Phân Quyền Nhiều Cấp

| Cấp độ | Quyền hạn |
|---|---|
| **Operator** (Trực ban) | Xem dashboard, nhận cảnh báo, ghi nhận xử lý |
| **Manager** (Quản lý trạm) | Xem báo cáo, phê duyệt công việc bảo trì, cấu hình ngưỡng |
| **Admin** (Quản trị hệ thống) | Toàn quyền: thêm thiết bị, tài khoản, cập nhật cấu hình |

Mọi thao tác đều được ghi vào **nhật ký kiểm toán (Audit Log)** — ai làm gì, lúc nào, thay đổi gì — phục vụ kiểm tra, tra cứu khi cần.

---

### 3.9 Kết Nối Mở — Tích Hợp Hệ Thống Khác

Hệ thống được thiết kế **mở**, sẵn sàng kết nối và mở rộng với:

- **Trung tâm điều độ EVN** qua IEC-60870-5-104
- **Hệ thống SCADA** hiện có của đơn vị qua REST API
- **Phần mềm quản lý tài sản** (EAM/ERP) qua API chuẩn
- **Hệ thống cảm biến, thiết bị đo lường** theo giao thức Modbus RTU/TCP và ONVIF
- **Mở rộng thêm trạm mới** vào hệ thống quản lý tập trung mà không thay đổi kiến trúc

---

## 4. Kiến Trúc Hệ Thống Tổng Thể

```
                    ┌─────────────────────────┐
                    │    TRUNG TÂM ĐIỀU ĐỘ    │
                    │   (IEC-60870-5-104)     │
                    └────────────┬────────────┘
                                 │ WAN-IT (độc lập)
┌──────────────────────────────────────────────────────────────┐
│                         CLOUD                                 │
│   ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│   │   Database   │  │ API Gateway │  │  Push Notification │ │
│   │  (lịch sử   │  │ (Cloudflare)│  │  (Firebase FCM)    │ │
│   │  dài hạn)   │  │             │  │                    │ │
│   └──────────────┘  └─────────────┘  └────────────────────┘ │
└───────────┬──────────────────────────────────┬───────────────┘
            │ HTTPS / WebSocket                │ Push
            │                          ┌───────▼──────────────┐
            │                          │   MOBILE / DESKTOP   │
            │                          │  Android  │  iOS     │
            │                          │  Windows  │  macOS   │
            │                          └──────────────────────┘
            │ WAN-IT
┌───────────▼──────────────────────────────────────────────────┐
│                    JETSON ORIN NANO (TẠI TRẠM)               │
│                                                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   AI Engine     │  │  API Backend │  │     go2rtc      │ │
│  │  (TensorRT +    │  │  + Database  │  │  Camera Stream  │ │
│  │   YOLO)         │  │  + IEC 104   │  │  (RTSP→WebRTC)  │ │
│  └─────────────────┘  └──────────────┘  └─────────────────┘ │
└──────────────┬────────────────────────────┬──────────────────┘
               │ LAN nội bộ trạm            │
   ┌───────────▼──────────┐    ┌────────────▼─────────────────┐
   │   HỆ THỐNG CAMERA    │    │     BỘ THU THẬP DỮ LIỆU      │
   │  - Camera nhiệt      │    │  - Cảm biến không dây        │
   │  - Camera phóng điện │    │    (Modbus RTU/TCP)           │
   │  - Camera quan sát   │    │  - PLC / RTU                  │
   │  (ONVIF / RTSP)      │    │  - Thiết bị đo lường          │
   └──────────────────────┘    └───────────────────────────────┘

         ┌──────────────────────────────────┐
         │   MÁY TÍNH VẬN HÀNH (TẠI TRẠM)  │
         │   Desktop App — Windows/macOS    │
         │   Kết nối trực tiếp LAN trạm    │
         └──────────────────────────────────┘
```

> **Chú thích:**
> - **WAN-IT & Trung tâm điều độ**: Chỉ áp dụng khi triển khai thực tế tại trạm vận hành, kết nối lên hệ thống điều độ EVN qua giao thức IEC-60870-5-104. Với trạm thí nghiệm hoặc giai đoạn phát triển, thành phần này chưa cần thiết.
> - **Cloud**: Bắt đầu cần từ khi triển khai mobile app hoặc quản lý từ xa. Trạm đơn lẻ chạy LAN vẫn hoạt động đầy đủ mà không cần cloud.
> - **Đa trạm**: Khi mở rộng nhiều trạm, cloud đóng vai trò trung tâm tổng hợp dữ liệu — mỗi trạm kết nối lên cùng một cloud, quản lý tập trung từ một giao diện duy nhất.

---

## 5. Nền Tảng Triển Khai

Hệ thống được phát triển đa nền tảng — **một bộ phần mềm , chạy trên tất cả thiết bị** mà không cần phát triển riêng lẻ cho từng nền tảng:

### Ứng Dụng Desktop (Tại Trạm & Văn Phòng)

| Nền tảng | Mô tả |
|---|---|
| **Windows 10/11** | Cài đặt tại máy tính phòng điều khiển trạm, màn hình lớn, đầy đủ chức năng |
| **macOS** | Dành cho kỹ sư, quản lý sử dụng tại văn phòng hoặc làm việc từ xa |

Ứng dụng desktop có toàn bộ chức năng: dashboard, camera, cảnh báo, báo cáo, quản trị hệ thống. Hoạt động hoàn toàn trên LAN nội bộ, không cần Internet.

### Ứng Dụng Di Động (Giám Sát Từ Xa)

| Nền tảng | Mô tả |
|---|---|
| **Android** | Hỗ trợ điện thoại và máy tính bảng Android |
| **iOS (iPhone / iPad)** | Hỗ trợ đầy đủ trên thiết bị Apple |

Ứng dụng di động tập trung vào **theo dõi và cảnh báo từ xa**: xem trạng thái trạm, nhận thông báo tức thì, xem camera live, xác nhận xử lý sự kiện — mọi lúc, mọi nơi có Internet.

### Giao Diện Chính (Các Màn Hình)

- **Dashboard**: Sơ đồ một sợi toàn trạm với trạng thái nhiệt độ real-time
- **Camera**: Xem đồng thời nhiều luồng camera nhiệt, phóng điện và quan sát
- **Cảnh báo**: Danh sách cảnh báo theo thời gian thực, phân loại mức độ
- **Phân tích**: Biểu đồ xu hướng nhiệt độ, thống kê theo thiết bị
- **Báo cáo**: Tạo và xuất báo cáo PDF theo mẫu

---

## 6. Hoạt Động Liên Tục — Không Phụ Thuộc Internet

Đây là một trong những điểm khác biệt quan trọng của hệ thống: **toàn bộ chức năng vận hành cốt lõi hoạt động hoàn toàn trên mạng LAN nội bộ tại trạm**, không phụ thuộc vào đường truyền Internet bên ngoài.

- **Mất Internet vẫn hoạt động bình thường**: Thu thập dữ liệu cảm biến, hiển thị sơ đồ một sợi, xem camera, cảnh báo tự động — tất cả vẫn chạy liên tục trên LAN trạm
- **Dữ liệu không bị gián đoạn**: Hệ thống tiếp tục lưu trữ và xử lý dữ liệu cục bộ trong suốt thời gian mất kết nối
- **Tự đồng bộ khi có lại mạng**: Toàn bộ dữ liệu tích lũy trong thời gian offline được tự động đẩy lên cloud khi kết nối được khôi phục

---

## 7. Giám Sát Từ Xa Qua Điện Thoại Di Động

Người quản lý và kỹ sư vận hành có thể theo dõi trạng thái trạm **mọi lúc, mọi nơi** thông qua điện thoại di động:

- **Xem dashboard** trạng thái toàn trạm theo thời gian thực
- **Nhận cảnh báo tức thì** qua push notification ngay khi có sự kiện bất thường
- **Xem camera live** từ xa qua kết nối Internet hoặc VPN
- **Tra cứu lịch sử** cảnh báo và dữ liệu nhiệt độ bất kỳ lúc nào
- **Xác nhận xử lý** sự kiện cảnh báo ngay trên điện thoại mà không cần có mặt tại trạm

Giao diện di động được tối ưu hiển thị trên cả **iOS và Android**, không cần cài đặt ứng dụng riêng.

---

## 8. Lưu Trữ Dữ Liệu Trên Cloud

Toàn bộ dữ liệu vận hành được lưu trữ song song trên **nền tảng đám mây (cloud)**, đảm bảo an toàn và truy cập linh hoạt:

- **Lưu trữ dài hạn**: Lịch sử nhiệt độ, cảnh báo, ảnh chụp sự kiện được lưu trên cloud tối thiểu 5 năm
- **Sao lưu tự động**: Dữ liệu tại trạm được đồng bộ định kỳ lên cloud — không lo mất dữ liệu khi thiết bị tại trạm gặp sự cố
- **Truy cập từ bất kỳ đâu**: Người quản lý cấp cao có thể xem báo cáo, lịch sử của nhiều trạm cùng lúc trên một giao diện duy nhất
- **Quản lý đa trạm tập trung**: Một tài khoản cloud quản lý toàn bộ các trạm trong hệ thống, so sánh tình trạng giữa các trạm với nhau
- **Chi phí vận hành thấp**: Hạ tầng cloud được tối ưu để giảm thiểu chi phí lưu trữ, phù hợp cho triển khai quy mô lớn

---

## 9. Cam Kết Hệ Thống

| Tiêu chí | Cam kết |
|---|---|
| Thời gian cập nhật dữ liệu | ≤ 5 giây |
| Độ chính xác cảnh báo nhiệt | ±2°C (theo thiết bị đo) |
| Uptime hệ thống | ≥ 99.5% |
| Lưu trữ lịch sử | Tối thiểu 5 năm |
| Khả năng mở rộng | Không giới hạn điểm đo, thiết bị, trạm |
| Thời gian bảo hành phần mềm | 12 tháng |
| Hỗ trợ kỹ thuật | 24/7 qua hotline và remote |

---

*Tài liệu này mô tả phạm vi và năng lực của hệ thống Giám Sát Trạm Biến Áp Thông Minh.
Chi tiết kỹ thuật từng phân hệ được trình bày trong Phần 2, 3, 4 của tài liệu kỹ thuật đầy đủ.*
