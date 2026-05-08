import threading
import time
import requests
import json
import os
import csv

# Cấu hình API Jetson (Đối tác)
EXTERNAL_PRED_API_URL = os.getenv("EXTERNAL_PRED_API_URL", "http://192.168.10.11:8080/api/prediction")
API_BASE_URL = os.getenv("API_URL", "http://localhost:5056/api/v1")
# Chuyển hướng đẩy dữ liệu qua cổng 8080 để khớp với Frontend
BACKEND_INGEST_URL = os.getenv("BACKEND_INGEST_URL", "http://localhost:8080/api/prediction")
DEVICE_GUID = "b5e3622c-eae8-4e96-8ef9-6bfb55bc8d3d"
RULES_API_URL = f"{API_BASE_URL}/rules"
EVENTS_API_URL = f"{API_BASE_URL}/events"

class PredictionFetcher:
    def __init__(self, device_id, debug_logger=None):
        self.device_id = device_id
        self.debug_log = debug_logger if debug_logger else print
        self._stop_event = threading.Event()
        self.last_results = {}
        self.alarm_rules = {} 
        self.live_temps = {} 
        self.predicted_temps = {} # Thêm mới
        
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

    def fetch_once(self):
        """Thực hiện 1 lần lấy dữ liệu dự báo duy nhất"""
        with requests.Session() as session:
            # 1. Đồng bộ ngưỡng báo động trước
            self._sync_rules(session)
            
            try:
                # Gọi sang Jetson lấy kết quả
                res = session.get(EXTERNAL_PRED_API_URL, timeout=30)
                if res.status_code == 200:
                    data = res.json()
                    prediction = data.get("prediction", {})
                    ts = time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    if prediction:
                        # In toàn bộ JSON ra log
                        self.debug_log(f"=== [AI SYSTEM] Đã nhận dự báo lúc {ts} ===\n{json.dumps(data, indent=2)}")
                        ingest_payload = []
                        for i in range(1, 7):
                            pid = f"P{i}" # Đổi từ ID:{i} sang P{i} để khớp với Web
                            val = prediction.get(f"ID_{i}_pred")
                            if val is not None:
                                self.predicted_temps[i] = val # Lưu vào bộ nhớ chung để vẽ
                                # 2. Kiểm tra cảnh báo sớm
                                status = self._check_and_alert(session, pid, val)
                                # 3. Lưu vào CSV
                                self._save_to_csv(ts, pid, val, status)
                                # 4. Đẩy vào hệ thống (Kèm cả giá trị thực tế nếu có)
                                real_val = self.live_temps.get(i, 0)
                                ingest_payload.append({
                                    "DeviceId": self.device_id or "camera_152_thermal",
                                    "PointId": pid,
                                    "Value": real_val,
                                    "PredictedValue": val,
                                    "Unit": "°C"
                                })
                        
                        # 1. Gửi TOÀN BỘ dữ liệu thô sang cổng 8080 (Dành cho giao diện Web)
                        try:
                            resp8080 = session.post("http://localhost:8080/api/prediction", json=data, timeout=5)
                            self.debug_log(f"=== [AI SYSTEM] Đã đẩy sang 8080: {resp8080.status_code} ===")
                        except: pass

                        # 2. Gửi dữ liệu chuẩn hóa sang Backend chính 5056 (Dành cho cơ sở dữ liệu)
                        if ingest_payload:
                            real_guid = "b5e3622c-eae8-4e96-8ef9-6bfb55bc8d3d"
                            for item in ingest_payload: item["DeviceId"] = real_guid
                            try:
                                resp5056 = session.post("http://localhost:5056/api/v1/measurements/ingest", json=ingest_payload, timeout=5)
                                self.debug_log(f"=== [AI SYSTEM] Đã đẩy sang 5056: {resp5056.status_code} ===")
                            except: pass
                            
            except Exception as e:
                self.debug_log(f"[PRED_FETCHER] Error: {e}")

            # Đợi 5 phút (300 giây) để Jetson có đủ thời gian xử lý
            time.sleep(300)
