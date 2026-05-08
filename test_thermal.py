import requests
from requests.auth import HTTPDigestAuth
import struct
import numpy as np

camera_ip = "192.168.10.152"
user = "admin"
password = "Demo@2024"

print("Fetching...")
session = requests.Session()
auth = HTTPDigestAuth(user, password)
url = f"http://{camera_ip}/ISAPI/Thermal/channels/2/thermometry/jpegPicWithAppendData?format=json"

try:
    r = session.get(url, auth=auth, timeout=10)
    print("Status:", r.status_code)
    if r.status_code == 200:
        parts = r.content.split(b'--boundary')
        print(f"Got {len(parts)} parts")
        for i, part in enumerate(parts):
            print(f"Part {i} length: {len(part)}")
            if b'application/octet-stream' in part or len(part) > 100000:
                data_start = part.find(b'\r\n\r\n')
                if data_start >= 0:
                    bin_data = part[data_start+4:]
                    print(f"Found binary data, length: {len(bin_data)}")
                    floats = struct.unpack(f'{len(bin_data)//4}f', bin_data[:len(bin_data)//4*4])
                    arr = np.array(floats)
                    valid = arr[(arr > -50) & (arr < 2000)]
                    print(f"Total floats: {len(arr)}")
                    print(f"Valid floats (-50 to 2000): {len(valid)}")
                    if len(valid) > 0:
                        print(f"Valid min: {valid.min()}, max: {valid.max()}")
                    
                    for w, h in [(160,120), (256,192), (384,288), (640,512)]:
                        if w*h <= len(arr):
                            sub = arr[:w*h]
                            vsub = sub[(sub > -50) & (sub < 2000)]
                            print(f"If {w}x{h} ({w*h}): valid={len(vsub)}")
except Exception as e:
    print("Error:", e)
