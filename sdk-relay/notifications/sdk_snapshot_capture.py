"""
SDK Snapshot Capture - Dung RTSP stream + ffmpeg de chup anh.
"""

import subprocess
import logging
import shutil
from pathlib import Path
import os

logger = logging.getLogger(__name__)


def _load_rtsp_streams():
    """Load RTSP streams from config.json dynamically."""
    import json
    config_path = Path(__file__).parent / "config.json"
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        streams = {}
        cam152 = cfg.get("camera_152", {})
        cam153 = cfg.get("camera_153", {})
        ip152 = cam152.get("ip", "192.168.10.152")
        user152 = cam152.get("user", "admin")
        pw152 = cam152.get("password", "Demo@2024")
        ip153 = cam153.get("ip", "192.168.10.153")
        user153 = cam153.get("user", "tladmin")
        pw153 = cam153.get("password", "Ab@12345")
        streams["camera_152"] = {
            "optical": f"rtsp://{user152}:{pw152}@{ip152}:554/Streaming/Channels/101",
            "thermal": f"rtsp://{user152}:{pw152}@{ip152}:554/Streaming/Channels/201",
        }
        streams["camera_153"] = {
            "video": f"rtsp://{user153}:{pw153}@{ip153}:554/Streaming/Channels/101",
        }
        return streams
    except Exception:
        return {
            "camera_152": {
                "optical": "rtsp://admin:Demo@2024@192.168.10.152:554/Streaming/Channels/101",
                "thermal": "rtsp://admin:Demo@2024@192.168.10.152:554/Streaming/Channels/201",
            },
            "camera_153": {
                "video": "rtsp://tladmin:Ab@12345@192.168.10.153:554/Streaming/Channels/101",
            }
        }


class SDKSnapshotCapture:
    """Capture snapshot from camera via RTSP stream."""

    RTSP_STREAMS = None  # loaded lazily from config.json

    # FFmpeg path
    FFMPEG_BIN = None

    @classmethod
    def find_ffmpeg(cls):
        """Find ffmpeg binary — works on both Windows and Linux."""
        if cls.FFMPEG_BIN:
            return cls.FFMPEG_BIN

        # Try local media-server folder (Windows with bundled ffmpeg)
        for name in ["ffmpeg.exe", "ffmpeg"]:
            local_ffmpeg = Path(__file__).parent.parent.parent / "media-server" / name
            if local_ffmpeg.exists():
                cls.FFMPEG_BIN = str(local_ffmpeg)
                return cls.FFMPEG_BIN

        # Try system PATH (works on both Linux and Windows)
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            cls.FFMPEG_BIN = system_ffmpeg
            return cls.FFMPEG_BIN

        raise FileNotFoundError("ffmpeg not found")

    @classmethod
    def capture_snapshot(cls, camera_id: str, output_path: str, stream_type: str = None) -> bool:
        """
        Capture snapshot from camera via RTSP stream.

        Args:
            camera_id: "camera_152" or "camera_153"
            output_path: Path to save JPG file
            stream_type: "optical", "thermal", "video" (optional, auto-select if not provided)

        Returns:
            True if successful, False otherwise
        """
        try:
            # Load streams from config if not yet loaded
            if cls.RTSP_STREAMS is None:
                cls.RTSP_STREAMS = _load_rtsp_streams()

            # Get RTSP URL
            if camera_id not in cls.RTSP_STREAMS:
                logger.error(f"Camera {camera_id} not found")
                return False

            streams = cls.RTSP_STREAMS[camera_id]

            # Auto-select stream type
            if not stream_type:
                stream_type = next(iter(streams.keys()))

            if stream_type not in streams:
                logger.error(f"Stream type {stream_type} not available for {camera_id}")
                return False

            rtsp_url = streams[stream_type]

            # Find ffmpeg
            ffmpeg_bin = cls.find_ffmpeg()

            # Capture 1 frame using ffmpeg
            # -rtsp_transport tcp: use TCP (more stable)
            # -t 1: duration 1 second
            # -vframes 1: output 1 frame
            # -q:v 2: quality (1-31, lower is better)
            cmd = [
                ffmpeg_bin,
                "-rtsp_transport", "tcp",
                "-i", rtsp_url,
                "-t", "1",
                "-vframes", "1",
                "-q:v", "2",
                "-y",  # overwrite output file
                output_path
            ]

            logger.info(f"[SDK] Capturing snapshot: {camera_id}/{stream_type}")

            # Run ffmpeg (suppress output)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0 and os.path.exists(output_path):
                size_kb = os.path.getsize(output_path) / 1024
                logger.info(f"[SDK] Snapshot saved: {output_path} ({size_kb:.1f} KB)")
                return True
            else:
                logger.warning(f"[SDK] Snapshot capture failed for {camera_id}")
                if result.stderr:
                    logger.debug(f"[SDK] ffmpeg error: {result.stderr[:500]}")
                if result.stdout:
                    logger.debug(f"[SDK] ffmpeg output: {result.stdout[:200]}")
                return False

        except FileNotFoundError:
            logger.warning("[SDK] ffmpeg not found - snapshot capture disabled")
            return False
        except subprocess.TimeoutExpired:
            logger.warning(f"[SDK] Snapshot capture timeout for {camera_id}")
            return False
        except Exception as e:
            logger.error(f"[SDK] Snapshot capture error: {e}")
            return False


def test_capture():
    """Test snapshot capture."""
    print("="*80)
    print("SDK SNAPSHOT CAPTURE TEST")
    print("="*80)

    for camera_id in ["camera_152", "camera_153"]:
        print(f"\n>>> {camera_id}")

        # Test default stream
        output = f"test_snapshot_{camera_id}.jpg"
        result = SDKSnapshotCapture.capture_snapshot(camera_id, output)

        if result:
            print(f"[OK] Snapshot saved: {output}")
        else:
            print(f"[FAIL] Snapshot capture failed")

    print("\n" + "="*80)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )

    test_capture()
