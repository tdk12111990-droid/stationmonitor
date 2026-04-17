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
    NET_DVR_XML_CONFIG_INPUT, 
    NET_DVR_XML_CONFIG_OUTPUT,
    NET_DVR_SETUPALARM_PARAM,
    NET_DVR_THERMOMETRY_ALARM,
    NET_DVR_ALARMER,
    MSGCALLBACK
)

# --- CẤU HÌNH ---
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"

# Mã lệnh báo động nhiệt độ
COMM_THERMOMETRY_ALARM = 0x5212

def alarm_callback(lCommand, pAlarmer, pAlarmInfo, dwBufLen, pUser):
    """Hàm này được gọi khi Camera bắn báo động về"""
    if lCommand == COMM_THERMOMETRY_ALARM:
        alarm_data = ctypes.cast(pAlarmInfo, ctypes.POINTER(NET_DVR_THERMOMETRY_ALARM)).contents
        level = "PRE-ALARM" if alarm_data.byAlarmLevel == 0 else "ALARM !!!"
        print(f"\n🔥 [BÁO ĐỘNG] Điểm {alarm_data.byRuleID} | Trạng thái: {level}")
        print(f"   Nhiệt độ hiện tại: {alarm_data.fCurrTemperature:.1f}C (Ngưỡng: {alarm_data.fRuleTemperature:.1f}C)")

# Giữ reference callback
_callback = MSGCALLBACK(alarm_callback)

def run_test():
    sdk = HCNetSDK(CURRENT_DIR)
    if not sdk.init(): return
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    # BƯỚC 1: Đặt ngưỡng 35 độ cho Điểm 1
    print("[STEP 1] Đang cài đặt ngưỡng báo động 35.0C cho Điểm 1...")
    xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<ThermometryRegion version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
    <id>1</id>
    <enabled>true</enabled>
    <alarmRule>1</alarmRule>
    <alarmTemperature>40.0</alarmTemperature>
    <preAlarmTemperature>35.0</preAlarmTemperature>
</ThermometryRegion>"""
    
    input_data = NET_DVR_XML_CONFIG_INPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT))
    url = "PUT /ISAPI/Thermal/channels/2/thermometry/rules/1\r\n"
    input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url.encode('ascii')), ctypes.c_void_p)
    input_data.dwRequestUrlLen = len(url)
    body_bytes = xml_body.encode('utf-8')
    input_data.lpInBuffer = ctypes.cast(ctypes.create_string_buffer(body_bytes), ctypes.c_void_p)
    input_data.dwInBufferSize = len(body_bytes)

    if sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(input_data), ctypes.byref(NET_DVR_XML_CONFIG_OUTPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)))):
        print("✅ Đã cài đặt ngưỡng thành công.")
    else:
        print("❌ Không đặt được ngưỡng.")

    # BƯỚC 2: Kích hoạt Arming Mode
    print("[STEP 2] Đang kích hoạt chế độ Vũ trang (Arming)...")
    sdk.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V50(0, _callback, None)
    
    alarm_param = NET_DVR_SETUPALARM_PARAM()
    alarm_param.dwSize = ctypes.sizeof(NET_DVR_SETUPALARM_PARAM)
    alarm_param.byLevel = 1 # High priority
    alarm_param.byAlarmInfoType = 1 # Smart alarm
    
    alarm_handle = sdk.hcnetsdk.NET_DVR_SetupAlarmChan_V41(user_id, ctypes.byref(alarm_param))
    if alarm_handle < 0:
        print(f"❌ Lỗi kích hoạt Arming: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        return

    print("\n🚀 HỆ THỐNG ĐANG LẮNG NGHE BÁO ĐỘNG...")
    print("Nếu nhiệt độ Điểm 1 > 35C, bạn sẽ thấy cảnh báo hiện ra ở đây.")
    print("Nhấn Ctrl+C để kết thúc.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đang dừng...")
    
    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    run_test()
