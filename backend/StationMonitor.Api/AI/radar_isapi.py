import requests
import time
import os
import xml.dom.minidom
from requests.auth import HTTPDigestAuth

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# Thư mục lưu ảnh báo động
ALERTS_DIR = r"d:\StationMonitor\alerts"
if not os.path.exists(ALERTS_DIR):
    os.makedirs(ALERTS_DIR)

# URL để lấy nhiệt độ Real-time
TEMP_URL = f"http://{CAMERA_IP}/ISAPI/Thermal/channels/2/thermometry/realTimeInfo"
# URL để kéo ảnh 
PIC_URL = f"http://{CAMERA_IP}/ISAPI/Streaming/channels/1/picture" # Kênh 1 thường là quang, có thể đổi sang 2 nếu dùng ảnh nhiệt

ALARM_THRESHOLD = 30.0  # Ngưỡng kích hoạt trong Python
cooldown = 0  # Tránh spam ảnh liên tục

print("=== HỆ THỐNG RADAR CHỦ ĐỘNG (ISAPI POLLING) ===")
print(f"Ngưỡng báo động: {ALARM_THRESHOLD}°C (Cấu hình độc lập trong Python)")
print("Đang quét nhiệt độ liên tục mỗi 2 giây, ấn Ctrl+C để dừng...\n")

auth = HTTPDigestAuth(USER, PASSWORD)

while True:
    try:
        # 1. Kéo thông tin nhiệt độ liên tục
        response = requests.get(TEMP_URL, auth=auth, timeout=3)
        if response.status_code == 200:
            xml_data = response.text
            
            # Phân tích cú pháp thô (Hoặc dùng regex cho lẹ)
            if "<temperature>" in xml_data:
                # Tìm nhiệt độ (thường camera báo lại bằng chuỗi XML)
                # Dùng một đoạn tách chuỗi cơ bản:
                lines = xml_data.split('\n')
                current_temp = 0.0
                for line in lines:
                    if "<temperature>" in line:
                        val = line.split("<temperature>")[1].split("</temperature>")[0]
                        current_temp = float(val)
                        break
                        
                print(f"[*] Quét lúc {time.strftime('%H:%M:%S')} - Nhiệt độ max: {current_temp}°C", end="\r")
                
                # 2. Xử lý Logic Báo Động nội bộ
                if current_temp > ALARM_THRESHOLD and time.time() > cooldown:
                    print(f"\n[!!!] PHÁT HIỆN LỐ NGƯỠNG ({current_temp}°C > {ALARM_THRESHOLD}°C) - ĐANG KÉO ẢNH VỀ MAU!")
                    
                    # 3. Kéo ảnh về
                    pic_res = requests.get(PIC_URL, auth=auth, timeout=5)
                    if pic_res.status_code == 200:
                        timestamp = time.strftime("%Y%m%d_%H%M%S")
                        filename = f"Radar_Alert_{timestamp}_{current_temp}C.jpg"
                        filepath = os.path.join(ALERTS_DIR, filename)
                        with open(filepath, "wb") as f:
                            f.write(pic_res.content)
                        print(f"==> ĐÃ LƯU ẢNH THÀNH CÔNG: {filename}")
                        
                        # Cool down 10 giây để không bị spam quá tải ổ cứng
                        cooldown = time.time() + 10
                    else:
                        print(f"[!] Bóp cò kéo ảnh thất bại: {pic_res.status_code}")
                        
        else:
            print(f"\nLỗi lấy nhiệt độ: {response.status_code}")
            
    except Exception as e:
        print(f"\nLỗi Radar: {e}")
        
    time.sleep(2)
