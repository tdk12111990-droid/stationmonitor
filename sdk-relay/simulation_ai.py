import requests
import json
import time

# Cấu hình
JETSON_URL_PUSH = "http://192.168.10.11:8080/api/thermal-data"
JETSON_URL_PULL = "http://192.168.10.11:8080/api/prediction"

def simulate_cycle():
    print("\n🚀 --- BẮT ĐẦU GIẢ LẬP QUY TRÌNH AI ---")
    
    # 1. Gửi dữ liệu (Push)
    payload = {
        "device_id": "192.168.10.152",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "points": [
            {"id": "ID_1", "mx": 252, "my": 70, "temperature": 48.5},
            {"id": "ID_2", "mx": 289, "my": 44, "temperature": 42.1},
            {"id": "ID_3", "mx": 321, "my": 42, "temperature": 43.8},
            {"id": "ID_4", "mx": 338, "my": 70, "temperature": 41.5},
            {"id": "ID_5", "mx": 295, "my": 69, "temperature": 39.2},
            {"id": "ID_6", "mx": 95, "my": 87, "temperature": 40.0}
        ]
    }
    
    print(f"📡 1. Đang gửi 6 điểm nhiệt độ sang Jetson...")
    try:
        res = requests.post(JETSON_URL_PUSH, json=payload, timeout=30)
        print(f"✅ Gửi thành công! Status: {res.status_code}")
    except Exception as e:
        print(f"❌ Lỗi khi gửi: {e}")
        return

    # 2. Đợi Jetson xử lý (Wait)
    print(f"⏳ 2. Đang đợi 30 giây để Jetson xử lý dữ liệu...")
    time.sleep(30)

    # 3. Lấy dữ liệu dự báo (Pull)
    print(f"📥 3. Đang gọi sang Jetson để lấy kết quả dự báo...")
    try:
        res = requests.get(JETSON_URL_PULL, timeout=30)
        if res.status_code == 200:
            print(f"✅ ĐÃ NHẬN DỰ BÁO THÀNH CÔNG!")
            print(json.dumps(res.json(), indent=2))
        else:
            print(f"❌ Jetson báo lỗi: {res.status_code}")
    except Exception as e:
        print(f"❌ Lỗi khi lấy dự báo: {e}")

    print("\n✨ --- KẾT THÚC GIẢ LẬP ---")

if __name__ == "__main__":
    simulate_cycle()
