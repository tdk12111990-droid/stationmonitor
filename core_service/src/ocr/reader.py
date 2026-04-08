import time
import cv2
from paddleocr import PaddleOCR

from config.settings import OCR_DEVICE, TMP_DIR


def _resolve_ocr_device() -> str:
    """
    Quy ước:
    - OCR_DEVICE=cpu   -> dùng CPU
    - OCR_DEVICE=gpu:0 -> dùng GPU cụ thể
    - OCR_DEVICE=auto  -> thử GPU trước, lỗi thì fallback CPU
    """
    if OCR_DEVICE.lower() == "cpu":
        return "cpu"
    if OCR_DEVICE.lower() == "auto":
        return "auto"
    return OCR_DEVICE


def load_ocr_model():
    device = _resolve_ocr_device()

    if device == "auto":
        try:
            print("[OCR] Trying GPU device: gpu:0")
            model = PaddleOCR(
                device="gpu:0",
                lang="en",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            print("[OCR] Loaded with GPU: gpu:0")
            return model
        except Exception as e:
            print(f"[OCR] GPU unavailable, fallback to CPU. Reason: {e}")

            model = PaddleOCR(
                device="cpu",
                lang="en",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            print("[OCR] Loaded with CPU")
            return model

    model = PaddleOCR(
        device=device,
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    print(f"[OCR] Loaded with device: {device}")
    return model


def extract_text_from_prediction(results):
    texts = []

    for res in results:
        rec_texts = []

        if isinstance(res, dict):
            rec_texts = res.get("rec_texts", [])
        else:
            if hasattr(res, "rec_texts"):
                rec_texts = getattr(res, "rec_texts", [])
            elif hasattr(res, "res") and isinstance(res.res, dict):
                rec_texts = res.res.get("rec_texts", [])
            elif hasattr(res, "__dict__"):
                rec_texts = res.__dict__.get("rec_texts", [])

        if rec_texts:
            texts.extend(rec_texts)

    return " ".join([t for t in texts if t]).strip()


def ocr_predict_text(ocr_model, image_bgr, prefix="roi"):
    ts = int(time.time() * 1000)
    img_path = TMP_DIR / f"{prefix}_{ts}.png"
    cv2.imwrite(str(img_path), image_bgr)

    try:
        results = ocr_model.predict(str(img_path))
        text = extract_text_from_prediction(results)
    finally:
        try:
            img_path.unlink(missing_ok=True)
        except Exception:
            pass

    return text