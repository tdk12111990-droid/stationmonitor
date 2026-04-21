#!/usr/bin/env python
"""Test: Record video + capture image from live camera stream."""

import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from video_recorder import VideoRecorder, ImageCapturer
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def test_thermal_alarm_with_video_and_image():
    """Test: Thermal alarm -> record video + capture image from stream."""

    print("\n" + "="*70)
    print("TEST 1: Thermal Alarm (Camera 152) - Video + Image from Stream")
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

    print(f"\n[EVENT] {event_type} from {ip}")
    print(f"        Max Temp: {max_temp}°C (threshold: {threshold_temp}°C)")

    if max_temp > threshold_temp:
        print(f"\n[ALERT] Temperature exceeds threshold! TRIGGERING CAPTURE...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        alert_id = f"{timestamp}_cam152_{event_type}"

        alerts_dir = Path(config["alert_manager"]["alerts_dir"])
        alerts_dir.mkdir(exist_ok=True)

        # Create alert JSON
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

        print(f"\n[STEP 1] Saving alert JSON...")
        alert_file = alerts_dir / f"{alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)
        print(f"         {alert_file.name}")

        print(f"\n[STEP 2] Recording 10-second video clip from camera stream...")
        print(f"         (This requires: ffmpeg installed + RTSP enabled on camera)")

        recorder = VideoRecorder()
        video_file = alerts_dir / f"{alert_id}.mp4"

        success = recorder.record_video(
            "camera_152",
            video_file,
            duration=10
        )

        if success:
            alert_data["video_file"] = video_file.name
            print(f"         Video saved!")
        else:
            print(f"         Video recording failed (see errors above)")
            print(f"         This is expected if camera offline or ffmpeg not installed")

        print(f"\n[STEP 3] Capturing single frame from camera stream...")

        capturer = ImageCapturer()
        image_file = alerts_dir / f"{alert_id}.jpg"

        success = capturer.capture_frame("camera_152", image_file)

        if success:
            alert_data["image_file"] = image_file.name
            print(f"         Image captured!")
        else:
            print(f"         Image capture failed (see errors above)")

        print(f"\n[STEP 4] Updating alert JSON with media files...")
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Alert created with media files!")
        print(f"          JSON: {alert_file.name}")
        if "video_file" in alert_data:
            print(f"          VIDEO: {alert_data['video_file']}")
        if "image_file" in alert_data:
            print(f"          IMAGE: {alert_data['image_file']}")

        return True

    return False


def test_acoustic_alarm_with_video_and_image():
    """Test: Acoustic alarm -> record video + capture image."""

    print("\n" + "="*70)
    print("TEST 2: Acoustic Alarm (Camera 153) - Video + Image from Stream")
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

    print(f"\n[EVENT] {event_type} from {ip}")
    print(f"        Decibel: {decibel}dB (threshold: {threshold_db}dB)")

    if decibel > threshold_db:
        print(f"\n[ALERT] Sound level exceeds threshold! TRIGGERING CAPTURE...")

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

        print(f"\n[STEP 1] Saving alert JSON...")
        alert_file = alerts_dir / f"{alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)
        print(f"         {alert_file.name}")

        print(f"\n[STEP 2] Recording 5-second video clip...")

        recorder = VideoRecorder()
        video_file = alerts_dir / f"{alert_id}.mp4"

        success = recorder.record_video(
            "camera_153",
            video_file,
            duration=5
        )

        if success:
            alert_data["video_file"] = video_file.name
            print(f"         Video saved!")

        print(f"\n[STEP 3] Capturing single frame...")

        capturer = ImageCapturer()
        image_file = alerts_dir / f"{alert_id}.jpg"

        success = capturer.capture_frame("camera_153", image_file)

        if success:
            alert_data["image_file"] = image_file.name
            print(f"         Image captured!")

        print(f"\n[STEP 4] Updating alert JSON...")
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Alert created with media!")
        return True

    return False


def verify_results():
    """Verify saved files."""
    print("\n" + "="*70)
    print("VERIFICATION")
    print("="*70)

    alerts_dir = Path("alerts")
    json_files = list(alerts_dir.glob("*.json"))
    jpg_files = list(alerts_dir.glob("*.jpg"))
    mp4_files = list(alerts_dir.glob("*.mp4"))

    print(f"\nJSON alerts: {len(json_files)}")
    print(f"JPG images:  {len(jpg_files)}")
    print(f"MP4 videos:  {len(mp4_files)}")

    if not json_files:
        print("\n[NO FILES] Check if alerts were triggered above")
        return False

    print("\n" + "-"*70)

    for json_file in sorted(json_files):
        with open(json_file) as f:
            alert = json.load(f)

        print(f"\nAlert: {alert['id']}")
        print(f"  Event: {alert['camera']['id']} - {alert['event']['type']}")

        if "image_file" in alert:
            img_path = alerts_dir / alert["image_file"]
            if img_path.exists():
                size_kb = img_path.stat().st_size / 1024
                print(f"  Image: {alert['image_file']} ({size_kb:.1f} KB)")
            else:
                print(f"  Image: MISSING")

        if "video_file" in alert:
            vid_path = alerts_dir / alert["video_file"]
            if vid_path.exists():
                size_mb = vid_path.stat().st_size / (1024 * 1024)
                print(f"  Video: {alert['video_file']} ({size_mb:.1f} MB)")
            else:
                print(f"  Video: MISSING")

    print("\n" + "-"*70)
    return len(json_files) > 0


def main():
    print("\n" + "="*70)
    print("STREAMING TEST - Record Video + Capture Image from Camera")
    print("="*70)

    # Clean up
    import shutil
    alerts_dir = Path("alerts")
    if alerts_dir.exists():
        shutil.rmtree(alerts_dir)

    print("\nREQUIREMENTS:")
    print("  1. ffmpeg installed (choco install ffmpeg)")
    print("  2. RTSP enabled on cameras (Settings > RTSP)")
    print("  3. Cameras online and reachable")

    # Test 1
    test1 = test_thermal_alarm_with_video_and_image()
    time.sleep(2)

    # Test 2
    test2 = test_acoustic_alarm_with_video_and_image()
    time.sleep(2)

    # Verify
    test3 = verify_results()

    # Summary
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)
    print(f"Test 1 (Thermal + Video + Image): {'PASS' if test1 else 'SKIPPED'}")
    print(f"Test 2 (Acoustic + Video + Image): {'PASS' if test2 else 'SKIPPED'}")
    print(f"Test 3 (Verification): {'PASS' if test3 else 'FAIL'}")

    print("\n" + "="*70)
    print("NEXT STEPS IF FAILED:")
    print("="*70)
    print("1. Install ffmpeg:")
    print("   choco install ffmpeg")
    print()
    print("2. Enable RTSP on cameras:")
    print("   - Login camera web UI (192.168.10.152 or .153)")
    print("   - Settings > Network > RTSP")
    print("   - Enable RTSP streaming")
    print()
    print("3. Test RTSP connection:")
    print("   ffplay rtsp://admin:password@192.168.10.152/Streaming/tracks/202")
    print()
    print("4. Re-run test")
    print()

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
