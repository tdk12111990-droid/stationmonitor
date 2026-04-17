import time
import os
import sys

# Thêm đường dẫn để có thể import từ cùng thư mục hoặc package
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from camera_service import CameraService

def on_thermal_data_received(data):
    """
    Hàm callback xử lý dữ liệu nhiệt độ nhận được từ SDK
    """
    print(f"[CALLBACK] {time.strftime('%H:%M:%S')} - Vùng: {data['rule_name']} | Nhiệt độ Max: {data['max_temp']}°C")

def main():
    # 1. Đường dẫn tới SDK
    sdk_path = r"D:\EN-HCNetSDKV6.1.9.48_build20230410_win64\EN-HCNetSDKV6.1.9.48_build20230410_win64"
    
    # 2. Khởi tạo dịch vụ
    service = CameraService(sdk_path)
    print("--- 🚀 Đang khởi tạo StationMonitor SDK Service ---")
    
    if not service.initialize():
        print("❌ Lỗi khởi tạo SDK")
        return

    # 3. Kết nối camera (Thông tin lấy từ go2rtc.yaml)
    # Camera 152: Thermal Camera
    ip_152 = "192.168.10.152"
    user_152 = "admin"
    pass_152 = "Demo@2024"

    print(f"📡 Đang kết nối tới Camera Thermal: {ip_152}...")
    if service.connect("CAM_152", ip_152, 8000, user_152, pass_152):
        print(f"✅ Kết nối thành công {ip_152}")
        
        # 4. Bắt đầu giám sát nhiệt độ (Channel 2 thường là Thermal)
        print("🌡️ Đang bắt đầu lấy dữ liệu nhiệt độ realtime...")
        service.start_thermal_monitoring("CAM_152", channel=2, callback=on_thermal_data_received)
        
        # Chạy trong 15 giây để xem kết quả
        try:
            time.sleep(15)
        except KeyboardInterrupt:
            pass
            
    else:
        print(f"❌ Không thể kết nối tới {ip_152}")

    # 5. Dọn dẹp
    print("\n👋 Đang ngắt kết nối và giải phóng tài nguyên...")
    service.cleanup()
    print("✨ Xong!")

if __name__ == "__main__":
    main()
