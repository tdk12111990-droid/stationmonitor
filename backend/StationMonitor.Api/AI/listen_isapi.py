import requests
import time
from requests.auth import HTTPDigestAuth

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# Đường dẫn URL chính thức mà Web UI dùng để chờ báo động
URL = f"http://{CAMERA_IP}/ISAPI/Event/notification/alertStream"

def listen_isapi_alarms():
    print(f"--- ĐANG LẮNG NGHE BÁO ĐỘNG BẰNG GIAO THỨC CỦA WEB (ISAPI) ---")
    print(f"Cắm cọc tại: {URL}")
    print("=> Chờ bạn chạy file trigger_test.py hoặc nhiệt độ thực tế thay đổi...")

    try:
        # Sử dụng stream=True để cắm luôn luồng kết nối không bao giờ ngắt
        response = requests.get(
            URL, 
            auth=HTTPDigestAuth(USER, PASSWORD), 
            stream=True, 
            timeout=86400 # Chờ cả ngày
        )
        
        if response.status_code == 200:
            print("[OK] Đã nối đường ống thành công! Đang chờ sự kiện...\n")
            
            # Đọc liên tục các dòng do Camera ném về
            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8', errors='ignore')
                    print(f"[RECV] {decoded_line}")
                        
        else:
            print(f"[!] Lỗi kết nối: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"Lỗi mạng: {e}")
        print("Đang thử kết nối lại sau 3 giây...")
        time.sleep(3)

if __name__ == "__main__":
    # Vòng lặp vĩnh cửu không bao giờ tắt
    while True:
        listen_isapi_alarms()
