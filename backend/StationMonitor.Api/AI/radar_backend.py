import os
import sys
import ctypes
import time
import requests
import re
import xml.etree.ElementTree as ET
from urllib.parse import urljoin

TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback
import core.hcnet_sdk as core_sdk

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

sys.stdout.reconfigure(encoding='utf-8')

API_BASE_URL = "http://localhost:5056"
RULES_ENDPOINT = f"{API_BASE_URL}/api/v1/rules"
WEBHOOK_ENDPOINT = f"{API_BASE_URL}/api/v1/camera-webhook"

class NET_DVR_JPEGPARA(ctypes.Structure):
    _fields_ = [("wPicSize", ctypes.c_ushort), ("wPicQuality", ctypes.c_ushort)]

class HybridRadar:
    def __init__(self):
        self.sdk = HCNetSDK(TEST_SDK_DIR)
        self.user_id = -1
        self.handle = -1
        self.running = True
        
        self.rules = {}  # { rule_id_cam: threshold }
        self.cooldowns = {} # { rule_id_cam: timestamp }
        
        self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.restype = ctypes.c_bool
        self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.argtypes = [
            ctypes.c_long, ctypes.c_long, ctypes.POINTER(NET_DVR_JPEGPARA), ctypes.c_char_p]

        self._callback = RemoteConfigCallback(self._thermal_callback)

    def fetch_rules_from_backend(self):
        """Tải cấu hình Rules từ Web Backend liên tục mỗi 10s"""
        try:
            res = requests.get(RULES_ENDPOINT, timeout=2)
            if res.status_code == 200:
                backend_rules = res.json()
                new_rules = {}
                for r in backend_rules:
                    if r.get("enabled") and r.get("ruleSet"):
                        # Trích xuất 'nhiet_do_pha_1 > 30'
                        match = re.search(r'nhiet_do_pha_(\d+)\s*>\s*([0-9.]+)', r["ruleSet"])
                        if match:
                            point_id = int(match.group(1)) # 1 -> P1
                            threshold = float(match.group(2))
                            new_rules[point_id] = threshold
                
                # Nếu trên Web chưa cấu hình gì, Tự động ép cứng một luật test cho P1 > 30 độ
                if len(new_rules) == 0:
                    self.rules = {1: 30.0}
                    print("⚠️ Chưa có nội quy trên Web. ÉP CỨNG LUẬT TEST: P1 > 30.0°C")
                else:
                    self.rules = new_rules
                    print(f"🔄 Đã đồng bộ nội quy từ Web: {self.rules}")
        except Exception as e:
            # Nếu chưa bật Backend, vẫn chạy theo luật cứng 30 độ để test
            self.rules = {1: 30.0}
            print("⚠️ Server Web tắt hoặc lỗi mạng. ÉP CỨNG LUẬT TEST: P1 > 30.0°C")

    def _thermal_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        if dwType == 2: # DATA
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            rid = data.byRuleID
            current_temp = data.fMaxTemperature
            
            # Kiểm tra xem điểm này có trong số các điểm Web đang theo dõi?
            if rid in self.rules:
                threshold = self.rules[rid]
                
                # Logic bóp cò chụp ảnh
                cd = self.cooldowns.get(rid, 0)
                if current_temp > threshold and time.time() > cd:
                    print(f"\n[!!!] PHÁT HIỆN TỘI PHẠM (P{rid}): {current_temp}'C lố ngưỡng {threshold}'C của Web!")
                    print("=> Đang tiến hành chụp ảnh và nộp phạt (Gửi POST về Backend)...")
                    
                    img_bytes = self._capture_picture_bytes() # Chụp Optical HD
                    if img_bytes:
                        self._push_to_backend(rid, current_temp, img_bytes)
                    
                    self.cooldowns[rid] = time.time() + 15 # Cách nhau 15s

    def _capture_picture_bytes(self):
        jp = NET_DVR_JPEGPARA()
        jp.wPicSize = 0xff 
        jp.wPicQuality = 0 # Nét nhất
        temp_file = "temp_snap.jpg".encode('utf-8')
        
        res = self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture(self.user_id, 1, ctypes.byref(jp), temp_file)
        if res and os.path.exists("temp_snap.jpg"):
            with open("temp_snap.jpg", "rb") as f:
                data = f.read()
            return data
        return None

    def _push_to_backend(self, point_id, temp, img_bytes):
        xml_payload = f"""<EventNotificationAlert version="2.0">
            <ipAddress>{CAMERA_IP}</ipAddress>
            <channelID>2</channelID>
            <dateTime>{time.strftime("%Y-%m-%dT%H:%M:%S%z")}</dateTime>
            <eventType>thermometryAlarm</eventType>
            <eventDescription>Quá nhiệt độ tại P{point_id}. Ngưỡng nội quy Web: {self.rules.get(point_id)} - Thực tế: {temp}</eventDescription>
            <Thermometry>
                 <maxTemperature>{temp}</maxTemperature>
            </Thermometry>
        </EventNotificationAlert>"""
        
        files = {
            'xml': ('event.xml', xml_payload, 'application/xml'),
            'image': ('snapshot.jpg', img_bytes, 'image/jpeg')
        }
        try:
            requests.post(WEBHOOK_ENDPOINT, files=files, timeout=3)
            print("==> ✅ Đã báo cáo thành công về Web Dashboard!")
        except Exception as e:
            print(f"==> ❌ Đẩy về Web thất bại (Web Backend có thể đang tắt): {e}")

    def start(self):
        if not self.sdk.init(): return
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0: return

        # Load rule lần đầu
        self.fetch_rules_from_backend()

        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = 2 
        cond.wMode = 1     

        self.handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(self.user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), self._callback, None)

        print(f"=== ĐỘI TRƯỞNG RADAR (SOFTWARE RULE ENGINE) KIỂM SOÁT ===")
        print("Đang quét và đồng bộ với Web...")

        try:
            last_sync = time.time()
            while self.running:
                if time.time() - last_sync > 10:
                    self.fetch_rules_from_backend()
                    last_sync = time.time()
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.running = False
            if self.handle >= 0: self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.handle)
            self.sdk.logout(self.user_id)
            self.sdk.cleanup()

if __name__ == "__main__":
    radar = HybridRadar()
    radar.start()
