import os, sys, time, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

# --- ĐỊNH NGHĨA CẤU TRÚC CHUẨN TỪ C# DEMO ---

class NET_DVR_THERMOMETRY_TRIGGER_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("dwChan", ctypes.c_uint32),
        ("dwPreset", ctypes.c_uint32),
        ("byRes", ctypes.c_ubyte * 256) # Padding khổng lồ (256 bytes)
    ]

class NET_DVR_HANDLEACTION(ctypes.Structure):
    _fields_ = [
        ("dwHandleType", ctypes.c_uint32), 
        ("byRes", ctypes.c_ubyte * 64) 
    ]

class NET_DVR_THERMOMETRY_TRIGGER(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("struHandleAction", NET_DVR_HANDLEACTION),
        ("byRes", ctypes.c_ubyte * 64)
    ]

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    # --- BƯỚC 2: KÍCH HOẠT LINKAGE (Với cấu trúc Trigger Cond chuẩn) ---
    print(f"\n--- ĐANG KÍCH HOẠT LIÊN KẾT GỬI BÁO ĐỘNG (LINKAGE) ---")
    
    # Sử dụng cấu trúc TRIGGER_COND chuẩn của SDK
    trig_cond = NET_DVR_THERMOMETRY_TRIGGER_COND()
    trig_cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_TRIGGER_COND)
    trig_cond.dwChan = 2 
    trig_cond.dwPreset = 1
    
    trigger = NET_DVR_THERMOMETRY_TRIGGER()
    trigger.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_TRIGGER)
    
    std_trig = core_sdk.NET_DVR_STD_CONFIG()
    std_trig.lpCondBuffer = ctypes.cast(ctypes.pointer(trig_cond), ctypes.c_void_p)
    std_trig.dwCondSize = trig_cond.dwSize
    std_trig.lpOutBuffer = ctypes.cast(ctypes.pointer(trigger), ctypes.c_void_p)
    std_trig.dwOutSize = trigger.dwSize
    
    # Thử lấy cấu hình Trigger (3632)
    if sdk.hcnetsdk.NET_DVR_GetSTDConfig(user_id, 3632, ctypes.byref(std_trig)):
        print(f"Đã đọc được Trigger. Trạng thái hiện tại: {hex(trigger.struHandleAction.dwHandleType)}")
        
        # Bật Notify Center (0x01) THÔI, tắt Capture Pic (0x10) để tránh nghẽn MTU Tailscale
        # 0x01 = 1 decimal
        trigger.struHandleAction.dwHandleType = 0x01
        
        std_trig_set = core_sdk.NET_DVR_STD_CONFIG()
        std_trig_set.lpCondBuffer = ctypes.cast(ctypes.pointer(trig_cond), ctypes.c_void_p)
        std_trig_set.dwCondSize = trig_cond.dwSize
        std_trig_set.lpInBuffer = ctypes.cast(ctypes.pointer(trigger), ctypes.c_void_p)
        std_trig_set.dwInSize = trigger.dwSize
        
        if sdk.hcnetsdk.NET_DVR_SetSTDConfig(user_id, 3633, ctypes.byref(std_trig_set)):
            print("[OK] ĐÃ KÍCH HOẠT LINKAGE THÀNH CÔNG!")
        else:
            print(f"[!] Lỗi khi SET Trigger (3633): {sdk.hcnetsdk.NET_DVR_GetLastError()}")
    else:
        print(f"[!] Lỗi khi GET Trigger (3632): {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
