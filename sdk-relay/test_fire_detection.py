#!/usr/bin/env python3
"""
test_fire_detection.py — Test lấy thông báo Fire/Smoke từ Camera 153 (Phóng điện)

Không động đến mấy file khác trong project.
Chỉ test riêng để lấy stream thông báo từ camera.

Cách dùng:
    python test_fire_detection.py
"""

import requests
import json
import time
from requests.auth import HTTPDigestAuth

# ════════════════════════════════════════════════════════════
# Cấu hình
# ════════════════════════════════════════════════════════════

CAMERA_IP = "192.168.10.153"
CAMERA_USER = "tladmin"
CAMERA_PASSWORD = "Ab@12345"

BASE_URL = f"http://{CAMERA_IP}"
AUTH = HTTPDigestAuth(CAMERA_USER, CAMERA_PASSWORD)

# ════════════════════════════════════════════════════════════
# Test 1: Kiểm tra kết nối camera
# ════════════════════════════════════════════════════════════

def test_connection():
    print("\n" + "="*60)
    print("TEST 1: Kiểm tra kết nối camera 153")
    print("="*60)

    try:
        r = requests.get(f"{BASE_URL}/ISAPI/System/deviceInfo", auth=AUTH, timeout=5)
        if r.status_code == 200:
            data = r.json()
            print(f"✅ Kết nối thành công!")
            print(f"   Model: {data.get('model', 'N/A')}")
            print(f"   Serial: {data.get('serialNumber', 'N/A')}")
            return True
        else:
            print(f"❌ Lỗi: {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ Không thể kết nối: {e}")
        return False

# ════════════════════════════════════════════════════════════
# Test 2: Kiểm tra trigger fire/smoke
# ════════════════════════════════════════════════════════════

def test_fire_triggers():
    print("\n" + "="*60)
    print("TEST 2: Kiểm tra Fire/Smoke Triggers")
    print("="*60)

    triggers = [
        "fire",
        "smoke",
        "firedetection",
        "smokedetection",
    ]

    for trigger in triggers:
        try:
            r = requests.get(
                f"{BASE_URL}/ISAPI/Event/triggers/{trigger}",
                auth=AUTH,
                timeout=5
            )
            status = "✅" if r.status_code == 200 else "❌"
            print(f"{status} /{trigger} → {r.status_code}")

            if r.status_code == 200:
                print(f"    Content: {r.text[:100]}...")
        except Exception as e:
            print(f"❌ /{trigger} → Error: {e}")

# ════════════════════════════════════════════════════════════
# Test 3: Kiểm tra ISAPI AlertStream
# ════════════════════════════════════════════════════════════

def test_alert_stream():
    print("\n" + "="*60)
    print("TEST 3: Kiểm tra ISAPI AlertStream (Real-time)")
    print("="*60)
    print("⏳ Đợi 30 giây để nhận thông báo từ camera...")
    print("   (Nếu có trigger fire/smoke sẽ thấy ở đây)")
    print()

    try:
        r = requests.get(
            f"{BASE_URL}/ISAPI/Event/notification/alertstream",
            auth=AUTH,
            stream=True,
            timeout=35
        )

        if r.status_code != 200:
            print(f"❌ Lỗi: {r.status_code}")
            return

        print("✅ AlertStream connected!")
        print()

        start_time = time.time()
        events_count = 0

        for line in r.iter_lines(decode_unicode=True):
            if line:
                elapsed = time.time() - start_time
                events_count += 1

                # Hiển thị event
                print(f"[{elapsed:.1f}s] Event #{events_count}:")

                # Parse XML nếu là XML
                if line.startswith("<"):
                    # Tìm eventType
                    if "eventType>" in line:
                        import re
                        match = re.search(r"<eventType>([^<]+)</eventType>", line)
                        if match:
                            event_type = match.group(1)
                            print(f"  📢 Event Type: {event_type}")

                    # Hiển thị một phần XML
                    print(f"  📋 XML: {line[:150]}...")
                else:
                    print(f"  📝 Raw: {line}")

                print()

        print(f"\n✅ Stream kết thúc. Nhận {events_count} event(s)")

    except requests.exceptions.Timeout:
        print(f"⏱️  Timeout sau 30 giây (bình thường nếu không có trigger)")
    except Exception as e:
        print(f"❌ Lỗi: {e}")

# ════════════════════════════════════════════════════════════
# Test 4: Kiểm tra config Fire Detection
# ════════════════════════════════════════════════════════════

def test_fire_config():
    print("\n" + "="*60)
    print("TEST 4: Kiểm tra Fire Detection Config")
    print("="*60)

    endpoints = [
        "/ISAPI/Smart/FireDetect",
        "/ISAPI/Smart/DischargeDetection",
        "/ISAPI/Thermal/channels/2/fireDetection",
    ]

    for ep in endpoints:
        try:
            r = requests.get(f"{BASE_URL}{ep}", auth=AUTH, timeout=5)
            status = "✅" if r.status_code == 200 else "⚠️"
            print(f"{status} {ep} → {r.status_code}")

            if r.status_code == 200 and r.text:
                print(f"    {r.text[:100]}...")
        except Exception as e:
            print(f"❌ {ep} → {str(e)[:60]}")

# ════════════════════════════════════════════════════════════
# Test 5: Kiểm tra Event Notification Config
# ════════════════════════════════════════════════════════════

def test_event_notification():
    print("\n" + "="*60)
    print("TEST 5: Kiểm tra Event Notification Config")
    print("="*60)

    try:
        r = requests.get(
            f"{BASE_URL}/ISAPI/Event/notification/httpHosts",
            auth=AUTH,
            timeout=5
        )

        if r.status_code == 200:
            print(f"✅ Event notification config:")
            print(f"   {r.text[:200]}...")
        else:
            print(f"⚠️ Status: {r.status_code}")
    except Exception as e:
        print(f"❌ Lỗi: {e}")

# ════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════

def main():
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*58 + "║")
    print("║  TEST FIRE/SMOKE DETECTION — Camera 153 (Phóng điện)   ║")
    print("║" + " "*58 + "║")
    print("╚" + "="*58 + "╝")

    # Test 1: Connection
    if not test_connection():
        print("\n❌ Không thể kết nối camera. Kiểm tra IP & credential.")
        return

    # Test 2: Triggers
    test_fire_triggers()

    # Test 3: Alert Stream (main test)
    test_alert_stream()

    # Test 4: Config
    test_fire_config()

    # Test 5: Notification
    test_event_notification()

    print("\n" + "="*60)
    print("✅ TEST HOÀN TẤT")
    print("="*60)
    print("\n📌 Kết quả:")
    print("   • Nếu thấy events trong AlertStream → camera đang gửi thông báo")
    print("   • Nếu không thấy → trigger chưa được kích hoạt hoặc chưa config")
    print("\n💡 Để test trigger:")
    print("   1. Gây ra fire/smoke event ở camera (ví dụ: lửa, khói)")
    print("   2. Chạy lại script để nhận thông báo")
    print("   3. Hoặc cài lửa giả trên camera để test")

if __name__ == "__main__":
    main()
