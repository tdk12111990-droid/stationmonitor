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

logger = logging.getLogger(__name__)


class AlertManager:
    """Manages saving alerts to disk with optional snapshot capture."""

    def __init__(self, config: dict):
        """
        Args:
            config: alert_manager section from config.json
                    Must have: alerts_dir, save_image, log_file
        """
        self.alerts_dir = config.get("alerts_dir", "alerts")
        self.save_image = config.get("save_image", True)
        self.log_file = config.get("log_file", "notifications.log")
        self.max_alerts_per_day = config.get("max_alerts_per_day", 1000)

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

        logger.info(f"✅ Alert saved: {json_file}")
        return json_file

    def _fetch_snapshot(
        self, camera_ip: str, user: str, password: str, filename_base: str
    ) -> Optional[str]:
        """
        Fetch camera snapshot via ISAPI.

        Returns:
            Filename of saved image, or None if failed
        """
        # Channel 1 is main channel for visible light snapshot
        # For thermal, channel 2 or 3 might be used, but start with 1
        url = f"http://{camera_ip}:8000/ISAPI/Streaming/channels/101/picture"
        auth = HTTPDigestAuth(user, password)

        try:
            r = requests.get(url, auth=auth, timeout=5)
            if r.status_code == 200:
                image_file = f"{filename_base}.jpg"
                image_path = os.path.join(self.alerts_dir, image_file)
                with open(image_path, "wb") as f:
                    f.write(r.content)
                logger.info(f"  📸 Snapshot saved: {image_path}")
                return image_file
        except Exception as e:
            logger.debug(f"Snapshot fetch error: {e}")

        return None
