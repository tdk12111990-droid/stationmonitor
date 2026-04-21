#!/usr/bin/env python
"""Record video from camera RTSP stream when alert occurs."""

import json
import subprocess
import time
import logging
from pathlib import Path
from threading import Thread

logger = logging.getLogger(__name__)


class VideoRecorder:
    """Record video clips from RTSP stream."""

    def __init__(self, config_file="config.json"):
        with open(config_file) as f:
            self.config = json.load(f)

    def get_rtsp_url(self, camera_id):
        """Get RTSP stream URL for camera."""
        cam = self.config.get(camera_id)
        if not cam:
            return None

        # Format: rtsp://user:password@ip:554/stream_path
        user = cam.get("user", "admin")
        passwd = cam.get("password", "")
        ip = cam.get("ip")
        port = cam.get("rtsp_port", 554)

        # Common Hikvision RTSP paths:
        # Cam 152 (thermal): /Streaming/tracks/202 (thermal channel)
        # Cam 153 (normal): /Streaming/tracks/101 (video channel)

        if camera_id == "camera_152":
            # Thermal channel (channel 2)
            stream_path = "/Streaming/tracks/202"
        else:
            # Normal video channel
            stream_path = "/Streaming/tracks/101"

        rtsp_url = f"rtsp://{user}:{passwd}@{ip}:{port}{stream_path}"
        return rtsp_url

    def record_video(self, camera_id, output_file, duration=10, callback=None):
        """
        Record video from RTSP stream.

        Args:
            camera_id: "camera_152" or "camera_153"
            output_file: path to save .mp4
            duration: record duration in seconds
            callback: function to call when done (path, success)
        """
        rtsp_url = self.get_rtsp_url(camera_id)
        if not rtsp_url:
            logger.error(f"Cannot get RTSP URL for {camera_id}")
            if callback:
                callback(None, False)
            return

        logger.info(f"[VIDEO] Recording from {camera_id}...")
        logger.info(f"        RTSP: {rtsp_url[:50]}...")

        # Use ffmpeg to record
        # -rtsp_transport tcp: more reliable than udp
        # -i: input stream
        # -t: duration
        # -c:v copy: copy video codec (no re-encoding)
        # -c:a copy: copy audio codec
        # output_file: save location

        cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',  # More reliable
            '-i', rtsp_url,
            '-t', str(duration),  # Record for N seconds
            '-c:v', 'copy',  # No re-encoding (faster)
            '-c:a', 'copy',
            '-y',  # Overwrite
            str(output_file)
        ]

        try:
            # Run ffmpeg
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=duration + 10  # Timeout slightly longer than duration
            )

            if result.returncode == 0 and Path(output_file).exists():
                size_mb = Path(output_file).stat().st_size / (1024 * 1024)
                logger.info(f"[VIDEO] Recorded {size_mb:.1f} MB")
                logger.info(f"[VIDEO] Saved: {Path(output_file).name}")

                if callback:
                    callback(str(output_file), True)
                return True
            else:
                error_msg = result.stderr.decode()[:200]
                logger.error(f"[VIDEO] ffmpeg error: {error_msg}")

                if callback:
                    callback(None, False)
                return False

        except FileNotFoundError:
            logger.error("[VIDEO] ffmpeg not found - install ffmpeg first")
            logger.error("        Command: choco install ffmpeg")
            if callback:
                callback(None, False)
            return False

        except subprocess.TimeoutExpired:
            logger.error(f"[VIDEO] Recording timeout")
            if callback:
                callback(None, False)
            return False

        except Exception as e:
            logger.error(f"[VIDEO] Error: {str(e)}")
            if callback:
                callback(None, False)
            return False

    def record_video_async(self, camera_id, output_file, duration=10, callback=None):
        """Record video in background thread."""
        thread = Thread(
            target=self.record_video,
            args=(camera_id, output_file, duration, callback),
            daemon=True
        )
        thread.start()
        return thread


class ImageCapturer:
    """Capture single frame from RTSP stream."""

    def __init__(self, config_file="config.json"):
        with open(config_file) as f:
            self.config = json.load(f)

    def get_rtsp_url(self, camera_id):
        """Get RTSP stream URL."""
        cam = self.config.get(camera_id)
        if not cam:
            return None

        user = cam.get("user", "admin")
        passwd = cam.get("password", "")
        ip = cam.get("ip")
        port = cam.get("rtsp_port", 554)

        if camera_id == "camera_152":
            stream_path = "/Streaming/tracks/202"  # Thermal
        else:
            stream_path = "/Streaming/tracks/101"  # Normal

        return f"rtsp://{user}:{passwd}@{ip}:{port}{stream_path}"

    def capture_frame(self, camera_id, output_file):
        """
        Capture single frame from RTSP stream.

        Args:
            camera_id: "camera_152" or "camera_153"
            output_file: path to save .jpg

        Returns:
            True if success, False if failed
        """
        rtsp_url = self.get_rtsp_url(camera_id)
        if not rtsp_url:
            logger.error(f"Cannot get RTSP URL for {camera_id}")
            return False

        logger.info(f"[IMAGE] Capturing frame from {camera_id}...")

        # Use ffmpeg to capture single frame
        # -ss 00:00:00: start at beginning
        # -vframes 1: capture 1 frame
        # -y: overwrite

        cmd = [
            'ffmpeg',
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
            '-vframes', '1',  # Capture 1 frame
            '-y',  # Overwrite
            str(output_file)
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=10
            )

            if result.returncode == 0 and Path(output_file).exists():
                size_kb = Path(output_file).stat().st_size / 1024
                logger.info(f"[IMAGE] Captured {size_kb:.1f} KB")
                logger.info(f"[IMAGE] Saved: {Path(output_file).name}")
                return True
            else:
                error_msg = result.stderr.decode()[:200]
                logger.error(f"[IMAGE] ffmpeg error: {error_msg}")
                return False

        except FileNotFoundError:
            logger.error("[IMAGE] ffmpeg not found")
            return False

        except subprocess.TimeoutExpired:
            logger.error("[IMAGE] Capture timeout")
            return False

        except Exception as e:
            logger.error(f"[IMAGE] Error: {str(e)}")
            return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test video recording
    print("\n=== VIDEO RECORDING TEST ===\n")

    recorder = VideoRecorder()
    capturer = ImageCapturer()

    # Test 1: Check RTSP URLs
    print("[TEST] RTSP URLs:")
    print(f"  Camera 152: {recorder.get_rtsp_url('camera_152')}")
    print(f"  Camera 153: {recorder.get_rtsp_url('camera_153')}")

    # Test 2: Try to record (will fail if ffmpeg not installed or cameras offline)
    print("\n[TEST] Attempting to record from Camera 152...")
    print("       (This will fail if: camera offline, ffmpeg not installed, or no RTSP)")

    success = recorder.record_video(
        "camera_152",
        "test_video.mp4",
        duration=5
    )

    if success:
        print("[SUCCESS] Video recorded!")
    else:
        print("[INFO] Recording failed - expected if:")
        print("       - Camera offline or RTSP stream not available")
        print("       - ffmpeg not installed")
        print("       - Network connectivity issue")

    print("\n=== SETUP REQUIRED ===\n")
    print("1. Install ffmpeg:")
    print("   choco install ffmpeg")
    print("   OR download from: https://ffmpeg.org/download.html")
    print()
    print("2. Configure camera RTSP stream:")
    print("   - Login to camera web UI (192.168.10.152 or .153)")
    print("   - Go to: Settings > Network > RTSP")
    print("   - Enable RTSP streaming")
    print("   - Note the RTSP URL")
    print("   - Update config.json if stream path differs")
    print()
    print("3. Test RTSP connection:")
    print("   ffplay rtsp://admin:password@192.168.10.152/Streaming/tracks/202")
    print()
