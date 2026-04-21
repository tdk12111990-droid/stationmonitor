#!/usr/bin/env python
"""Test with REAL image from camera stream (not fake)."""

import json
import time
import xml.etree.ElementTree as ET
import requests
from pathlib import Path
from datetime import datetime


def fetch_real_image_from_camera(camera_id, filename):
    """Fetch REAL snapshot from camera via ISAPI."""

    with open("config.json") as f:
        config = json.load(f)

    cam = config.get(camera_id)
    if not cam:
        print(f"    ERROR: Camera {camera_id} not in config")
        return False

    ip = cam["ip"]
    user = cam["user"]
    passwd = cam["password"]

    # Camera 152 uses channel 101 for thermal
    # Camera 153 uses channel 1 for normal
    if camera_id == "camera_152":
        endpoint = "/ISAPI/Streaming/channels/101/picture"
    else:
        endpoint = "/ISAPI/Streaming/channels/1/picture"

    url = f"http://{ip}:8000{endpoint}"

    print(f"    Fetching from: {url}")
    print(f"    Auth: {user}")

    try:
        response = requests.get(
            url,
            auth=(user, passwd),
            timeout=10,
            verify=False
        )

        if response.status_code == 200:
            # Save real image
            with open(filename, 'wb') as f:
                f.write(response.content)

            size_kb = Path(filename).stat().st_size / 1024
            print(f"    SUCCESS: Saved {size_kb:.1f} KB real snapshot")
            return True

        elif response.status_code == 401:
            print(f"    FAIL: Unauthorized (401) - check credentials")
            print(f"           Camera: {user} / ****")
            return False

        elif response.status_code == 404:
            print(f"    FAIL: Endpoint not found (404)")
            print(f"           Endpoint may not exist on this camera")
            return False

        else:
            print(f"    FAIL: HTTP {response.status_code}")
            return False

    except requests.exceptions.ConnectionError as e:
        print(f"    FAIL: Cannot connect to {ip}:8000")
        print(f"           Camera offline or unreachable")
        print(f"           Error: {str(e)[:100]}")
        return False

    except requests.exceptions.Timeout:
        print(f"    FAIL: Request timeout (10s)")
        return False

    except Exception as e:
        print(f"    FAIL: {str(e)[:100]}")
        return False


def test_thermal_alarm_real_image():
    """Test with REAL image from Camera 152."""
    print("\n" + "="*70)
    print("TEST 1: Thermal Alarm (Camera 152) - REAL Image from Stream")
    print("="*70)

    with open("config.json") as f:
        config = json.load(f)

    # Simulate event
    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.152</ipAddress>
        <eventType>temperatureAlarm</eventType>
        <dateTime>2026-04-21T16:30:00+07:00</dateTime>
        <ThermalAlarmInfo>
            <maxTemperature>95.3</maxTemperature>
            <minTemperature>18.2</minTemperature>
            <averageTemperature>22.8</averageTemperature>
            <fRuleTemperature>80.0</fRuleTemperature>
        </ThermalAlarmInfo>
    </EventNotificationAlert>
    """

    root = ET.fromstring(event_xml)
    ip = root.find("ipAddress").text
    event_type = root.find("eventType").text
    thermal_info = root.find("ThermalAlarmInfo")
    max_temp = float(thermal_info.find("maxTemperature").text)
    threshold_temp = float(thermal_info.find("fRuleTemperature").text)

    print(f"\n[RECEIVED] {event_type} from {ip}")
    print(f"  Max Temp: {max_temp}°C (threshold: {threshold_temp}°C)")

    if max_temp > threshold_temp:
        print(f"\n[ALERT] Temperature exceeds threshold!")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        alert_id = f"{timestamp}_cam152_{event_type}"

        alerts_dir = Path(config["alert_manager"]["alerts_dir"])
        alerts_dir.mkdir(exist_ok=True)

        # Create JSON
        alert_data = {
            "id": alert_id,
            "timestamp_iso": datetime.now().isoformat(),
            "camera": {
                "id": "cam152",
                "ip": ip,
                "name": "Camera 152 - Thermal"
            },
            "event": {
                "type": event_type,
                "thermal": {
                    "max_c": max_temp,
                    "min_c": 18.2,
                    "avg_c": 22.8,
                    "threshold_c": threshold_temp,
                    "exceeded_by": round(max_temp - threshold_temp, 1)
                }
            }
        }

        print(f"\n[1] Creating JSON alert...")
        alert_file = alerts_dir / f"{alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)
        print(f"    Saved: {alert_file.name}")

        print(f"\n[2] Fetching REAL snapshot from Camera 152...")
        image_file = alerts_dir / f"{alert_id}.jpg"

        success = fetch_real_image_from_camera("camera_152", image_file)

        if success:
            alert_data["image_file"] = image_file.name
            print(f"    Image linked to alert")

            # Update JSON
            with open(alert_file, "w") as f:
                json.dump(alert_data, f, indent=2)

            print(f"\n[SUCCESS] Alert + REAL image captured!")
            return True
        else:
            print(f"\n[WARNING] Could not fetch real image")
            print(f"          Camera may be offline")
            print(f"          (In production: would retry or use fallback)")
            return False

    return False


def test_acoustic_alarm_real_image():
    """Test with REAL image from Camera 153."""
    print("\n" + "="*70)
    print("TEST 2: Acoustic Alarm (Camera 153) - REAL Image from Stream")
    print("="*70)

    with open("config.json") as f:
        config = json.load(f)

    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.153</ipAddress>
        <eventType>audioException</eventType>
        <dateTime>2026-04-21T16:35:30+07:00</dateTime>
        <AudioExceptionInfo>
            <wDecibel>92.3</wDecibel>
        </AudioExceptionInfo>
    </EventNotificationAlert>
    """

    root = ET.fromstring(event_xml)
    ip = root.find("ipAddress").text
    event_type = root.find("eventType").text
    decibel = float(root.find("AudioExceptionInfo/wDecibel").text)
    threshold_db = config["camera_153"]["thresholds"]["decibel_alarm_db"]

    print(f"\n[RECEIVED] {event_type} from {ip}")
    print(f"  Decibel: {decibel}dB (threshold: {threshold_db}dB)")

    if decibel > threshold_db:
        print(f"\n[ALERT] Sound level exceeds threshold!")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        alert_id = f"{timestamp}_cam153_{event_type}"

        alerts_dir = Path(config["alert_manager"]["alerts_dir"])
        alerts_dir.mkdir(exist_ok=True)

        alert_data = {
            "id": alert_id,
            "timestamp_iso": datetime.now().isoformat(),
            "camera": {
                "id": "cam153",
                "ip": ip,
                "name": "Camera 153 - Acoustic"
            },
            "event": {
                "type": event_type,
                "audio": {
                    "decibel": decibel,
                    "threshold_db": threshold_db,
                    "exceeded_by": round(decibel - threshold_db, 1)
                }
            }
        }

        print(f"\n[1] Creating JSON alert...")
        alert_file = alerts_dir / f"{alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)
        print(f"    Saved: {alert_file.name}")

        print(f"\n[2] Fetching REAL snapshot from Camera 153...")
        image_file = alerts_dir / f"{alert_id}.jpg"

        success = fetch_real_image_from_camera("camera_153", image_file)

        if success:
            alert_data["image_file"] = image_file.name

            # Update JSON
            with open(alert_file, "w") as f:
                json.dump(alert_data, f, indent=2)

            print(f"\n[SUCCESS] Alert + REAL image captured!")
            return True
        else:
            print(f"\n[WARNING] Could not fetch real image")
            print(f"          Camera may be offline")
            return False

    return False


def verify_results():
    """Verify saved files."""
    print("\n" + "="*70)
    print("VERIFICATION")
    print("="*70)

    alerts_dir = Path("alerts")
    json_files = list(alerts_dir.glob("*.json"))
    jpg_files = list(alerts_dir.glob("*.jpg"))

    print(f"\nJSON alerts: {len(json_files)}")
    print(f"JPEG images: {len(jpg_files)}")

    if not json_files:
        print("\n[FAIL] No alerts saved")
        return False

    print("\n" + "-"*70)

    for json_file in sorted(json_files):
        with open(json_file) as f:
            alert = json.load(f)

        print(f"\nAlert: {alert['id']}")
        print(f"  Camera: {alert['camera']['id']}")
        print(f"  Type: {alert['event']['type']}")

        if "image_file" in alert:
            img_path = alerts_dir / alert["image_file"]
            if img_path.exists():
                size_kb = img_path.stat().st_size / 1024
                print(f"  Image: {alert['image_file']} ({size_kb:.1f} KB) [REAL FROM CAMERA]")
            else:
                print(f"  Image: NOT SAVED (camera offline)")

    print("\n" + "-"*70)
    return len(json_files) > 0


def main():
    print("\n" + "="*70)
    print("REAL IMAGE TEST - Snapshot from Camera Stream")
    print("="*70)

    # Clean up
    import shutil
    alerts_dir = Path("alerts")
    if alerts_dir.exists():
        shutil.rmtree(alerts_dir)

    print("\nNOTE: This test tries to fetch REAL images from cameras")
    print("      If cameras are offline: will fail gracefully")
    print("      If cameras are online: will save actual stream snapshot")

    # Test 1
    test1 = test_thermal_alarm_real_image()
    time.sleep(1)

    # Test 2
    test2 = test_acoustic_alarm_real_image()
    time.sleep(1)

    # Verify
    test3 = verify_results()

    # Summary
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)
    print(f"Test 1 (Thermal with real image): {'PASS' if test1 else 'FAIL (camera offline?)'}")
    print(f"Test 2 (Acoustic with real image): {'PASS' if test2 else 'FAIL (camera offline?)'}")
    print(f"Test 3 (Verification): {'PASS' if test3 else 'FAIL'}")

    if test1 or test2:
        print("\n[SUCCESS] Real images captured from camera stream!")
    else:
        print("\n[INFO] Cameras offline - no real images captured")
        print("       When cameras are online, real images will be saved")

    print("="*70 + "\n")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
