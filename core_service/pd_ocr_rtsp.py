import os
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import cv2
import time
import json
import threading
import re
from pathlib import Path
from collections import deque
from copy import deepcopy

import numpy as np
import pandas as pd
import streamlit as st
from paddleocr import PaddleOCR


RTSP_URL = "rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101"
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
HISTORY_LEN = 120
RECONNECT_DELAY = 2

OCR_DEVICE = "gpu:0"

PREPROCESS_PARAMS = {
    "scale": 3.0,
    "clahe": True,
    "blur_method": "bilateral",
    "blur_ksize": 7,
    "thresh_method": "otsu",
    "morph_op": "close",
    "morph_ksize": 2,
}

TMP_DIR = Path("tmp_ocr")
TMP_DIR.mkdir(exist_ok=True)


@st.cache_resource
def load_ocr():
    return PaddleOCR(
        device=OCR_DEVICE,
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


class SharedState:
    def __init__(self):
        self._lock = threading.Lock()
        self._frame = None
        self._frame_id = 0
        self._roi_raw = None
        self._roi_processed = None
        self._data = None
        self.running = True
        self.threads_started = False

    def set_frame(self, frame):
        with self._lock:
            self._frame = frame
            self._frame_id += 1

    def get_frame_with_id(self):
        with self._lock:
            if self._frame is None:
                return None, -1
            return self._frame.copy(), self._frame_id

    def set_roi_raw(self, roi):
        with self._lock:
            self._roi_raw = roi

    def get_roi_raw(self):
        with self._lock:
            return self._roi_raw.copy() if self._roi_raw is not None else None

    def set_roi_processed(self, roi):
        with self._lock:
            self._roi_processed = roi

    def get_roi_processed(self):
        with self._lock:
            return self._roi_processed.copy() if self._roi_processed is not None else None

    def set_data(self, data):
        with self._lock:
            self._data = data

    def get_data(self):
        with self._lock:
            return deepcopy(self._data) if self._data is not None else None


def crop_roi(frame):
    # frame resize về 640x480
    return frame[427:469, 445:640]


import os
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import cv2
import time
import json
import threading
import re
from pathlib import Path
from collections import deque
from copy import deepcopy

import numpy as np
import pandas as pd
import streamlit as st
from paddleocr import PaddleOCR


RTSP_URL = "rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101"
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
HISTORY_LEN = 120
RECONNECT_DELAY = 2

OCR_DEVICE = "gpu:0"

PREPROCESS_PARAMS = {
    "scale": 2.3,
    "blur_method": "gaussian",    # gaussian / bilateral / median / none
    "blur_ksize": 3,
    "thresh_method": "fixed",     # fixed / otsu / adaptive / none
    "thresh_val": 200,
    "adaptive_block": 23,
    "adaptive_c": 4,
    "morph_op": "none",         # dilate / erode / close / open / none
    "morph_ksize": 2,
    "clahe": False,
}

TMP_DIR = Path("tmp_ocr")
TMP_DIR.mkdir(exist_ok=True)


@st.cache_resource
def load_ocr():
    return PaddleOCR(
        device=OCR_DEVICE,
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


class SharedState:
    def __init__(self):
        self._lock = threading.Lock()
        self._frame = None
        self._frame_id = 0
        self._roi_raw = None
        self._roi_processed = None
        self._data = None
        self.running = True
        self.threads_started = False

    def set_frame(self, frame):
        with self._lock:
            self._frame = frame
            self._frame_id += 1

    def get_frame_with_id(self):
        with self._lock:
            if self._frame is None:
                return None, -1
            return self._frame.copy(), self._frame_id

    def set_roi_raw(self, roi):
        with self._lock:
            self._roi_raw = roi

    def get_roi_raw(self):
        with self._lock:
            return self._roi_raw.copy() if self._roi_raw is not None else None

    def set_roi_processed(self, roi):
        with self._lock:
            self._roi_processed = roi

    def get_roi_processed(self):
        with self._lock:
            return self._roi_processed.copy() if self._roi_processed is not None else None

    def set_data(self, data):
        with self._lock:
            self._data = data

    def get_data(self):
        with self._lock:
            return deepcopy(self._data) if self._data is not None else None


def crop_roi(frame):
    # frame resize về 640x480
    return frame[427:469, 445:640]


def preprocess_for_ocr(roi):
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    gray = cv2.bilateralFilter(gray, 5, 40, 40)
    gray = cv2.medianBlur(gray, 3)

    th = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7
    )

    # mở nhẹ để bỏ chấm nhiễu
    k_open = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, k_open, iterations=1)

    # dày chữ nhẹ
    k_dilate = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 1))
    th = cv2.dilate(th, k_dilate, iterations=1)

    return cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)
def postprocess_text(text: str) -> str:
    text = re.sub(r"\?\?", "77", text)
    text = re.sub(r"(?<=\d)\?|(?<=\d)\?(?=\d)|\?(?=\d)", "7", text)
    text = re.sub(r"(\d)\?", r"\g<1>7", text)
    text = re.sub(r"\?(\d)", r"7\1", text)
    text = re.sub(r"(?<=\d)O(?=\d)", "0", text)
    text = re.sub(r"(?<=\d)[lI](?=\d)", "1", text)
    text = re.sub(r"(?<=\d)S(?=\d)", "5", text)
    return text


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


def capture_thread(state):
    cap = None

    while state.running:
        if cap is not None:
            cap.release()
            cap = None
            time.sleep(0.5)

        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        if not cap.isOpened():
            print(f"[CAPTURE] Khong ket noi duoc RTSP, thu lai sau {RECONNECT_DELAY}s...")
            time.sleep(RECONNECT_DELAY)
            continue

        print("[CAPTURE] Ket noi thanh cong.")
        failures = 0

        while state.running:
            ret, frame = cap.read()
            if not ret:
                failures += 1
                if failures >= 5:
                    print("[CAPTURE] Mat stream, reconnect...")
                    break
                time.sleep(0.1)
                continue

            failures = 0
            frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
            state.set_frame(frame)

        cap.release()
        cap = None

        if state.running:
            time.sleep(RECONNECT_DELAY)


def ocr_thread(state, ocr_model):
    print("[OCR] Thread bat dau.")
    last_processed_id = -1

    while state.running:
        try:
            frame, frame_id = state.get_frame_with_id()

            if frame is None:
                time.sleep(0.02)
                continue

            if frame_id == last_processed_id:
                time.sleep(0.01)
                continue

            last_processed_id = frame_id

            roi_raw = crop_roi(frame)
            roi_processed = preprocess_for_ocr(roi_raw)

            state.set_roi_raw(roi_raw)
            state.set_roi_processed(roi_processed)

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

            print(f"[OCR TIME]      {time.strftime('%H:%M:%S')}")
            print(f"[OCR SOURCE]    {source}")
            print(f"[OCR RAW]       {repr(final_text)}")
            print(f"[OCR CORRECTED] {repr(postprocess_text(final_text))}")

            state.set_data(parse_text(final_text, source))

        except Exception as e:
            print(f"[OCR] Loi: {e}")
            time.sleep(0.05)


def start_background_threads(state, ocr_model):
    if state.threads_started:
        return
    state.threads_started = True
    threading.Thread(target=capture_thread, args=(state,), daemon=True).start()
    threading.Thread(target=ocr_thread, args=(state, ocr_model), daemon=True).start()


st.set_page_config(page_title="OCR Realtime", layout="wide")
st.title("OCR Realtime - PaddleOCR GPU")

ocr_model = load_ocr()

if "state" not in st.session_state:
    state = SharedState()
    st.session_state.state = state
    start_background_threads(state, ocr_model)
else:
    state = st.session_state.state

if "history" not in st.session_state:
    st.session_state.history = deque(maxlen=HISTORY_LEN)

col_btn1, col_btn2, col_status = st.columns([1, 1, 4])

with col_btn1:
    if st.button("Start", width="stretch"):
        state.running = True
        if not state.threads_started:
            start_background_threads(state, ocr_model)

with col_btn2:
    if st.button("Stop", width="stretch"):
        state.running = False
        state.threads_started = False

with col_status:
    badge = "**Running**" if state.running else "**Stopped**"
    st.markdown(f"### {badge}")

st.divider()

col_video, col_info = st.columns([3, 2])

with col_video:
    st.subheader("Camera Feed")
    video_slot = st.empty()

    col_roi1, col_roi2 = st.columns(2)
    with col_roi1:
        st.subheader("ROI gốc")
        roi_raw_slot = st.empty()
    with col_roi2:
        st.subheader("ROI (sau tiền xử lý)")
        roi_slot = st.empty()

with col_info:
    st.subheader("OCR Output")
    metric_freq = st.empty()
    metric_db = st.empty()
    metric_band = st.empty()
    metric_source = st.empty()
    st.divider()
    st.caption("Raw → Corrected (debug)")
    raw_slot = st.empty()
    st.caption("JSON parsed")
    json_slot = st.empty()

st.subheader("Chart")
chart_slot = st.empty()

while True:
    if not state.running:
        time.sleep(0.2)
        continue

    frame, _ = state.get_frame_with_id()
    roi_raw = state.get_roi_raw()
    roi = state.get_roi_processed()
    data = state.get_data()

    if frame is not None:
        video_slot.image(
            cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
            caption="RTSP Live",
            width="stretch"
        )

    if roi_raw is not None:
        roi_raw_slot.image(
            cv2.cvtColor(roi_raw, cv2.COLOR_BGR2RGB),
            width="stretch"
        )

    if roi is not None:
        roi_slot.image(
            cv2.cvtColor(roi, cv2.COLOR_BGR2RGB),
            width="stretch"
        )

    if data:
        freq = data.get("max_frequency_hz")
        db = data.get("max_decibel_db")
        band = data.get("frequency_band") or "—"
        source = data.get("source") or "—"

        metric_freq.metric("Max Frequency", f"{freq:,.2f} Hz" if freq is not None else "—")
        metric_db.metric("Max Decibel", f"{db:.2f} dB" if db is not None else "—")
        metric_band.metric("Freq Band", band)
        metric_source.metric("OCR Source", source)

        raw_slot.code(
            f"RAW:       {data.get('raw', '')}\n"
            f"CORRECTED: {data.get('corrected', '')}",
            language=None,
        )

        json_slot.code(
            json.dumps(
                {k: v for k, v in data.items() if k not in ("raw", "corrected")},
                indent=4,
                ensure_ascii=False,
            ),
            language="json",
        )

        if freq is not None or db is not None:
            st.session_state.history.append({
                "time": data["time"],
                "Max Frequency (Hz)": freq,
                "Max Decibel (dB)": db,
            })

    if st.session_state.history:
        df = pd.DataFrame(list(st.session_state.history)).set_index("time")
        chart_slot.line_chart(df, height=220)

    time.sleep(0.05)


def postprocess_text(text: str) -> str:
    text = re.sub(r"\?\?", "77", text)
    text = re.sub(r"(?<=\d)\?|(?<=\d)\?(?=\d)|\?(?=\d)", "7", text)
    text = re.sub(r"(\d)\?", r"\g<1>7", text)
    text = re.sub(r"\?(\d)", r"7\1", text)
    text = re.sub(r"(?<=\d)O(?=\d)", "0", text)
    text = re.sub(r"(?<=\d)[lI](?=\d)", "1", text)
    text = re.sub(r"(?<=\d)S(?=\d)", "5", text)
    return text


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


def capture_thread(state):
    cap = None

    while state.running:
        if cap is not None:
            cap.release()
            cap = None
            time.sleep(0.5)

        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        if not cap.isOpened():
            print(f"[CAPTURE] Khong ket noi duoc RTSP, thu lai sau {RECONNECT_DELAY}s...")
            time.sleep(RECONNECT_DELAY)
            continue

        print("[CAPTURE] Ket noi thanh cong.")
        failures = 0

        while state.running:
            ret, frame = cap.read()
            if not ret:
                failures += 1
                if failures >= 5:
                    print("[CAPTURE] Mat stream, reconnect...")
                    break
                time.sleep(0.1)
                continue

            failures = 0
            frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
            state.set_frame(frame)

        cap.release()
        cap = None

        if state.running:
            time.sleep(RECONNECT_DELAY)


def ocr_thread(state, ocr_model):
    print("[OCR] Thread bat dau.")
    last_processed_id = -1

    while state.running:
        try:
            frame, frame_id = state.get_frame_with_id()

            if frame is None:
                time.sleep(0.02)
                continue

            if frame_id == last_processed_id:
                time.sleep(0.01)
                continue

            last_processed_id = frame_id

            roi_raw = crop_roi(frame)
            roi_processed = preprocess_for_ocr(roi_raw)

            state.set_roi_raw(roi_raw)
            state.set_roi_processed(roi_processed)

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

            print(f"[OCR TIME]      {time.strftime('%H:%M:%S')}")
            print(f"[OCR SOURCE]    {source}")
            print(f"[OCR RAW]       {repr(final_text)}")
            print(f"[OCR CORRECTED] {repr(postprocess_text(final_text))}")

            state.set_data(parse_text(final_text, source))

        except Exception as e:
            print(f"[OCR] Loi: {e}")
            time.sleep(0.05)


def start_background_threads(state, ocr_model):
    if state.threads_started:
        return
    state.threads_started = True
    threading.Thread(target=capture_thread, args=(state,), daemon=True).start()
    threading.Thread(target=ocr_thread, args=(state, ocr_model), daemon=True).start()


st.set_page_config(page_title="OCR Realtime", layout="wide")
st.title("OCR Realtime - PaddleOCR GPU")

ocr_model = load_ocr()

if "state" not in st.session_state:
    state = SharedState()
    st.session_state.state = state
    start_background_threads(state, ocr_model)
else:
    state = st.session_state.state

if "history" not in st.session_state:
    st.session_state.history = deque(maxlen=HISTORY_LEN)

col_btn1, col_btn2, col_status = st.columns([1, 1, 4])

with col_btn1:
    if st.button("Start", width="stretch"):
        state.running = True
        if not state.threads_started:
            start_background_threads(state, ocr_model)

with col_btn2:
    if st.button("Stop", width="stretch"):
        state.running = False
        state.threads_started = False

with col_status:
    badge = "**Running**" if state.running else "**Stopped**"
    st.markdown(f"### {badge}")

st.divider()

col_video, col_info = st.columns([3, 2])

with col_video:
    st.subheader("Camera Feed")
    video_slot = st.empty()

    col_roi1, col_roi2 = st.columns(2)
    with col_roi1:
        st.subheader("ROI gốc")
        roi_raw_slot = st.empty()
    with col_roi2:
        st.subheader("ROI (sau tiền xử lý)")
        roi_slot = st.empty()

with col_info:
    st.subheader("OCR Output")
    metric_freq = st.empty()
    metric_db = st.empty()
    metric_band = st.empty()
    metric_source = st.empty()
    st.divider()
    st.caption("Raw → Corrected (debug)")
    raw_slot = st.empty()
    st.caption("JSON parsed")
    json_slot = st.empty()

st.subheader("Chart")
chart_slot = st.empty()

while True:
    if not state.running:
        time.sleep(0.2)
        continue

    frame, _ = state.get_frame_with_id()
    roi_raw = state.get_roi_raw()
    roi = state.get_roi_processed()
    data = state.get_data()

    if frame is not None:
        video_slot.image(
            cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
            caption="RTSP Live",
            width="stretch"
        )

    if roi_raw is not None:
        roi_raw_slot.image(
            cv2.cvtColor(roi_raw, cv2.COLOR_BGR2RGB),
            width="stretch"
        )

    if roi is not None:
        roi_slot.image(
            cv2.cvtColor(roi, cv2.COLOR_BGR2RGB),
            width="stretch"
        )

    if data:
        freq = data.get("max_frequency_hz")
        db = data.get("max_decibel_db")
        band = data.get("frequency_band") or "—"
        source = data.get("source") or "—"

        metric_freq.metric("Max Frequency", f"{freq:,.2f} Hz" if freq is not None else "—")
        metric_db.metric("Max Decibel", f"{db:.2f} dB" if db is not None else "—")
        metric_band.metric("Freq Band", band)
        metric_source.metric("OCR Source", source)

        raw_slot.code(
            f"RAW:       {data.get('raw', '')}\n"
            f"CORRECTED: {data.get('corrected', '')}",
            language=None,
        )

        json_slot.code(
            json.dumps(
                {k: v for k, v in data.items() if k not in ("raw", "corrected")},
                indent=4,
                ensure_ascii=False,
            ),
            language="json",
        )

        if freq is not None or db is not None:
            st.session_state.history.append({
                "time": data["time"],
                "Max Frequency (Hz)": freq,
                "Max Decibel (dB)": db,
            })

    if st.session_state.history:
        df = pd.DataFrame(list(st.session_state.history)).set_index("time")
        chart_slot.line_chart(df, height=220)

    time.sleep(0.05)