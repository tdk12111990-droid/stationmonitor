#!/usr/bin/env python3
"""
Diagnose camera ISAPI endpoint availability.
Tests multiple endpoints to find which ones work on each camera.
"""

import requests
from requests.auth import HTTPDigestAuth
import json
from typing import Dict, List
import time

# Hikvision ISAPI endpoints to test
ENDPOINTS = {
    "alertStream": {
        "path": "/ISAPI/Event/notification/alertStream",
        "method": "GET",
        "description": "Real-time alert stream (multipart)",
    },
    "eventsList": {
        "path": "/ISAPI/Event/notification/eventList",
        "method": "GET",
        "description": "Event list (polling-based)",
    },
    "notificationCaps": {
        "path": "/ISAPI/Event/notification",
        "method": "GET",
        "description": "Notification capabilities",
    },
    "systemInfo": {
        "path": "/ISAPI/System/deviceInfo",
        "method": "GET",
        "description": "Device info (verify connectivity)",
    },
    "capabilities": {
        "path": "/ISAPI/System/capabilities",
        "method": "GET",
        "description": "System capabilities",
    },
}


def test_endpoint(ip: str, port: int, user: str, password: str, endpoint_info: Dict) -> Dict:
    """Test a single endpoint and return result."""
    url = f"http://{ip}:{port}{endpoint_info['path']}"
    method = endpoint_info['method']
    description = endpoint_info['description']

    result = {
        "url": url,
        "description": description,
        "status": None,
        "status_code": None,
        "response_type": None,
        "error": None,
        "headers": {},
    }

    try:
        auth = HTTPDigestAuth(user, password)

        if method == "GET":
            response = requests.get(
                url,
                auth=auth,
                stream=False,
                timeout=5,
                allow_redirects=False,
            )

        result["status_code"] = response.status_code
        result["headers"] = dict(response.headers)
        result["response_type"] = response.headers.get("content-type", "unknown")

        if response.status_code == 200:
            result["status"] = "✅ OK"
        elif response.status_code in [401, 403]:
            result["status"] = "❌ AUTH FAILED"
            result["error"] = f"Status {response.status_code}"
        elif response.status_code == 404:
            result["status"] = "❌ NOT FOUND"
            result["error"] = "Endpoint does not exist on this camera"
        elif response.status_code >= 400:
            result["status"] = "⚠️  ERROR"
            result["error"] = f"Status {response.status_code}"
        else:
            result["status"] = f"⚠️  RESPONSE {response.status_code}"

        # Try to get first 200 bytes of response for debugging
        try:
            content_preview = response.text[:200] if response.text else "(empty)"
            result["preview"] = content_preview
        except:
            result["preview"] = "(binary or non-text)"

    except requests.exceptions.Timeout:
        result["status"] = "❌ TIMEOUT"
        result["error"] = "No response after 5 seconds"
    except requests.exceptions.ConnectionError as e:
        result["status"] = "❌ CONNECTION ERROR"
        result["error"] = str(e)[:100]
    except Exception as e:
        result["status"] = "❌ ERROR"
        result["error"] = f"{type(e).__name__}: {str(e)[:100]}"

    return result


def diagnose_camera(ip: str, port: int, user: str, password: str, name: str):
    """Diagnose all endpoints for a camera."""
    print(f"\n{'='*70}")
    print(f"  DIAGNOSTICS: {name} ({ip}:{port})")
    print(f"{'='*70}\n")

    results = []
    for endpoint_key, endpoint_info in ENDPOINTS.items():
        print(f"Testing {endpoint_key}...", end=" ", flush=True)
        result = test_endpoint(ip, port, user, password, endpoint_info)
        results.append((endpoint_key, result))

        print(result["status"])
        if result["status_code"]:
            print(f"  → Status: {result['status_code']}, Type: {result['response_type']}")
        if result["error"]:
            print(f"  → Error: {result['error']}")
        if result.get("preview"):
            print(f"  → Preview: {result['preview'][:80]}")

        time.sleep(0.5)  # Avoid hammering the camera

    print(f"\n{'─'*70}\nSummary for {name}:")
    print(f"{'─'*70}\n")

    working = [r for e, r in results if r["status"] and "✅" in r["status"]]
    print(f"Working endpoints: {len(working)}/{len(results)}")

    if working:
        print("\n✅ WORKING ENDPOINTS:")
        for e, r in results:
            if "✅" in r["status"]:
                print(f"  • {e}: {r['description']}")
                print(f"    {r['url']}")

    not_found = [r for e, r in results if "NOT FOUND" in r["status"]]
    if not_found:
        print(f"\n❌ NOT FOUND ({len(not_found)}):")
        for e, r in results:
            if "NOT FOUND" in r["status"]:
                print(f"  • {e}")

    errors = [r for e, r in results if "ERROR" in r["status"] and "✅" not in r["status"]]
    if errors:
        print(f"\n⚠️  ERRORS ({len(errors)}):")
        for e, r in results:
            if "ERROR" in r["status"] and "✅" not in r["status"]:
                print(f"  • {e}: {r['error']}")

    return results


def main():
    """Load config and diagnose both cameras."""
    try:
        with open("config.json", "r") as f:
            config = json.load(f)
    except FileNotFoundError:
        print("❌ config.json not found!")
        return 1

    print("\n" + "="*70)
    print("  CAMERA ISAPI ENDPOINT DIAGNOSTIC")
    print("="*70)
    print("\nThis script tests which ISAPI endpoints are available on each camera.")
    print("It will help identify which notification mechanism to use.\n")

    all_results = {}

    # Test Camera 152
    if config["camera_152"].get("enabled", True):
        cam152_config = config["camera_152"]
        results_152 = diagnose_camera(
            cam152_config["ip"],
            cam152_config.get("port", 8000),
            cam152_config["user"],
            cam152_config["password"],
            "Camera 152 (Thermal+Optical)"
        )
        all_results["cam152"] = results_152

    # Test Camera 153
    if config["camera_153"].get("enabled", True):
        cam153_config = config["camera_153"]
        results_153 = diagnose_camera(
            cam153_config["ip"],
            cam153_config.get("port", 8000),
            cam153_config["user"],
            cam153_config["password"],
            "Camera 153 (Acoustic+Fire)"
        )
        all_results["cam153"] = results_153

    # Final recommendations
    print(f"\n{'='*70}")
    print("  RECOMMENDATIONS")
    print(f"{'='*70}\n")

    for camera_name, results in all_results.items():
        working = [r for e, r in results if r["status"] and "✅" in r["status"]]

        if working:
            print(f"✅ {camera_name.upper()}: Alert stream is reachable")
            print(f"   → Use: alertStream endpoint")
            print(f"   → Code: Python requests.get() with HTTPDigestAuth")
        else:
            print(f"❌ {camera_name.upper()}: Alert stream NOT reachable")
            print(f"   → Possible issues:")
            print(f"      1. ISAPI AlertStream not enabled in camera web UI")
            print(f"      2. Camera firmware doesn't support ISAPI (use SDK instead)")
            print(f"      3. Network/firewall blocking port 8000")
            print(f"      4. Wrong IP address or credentials")
            print(f"   → Next steps:")
            print(f"      1. Check camera web UI: http://{camera_name}.ip:8000")
            print(f"      2. Look for Event → Notification → AlertStream settings")
            print(f"      3. Enable it or check if SDK mode is available")

    print(f"\n{'='*70}\n")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
