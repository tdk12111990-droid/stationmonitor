import re
import time

from config.settings import DEVICE_ID
from src.utils.text_utils import postprocess_text


def parse_text(raw: str, source: str) -> dict:
    text = postprocess_text(raw)

    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*:\s*", ":", text)
    text = text.replace(",", ".")
    text = text.strip()

    text = re.sub(r"Freguency|Frequcncy", "Frequency", text, flags=re.IGNORECASE)
    text = re.sub(r"Decibe[l1I]", "Decibel", text, flags=re.IGNORECASE)

    out = {
        "device_id": DEVICE_ID,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": source,
        "frequency_band": None,
        "max_frequency_hz": None,
        "max_decibel_db": None,
        "raw": raw,
        "corrected": text,
    }

    def find_value_near_keyword(text_in, keyword, unit=None):
        tokens = text_in.split()
        for i, tok in enumerate(tokens):
            if keyword.lower() in tok.lower():
                for j in range(i, min(i + 6, len(tokens))):
                    if unit and unit.lower() in tokens[j].lower():
                        m = re.search(r"(\d+(?:\.\d+)?)", tokens[j])
                        if m:
                            return float(m.group(1))

                    m = re.search(r"(\d+(?:\.\d+)?)", tokens[j])
                    if m:
                        return float(m.group(1))
        return None

    out["max_frequency_hz"] = find_value_near_keyword(text, "Frequency", "Hz")
    out["max_decibel_db"] = find_value_near_keyword(text, "Decibel", "dB")

    m = re.search(r"([\d\.]+\s*[Kk][Hh][Zz]\s*-\s*[\d\.]+\s*[Kk][Hh][Zz])", text)
    if m:
        out["frequency_band"] = m.group(1).replace(" ", "")

    return out

# # access user   



# def parse_text(results, source: str) -> dict:
#     """
#     Giữ nguyên tên hàm parse_text để main.py không phải đổi nhiều.
#     Nhưng giờ parse từ YOLO results sang payload detection.
#     """
#     detections = []

#     for result in results:
#         boxes = getattr(result, "boxes", None)
#         names = getattr(result, "names", {})

#         if boxes is None:
#             continue

#         for box in boxes:
#             cls_id = int(box.cls[0].item())
#             conf = float(box.conf[0].item())
#             x1, y1, x2, y2 = box.xyxy[0].tolist()

#             detections.append(
#                 {
#                     "class_id": cls_id,
#                     "class_name": names.get(cls_id, str(cls_id)),
#                     "confidence": round(conf, 4),
#                     "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
#                 }
#             )

#     payload = {
#         "device_id": DEVICE_ID,
#         "time": time.strftime("%Y-%m-%d %H:%M:%S"),
#         "source": source or CAMERA_SOURCE,
#         "event_type": "person_detection",
#         "frame_width": FRAME_WIDTH,
#         "frame_height": FRAME_HEIGHT,
#         "total_detections": len(detections),
#         "detections": detections,
#     }

#     return payload