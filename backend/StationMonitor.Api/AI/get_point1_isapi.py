import os, sys, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def get_isapi_detail(sdk, user_id, url):
    in_buf = NET_DVR_XML_CONFIG_INPUT()
    in_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
    url_bytes = url.encode('utf-8')
    in_buf.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_bytes), ctypes.c_void_p)
    in_buf.dwRequestUrlLen = len(url_bytes)
    
    out_buf = NET_DVR_XML_CONFIG_OUTPUT()
    out_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
    out_xml_buf = ctypes.create_string_buffer(1024 * 32)
    out_buf.lpOutBuffer = ctypes.cast(out_xml_buf, ctypes.c_void_p)
    out_buf.dwOutBufferSize = 1024 * 32
    
    res = sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(in_buf), ctypes.byref(out_buf))
    if res:
        return out_xml_buf.value.decode('utf-8')
    return None

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    sdk.init()
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    # Thử lấy chi tiết quy tắc 1 (ID:1) - Đây thường là nơi giấu Threshold
    print("\n--- ĐANG SOI CHI TIẾT ĐIỂM 1 ---")
    url = "GET /ISAPI/Thermal/channels/1/thermometry/rules/1"
    xml_detail = get_isapi_detail(sdk, user_id, url)
    
    if xml_detail:
        print("Đã tìm thấy cấu hình chi tiết!")
        print(xml_detail)
        with open("d:\\StationMonitor\\ai-python\\point1_detail.xml", "w", encoding="utf-8") as f:
            f.write(xml_detail)
    else:
        print(f"Không lấy được chi tiết P1. Lỗi: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
