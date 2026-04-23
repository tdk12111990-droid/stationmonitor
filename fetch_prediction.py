import requests
import time
import json

# Địa chỉ API của đối tác (Họ đang mở cổng 7000 để mình vào lấy)
API_URL = "http://100.117.86.96:9000/api/latest-prediction"

print(f"🔄 ĐANG KHỞI ĐỘNG BỘ KÉO DỮ LIỆU TỪ ĐỐI TÁC...")
print(f"Mục tiêu: {API_URL}")
print("Tần suất: Sang nhà đối tác gõ cửa lấy dữ liệu mỗi 5 giây/lần\n")

while True:
    try:
        # Đối tác vừa báo lại: Dùng GET để chỉ lấy kết quả MỚI NHẤT và sạch sẽ nhất
        res = requests.get(API_URL, timeout=5)
        
        if res.status_code == 200:
            try:
                data = res.json()
                print("\n\033[96m🔥 === [THÀNH CÔNG] ĐÃ LẤY ĐƯỢC KẾT QUẢ PHÂN TÍCH VỀ === 🔥\033[0m")
                print(json.dumps(data, indent=2, ensure_ascii=False))
                print("\033[96m========================================================\033[0m")
            except Exception as e:
                print(f"[{time.strftime('%H:%M:%S')}] Đã lấy được dữ liệu nhưng đối tác không gửi chuẩn JSON: {res.text[:100]}")
        else:
            print(f"[{time.strftime('%H:%M:%S')}] Lấy thất bại! Server đối tác báo lỗi mã: {res.status_code} (Có thể đường link sai hoặc họ yêu cầu POST)")
            
    except requests.exceptions.ConnectionError:
        print(f"[{time.strftime('%H:%M:%S')}] ❌ LỖI KẾT NỐI: Không gõ cửa được nhà đối tác ở cổng 7000! Có thể họ chưa bật API hoặc bị chặn tường lửa.")
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] LỖI: {e}")
        
    time.sleep(5)
