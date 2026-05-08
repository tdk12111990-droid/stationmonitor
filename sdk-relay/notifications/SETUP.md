# Camera Notification System — Hướng Dẫn Setup

## Yêu Cầu

1. **Python 3.8+** (đã cài)
2. **FFmpeg** — để ghi video từ camera stream
3. **Python packages** — `requests`

## Setup (Chỉ Cần Làm 1 Lần)

### 1. Cài FFmpeg

**Windows (Admin):**
```cmd
choco install ffmpeg
```

Hoặc download từ: https://ffmpeg.org/download.html

Verify:
```cmd
ffmpeg -version
```

### 2. Cài Python Dependencies

```bash
cd sdk-relay\notifications
pip install -r requirements.txt
```

### 3. Cấu Hình Camera

Sửa `config.json`:
```json
{
  "camera_152": {
    "ip": "192.168.10.152",      // IP của camera
    "user": "admin",              // Username
    "password": "Demo@2024",      // Password
    ...
  },
  "camera_153": {
    "ip": "192.168.10.153",
    "user": "admin",
    "password": "Demo@2024",
    ...
  }
}
```

## Chạy

### Cách 1: Chạy tất cả (Khuyên dùng)
```bash
# Từ thư mục D:\StationMonitor
start.bat
```

Sẽ tự động:
- ✅ Khởi động Backend (port 5056)
- ✅ Khởi động Frontend (port 5173)
- ✅ Khởi động go2rtc (port 1984)
- ✅ Khởi động AI Stream Relay
- ✅ Khởi động Camera Notification System

### Cách 2: Chạy riêng (Để debug)
```bash
cd sdk-relay\notifications
python main.py
```

## Kết Quả Mong Đợi

Khi chạy, sẽ thấy:
```
[CAM152] ✅ AlertStream connected
[CAM153] ✅ AlertStream connected
```

Khi có sự kiện camera:
```
[CAM152] Event #1: temperatureAlarm
[CAM152] [OK] Alert saved: alerts/20260422_143022_cam152_temperatureAlarm.json
[WEBHOOK] Posted to backend: 200
[CAM152] Recording 15s video...
[WEBHOOK] Posted video to backend: 200
```

## Xem Cảnh Báo

1. Mở http://localhost:5173 (Frontend)
2. Dashboard → "🔔 CẢNH BÁO GẦN ĐÂY" → cảnh báo xuất hiện tức thì
3. Hoặc trang "Nhật ký cảnh báo" → xem chi tiết + video

## Khắc Phục Lỗi

**"FFmpeg not found"**
- Cài FFmpeg (xem trên)
- Chạy lại

**"Connection refused (5056)"**
- Backend chưa chạy
- Chạy `start.bat` hoặc `dotnet run` trong `backend/`

**"Camera offline"**
- Ping camera: `ping 192.168.10.152`
- Kiểm tra credentials trong config.json
- Kiểm tra IP address đúng

## File Structure

```
sdk-relay/notifications/
├── main.py                    # Entry point
├── config.json               # Camera + thresholds
├── alert_manager.py          # Save + POST webhook
├── camera_152.py             # Thermal listener
├── camera_153.py             # Acoustic listener
├── video_recorder.py         # Video + image capture
├── alerts/                   # Output: JSON + JPG + MP4
└── notifications.log         # Log file
```

## Cấu Hình Nâng Cao

Xem trang **Settings → Hành động Liên kết (Camera)** để:
- ✅ Bật/tắt capture ảnh
- ✅ Bật/tắt record video
- ✅ Bật/tắt thông báo
- ✅ Cài cooldown (chống spam)
- ✅ Cài filter time (chống nhiễu)
