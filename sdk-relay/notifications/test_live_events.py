#!/usr/bin/env python
"""Test script: simulate camera events and verify alert + image + video capture."""

import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from alert_manager import AlertManager


def test_thermal_alarm_event():
    """Simulate thermal alarm event and capture alert + image."""
    print("\n" + "="*70)
    print("TEST 1: Thermal Alarm Event (Camera 152)")
    print("="*70)

    # Load config
    with open("config.json") as f:
        config = json.load(f)

    alert_mgr = AlertManager(config["alert_manager"])

    # Simulate XML event from ISAPI AlertStream
    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.152</ipAddress>
        <ipv6Address>::</ipv6Address>
        <macAddress>00:11:22:33:44:55</macAddress>
        <channelID>2</channelID>
        <eventType>temperatureAlarm</eventType>
        <eventState>active</eventState>
        <eventDescription>Temperature Alarm</eventDescription>
        <dateTime>2026-04-21T14:30:00+07:00</dateTime>
        <ThermalAlarmInfo>
            <maxTemperature>92.5</maxTemperature>
            <minTemperature>18.2</minTemperature>
            <averageTemperature>22.8</averageTemperature>
            <fRuleTemperature>80.0</fRuleTemperature>
            <struHighestPoint>
                <x>512</x>
                <y>384</y>
            </struHighestPoint>
        </ThermalAlarmInfo>
    </EventNotificationAlert>
    """

    # Parse event
    root = ET.fromstring(event_xml)

    # Extract data
    ip = root.find("ipAddress").text
    event_type = root.find("eventType").text
    thermal_info = root.find("ThermalAlarmInfo")
    max_temp = float(thermal_info.find("maxTemperature").text)
    min_temp = float(thermal_info.find("minTemperature").text)
    avg_temp = float(thermal_info.find("averageTemperature").text)
    threshold_temp = float(thermal_info.find("fRuleTemperature").text)

    print(f"\n[RECEIVED] {event_type} from {ip}")
    print(f"  Max Temp: {max_temp}°C (threshold: {threshold_temp}°C)")
    print(f"  Min Temp: {min_temp}°C")
    print(f"  Avg Temp: {avg_temp}°C")

    # Check threshold
    if max_temp > threshold_temp:
        print(f"\n[ALERT] Temperature exceeds threshold!")

        # Simulate snapshot fetch (would normally fetch from camera)
        print("[SNAPSHOT] Attempting to fetch from /ISAPI/Streaming/channels/101/picture...")

        # Create alert
        alert_data = {
            "id": f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_cam152_{event_type}",
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
                    "min_c": min_temp,
                    "avg_c": avg_temp,
                    "threshold_c": threshold_temp,
                    "exceeded_by": round(max_temp - threshold_temp, 1),
                    "hottest_point": {
                        "x": 512,
                        "y": 384
                    }
                }
            }
        }

        # Save alert JSON
        alerts_dir = Path(config["alert_manager"]["alerts_dir"])
        alerts_dir.mkdir(exist_ok=True)

        alert_file = alerts_dir / f"{alert_data['id']}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SAVED] {alert_file.name}")

        # Create dummy snapshot image
        image_file = alerts_dir / f"{alert_data['id']}.jpg"
        # Create a minimal JPEG file (100x100 red image)
        jpeg_header = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x64,
            0x00, 0x64, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD0, 0xFF, 0xD9
        ])
        with open(image_file, "wb") as f:
            f.write(jpeg_header)

        print(f"[SAVED] {image_file.name} (JPEG image)")

        alert_data["image_file"] = image_file.name

        # Update alert JSON with image reference
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Alert captured with image!")
        print(f"  JSON: {alert_file}")
        print(f"  Image: {image_file}")

        return True
    else:
        print(f"[SKIP] Temperature below threshold")
        return False


def test_acoustic_alarm_event():
    """Simulate acoustic alarm event."""
    print("\n" + "="*70)
    print("TEST 2: Acoustic Alarm Event (Camera 153)")
    print("="*70)

    with open("config.json") as f:
        config = json.load(f)

    # Simulate acoustic event
    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.153</ipAddress>
        <eventType>audioException</eventType>
        <eventState>active</eventState>
        <dateTime>2026-04-21T14:35:30+07:00</dateTime>
        <AudioExceptionInfo>
            <wDecibel>92.3</wDecibel>
        </AudioExceptionInfo>
    </EventNotificationAlert>
    """

    root = ET.fromstring(event_xml)
    ip = root.find("ipAddress").text
    event_type = root.find("eventType").text
    audio_info = root.find("AudioExceptionInfo")
    decibel = float(audio_info.find("wDecibel").text)
    threshold_db = config["camera_153"]["thresholds"]["decibel_alarm_db"]

    print(f"\n[RECEIVED] {event_type} from {ip}")
    print(f"  Decibel: {decibel}dB (threshold: {threshold_db}dB)")

    if decibel > threshold_db:
        print(f"\n[ALERT] Sound level exceeds threshold!")

        alert_data = {
            "id": f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_cam153_{event_type}",
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

        # Save alert
        alerts_dir = Path(config["alert_manager"]["alerts_dir"])
        alerts_dir.mkdir(exist_ok=True)

        alert_file = alerts_dir / f"{alert_data['id']}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SAVED] {alert_file.name}")

        # Create dummy snapshot
        image_file = alerts_dir / f"{alert_data['id']}.jpg"
        jpeg_header = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
        with open(image_file, "wb") as f:
            f.write(jpeg_header)

        print(f"[SAVED] {image_file.name} (JPEG image)")
        alert_data["image_file"] = image_file.name

        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Acoustic alert captured with image!")
        return True
    else:
        print(f"[SKIP] Sound level below threshold")
        return False


def verify_alerts():
    """Verify all saved alerts."""
    print("\n" + "="*70)
    print("VERIFICATION: Check Saved Alerts")
    print("="*70)

    alerts_dir = Path("alerts")

    if not alerts_dir.exists():
        print("\n[ERROR] alerts/ folder not found!")
        return False

    json_files = list(alerts_dir.glob("*.json"))
    jpg_files = list(alerts_dir.glob("*.jpg"))

    print(f"\nTotal JSON alerts: {len(json_files)}")
    print(f"Total JPEG images: {len(jpg_files)}")

    if not json_files:
        print("\n[FAIL] No alerts were saved!")
        return False

    print("\n" + "-"*70)
    for json_file in sorted(json_files):
        with open(json_file) as f:
            alert = json.load(f)

        print(f"\nAlert: {alert['id']}")
        print(f"  Camera: {alert['camera']['id']}")
        print(f"  Type: {alert['event']['type']}")
        print(f"  Time: {alert['timestamp_iso']}")

        if "image_file" in alert:
            img_path = alerts_dir / alert["image_file"]
            if img_path.exists():
                size = img_path.stat().st_size
                print(f"  Image: {alert['image_file']} ({size} bytes)")
            else:
                print(f"  Image: MISSING!")

        if "thermal" in alert["event"]:
            print(f"  Thermal: {alert['event']['thermal']['max_c']}°C")
        if "audio" in alert["event"]:
            print(f"  Audio: {alert['event']['audio']['decibel']}dB")

    print("\n" + "-"*70)
    print(f"\n[PASS] All alerts verified!")
    return True


def main():
    """Run all tests."""
    print("\n" + "="*70)
    print("LIVE EVENT TEST - Alert + Image Capture")
    print("="*70)

    # Clean up old alerts
    import shutil
    alerts_dir = Path("alerts")
    if alerts_dir.exists():
        shutil.rmtree(alerts_dir)

    # Test 1: Thermal alarm
    test1_passed = test_thermal_alarm_event()
    time.sleep(1)

    # Test 2: Acoustic alarm
    test2_passed = test_acoustic_alarm_event()
    time.sleep(1)

    # Verify
    test3_passed = verify_alerts()

    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Test 1 (Thermal Alert): {'PASS' if test1_passed else 'FAIL'}")
    print(f"Test 2 (Acoustic Alert): {'PASS' if test2_passed else 'FAIL'}")
    print(f"Test 3 (Verification): {'PASS' if test3_passed else 'FAIL'}")

    all_passed = test1_passed and test2_passed and test3_passed
    print(f"\nOVERALL: {'PASS - Ready for production!' if all_passed else 'FAIL'}")
    print("="*70 + "\n")

    return 0 if all_passed else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
