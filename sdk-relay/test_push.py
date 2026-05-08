import requests
import json
import time

EXTERNAL_API_URL = "http://192.168.10.11:9000/api/thermal-data"
points = []
for i in range(1, 7):
    points.append({
        "id": f"ID_{i}",
        "mx": 100,
        "my": 100,
        "temperature": 36.5
    })

payload = {
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    "camera_ip": "192.168.10.152",
    "total": 6,
    "points": points
}

print(f"Testing push to {EXTERNAL_API_URL} with 6 points...")
try:
    res = requests.post(EXTERNAL_API_URL, json=payload, timeout=15)
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.text}")
except Exception as e:
    print(f"Error: {e}")
