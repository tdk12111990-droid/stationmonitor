import requests
import xml.dom.minidom
from requests.auth import HTTPDigestAuth

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# URL lấy quy tắc nhiệt độ của Kênh 2 (Thermal)
URL = f"http://{CAMERA_IP}/ISAPI/Thermal/channels/2/thermometry/rules"

import sys
sys.stdout.reconfigure(encoding='utf-8')
print("--- ĐANG ĐỌC QUY TẮC NHIỆT ĐỘ CỦA CAMERA BẰNG ISAPI ---")
try:
    response = requests.get(URL, auth=HTTPDigestAuth(USER, PASSWORD))
    if response.status_code == 200:
        xml_str = xml.dom.minidom.parseString(response.text).toprettyxml()
        print(xml_str)
    else:
        print(f"Lỗi: {response.status_code}")
except Exception as e:
    print(f"Lỗi: {e}")
