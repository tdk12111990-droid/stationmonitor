import sys, ctypes, time
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)
import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

sys.stdout.reconfigure(encoding='utf-8')

def set_threshold(sdk, user_id, temp):
    cond = core_sdk.NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_COND)
    cond.dwChannel = 2 
    cond.wPresetNo = 1 
    
    alarm_rules = core_sdk.NET_DVR_THERMOMETRY_ALARMRULE()
    alarm_rules.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_ALARMRULE)
    
    std_get = core_sdk.NET_DVR_STD_CONFIG()
    std_get.lpCondBuffer = ctypes.cast(ctypes.pointer(cond), ctypes.c_void_p)
    std_get.dwCondSize = cond.dwSize
    std_get.lpOutBuffer = ctypes.cast(ctypes.pointer(alarm_rules), ctypes.c_void_p)
    std_get.dwOutSize = alarm_rules.dwSize
    
    if sdk.hcnetsdk.NET_DVR_GetSTDConfig(user_id, 3627, ctypes.byref(std_get)):
        for i in range(40):
            if alarm_rules.struThermometryAlarmRuleParam[i].byRuleID == 1:
                rule = alarm_rules.struThermometryAlarmRuleParam[i]
                rule.byEnable = 1
                rule.fAlert = temp
                rule.fAlarm = temp + 5.0
                # KHÔNG ĐỤNG ĐẾN byRule để tránh lỗi 11
                break
                
        std_set = core_sdk.NET_DVR_STD_CONFIG()
        std_set.lpCondBuffer = ctypes.cast(ctypes.pointer(cond), ctypes.c_void_p)
        std_set.dwCondSize = cond.dwSize
        std_set.lpInBuffer = ctypes.cast(ctypes.pointer(alarm_rules), ctypes.c_void_p)
        std_set.dwInSize = alarm_rules.dwSize
        
        if sdk.hcnetsdk.NET_DVR_SetSTDConfig(user_id, 3628, ctypes.byref(std_set)):
            print(f"[OK] Đã ép ngưỡng về {temp}°C")
            return True
        else:
            print(f"[!] Lỗi Set {temp}: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
    else:
        print("Lỗi Get")
    return False

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    print("=== BẮT ĐẦU TẠO LƯỠI CẮT BÁO ĐỘNG (RISING EDGE EVENT) ===")
    print("Bước 1: Nâng ngưỡng lên 50°C để dập tắt báo động (Chờ 5 giây)...")
    set_threshold(sdk, user_id, 50.0)
    time.sleep(5)
    
    print("Bước 2: Hạ ngưỡng sốc xuống 10°C để bóp cò báo động!...")
    set_threshold(sdk, user_id, 10.0)

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
