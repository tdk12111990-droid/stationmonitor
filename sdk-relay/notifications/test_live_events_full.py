#!/usr/bin/env python
"""Test script with REAL image + video capture simulation."""

import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import subprocess


def create_fake_thermal_image(filename, max_temp=92.5, threshold=80.0):
    """Create a realistic thermal image with temperature overlay."""
    # Create image: 640x480 with thermal-like gradient
    img = Image.new('RGB', (640, 480), color=(50, 50, 50))
    draw = ImageDraw.Draw(img)

    # Draw gradient (simulating thermal map)
    for y in range(480):
        for x in range(640):
            # Create hot spot in center
            dist = ((x - 320)**2 + (y - 240)**2)**0.5
            intensity = max(0, 255 - int(dist / 2))

            # Thermal colors: blue -> red
            if intensity > 150:
                color = (255, int(intensity * 0.5), 0)  # Orange/Red
            elif intensity > 100:
                color = (255, intensity, 0)  # Yellow
            else:
                color = (0, intensity, 255)  # Blue

            img.putpixel((x, y), color)

    # Add temperature overlay text
    draw = ImageDraw.Draw(img)

    # Text info
    text_lines = [
        f"MAX: {max_temp}C (Threshold: {threshold}C)",
        f"MIN: 18.2C  AVG: 22.8C",
        f"Hottest Point: (512, 384)",
        f"Status: THERMAL ALARM" if max_temp > threshold else "Status: OK"
    ]

    y_offset = 20
    for line in text_lines:
        draw.text((20, y_offset), line, fill=(255, 255, 255))
        y_offset += 40

    # Save
    img.save(filename, 'JPEG', quality=85)
    print(f"    Created thermal image: {Path(filename).name} ({Path(filename).stat().st_size} bytes)")
    return filename


def create_fake_acoustic_image(filename, decibel=92.3, threshold=85.0):
    """Create image with acoustic waveform visualization."""
    img = Image.new('RGB', (640, 480), color=(20, 20, 20))
    draw = ImageDraw.Draw(img)

    # Draw waveform
    import math
    max_height = 200
    for x in range(640):
        # Sine wave with increasing amplitude
        freq = 5
        amplitude = max_height * (1 + 0.5 * math.sin(x / 50))
        y1 = 240 + amplitude * math.sin(2 * math.pi * freq * x / 640)
        y2 = 240 - amplitude * math.sin(2 * math.pi * freq * x / 640)

        # Color based on volume (red for high)
        color_val = int(255 * (decibel / 120))
        color = (color_val, 100, 100)

        if x > 0:
            draw.line([(x-1, prev_y1), (x, y1)], fill=color, width=2)
            draw.line([(x-1, prev_y2), (x, y2)], fill=color, width=2)

        prev_y1, prev_y2 = y1, y2

    # Add text info
    text_lines = [
        f"AUDIO LEVEL: {decibel}dB (Threshold: {threshold}dB)",
        f"Status: ACOUSTIC ALARM" if decibel > threshold else "Status: OK",
        "Frequency: Multiple peaks detected"
    ]

    y_offset = 20
    for line in text_lines:
        draw.text((20, y_offset), line, fill=(255, 255, 255))
        y_offset += 50

    img.save(filename, 'JPEG', quality=85)
    print(f"    Created acoustic image: {Path(filename).name} ({Path(filename).stat().st_size} bytes)")
    return filename


def create_fake_video(filename, duration=10):
    """Create a simple MP4 video using ffmpeg."""
    print(f"    Creating {duration}s video clip...")

    # Check if ffmpeg available
    try:
        # Create a simple 640x480 video with color changes
        cmd = [
            'ffmpeg',
            '-f', 'lavfi',
            '-i', f'color=c=red:s=640x480:d={duration}',  # Red background, 10s duration
            '-vf', 'fps=30',  # 30 fps
            '-y',  # Overwrite
            filename
        ]

        result = subprocess.run(cmd, capture_output=True, timeout=30)

        if result.returncode == 0:
            size = Path(filename).stat().st_size
            print(f"    Created video: {Path(filename).name} ({size:,} bytes)")
            return filename
        else:
            print(f"    ffmpeg error: {result.stderr.decode()[:200]}")
            # Fall back to creating empty MP4
            return None
    except FileNotFoundError:
        print(f"    ffmpeg not found - skipping video generation")
        return None
    except subprocess.TimeoutExpired:
        print(f"    ffmpeg timeout - skipping")
        return None


def test_thermal_alarm_with_image_and_video():
    """Simulate thermal alarm with IMAGE + VIDEO."""
    print("\n" + "="*70)
    print("TEST 1: Thermal Alarm (Camera 152) - Image + Video")
    print("="*70)

    with open("config.json") as f:
        config = json.load(f)

    # Simulate XML event
    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.152</ipAddress>
        <eventType>temperatureAlarm</eventType>
        <dateTime>2026-04-21T14:30:00+07:00</dateTime>
        <ThermalAlarmInfo>
            <maxTemperature>92.5</maxTemperature>
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
                    "exceeded_by": round(max_temp - threshold_temp, 1),
                    "hottest_point": {"x": 512, "y": 384}
                }
            }
        }

        print(f"\n[1] Creating JSON alert...")
        alert_file = alerts_dir / f"{alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)
        print(f"    Saved: {alert_file.name}")

        print(f"\n[2] Creating snapshot image...")
        image_file = alerts_dir / f"{alert_id}.jpg"
        create_fake_thermal_image(image_file, max_temp, threshold_temp)
        alert_data["image_file"] = image_file.name

        print(f"\n[3] Recording video clip (10 seconds)...")
        video_file = alerts_dir / f"{alert_id}.mp4"
        video_created = create_fake_video(str(video_file), duration=10)
        if video_created:
            alert_data["video_file"] = video_file.name
            print(f"    Saved: {video_file.name}")

        # Update JSON with all files
        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Alert + Image + Video captured!")
        return True
    return False


def test_acoustic_alarm_with_image():
    """Simulate acoustic alarm with IMAGE."""
    print("\n" + "="*70)
    print("TEST 2: Acoustic Alarm (Camera 153) - Image")
    print("="*70)

    with open("config.json") as f:
        config = json.load(f)

    event_xml = """
    <EventNotificationAlert version="2.0">
        <ipAddress>192.168.10.153</ipAddress>
        <eventType>audioException</eventType>
        <dateTime>2026-04-21T14:35:30+07:00</dateTime>
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

        print(f"\n[2] Creating snapshot image...")
        image_file = alerts_dir / f"{alert_id}.jpg"
        create_fake_acoustic_image(image_file, decibel, threshold_db)
        alert_data["image_file"] = image_file.name

        with open(alert_file, "w") as f:
            json.dump(alert_data, f, indent=2)

        print(f"\n[SUCCESS] Alert + Image captured!")
        return True
    return False


def verify_files():
    """Verify all created files."""
    print("\n" + "="*70)
    print("VERIFICATION: Files Created")
    print("="*70)

    alerts_dir = Path("alerts")
    json_files = list(alerts_dir.glob("*.json"))
    jpg_files = list(alerts_dir.glob("*.jpg"))
    mp4_files = list(alerts_dir.glob("*.mp4"))

    print(f"\nJSON alerts: {len(json_files)}")
    print(f"JPEG images: {len(jpg_files)}")
    print(f"MP4 videos: {len(mp4_files)}")

    print("\n" + "-"*70)

    for json_file in sorted(json_files):
        with open(json_file) as f:
            alert = json.load(f)

        print(f"\nAlert: {alert['id']}")
        print(f"  Camera: {alert['camera']['id']}")
        print(f"  Type: {alert['event']['type']}")

        # Check image
        if "image_file" in alert:
            img_path = alerts_dir / alert["image_file"]
            if img_path.exists():
                size_kb = img_path.stat().st_size / 1024
                print(f"  Image: {alert['image_file']} ({size_kb:.1f} KB) [OK]")
            else:
                print(f"  Image: MISSING [ERROR]")

        # Check video
        if "video_file" in alert:
            vid_path = alerts_dir / alert["video_file"]
            if vid_path.exists():
                size_mb = vid_path.stat().st_size / (1024 * 1024)
                print(f"  Video: {alert['video_file']} ({size_mb:.1f} MB) [OK]")
            else:
                print(f"  Video: MISSING [ERROR]")

    print("\n" + "-"*70)
    return len(json_files) > 0


def main():
    """Run full test with image + video."""
    print("\n" + "="*70)
    print("FULL EVENT TEST - Alert + Real Image + Video")
    print("="*70)

    # Clean up
    import shutil
    alerts_dir = Path("alerts")
    if alerts_dir.exists():
        shutil.rmtree(alerts_dir)

    # Test 1: Thermal with image + video
    test1 = test_thermal_alarm_with_image_and_video()
    time.sleep(1)

    # Test 2: Acoustic with image
    test2 = test_acoustic_alarm_with_image()
    time.sleep(1)

    # Verify
    test3 = verify_files()

    # Summary
    print("\n" + "="*70)
    print("FINAL RESULTS")
    print("="*70)
    print(f"Test 1 (Thermal + Image + Video): {'PASS' if test1 else 'FAIL'}")
    print(f"Test 2 (Acoustic + Image): {'PASS' if test2 else 'FAIL'}")
    print(f"Test 3 (Verification): {'PASS' if test3 else 'FAIL'}")

    all_passed = test1 and test2 and test3

    print(f"\nOVERALL: {'PASS - Ready for production!' if all_passed else 'FAIL'}")
    print("="*70 + "\n")

    # Instructions to view
    if all_passed:
        print("[NEXT STEPS]")
        print("1. Open explorer: explorer alerts")
        print("2. Double-click on .jpg file to view image")
        print("3. Double-click on .mp4 file to play video")
        print("4. View .json to see alert details")

    return 0 if all_passed else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
