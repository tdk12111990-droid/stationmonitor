#!/usr/bin/env python3
"""
Main coordinator — start both camera listeners and monitor status
"""

import json
import logging
import signal
import sys
import time
from pathlib import Path

from alert_manager import AlertManager
from camera_152 import Camera152Listener
from camera_153 import Camera153Listener

logger = logging.getLogger(__name__)


def load_config(config_file: str = "config.json") -> dict:
    """Load configuration from JSON file."""
    with open(config_file, "r") as f:
        return json.load(f)


def main():
    """Main entry point."""
    print("\n" + "="*70)
    print("  🎥 StationMonitor Notification Test System")
    print("="*70)

    try:
        # Load config
        config = load_config("config.json")
        print("✅ Config loaded: config.json")

        # Initialize alert manager
        alert_mgr = AlertManager(config["alert_manager"])
        print(f"✅ Alert manager initialized → {config['alert_manager']['alerts_dir']}/")

        # Create listeners
        listeners = []

        if config["camera_152"].get("enabled", True):
            cam152 = Camera152Listener(config["camera_152"], alert_mgr)
            cam152.start()
            listeners.append(("cam152", cam152))
            print("✅ Camera 152 listener started (Thermal+Optical)")

        if config["camera_153"].get("enabled", True):
            cam153 = Camera153Listener(config["camera_153"], alert_mgr)
            cam153.start()
            listeners.append(("cam153", cam153))
            print("✅ Camera 153 listener started (Acoustic+Fire)")

        if not listeners:
            logger.error("No cameras enabled!")
            return 1

        print("="*70)
        print("📊 Monitoring... Press Ctrl+C to stop\n")

        # Status loop
        try:
            while True:
                time.sleep(10)
                print(f"\n[{time.strftime('%H:%M:%S')}] Status:")
                for name, listener in listeners:
                    print(f"  • {listener.status()}")

        except KeyboardInterrupt:
            print("\n\n⏹️  Shutting down...\n")

            for name, listener in listeners:
                logger.info(f"Stopping {name}...")
                listener.stop()

            # Wait for threads to finish
            for name, listener in listeners:
                listener.join(timeout=2)

            print("✅ All listeners stopped")

    except FileNotFoundError:
        logger.error("❌ config.json not found!")
        return 1
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
