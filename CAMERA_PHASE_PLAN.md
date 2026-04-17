# Kế hoạch tích hợp Camera — StationMonitor

## Trạng thái hiện tại (đã hoàn thành)

### ✅ Realtime Monitor (NVR-style)
- Grid 1×1 / 2×2 / 3×3 — layout switcher
- Double-click ô cam → fullscreen toàn màn hình
- Grid dùng **sub-stream (480p)** → mượt, không lag
- Fullscreen tự switch sang **main stream (1080p)** → sắc nét
- Mode `mse` — kết nối nhanh, ổn định hơn webrtc qua iframe
- ESC / nút "← Quay về lưới" để thoát fullscreen
- Panel nhật ký sự kiện bên phải: collapsible, filter theo loại + ngày
- Khi fullscreen cam X → panel tự lọc chỉ hiện event của cam X
- Click ảnh trong panel → lightbox fullscreen
- SignalR realtime: event mới xuất hiện ngay, status dot cập nhật
- Nút 📸 chụp ảnh qua go2rtc `/api/frame.jpeg`

### ✅ Camera Webhook (nhận event từ cam)
- `POST /api/v1/camera-webhook` — nhận HTTP push từ Hikvision ISAPI
- Xử lý XML 2 format: `EventTriggerNotificationList` + `EventNotificationAlert`
- Tìm camera trong DB bằng IP (dynamic — không cần sửa code khi thêm cam)
- Lưu `DetectionEvent` + snapshot JPEG vào `wwwroot/detections/`
- Tạo `Alert` tự động với các event nghiêm trọng (fire, thermal, intrusion, PD)
- Push SignalR `CameraEvent` realtime về frontend

### ✅ go2rtc Streams (đã cấu hình)
```
camera_152_normal   → Channels/101 (1080p main)
camera_152_sub      → Channels/102 (480p grid)
camera_152_thermal  → Channels/201 (thermal palette)
camera_153_pd       → Channels/101 (1080p main)
camera_153_sub      → Channels/102 (480p grid)
```

---

## Vấn đề đã fix

| Vấn đề | Nguyên nhân | Fix |
|--------|------------|-----|
| Cam quang học lag/đứng | Dùng main stream 1080p cho grid | Sub-stream 480p cho grid |
| Thanh loading dài | mode=webrtc chậm negotiate ICE | Đổi sang mode=mse |
| Fullscreen kém nét | Vẫn dùng sub-stream | Switch sang main stream khi expand |

---

## Phase tiếp theo: Dynamic Camera Registration

### Mục tiêu
Khi thêm camera mới qua Device Management → hệ thống tự xử lý, **không cần sửa code hay config**.

### Luồng hoạt động mới
```
Admin vào Device Management
  → Điền: Tên, IP, RTSP URL main + sub, username, password
  → Nhấn Lưu

Backend tự động:
  1. Lưu Device vào DB
  2. Gọi go2rtc API → đăng ký main + sub stream
     PUT http://localhost:1984/api/streams?name={id}_main&url={rtsp_main}
     PUT http://localhost:1984/api/streams?name={id}_sub&url={rtsp_sub}
  3. Lưu go2rtc_id, go2rtc_sub_id vào device.config JSON

Frontend Realtime:
  → Đọc go2rtc_id từ device.config → stream hiện ngay
  → Không cần restart go2rtc hay sửa yaml

Webhook:
  → Tự nhận event từ IP mới (đã dynamic)
```

### Cần làm

**Backend:**
- [ ] `IGoRtcService` + `GoRtcService` — wrapper gọi go2rtc REST API
- [ ] `DeviceManagementController.CreateAsync` → gọi `GoRtcService.RegisterStreamAsync`
- [ ] `DeviceManagementController.UpdateAsync` → gọi `GoRtcService.UpdateStreamAsync`
- [ ] `DeviceManagementController.DeleteAsync` → gọi `GoRtcService.RemoveStreamAsync`
- [ ] Startup: sync go2rtc streams từ DB (cho trường hợp go2rtc restart)

**Frontend:**
- [ ] Form Device Management thêm fields:
  - RTSP URL main (ví dụ: `rtsp://admin:pass@192.168.x.x/Streaming/Channels/101`)
  - RTSP URL sub (tự sinh từ main nếu Hikvision: thay `101` → `102`)
  - Event types muốn nhận (checkboxes: thermal, intrusion, motion...)
- [ ] Auto-fill sub URL khi người dùng nhập main URL

**Cấu hình camera (phía camera — manual 1 lần):**
```
Web cam → Configuration → Network → Advanced → HTTP Listening
  URL: http://{server_ip}:5056/api/v1/camera-webhook
  Protocol: HTTP
  Enable: Motion / Thermal / Intrusion / Line Crossing...
```

---

## Kiến trúc tổng thể Camera

```
[Camera Hikvision]
  ├── RTSP stream → go2rtc → WebRTC/MSE → Browser (live view)
  └── HTTP push  → /api/v1/camera-webhook → DB + SignalR → Frontend

[go2rtc]
  ├── Streams đăng ký từ DB khi backend start
  ├── REST API tại :1984 cho dynamic registration
  └── Hỗ trợ: sub-stream (grid) + main stream (fullscreen)

[Backend]
  ├── CameraWebhookController — nhận event, lưu DB, push SignalR
  ├── DetectionsController    — API trả lịch sử event (không còn dùng, tích hợp vào Realtime)
  └── GoRtcService (TODO)    — sync streams với go2rtc

[Frontend Realtime]
  ├── Grid: sub-stream (480p, mượt)
  ├── Fullscreen: main stream (1080p, sắc nét)
  ├── Events panel: lịch sử + realtime qua SignalR
  └── Tự load danh sách cam từ API — không hardcode
```

---

## Lưu ý cấu hình Hikvision

- Channel 101 = main stream (HD/1080p)
- Channel 102 = sub-stream (480p/720p, set trong camera web)
- Channel 201 = thermal stream (chỉ có trên cam nhiệt)
- Mật khẩu URL-encode ký tự `@` thành `%40`

**Khuyến nghị cấu hình sub-stream trong web cam:**
```
Video → Stream Parameters → Sub Stream
  Resolution: 640×480 hoặc 1280×720
  Frame rate: 15 fps
  Bitrate: 512 – 1024 kbps
  Codec: H.264
```
