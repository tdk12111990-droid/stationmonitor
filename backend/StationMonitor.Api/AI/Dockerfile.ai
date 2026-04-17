# ============================================================
# Dockerfile.ai — StationMonitor AI Engine (JetPack 6.0 / R36)
# Tối ưu hóa cho Jetson Orin Nano với GPU support
# ============================================================

# Sử dụng Image nền của NVIDIA cho JetPack 6 (Ubuntu 22.04 + CUDA + OpenCV)
FROM nvcr.io/nvidia/l4t-pytorch:r36.2.0-pth2.1-py3

# Tránh các câu hỏi tương tác khi cài đặt apt
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết cho FFmpeg và Hikvision SDK
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    liblog4cpp5-dev \
    libssl-dev \
    libxcb-xinerama0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements và cài đặt python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy mã nguồn AI và SDK
# Lưu ý: Bạn cần đặt các file .so của Hikvision vào thư mục AI/lib/linux/
COPY . .

# Environment variables mặc định
ENV PYTHONPATH=/app
ENV SDK_PATH=/app
ENV WWWROOT_PATH=/app/wwwroot
ENV API_URL=http://stationmonitor-backend:8080/api/v1
ENV CAMERA_IP=192.168.10.152

# Chạy engine chính
CMD ["python3", "enhanced_relay.py"]
