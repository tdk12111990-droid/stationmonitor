import sys, ctypes
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

sys.stdout.reconfigure(encoding='utf-8')

class NET_DVR_THERMOMETRY_PRESETINFO(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("wPresetNo", ctypes.c_ushort),
        ("byRes1", ctypes.c_ubyte * 2),
        ("byRuleNum", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 3),
        ("struPresetInfo", core_sdk.NET_DVR_THERMOMETRY_PRESETINFO_PARAM * 40),
        ("byRes", ctypes.c_ubyte * 16)
    ]

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    cond = core_sdk.NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_COND)
    cond.dwChannel = 2
    cond.wPresetNo = 1
    
    # Dùng 3624: NET_DVR_GET_THERMOMETRY_PRESETINFO
    info = core_sdk.NET_DVR_THERMOMETRY_PRESETINFO()
    info.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_PRESETINFO)
    
    std_get = core_sdk.NET_DVR_STD_CONFIG()
    std_get.lpCondBuffer = ctypes.cast(ctypes.pointer(cond), ctypes.c_void_p)
    std_get.dwCondSize = cond.dwSize
    std_get.lpOutBuffer = ctypes.cast(ctypes.pointer(info), ctypes.c_void_p)
    std_get.dwOutSize = info.dwSize
    
    if sdk.hcnetsdk.NET_DVR_GetSTDConfig(user_id, 3624, ctypes.byref(std_get)):
        print(f"Thành công! Số lượng Rule: {info.byRuleNum}")
        for i in range(info.byRuleNum):
            param = info.struPresetInfo[i]
            print(f"Rule ID: {param.byRuleID}")
            print(f"High Temp: {param.fHighTemperature}°C")
            print(f"Low Temp: {param.fLowTemperature}°C")
            print(f"Average Temp: {param.fAverageTemperature}°C")
    else:
        print(f"Lỗi 3624: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
