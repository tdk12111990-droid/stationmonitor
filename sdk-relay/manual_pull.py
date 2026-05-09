import requests
import json
import time

URL = "http://192.168.10.11:8080/api/prediction"
BACKEND_URL = "http://localhost:5056/api/v1/measurements/ingest"
DEVICE_GUID = "4408b334-b69e-4210-9d70-739762b6f9ea"

def manual_pull():
    print(f"[*] Đang thực hiện PULL dữ liệu từ: {URL}")
    try:
        res = requests.get(URL, timeout=10)
        if res.status_code == 200:
            data = res.json()
            print("[+] Đã lấy được dữ liệu dự báo!")
            print(json.dumps(data, indent=2))
            
            prediction = data.get("prediction", {})
            if prediction:
                ingest_payload = []
                for i in range(1, 7):
                    pid = f"P{i}"
                    val = prediction.get(f"ID_{i}_pred")
                    if val is not None:
                        ingest_payload.append({
                            "DeviceId": DEVICE_GUID,
                            "PointId": pid,
                            "Value": 0,
                            "PredictedValue": val,
                            "Unit": "°C"
                        })
                
                if ingest_payload:
                    print(f"[*] Đang PUSH {len(ingest_payload)} điểm dự báo lên Dashboard...")
                    resp = requests.post(BACKEND_URL, json=ingest_payload, timeout=5)
                    print(f"[+] Kết quả đẩy lên Dashboard: {resp.status_code}")
                else:
                    print("[-] Không tìm thấy dữ liệu ID_1_pred...ID_6_pred trong kết quả.")
        else:
            print(f"[-] Lỗi API: {res.status_code}")
    except Exception as e:
        print(f"[!] Lỗi kết nối: {e}")

if __name__ == "__main__":
    manual_pull()
