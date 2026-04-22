"""
Camera 153 listener — Acoustic + Fire/Discharge events via ISAPI AlertStream
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


class Camera153Listener(Thread):
    """Listen to Camera 153 (phóng điện) ISAPI alerts via HTTP stream."""

    def __init__(self, config: dict, alert_manager: AlertManager):
        """
        Args:
            config: camera_153 section from config.json
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
                logger.error(f"[CAM153] Error in listen loop: {e}")
            # Always delay before reconnect — even if _listen_loop() swallowed the error
            if not self.stopped.is_set():
                delay = self.config.get("reconnect_delay_seconds", 5)
                logger.info(f"[CAM153] Reconnecting in {delay}s...")
                time.sleep(delay)

    def _listen_loop(self):
        """Stream and parse ISAPI alerts."""
        auth = HTTPDigestAuth(self.user, self.password)

        try:
            logger.info(f"[CAM153] Connecting to {self.stream_url}...")
            r = requests.get(
                self.stream_url,
                auth=auth,
                stream=True,
                timeout=self.config.get("stream_timeout_seconds", 30),
                headers={
                    "Accept": "multipart/x-mixed-replace, application/xml, */*",
                    "Connection": "keep-alive",
                    "User-Agent": "Mozilla/5.0 (compatible; Hikvision Client)",
                },
            )

            if r.status_code != 200:
                logger.error(f"[CAM153] Stream returned {r.status_code}")
                return

            logger.info("[CAM153] ✅ AlertStream connected!")

            # Parse multipart stream (similar to enhanced_relay.py)
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
                            logger.debug(f"[CAM153] Found boundary: {boundary}")
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
            logger.warning(f"[CAM153] Stream timeout (normal if no events)")
        except requests.exceptions.ConnectionError as e:
            logger.error(f"[CAM153] Connection error: {str(e)[:200]}")
        except Exception as e:
            logger.error(f"[CAM153] Stream error: {type(e).__name__} - {str(e)[:200]}", exc_info=True)

    def _process_event(self, xml_str: str):
        """Parse XML event and check thresholds."""
        try:
            self.events_received += 1
            root = ET.fromstring(xml_str)

            # Get event type (handle namespace with wildcard)
            event_type_elem = root.find(".//{*}eventType")
            if event_type_elem is None or event_type_elem.text is None:
                logger.debug(f"[CAM153] No eventType in XML")
                return

            event_type = event_type_elem.text
            logger.info(f"[CAM153] Event #{self.events_received}: {event_type}")

            # Check if we care about this event type
            if event_type not in self.event_types:
                logger.debug(f"[CAM153] Ignoring event type: {event_type}")
                return

            # Parse event data
            event_data = self._extract_event_data(root, event_type, xml_str)

            # Check threshold
            if not self._check_threshold(event_type, event_data):
                logger.debug(f"[CAM153] {event_type} below threshold")
                return

            # Check cooldown
            cooldown = self.thresholds.get("cooldown_seconds", 60)
            if self.alert_mgr.is_cooldown_active("cam153", event_type, cooldown):
                logger.debug(f"[CAM153] {event_type} in cooldown")
                return

            # Save alert
            self.alert_mgr.save(
                camera_id="cam153",
                event_dict=event_data,
                camera_ip=self.ip,
                camera_user=self.user,
                camera_password=self.password,
            )
            self.events_saved += 1

            # Async: record video and post to backend (non-blocking)
            self._trigger_video_recording(event_type)

        except ET.ParseError as e:
            logger.debug(f"[CAM153] XML parse error: {e}")
        except Exception as e:
            logger.error(f"[CAM153] Error processing event: {e}")

    def _extract_event_data(self, root: ET.Element, event_type: str, raw_xml: str) -> dict:
        """Extract event details into structured format."""
        event_data = {
            "type": event_type,
            "source": "isapi_alertstream",
            "raw_xml": raw_xml[:500],  # Truncate for logging
        }

        if event_type == "audioException":
            # Acoustic anomaly
            decibel_elem = root.find(".//{*}wDecibel")
            decibel = float(decibel_elem.text) if decibel_elem is not None else None
            event_data["audio"] = {
                "decibel_db": decibel,
                "threshold_db": self.thresholds.get("decibel_alarm_db", 85.0),
            }

        elif event_type in ["fireDetection", "smokeDetection"]:
            # Fire or smoke
            temp_elem = root.find(".//{*}fTemperature")
            temp = float(temp_elem.text) if temp_elem is not None else None
            event_data["thermal"] = {
                "temperature_c": temp,
                "threshold_c": self.thresholds.get("fire_alarm_temp_c", 120.0),
            }

            # Try to get location
            rect = root.find(".//{*}RegionCoordinatesList")
            if rect is not None:
                event_data["location"] = self._parse_coordinates(rect)

        elif event_type == "dischargeDetection":
            # Electrical discharge (phóng điện)
            event_data["discharge"] = {
                "detected": True,
            }

        return event_data

    def _parse_coordinates(self, rect_elem: ET.Element) -> dict:
        """Extract normalized coordinates from RegionCoordinatesList."""
        coords = {"x": None, "y": None}
        try:
            x_elem = rect_elem.find(".//{*}x")
            y_elem = rect_elem.find(".//{*}y")
            if x_elem is not None and x_elem.text:
                coords["x"] = float(x_elem.text)
            if y_elem is not None and y_elem.text:
                coords["y"] = float(y_elem.text)
        except (ValueError, AttributeError):
            pass
        return coords

    def _check_threshold(self, event_type: str, event_data: dict) -> bool:
        """Check if event crosses configured threshold."""
        if event_type == "audioException":
            decibel = event_data.get("audio", {}).get("decibel_db")
            if decibel is None:
                return True  # No threshold if missing data
            threshold = self.thresholds.get("decibel_alarm_db", 85.0)
            return decibel >= threshold

        elif event_type in ["fireDetection", "smokeDetection"]:
            temp = event_data.get("thermal", {}).get("temperature_c")
            if temp is None:
                return True  # No threshold if missing data
            threshold = self.thresholds.get("fire_alarm_temp_c", 120.0)
            return temp >= threshold

        return True  # Default: accept event

    def _trigger_video_recording(self, event_type: str):
        """Trigger async video recording and upload to backend."""
        def record_and_post():
            try:
                from video_recorder import VideoRecorder
                recorder = VideoRecorder()
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                video_file = f"{self.alert_mgr.alerts_dir}/{timestamp}_cam153_{event_type}.mp4"

                logger.info(f"[CAM153] Recording 10s video to {video_file}...")
                success = recorder.record_video("camera_153", video_file, duration=10)

                if success:
                    logger.info(f"[CAM153] Video recorded, posting to backend...")
                    self.alert_mgr.post_video_to_backend(self.ip, video_file)
                else:
                    logger.warning(f"[CAM153] Video recording failed")
            except Exception as e:
                logger.error(f"[CAM153] Video recording error: {e}")

        # Start in background (daemon thread)
        Thread(target=record_and_post, daemon=True).start()

    def stop(self):
        """Stop listening."""
        logger.info("[CAM153] Stopping listener...")
        self.stopped.set()

    def status(self) -> str:
        """Return listener status."""
        return f"cam153: {self.events_received} rx, {self.events_saved} saved"
