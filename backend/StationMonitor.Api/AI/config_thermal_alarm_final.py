import os, sys, time, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return

    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    print(f"\n--- THIẾT LẬP NGƯỠNG BÁO ĐỘNG (Test xuống 25 độ) ---")

    cond = core_sdk.NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_COND)
    cond.dwChannel = 2 
    cond.wPresetNo = 1 
    cond_ptr = ctypes.pointer(cond)

    alarm_rules = core_sdk.NET_DVR_THERMOMETRY_ALARMRULE()
    alarm_rules.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_ALARMRULE)
    
    std_config = core_sdk.NET_DVR_STD_CONFIG()
    std_config.lpCondBuffer = ctypes.cast(cond_ptr, ctypes.c_void_p)
    std_config.dwCondSize = cond.dwSize
    std_config.lpOutBuffer = ctypes.cast(ctypes.pointer(alarm_rules), ctypes.c_void_p)
    std_config.dwOutSize = alarm_rules.dwSize
    
    res = sdk.hcnetsdk.NET_DVR_GetSTDConfig(user_id, 3627, ctypes.byref(std_config))

    if not res:
        print(f"Lỗi đọc cấu hình: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        sdk.logout(user_id)
        return

    found = False
    for i in range(40):
        rule = alarm_rules.struThermometryAlarmRuleParam[i]
        if rule.byRuleID == 1:
            print(f"Tìm thấy P1. Ngưỡng cũ: {rule.fAlert}'C")
            rule.byEnable = 1 
            rule.fAlert = 25.0 # Hạ xuống 25 độ để dễ nhảy báo động
            rule.fAlarm = 30.0 
            rule.byRule = 0 
            found = True
            break
    
    if found:
        print(f"Đang lưu ngưỡng 25.0'C...")
        res_set = sdk.hcnetsdk.NET_DVR_SetDeviceConfig(
            user_id, 3628, 1,
            ctypes.byref(cond), ctypes.sizeof(cond),
            None, ctypes.byref(alarm_rules), ctypes.sizeof(alarm_rules)
        )
        if res_set:
            print("[OK] ĐÃ ĐẶT XUỐNG 25 ĐỘ!")
        else:
            print(f"Lỗi lưu: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
