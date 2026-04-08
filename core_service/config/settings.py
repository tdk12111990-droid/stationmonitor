import os
from pathlib import Path

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

RTSP_URL = "rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101"

FRAME_WIDTH = 640
FRAME_HEIGHT = 480
RECONNECT_DELAY = 2
OCR_INTERVAL_SEC = 1.0

# auto / cpu / gpu:0
OCR_DEVICE = os.getenv("OCR_DEVICE", "cpu")

# PREPROCESS_PARAMS = {
#     "scale": 3.0,
#     "clahe": True,
#     "blur_method": "bilateral",
#     "blur_ksize": 5,
#     "thresh_method": "adaptive",
#     "thresh_val": 200,
#     "adaptive_block": 31,
#     "adaptive_c": 7,
#     "morph_op": "open",
#     "morph_ksize": 2,
# }
PREPROCESS_PARAMS = {
    "scale": 3.0,
    "clahe": True,
    "blur_method": "bilateral",
    "blur_ksize": 7,
    "thresh_method": "otsu",
    "morph_op": "close",
    "morph_ksize": 2,
}

BACKEND_URL = "http://localhost:8000/api/ocr-result"
API_TIMEOUT = 10
DEVICE_ID = "station-monitor-01"

TMP_DIR = Path("tmp_ocr")
TMP_DIR.mkdir(exist_ok=True)