import os
import sys
import ctypes
import time
import threading

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import (
    HCNetSDK, 
    NET_DVR_THERMOMETRY_COND, 
    NET_DVR_THERMOMETRY_UPLOAD, 
    RemoteConfigCallback
)
import core.hcnet_sdk as core_sdk

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# Fix Unicode Encoding Windows
sys.stdout.reconfigure(encoding='utf-8')

# Thư mục lưu ảnh báo động
ALERTS_DIR = r"d:\StationMonitor\alerts"
if not os.path.exists(ALERTS_DIR):
    os.makedirs(ALERTS_DIR)

class NET_DVR_JPEGPARA(ctypes.Structure):
    _fields_ = [("wPicSize", ctypes.c_ushort), ("wPicQuality", ctypes.c_ushort)]

class RadarSDK:
    def __init__(self, threshold=30.0):
        self.sdk = HCNetSDK(TEST_SDK_DIR)
        self.user_id = -1
        self.handle = -1
        self.running = True
        self.threshold = threshold
        self.cooldown = 0
        
        # Khai báo hàm CaptureJPEGPicture
        self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.restype = ctypes.c_bool
        self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.argtypes = [
            ctypes.c_long, ctypes.c_long, ctypes.POINTER(NET_DVR_JPEGPARA), ctypes.c_char_p]

        # Giữ reference callback
        self._callback = RemoteConfigCallback(self._thermal_callback)

    def _thermal_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        if dwType == 2: # NET_SDK_CALLBACK_TYPE_DATA
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            rid = data.byRuleID
            current_temp = data.fMaxTemperature
            
            # Chỉ quan tâm P1 để làm minh họa
            if rid == 1:
                print(f"[*] Radar đo điểm P1: {current_temp}°C", end="\r")
                
                # Logic bóp cò chụp ảnh
                if current_temp > self.threshold and time.time() > self.cooldown:
                    print(f"\n[!!!] PHÁT HIỆN LỐ NGƯỠNG ({current_temp}'C > {self.threshold}'C) - CHỤP ẢNH NGAY!")
                    self._capture_picture(rid, current_temp)
                    # Chờ 10 giây mới chụp tiếp để tránh spam
                    self.cooldown = time.time() + 10

    def _capture_picture(self, rule_id, temp):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        
        jp = NET_DVR_JPEGPARA()
        jp.wPicSize = 0xff # Tự động giữ nguyên nén
        jp.wPicQuality = 0 # 0=Best (Đẹp nhất)
        
        # 1. Chụp Kênh 1 (Ống kính Quang học Siêu Nét)
        file_optical = f"Alert_P{rule_id}_{timestamp}_{temp}C_QUANG.jpg"
        path_optical = os.path.join(ALERTS_DIR, file_optical)
        res1 = self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture(self.user_id, 1, ctypes.byref(jp), path_optical.encode('utf-8'))
        
        # 2. Chụp Kênh 2 (Ống kính Nhiệt Độ Hồng Ngoại)
        file_thermal = f"Alert_P{rule_id}_{timestamp}_{temp}C_NHIET.jpg"
        path_thermal = os.path.join(ALERTS_DIR, file_thermal)
        res2 = self.sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture(self.user_id, 2, ctypes.byref(jp), path_thermal.encode('utf-8'))
        
        if res1 or res2:
            print(f"==> ĐÃ CHỤP KÉP: [Quang Nét: {file_optical}] & [Nhiệt Độ: {file_thermal}]\n")
        else:
            print(f"[!] Lỗi chụp tĩnh: {self.sdk.hcnetsdk.NET_DVR_GetLastError()}\n")

    def start(self):
        if not self.sdk.init(): return
        
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0: return

        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = 2 # Kênh nhiệt
        cond.wMode = 1     # Lấy theo quy tắc (Rules)

        self.handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
            self.user_id, 
            3629, # LỆNH KÉO NHIỆT ĐỘ THỜI GIAN THỰC (REALTIME PULL)
            ctypes.byref(cond), 
            ctypes.sizeof(cond), 
            self._callback, 
            None
        )

        if self.handle < 0:
            print(f"Lỗi khởi động Radar: {self.sdk.hcnetsdk.NET_DVR_GetLastError()}")
            return

        print(f"=== ĐÃ BẬT RADAR NHIỆT ĐỘ QUA SDK (REALTIME PULL) ===")
        print(f"Ngưỡng kích nổ Camera: {self.threshold}°C")
        print("Đang quét điểm P1...\n")

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.handle >= 0:
            self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.handle)
        self.sdk.logout(self.user_id)
        self.sdk.cleanup()

if __name__ == "__main__":
    # Đặt ngưỡng báo động test = 30 độ
    radar = RadarSDK(threshold=30.0)
    radar.start()
