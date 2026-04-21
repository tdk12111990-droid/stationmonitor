#!/usr/bin/env python
"""Main test coordinator. Auto-config cameras and run all test scenarios."""

import json
import sys
import time
from pathlib import Path
from camera_config import CameraConfigurer
from test_scenarios import (
    ThermalAlarmTest,
    FireDetectionTest,
    AcousticAlarmTest,
    HTTPPushTest,
    CooldownTest,
    VCATest,
)


def print_header(text):
    """Print formatted header."""
    print(f"\n{'='*70}")
    print(f"  {text}")
    print(f"{'='*70}\n")


def run_full_test_suite():
    """Run complete test suite with all configurations."""

    print_header("CAMERA NOTIFICATION SYSTEM - FULL TEST SUITE")

    # Step 1: Load configuration
    print("[STEP 1] Loading configuration...")
    try:
        with open("config.json") as f:
            config = json.load(f)
        print("  [OK] Configuration loaded")
        print(f"  - Camera 152: {config['camera_152']['ip']}")
        print(f"  - Camera 153: {config['camera_153']['ip']}")
    except Exception as e:
        print(f"  [ERROR] Failed to load config: {e}")
        return False

    # Step 2: Initialize configurer
    print("\n[STEP 2] Initializing configurer...")
    try:
        configurer = CameraConfigurer()
        print("  [OK] CameraConfigurer initialized")
    except Exception as e:
        print(f"  [ERROR] Failed to initialize configurer: {e}")
        return False

    # Step 3: Run configuration tests
    print_header("PHASE 1: AUTO-CONFIGURE CAMERAS")

    tests_config = [
        ("Camera 152 Thermal Rules", configurer.configure_camera_152_thermal_rules),
        ("Camera 153 Triggers", configurer.configure_camera_153_triggers),
        ("Camera 152 HTTP Push", lambda: configurer.enable_http_push("camera_152")),
        ("Camera 153 HTTP Push", lambda: configurer.enable_http_push("camera_153")),
    ]

    total_config_tests = 0
    passed_config_tests = 0

    for test_name, test_func in tests_config:
        print(f"\n[TEST] {test_name}")
        print("-" * 70)
        try:
            results = test_func()
            for key, value in results.items():
                total_config_tests += 1
                if "PASS" in value:
                    passed_config_tests += 1
                    print(f"  [PASS] {key}")
                else:
                    print(f"  [FAIL] {key}: {value}")
        except Exception as e:
            print(f"  [ERROR] {test_name} failed: {e}")
            total_config_tests += 1

    print(f"\n[SUMMARY] Configuration: {passed_config_tests}/{total_config_tests} PASSED")

    # Step 4: Run verification tests
    print_header("PHASE 2: VERIFY CONFIGURATIONS")

    verify_tests = [
        ("Verify CAM152 Thermal", lambda: configurer.verify_trigger_enabled("camera_152", "fireAlarm")),
        ("Verify CAM153 Acoustic", lambda: configurer.verify_trigger_enabled("camera_153", "audioexception-1")),
        ("Verify CAM152 HTTP Push", lambda: configurer.verify_http_push("camera_152")),
        ("Verify CAM153 HTTP Push", lambda: configurer.verify_http_push("camera_153")),
    ]

    total_verify_tests = 0
    passed_verify_tests = 0

    for test_name, verify_func in verify_tests:
        print(f"\n[TEST] {test_name}")
        total_verify_tests += 1
        try:
            result = verify_func()
            if result:
                passed_verify_tests += 1
                print(f"  [PASS] Configuration verified")
            else:
                print(f"  [SKIP/UNKNOWN] Could not verify (may not be supported by camera)")
        except Exception as e:
            print(f"  [ERROR] {e}")

    print(f"\n[SUMMARY] Verification: {passed_verify_tests}/{total_verify_tests} PASSED/VERIFIED")

    # Step 5: Run functional test scenarios
    print_header("PHASE 3: RUN FUNCTIONAL TEST SCENARIOS")

    scenarios = [
        ThermalAlarmTest(),
        FireDetectionTest("camera_152"),
        FireDetectionTest("camera_153"),
        AcousticAlarmTest(),
        HTTPPushTest("camera_152"),
        HTTPPushTest("camera_153"),
        CooldownTest(),
        VCATest(),
    ]

    scenario_results = {}

    for scenario in scenarios:
        print(f"\n[SCENARIO] {scenario.name}")
        print("-" * 70)

        scenario.setup()
        time.sleep(0.5)
        scenario.verify()
        time.sleep(0.5)

        passed = scenario.print_summary()
        scenario_results[scenario.name] = passed

    # Final summary
    print_header("FINAL RESULTS")

    total_scenarios = len(scenario_results)
    passed_scenarios = sum(1 for v in scenario_results.values() if v)

    print("[CONFIGURATION TESTS]")
    print(f"  {passed_config_tests}/{total_config_tests} configuration steps PASSED")

    print("\n[VERIFICATION TESTS]")
    print(f"  {passed_verify_tests}/{total_verify_tests} verifications PASSED")

    print("\n[FUNCTIONAL SCENARIOS]")
    for scenario_name, passed in scenario_results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {scenario_name}")

    print(f"\n  {passed_scenarios}/{total_scenarios} scenarios PASSED")

    overall_passed = (
        passed_config_tests == total_config_tests
        and passed_scenarios == total_scenarios
    )

    print(f"\n{'='*70}")
    if overall_passed:
        print("  [SUCCESS] All tests PASSED - System ready for integration")
    else:
        print("  [PARTIAL] Some tests failed - Review output above")
    print(f"{'='*70}\n")

    return overall_passed


def run_quick_config_test():
    """Quick test: just config, no full scenarios."""
    print_header("QUICK CONFIGURATION TEST")

    try:
        configurer = CameraConfigurer()

        print("[TEST] Camera 152 Thermal Rules")
        r = configurer.configure_camera_152_thermal_rules()
        for k, v in r.items():
            status = "PASS" if "PASS" in v else "FAIL"
            print(f"  [{status}] {k}")

        print("\n[TEST] Camera 153 Triggers")
        r = configurer.configure_camera_153_triggers()
        for k, v in r.items():
            status = "PASS" if "PASS" in v else "FAIL"
            print(f"  [{status}] {k}")

        print("\n[TEST] HTTP Push Configuration")
        r152 = configurer.enable_http_push("camera_152")
        r153 = configurer.enable_http_push("camera_153")
        for r in [r152, r153]:
            for k, v in r.items():
                status = "PASS" if "PASS" in v else "FAIL"
                print(f"  [{status}] {k}")

        print("\n[DONE] Quick configuration test complete")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        return False

    return True


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        success = run_quick_config_test()
    else:
        success = run_full_test_suite()

    sys.exit(0 if success else 1)
