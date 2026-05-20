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
                for pid_str, coords in points_local.items():
                    try:
                        pid = int(pid_str)
                    except ValueError:
                        continue
                    temp = live_temps.get(pid)
                    if coords and temp is not None:
                        mx = int(coords.get("tx", 0) * 640)
                        my = int(coords.get("ty", 0) * 512)
                        points_list.append({"id": f"ID_{pid}", "mx": mx, "my": my, "temperature": round(temp, 1)})
                
                if points_list:
                    now = time.time()
                    
                    # A. Gửi lên Dashboard (LUÔN GỬI - Đủ 10 điểm nếu có)
                    try:
                        requests.post("http://localhost:5056/api/v1/measurements/ingest", json=[{
                            "DeviceId": "4408b334-b69e-4210-9d70-739762b6f9ea",
                            "PointId": p["id"].replace("ID_", "P"),
                            "Value": p["temperature"],
                            "Unit": "°C"
                        } for p in points_list], timeout=2)
                    except: pass

                    # B. Gửi sang Jetson AI & Đối tác (CHỈ 6 ĐIỂM - 5 PHÚT 1 LẦN)
                    if now - last_ai_send >= 300: 
                        last_ai_send = now
                        # Lọc lấy tối đa 6 điểm cho AI
                        ai_points = [p for p in points_list if int(p["id"].split("_")[1]) <= 6]
                        ai_payload = {
                            "device_id": self.camera_ip, 
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), 
                            "points": ai_points
                        }
                        
                        self.debug_log(f"=== [AI SYSTEM] Gửi 6 điểm sang AI: {[p['id'] for p in ai_points]} ===")
                        try:
                            requests.post("http://localhost:8089/api/prediction", json={"prediction": ai_payload}, timeout=5)
                            session.post(EXTERNAL_API_URL, json=ai_payload, timeout=30, verify=False)
                            if fetcher:
                                threading.Timer(30, fetcher.fetch_once).start()
                        except Exception as e:
                            self.debug_log(f"[AI SEND ERROR] {e}")

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
