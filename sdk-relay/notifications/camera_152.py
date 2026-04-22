"""
Camera 152 listener — Thermal + Optical + Fire events via ISAPI AlertStream
"""

import requests
from requests.auth import HTTPDigestAuth
import xml.etree.ElementTree as ET
import logging
import time
from datetime import datetime
from threading import Thread, Event
from typing import Dict, Optional
from alert_manager import AlertManager

logger = logging.getLogger(__name__)


class Camera152Listener(Thread):
    """Listen to Camera 152 (Thermal+Optical) ISAPI alerts via HTTP stream."""

    def __init__(self, config: dict, alert_manager: AlertManager):
        """
        Args:
            config: camera_152 section from config.json
            alert_manager: AlertManager instance to save events
        """
        super().__init__(daemon=True)
        self.config = config
        self.alert_mgr = alert_manager

        self.ip = config["ip"]
        self.user = config["user"]
        self.password = config["password"]
        self.stream_url = f"http://{self.ip}:8000{config['isapi_alert_stream_url']}"
        self.thresholds = config["thresholds"]
        self.event_types = set(config["event_types"])

        self.stopped = Event()
        self._session: Optional[requests.Session] = None
        self.events_received = 0
        self.events_saved = 0

    def run(self):
        """Main listener loop."""
        while not self.stopped.is_set():
            try:
                self._listen_loop()
            except Exception as e:
                logger.error(f"[CAM152] Error in listen loop: {e}")
                time.sleep(self.config.get("reconnect_delay_seconds", 5))

    def _listen_loop(self):
        """Stream and parse ISAPI alerts."""
        auth = HTTPDigestAuth(self.user, self.password)

        try:
            logger.info(f"[CAM152] Connecting to {self.stream_url}...")
            r = requests.get(
                self.stream_url,
                auth=auth,
                stream=True,
                timeout=self.config.get("stream_timeout_seconds", 30),
            )

            if r.status_code != 200:
                logger.error(f"[CAM152] Stream returned {r.status_code}")
                return

            logger.info("[CAM152] ✅ AlertStream connected!")

            # Parse multipart stream (same pattern as cam 153)
            boundary = None
            buffer = b""

            for chunk in r.iter_content(chunk_size=4096):
                if chunk:
                    buffer += chunk

                    # Find boundary markers
                    while True:
                        if boundary is None:
                            # Look for first boundary
                            idx = buffer.find(b"--boundary")
                            if idx == -1:
                                idx = buffer.find(b"--hikdata")
                            if idx == -1:
                                break

                            boundary = buffer[idx : idx + 20].split(b"\r")[0]
                            logger.debug(f"[CAM152] Found boundary: {boundary}")
                            buffer = buffer[idx:]

                        # Find next boundary
                        next_idx = buffer.find(boundary, len(boundary))
                        if next_idx == -1:
                            break

                        # Extract chunk between boundaries
                        chunk_data = buffer[len(boundary) : next_idx]
                        buffer = buffer[next_idx:]

                        # Parse chunk (skip headers, get XML body)
                        if b"\r\n\r\n" in chunk_data:
                            xml_part = chunk_data.split(b"\r\n\r\n", 1)[1].strip()
                            if xml_part:
                                self._process_event(xml_part.decode("utf-8", errors="ignore"))

        except requests.exceptions.Timeout:
            logger.warning(f"[CAM152] Stream timeout (normal if no events)")
        except Exception as e:
            logger.error(f"[CAM152] Stream error: {e}")

    def _process_event(self, xml_str: str):
        """Parse XML event and check thresholds."""
        try:
            self.events_received += 1
            root = ET.fromstring(xml_str)

            # Get event type (handle namespace with wildcard)
            event_type_elem = root.find(".//{*}eventType")
            if event_type_elem is None or event_type_elem.text is None:
                logger.debug(f"[CAM152] No eventType in XML")
                return

            event_type = event_type_elem.text
            logger.info(f"[CAM152] Event #{self.events_received}: {event_type}")

            # Check if we care about this event type
            if event_type not in self.event_types:
                logger.debug(f"[CAM152] Ignoring event type: {event_type}")
                return

            # Parse event data
            event_data = self._extract_event_data(root, event_type, xml_str)

            # Check threshold
            if not self._check_threshold(event_type, event_data):
                logger.debug(f"[CAM152] {event_type} below threshold")
                return

            # Check cooldown
            cooldown = self.thresholds.get("cooldown_seconds", 300)
            if self.alert_mgr.is_cooldown_active("cam152", event_type, cooldown):
                logger.debug(f"[CAM152] {event_type} in cooldown")
                return

            # Save alert
            self.alert_mgr.save(
                camera_id="cam152",
                event_dict=event_data,
                camera_ip=self.ip,
                camera_user=self.user,
                camera_password=self.password,
            )
            self.events_saved += 1

            # Async: record video and post to backend (non-blocking)
            self._trigger_video_recording(event_type)

        except ET.ParseError as e:
            logger.debug(f"[CAM152] XML parse error: {e}")
        except Exception as e:
            logger.error(f"[CAM152] Error processing event: {e}")

    def _extract_event_data(self, root: ET.Element, event_type: str, raw_xml: str) -> dict:
        """Extract event details into structured format."""
        event_data = {
            "type": event_type,
            "source": "isapi_alertstream",
            "raw_xml": raw_xml[:500],  # Truncate for logging
        }

        if event_type == "temperatureAlarm":
            # Thermal over-temperature alarm
            event_data["thermal"] = self._extract_thermal_data(root)

        elif event_type in ["fireAlarm", "fireDetection"]:
            # Fire detection
            event_data["thermal"] = self._extract_thermal_data(root)
            event_data["fire"] = {
                "detected": True,
                "threshold_c": self.thresholds.get("fire_alarm_temp_c", 120.0),
            }

        elif event_type in ["smokeAlarm", "smokeDetection"]:
            # Smoke detection
            event_data["thermal"] = self._extract_thermal_data(root)
            event_data["smoke"] = {
                "detected": True,
            }

        elif event_type in ["lineDetection", "fieldDetection", "intrusion", "regionEntrance", "regionExiting"]:
            # VCA (Optical) events
            event_data["vca"] = {
                "event_type": event_type,
            }
            # Try to get location
            rect = root.find(".//{*}RegionCoordinatesList")
            if rect is not None:
                event_data["location"] = self._parse_coordinates(rect)

        return event_data

    def _extract_thermal_data(self, root: ET.Element) -> dict:
        """Extract thermal information from XML."""
        thermal = {}

        # Look for max/min/avg temperature
        max_temp = root.find(".//{*}maxTemperature")
        if max_temp is not None and max_temp.text:
            try:
                thermal["max_c"] = float(max_temp.text)
            except ValueError:
                pass

        min_temp = root.find(".//{*}minTemperature")
        if min_temp is not None and min_temp.text:
            try:
                thermal["min_c"] = float(min_temp.text)
            except ValueError:
                pass

        avg_temp = root.find(".//{*}averageTemperature")
        if avg_temp is not None and avg_temp.text:
            try:
                thermal["avg_c"] = float(avg_temp.text)
            except ValueError:
                pass

        current_temp = root.find(".//{*}fCurrTemperature")
        if current_temp is not None and current_temp.text:
            try:
                thermal["current_c"] = float(current_temp.text)
            except ValueError:
                pass

        # Thermal alarm info
        thermal_alarm = root.find(".//{*}ThermalAlarmInfo")
        if thermal_alarm is not None:
            rule_temp = thermal_alarm.find(".//{*}fRuleTemperature")
            if rule_temp is not None and rule_temp.text:
                try:
                    thermal["rule_threshold_c"] = float(rule_temp.text)
                except ValueError:
                    pass

        thermal["threshold_c"] = self.thresholds.get("thermal_alarm_temp_c", 80.0)

        # Try to get hottest point coordinates
        highest_point = root.find(".//{*}struHighestPoint")
        if highest_point is not None:
            coords = self._parse_point(highest_point)
            if coords:
                thermal["hottest_point"] = coords

        return thermal

    def _parse_point(self, point_elem: ET.Element) -> Optional[dict]:
        """Extract point coordinates from struPoint-like element."""
        point = {}
        try:
            x_elem = point_elem.find(".//{*}x")
            y_elem = point_elem.find(".//{*}y")
            if x_elem is not None and x_elem.text:
                point["x"] = float(x_elem.text)
            if y_elem is not None and y_elem.text:
                point["y"] = float(y_elem.text)
            if point:
                return point
        except (ValueError, AttributeError):
            pass
        return None

    def _parse_coordinates(self, rect_elem: ET.Element) -> dict:
        """Extract normalized coordinates from RegionCoordinatesList."""
        coords = {"x": None, "y": None, "width": None, "height": None}
        try:
            x_elem = rect_elem.find(".//{*}x")
            y_elem = rect_elem.find(".//{*}y")
            w_elem = rect_elem.find(".//{*}width")
            h_elem = rect_elem.find(".//{*}height")

            if x_elem is not None and x_elem.text:
                coords["x"] = float(x_elem.text)
            if y_elem is not None and y_elem.text:
                coords["y"] = float(y_elem.text)
            if w_elem is not None and w_elem.text:
                coords["width"] = float(w_elem.text)
            if h_elem is not None and h_elem.text:
                coords["height"] = float(h_elem.text)
        except (ValueError, AttributeError):
            pass
        return coords

    def _check_threshold(self, event_type: str, event_data: dict) -> bool:
        """Check if event crosses configured threshold."""
        if event_type == "temperatureAlarm":
            # Check if max/current temp exceeds threshold
            thermal = event_data.get("thermal", {})
            max_temp = thermal.get("max_c") or thermal.get("current_c")
            if max_temp is None:
                return True  # No threshold if missing data
            threshold = self.thresholds.get("thermal_alarm_temp_c", 80.0)
            return max_temp >= threshold

        elif event_type in ["fireAlarm", "fireDetection"]:
            # Fire temperature threshold is typically higher
            thermal = event_data.get("thermal", {})
            max_temp = thermal.get("max_c") or thermal.get("current_c")
            if max_temp is None:
                return True
            threshold = self.thresholds.get("fire_alarm_temp_c", 120.0)
            return max_temp >= threshold

        elif event_type in ["smokeAlarm", "smokeDetection"]:
            # Smoke detection typically doesn't have temperature threshold, accept it
            return True

        elif event_type in ["lineDetection", "fieldDetection", "intrusion", "regionEntrance", "regionExiting"]:
            # VCA events, accept all
            return True

        return True

    def _trigger_video_recording(self, event_type: str):
        """Trigger async video recording and upload to backend."""
        def record_and_post():
            try:
                from video_recorder import VideoRecorder
                recorder = VideoRecorder()
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                video_file = f"{self.alert_mgr.alerts_dir}/{timestamp}_cam152_{event_type}.mp4"

                logger.info(f"[CAM152] Recording 15s video to {video_file}...")
                success = recorder.record_video("camera_152", video_file, duration=15)

                if success:
                    logger.info(f"[CAM152] Video recorded, posting to backend...")
                    self.alert_mgr.post_video_to_backend(self.ip, video_file)
                else:
                    logger.warning(f"[CAM152] Video recording failed")
            except Exception as e:
                logger.error(f"[CAM152] Video recording error: {e}")

        # Start in background (daemon thread)
        Thread(target=record_and_post, daemon=True).start()

    def stop(self):
        """Stop listening."""
        logger.info("[CAM152] Stopping listener...")
        self.stopped.set()

    def status(self) -> str:
        """Return listener status."""
        return f"cam152: {self.events_received} rx, {self.events_saved} saved"
