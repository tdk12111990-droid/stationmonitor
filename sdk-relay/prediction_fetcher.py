import threading
import time
import requests
import json
import os
import csv

# Cấu hình API
EXTERNAL_PRED_API_URL = os.getenv("EXTERNAL_PRED_API_URL", "http://100.117.86.96:9000/api/send-latest-prediction")
API_BASE_URL = os.getenv("API_URL", "http://stationmonitor-backend:8080/api/v1")
INTERNAL_INGEST_URL = f"{API_BASE_URL}/measurements/ingest"
RULES_API_URL = f"{API_BASE_URL}/rules"
EVENTS_API_URL = f"{API_BASE_URL}/events"

class PredictionFetcher:
    def __init__(self, device_id, debug_logger=None):
        self.device_id = device_id
        self.debug_log = debug_logger if debug_logger else print
        self._stop_event = threading.Event()
        self.last_results = {}
        self.alarm_rules = {} # Lưu các ngưỡng báo động để so khớp
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.csv_file = os.path.join(current_dir, "ai_history.csv")
        self._init_csv()

    def _init_csv(self):
        if not os.path.exists(self.csv_file):
            with open(self.csv_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Timestamp', 'PointId', 'PredictedValue', 'Status'])

    def _save_to_csv(self, timestamp, point_id, pred_val, status="OK"):
        try:
            with open(self.csv_file, 'a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([timestamp, point_id, pred_val, status])
        except: pass

    def _sync_rules(self, session):
        """Lấy các ngưỡng báo động từ Backend"""
        try:
            resp = session.get(RULES_API_URL, timeout=5)
            if resp.status_code == 200:
                rules_data = resp.json()
                new_rules = {}
                for r in rules_data:
                    cond_str = r.get('condition', '{}')
                    cond = json.loads(cond_str) if isinstance(cond_str, str) else cond_str
                    point = cond.get('point', '')
                    if 'ID:' in point:
                        pid = point.split('ID:')[1].split(')')[0].strip()
                        new_rules[f"ID:{pid}"] = cond.get('alarm')
                self.alarm_rules = new_rules
        except: pass

    def _check_and_alert(self, session, pid, pred_val):
        """Kiểm tra và bắn cảnh báo nếu vượt ngưỡng"""
        threshold = self.alarm_rules.get(pid)
        if threshold and pred_val >= threshold:
            self.debug_log(f"⚠️ [AI EARLY WARNING] {pid} sắp vượt ngưỡng ({pred_val}C >= {threshold}C)")
            try:
                event_payload = {
                    "DeviceId": self.device_id or "camera_152_thermal",
                    "PointId": pid,
                    "Type": "AI_PREDICTION_WARNING",
                    "Source": "ai_prediction",
                    "Value": pred_val,
                    "Message": f"AI DỰ ĐOÁN: Điểm {pid} sắp vượt ngưỡng {threshold}°C"
                }
                session.post(EVENTS_API_URL, json=event_payload, timeout=2)
                return "WARNING"
            except: pass
        return "OK"

    def start(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        self.debug_log(f"[PRED_FETCHER] AI Monitor started. Alerts enabled.")

    def stop(self):
        self._stop_event.set()

    def _run(self):
        session = requests.Session()
        while not self._stop_event.is_set():
            # 1. Đồng bộ Rule trước khi kiểm tra
            self._sync_rules(session)
            
            try:
                res = session.get(EXTERNAL_PRED_API_URL, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    prediction = data.get("prediction", {})
                    ts = time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    if prediction:
                        ingest_payload = []
                        for i in range(1, 7):
                            pid = f"ID:{i}"
                            val = prediction.get(f"ID_{i}_pred")
                            if val is not None:
                                # 2. Kiểm tra cảnh báo sớm
                                status = self._check_and_alert(session, pid, val)
                                
                                # 3. Lưu vào CSV
                                self._save_to_csv(ts, pid, val, status)
                                
                                # 4. Đẩy vào hệ thống
                                ingest_payload.append({
                                    "DeviceId": self.device_id or "camera_152_thermal",
                                    "PointId": pid,
                                    "Value": 0,
                                    "PredictedValue": val,
                                    "Unit": "°C"
                                })
                        
                        if ingest_payload:
                            session.post(INTERNAL_INGEST_URL, json=ingest_payload, timeout=5)
                            self.debug_log(f"=== [AI SYSTEM] Đã cập nhật dữ liệu và kiểm tra an toàn lúc {ts} ===")
            except Exception as e:
                self.debug_log(f"[PRED_FETCHER] Error: {e}")

            # Đợi 5 phút (300 giây) theo yêu cầu mới nhất
            time.sleep(300)
