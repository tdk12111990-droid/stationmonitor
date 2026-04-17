import os
import sys
import ctypes
import xml.etree.ElementTree as ET

# Thêm đường dẫn core
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(CURRENT_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT

# --- CẤU HÌNH ---
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"

def check_alarm_config():
    print(f"--- ĐANG KIỂM TRA CẤU HÌNH BÁO ĐỘNG TRÊN CAMERA {CAMERA_IP} ---")
    sdk = HCNetSDK(CURRENT_DIR)
    if not sdk.init(): return

    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    # 1. Kiểm tra các quy tắc báo động chi tiết (Alarm Rules)
    input_data = NET_DVR_XML_CONFIG_INPUT()
    input_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
    url = "GET /ISAPI/Thermal/channels/2/thermometry/alarmRules\r\n"
    input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url.encode('ascii')), ctypes.c_void_p)
    input_data.dwRequestUrlLen = len(url)

    out_buf = ctypes.create_string_buffer(1024 * 512)
    output_data = NET_DVR_XML_CONFIG_OUTPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT))
    output_data.lpOutBuffer = ctypes.cast(out_buf, ctypes.c_void_p)
    output_data.dwOutBufferSize = 1024 * 512

    print("[SDK] Đang quét các ngưỡng báo động...")
    if sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(input_data), ctypes.byref(output_data)):
        xml_data = out_buf.value.decode('utf-8', errors='ignore')
        try:
            root = ET.fromstring(xml_data)
            ns = {'isapi': 'http://www.isapi.org/ver20/XMLSchema'}
            
            rules = root.findall('.//isapi:ThermometryAlarmRule', ns)
            if not rules:
                print("ℹ️ Không tìm thấy quy tắc báo động riêng lẻ. Đang kiểm tra cấu hình chung...")
            else:
                print(f"✅ Tìm thấy {len(rules)} cấu hình báo động:\n")
                print(f"{'ID':<5} | {'Trạng thái':<10} | {'Ngưỡng (C)':<10} | {'Loại':<15} | {'Tên Rule'}")
                print("-" * 65)
                for rule in rules:
                    rid = rule.find('isapi:id', ns).text
                    enabled = rule.find('isapi:enabled', ns).text
                    threshold = rule.find('isapi:alarmTemperature', ns).text
                    # ruleType: 0-Khớp điểm, 1-Vượt ngưỡng cao, 2-Dưới ngưỡng thấp...
                    rtype = rule.find('isapi:rule', ns).text
                    rname = rule.find('isapi:szRuleName', ns).text if rule.find('isapi:szRuleName', ns) is not None else "N/A"
                    
                    type_str = "Vượt ngưỡng" if rtype == "1" else ("Dưới ngưỡng" if rtype == "2" else rtype)
                    status = "BẬT" if enabled == 'true' else "TẮT"
                    
                    print(f"{rid:<5} | {status:<10} | {threshold:<10} | {type_str:<15} | {rname}")
        except Exception as e:
            print(f"❌ Lỗi xử lý dữ liệu: {e}")
    else:
        print(f"❌ Không lấy được AlarmRules. Mã lỗi: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    # 2. Kiểm tra tính năng Phát hiện Lửa (Fire Detection)
    print("\n[SDK] Đang kiểm tra tính năng Phát hiện Lửa (Fire Detection)...")
    url_fire = "GET /ISAPI/Thermal/channels/2/fireDetection\r\n"
    input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_fire.encode('ascii')), ctypes.c_void_p)
    input_data.dwRequestUrlLen = len(url_fire)
    
    if sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(input_data), ctypes.byref(output_data)):
        xml_fire = out_buf.value.decode('utf-8', errors='ignore')
        if "<enabled>true</enabled>" in xml_fire:
            print("🔥 Fire Detection: ĐANG BẬT")
        else:
            print("⚪ Fire Detection: ĐANG TẮT")
    else:
        print("❌ Không hỗ trợ hoặc không truy cập được Fire Detection.")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    check_alarm_config()
