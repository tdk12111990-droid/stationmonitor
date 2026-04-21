# Module: Mobile App (React Native)

> App iOS/Android xem realtime + nhận push notification.

---

## Stack

- **React Native** + **Expo SDK 54**
- TypeScript
- **SignalR client** (`@microsoft/signalr`) cho realtime
- **Expo Notifications** + FCM cho push
- **React Navigation** (stack + tab)
- Build: `eas build` hoặc `gradlew assembleRelease`

## Vị trí

`app-mobile/` — dự án Expo managed workflow.

## Cấu trúc

```
app-mobile/
├── app.json                     # Expo config
├── App.tsx                      # Root
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── AlertsScreen.tsx
│   │   ├── DeviceListScreen.tsx
│   │   └── AlertDetailScreen.tsx
│   ├── services/
│   │   ├── apiClient.ts         # Axios wrapper, JWT auto-attach
│   │   └── signalrClient.ts     # Connect /ws/realtime
│   ├── context/
│   │   └── AuthContext.tsx
│   └── components/
└── android/, ios/               # Expo prebuild output (gitignored)
```

## Kết nối backend

Backend chạy tại server nội bộ `http://<IP>:5056` — app mobile cần:
1. Cùng LAN → trỏ `API_URL=http://192.168.x.x:5056` trong `.env`
2. Remote → qua **Cloudflare Tunnel** (`scripts/cloudflare-tunnel.bat`) → URL `https://*.trycloudflare.com`

## Push Notification

```
Backend Alert mới
  ├── NotificationsController → FCM endpoint (Firebase)
  └── FCM → app mobile (user đã register device token)
```

Flow:
1. App launch → get FCM token → `POST /api/v1/users/me/device-token`
2. Backend lưu token trong `UserDeviceTokens`
3. Khi alert → gửi đến tất cả token của user subscribed

## Đã xong

- [x] Khung app (login, dashboard, alert list)
- [x] API client + JWT refresh flow
- [x] Cloudflare Tunnel config để expose backend

## Còn lại / Tương lai

- [ ] SignalR connection + reconnect on background → foreground
- [ ] Push notification end-to-end (FCM token register + send)
- [ ] Offline mode: cache alert list cuối cùng
- [ ] Biometric login (Touch/Face ID)
- [ ] Dark mode
- [ ] iOS build (hiện mới test Android APK)

## Build

```bash
cd app-mobile

# Dev
npm install
npx expo start              # QR code → Expo Go app

# APK prod
cd android && ./gradlew assembleRelease
# → app-mobile/android/app/build/outputs/apk/release/app-release.apk

# EAS cloud build (iOS + Android)
npm install -g eas-cli
eas build --platform android
eas build --platform ios
```

## Config

`.env` (gitignored):
```bash
API_URL=https://your-tunnel.trycloudflare.com
FCM_SENDER_ID=123456789
```

## Known issues

- Expo SDK 54 + Gradle 8 → cần JDK 17
- SignalR reconnect fail khi app vào background > 5 phút (iOS terminate WebSocket)
- Cloudflare Tunnel URL đổi mỗi lần restart → cần Named Tunnel cho prod
