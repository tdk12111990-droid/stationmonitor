# PHẦN 4 — HẠ TẦNG & PHẦN CỨNG
## Yêu Cầu Triển Khai Hệ Thống

---

## 4.1 Tổng Quan Hạ Tầng Tại Trạm

Toàn bộ hệ thống vận hành độc lập tại trạm, không phụ thuộc Internet. Hệ thống được thiết kế theo **2 mô hình triển khai** tùy quy mô thực tế:

---

### Mô Hình A — Trạm Thí Nghiệm / Quy Mô Nhỏ (≤ 4 Camera)

Sử dụng **duy nhất một thiết bị Jetson Orin Nano** đảm nhận toàn bộ: AI, backend, streaming, database. Tối ưu chi phí, đơn giản triển khai.

```
┌─────────────────────────────────────────────────────────────┐
│                     TỦ RACK TẠI TRẠM                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              JETSON ORIN NANO 8GB                     │   │
│  │                                                       │   │
│  │  GPU (1024-core Ampere):        CPU (6-core ARM):    │   │
│  │  - YOLO Thermal Detection       - Backend API        │   │
│  │  - PD Detection                 - go2rtc (streaming) │   │
│  │  - Vision AI (an ninh)          - Database           │   │
│  │  - TensorRT acceleration        - Web App            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SWITCH CÔNG NGHIỆP                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Lý do khả thi:**
- RAM 8GB unified: AI dùng ~3-4GB GPU memory, Backend + go2rtc dùng ~2GB CPU memory → đủ dùng
- CPU 6-core ARM đủ mạnh để chạy FastAPI, go2rtc, InfluxDB nhẹ nhàng
- 2 camera thí nghiệm → tải AI thấp, không áp lực tài nguyên

---

### Mô Hình B — Triển Khai Thực Tế / Quy Mô Lớn (> 4 Camera)

Khi mở rộng thêm camera và tăng tải AI, tách thành **2 thiết bị riêng biệt**:

```
┌─────────────────────────────────────────────────────────────┐
│                     TỦ RACK TẠI TRẠM                        │
│                                                              │
│  ┌─────────────────┐   ┌──────────────────────────────────┐ │
│  │  MÁY CHỦ TRẠM   │   │     JETSON ORIN NANO             │ │
│  │  (Server chính) │   │     (Edge AI Engine)             │ │
│  │  - API Backend  │   │     - YOLO Thermal Detection     │ │
│  │  - Database     │   │     - PD Detection               │ │
│  │  - go2rtc       │   │     - Vision AI (an ninh)        │ │
│  │  - Web App      │   │     - TensorRT acceleration      │ │
│  └─────────────────┘   └──────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SWITCH CÔNG NGHIỆP                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4.2 Jetson Orin Nano — Thiết Bị Chủ Lực

Dù triển khai theo mô hình nào, **Jetson Orin Nano** luôn là thiết bị cốt lõi của hệ thống.

### Thông Số Phần Cứng

| Thành phần | Thông số |
|---|---|
| **Module** | NVIDIA Jetson Orin Nano 8GB |
| **GPU** | 1024-core NVIDIA Ampere, 32 Tensor Cores |
| **CPU** | 6-core Arm Cortex-A78AE |
| **RAM** | 8GB LPDDR5 (unified CPU + GPU) |
| **Storage** | 64GB eMMC + SSD mở rộng (lưu database, ảnh) |
| **Kết nối** | Gigabit Ethernet, USB 3.2, GPIO |
| **Nguồn** | 7–25W (tiết kiệm điện) |
| **Nhiệt độ vận hành** | -25°C đến 80°C |
| **Hệ điều hành** | Ubuntu 22.04 LTS (JetPack) |

### Phần Mềm Chạy Trên Jetson (Mô Hình A)

- **go2rtc**: Nhận RTSP từ camera, phân phối stream đến ứng dụng
- **Backend API**: FastAPI (Python) — xử lý dữ liệu, cảnh báo, giao tiếp IEC 104
- **Database**: InfluxDB (time-series sensor) + SQLite (cấu hình, người dùng, rules)
- **AI Engine**: YOLO + TensorRT — phân tích camera nhiệt, phóng điện, an ninh

### Nhiệm Vụ AI

**1. Phát hiện điểm nóng — Camera Nhiệt**
- Nhận stream từ camera nhiệt qua go2rtc
- Phân tích ảnh nhiệt, tự động khoanh vùng điểm nóng vượt ngưỡng
- Tính toán nhiệt độ theo từng vùng thiết bị
- Gửi kết quả về backend ngay lập tức

**2. Phát hiện phóng điện — Camera PD**
- Phân tích video từ camera phóng điện
- Nhận diện hiện tượng corona discharge, partial discharge
- Lưu ảnh và video clip khi phát hiện sự kiện

**3. Giám sát an ninh — Camera Quan Sát**
- Phát hiện người xuất hiện trong khu vực cấm
- Gửi cảnh báo tức thì khi có xâm nhập

**4. TensorRT Acceleration**
- Tất cả model AI được tối ưu bằng **NVIDIA TensorRT** trước khi deploy
- Nhanh hơn 5–10 lần so với chạy model thông thường
- Xử lý đồng thời nhiều luồng camera mà không giật lag

### Hiệu Năng Ước Tính

| Tác vụ | Tốc độ (với TensorRT) |
|---|---|
| YOLO detection 1–2 camera (Mô hình A) | ~25–30 FPS |
| YOLO detection 4–6 camera (Mô hình B) | ~15 FPS/camera |
| Thermal analysis | Real-time |

---

## 4.3 Máy Chủ Trạm — Chỉ Dùng Ở Mô Hình B

Khi hệ thống mở rộng và Jetson cần dành toàn bộ tài nguyên cho AI, bổ sung thêm máy chủ riêng.

| Thành phần | Yêu cầu |
|---|---|
| **CPU** | Intel Core i7 thế hệ 12 trở lên |
| **RAM** | 16GB DDR4 trở lên |
| **SSD** | 256GB (hệ điều hành + phần mềm) |
| **HDD** | 2TB trở lên (lưu trữ lịch sử, ảnh, video) |
| **Mạng** | 2 cổng Ethernet Gigabit (1 LAN trạm, 1 WAN-IT) |
| **Hệ điều hành** | Ubuntu Server 22.04 LTS |
| **Nguồn điện** | UPS dự phòng |

---

## 4.4 Hệ Thống Mạng Tại Trạm

### Switch Công Nghiệp (Layer 2)

| Thông số | Yêu cầu |
|---|---|
| **Cổng** | ≥ 16 cổng Fast/Gigabit Ethernet |
| **Cổng quang** | ≥ 2 cổng (kết nối camera ngoài trời qua cáp quang) |
| **Tiêu chuẩn** | IEC 61850-3, IEEE 1613 (môi trường công nghiệp) |
| **Nhiệt độ** | -40°C đến 75°C |
| **Nguồn** | Dự phòng kép (redundant power) |
| **Tính năng** | VLAN, IGMP snooping, QoS ưu tiên luồng video |

### Phân Vùng Mạng (VLAN)

| VLAN | Thiết bị | Mục đích |
|---|---|---|
| **VLAN 10** | Jetson / Server, máy tính vận hành | LAN quản lý nội bộ |
| **VLAN 20** | Toàn bộ camera | Luồng video riêng biệt |
| **VLAN 30** | PLC, RTU, cảm biến | Mạng thiết bị điều khiển |
| **WAN-IT** | Cổng kết nối ra ngoài | Lên cloud, Trung tâm điều độ |

> **Lưu ý**: WAN-IT hoàn toàn độc lập với WAN-OT của hệ thống SCADA và bảo vệ hiện có.

### Kết Nối Camera Ngoài Trời

- **Cáp quang** (khoảng cách > 100m): Bộ chuyển đổi quang-điện tại mỗi camera
- **Cáp mạng CAT6** (khoảng cách < 100m): Kết nối trực tiếp
- **Bộ chống sét mạng** tại mỗi điểm đấu nối

---

## 4.5 Bảo Vệ Nguồn Điện

- **UPS**: Tự động chuyển nguồn khi mất điện < 20ms, dự phòng tối thiểu 30 phút
- **Bộ cắt lọc sét nguồn**: Bảo vệ toàn bộ thiết bị trong tủ
- **Bộ chống sét mạng LAN**: Tại mỗi cổng kết nối cáp từ ngoài vào tủ

---

## 4.6 Máy Tính Vận Hành Tại Trạm

| Thành phần | Yêu cầu |
|---|---|
| **CPU** | Intel Core i5 thế hệ 12 trở lên |
| **RAM** | 16GB DDR4 |
| **Màn hình** | 27 inch, Full HD trở lên |
| **OS** | Windows 10/11 bản quyền |
| **Mạng** | Kết nối LAN nội bộ trạm |

---

## 4.7 Hạ Tầng Cloud

| Thành phần | Dịch vụ | Chi phí |
|---|---|---|
| **Database** | Supabase PostgreSQL | $0 (free tier) |
| **Lưu trữ ảnh/video** | Cloudflare R2 | $0 (free 10GB/tháng) |
| **API Gateway** | Cloudflare Workers | $0 (free tier) |
| **Push notification** | Firebase Cloud Messaging | $0 |
| **VPN Camera từ xa** | WireGuard (self-hosted) | $0 |

> Chi phí vận hành cloud ước tính: **$5–10/tháng** cho 1 trạm.

---

## 4.8 Tóm Tắt Phần Cứng Theo Từng Mô Hình

### Mô Hình A — Trạm Thí Nghiệm / Nhỏ

| Thiết bị | Số lượng | Ghi chú |
|---|---|---|
| NVIDIA Jetson Orin Nano 8GB | 1 | Chạy tất cả: AI + backend + go2rtc + database |
| Switch công nghiệp Layer 2 | 1 | Kết nối LAN nội bộ |
| UPS bảo vệ nguồn | 1 | Dự phòng tối thiểu 30 phút |
| Máy tính vận hành | 1 | Phòng điều khiển, màn hình 27" |
| Tủ rack 19" | 1 | Chứa thiết bị |
| Bộ chống sét nguồn + mạng | Theo số điểm | Bảo vệ thiết bị |

### Mô Hình B — Triển Khai Thực Tế / Lớn

| Thiết bị | Số lượng | Ghi chú |
|---|---|---|
| NVIDIA Jetson Orin Nano 8GB | 1 | Chuyên AI |
| Máy chủ trạm (Server) | 1 | Backend, database, go2rtc |
| Switch công nghiệp Layer 2 | 1 | Kết nối LAN nội bộ |
| UPS bảo vệ nguồn | 1 | Dự phòng tối thiểu 30 phút |
| Máy tính vận hành | 1 | Phòng điều khiển, màn hình 27" |
| Tủ rack 19" | 1 | Chứa thiết bị |
| Bộ chống sét nguồn + mạng | Theo số điểm | Bảo vệ thiết bị |
| Bộ chuyển đổi quang-điện | Theo số camera xa | Camera ngoài trời > 100m |

---

## 4.9 Khả Năng Mở Rộng

- **Thêm camera**: Thêm cấu hình vào go2rtc, thêm thiết bị trong giao diện quản lý
- **Thêm cảm biến**: Thêm địa chỉ Modbus trong giao diện, không sửa code
- **Nâng từ Mô hình A lên B**: Thêm server riêng, Jetson chuyển sang chuyên AI — không thay đổi phần mềm
- **Thêm trạm mới**: Cài bộ phần mềm tại trạm mới, đăng ký lên cloud — xuất hiện ngay trên bản đồ đa trạm
- **Nâng cấp AI model**: Thay model YOLO mới trên Jetson mà không ảnh hưởng các thành phần khác

---

*Đây là tài liệu cuối trong bộ 4 phần mô tả hệ thống Giám Sát Trạm Biến Áp Thông Minh.*
*Phần 1: Tổng quan — Phần 2: Chức năng — Phần 3: Kết nối — Phần 4: Hạ tầng*
