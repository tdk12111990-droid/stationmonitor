# Mobile App — Kế hoạch chi tiết

> Stack: React Native + Expo SDK 54 | Bundle: `com.stationmonitor.powerguard`  
> Backend: ASP.NET Core 8 tại `localhost:5056`, expose ra ngoài qua **Cloudflare Tunnel**

---

## Kiến trúc kết nối

```
[Điện thoại Android/iOS]
        │  HTTPS (REST + SignalR)
        ▼
[Cloudflare Tunnel URL]  ←── cloudflare-tunnel.bat
        │
        ▼
[Backend :5056]  ←── localhost
        │
        ├── TimescaleDB :5432
        └── go2rtc :1984 (camera stream)
```

**Không phụ thuộc bên thứ 3:**
- Tunnel: Cloudflare (tự chạy, miễn phí)
- Notification: SignalR + `expo-notifications` local (không cần Firebase/APNs push server)
- Build: `eas build --local` hoặc `npx expo run:android` (không cần EAS cloud)

---

## Tính năng — So sánh Web vs Mobile

| Tính năng | Web Frontend | Mobile App | Ghi chú |
|-----------|-------------|-----------|---------|
| Đăng nhập JWT | ✅ | ✅ Xong | |
| Dashboard KPI | ✅ | ✅ Xong | |
| Danh sách cảnh báo | ✅ | ✅ Xong | |
| Chi tiết cảnh báo + ACK/Close | ✅ | ✅ Xong | |
| Danh sách thiết bị | ✅ | ✅ Xong | |
| Real-time sensor (SignalR) | ✅ | 🔧 Sửa | SignalR setup nhưng chưa bật |
| Trend chart thiết bị | ✅ | 🔧 Sửa | Đang trống `[]` |
| Thông báo khi có alarm mới | ✅ | 🔧 Cần làm | expo-notifications local |
| Camera stream | ✅ | 🔧 Cần làm | WebView → go2rtc |
| Bảo trì (Maintenance) | ✅ | 🔜 Sau | Phase 2 mobile |
| Rule Engine | ✅ | ❌ Không | Chỉ trên web |
| SLD Editor | ✅ | ❌ Không | Quá phức tạp cho mobile |
| Báo cáo PDF | ✅ | 🔜 Sau | Download link |
| Audit Log | ✅ | ❌ Không | Chỉ admin web |
| Settings cơ bản | ✅ | ✅ Xong | |

---

## Thứ tự implement

### Bước 1 — Kết nối Cloudflare Tunnel ✅ (config)
- Set `EXPO_PUBLIC_API_URL` = URL tunnel backend
- Set `EXPO_PUBLIC_WS_URL` = URL tunnel + `/ws/realtime`
- Tunnel URL thay đổi mỗi lần restart → dùng named tunnel cho stable URL

### Bước 2 — Kích hoạt SignalR real-time 🔧
- Gọi `signalRClient.start()` sau khi login thành công
- Subscribe `SensorUpdate` → cập nhật giá trị sensor trên dashboard + device list
- Subscribe `AlertNew` → trigger local notification + reload alerts
- Subscribe `DeviceStatus` → cập nhật online/offline badge

### Bước 3 — Local Notifications 🔧
- Cài `expo-notifications`
- Yêu cầu permission khi app khởi động
- Khi `AlertNew` từ SignalR → gửi local notification có title + body
- Tap notification → mở thẳng màn hình Alert Detail
- Background fetch (polling 60s) khi app bị minimize

### Bước 4 — Device Trend Chart 🔧
- Gọi `GET /api/v1/history?pointId=...&hours=6`
- Vẽ chart bằng react-native-svg (đã có)
- Cho phép switch 6h/24h/7d

### Bước 5 — Camera Stream 🔧
- Tab CamAI → WebView load `https://<go2rtc-tunnel>/stream.html?src=camera_152_normal`
- Hỗ trợ 3 luồng: normal / thermal / phóng điện
- Snapshot button → `expo-image-picker` save local

### Bước 6 — Build APK Android 📦
```bash
# Dev build (USB debug)
npx expo run:android

# Release APK (không cần EAS cloud)
eas build --local --platform android --profile preview

# Hoặc dùng Gradle trực tiếp
cd android && ./gradlew assembleRelease
```

### Bước 7 — Build iOS (cần Mac + Apple Dev account)
```bash
npx expo run:ios
eas build --local --platform ios --profile preview
```

---

## Cấu trúc file

```
app-mobile/
  app/
    _layout.tsx          ← Root: AuthProvider + QueryClient + Notifications setup
    login.tsx            ✅ API thật
    (tabs)/
      _layout.tsx        ✅ Tab navigation
      index.tsx          ✅ Dashboard (cần thêm SignalR update)
      alerts.tsx         ✅ API thật
      devices.tsx        ✅ API thật (cần thêm SignalR update)
      camera.tsx         🔧 Cần WebView go2rtc
      settings.tsx       ✅ OK
    alert/[id].tsx       ✅ API thật
    device/[id].tsx      🔧 Cần trend data từ API
  context/
    auth.tsx             🔧 Cần start SignalR sau login
    notifications.tsx    🔧 Tạo mới
  lib/
    api-client.ts        ✅ OK (đọc EXPO_PUBLIC_API_URL)
    signalr-client.ts    🔧 Cần kích hoạt
    history-api.ts       🔧 Tạo mới
  constants/
    colors.ts            ✅ OK
  .env                   🔧 Set tunnel URL
```

---

## Giới hạn kỹ thuật (honest)

| Tình huống | Hỗ trợ? |
|-----------|---------|
| App đang mở → nhận notification | ✅ SignalR realtime |
| App ở background (minimize) → nhận notification | ✅ Background fetch 60s |
| App bị kill hoàn toàn → nhận notification | ❌ Cần FCM/APNs (bên thứ 3) |

> **Giải pháp thực tế**: Với app giám sát công nghiệp, nhân viên vận hành thường giữ app chạy nền → Background fetch 60s là đủ dùng.

---

## Build không cần EAS cloud

```bash
# 1. Cài Java 17 + Android SDK
# 2. Tạo keystore
cd app-mobile/android
keytool -genkey -v -keystore release.keystore -alias powerguard -keyalg RSA -keysize 2048 -validity 10000

# 3. Build APK
./gradlew assembleRelease

# APK output: android/app/build/outputs/apk/release/app-release.apk
# Cài lên điện thoại: adb install app-release.apk
# Hoặc copy file APK → cài trực tiếp
```

---

## Môi trường cần thiết

```env
# app-mobile/.env
EXPO_PUBLIC_API_URL=https://<backend-tunnel>.trycloudflare.com
EXPO_PUBLIC_WS_URL=https://<backend-tunnel>.trycloudflare.com/ws/realtime
EXPO_PUBLIC_GO2RTC_URL=https://<go2rtc-tunnel>.trycloudflare.com
```

> Nếu dùng Named Tunnel thì URL cố định, không cần đổi mỗi lần restart.
