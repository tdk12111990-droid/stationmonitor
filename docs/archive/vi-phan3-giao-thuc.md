# PHẦN 3 — GIAO TIẾP & KẾT NỐI
## Kiến Trúc Kết Nối Hệ Thống

---

## Tổng Quan Luồng Dữ Liệu

```
 ┌─────────────────────────┐       ┌──────────────────────────────┐
 │    TRUNG TÂM ĐIỀU ĐỘ    │       │     MOBILE / DESKTOP APP     │
 │   (IEC-60870-5-104)     │       │  Android │ iOS │ Win │ macOS │
 └────────────┬────────────┘       └──────────────┬───────────────┘
              │ WAN-IT (độc lập)                  │ HTTPS / WebSocket
              │                                   │ Push (Firebase FCM)
              │              ┌────────────────────▼──────────────────┐
              │              │                CLOUD                   │
              │              │  (Database dài hạn, API Gateway,       │
              │              │   Push Notification, Quản lý đa trạm) │
              │              └────────────────────┬──────────────────┘
              │                                   │ HTTPS / WebSocket
              │                                   │ (đồng bộ dữ liệu)
 ┌────────────▼───────────────────────────────────▼──────────────────┐
 │                   JETSON ORIN NANO (TẠI TRẠM)                      │
 │                                                                     │
 │  ┌──────────────┐   ┌───────────────┐   ┌───────────────────────┐  │
 │  │  API Backend  │   │    go2rtc     │   │      AI Engine        │  │
 │  │  + Database   │   │  port 1984    │   │  YOLO + TensorRT      │  │
 │  │  + IEC 104    │   │  RTSP→WebRTC  │   │  Thermal / PD / Vision│  │
 │  └──────┬────────┘   └──────┬────────┘   └───────────────────────┘  │
 │         │                  │                                         │
 │  ┌──────▼──────────────────▼──────────────────────────────────────┐ │
 │  │                     LAN NỘI BỘ TRẠM                            │ │
 │  └──────┬──────────────────────────────────────┬──────────────────┘ │
 └─────────┼──────────────────────────────────────┼────────────────────┘
           │                                      │
  ┌────────▼─────────┐                  ┌─────────▼──────────────────┐
  │   PLC / RTU      │                  │      HỆ THỐNG CAMERA        │
  │   Cảm biến       │                  │  - Camera nhiệt             │
  │   (Modbus / S7)  │                  │  - Camera phóng điện        │
  └──────────────────┘                  │  - Camera quan sát          │
                                        │  (ONVIF / RTSP)             │
                                        └─────────────────────────────┘

  ┌─────────────────────────────────────┐
  │    MÁY TÍNH VẬN HÀNH (TẠI TRẠM)    │
  │    Desktop App — kết nối LAN trực   │
  │    tiếp vào Jetson, không qua cloud │
  └─────────────────────────────────────┘
```

> **Chú thích:**
> - **WAN-IT & Trung tâm điều độ**: Chỉ cần khi triển khai thực tế kết nối EVN. Trạm thí nghiệm chưa cần.
> - **Cloud**: Cần khi dùng mobile app hoặc quản lý từ xa. Trạm chạy LAN đơn lẻ vẫn hoạt động đầy đủ không cần cloud.
> - **Desktop tại trạm**: Kết nối thẳng vào Jetson qua LAN — nhanh nhất, không qua cloud.

---

## 3.1 Kết Nối Thiết Bị Tại Trạm

### 3.1.1 PLC Siemens S7 (snap7)

Hệ thống đọc trực tiếp dữ liệu từ PLC Siemens S7 tại trạm thông qua thư viện **snap7** — không cần phần mềm trung gian.

**Thông số kết nối:**
- Giao thức: S7 Communication (ISO-TSAP)
- Cổng: TCP 102
- Địa chỉ: IP của PLC trong LAN trạm

**Dữ liệu đọc được:**
- Nhiệt độ các pha (DB32.DBW0, DBW2, DBW4)
- Chỉ số phóng điện PD (DB32.DBW8)
- Trạng thái máy cắt, dao cách ly
- Các tín hiệu đo lường khác theo cấu hình Data Block

**Cơ chế hoạt động:**
- Backend poll PLC mỗi **3–5 giây** liên tục
- Dữ liệu được lưu vào database time-series ngay lập tức
- Nếu mất kết nối PLC → hệ thống cảnh báo "mất tín hiệu", tự động reconnect
- Không làm gián đoạn hoạt động của PLC và SCADA hiện có

---

### 3.1.2 Thiết Bị Đo Lường (Modbus RTU/TCP)

Hệ thống hỗ trợ kết nối các thiết bị đo lường và cảm biến theo giao thức **Modbus** — chuẩn phổ biến nhất trong công nghiệp điện.

**Hỗ trợ:**
- **Modbus TCP**: Kết nối qua mạng LAN (cảm biến có cổng Ethernet)
- **Modbus RTU**: Kết nối qua cổng RS-485 (thiết bị truyền thống)
- **Wireless Modbus**: Bộ thu thập dữ liệu không dây, cảm biến gắn trực tiếp trên thiết bị có điện áp cao

**Cơ chế hoạt động:**
- Mỗi cảm biến/thiết bị được cấu hình địa chỉ Modbus, thanh ghi đọc, hệ số quy đổi
- Hệ thống tự động poll theo chu kỳ, lưu giá trị và kiểm tra ngưỡng cảnh báo
- Thêm thiết bị mới chỉ cần nhập cấu hình trong giao diện quản lý, không cần sửa code

---

## 3.2 Kết Nối Hệ Thống Camera

### 3.2.1 go2rtc — Trung Tâm Xử Lý Video

**go2rtc** là thành phần trung gian chạy tại trạm, nhận luồng RTSP từ camera và chuyển đổi sang nhiều định dạng phù hợp với từng nền tảng ứng dụng.

```
Camera RTSP → go2rtc (port 1984) → Desktop App  (WebRTC / MSE)
                                 → Mobile App    (HLS stream)
                                 → AI Engine     (RTSP nội bộ)
                                 → Web Browser   (stream.html)
```

**Lý do dùng go2rtc:**
- Camera Hikvision, Dahua, ONVIF xuất RTSP — trình duyệt và app không đọc trực tiếp được RTSP
- go2rtc chuyển RTSP → WebRTC (độ trễ < 1 giây) hoặc HLS (tương thích mọi thiết bị)
- Một go2rtc server phục vụ được toàn bộ camera trong trạm

**Cấu hình:**
- Chạy tại trạm, port 1984
- Mỗi camera thêm 1 dòng cấu hình vào file `go2rtc.yaml`
- Hỗ trợ không giới hạn số lượng camera

---

### 3.2.2 Kết Nối Desktop App (Windows / macOS)

Desktop app (Tauri) chạy tại trạm hoặc cùng mạng LAN với go2rtc.

- Kết nối trực tiếp: `http://localhost:1984/stream.html?src=<camera_id>&mode=mse`
- Độ trễ thấp, chất lượng cao, không cần Internet
- Toàn bộ camera xem được ngay trong LAN

---

### 3.2.3 Kết Nối Mobile App (Android / iOS) Từ Xa

Mobile app xem camera từ xa qua Internet cần thêm một lớp kết nối:

**Phương án — VPN (WireGuard):**
```
Mobile → WireGuard VPN → LAN trạm → go2rtc → HLS stream
```
- An toàn, mã hóa end-to-end
- Tốc độ nhanh, độ trễ thấp
- Cài WireGuard trên router/server tại trạm, cấu hình 1 lần

**Luồng video trên mobile:**
- go2rtc xuất **HLS** → native video player của Android/iOS đọc được
- Không cần cài plugin hay thư viện đặc biệt

---

### 3.2.4 Camera ONVIF

Với camera hỗ trợ chuẩn **ONVIF**, hệ thống còn có thể:
- Điều khiển PTZ (pan/tilt/zoom) cho camera quay quét trực tiếp từ giao diện phần mềm
- Lấy metadata từ camera (thông số kỹ thuật, preset vị trí)
- Cấu hình preset vị trí giám sát tự động theo lịch

---

## 3.3 Kết Nối Lên Trung Tâm Điều Độ

### 3.3.1 Giao Thức IEC-60870-5-104

Toàn bộ dữ liệu quan trọng tại trạm được truyền lên **Trung tâm điều độ** qua giao thức chuẩn ngành điện **IEC-60870-5-104** (IEC 104) qua đường **WAN-IT độc lập**.

**Dữ liệu gửi lên:**
- Giá trị đo lường tức thời: nhiệt độ, chỉ số PD, các thông số điện
- Trạng thái thiết bị: máy cắt đóng/cắt, dao cách ly đóng/mở
- Điểm cảnh báo: khi vượt ngưỡng Warning/Alarm
- Timestamp chính xác theo UTC

**Cơ chế:**
- Truyền theo chu kỳ (cyclic) và theo sự kiện (spontaneous)
- Khi có cảnh báo → gửi ngay lập tức, không chờ đến chu kỳ kế tiếp
- Tự động kết nối lại nếu đường WAN bị gián đoạn
- Dữ liệu trong thời gian mất kết nối được lưu đệm và gửi bù khi kết nối lại (buffer transfer)

**Mạng truyền:**
- WAN-IT hoàn toàn **độc lập** với WAN-OT đang vận hành tại trạm
- Không ảnh hưởng đến hệ thống SCADA và bảo vệ hiện có

---

## 3.4 Kết Nối Cloud

### 3.4.1 Đồng Bộ Dữ Liệu Lên Cloud

Server tại trạm tự động đồng bộ dữ liệu lên cloud theo cơ chế **offline-first**:

```
Server tại trạm → HTTPS → Cloud Database
(có Internet)      ↑
                   Tự đồng bộ khi có kết nối

Server tại trạm → Lưu cục bộ → Chờ có Internet → Đồng bộ bù
(mất Internet)
```

**Dữ liệu đồng bộ lên cloud:**
- Lịch sử nhiệt độ và chỉ số đo lường (time-series)
- Sự kiện cảnh báo và trạng thái xử lý
- Ảnh chụp sự kiện từ camera
- Nhật ký audit (ai làm gì, lúc nào)

**Hạ tầng cloud:**
- **Database**: Lưu trữ time-series dài hạn, tối thiểu 5 năm
- **File storage**: Ảnh và video sự kiện (Cloudflare R2 — free 10GB/tháng)
- **API Gateway**: Phục vụ mobile app và giao diện web từ xa

---

### 3.4.2 Push Notification Đến Mobile

Khi có cảnh báo tại trạm, hệ thống gửi thông báo tức thì đến điện thoại người phụ trách:

```
Cảnh báo tại trạm → Server tại trạm → Cloud → Firebase FCM → Điện thoại
```

- Thông báo xuất hiện ngay trên màn hình điện thoại dù app đang đóng
- Nội dung thông báo: tên trạm, thiết bị, loại cảnh báo, giá trị đo
- Tap vào thông báo → mở thẳng vào màn hình chi tiết sự kiện trong app

---

### 3.4.3 Kết Nối Mobile App Từ Xa

Mobile app lấy dữ liệu từ cloud khi ở ngoài LAN trạm:

```
Mobile App → HTTPS → Cloud API → Dữ liệu trạm (real-time + lịch sử)
Mobile App → VPN   → LAN trạm → Camera live (go2rtc HLS)
```

- Dữ liệu sensor và cảnh báo: qua cloud API (không cần VPN)
- Camera live: cần VPN để kết nối vào LAN trạm

---

## 3.5 Kết Nối Mở — API Cho Phần Mềm Thứ Ba

Hệ thống cung cấp **REST API chuẩn** cho phép tích hợp với phần mềm quản lý khác của đơn vị.

**Các endpoint chính:**

| Endpoint | Mô tả |
|---|---|
| `GET /api/stations` | Danh sách trạm và trạng thái |
| `GET /api/points` | Giá trị đo lường tức thời toàn trạm |
| `GET /api/alerts` | Danh sách cảnh báo đang mở |
| `GET /api/history` | Lịch sử dữ liệu theo thời gian |
| `POST /api/alerts/ack` | Xác nhận xử lý cảnh báo |
| `WebSocket /ws/realtime` | Nhận dữ liệu real-time (thay polling) |

**Bảo mật:**
- Xác thực qua API Key hoặc JWT token
- HTTPS bắt buộc cho tất cả kết nối từ bên ngoài LAN
- Phân quyền theo endpoint — không phải mọi tài khoản đều đọc được mọi dữ liệu

---

## 3.6 Tóm Tắt Giao Thức Theo Từng Kết Nối

| Kết nối | Giao thức | Hướng dữ liệu |
|---|---|---|
| PLC Siemens S7 | S7 Communication (TCP 102) | PLC → Server |
| Cảm biến không dây | Modbus RTU / TCP | Cảm biến → Server |
| Camera | RTSP / ONVIF | Camera → go2rtc → App |
| Desktop app tại trạm | WebRTC / MSE (LAN) | go2rtc → Desktop |
| Mobile app từ xa (data) | HTTPS / WebSocket | Cloud → Mobile |
| Mobile app từ xa (camera) | HLS qua VPN | go2rtc → Mobile |
| Trung tâm điều độ | IEC-60870-5-104 (WAN-IT) | Server → Trung tâm |
| Cloud đồng bộ | HTTPS (REST) | Server → Cloud |
| Push notification | Firebase FCM | Cloud → Mobile |
| Phần mềm thứ ba | REST API / WebSocket | Server ↔ Bên ngoài |

---

*Chi tiết yêu cầu hạ tầng phần cứng, mạng và môi trường triển khai được trình bày trong Phần 4.*
