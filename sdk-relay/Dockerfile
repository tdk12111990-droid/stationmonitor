# Sử dụng Image nền Python tiêu chuẩn (x86_64/ARM64)
FROM python:3.11-slim
# Tránh các câu hỏi tương tác khi cài đặt apt
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app
# Cài đặt các thư viện hệ thống cần thiết cho OpenCV, FFmpeg và Hikvision SDK
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    liblog4cpp5-dev \
    libssl-dev \
    libxcb-xinerama0 \
    && rm -rf /var/lib/apt/lists/*
# Copy requirements và cài đặt python dependencies
COPY requirements.txt .
# Cài đặt opencv-python-headless để tránh lỗi thư viện GUI trong Docker
RUN pip3 install --no-cache-dir -r requirements.txt && \
    pip3 install --no-cache-dir opencv-python-headless
# Sửa lỗi xung đột Numpy của Ultralytics (tách layer riêng để tận dụng cache)
RUN pip3 install --no-cache-dir "numpy<2.0.0"
# Copy mã nguồn AI và SDK
COPY . .
# Environment variables mặc định
ENV PYTHONPATH=/app
ENV SDK_PATH=/app
ENV WWWROOT_PATH=/app/wwwroot
ENV API_URL=http://stationmonitor-backend:8080/api/v1
ENV CAMERA_IP=192.168.10.152
# Chạy engine chính
CMD ["python3", "enhanced_relay.py"]
