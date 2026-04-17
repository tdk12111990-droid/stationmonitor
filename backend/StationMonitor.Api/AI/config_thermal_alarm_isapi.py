import os, sys, time, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def isapi_get(sdk, user_id, url):
    # Chuẩn bị Input
    in_buf = NET_DVR_XML_CONFIG_INPUT()
    in_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
    
    # URL cho ISAPI (Cần gán vào lpRequestUrl)
    url_bytes = url.encode('utf-8')
    in_buf.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_bytes), ctypes.c_void_p)
    in_buf.dwRequestUrlLen = len(url_bytes)
    
    # Chuẩn bị Output
    out_buf = NET_DVR_XML_CONFIG_OUTPUT()
    out_buf.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
    
    out_xml_buf = ctypes.create_string_buffer(1024 * 64) # 64KB cho XML
    out_buf.lpOutBuffer = ctypes.cast(out_xml_buf, ctypes.c_void_p)
    out_buf.dwOutBufferSize = 1024 * 64
    
    status_buf = ctypes.create_string_buffer(1024)
    out_buf.lpStatusBuffer = ctypes.cast(status_buf, ctypes.c_void_p)
    out_buf.dwStatusSize = 1024
    
    res = sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(in_buf), ctypes.byref(out_buf))
    if not res:
        print(f"Lỗi GET ISAPI: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        return None
    
    return out_xml_buf.value.decode('utf-8')

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    sdk.init()
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    print(f"\n--- ĐANG CẤU HÌNH QUA ISAPI (XML MODE) ---")

    # 1. Lấy danh sách Rules
    # Thermal channel thường là 1 (hoặc 101/201 tùy model ISAPI)
    url = "GET /ISAPI/Thermal/channels/1/thermometry/rules"
    xml_data = isapi_get(sdk, user_id, url)
    
    if xml_data:
        print("Đã lấy được dữ liệu cấu hình XML!")
        # In một đoạn nhỏ để kiểm tra
        print(xml_data[:500] + "...")
        
        # Mẹo: Để thực sự cấu hình, chúng ta cần sửa XML này và gửi lại bằng PUT
        # Trong ví dụ test này, chúng ta chỉ xác nhận đã đọc thành công XML Rules
        print("\n[!] Đã xác nhận Camera hỗ trợ ISAPI. Bạn có thể sửa XML này để đặt ngưỡng 30 độ.")
    else:
        print("Camera không phản hồi yêu cầu ISAPI này.")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
