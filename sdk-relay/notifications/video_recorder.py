#!/usr/bin/env python
"""Record video from camera RTSP stream when alert occurs."""

import json
import subprocess
import shutil
import logging
from pathlib import Path
from threading import Thread

logger = logging.getLogger(__name__)


def _find_ffmpeg() -> str:
    """Find ffmpeg binary — works on both Windows and Linux."""
    # Try local media-server folder (bundled on Windows)
    for name in ["ffmpeg.exe", "ffmpeg"]:
        local = Path(__file__).parent.parent.parent / "media-server" / name
        if local.exists():
            return str(local)

    # Try system PATH
    found = shutil.which("ffmpeg")
    if found:
        return found

    raise FileNotFoundError("ffmpeg not found — install with: apt install ffmpeg  OR  choco install ffmpeg")


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

        user = cam.get("user", "admin")
        passwd = cam.get("password", "")
        ip = cam.get("ip")
        port = cam.get("rtsp_port", 554)

        # Hikvision RTSP path format: /Streaming/Channels/<channel><stream>
        # Channel 1 = optical/normal, Channel 2 = thermal
        # Stream 01 = main stream, 02 = sub stream
        if camera_id == "camera_152":
            stream_path = "/Streaming/Channels/201"  # thermal main stream
        else:
            stream_path = "/Streaming/Channels/101"  # normal video main stream

        return f"rtsp://{user}:{passwd}@{ip}:{port}{stream_path}"

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

        try:
            ffmpeg_bin = _find_ffmpeg()
        except FileNotFoundError as e:
            logger.error(f"[VIDEO] {e}")
            if callback:
                callback(None, False)
            return False

        cmd = [
            ffmpeg_bin,
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
            '-t', str(duration),
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-y',
            str(output_file)
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=duration + 10
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
            logger.error("[VIDEO] ffmpeg not found")
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
            stream_path = "/Streaming/Channels/201"  # thermal main stream
        else:
            stream_path = "/Streaming/Channels/101"  # normal video main stream

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

        try:
            ffmpeg_bin = _find_ffmpeg()
        except FileNotFoundError as e:
            logger.error(f"[IMAGE] {e}")
            return False

        cmd = [
            ffmpeg_bin,
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
            '-vframes', '1',
            '-y',
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
            logger.error("[IMAGE] ffmpeg binary not found during subprocess")
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
