import os, sys, time, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_ALARMRULE

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return

    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    print(f"\n--- THIẾT LẬP NGƯỠNG BÁO ĐỘNG (Dùng mã lệnh chuẩn C# Demo: 3627/3628) ---")

    # 1. Điều kiện
    cond = NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
    cond.dwChannel = 2 # Kênh nhiệt
    
    # 2. Buffer nhận Quy tắc
    alarm_rules = NET_DVR_THERMOMETRY_ALARMRULE()
    alarm_rules.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_ALARMRULE)

    # 3. Lấy cấu hình (Command 3627 - Lấy theo chuẩn C#)
    res = sdk.hcnetsdk.NET_DVR_GetDeviceConfig(
        user_id, 3627, 1, 
        ctypes.byref(cond), ctypes.sizeof(cond),
        None, ctypes.byref(alarm_rules), ctypes.sizeof(alarm_rules)
    )

    if not res:
        print(f"Lỗi đọc cấu hình (3627): {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        sdk.logout(user_id)
        return

    # 4. Sửa ngưỡng P1 thành 30 độ
    found = False
    for i in range(40):
        rule_param = alarm_rules.struThermometryAlarmRuleParam[i]
        if rule_param.byRuleID == 1 or (not found and rule_param.byEnable):
            print(f"Bắt được Quy tắc ID {rule_param.byRuleID}: Alert={rule_param.fAlert}'C")
            rule_param.fAlert = 30.0
            rule_param.byEnable = 1
            found = True
            break
    
    if not found:
        print("Không tìm thấy P1 để sửa!")
        sdk.logout(user_id)
        return

    # 5. Lưu cấu hình (Command 3628 - Lưu theo chuẩn C#)
    print(f"Đang thiết lập ngưỡng 30.0'C cho P1...")
    res = sdk.hcnetsdk.NET_DVR_SetDeviceConfig(
        user_id, 3628, 1,
        ctypes.byref(cond), ctypes.sizeof(cond),
        None, ctypes.byref(alarm_rules), ctypes.sizeof(alarm_rules)
    )

    if res:
        print("THÀNH CÔNG RỰC RỠ! Đã lưu cấu hình qua mã lệnh 3628.")
    else:
        print(f"Lỗi lưu cấu hình (3628): {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
