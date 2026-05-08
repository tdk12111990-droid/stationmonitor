import requests
import json
import time
import os
import threading

# Cấu hình API Jetson (Đối tác)
EXTERNAL_API_URL = os.getenv("EXTERNAL_API_URL", "http://192.168.10.11:8080/api/thermal-data")

class ExternalApiPusher:
    def __init__(self, camera_ip, debug_logger=None):
        self.camera_ip = camera_ip
        self.debug_log = debug_logger if debug_logger else print
        self._stop_event = threading.Event()

    def start(self, live_temps, fetcher=None):
        self.debug_log("[EXTERNAL_API] Pusher started. Target: " + EXTERNAL_API_URL)
        session = requests.Session()
        
        while not self._stop_event.is_set():
            try:
                # 1. Load tọa độ từ file points_local.json
                points_local = {}
                try:
                    current_dir = os.path.dirname(os.path.abspath(__file__))
                    with open(os.path.join(current_dir, "points_local.json"), "r") as f:
                        points_local = json.load(f)
                except: pass
                
                # 2. Thu thập đủ 6 điểm đầu tiên
                points_list = []
                for i in range(1, 7):
                    coords = points_local.get(str(i))
                    temp = live_temps.get(i) 
                    
                    if coords and temp is not None:
                        # Tính toán mx, my từ tx, ty (tương đối -> pixel 640x512)
                        mx = int(coords.get("tx", 0) * 640)
                        my = int(coords.get("ty", 0) * 512)
                        
                        points_list.append({
                            "id": f"ID_{i}",
                            "mx": mx,
                            "my": my,
                            "temperature": round(temp, 1)
                        })
                
                # 3. Gửi đi nếu có dữ liệu
                if points_list:
                    payload = {
                        "device_id": self.camera_ip,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "points": points_list
                    }
                    
                    self.debug_log(f"\n=== CHUẨN BỊ GỬI DỮ LIỆU ===\n{json.dumps(payload, indent=2)}")
                    
                    try:
                        # 1. Gửi sang Jetson để lấy dự báo
                        res = session.post(EXTERNAL_API_URL, json=payload, timeout=30, verify=False)
                        
                        # 2. Gửi một bản copy về Local API để ghi vào CSV hiện lên Web
                        try:
                            requests.post("http://localhost:8080/api/prediction", json=payload, timeout=5)
                        except: pass
                        
                        if res.status_code == 200:
                            self.debug_log(f"=== GỬI THÀNH CÔNG LÚC {payload['timestamp']} ===\nSTATUS: 200")
                            
                            # QUY TRÌNH MỚI: Gửi xong -> Đợi 30s -> Lấy về ngay
                            if fetcher:
                                self.debug_log(f"--- Đợi 30 giây để Jetson xử lý... ---")
                                time.sleep(30)
                                fetcher.fetch_once()
                        else:
                            self.debug_log(f"=== GỬI THẤT BẠI ===\nSTATUS: {res.status_code}")
                    except Exception as e:
                        self.debug_log(f"❌ LỖI KẾT NỐI: {e}")
                else:
                    self.debug_log(f"--- [EXTERNAL_API] Bỏ qua mẻ gửi này vì LIVE_TEMPS đang rỗng (Đang đợi Camera gửi nhiệt độ...) ---")
                        
            except Exception as e:
                self.debug_log(f"[EXTERNAL_API] Error: {e}")
            
            # Nếu stop_event được set (dùng cho test), thoát vòng lặp ngay
            if self._stop_event.is_set(): break
            
            # LOGIC NGỦ THÔNG MINH:
            if points_list:
                # Nếu vừa gửi xong một mẻ, ngủ 5 phút
                self.debug_log(f"--- Đã xong chu kỳ. Nghỉ 5 phút... ---")
                time.sleep(300)
            else:
                # Nếu chưa có dữ liệu, chỉ đợi 5 giây rồi thử lại ngay
                time.sleep(5)
