import time
import traceback

from config.settings import OCR_INTERVAL_SEC
from src.camera.rtsp_capture import get_one_frame
from src.client.backend_sender import send_to_backend
from src.ocr.parser import parse_text
from src.ocr.preprocess import preprocess_for_ocr
from src.ocr.reader import load_ocr_model, ocr_predict_text
from src.utils.image_utils import crop_roi


def main():
    print("[SYSTEM] Starting realtime OCR service...")
    ocr_model = load_ocr_model()

    while True:
        try:
            frame = get_one_frame()
            if frame is None:
                print("[MAIN] Không lấy được frame từ RTSP.")
                time.sleep(OCR_INTERVAL_SEC)
                continue

            roi_raw = crop_roi(frame)
            roi_processed = preprocess_for_ocr(roi_raw)

            text_raw = ocr_predict_text(ocr_model, roi_raw, prefix="raw")
            text_processed = ""

            if not text_raw:
                text_processed = ocr_predict_text(ocr_model, roi_processed, prefix="proc")

            if text_raw:
                final_text = text_raw
                source = "raw"
            else:
                final_text = text_processed
                source = "processed"

            payload = parse_text(final_text, source)

            print(f"[OCR TIME]      {payload['time']}")
            print(f"[OCR SOURCE]    {source}")
            print(f"[OCR RAW]       {repr(payload['raw'])}")
            print(f"[OCR CORRECTED] {repr(payload['corrected'])}")
            print(f"[OCR JSON]      {payload}")

            send_result = send_to_backend(payload)
            print(f"[API] {send_result}")

        except KeyboardInterrupt:
            print("\n[SYSTEM] Stopped by user.")
            break
        except Exception as e:
            print(f"[ERROR] {e}")
            traceback.print_exc()

        time.sleep(OCR_INTERVAL_SEC)


if __name__ == "__main__":
    main()