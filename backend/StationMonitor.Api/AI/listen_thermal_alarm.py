import os, sys, time, ctypes

# Cấu hình đường dẫn SDK
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

import core.hcnet_sdk as core_sdk
from core.hcnet_sdk import HCNetSDK

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

# Thư mục lưu ảnh báo động
ALERTS_DIR = r"d:\StationMonitor\alerts"
if not os.path.exists(ALERTS_DIR):
    os.makedirs(ALERTS_DIR)

# --- HÀM XỬ LÝ BÁO ĐỘNG ---
def alarm_callback(lCommand, pAlarmer, pAlarmInfo, dwBufLen, pUser):
    # In ra mọi sự kiện nhận được để debug
    print(f"[*] Nhận được sự kiện mã: {hex(lCommand)} ({lCommand})")
    
    # 0x5212 == COMM_THERMOMETRY_ALARM (Theo chuẩn HCNetSDK.h)
    if lCommand == 0x5212:
        try:
            alarm_data = core_sdk.NET_DVR_THERMOMETRY_ALARM.from_buffer_copy(
                ctypes.string_at(pAlarmInfo, dwBufLen)
            )
            
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            print(f"\n[!!!] BÁO ĐỘNG NHIỆT ĐỘ - {timestamp}")
            print(f"Điểm đo: P{alarm_data.byRuleID} | Nhiệt độ: {round(alarm_data.fCurrTemperature, 1)}'C")
            
            # Kiểm tra và lưu ảnh nếu có (Trường hợp Camera đẩy được)
            if alarm_data.dwPicLen > 0 and alarm_data.pPicBuff:
                filename = f"Alert_P{alarm_data.byRuleID}_{timestamp}.jpg"
                filepath = os.path.join(ALERTS_DIR, filename)
                pic_data = ctypes.string_at(alarm_data.pPicBuff, alarm_data.dwPicLen)
                with open(filepath, "wb") as f:
                    f.write(pic_data)
                print(f"==> ĐÃ LƯU ẢNH (Camera ĐẨY): {filename}")
            else:
                # TRƯỜNG HỢP VPN CHẶN: Camera chỉ ném chữ, Python sẽ KÉO ảnh về
                print(f"[*] Camera không gửi kèm ảnh do VPN, tiến hành KÉO ảnh thủ công...")
                filename = f"Alert_P{alarm_data.byRuleID}_{timestamp}_PULLED.jpg"
                filepath = os.path.join(ALERTS_DIR, filename)
                
                class NET_DVR_JPEGPARA(ctypes.Structure):
                    _fields_ = [("wPicSize", ctypes.c_ushort), ("wPicQuality", ctypes.c_ushort)]
                jp = NET_DVR_JPEGPARA()
                jp.wPicSize = 0xff # 0xff = Tự động giữ nguyên nén
                jp.wPicQuality = 1 # 0-Best, 1-Better, 2-Normal
                
                # Hàm Capture: (lUserID, lChannel, param, filepath)
                # Chú ý: Lấy lUserID từ biến môi trường hoặc biến toàn cục
                import __main__
                if hasattr(__main__, 'global_user_id'):
                    res = core_sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture(__main__.global_user_id, 2, ctypes.byref(jp), filepath.encode('utf-8'))
                    if res:
                        print(f"==> ĐÃ KÉO ẢNH XONG: {filename}")
                    else:
                        print(f"[!] Lỗi khi kéo ảnh: {core_sdk.hcnetsdk.NET_DVR_GetLastError()}")
                
        except Exception as e:
            print(f"Lỗi xử lý báo động: {e}")
    return

# Khởi tạo callback pointer
alarm_cb_ptr = core_sdk.MSGCALLBACK(alarm_callback)

def main():
    sdk = HCNetSDK(TEST_SDK_DIR)
    if not sdk.init(): return
    
    # Khai báo hàm Kép Ảnh tránh crash Python
    class NET_DVR_JPEGPARA(ctypes.Structure):
        _fields_ = [("wPicSize", ctypes.c_ushort), ("wPicQuality", ctypes.c_ushort)]
    sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.restype = ctypes.c_bool
    sdk.hcnetsdk.NET_DVR_CaptureJPEGPicture.argtypes = [ctypes.c_long, ctypes.c_long, ctypes.POINTER(NET_DVR_JPEGPARA), ctypes.c_char_p]
    
    user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
    if user_id < 0: return
    
    import __main__
    __main__.global_user_id = user_id

    # 1. Đăng ký Callback
    cb_cast = ctypes.cast(alarm_cb_ptr, core_sdk.MSGCALLBACK)
    sdk.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V50(0, cb_cast, None)

    # 2. Thiết lập kênh báo động
    alarm_param = core_sdk.NET_DVR_SETUPALARM_PARAM()
    alarm_param.dwSize = ctypes.sizeof(core_sdk.NET_DVR_SETUPALARM_PARAM)
    alarm_param.byLevel = 1 
    alarm_param.byAlarmInfoType = 1

    alarm_handle = sdk.hcnetsdk.NET_DVR_SetupAlarmChan_V41(user_id, ctypes.byref(alarm_param))

    if alarm_handle < 0:
        print(f"Lỗi mở kênh báo động: {sdk.hcnetsdk.NET_DVR_GetLastError()}")
        return

    print(f"\n--- ĐANG TRỰC CHIẾN (CHỜ BÁO ĐỘNG & LƯU ẢNH) ---")
    print(f"Thư mục lưu ảnh: {ALERTS_DIR}")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            sdk.hcnetsdk.NET_DVR_CloseAlarmChan_V30(alarm_handle)
        except: pass
        sdk.logout(user_id)
        sdk.cleanup()

if __name__ == "__main__":
    main()
