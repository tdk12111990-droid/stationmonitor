import ctypes
import os
import sys
import time
from hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback

# Constants
NET_DVR_GET_REALTIME_THERMOMETRY = 3629

def thermal_callback(dwType, lpBuffer, dwBufLen, pUserData):
    if dwType == 2:  # NET_SDK_CALLBACK_TYPE_DATA
        if lpBuffer and dwBufLen >= ctypes.sizeof(NET_DVR_THERMOMETRY_UPLOAD):
            data = NET_DVR_THERMOMETRY_UPLOAD.from_buffer_copy(
                ctypes.string_at(lpBuffer, dwBufLen)
            )
            rule_name = data.szRuleName.decode('utf-8', errors='ignore').strip('\x00')
            print(f"[DATA] Rule: {rule_name} | Max: {data.fMaxTemperature:.1f}C | Min: {data.fMinTemperature:.1f}C | Avg: {data.fAverageTemperature:.1f}C")
        else:
            print(f"[DATA] Received data with length {dwBufLen}")
    elif dwType == 0:  # NET_SDK_CALLBACK_TYPE_STATUS
        status = ctypes.cast(lpBuffer, ctypes.POINTER(ctypes.c_uint32)).contents.value
        print(f"[STATUS] Remote config status: {status}")

# Keep reference to callback to prevent garbage collection
py_thermal_callback = RemoteConfigCallback(thermal_callback)

def test_thermal():
    sdk_path = r"D:\EN-HCNetSDKV6.1.9.48_build20230410_win64\EN-HCNetSDKV6.1.9.48_build20230410_win64"
    sdk = HCNetSDK(sdk_path)
    
    if not sdk.init():
        print("[FAIL] Init failed")
        return

    # Camera 152 (Thermal)
    ip = "192.168.10.152"
    user = "admin"
    password = "Demo@2024"

    user_id, device_info = sdk.login(ip, 8000, user, password)
    if user_id < 0:
        print(f"[FAIL] Login failed for {ip}")
        return
    print(f"[OK] Logged in to {ip}")

    # Set up thermal condition
    cond = NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
    cond.dwChan = 2 # Thermal channel is usually 2
    cond.wMode = 1 # Real-time mode (0-periodic, 1-realtime)

    # Start remote config
    handle = sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
        user_id, 
        NET_DVR_GET_REALTIME_THERMOMETRY, 
        ctypes.byref(cond), 
        ctypes.sizeof(cond), 
        py_thermal_callback, 
        None
    )

    if handle < 0:
        error = sdk.hcnetsdk.NET_DVR_GetLastError()
        print(f"[FAIL] StartRemoteConfig failed. Error: {error}")
    else:
        print("[SUCCESS] Thermal data polling started. Waiting 10 seconds...")
        time.sleep(10)
        sdk.hcnetsdk.NET_DVR_StopRemoteConfig(handle)
        print("[STOP] Polling stopped")

    sdk.logout(user_id)
    sdk.cleanup()

if __name__ == "__main__":
    test_thermal()
