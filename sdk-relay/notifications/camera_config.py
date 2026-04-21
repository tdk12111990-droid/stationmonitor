"""Camera config via ISAPI. Sets thermal rules, triggers, HTTP push."""

import json
import requests
import logging

logger = logging.getLogger(__name__)

class CameraConfigurer:
    """Configure cameras via ISAPI (PUT requests)."""

    def __init__(self, config_file="config.json"):
        with open(config_file) as f:
            self.config = json.load(f)

    def configure_camera_152_thermal_rules(self):
        """Configure Camera 152 thermal alarm rules via ISAPI."""
        cam = self.config["camera_152"]
        ip, user, passwd = cam["ip"], cam["user"], cam["password"]
        thermal_threshold = cam["thresholds"]["thermal_alarm_temp_c"]
        results = {}

        try:
            resp = requests.get(
                f"http://{ip}:8000/ISAPI/Thermal/channels/2/thermometry/basicParam",
                auth=(user, passwd), timeout=10
            )
            results["get_thermal_basicparam"] = "PASS" if resp.status_code == 200 else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["get_thermal_basicparam"] = f"FAIL ({str(e)})"

        # Set fireImageMode and temperature display
        try:
            payload = """<?xml version="1.0" encoding="UTF-8"?>
<BasicParam version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <fireImageMode>auto</fireImageMode>
  <displayMaxTemperatureEnabled>true</displayMaxTemperatureEnabled>
  <displayMinTemperatureEnabled>true</displayMinTemperatureEnabled>
</BasicParam>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Thermal/channels/2/thermometry/basicParam",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results["set_thermal_basicparam"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["set_thermal_basicparam"] = f"FAIL ({str(e)})"

        # Enable fireAlarm trigger
        try:
            payload = """<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <eventType>fireAlarm</eventType>
  <enabled>true</enabled>
</EventTrigger>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Event/triggers/fireAlarm",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results["enable_fireAlarm_trigger"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["enable_fireAlarm_trigger"] = f"FAIL ({str(e)})"

        return results

    def configure_camera_153_triggers(self):
        """Configure Camera 153 triggers."""
        cam = self.config["camera_153"]
        ip, user, passwd = cam["ip"], cam["user"], cam["password"]
        results = {}

        # audioException
        try:
            payload = """<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <eventType>audioexception</eventType>
  <enabled>true</enabled>
</EventTrigger>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Event/triggers/audioexception-1",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results["enable_audioexception"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["enable_audioexception"] = f"FAIL ({str(e)})"

        # fireDetection
        try:
            payload = """<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <eventType>fireDetection</eventType>
  <enabled>true</enabled>
</EventTrigger>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Event/triggers/fireDetection",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results["enable_fireDetection"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["enable_fireDetection"] = f"FAIL ({str(e)})"

        # dischargeDetection
        try:
            payload = """<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <eventType>dischargeDetection</eventType>
  <enabled>true</enabled>
</EventTrigger>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Event/triggers/dischargeDetection",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results["enable_dischargeDetection"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results["enable_dischargeDetection"] = f"FAIL ({str(e)})"

        return results

    def enable_http_push(self, camera_id, backend_ip="192.168.1.100", backend_port=5056):
        """Configure HTTP notification push for alerts."""
        cam = self.config.get(camera_id)
        if not cam:
            return {f"http_push_{camera_id}": "FAIL (not in config)"}

        ip, user, passwd = cam["ip"], cam["user"], cam["password"]
        results = {}

        try:
            payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotification version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <httpHost>
    <id>1</id>
    <ipAddress>{backend_ip}</ipAddress>
    <portNo>{backend_port}</portNo>
    <url>/api/v1/camera-webhook</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>XML</parameterFormatType>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </httpHost>
</HttpHostNotification>"""
            resp = requests.put(
                f"http://{ip}:8000/ISAPI/Event/notification/httpHosts/1",
                data=payload, auth=(user, passwd),
                headers={"Content-Type": "application/xml"}, timeout=10
            )
            results[f"http_push_{camera_id}"] = "PASS" if resp.status_code in [200, 201] else f"FAIL ({resp.status_code})"
        except Exception as e:
            results[f"http_push_{camera_id}"] = f"FAIL ({str(e)})"

        return results

    def verify_trigger_enabled(self, camera_id, trigger_name):
        """Verify trigger is enabled."""
        cam = self.config.get(camera_id)
        if not cam:
            return False
        ip, user, passwd = cam["ip"], cam["user"], cam["password"]
        try:
            resp = requests.get(
                f"http://{ip}:8000/ISAPI/Event/triggers/{trigger_name}",
                auth=(user, passwd), timeout=10
            )
            return resp.status_code == 200 and ("enabled>true" in resp.text.lower() or "<enabled>1</enabled>" in resp.text.lower())
        except:
            return False

    def verify_http_push(self, camera_id):
        """Verify HTTP push configured."""
        cam = self.config.get(camera_id)
        if not cam:
            return False
        ip, user, passwd = cam["ip"], cam["user"], cam["password"]
        try:
            resp = requests.get(
                f"http://{ip}:8000/ISAPI/Event/notification/httpHosts/1",
                auth=(user, passwd), timeout=10
            )
            return resp.status_code == 200 and "5056" in resp.text and "camera-webhook" in resp.text
        except:
            return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    configurer = CameraConfigurer()
    print("CameraConfigurer loaded")
