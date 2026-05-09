import requests
from requests.auth import HTTPDigestAuth, HTTPBasicAuth

IP = "192.168.10.153"
USER = "admin"
PASS = "Demo@2024"

endpoints = [
    "/ISAPI/System/deviceInfo",
    "/ISAPI/Event/notification/alertStream"
]

print(f"--- KIỂM TRA TOÀN DIỆN CAMERA {IP} ---")
for ep in endpoints:
    url = f"http://{IP}{ep}"
    print(f"\nEndpoint: {ep}")
    
    # Thử Digest
    try:
        r = requests.get(url, auth=HTTPDigestAuth(USER, PASS), timeout=5)
        print(f"  - Digest Auth: {r.status_code}")
    except Exception as e:
        print(f"  - Digest Error: {e}")
        
    # Thử Basic
    try:
        r = requests.get(url, auth=HTTPBasicAuth(USER, PASS), timeout=5)
        print(f"  - Basic Auth: {r.status_code}")
    except Exception as e:
        print(f"  - Basic Error: {e}")
