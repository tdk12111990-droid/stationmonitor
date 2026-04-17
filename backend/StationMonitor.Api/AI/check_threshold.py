import sys, ctypes
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# Set stdout charset to utf-8
sys.stdout.reconfigure(encoding='utf-8')

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

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
                print(f"P1 - Enabled: {rule.byEnable}")
                print(f"P1 - Alert: {rule.fAlert}°C")
                print(f"P1 - Alarm: {rule.fAlarm}°C")
                print(f"P1 - Rule Type: {rule.byRule}")
                break
    else:
         print("Failed to get config")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
