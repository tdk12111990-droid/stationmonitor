# Deployment Configuration

## Mục tiêu triển khai

Mô hình triển khai phù hợp cho project này:

- `Jetson Orin Nano`: chạy `backend` + `PostgreSQL` + `MQTT` + `go2rtc` + background workers + AI sidecar nếu cần.
- `Máy tính tại trạm`: cài `desktop app` để vận hành, chỉ đóng vai trò client.
- `Mobile app`: nếu dùng, cũng kết nối về Jetson qua LAN.

Mô hình này **không xung đột về kiến trúc**, nhưng project hiện tại có một số chỗ hardcode `localhost`, nên cần cấu hình lại trước khi đóng gói production.

---

## Kiến trúc khuyến nghị

### 1. Jetson Orin Nano

Jetson nên chạy toàn bộ backend stack:

- ASP.NET Core API
- PostgreSQL / TimescaleDB
- MQTT Broker
- go2rtc
- background workers
- AI engine / camera integration nếu cần

Port mặc định hiện tại trong repo:

- `5056`: Backend API
- `1984`: go2rtc
- `1883`: MQTT
- `5432`: PostgreSQL

### 2. Máy tính tại trạm

Máy trạm chỉ cài desktop app:

- gọi REST API tới Jetson
- nhận SignalR realtime từ Jetson
- mở stream camera qua go2rtc trên Jetson

Desktop app **không nên chạy backend local** trong mô hình này.

### 3. Mobile app

Mobile app cũng phải trỏ về Jetson:

- `EXPO_PUBLIC_API_URL=http://<JETSON_IP>:5056`
- `EXPO_PUBLIC_WS_URL=http://<JETSON_IP>:5056/ws/realtime`
- `EXPO_PUBLIC_GO2RTC_URL=http://<JETSON_IP>:1984`

---

## Xung đột hiện tại trong project

### 1. Frontend hardcode `localhost`

Đây là blocker lớn nhất khi tách Jetson và máy trạm.

Hiện tại nhiều file frontend đang gọi:

- `http://localhost:5056`
- `http://localhost:1984`

Ví dụ:

- `frontend/src/services/AuthService.ts`
- `frontend/src/services/StationApiService.ts`
- `frontend/src/components/AppShell.ts`
- `frontend/src/pages/DashboardPage.ts`
- `frontend/src/pages/DeviceManagementPage.ts`
- `frontend/src/pages/AnalyticsPage.ts`
- `frontend/src/pages/AlertsHistoryPage.ts`

Khi desktop app chạy trên máy tính tại trạm, `localhost` sẽ là **máy trạm**, không phải Jetson. Nếu giữ nguyên, app sẽ không gọi được backend thật.

### 2. go2rtc cũng đang mặc định local

File cấu hình env hiện có:

- `frontend/src/utils/env.ts`

Đã hỗ trợ:

- `VITE_API_URL`
- `VITE_GO2RTC_URL`

Nhưng code hiện tại chưa dùng thống nhất ở mọi nơi.

### 3. Discovery / scan thiết bị chạy từ backend

Các chức năng scan camera, ONVIF, subnet discovery đang đi qua backend. Điều đó có nghĩa là:

- nếu backend ở Jetson, việc quét sẽ chạy từ Jetson
- Jetson phải cùng mạng với camera / PLC / thiết bị hiện trường

Điều này không sai, nhưng phải hiểu rõ để tránh nhầm là máy trạm đang quét.

### 4. Cấu hình bảo mật và secret

Project hiện có secret nằm trực tiếp trong repo, nhất là:

- `backend/StationMonitor.Api/appsettings.json`

Trước khi đóng gói production nên chuyển secret sang:

- environment variables
- file config riêng ngoài repo
- Docker secrets nếu cần

---

## Cấu hình khuyến nghị cho production

Giả sử Jetson có IP LAN là `192.168.1.50`.

### Backend / streaming endpoints

- API: `http://192.168.1.50:5056`
- SignalR: `http://192.168.1.50:5056/ws/realtime`
- go2rtc: `http://192.168.1.50:1984`
- MQTT: `192.168.1.50:1883`

### Frontend desktop

Khi build desktop app cho máy trạm, nên cấu hình:

```env
VITE_API_URL=http://192.168.1.50:5056
VITE_GO2RTC_URL=http://192.168.1.50:1984
```

Nếu cần tách rõ WebSocket:

```env
VITE_WS_URL=http://192.168.1.50:5056/ws/realtime
```

### Mobile app

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:5056
EXPO_PUBLIC_WS_URL=http://192.168.1.50:5056/ws/realtime
EXPO_PUBLIC_GO2RTC_URL=http://192.168.1.50:1984
```

---

## Quy trình đóng gói đề xuất

## A. Đóng gói Jetson Orin Nano

Project hiện đã có sẵn các file nền:

- `deploy-jetson.sh`
- `docker-compose.yml`
- `backend/Dockerfile`

Quy trình đề xuất:

1. Copy source code sang Jetson
2. Kiểm tra Docker và Docker Compose
3. Chạy:

```bash
chmod +x deploy-jetson.sh
sudo ./deploy-jetson.sh
```

4. Kiểm tra container:

```bash
docker compose ps
docker compose logs -f
```

5. Kiểm tra API từ máy khác trong LAN:

```bash
curl http://<JETSON_IP>:5056
```

Lưu ý:

- `go2rtc` đang dùng `network_mode: host`, phù hợp khi chạy trên Linux / Jetson
- cần test thật với camera và PLC thực tế
- AI sidecar cần xác minh thêm vì repo hiện chứa nhiều phần demo / SDK thử nghiệm

## B. Đóng gói desktop app cho máy trạm Windows

Desktop app đang dùng Tauri:

- `frontend/src-tauri/tauri.conf.json`

Quy trình đề xuất:

1. Sửa toàn bộ frontend để bỏ hardcode `localhost`
2. Chuẩn hóa mọi API URL / WS URL / go2rtc URL dùng env chung
3. Build với env production trỏ về Jetson
4. Sinh installer `msi` hoặc `nsis`
5. Cài installer lên máy tính tại trạm

Ví dụ build production:

```bash
cd frontend
npm install
npm run desktop:build:full
```

Trước bước này phải chắc chắn frontend không còn hardcode `localhost:5056`.

---

## Những việc nên làm trước khi release thật

### Bắt buộc

- gom toàn bộ API URL về một chỗ cấu hình chung
- bỏ hardcode `localhost` trong frontend
- cấu hình desktop app trỏ về `JETSON_IP`
- kiểm tra SignalR realtime qua LAN
- kiểm tra go2rtc stream qua LAN

### Nên làm

- tách secret khỏi `appsettings.json`
- thêm `.env.production`
- thêm tài liệu cài đặt cho máy trạm
- thêm healthcheck / auto-restart cho container trên Jetson
- xem lại CSP trong Tauri để chắc chắn cho phép gọi `http://<JETSON_IP>:5056` và `http://<JETSON_IP>:1984`

---

## Kết luận

Project này có thể triển khai theo mô hình:

- Jetson chạy backend
- máy trạm chạy desktop app

Nhưng hiện tại chưa nên đóng gói ngay vì frontend vẫn phụ thuộc mạnh vào `localhost`.

Blocker chính hiện nay:

- frontend chưa cấu hình production-ready cho mô hình tách máy

Nếu xử lý xong phần cấu hình URL và kiểm thử LAN, mô hình này sẽ chạy ổn và không có xung đột kiến trúc lớn.
