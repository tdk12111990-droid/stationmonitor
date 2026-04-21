# Kế hoạch Dự án: Hệ thống Giám sát Trạm Điện Thông Minh

**Phiên bản:** 1.0
**Ngày lập:** 2026-03-27
**Trạng thái:** Đang phát triển

---

## 1. Tổng quan dự án

### Mô tả
Hệ thống giám sát trạm điện thông minh tích hợp AI, cho phép theo dõi realtime các thông số vận hành (nhiệt độ, phóng điện), giám sát camera tự động nhận diện sự kiện, cảnh báo tức thời và quản lý tập trung nhiều trạm từ xa. Hệ thống thiết kế theo kiến trúc **Edge + Cloud** — xử lý tại biên (tại trạm), đồng bộ lên cloud, vận hành độc lập 24/7 kể cả khi mất internet.

### Mục tiêu
- Giám sát realtime 3 camera chuyên dụng + dữ liệu PLC Siemens S7
- AI tự động phát hiện sự kiện bất thường (người xâm nhập, PPE, nhiệt độ, phóng điện)
- Cảnh báo tức thời qua app mobile
- Mở rộng dễ dàng sang nhiều trạm mà không cần sửa code
- Người vận hành tại trạm tự quản lý thiết bị qua Web UI

### Phạm vi
- **Trạm đầu tiên:** 1 trạm điện, 3 camera, 4 sensor qua PLC
- **Mở rộng:** Thêm trạm mới chỉ cần cài phần mềm + config, không sửa code
- **Người dùng:** ~5 người/trạm, tối đa ~1000 người dùng toàn hệ thống

---

## 2. Kiến trúc hệ thống

### Tổng quan kiến trúc

```
┌──────────────────────────────── TRẠM (LAN nội bộ) ─────────────────────────────────┐
│                                                                                      │
│  Camera nhiệt (192.168.10.152) ──►┐                                                 │
│  Camera âm thanh (192.168.10.153)─►  go2rtc ──► Python AI Service (YOLO)           │
│  Camera Hikvision (192.168.1.64) ─►┘                    │ events + snapshot         │
│                                                          ▼                           │
│  PLC Siemens S7 (192.168.10.100) ──► ASP.NET Backend (Station Mode)                │
│  DB32.DBW0/2/4 (nhiệt độ)              │                                            │
│  DB32.DBW8 (PD sensor)                 ├── InfluxDB   (time-series 30 ngày)        │
│                                        ├── SQLite     (config/rules/users)          │
│                                        └── FileSystem (ảnh/video 30 ngày)           │
│                                                 │                                    │
│                          ┌──────────────────────┤                                   │
│                          │ realtime (SignalR)    │ sync event quan trọng             │
│                          ▼                       │ (Cloudflare Tunnel)               │
│                   ┌─────────────┐                │                                   │
│                   │ Desktop App │                │                                   │
│                   │ (Tauri)     │                │                                   │
│                   └─────────────┘                │                                   │
│                          ▲                       │                                   │
│                   ┌──────┘                       │                                   │
│                   │ realtime (trong LAN)         │                                   │
│                   │ live camera (RTSP thẳng)     │                                   │
│             Mobile App (LAN)                     │                                   │
└──────────────────────────────────────────────────┼────────────────────────────────────┘
                                                   │ đồng bộ khi có internet
                                                   ▼
                               ┌──────────────────────────────────┐
                               │        CLOUD (Serverless)         │
                               │  Cloudflare Workers (API)         │
                               │  Supabase PostgreSQL (lịch sử)   │
                               │  Cloudflare R2 (ảnh/video lâu)   │
                               │  Firebase FCM (notification)      │
                               └────────────────┬─────────────────┘
                                                │
                                ┌───────────────┤
                                │               │
                                ▼               ▼
                          Mobile App       Web App
                        (ngoài LAN)     (browser dev)
                      notification +    xem lịch sử
                      xem lịch sử       dài hạn
                      live cam (WebRTC)
```

### Luồng dữ liệu chi tiết

```
LUỒNG 1 — Realtime tại trạm (ưu tiên tốc độ, không qua cloud)
PLC/Camera → AI → Backend Local → SignalR → Desktop App / Mobile (LAN)

LUỒNG 2 — Cảnh báo ra ngoài (khi có internet)
Backend Local → Cloud → Firebase FCM → Mobile App (ngoài LAN)

LUỒNG 3 — Xem live camera từ xa
Camera → go2rtc (trạm) → TURN Server → WebRTC → Mobile App (ngoài LAN)

LUỒNG 4 — Xem lịch sử dài hạn (data local đã xóa sau 30 ngày)
Mobile/Web → Cloud API → Supabase PostgreSQL + Cloudflare R2
```

### Phân loại theo tình huống

| Tình huống | Luồng | Qua cloud? |
|---|---|---|
| Xem realtime tại trạm | Backend Local → Desktop | ❌ Không |
| Alert tại trạm | Backend Local → Desktop/Mobile LAN | ❌ Không |
| Notification mobile ngoài LAN | Local → Cloud → Firebase → Mobile | ✅ Có |
| Xem camera live ngoài LAN | go2rtc → TURN → Mobile (P2P) | ✅ Relay nhẹ |
| Lịch sử 7-30 ngày gần | Backend Local → InfluxDB local | ❌ Không |
| Lịch sử 30 ngày+ (local đã xóa) | Cloud API → Supabase | ✅ Có |
| Báo cáo tháng trước | Cloud API → Supabase + R2 | ✅ Có |
| Mất internet | Backend Local hoạt động bình thường | ❌ Không cần |

### Nguyên tắc thiết kế
- **Edge-first:** Toàn bộ xử lý AI, đọc PLC, lưu data chạy tại trạm — không phụ thuộc internet
- **Cloud nhẹ:** Cloud chỉ làm relay notification + remote access, không xử lý nặng
- **1 codebase:** Backend dùng chung 1 project ASP.NET Core, khác config (Station Mode / Cloud Mode)
- **station_id:** Mọi data đều gắn station_id từ đầu — nền tảng để mở rộng multi-trạm
- **Offline resilient:** Mất internet → trạm vẫn chạy 100%, đồng bộ lại khi có mạng

---

## 3. Stack công nghệ

### Frontend
| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Web App (hiện tại) | Vanilla TypeScript + Vite | Dev/test, ~90% hoàn thành |
| Desktop App | Tauri + Rust | Production, Windows trước |
| Mobile App | React Native | Android, sideload APK |

### Backend
| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend trạm | ASP.NET Core (C#) | Station Mode, chạy trên Jetson |
| Backend cloud | ASP.NET Core (C#) | Cloud Mode, Serverless |
| AI Service | Python + FastAPI | YOLO inference, chạy trên Jetson |
| PLC Protocol | S7.Net (C#) | Đọc Siemens S7 trực tiếp |
| Realtime | SignalR WebSocket | Thay polling |
| Camera stream (dev) | go2rtc + WebRTC | Browser/web mode |
| Camera stream (prod) | RTSP thẳng (Rust) | Desktop app |

### Database & Storage
| Thành phần | Công nghệ | Lưu gì |
|---|---|---|
| Time-series local | InfluxDB | Sensor values, AI events theo thời gian |
| Config local | SQLite | Thiết bị, rules, users, config |
| File local | File System (SSD) | Snapshot ảnh, video clip, ảnh nhiệt |
| Database cloud | Supabase (PostgreSQL) | Lịch sử events, danh sách trạm, users |
| File cloud | Cloudflare R2 | Ảnh/video quan trọng sync lên |

### Hạ tầng & Dịch vụ
| Dịch vụ | Công nghệ | Ghi chú |
|---|---|---|
| Cloud serverless | Cloudflare Workers | Backend API cloud |
| Tunnel | Cloudflare Tunnel | Kết nối trạm → cloud, không mở port |
| Notification | Firebase FCM | Push notification mobile |
| VPN dev/test | WireGuard P2P | Kết nối máy dev ↔ trạm thật |
| AI Training | Google Colab Pro | Fine-tune YOLO model |
| Live stream mobile | go2rtc + TURN | Xem camera ngoài LAN |

---

## 4. Thiết bị phần cứng

### Thiết bị đã có tại trạm
| Thiết bị | IP | Vai trò |
|---|---|---|
| PLC Siemens S7 | 192.168.10.100 | Thu thập sensor (nhiệt độ, PD) |
| Camera nhiệt | 192.168.10.152 | Giám sát nhiệt MBA, historyFolder: G:\QlPD\Records\152 |
| Camera âm thanh | 192.168.10.153 | Phát hiện phóng điện bằng âm thanh |
| Camera Hikvision | 192.168.1.64 | Giám sát người/PPE |

### Sensor qua PLC (địa chỉ Siemens S7)
| Sensor | Địa chỉ PLC | Đơn vị |
|---|---|---|
| Nhiệt độ Phase 1 | DB32.DBW0 | °C |
| Nhiệt độ Phase 2 | DB32.DBW4 | °C |
| Nhiệt độ Phase 3 | DB32.DBW2 | °C |
| Cảm biến PD | DB32.DBW8 | dB |

### Cần mua thêm mỗi trạm
| Thiết bị | Giá ước tính | Vai trò |
|---|---|---|
| Jetson Orin Nano 8GB | ~$250 (~6.3tr) | Edge server + AI processing |
| SSD NVMe 256GB | ~$30 (~750k) | Storage (Jetson không có sẵn) |
| Nguồn 19V/4A | ~$15 (~375k) | Adapter (không kèm theo) |
| Vỏ hộp + tản nhiệt | ~$20 (~500k) | Bảo vệ phần cứng, tản nhiệt 24/7 |
| Switch LAN 8 port | ~$30 (~750k) | Kết nối tất cả thiết bị cùng mạng |
| UPS 650VA | ~$50 (~1.25tr) | Dự phòng điện, tự khởi động lại |
| Thẻ WiFi (nếu cần) | ~$15 (~375k) | Jetson Orin Nano không có WiFi sẵn |
| **Tổng phần cứng/trạm** | **~$410 (~10.3tr)** | |

### Tại sao chọn Jetson Orin Nano
- **40 TOPS AI performance** — xử lý 3 camera YOLO thoải mái (~60 FPS)
- **GPU tích hợp sẵn** — không cần mua GPU rời
- **Tiêu thụ điện thấp** — 7-15W, phù hợp chạy 24/7
- **Nhỏ gọn** — dễ lắp đặt trong tủ điện
- **JetPack OS (Ubuntu)** — Linux native, CUDA/TensorRT sẵn

---

## 5. Chức năng hệ thống

### 5.1 Giám sát Camera
- Xem live stream 3 camera (nhiệt, âm thanh, giám sát)
- Chụp ảnh thủ công từng camera
- Ghi video tự động khi có sự kiện AI phát hiện
- Xem lại ảnh/video đã lưu theo ngày
- Xem nhiều camera cùng lúc (grid layout)
- Phóng to xem chi tiết 1 camera
- Hiển thị trạng thái online/offline từng camera

### 5.2 Giám sát Sensor/PLC
- Đọc realtime nhiệt độ 3 phase từ PLC S7
- Đọc realtime chỉ số phóng điện (PD - dB)
- Hiển thị giá trị + đơn vị + trạng thái (Normal/Warning/Alarm)
- Chart lịch sử giá trị theo thời gian (1H/6H/1D/1W/1M)
- So sánh dữ liệu nhiều phase cùng lúc
- Xuất data ra CSV/Excel

### 5.3 AI Detection
- Phát hiện người xâm nhập vào khu vực cấm
- Kiểm tra PPE (mũ bảo hộ, áo phản quang)
- Phát hiện bất thường nhiệt độ qua camera nhiệt
- Phát hiện phóng điện qua camera âm thanh
- Lưu snapshot kèm bounding box khi phát hiện
- Ghi clip video sự kiện (3 giây trước + sau)
- Bật/tắt AI từng camera
- Điều chỉnh ngưỡng confidence
- Xem lại lịch sử AI events + ảnh/video

### 5.4 Dashboard & Analytics
- KPI tổng quan: nhiệt độ max, PD events 24h, thiết bị online, cảnh báo active
- Sơ đồ trạm (SCADA mimic) với vị trí thiết bị kéo thả được
- Chart realtime SignalR (không polling)
- Bộ lọc theo loại sensor, thiết bị, thời gian
- Báo cáo tổng hợp ngày/tuần/tháng/tùy chỉnh
- Xuất báo cáo PDF

### 5.5 Alert & Cảnh báo
- Cảnh báo tự động khi sensor vượt ngưỡng cấu hình
- Cảnh báo từ AI detection
- Phân cấp: Normal / Warning / Alarm / Critical
- Lịch sử toàn bộ cảnh báo với filter nâng cao
- Xem chi tiết cảnh báo + ảnh/video đính kèm
- Đánh dấu đã xử lý + ghi chú
- Push notification về mobile (Firebase FCM)
- Xuất lịch sử CSV

### 5.6 Quản lý thiết bị
- Danh sách toàn bộ camera + sensor
- Thêm/sửa/xóa thiết bị qua Web UI (không cần code)
- Cấu hình IP, tên, loại, vị trí trên sơ đồ
- Test kết nối thiết bị
- Trạng thái online/offline realtime
- Lịch sử hoạt động thiết bị

### 5.7 Cấu hình ngưỡng cảnh báo
- Đặt ngưỡng Warning/Alarm cho từng sensor
- Cấu hình thời gian delay trước khi tạo alert
- Bật/tắt alert từng thiết bị độc lập
- Rule engine: điều kiện kết hợp nhiều sensor

### 5.8 Quản lý người dùng & Bảo mật
- Đăng nhập/đăng xuất với JWT
- 3 vai trò: Admin / Manager / Operator
  - Admin: toàn quyền hệ thống
  - Manager: xem + xử lý alert, xuất báo cáo
  - Operator: chỉ xem realtime
- Khóa tài khoản sau nhiều lần đăng nhập sai
- Nhật ký hoạt động người dùng (Audit Log)

### 5.9 Bảo trì
- Lịch bảo trì định kỳ
- Gợi ý bảo trì từ AI (dựa trên trend dữ liệu)
- Checklist công việc bảo trì
- Ghi nhận kết quả kiểm tra

### 5.10 Mobile App (Android)
- Xem dashboard KPI theo trạm
- Nhận push notification khi có alert
- Xem chi tiết alert + ảnh sự kiện
- Xem live camera trong LAN (RTSP thẳng)
- Xem live camera ngoài LAN (WebRTC qua TURN)
- Xem lịch sử sự kiện
- Chọn xem theo trạm (multi-trạm)
- Cài trực tiếp qua APK (không cần Play Store)

### 5.11 Desktop App (Windows)
- Toàn bộ chức năng web app
- Tự khởi động tất cả services khi mở app
- RTSP thẳng, không qua go2rtc (độ trễ thấp hơn)
- Chạy offline hoàn toàn
- Cài đặt qua file .exe installer

### 5.12 Multi-trạm
- Dashboard tổng hợp tất cả trạm
- Chọn xem từng trạm riêng
- Notification phân biệt theo trạm
- Thêm trạm mới không sửa code (chỉ cài + config)

### 5.13 Vận hành hệ thống
- Tự động khởi động lại khi mất điện (UPS + systemd)
- Hoạt động độc lập khi mất internet
- Đồng bộ lên cloud khi có internet trở lại
- Tự động xóa data cũ hơn 30 ngày (local)
- Giữ data quan trọng trên cloud 90 ngày+
- Monitor trạng thái hệ thống (CPU, RAM, storage Jetson)
- Log lỗi hệ thống

---

## 6. Lưu trữ dữ liệu

### Local tại trạm (Jetson SSD 256GB)

```
/data/
├── snapshots/          → Ảnh AI event (~200KB/ảnh, giữ 30 ngày)
│   └── 2026-03-27/
│       └── event_001.jpg
├── recordings/         → Video clip sự kiện (~50MB/clip, giữ 30 ngày)
│   └── 2026-03-27/
│       └── event_001.mp4
└── thermal/            → Ảnh nhiệt định kỳ (~500KB/ảnh, giữ 7 ngày)
    └── 2026-03-27/
        └── thermal_001.jpg

InfluxDB:               → Sensor values, AI events (time-series)
SQLite:                 → Config, users, rules, devices, alert history
```

**Ước tính dung lượng:**
- OS + phần mềm: ~20GB
- InfluxDB + SQLite: ~5-10GB
- Ảnh/video (30 ngày): ~50-100GB
- Dự phòng: ~50GB
- Tổng: ~130-180GB → **SSD 256GB đủ dùng**

### Cloud (Serverless, $0/tháng)

```
Supabase PostgreSQL:
├── stations            → Danh sách trạm
├── users               → Tài khoản người dùng
├── events              → Lịch sử sự kiện quan trọng (sync từ trạm)
└── alerts              → Lịch sử cảnh báo

Cloudflare R2 (free 10GB/tháng):
└── snapshots/          → Ảnh AI event quan trọng (sync từ trạm)
    └── {station_id}/
        └── 2026-03-27/
            └── event_001.jpg
```

---

## 7. Kết nối & Mạng

### Môi trường dev/test
```
Máy dev ◄──── WireGuard P2P ────► Máy tại trạm
→ Truy cập được IP thật: PLC (192.168.10.100), camera (192.168.10.152/153)
→ Giả lập như đang trong cùng LAN
→ Không lộ thông tin ra ngoài (mã hoá end-to-end)
```

### Môi trường production
```
Jetson (cùng LAN với PLC + camera)
→ Kết nối thẳng, không cần VPN
→ Tốc độ tối đa, độ trễ thấp nhất
```

### Truy cập từ xa (mobile ngoài LAN)
```
Xem camera:    Mobile → go2rtc (trạm) → TURN server → WebRTC stream
Xem data:      Mobile → Cloudflare Workers → Supabase
Notification:  Trạm → Cloudflare → Firebase FCM → Mobile
```

---

## 8. Kế hoạch triển khai theo giai đoạn

---

### Giai đoạn 1 — Nền tảng & Môi trường Dev
**Thời gian:** 2 tuần | **Chi phí:** ~$20

**Mục tiêu:** Thiết lập môi trường dev, kết nối data thật từ trạm.

**Công việc:**
- [ ] Setup WireGuard P2P giữa máy dev và máy trạm
- [ ] Verify truy cập được IP thật: PLC, camera nhiệt, camera âm thanh
- [ ] Khởi tạo project ASP.NET Core backend (Station Mode)
- [ ] Setup InfluxDB + SQLite trên máy dev
- [ ] Kết nối API Ngrok hiện tại lấy data PLC (tạm thời)
- [ ] Setup VPS + Cloudflare Tunnel
- [ ] Verify data hiện đúng trên frontend

**Kết quả:** Backend skeleton chạy, data PLC hiện lên frontend qua API.

---

### Giai đoạn 2 — Hoàn thiện Frontend Web
**Thời gian:** 2 tuần (song song GĐ1) | **Chi phí:** $0

**Mục tiêu:** Web app hoàn chỉnh 100%, sẵn sàng tích hợp backend thật.

**Công việc:**
- [ ] Hoàn thiện AI Monitor page (hiện ~40%)
- [ ] Hoàn thiện Reports PDF (hiện ~70%)
- [ ] Hoàn thiện User Management CRUD
- [ ] Xây dựng System Status page
- [ ] Chuẩn bị nhận SignalR (bỏ polling)
- [ ] Test toàn bộ chức năng thông suốt
- [ ] Fix UI/UX các trang còn lỗi

**Kết quả:** Web app 100% chức năng, sẵn sàng tích hợp backend thật.

---

### Giai đoạn 3 — Backend Trạm (Station Mode)
**Thời gian:** 3-4 tuần | **Chi phí:** ~$40

**Mục tiêu:** Backend đọc data thật từ PLC, đẩy realtime về frontend.

**Công việc:**
- [ ] Kết nối thẳng PLC S7.Net qua WireGuard
  - Đọc DB32.DBW0/2/4 (nhiệt độ 3 phase)
  - Đọc DB32.DBW8 (PD sensor dB)
- [ ] Lưu time-series vào InfluxDB (mỗi 5 giây)
- [ ] SignalR WebSocket đẩy realtime về frontend
- [ ] Alert engine: tạo alert khi vượt ngưỡng cấu hình
- [ ] API camera: đọc ảnh từ historyFolder camera nhiệt
- [ ] REST API đầy đủ cho frontend
- [ ] Auth JWT + phân quyền 3 role
- [ ] Test với data PLC thật qua WireGuard

**Kết quả:** Dashboard realtime, alert tự động, data lưu lịch sử.

---

### Giai đoạn 4 — AI Development
**Thời gian:** 4-6 tuần | **Chi phí:** ~$330

**Mục tiêu:** AI nhận diện sự kiện từ 3 camera, tích hợp vào hệ thống.

**Công việc:**
- [ ] Thu thập dataset từ camera thật qua WireGuard
  - Camera nhiệt: ảnh bất thường nhiệt
  - Camera âm thanh: pattern phóng điện
  - Camera Hikvision: người, PPE đúng/sai
- [ ] Label data với Roboflow (mục tiêu 500-1000 ảnh/class)
- [ ] Fine-tune YOLO11 trên Google Colab Pro
- [ ] Đánh giá model: mAP, FPS, precision/recall
- [ ] Mua + setup Jetson Orin Nano 8GB
  - Cài JetPack OS (Ubuntu)
  - Cài CUDA, TensorRT, Python dependencies
- [ ] Tối ưu model với TensorRT cho Jetson
- [ ] Test inference: 3 camera song song trên Jetson
- [ ] Nâng cấp yolo_server.py:
  - Xử lý 3 camera song song
  - Phân loại event theo loại camera
  - Lưu snapshot + clip khi có sự kiện
  - Đẩy event về backend qua REST

**Kết quả:** AI detect chính xác trên Jetson, events tự động tạo alert.

---

### Giai đoạn 5 — Tích hợp & Test nội bộ
**Thời gian:** 2-3 tuần | **Chi phí:** ~$20

**Mục tiêu:** Toàn bộ hệ thống chạy thông suốt end-to-end.

**Công việc:**
- [ ] Kết nối AI events → Backend → InfluxDB → Alert
- [ ] Setup Firebase FCM, test push notification
- [ ] Test luồng hoàn chỉnh:
  - PLC vượt ngưỡng → alert → notification mobile
  - AI detect → alert → notification → snapshot lưu
- [ ] Test offline: mất internet → hệ thống vẫn chạy
- [ ] Test recovery: mất điện → tự khởi động lại
- [ ] Performance test: 3 camera + PLC cùng lúc trên Jetson
- [ ] Fix bugs phát sinh

**Kết quả:** End-to-end hoạt động hoàn chỉnh, ổn định.

---

### Giai đoạn 6 — Desktop App (Tauri)
**Thời gian:** 2 tuần | **Chi phí:** $0

**Mục tiêu:** App desktop Windows hoàn chỉnh cho vận hành tại trạm.

**Công việc:**
- [ ] Chuyển web app → Tauri desktop
- [ ] Rust đọc RTSP thẳng thay go2rtc (giảm độ trễ)
- [ ] Tự khởi động services khi mở app:
  - Python AI service
  - ASP.NET Core backend
  - InfluxDB
- [ ] Build file .exe installer Windows
- [ ] Test ổn định trên Windows

**Kết quả:** File .exe cài được, app tự khởi động toàn bộ hệ thống.

---

### Giai đoạn 7 — Mobile App (React Native Android)
**Thời gian:** 3 tuần | **Chi phí:** $0

**Mục tiêu:** App Android cho giám sát từ xa, nhận alert.

**Công việc:**
- [ ] Setup React Native project (TypeScript)
- [ ] Màn hình Dashboard KPI
- [ ] Màn hình danh sách + chi tiết Alert
- [ ] Xem snapshot sự kiện
- [ ] Xem live camera:
  - Trong LAN: RTSP thẳng
  - Ngoài LAN: WebRTC qua go2rtc + TURN
- [ ] Push notification Firebase FCM
- [ ] Đăng nhập + chọn trạm (multi-trạm)
- [ ] Build file .apk → test sideload Android

**Kết quả:** App Android cài được, nhận notification, xem camera từ xa.

---

### Giai đoạn 8 — Cloud Backend (Serverless)
**Thời gian:** 2 tuần | **Chi phí:** $0

**Mục tiêu:** Backend cloud nhẹ, $0/tháng, không cần máy chủ riêng.

**Công việc:**
- [ ] Deploy ASP.NET Core → Cloudflare Workers (Cloud Mode)
- [ ] Setup Supabase PostgreSQL (database cloud)
- [ ] Setup Cloudflare R2 (lưu snapshot cloud)
- [ ] API remote cho mobile:
  - GET /stations — danh sách trạm
  - GET /events — lịch sử sự kiện
  - GET /snapshots — ảnh sự kiện
- [ ] Nhận sync events từ trạm đẩy lên
- [ ] Forward notification qua Firebase FCM
- [ ] Test toàn bộ luồng remote

**Kết quả:** Xem được từ xa, notification hoạt động, chi phí $0/tháng.

---

### Giai đoạn 9 — Đóng gói & Installer
**Thời gian:** 2 tuần | **Chi phí:** ~$80

**Mục tiêu:** 1 file installer, người tại trạm tự cài được.

**Công việc:**
- [ ] Tạo installer tự động cho Jetson Linux:
  - Cài .NET Runtime
  - Cài Python + YOLO dependencies
  - Cài InfluxDB + SQLite
  - Cài go2rtc
  - Cấu hình systemd (tự chạy khi boot Linux)
- [ ] File config đơn giản (config.json):
  - Tên trạm, station_id
  - IP camera (nhiệt, âm thanh, giám sát)
  - IP PLC + địa chỉ DB
  - Cloud token
- [ ] Web UI quản lý tại trạm:
  - Thêm/xóa camera không cần code
  - Thêm/xóa sensor không cần code
  - Xem trạng thái tất cả services
- [ ] Tài liệu hướng dẫn cài đặt (có hình ảnh)
- [ ] Test cài đặt từ đầu trên Jetson sạch

**Kết quả:** Người không biết code tự cài được trong 30 phút.

---

### Giai đoạn 10 — Triển khai & Test tại trạm thật
**Thời gian:** 2-3 tuần | **Chi phí:** ~$20

**Mục tiêu:** Hệ thống chạy ổn định 24/7 tại trạm điện thật.

**Công việc:**
- [ ] Lắp Jetson + Switch + UPS vào tủ kỹ thuật trạm
- [ ] Kết nối cùng LAN với PLC + 3 camera
- [ ] Chạy installer → verify tất cả kết nối
- [ ] Chạy thử 1-2 tuần, theo dõi:
  - Data PLC đúng, liên tục, không mất gói
  - AI detect chính xác trong điều kiện thực tế
  - Alert đúng ngưỡng, không báo nhầm
  - Mobile nhận notification đúng, kịp thời
  - Mất điện → UPS giữ → tự khởi động lại khi có điện
  - Mất internet → trạm vẫn chạy → sync lại khi có mạng
- [ ] Fix lỗi phát sinh trong điều kiện thực tế
- [ ] Đào tạo vận hành viên tại trạm
- [ ] Bàn giao tài liệu vận hành

**Kết quả:** Hệ thống chạy ổn định 24/7, vận hành viên tự sử dụng được.

---

### Giai đoạn 11 — Mở rộng Multi-trạm
**Thời gian:** 1 tuần/trạm | **Chi phí:** ~$410/trạm

**Mục tiêu:** Nhân rộng ra nhiều trạm, không sửa code.

**Công việc (mỗi trạm):**
- [ ] Mua Jetson Orin Nano + phụ kiện (~$410)
- [ ] Chạy installer trên Jetson mới
- [ ] Điền config (tên trạm, IP camera, IP PLC, cloud token)
- [ ] Trạm tự đăng ký lên cloud
- [ ] Dashboard tổng tự hiện thêm trạm mới
- [ ] Test kết nối + AI detect
- [ ] Đào tạo vận hành viên

**Kết quả:** Thêm trạm trong 1 ngày, không cần developer.

---

## 9. Timeline tổng quan

```
Tháng 1 (tuần 1-2):  GĐ1 Nền tảng + GĐ2 Frontend (song song)
Tháng 1 (tuần 3-4):  GĐ3 Backend trạm (bắt đầu)
Tháng 2:             GĐ3 Backend trạm (hoàn thành) + GĐ4 AI (bắt đầu)
Tháng 2-3:           GĐ4 AI Development (dài nhất, 4-6 tuần)
Tháng 4 (tuần 1-2):  GĐ5 Tích hợp + GĐ6 Desktop (song song)
Tháng 4 (tuần 3-4):  GĐ7 Mobile + GĐ8 Cloud (song song)
Tháng 5 (tuần 1-2):  GĐ9 Đóng gói + Installer
Tháng 5-6:           GĐ10 Triển khai trạm thật + Test
Tháng 6+:            GĐ11 Mở rộng thêm trạm
```

**Tổng thời gian:** ~5-6 tháng cho trạm đầu tiên hoàn chỉnh

---

## 10. Chi phí tổng hợp

### Chi phí 1 lần (trạm đầu tiên)
| Hạng mục | Chi phí |
|---|---|
| Jetson Orin Nano 8GB | ~$250 (~6.3tr) |
| SSD NVMe 256GB | ~$30 (~750k) |
| Nguồn 19V/4A | ~$15 (~375k) |
| Vỏ hộp + tản nhiệt | ~$20 (~500k) |
| Switch LAN 8 port | ~$30 (~750k) |
| UPS 650VA | ~$50 (~1.25tr) |
| Thẻ WiFi | ~$15 (~375k) |
| **Tổng phần cứng** | **~$410 (~10.3tr)** |

### Chi phí dịch vụ trong quá trình phát triển
| Hạng mục | Chi phí |
|---|---|
| VPS Cloud (6 tháng × $20) | ~$120 (~3tr) |
| Google Colab Pro (2 tháng × $10) | ~$20 (~500k) |
| **Tổng dịch vụ** | **~$140 (~3.5tr)** |

### Chi phí vận hành hàng tháng (sau khi xong)
| Dịch vụ | Chi phí |
|---|---|
| Cloudflare Workers + R2 + Tunnel | Free |
| Supabase PostgreSQL | Free (500MB) |
| Firebase FCM | Free |
| VPS (nếu vẫn cần) | ~$12-20/tháng |
| **Tổng/tháng** | **~$0-20/tháng** |

### Tổng chi phí trạm đầu tiên
| Hạng mục | Chi phí |
|---|---|
| Phần cứng | ~$410 (~10.3tr) |
| Dịch vụ dev 6 tháng | ~$140 (~3.5tr) |
| **Tổng** | **~$550 (~13.8tr) + công dev** |

### Chi phí mỗi trạm thêm
| Hạng mục | Chi phí |
|---|---|
| Phần cứng Jetson + phụ kiện | ~$410/trạm (~10.3tr) |
| Cloud (scale thêm nếu cần) | ~$0-10/tháng thêm |

---

## 11. Rủi ro & Giải pháp

| Rủi ro | Khả năng | Giải pháp |
|---|---|---|
| AI detect không chính xác trong thực tế | Cao | Thu thập data từ camera thật, fine-tune lại |
| Jetson không đủ mạnh cho 3 camera | Thấp | Orin Nano 40 TOPS đủ dùng, có thể giảm resolution |
| PLC thay đổi địa chỉ DB | Trung bình | Cấu hình địa chỉ qua file config, không hardcode |
| Mất kết nối camera thường xuyên | Trung bình | go2rtc tự reconnect, alert khi mất kết nối >60s |
| Hết dung lượng SSD | Thấp | Tự động xóa file cũ, monitor dung lượng |
| API backend họ thay đổi | Trung bình | Chuyển sang S7.Net đọc thẳng PLC ở GĐ3 |
