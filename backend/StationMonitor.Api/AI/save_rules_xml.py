import os, sys, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    sdk.init()
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    # 1. Chuẩn bị Input/Output cho ISAPI
    in_buf = NET_DVR_XML_CONFIG_INPUT()
    in_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
    url = "GET /ISAPI/Thermal/channels/1/thermometry/rules"
    url_bytes = url.encode('utf-8')
    in_buf.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_bytes), ctypes.c_void_p)
    in_buf.dwRequestUrlLen = len(url_bytes)
    
    out_buf = NET_DVR_XML_CONFIG_OUTPUT()
    out_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
    out_xml_buf = ctypes.create_string_buffer(1024 * 128) # 128KB
    out_buf.lpOutBuffer = ctypes.cast(out_xml_buf, ctypes.c_void_p)
    out_buf.dwOutBufferSize = 1024 * 128
    
    res = sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(in_buf), ctypes.byref(out_buf))
    
    if res:
        xml_content = out_xml_buf.value.decode('utf-8')
        with open("d:\\StationMonitor\\ai-python\\rules.xml", "w", encoding="utf-8") as f:
            f.write(xml_content)
        print("Đã lưu cấu hình vào file: d:\\StationMonitor\\ai-python\\rules.xml")
        print("Bạn có thể mở file này để xem cấu hình chi tiết của 10 điểm.")
    else:
        print(f"Lỗi: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
