from flask import Flask, jsonify, request, make_response
import csv
import os
import requests
import time

app = Flask(__name__)

# Đổi tên file CSV để tránh xung đột với tiến trình cũ đang bị treo
# Dùng đường dẫn tuyệt đối để đảm bảo tìm đúng file dù chạy ở đâu
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(CURRENT_DIR, "ai_history_v2.csv")
INTERNAL_INGEST_URL = "http://localhost:5056/api/v1/measurements/ingest"
DEVICE_GUID = "b5e3622c-eae8-4e96-8ef9-6bfb55bc8d3d"

def save_to_csv(timestamp, point_id, pred_val, status="OK"):
    try:
        # Ghi vào file v2
        file_exists = os.path.isfile(CSV_FILE)
        with open(CSV_FILE, 'a', newline='') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(['Timestamp', 'PointId', 'PredictedValue', 'Status'])
            writer.writerow([timestamp, point_id, pred_val, status])
    except: pass

@app.route('/api/prediction', methods=['POST', 'GET'])
def receive_prediction():
    prediction = {}
    if request.method == 'POST':
        data = request.json or {}
        prediction = data.get("prediction", {})
    elif request.method == 'GET':
        # Lấy dữ liệu từ tham số trên URL (?ID_1_pred=38.5&...)
        prediction = request.args.to_dict()
        # Dự phòng trường hợp họ gửi body JSON bằng GET
        if not prediction and request.is_json:
            data = request.json or {}
            prediction = data.get("prediction", {})
            
    if not prediction:
        return jsonify({"success": False, "message": "No data found"}), 400
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    
    if prediction:
        ingest_payload = []
        for i in range(1, 7):
            pid = f"P{i}"
            val = prediction.get(f"ID_{i}_pred")
            if val is not None:
                save_to_csv(ts, pid, val, "OK")
                ingest_payload.append({
                    "DeviceId": DEVICE_GUID, "PointId": pid,
                    "Value": 0, "PredictedValue": val, "Unit": "°C"
                })
        
        if ingest_payload:
            try: requests.post(INTERNAL_INGEST_URL, json=ingest_payload, timeout=5)
            except: pass
        return jsonify({"success": True}), 200
    return jsonify({"success": False}), 400

@app.route('/api/ai-predictions', methods=['GET'])
def get_predictions():
    if not os.path.exists(CSV_FILE): return jsonify([])
    try:
        with open(CSV_FILE, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)[-100:]
            response = make_response(jsonify(rows))
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response
    except: return jsonify([])

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080)
