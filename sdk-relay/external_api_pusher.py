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

    def start(self, live_temps, fetcher=None, live_pd_ref=None):
        self.debug_log("[EXTERNAL_API] Pusher started. Target: " + EXTERNAL_API_URL)
        session = requests.Session()
        
        last_ai_send = 0
        while not self._stop_event.is_set():
            try:
                # --- PHẦN 1: CHUẨN BỊ DỮ LIỆU ---
                points_local = {}
                try:
                    current_dir = os.path.dirname(os.path.abspath(__file__))
                    with open(os.path.join(current_dir, "points_local.json"), "r") as f:
                        points_local = json.load(f)
                except: pass
                
                points_list = []
                for i in range(1, 7):
                    coords = points_local.get(str(i))
                    temp = live_temps.get(i) 
                    if coords and temp is not None:
                        mx = int(coords.get("tx", 0) * 640)
                        my = int(coords.get("ty", 0) * 512)
                        points_list.append({"id": f"ID_{i}", "mx": mx, "my": my, "temperature": round(temp, 1)})
                
                if points_list:
                    now = time.time()
                    payload = {"device_id": self.camera_ip, "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "points": points_list}
                    
                    # A. Gửi lên Dashboard (LUÔN GỬI - 2 giây/lần để xem Real-time)
                    try:
                        # Gửi về Backend local (cổng 5056)
                        requests.post("http://localhost:5056/api/v1/measurements/ingest", json=[{
                            "DeviceId": "4408b334-b69e-4210-9d70-739762b6f9ea",
                            "PointId": p["id"].replace("ID_", "P"),
                            "Value": p["temperature"],
                            "Unit": "°C"
                        } for p in points_list], timeout=2)
                    except: pass

                    # B. Gửi sang Jetson AI & Đối tác (CHỈ GỬI 5 PHÚT 1 LẦN)
                    if now - last_ai_send >= 300: # 300 giây = 5 phút
                        last_ai_send = now # Cập nhật ngay lập tức để tránh gửi lặp khi lỗi
                        self.debug_log(f"=== [AI SYSTEM] Đang gửi dữ liệu Nhiệt độ sang AI: {list(payload.values())} ===")
                        try:
                            # Gửi sang AI local (cổng 8089)
                            requests.post("http://localhost:8089/api/prediction", json={"prediction": payload}, timeout=5)
                            # Gửi sang AI đối tác (192.168.10.11:8080)
                            session.post(EXTERNAL_API_URL, json=payload, timeout=30, verify=False)
                            
                            # Sau khi gửi xong, gọi fetcher để lấy kết quả ngay (nếu có)
                            if fetcher:
                                threading.Timer(30, fetcher.fetch_once).start()
                        except Exception as e:
                            self.debug_log(f"[AI SEND ERROR] {e} - Sẽ thử lại sau 5 phút.")

                # --- PHẦN 2: DỮ LIỆU PHÓNG ĐIỆN & ÂM THANH ---
                if live_pd_ref:
                    pd_data = live_pd_ref() # Trả về {pd, frequency, sound_db}
                    if pd_data.get("pd") is not None or pd_data.get("frequency") is not None:
                        ts = time.strftime("%Y-%m-%d %H:%M:%S")
                        pd_payload = {
                            "Id": "PD_SENSOR",
                            "pd_val": round(pd_data.get("pd", 0.0), 1),
                            "frequency": round(pd_data.get("frequency", 0.0), 0),
                            "audioDecibel": round(pd_data.get("sound_db", 0.0), 1),
                            "Status": "OK",
                            "ForecastTime": ts
                        }
                        try:
                            # Gửi sang AI local (cổng 8089) để hiển thị ở tab Phân tích AI
                            requests.post("http://localhost:8089/api/pd-prediction", json=pd_payload, timeout=2)
                        except: pass

            except Exception as e:
                self.debug_log(f"[EXTERNAL_API] Error: {e}")
            
            if self._stop_event.is_set(): break
            time.sleep(2) # Lặp lại mỗi 2 giây
        
        self.debug_log("[EXTERNAL_API] Pusher stopped.")
