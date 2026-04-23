import threading
import time
import requests
import json
import os

# Link API của đối tác
EXTERNAL_API_URL = os.getenv("EXTERNAL_THERMAL_API_URL", "http://100.117.86.96:9000/api/thermal-data")

class ExternalApiPusher:
    def __init__(self, camera_ip, debug_logger=None):
        self.camera_ip = camera_ip
        self.running = False
        self.debug_log = debug_logger if debug_logger else print

    def start(self, live_temps_ref, _unused=None):
        """Khởi động luồng gửi dữ liệu ngầm"""
        self.running = True
        # Đọc tọa độ trực tiếp từ file để luôn lấy bản mới nhất
        threading.Thread(
            target=self._push_loop, 
            args=(live_temps_ref,), 
            daemon=True
        ).start()
        self.debug_log(f"[EXTERNAL_API] Pusher started. Target: {EXTERNAL_API_URL}")

    def _push_loop(self, live_temps):
        session = requests.Session()
        # Xác định đường dẫn file tọa độ (points_local.json nằm cùng thư mục)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        points_file = os.path.join(current_dir, "points_local.json")

        while self.running:
            try:
                # 1. Đọc tọa độ mới nhất từ file
                point_coords = {}
                if os.path.exists(points_file):
                    try:
                        with open(points_file, "r", encoding="utf-8") as f:
                            point_coords = json.load(f)
                    except: pass

                # 2. Chuẩn bị đúng 6 điểm nhiệt độ (ID:1 -> ID:6)
                points_list = []
                for i in range(1, 7):
                    rid = str(i)
                    coords = point_coords.get(rid)
                    temp = live_temps.get(i) # Lấy nhiệt độ từ bộ nhớ đệm
                    
                    if coords and temp is not None:
                        # Convert tọa độ sang pixel 384x288
                        mx = int(coords.get("tx", 0) * 384)
                        my = int(coords.get("ty", 0) * 288)
                        
                        points_list.append({
                            "id": f"ID:{rid}",
                            "mx": mx,
                            "my": my,
                            "temperature": round(temp, 1)
                        })
                
                # 3. Gửi đi nếu có dữ liệu
                if points_list:
                    payload = {
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "camera_ip": self.camera_ip,
                        "total": len(points_list),
                        "points": points_list
                    }
                    
                    # In log theo đúng định dạng bạn yêu cầu
                    self.debug_log(f"\n=== CHUẨN BỊ GỬI DỮ LIỆU ===\n{json.dumps(payload, indent=2)}")
                    
                    try:
                        res = session.post(EXTERNAL_API_URL, json=payload, timeout=5)
                        if res.status_code == 200:
                            self.debug_log(f"=== GỬI THÀNH CÔNG LÚC {payload['timestamp']} ===\nPOST {EXTERNAL_API_URL}\nSTATUS: 200")
                        else:
                            self.debug_log(f"=== GỬI THẤT BẠI ===\nSTATUS: {res.status_code}")
                    except Exception as e:
                        self.debug_log(f"❌ LỖI KẾT NỐI: {e}")
                        
            except Exception as e:
                self.debug_log(f"[EXTERNAL_API] Error: {e}")
            
            # Gửi dữ liệu mỗi 5 phút một lần (300 giây) theo yêu cầu mới nhất
            time.sleep(300)

# --- KHỐI LỆNH ĐỂ BẠN CHẠY TRỰC TIẾP BẰNG LỆNH PYTHON3 ---
if __name__ == "__main__":
    print("\n\033[94m🚀 ĐANG CHẠY BỘ ĐẨY DỮ LIỆU (CHẾ ĐỘ TEST TRỰC TIẾP)\033[0m")
    print("Yêu cầu: Lấy 6 điểm nhiệt độ thật và gửi sang đối tác 5 phút/lần.")
    
    # Giả lập dữ liệu nhiệt độ cho 10 điểm (để test khả năng lọc lấy 6 điểm)
    mock_temps = {i: 42.0 + (i * 0.5) for i in range(1, 11)}
    
    # Khởi tạo và chạy
    pusher = ExternalApiPusher("192.168.10.152")
    pusher.start(mock_temps)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đã dừng.")
