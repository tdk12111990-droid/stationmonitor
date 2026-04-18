import os, sys, cv2, json, threading, time, subprocess, requests
import numpy as np
import ctypes
from collections import deque
from urllib.parse import quote
import xml.etree.ElementTree as ET
import base64
from requests.auth import HTTPDigestAuth

# SDK path
SDK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_sdk")
if SDK_DIR not in sys.path:
    sys.path.insert(0, SDK_DIR)

# ── Cấu hình đường dẫn (Cross-platform) ──
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Tham số từ môi trường (hoặc fix cứng Development) ──
CAMERA_IP = os.getenv("CAMERA_IP", "192.168.10.152")
USER = os.getenv("CAMERA_USER", "admin")
PASSWORD = os.getenv("CAMERA_PASSWORD", "Demo@2024") # admin:Demo@2024 cho cam .152
API_URL = os.getenv("API_URL", "http://localhost:5056/api/v1")

# ── Cấu hình FFmpeg (Cross-platform: Windows & Jetson) ──
if sys.platform == 'win32':
    FFMPEG_BIN = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(CURRENT_DIR))), "frontend", "bin", "ffmpeg.exe")
    if not os.path.exists(FFMPEG_BIN):
        FFMPEG_BIN = "ffmpeg"
else:
    FFMPEG_BIN = "ffmpeg"

ENCODED_PASS = quote(PASSWORD)
OPTICAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/101"
THERMAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/201"
FFMPEG_LOG_PATH = os.path.join(CURRENT_DIR, "ffmpeg_relay.log")

# ── Thư mục dữ liệu ──
WWWROOT_DIR = os.getenv("WWWROOT_PATH", os.path.join(os.path.dirname(os.path.dirname(CURRENT_DIR)), "wwwroot"))
ALERTS_DIR = os.path.join(WWWROOT_DIR, "detections")
VIDEOS_DIR = os.path.join(WWWROOT_DIR, "videos")

# ── Cấu hình File tọa độ (Dùng cho vẽ Dots trên UI) ──
POINTS_FILE = os.path.join(CURRENT_DIR, "points_local.json")
# Fallback nếu không có ở CURRENT_DIR, tìm ở thư mục viewer cũ (nếu có)
if not os.path.exists(POINTS_FILE):
    ALT_POINTS_FILE = r"D:\test_sdk\apps\desktop_viewer\points_local.json"
    if os.path.exists(ALT_POINTS_FILE): POINTS_FILE = ALT_POINTS_FILE

# ── Logging (định nghĩa trước khi dùng) ──
DEBUG_LOG_FILE = os.path.join(CURRENT_DIR, "ai_diagnostics.log")

def debug_log(msg):
    """Log to file and stdout"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted_msg = f"[{timestamp}] {msg}\n"
    print(formatted_msg, end='')
    try:
        with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted_msg)
    except: pass

def load_points_config():
    if os.path.exists(POINTS_FILE):
        try:
            with open(POINTS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                debug_log(f"[SYSTEM] Loaded {len(data)} point coordinates from {POINTS_FILE}")
                return data
        except Exception as e:
            debug_log(f"[SYSTEM] Error loading points: {e}")
            return {}
    debug_log(f"[SYSTEM] Points file NOT FOUND: {POINTS_FILE}")
    return {}

POINT_COORDS = load_points_config()

# ── Global state ──
SNAPSHOT_EVENT = threading.Event()
SNAPSHOT_TRIGGER_INFO = {"rule_id": 0, "temp": 0.0, "type": "alarm"}

LIVE_TEMPS = {}     # { ruleID: temperature }
ALARM_RULES = {}    # { ruleID: { "pre_alarm": float, "alarm": float, "name": str } }
COOLDOWN_MAP = {}   # { ruleID: next_allowed_time }
STREAK_MAP = {}     # { ruleID: consecutive_violation_count }
LIVE_EVENTS = {}    # { eventId: { "type": str, "detected_at": float, "event_data": dict } }

debug_log("=== AI ENGINE RELAY STARTING (DIGEST AUTH VERSION) ===")

THERMAL_DEVICE_ID = None
OPTICAL_DEVICE_ID = None

def periodic_status_uploader():
    """Upload thermal data every 2 seconds to both thermal and optical camera devices"""
    global THERMAL_DEVICE_ID, OPTICAL_DEVICE_ID
    debug_log("[SYSTEM] Status Uploader Thread Started.")
    session = requests.Session()
    _counter = [0]
    while True:
        try:
            if not THERMAL_DEVICE_ID or not OPTICAL_DEVICE_ID:
                resp = session.get(f"{API_URL}/devices", timeout=10)
                if resp.status_code == 200:
                    devices = resp.json()
                    for d in devices:
                        cfg = d.get('config', '{}')
                        if isinstance(cfg, str): cfg = json.loads(cfg)
                        if cfg.get('ip') == CAMERA_IP:
                            go2rtc_id = cfg.get('go2rtc_id', '')
                            dtype = d.get('type', '')
                            if 'thermal' in go2rtc_id or 'thermal' in dtype:
                                THERMAL_DEVICE_ID = d.get('id')
                                debug_log(f"[INGEST] Found Thermal Device: {THERMAL_DEVICE_ID}")
                            else:
                                OPTICAL_DEVICE_ID = d.get('id')
                                debug_log(f"[INGEST] Found Optical Device: {OPTICAL_DEVICE_ID}")
                    if not THERMAL_DEVICE_ID and not OPTICAL_DEVICE_ID:
                        debug_log(f"[INGEST] No device with IP {CAMERA_IP} found in Backend.")

            device_ids = [did for did in [THERMAL_DEVICE_ID, OPTICAL_DEVICE_ID] if did]
            if device_ids:
                payload = []
                for did in device_ids:
                    for rid, coords in POINT_COORDS.items():
                        temp = LIVE_TEMPS.get(int(rid))
                        payload.append({
                            "deviceId": did,
                            "pointId": f"P{rid}",
                            "value": temp if temp is not None else 0.0,
                            "unit": "°C",
                            "tx": coords.get("tx"),
                            "ty": coords.get("ty"),
                            "ox": coords.get("ox"),
                            "oy": coords.get("oy")
                        })

                if payload:
                    try:
                        res = session.post(f"{API_URL}/measurements/ingest", json=payload, timeout=15)
                        if res.status_code == 200:
                            _counter[0] += 1
                            if _counter[0] % 30 == 0:
                                debug_log(f"[INGEST] OK: {len(payload)} points → {len(device_ids)} cameras")
                        else:
                            debug_log(f"[INGEST] Failed: {res.status_code} - {res.text}")
                    except Exception as post_e:
                        debug_log(f"[INGEST] Network Error: {post_e}")
        except Exception as e:
            debug_log(f"[INGEST] Error: {e}")
        time.sleep(2)

threading.Thread(target=periodic_status_uploader, daemon=True).start()

def _extract_camera_rule_id(point_str: str):
    """Map point string → camera rule ID"""
    if not point_str:
        return None
    s = point_str.strip()
    if s.upper().startswith('P') and s[1:].isdigit():
        return int(s[1:])
    if 'nhiet_do_pha_' in s:
        digits = s.split('nhiet_do_pha_')[-1].split('_')[0]
        if digits.isdigit():
            return int(digits)
    digits = ''.join(filter(str.isdigit, s))
    if digits:
        return int(digits)
    return None

def sync_rules_loop():
    """Sync rules from backend every 5 seconds"""
    global ALARM_RULES
    debug_log("[SYSTEM] Rules Sync Thread Started.")
    while True:
        try:
            resp = requests.get(f"{API_URL}/rules", timeout=10)
            if resp.status_code == 200:
                rules_data = resp.json()
                new_rules = {}
                for r in rules_data:
                    try:
                        if not r.get('enabled', True):
                            continue
                        cond_str = r.get('condition', '{}')
                        cond = json.loads(cond_str) if isinstance(cond_str, str) else cond_str
                        point_str = cond.get('point', '')
                        rid = _extract_camera_rule_id(point_str)
                        if rid is None:
                            continue

                        pre = cond.get('pre_alarm')
                        if pre is None: pre = cond.get('value')
                        alarm = cond.get('alarm')

                        pre_val = float(pre) if pre is not None else None
                        alarm_val = float(alarm) if alarm is not None else None

                        if rid in new_rules:
                            existing = new_rules[rid]
                            if pre_val is not None:
                                existing["pre_alarm"] = min(existing["pre_alarm"], pre_val) if existing["pre_alarm"] is not None else pre_val
                            if alarm_val is not None:
                                existing["alarm"] = min(existing["alarm"], alarm_val) if existing["alarm"] is not None else alarm_val
                        else:
                            new_rules[rid] = {
                                "pre_alarm": pre_val,
                                "alarm": alarm_val,
                                "name": r.get('name', f"P{rid}")
                            }
                    except Exception as e:
                        continue

                ALARM_RULES = new_rules
            else:
                debug_log(f"[SYSTEM] Rule Sync Failed: HTTP {resp.status_code}")
        except Exception as e:
            debug_log(f"[SYSTEM] Rule Sync Error: {e}")
        time.sleep(5)

class ThermalSDK:
    """Lấy nhiệt độ 10 điểm đo realtime qua SDK (thay thế ISAPI)"""
    def __init__(self, camera_ip, user, password):
        self.camera_ip = camera_ip
        self.user = user
        self.password = password
        self.running = False
        self.sdk = None
        self.user_id = -1
        self.handle = -1
        self._callback_ref = None

    def start(self):
        self.running = True
        threading.Thread(target=self._run, daemon=True).start()
        debug_log("[THERMAL] SDK Thermal Monitor Starting...")

    def _run(self):
        try:
            from core.hcnet_sdk import (
                HCNetSDK, NET_DVR_THERMOMETRY_COND,
                NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback
            )

            self.sdk = HCNetSDK(SDK_DIR)
            if not self.sdk.init():
                debug_log("[THERMAL] SDK init failed, fallback to ISAPI")
                self._fallback_isapi()
                return

            self.user_id, _ = self.sdk.login(self.camera_ip, 8000, self.user, self.password)
            if self.user_id < 0:
                debug_log(f"[THERMAL] SDK login failed, fallback to ISAPI")
                self._fallback_isapi()
                return

            debug_log(f"[THERMAL] SDK login OK (UserID={self.user_id})")

            _cb_count = [0]
            def _callback(dwType, pBuffer, dwBufLen, pUserData):
                if dwType == 2:  # NET_SDK_CALLBACK_TYPE_DATA
                    try:
                        data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
                        rid = data.byRuleID
                        temp = data.fMaxTemperature
                        if 1 <= rid <= 20 and -50 < temp < 2000:
                            LIVE_TEMPS[rid] = temp
                            _cb_count[0] += 1
                            if _cb_count[0] % 10 == 1:
                                debug_log(f"[THERMAL] SDK data: rule={rid} temp={temp:.1f}C LIVE_TEMPS={dict(list(LIVE_TEMPS.items())[:3])}")
                    except Exception as e:
                        debug_log(f"[THERMAL] Callback error: {e}")

            self._callback_ref = RemoteConfigCallback(_callback)

            cond = NET_DVR_THERMOMETRY_COND()
            cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
            cond.dwChannel = 2
            cond.wMode = 1

            self.handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
                self.user_id,
                3629,  # NET_DVR_GET_REALTIME_THERMOMETRY
                ctypes.byref(cond),
                ctypes.sizeof(cond),
                self._callback_ref,
                None
            )

            if self.handle < 0:
                debug_log(f"[THERMAL] SDK StartRemoteConfig failed, fallback to ISAPI")
                self._fallback_isapi()
                return

            debug_log("[THERMAL] SDK Thermal Monitor running (realtime callback)")

            while self.running:
                time.sleep(1)

        except Exception as e:
            debug_log(f"[THERMAL] SDK error: {e}, fallback to ISAPI")
            self._fallback_isapi()

    def _fallback_isapi(self):
        """Fallback dùng ISAPI nếu SDK lỗi"""
        debug_log("[THERMAL] Using ISAPI fallback (limited data)")
        session = requests.Session()
        auth = HTTPDigestAuth(self.user, self.password)
        while self.running:
            try:
                url = f"http://{self.camera_ip}/ISAPI/Thermal/channels/2/thermometry/jpegPicWithAppendData?format=json"
                r = session.get(url, auth=auth, timeout=5)
                if r.status_code == 200:
                    import re, struct
                    raw = r.content
                    # Parse float32 temperature matrix từ binary data
                    parts = raw.split(b'--boundary')
                    for part in parts:
                        if b'Content-Type: application/octet-stream' in part or len(part) > 100000:
                            data_start = part.find(b'\r\n\r\n')
                            if data_start >= 0:
                                bin_data = part[data_start+4:]
                                floats = struct.unpack(f'{len(bin_data)//4}f', bin_data[:len(bin_data)//4*4])
                                arr = np.array(floats)
                                valid = arr[(arr > -50) & (arr < 2000)]
                                if len(valid) > 1000:
                                    debug_log(f"[THERMAL] ISAPI matrix: min={valid.min():.1f} max={valid.max():.1f}")
                                    break
            except Exception as e:
                pass
            time.sleep(2)

class EventStreamListener:
    """Listen to camera event stream via ISAPI Digest Auth"""
    def __init__(self, camera_ip, user, password):
        self.camera_ip = camera_ip
        self.user = user
        self.password = password
        self.session = requests.Session()
        self.auth = HTTPDigestAuth(user, password)
        self.running = False

    def start(self):
        self.running = True
        threading.Thread(target=self._listen_loop, daemon=True).start()
        debug_log("[EVENTS] Event Stream Listener Started (Digest Mode)")

    def _listen_loop(self):
        while self.running:
            try:
                url = f"http://{self.camera_ip}/ISAPI/Event/notification/alertStream"
                response = self.session.get(url, auth=self.auth, stream=True, timeout=(5, None))

                if response.status_code == 200:
                    debug_log("[EVENTS] Connected to event stream")
                    event_buffer = []
                    for line in response.iter_lines(decode_unicode=True):
                        if not self.running: break
                        if not line: continue
                        if any(line.startswith(m) for m in ["--boundary", "--hikdata", "--"]):
                            if event_buffer:
                                self._process_event("\n".join(event_buffer))
                                event_buffer = []
                        elif not line.startswith("Content-"):
                            event_buffer.append(line)
                else:
                    debug_log(f"[EVENTS] Stream connection failed: {response.status_code}")
                    time.sleep(5)
            except Exception as e:
                time.sleep(5)

    def _process_event(self, event_xml):
        try:
            event_xml = event_xml.strip()
            if not event_xml.startswith("<"): return
            root = ET.fromstring(event_xml)
            etype = root.findtext(".//eventType", "unknown")
            eid = root.findtext(".//eventId", "")
            if eid:
                cat = self._categorize_event(etype, root.findtext(".//aiEventType", ""), root.findtext(".//eventState", ""))
                if cat:
                    LIVE_EVENTS[eid] = {"type": cat, "detected_at": time.time()}
                    if root.findtext(".//eventState", "") == "active":
                        self._report_event_to_backend(eid, cat)
        except: pass

    def _categorize_event(self, etype, ai_type, state):
        etype, ai_type = etype.lower(), ai_type.lower()
        if "fire" in etype or "fire" in ai_type: return "fire"
        if "smoke" in etype or "smoke" in ai_type: return "smoke"
        if "motion" in etype: return "motion"
        return None

    def _report_event_to_backend(self, eid, cat):
        try:
            payload = {"eventType": cat, "eventId": eid, "severity": "critical" if cat in ["fire","smoke"] else "warning", "cameraIp": self.camera_ip}
            self.session.post(f"{API_URL}/alerts", json=payload, timeout=5)
        except: pass

class StreamRelay:
    """Handle RTSP streaming with CV2-burned drawings and FFmpeg push"""
    def __init__(self, name, rtsp_url, output_id, is_thermal=False):
        self.name = name
        self.rtsp_url = rtsp_url
        self.output_url = f"rtsp://127.0.0.1:8554/{output_id}"
        self.is_thermal = is_thermal
        self.running = True
        self.frame_buffer = deque(maxlen=100)

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _get_ffmpeg_process(self, w, h):
        cmd = [ FFMPEG_BIN, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{w}x{h}", '-r', '20', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '28', '-f', 'rtsp', self.output_url ]
        return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _draw_points(self, frame, blink):
        global ALARM_RULES, LIVE_TEMPS, POINT_COORDS
        h, w = frame.shape[:2]
        for pid, coords in POINT_COORDS.items():
            kx, ky = (coords.get('tx'), coords.get('ty')) if self.is_thermal else (coords.get('ox'), coords.get('oy'))
            if kx is None or ky is None: continue
            x, y = int(kx * w), int(ky * h)
            rule_id = int(pid)
            temp = LIVE_TEMPS.get(rule_id, 0.0)
            rule = ALARM_RULES.get(rule_id, {})
            pre, alarm = rule.get("pre_alarm"), rule.get("alarm")
            
            color = (0, 255, 0) # Green
            if alarm and temp >= alarm: color = (0, 0, 255) if blink else (255, 255, 255)
            elif pre and temp >= pre: color = (0, 255, 255)
            
            size = 4 if self.is_thermal else 12
            cv2.line(frame, (x-size, y), (x+size, y), color, 1)
            cv2.line(frame, (x, y-size), (x, y+size), color, 1)
            if temp > 0:
                cv2.putText(frame, f"P{pid}: {temp:.1f}C", (x+5, y-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    def _run(self):
        while self.running:
            cap = cv2.VideoCapture(self.rtsp_url)
            if not cap.isOpened():
                time.sleep(5); continue
            w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w <= 0: cap.release(); time.sleep(1); continue
            pipe = self._get_ffmpeg_process(w, h)
            blink = 0
            try:
                while self.running:
                    ret, frame = cap.read()
                    if not ret: break
                    blink = (blink + 1) % 10
                    if pipe and pipe.stdin:
                        try: pipe.stdin.write(frame.tobytes())
                        except: break
            finally:
                cap.release()
                if pipe: pipe.terminate()
                time.sleep(2)

def cleanup_old_events():
    global LIVE_EVENTS
    while True:
        now = time.time()
        LIVE_EVENTS = {k: v for k, v in LIVE_EVENTS.items() if v.get("detected_at", 0) > now - 3600}
        time.sleep(300)

if __name__ == "__main__":
    thermal = ThermalSDK(CAMERA_IP, USER, PASSWORD)
    thermal.start()
    event_listener = EventStreamListener(CAMERA_IP, USER, PASSWORD)
    event_listener.start()
    threading.Thread(target=sync_rules_loop, daemon=True).start()
    threading.Thread(target=cleanup_old_events, daemon=True).start()
    
    relay_opt = StreamRelay("OPTICAL", OPTICAL_URL, "camera_152_normal", is_thermal=False)
    relay_thm = StreamRelay("THERMAL", THERMAL_URL, "camera_152_thermal", is_thermal=True)
    relay_opt.start(); relay_thm.start()

    # Camera 153 (Phóng điện)
    camera_153_url = f"rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101"
    relay_153 = StreamRelay("CAMERA_153_PD", camera_153_url, "camera_153_pd", is_thermal=False)
    relay_153.start()
    
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass
