import time
import cv2

from config.settings import FRAME_HEIGHT, FRAME_WIDTH, RECONNECT_DELAY, RTSP_URL


def get_one_frame(retries: int = 3):
    for attempt in range(1, retries + 1):
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        if not cap.isOpened():
            print(f"[CAPTURE] Không kết nối được RTSP. Lần thử {attempt}/{retries}")
            cap.release()
            time.sleep(RECONNECT_DELAY)
            continue

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            print(f"[CAPTURE] Mất frame. Lần thử {attempt}/{retries}")
            time.sleep(RECONNECT_DELAY)
            continue

        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
        return frame

    return None