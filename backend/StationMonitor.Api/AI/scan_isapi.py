import os, sys, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

def try_isapi(sdk, user_id, url):
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
        content = out_xml_buf.value.decode('utf-8')
        if "threshold" in content.lower() or "alert" in content.lower():
            print(f"[SUCCESS] Tim thay tai: {url}")
            return content
    return None

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    sdk.init()
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return

    paths = [
        "GET /ISAPI/Thermal/channels/1/thermometry/alarmRules",
        "GET /ISAPI/Thermal/channels/1/thermometry/basicParam",
        "GET /ISAPI/Thermal/channels/1/thermometry/rules/1",
        "GET /ISAPI/Thermal/channels/1/thermometry/param"
    ]

    for p in paths:
        print(f"Dang thu: {p}...")
        res = try_isapi(sdk, user_id, p)
        if res:
            with open(f"d:\\StationMonitor\\ai-python\\found_config.xml", "w", encoding="utf-8") as f:
                f.write(res)
            break

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
