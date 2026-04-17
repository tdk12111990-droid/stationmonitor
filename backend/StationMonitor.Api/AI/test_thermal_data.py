import os, sys, time, ctypes, threading

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
SDK_LIB_DIR = os.path.join(TEST_SDK_DIR, "lib")
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

print(f"\n--- DANG KIEM TRA DU LIEU NHIET DO TU CAMERA {CAMERA_IP} ---")

def thermal_callback(dwType, lpBuffer, dwBufLen, pUserData):
    if dwType == 2: # NET_SDK_CALLBACK_TYPE_DATA
        if lpBuffer and dwBufLen >= ctypes.sizeof(NET_DVR_THERMOMETRY_UPLOAD):
            data = NET_DVR_THERMOMETRY_UPLOAD.from_buffer_copy(
                ctypes.string_at(lpBuffer, dwBufLen)
            )
            rule_id = data.byRuleID
            temp_max = round(data.fMaxTemperature, 1)
            # In ra màn hình console để kiểm tra
            print(f"[{time.strftime('%H:%M:%S')}] Diem P{rule_id}: {temp_max}'C")

# 1. Khoi tao SDK
sdk = HCNetSDK(TEST_SDK_DIR)
if not sdk.init():
    print("LOI: Khong the khoi tao SDK!")
    sys.exit(1)

# 2. Dang nhap
user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
if user_id < 0:
    print(f"LOI: Khong the dang nhap vao camera {CAMERA_IP}!")
    sdk.cleanup()
    sys.exit(1)

print("Dang nhap thanh cong! Dang bat dau lay du lieu 10 diem...\n")

# 3. Dang ky callback va bat dau nhan du lieu
thermal_callback_ptr = RemoteConfigCallback(thermal_callback)
cond = NET_DVR_THERMOMETRY_COND()
cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
cond.dwChannel = 2 # Thermal Channel
cond.wMode = 1    # Real-time monitoring

handle = sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
    user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond),
    thermal_callback_ptr, None
)

if handle < 0:
    print("LOI: Khong the bat dau lay du lieu nhiet do!")
else:
    print("--- DANG NHAN DU LIEU (Nhan Ctrl+C de dung) ---\n")
    try:
        # Chạy trong 20 giây để kiểm tra
        for _ in range(20):
            time.sleep(1)
    except KeyboardInterrupt:
        pass

# Cleanup
if handle >= 0:
    sdk.hcnetsdk.NET_DVR_StopRemoteConfig(handle)
sdk.logout(user_id)
sdk.cleanup()
print("\n--- KET THUC KIEM TRA ---")
