import os
import sys
import time
from hcnet_sdk import HCNetSDK

def test_connection():
    # Path to SDK
    sdk_path = r"D:\EN-HCNetSDKV6.1.9.48_build20230410_win64\EN-HCNetSDKV6.1.9.48_build20230410_win64"
    
    # Initialize SDK
    try:
        sdk = HCNetSDK(sdk_path)
    except Exception as e:
        print(f"❌ Initialization failed: {e}")
        return

    if not sdk.init():
        print("[FAIL] NET_DVR_Init failed")
        return
    print("[SUCCESS] SDK Initialized")

    # Camera details
    cameras = [
        {"ip": "192.168.10.152", "user": "admin", "pass": "Demo@2024"},
        {"ip": "192.168.10.153", "user": "tladmin", "pass": "Ab@12345"}
    ]

    for cam in cameras:
        print(f"\n--- Testing Camera {cam['ip']} ---")
        user_id, device_info = sdk.login(cam['ip'], 8000, cam['user'], cam['pass'])
        
        if user_id >= 0:
            print(f"[OK] Login successful! UserID: {user_id}")
            try:
                serial = bytes(device_info.struDeviceV30.sSerialNumber).decode('utf-8').strip('\x00')
                print(f"   Serial Number: {serial}")
            except:
                print("   Serial Number: (binary data)")
            sdk.logout(user_id)
            print("👋 Logged out")
        else:
            print(f"[FAIL] Login failed for {cam['ip']}")

    sdk.cleanup()
    print("\n[FINISH] SDK Cleanup done")

if __name__ == "__main__":
    test_connection()
