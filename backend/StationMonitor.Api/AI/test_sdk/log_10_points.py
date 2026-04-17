import os
import sys
import ctypes
import time
import threading

# Thêm đường dẫn core
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(CURRENT_DIR)

from core.hcnet_sdk import (
    HCNetSDK, 
    NET_DVR_THERMOMETRY_COND, 
    NET_DVR_THERMOMETRY_UPLOAD, 
    RemoteConfigCallback
)

# --- CẤU HÌNH ---
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"
MONITOR_IDS = list(range(1, 11))  # Lấy dữ liệu từ ID 1 đến 10

class ThermalLogger:
    def __init__(self):
        self.sdk = HCNetSDK(CURRENT_DIR)
        self.user_id = -1
        self.handle = -1
        self.temp_data = {rid: 0.0 for rid in MONITOR_IDS}
        self.lock = threading.Lock()
        self.running = True
        
        # Giữ reference callback để tránh bị Garbage Collector dọn mất
        self._callback = RemoteConfigCallback(self._thermal_callback)

    def _thermal_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        """Hàm nhận dữ liệu nhiệt độ từ Camera"""
        if dwType == 2: # NET_SDK_CALLBACK_TYPE_DATA
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            rid = data.byRuleID
            if rid in self.temp_data:
                with self.lock:
                    self.temp_data[rid] = data.fMaxTemperature

    def start(self):
        if not self.sdk.init(): return
        
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0:
            print("❌ Đăng nhập thất bại!")
            return

        # Cấu hình lệnh lấy nhiệt độ thời gian thực
        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = 2 # Kênh nhiệt
        cond.wMode = 1     # Lấy theo quy tắc (Rules)

        self.handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
            self.user_id, 
            3629, # NET_DVR_GET_REALTIME_THERMOMETRY
            ctypes.byref(cond), 
            ctypes.sizeof(cond), 
            self._callback, 
            None
        )

        if self.handle < 0:
            print(f"❌ Không thể bắt đầu lấy dữ liệu. Lỗi: {self.sdk.hcnetsdk.NET_DVR_GetLastError()}")
            return

        print(f"--- ĐANG THEO DÕI 10 ĐIỂM NHIỆT ĐỘ (IP: {CAMERA_IP}) ---")
        print("Bấm Ctrl+C để dừng lại.\n")

        try:
            while self.running:
                # In báo cáo mỗi 5 giây
                with self.lock:
                    timestamp = time.strftime("%H:%M:%S")
                    output = [f"P{rid}: {self.temp_data[rid]:>4.1f}C" for rid in MONITOR_IDS]
                    print(f"[{timestamp}] {' | '.join(output)}")
                
                time.sleep(5)
        except KeyboardInterrupt:
            print("\n🛑 Đang dừng thu thập dữ liệu...")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.handle >= 0:
            self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.handle)
        self.sdk.logout(self.user_id)
        self.sdk.cleanup()

if __name__ == "__main__":
    logger = ThermalLogger()
    logger.start()
