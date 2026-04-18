#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script: Connect to actual camera and listen to event stream
Prove camera supports fire/smoke/motion events
"""
import sys
import os
import requests
import base64
import time
from datetime import datetime
from requests.auth import HTTPDigestAuth

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Camera config
CAMERA_IP = os.getenv("CAMERA_IP", "192.168.10.152")
CAMERA_USER = os.getenv("CAMERA_USER", "admin")
CAMERA_PASSWORD = os.getenv("CAMERA_PASSWORD", "Demo@2024")

print("=" * 70)
print("TEST: CAMERA EVENT STREAM (Real camera test)")
print("=" * 70)
print(f"\nCamera IP: {CAMERA_IP}")
print(f"User: {CAMERA_USER}")

# Test 1: Check if camera is reachable
print("\n[TEST 1] Check if camera is online...")
try:
    resp = requests.get(f"http://{CAMERA_IP}/ISAPI/System/deviceInfo",
                       auth=HTTPDigestAuth(CAMERA_USER, CAMERA_PASSWORD),
                       timeout=5)
    if resp.status_code == 200:
        print(f"  [OK] Camera online - HTTP {resp.status_code}")
    else:
        print(f"  [FAIL] Camera not responding - HTTP {resp.status_code}")
        sys.exit(1)
except Exception as e:
    print(f"  [FAIL] Cannot connect: {e}")
    print(f"         Verify IP {CAMERA_IP} is correct")
    sys.exit(1)

# Test 2: Check event stream endpoint
print("\n[TEST 2] Check event stream endpoint exists...")
try:
    url = f"http://{CAMERA_IP}/ISAPI/Event/notification/alertStream"

    print(f"  Connecting to: {url}")
    resp = requests.get(url,
                       auth=HTTPDigestAuth(CAMERA_USER, CAMERA_PASSWORD),
                       stream=True,
                       timeout=3)

    if resp.status_code == 200:
        print(f"  [OK] Event stream endpoint FOUND! HTTP {resp.status_code}")
        print(f"  [OK] Content-Type: {resp.headers.get('Content-Type', 'N/A')}")
        print(f"  [OK] Camera HAS event stream support!")
    else:
        print(f"  [FAIL] Endpoint not available - HTTP {resp.status_code}")
        print(f"         Camera may not support event stream")
        sys.exit(1)

except requests.exceptions.Timeout:
    print(f"  [WARN] Timeout (normal - stream waiting for events)")
except requests.exceptions.ConnectionError as e:
    print(f"  [FAIL] Connection error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"  [FAIL] Error: {e}")
    sys.exit(1)

# Test 3: Listen for actual events (30 seconds)
print("\n[TEST 3] Listen for events (30 seconds)...")
print("  TIP: Trigger fire/smoke/motion detection on camera to see events")
print()

try:
    url = f"http://{CAMERA_IP}/ISAPI/Event/notification/alertStream"

    resp = requests.get(url,
                       auth=HTTPDigestAuth(CAMERA_USER, CAMERA_PASSWORD),
                       stream=True,
                       timeout=35)

    print(f"  Connected! Status: {resp.status_code}")
    print(f"  Content-Type: {resp.headers.get('Content-Type', 'N/A')}")
    print()
    print("  Waiting for events... (30 second timeout)")
    print("  " + "=" * 60)

    event_buffer = []
    start_time = time.time()
    event_count = 0

    for line in resp.iter_lines(decode_unicode=True):
        elapsed = time.time() - start_time

        # Timeout after 30 seconds
        if elapsed > 30:
            print(f"\n  Timeout 30 seconds, stopping listen")
            break

        if line is None:
            continue

        # Find boundary (end of event)
        if line.startswith("--boundary") or line.startswith("--hikdata") or line.startswith("--"):
            if event_buffer:
                event_xml = "\n".join(event_buffer)
                event_count += 1

                print(f"\n[EVENT #{event_count}] @ {datetime.now().strftime('%H:%M:%S')}")
                print(f"  {'-'*56}")

                # Parse fields
                lines = event_xml.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line or line.startswith('Content-'):
                        continue

                    if '<eventType>' in line:
                        et = line.replace('<eventType>', '').replace('</eventType>', '').strip()
                        print(f"  eventType: {et}")
                    elif '<eventState>' in line:
                        es = line.replace('<eventState>', '').replace('</eventState>', '').strip()
                        print(f"  eventState: {es}")
                    elif '<eventId>' in line:
                        eid = line.replace('<eventId>', '').replace('</eventId>', '').strip()
                        print(f"  eventId: {eid}")
                    elif '<dateTime>' in line:
                        dt = line.replace('<dateTime>', '').replace('</dateTime>', '').strip()
                        print(f"  dateTime: {dt}")
                    elif '<aiEventType>' in line:
                        ai = line.replace('<aiEventType>', '').replace('</aiEventType>', '').strip()
                        print(f"  aiEventType: {ai} <<<")
                    elif '<eventDescription>' in line:
                        desc = line.replace('<eventDescription>', '').replace('</eventDescription>', '').strip()
                        if len(desc) > 60:
                            print(f"  description: {desc[:60]}...")
                        else:
                            print(f"  description: {desc}")

                event_buffer = []
        else:
            if line.strip() and not line.startswith("Content-"):
                event_buffer.append(line)

        # Show progress
        sys.stdout.write(f"\r  Elapsed: {int(elapsed)}s, Events: {event_count}  ")
        sys.stdout.flush()

    print(f"\n  {'-'*60}")
    print()

    if event_count == 0:
        print(f"[WARN] No events received in 30 seconds")
        print(f"       Possible reasons:")
        print(f"       1. Camera AI detection is disabled")
        print(f"       2. No events occurred (test fire/smoke/motion)")
        print(f"       3. Event stream not streaming properly")
    else:
        print(f"[PASS] Received {event_count} events from camera!")
        print(f"       Camera SUPPORTS event stream!")

except requests.exceptions.Timeout:
    print(f"\n[INFO] Timeout after 30 seconds (NORMAL - no events occurred)")
except Exception as e:
    print(f"\n[FAIL] Error: {e}")

print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"""
If you see:
  PASS: Event stream endpoint FOUND! HTTP 200
        Camera HAS event stream support!
  PASS: Received N events from camera!
        Event stream WORKS!

If no events received:
  - Trigger fire/smoke on camera (if available)
  - Or trigger motion (wave hand in front)
  - Event stream will show those events

If connection fails:
  - Check IP: {CAMERA_IP}
  - Check credentials: {CAMERA_USER} / (password in env)
  - Try: ping {CAMERA_IP}

NOTE: Event stream is real-time PUSH from camera
      Events appear automatically when detected
      No polling needed
""")
print("=" * 70)
