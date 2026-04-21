"""Test scenarios for camera notification system."""

import json
import time
import logging
from pathlib import Path
from camera_config import CameraConfigurer
from alert_manager import AlertManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


class TestScenario:
    """Base test scenario."""

    def __init__(self, name, camera_id, config_file="config.json"):
        self.name = name
        self.camera_id = camera_id
        with open(config_file) as f:
            self.config = json.load(f)
        self.configurer = CameraConfigurer(config_file)
        self.alert_mgr = AlertManager(self.config["alert_manager"])
        self.results = {"setup": {}, "verify": {}, "trigger": {}}

    def log_result(self, section, key, status, details=""):
        """Log test result."""
        self.results[section][key] = {"status": status, "details": details}
        symbol = "PASS" if status == "PASS" else "FAIL"
        print(f"    [{symbol}] {key}: {details}")

    def print_summary(self):
        """Print test summary."""
        print(f"\n{'='*60}")
        print(f"Test: {self.name}")
        print(f"Camera: {self.camera_id}")
        print(f"{'='*60}")

        total = passed = 0

        for section in ["setup", "verify", "trigger"]:
            if self.results[section]:
                print(f"\n{section.upper()}:")
                for key, result in self.results[section].items():
                    total += 1
                    if result["status"] == "PASS":
                        passed += 1
                        print(f"  [PASS] {key}")
                    else:
                        print(f"  [FAIL] {key}: {result['details']}")

        print(f"\nResult: {passed}/{total} PASSED")
        return passed == total


class ThermalAlarmTest(TestScenario):
    """Test thermal alarm configuration (Camera 152)."""

    def __init__(self):
        super().__init__("Thermal Alarm Test", "camera_152")

    def setup(self):
        """Configure thermal rules."""
        logger.info("[TEST] Starting thermal alarm setup...")
        r = self.configurer.configure_camera_152_thermal_rules()
        for k, v in r.items():
            status = "PASS" if "PASS" in v else "FAIL"
            self.log_result("setup", k, status, v)

    def verify(self):
        """Verify configuration."""
        logger.info("[TEST] Verifying thermal config...")
        import requests
        cam = self.config["camera_152"]
        ip, user, passwd = cam["ip"], cam["username"], cam["password"]

        try:
            resp = requests.get(
                f"http://{ip}:8000/ISAPI/Thermal/channels/2/thermometry/basicParam",
                auth=(user, passwd), timeout=5
            )
            status = "PASS" if resp.status_code == 200 else "FAIL"
            self.log_result("verify", "get_thermal_basicparam", status, f"HTTP {resp.status_code}")
        except Exception as e:
            self.log_result("verify", "get_thermal_basicparam", "FAIL", str(e))

    def trigger(self):
        """Simulate thermal event."""
        logger.info("[TEST] Thermal test ready. Bring heat source near Camera 152...")
        logger.info("[TEST] Waiting 30s for event...")
        time.sleep(30)


class FireDetectionTest(TestScenario):
    """Test fire detection."""

    def __init__(self, camera_id="camera_152"):
        super().__init__(f"Fire Detection Test ({camera_id})", camera_id)

    def setup(self):
        """Configure fire alarm rules."""
        if self.camera_id == "camera_152":
            r = self.configurer.configure_camera_152_thermal_rules()
            test_key = "enable_fireAlarm_trigger"
        else:
            r = self.configurer.configure_camera_153_triggers()
            test_key = "enable_fireDetection"

        for k, v in r.items():
            status = "PASS" if "PASS" in v else "FAIL"
            self.log_result("setup", k, status, v)

    def verify(self):
        """Verify fire trigger enabled."""
        trigger = "fireAlarm" if self.camera_id == "camera_152" else "fireDetection"
        is_enabled = self.configurer.verify_trigger_enabled(self.camera_id, trigger)
        status = "PASS" if is_enabled else "UNKNOWN"
        self.log_result("verify", f"trigger_{trigger}_enabled", status)


class AcousticAlarmTest(TestScenario):
    """Test acoustic alarm (Camera 153)."""

    def __init__(self):
        super().__init__("Acoustic Alarm Test", "camera_153")

    def setup(self):
        """Enable audioException trigger."""
        r = self.configurer.configure_camera_153_triggers()
        for k, v in r.items():
            if "audioexception" in k:
                status = "PASS" if "PASS" in v else "FAIL"
                self.log_result("setup", k, status, v)

    def verify(self):
        """Verify audioException enabled."""
        is_enabled = self.configurer.verify_trigger_enabled("camera_153", "audioexception-1")
        status = "PASS" if is_enabled else "UNKNOWN"
        self.log_result("verify", "audioexception_enabled", status)


class HTTPPushTest(TestScenario):
    """Test HTTP notification push configuration."""

    def __init__(self, camera_id="camera_152"):
        super().__init__(f"HTTP Push Test ({camera_id})", camera_id)

    def setup(self):
        """Configure HTTP host."""
        r = self.configurer.enable_http_push(self.camera_id)
        for k, v in r.items():
            status = "PASS" if "PASS" in v else "FAIL"
            self.log_result("setup", k, status, v)

    def verify(self):
        """Verify HTTP host configured."""
        is_configured = self.configurer.verify_http_push(self.camera_id)
        status = "PASS" if is_configured else "UNKNOWN"
        self.log_result("verify", "http_push_configured", status)


class CooldownTest(TestScenario):
    """Test cooldown mechanism."""

    def __init__(self):
        super().__init__("Cooldown Test", "camera_152")

    def setup(self):
        """Setup alert manager."""
        self.log_result("setup", "alert_manager_initialized", "PASS", "")

    def verify(self):
        """Test cooldown logic."""
        cooldown = self.config["camera_152"]["thresholds"]["cooldown_seconds"]

        result1 = self.alert_mgr.is_cooldown_active("cam152", "fireAlarm", cooldown)
        status1 = "PASS" if not result1 else "FAIL"
        self.log_result("verify", "first_call_not_in_cooldown", status1, f"result={result1}")

        result2 = self.alert_mgr.is_cooldown_active("cam152", "fireAlarm", cooldown)
        status2 = "PASS" if result2 else "FAIL"
        self.log_result("verify", "second_call_in_cooldown", status2, f"result={result2}")


class VCATest(TestScenario):
    """Test VCA (line detection)."""

    def __init__(self):
        super().__init__("VCA Test (Line Detection)", "camera_152")

    def setup(self):
        """Enable line detection trigger."""
        self.log_result("setup", "line_detection_not_yet_implemented", "SKIP", "")


def run_all_tests():
    """Run all test scenarios."""
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

    results_summary = {}

    for scenario in scenarios:
        print(f"\n{'#'*60}")
        print(f"# Running: {scenario.name}")
        print(f"{'#'*60}")

        scenario.setup()
        time.sleep(1)
        scenario.verify()

        passed = scenario.print_summary()
        results_summary[scenario.name] = passed

    print(f"\n{'='*60}")
    print("OVERALL RESULTS")
    print(f"{'='*60}")
    total_tests = len(results_summary)
    total_passed = sum(1 for v in results_summary.values() if v)

    for test_name, passed in results_summary.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {test_name}")

    print(f"\nTotal: {total_passed}/{total_tests} test scenarios PASSED")
    print("="*60)


if __name__ == "__main__":
    run_all_tests()
