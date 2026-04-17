# Hướng dẫn Cài đặt & Triển khai Jetson Nano (JetPack 6.0 / R36)

Tài liệu này hướng dẫn bạn cách thiết lập môi trường từ máy cá nhân (Windows) đến Jetson Nano và Máy trạm vận hành thông qua Tailscale & Docker.

## 1. Thiết lập Mạng nội bộ ảo (Tailscale)

Để các máy tính có thể nhìn thấy nhau từ xa bằng IP cố định:
1. Cài đặt Tailscale trên **Máy cá nhân**, **Máy trạm** và **Jetson Nano**.
2. Đăng nhập cùng một tài khoản.
3. Ghi lại IP Tailscale của Jetson (ví dụ: `100.11.22.33`).

## 2. Chuẩn bị trên Jetson Nano

### A. Cài đặt Docker & GPU Support
Chạy các lệnh sau để cài đặt môi trường chạy AI:
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nvidia-container-toolkit
sudo systemctl restart docker
sudo usermod -aG docker $USER
# KHỞI ĐỘNG LẠI JETSON sau bước này
```

### B. Chuẩn bị Thư viện SDK Hikvision
1. Tải bản **Device Network SDK (for Linux ARM64)** từ Hikvision.
2. Giải nén và copy toàn bộ các file `.so` vào thư mục:
   `backend/StationMonitor.Api/AI/lib/linux/`

## 3. Quy trình Cập nhật & Chạy hệ thống

### Bước 1: Đẩy code từ máy Windows (Lập trình)
Mỗi khi bạn sửa code xong:
```bash
git add .
git commit -m "Cập nhật tính năng mới"
git push
```

### Bước 2: Cập nhật & Khởi động trên Jetson
Chạy script cập nhật (đã chuẩn bị sẵn):
```bash
chmod +x update.sh
./update.sh
```
Hệ thống sẽ tự động tải bản mới nhất, build lại Docker và khởi động trong vài giây.

## 4. Cấu hình Máy trạm vận hành (Windows View Station)

Nếu bạn dùng App Desktop trên máy trạm, hãy tạo file `.env` trong thư mục `frontend/` (hoặc cấu hình IP trong App) trỏ về IP của Jetson:
```env
VITE_API_URL=http://100.11.22.33:5056
VITE_GO2RTC_URL=http://100.11.22.33:1984
```
*(Thay `100.11.22.33` bằng IP Tailscale thật của Jetson).*

---
> [!TIP]
> **Kiểm tra GPU**: Sau khi chạy Docker, bạn có thể kiểm tra xem AI Engine đã nhận GPU chưa bằng lệnh:
> `docker compose logs stationmonitor-ai`
