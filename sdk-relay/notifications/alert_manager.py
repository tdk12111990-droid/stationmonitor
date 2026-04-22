"""
Alert manager — saves events to JSON + fetches camera snapshots
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
import logging
import requests
from requests.auth import HTTPDigestAuth
from threading import Lock

from sdk_snapshot_capture import SDKSnapshotCapture

logger = logging.getLogger(__name__)


class AlertManager:
    """Manages saving alerts to disk with optional snapshot capture."""

    def __init__(self, config: dict):
        """
        Args:
            config: alert_manager section from config.json
                    Must have: alerts_dir, save_image, log_file
                    Optional: backend_url (for webhooks)
        """
        self.alerts_dir = config.get("alerts_dir", "alerts")
        self.save_image = config.get("save_image", True)
        self.log_file = config.get("log_file", "notifications.log")
        self.max_alerts_per_day = config.get("max_alerts_per_day", 1000)
        self._backend_url = config.get("backend_url", "")

        # Create alerts directory
        Path(self.alerts_dir).mkdir(parents=True, exist_ok=True)

        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[
                logging.FileHandler(self.log_file),
                logging.StreamHandler()
            ]
        )

        # Cooldown tracking per (camera_id, event_type)
        self._cooldown_map: Dict[str, float] = {}
        self._lock = Lock()

    def is_cooldown_active(self, camera_id: str, event_type: str, cooldown_sec: int) -> bool:
        """Check if cooldown for this event is still active."""
        key = f"{camera_id}:{event_type}"
        with self._lock:
            if key in self._cooldown_map:
                elapsed = datetime.now().timestamp() - self._cooldown_map[key]
                if elapsed < cooldown_sec:
                    return True
            self._cooldown_map[key] = datetime.now().timestamp()
            return False

    def save(
        self,
        camera_id: str,
        event_dict: dict,
        camera_ip: str,
        camera_user: str,
        camera_password: str,
    ) -> str:
        """
        Save alert to JSON file and optionally fetch snapshot.

        Args:
            camera_id: e.g. "cam152", "cam153"
            event_dict: structured event data
            camera_ip: IP address to fetch snapshot from
            camera_user: digest auth user
            camera_password: digest auth password

        Returns:
            Path to saved JSON file
        """
        timestamp = datetime.now()
        iso_time = timestamp.isoformat()
        unix_time = timestamp.timestamp()

        event_type = event_dict.get("type", "unknown")
        filename_base = timestamp.strftime(f"%Y%m%d_%H%M%S") + f"_{camera_id}_{event_type}"

        # Prepare alert object
        alert = {
            "id": filename_base,
            "timestamp_iso": iso_time,
            "timestamp_unix": unix_time,
            "camera": {
                "id": camera_id,
                "ip": camera_ip,
            },
            "source": event_dict.get("source", "isapi_alertstream"),
            "event": event_dict,
            "image_file": None,
        }

        # Try to fetch snapshot
        image_file = None
        if self.save_image:
            try:
                image_file = self._fetch_snapshot(
                    camera_ip, camera_user, camera_password, filename_base
                )
                alert["image_file"] = image_file
            except Exception as e:
                logger.warning(f"Failed to fetch snapshot for {camera_id}: {e}")

        # Save JSON
        json_file = os.path.join(self.alerts_dir, f"{filename_base}.json")
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(alert, f, indent=2, ensure_ascii=False)

        logger.info(f"[OK] Alert saved: {json_file}")

        # Post to backend webhook if configured
        if self._backend_url and self.save_image:
            image_path = os.path.join(self.alerts_dir, image_file) if image_file else None
            self.post_to_backend(camera_ip, event_dict, image_path)

        return json_file

    def _build_webhook_xml(self, camera_ip: str, event_dict: dict) -> str:
        """Build minimal XML for backend CameraWebhookController to parse."""
        event_type = event_dict.get("type", "unknown")
        max_temp = event_dict.get("thermal", {}).get("max_c")
        iso_time = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        xml = (
            "<EventNotificationAlert>"
            f"<ipAddress>{camera_ip}</ipAddress>"
            f"<eventType>{event_type}</eventType>"
            "<eventState>active</eventState>"
            f"<dateTime>{iso_time}</dateTime>"
        )
        if max_temp is not None:
            xml += f"<maxTemp>{max_temp}</maxTemp>"
        xml += "</EventNotificationAlert>"
        return xml

    def post_to_backend(self, camera_ip: str, event_dict: dict, image_path: str = None) -> bool:
        """POST alert to backend webhook as multipart (XML + JPEG)."""
        if not self._backend_url:
            return False

        xml = self._build_webhook_xml(camera_ip, event_dict)
        data = {"event": xml}
        files = {}

        # Attach JPEG if available
        if image_path and os.path.exists(image_path):
            try:
                files["image_hd"] = ("snapshot.jpg", open(image_path, "rb"), "image/jpeg")
            except Exception as e:
                logger.warning(f"Failed to attach image: {e}")

        try:
            resp = requests.post(
                f"{self._backend_url}/camera-webhook",
                data=data,
                files=files,
                timeout=10
            )
            if resp.status_code < 300:
                logger.info(f"[WEBHOOK] Posted to backend: {resp.status_code}")
                return True
            else:
                logger.warning(f"[WEBHOOK] Backend returned {resp.status_code}")
                return False
        except Exception as e:
            logger.warning(f"[WEBHOOK] POST failed: {e}")
            return False

    def post_video_to_backend(self, camera_ip: str, video_path: str) -> bool:
        """POST video to backend /camera-webhook/video endpoint."""
        if not self._backend_url or not os.path.exists(video_path):
            return False

        try:
            with open(video_path, "rb") as f:
                resp = requests.post(
                    f"{self._backend_url}/camera-webhook/video",
                    data={"camIp": camera_ip},
                    files={"video.mp4": ("video.mp4", f, "video/mp4")},
                    timeout=60
                )
            if resp.status_code < 300:
                logger.info(f"[WEBHOOK] Posted video to backend: {resp.status_code}")
                return True
            else:
                logger.warning(f"[WEBHOOK] Video upload failed: {resp.status_code}")
                return False
        except Exception as e:
            logger.warning(f"[WEBHOOK] Video POST failed: {e}")
            return False

    def _fetch_snapshot(
        self, camera_ip: str, user: str, password: str, filename_base: str
    ) -> Optional[str]:
        """
        Fetch camera snapshot via SDK + RTSP + FFmpeg.

        Returns:
            Filename of saved image, or None if failed
        """
        try:
            # Map camera IP to camera_id
            camera_id = None
            if camera_ip == "192.168.10.152":
                camera_id = "camera_152"
            elif camera_ip == "192.168.10.153":
                camera_id = "camera_153"
            else:
                logger.warning(f"Unknown camera IP: {camera_ip}")
                return None

            # Use SDK to capture snapshot
            image_file = f"{filename_base}.jpg"
            image_path = os.path.join(self.alerts_dir, image_file)

            if SDKSnapshotCapture.capture_snapshot(camera_id, image_path):
                logger.info(f"  Snapshot saved: {image_path}")
                return image_file
            else:
                logger.debug(f"SDK snapshot capture failed for {camera_id}")

        except Exception as e:
            logger.debug(f"Snapshot fetch error: {e}")

        return None
