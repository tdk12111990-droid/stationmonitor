from hikvision.hcnet_sdk import HCNetSDK, NET_DVR_PREVIEWINFO, RealDataCallback
import ctypes
import time
import sys
import io
import json
import re

# Đảm bảo đầu ra console là UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Constants theo tài liệu người dùng cung cấp
NET_DVR_PRIVATE_DATA = 112
NET_DVR_METADATA_DATA = 107

# Config Camera 153
IP = "192.168.10.153"
USER = "admin"
PASS = "Demo@2024"
SDK_PATH = r"D:\StationMonitor\sdk-relay\test_sdk"

def parse_acoustic_xml(xml_text):
    """Bóc tách dữ liệu từ luồng Metadata (Mã 107)"""
    try:
        db_match = re.search(r"<(?:decibel|dB)>([\d\.\-]+)</", xml_text, re.I)
        hz_match = re.search(r"<(?:frequency|hz)>([\d\.]+)</", xml_text, re.I)
        if db_match and hz_match:
            return float(db_match.group(1)), float(hz_match.group(1))
    except:
        pass
    return None, None

def real_data_callback(lRealHandle, dwDataType, pBuffer, dwBufSize, pUser):
    """Callback xử lý dữ liệu thô tận gốc"""
    try:
        if dwBufSize == 0: return
        
        # DEBUG: In ra mọi loại dữ liệu nhận được để chẩn đoán
        # Chỉ ẩn mã 2 (Video Data bình thường) để tránh trôi màn hình
        if dwDataType != 2:
            print(f"[DEBUG] Received DataType: {dwDataType} | Size: {dwBufSize}", flush=True)

        # BƯỚC 2: Lọc mã Loại dữ liệu (Data Type)
        if dwDataType == NET_DVR_PRIVATE_DATA:
            # Gói dữ liệu thô VCA chứa dB và tọa độ
            raw_bytes = ctypes.string_at(pBuffer, dwBufSize)
            print(f"[DATA 112] Received Private VCA Data. HEX: {raw_bytes[:32].hex()}", flush=True)
            
        elif dwDataType == NET_DVR_METADATA_DATA:
            # Gói Metadata dạng ISAPI XML
            raw_bytes = ctypes.string_at(pBuffer, dwBufSize)
            xml_text = raw_bytes.decode('utf-8', errors='ignore')
            print(f"[DATA 107] Metadata XML: {xml_text[:100]}...", flush=True)
            db, freq = parse_acoustic_xml(xml_text)
            if db is not None:
                print(json.dumps({"source": "Metadata (107)", "dB": db, "Hz": freq}), flush=True)

    except Exception as e:
        print(f"Callback error: {e}")

def main():
    sdk = HCNetSDK(SDK_PATH)
    if not sdk.init(): return

    user_id, _ = sdk.login(IP, 8000, USER, PASS)
    if user_id < 0:
        print(f"Login failed: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        return

    print(f"Connected to {IP}. Monitoring for Private Data (112) and Metadata (107)...")

    # Cấu hình Preview để kích hoạt Dual-VCA (nhúng dữ liệu phân tích)
    preview_info = NET_DVR_PREVIEWINFO()
    preview_info.lChannel = 1
    preview_info.dwStreamType = 0
    preview_info.dwLinkMode = 0
    preview_info.bBlocked = False
    
    # Bật cờ hiệu byRetVCAData (Nằm trong byRes2)
    # byRes2[0] tương ứng với offset để camera trả về dữ liệu thông minh
    preview_info.byRes2[0] = 1 

    callback_func = RealDataCallback(real_data_callback)
    handle = sdk.hcnetsdk.NET_DVR_RealPlay_V40(user_id, ctypes.byref(preview_info), callback_func, None)
    
    if handle >= 0:
        print(">>> LISTENING FOR RAW ACOUSTIC DATA... (Ctrl+C to stop)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        sdk.hcnetsdk.NET_DVR_StopRealPlay(handle)
    else:
        print(f"RealPlay error: {sdk.hcnetsdk.NET_DVR_GetLastError()}")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    main()
