import os, sys, cv2, json, threading, time, subprocess, requests
from collections import deque
from urllib.parse import quote
import xml.etree.ElementTree as ET
import base64
from requests.auth import HTTPDigestAuth
import ctypes

# ── Cấu hình SDK (Hikvision chính hãng) ──
SDK_PATH = r"d:\test_sdk"
sys.path.insert(0, SDK_PATH)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp" # Build-in OpenCV/FFmpeg TCP fix
try:
    import core.hcnet_sdk as core_sdk
    from core.hcnet_sdk import HCNetSDK
    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False

# ── Cấu hình đường dẫn (Cross-platform) ──
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Tham số từ môi trường (hoặc fix cứng Development) ──
CAMERA_IP = os.getenv("CAMERA_IP", "192.168.10.152")
USER = os.getenv("CAMERA_USER", "admin")
PASSWORD = os.getenv("CAMERA_PASSWORD", "Demo@2024") # admin:Demo@2024 cho cam .152
API_URL = os.getenv("API_URL", "http://localhost:5056/api/v1")

# ── Cấu hình FFmpeg (Cross-platform: Windows & Jetson) ──
ROOT_DIR = os.path.dirname(CURRENT_DIR)
if sys.platform == 'win32':
    FFMPEG_BIN = os.path.join(ROOT_DIR, "frontend", "bin", "ffmpeg.exe")
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

# ── Logging ──
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

# ── Global state ──
SNAPSHOT_EVENT = threading.Event()
SNAPSHOT_TRIGGER_INFO = {"rule_id": 0, "temp": 0.0, "type": "alarm"}

LIVE_TEMPS = {}     # { ruleID: temperature }
ALARM_RULES = {}    # { ruleID: { "pre_alarm": float, "alarm": float, "name": str } }
COOLDOWN_MAP = {}   # { ruleID: next_allowed_time }
STREAK_MAP = {}     # { ruleID: consecutive_violation_count }
LIVE_EVENTS = {}    # { eventId: { "type": str, "detected_at": float, "event_data": dict } }

# ── Cấu hình File tọa độ ──
POINTS_FILE = os.path.join(CURRENT_DIR, "points_local.json")

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

debug_log("=== AI ENGINE RELAY STARTING (DIGEST AUTH VERSION) ===")

THERMAL_DEVICE_ID = None

def periodic_status_uploader():
    """Upload thermal data every 2 seconds"""
    global THERMAL_DEVICE_ID
    debug_log("[SYSTEM] Status Uploader Thread Started.")
    session = requests.Session()
    while True:
        try:
            if not THERMAL_DEVICE_ID:
                resp = session.get(f"{API_URL}/devices", timeout=10)
                if resp.status_code == 200:
                    devices = resp.json()
                    for d in devices:
                        cfg = d.get('config', '{}')
                        if isinstance(cfg, str): cfg = json.loads(cfg)
                        if cfg.get('ip') == CAMERA_IP:
                            THERMAL_DEVICE_ID = d.get('id')
                            debug_log(f"[INGEST] Found Device ID: {THERMAL_DEVICE_ID} for IP {CAMERA_IP}")
                            break
                    if not THERMAL_DEVICE_ID:
                        debug_log(f"[INGEST] Device with IP {CAMERA_IP} NOT FOUND in Backend. Ingest suspended.")

            if THERMAL_DEVICE_ID:
                payload = []
                for rid, coords in POINT_COORDS.items():
                    temp = LIVE_TEMPS.get(int(rid))
                    payload.append({
                        "deviceId": THERMAL_DEVICE_ID,
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
                            if not hasattr(periodic_status_uploader, "counter"): periodic_status_uploader.counter = 0
                            periodic_status_uploader.counter += 1
                            if periodic_status_uploader.counter % 30 == 0:
                                debug_log(f"[INGEST] Success: Sent {len(payload)} points for Device {THERMAL_DEVICE_ID}")
                        else:
                            debug_log(f"[INGEST] Failed to Backend: {res.status_code} - {res.text}")
                    except Exception as post_e:
                        debug_log(f"[INGEST] Network Error: {post_e}")
        except Exception as e:
            debug_log(f"[INGEST] Error: {e}")
        time.sleep(2)

threading.Thread(target=periodic_status_uploader, daemon=True).start()

def _extract_camera_rule_id(point_str: str):
    """Map point string -> camera rule ID"""
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

# --- SDK Thermal Data Fetcher (Fix for 0.0 temp) ---
class NET_DVR_THERMOMETRY_PRESETINFO_PARAM(ctypes.Structure):
    _fields_ = [
        ("byRuleID", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 3),
        ("fHighTemperature", ctypes.c_float),
        ("fLowTemperature", ctypes.c_float),
        ("fAverageTemperature", ctypes.c_float),
        ("byRes2", ctypes.c_ubyte * 40)
    ]

class NET_DVR_THERMOMETRY_PRESETINFO(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("wPresetNo", ctypes.c_ushort),
        ("byRes1", ctypes.c_ubyte * 2),
        ("byRuleNum", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 3),
        ("struPresetInfo", NET_DVR_THERMOMETRY_PRESETINFO_PARAM * 40),
        ("byRes", ctypes.c_ubyte * 16)
    ]

class ThermalSDK:
    """Listen to camera thermometry data via Hikvision SDK"""
    def __init__(self, camera_ip, user, password):
        self.camera_ip = camera_ip
        self.user = user
        self.password = password
        self.running = False
        self.sdk = None
        self.user_id = -1

    def start(self):
        if not SDK_AVAILABLE:
            debug_log("[THERMAL] SDK folder NOT FOUND at d:\\test_sdk")
            return
        self.running = True
        threading.Thread(target=self._poll_loop, daemon=True).start()
        debug_log("[THERMAL] SDK Monitor Started (Port 8000)")

    def _poll_loop(self):
        self.sdk = HCNetSDK(SDK_PATH)
        if not self.sdk.init():
            debug_log("[THERMAL] SDK Init Failed")
            return

        while self.running:
            try:
                if self.user_id < 0:
                    self.user_id, _ = self.sdk.login(self.camera_ip, 8000, self.user, self.password)
                    if self.user_id < 0:
                        debug_log(f"[THERMAL] SDK Login Failed ({self.camera_ip})")
                        time.sleep(10)
                        continue

                cond = core_sdk.NET_DVR_THERMOMETRY_COND()
                cond.dwSize = ctypes.sizeof(core_sdk.NET_DVR_THERMOMETRY_COND)
                cond.dwChannel = 2 
                cond.wPresetNo = 1
                
                info = NET_DVR_THERMOMETRY_PRESETINFO()
                info.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_PRESETINFO)
                
                std_get = core_sdk.NET_DVR_STD_CONFIG()
                std_get.lpCondBuffer = ctypes.cast(ctypes.pointer(cond), ctypes.c_void_p)
                std_get.dwCondSize = cond.dwSize
                std_get.lpOutBuffer = ctypes.cast(ctypes.pointer(info), ctypes.c_void_p)
                std_get.dwOutSize = info.dwSize
                
                # Khởi tạo rõ ràng các con trỏ khác về NULL để tránh Access Violation
                std_get.lpInBuffer = None
                std_get.dwInSize = 0
                std_get.lpStatusBuffer = None
                std_get.dwStatusSize = 0
                std_get.lpXmlBuffer = None
                std_get.dwXmlSize = 0
                
                if self.sdk.hcnetsdk.NET_DVR_GetSTDConfig(self.user_id, 3624, ctypes.byref(std_get)):
                    for i in range(info.byRuleNum):
                        param = info.struPresetInfo[i]
                        rule_id = int(param.byRuleID)
                        temp = float(param.fHighTemperature)
                        if temp > -40 and temp < 200:
                            LIVE_TEMPS[rule_id] = temp
                else:
                    err = self.sdk.hcnetsdk.NET_DVR_GetLastError()
                    if err in [1, 7]: self.user_id = -1

            except Exception as e:
                debug_log(f"[THERMAL] SDK Error: {e}")
            time.sleep(2)

        if self.user_id >= 0: self.sdk.logout(self.user_id)
        self.sdk.cleanup()

class ThermalISAPI:
    """Legacy ISAPI Fetcher (Fallback)"""

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
        self.output_url = f"rtsp://localhost:8554/{output_id}"
        self.is_thermal = is_thermal
        self.running = True
        self.frame_buffer = deque(maxlen=100)

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _get_ffmpeg_process(self, w, h):
        cmd = [ FFMPEG_BIN, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{w}x{h}", '-r', '20', '-i', '-', 
            '-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '28',
            '-g', '40', '-keyint_min', '20', # Fix Broken pipe bằng cách chia nhỏ I-frame
            '-b:v', '2M', '-maxrate', '2M', '-bufsize', '4M', # Băng thông ổn định
            '-f', 'rtsp', self.output_url ]
        
        # Log ffmpeg output để debug sập video
        log_file = open(FFMPEG_LOG_PATH, "a")
        return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=log_file, stderr=log_file)

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
            # Hiển thị nhiệt độ kèm background để dễ đọc
            label = f"P{pid}: {temp:.1f}C"
            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            # Vẽ nền đen mờ
            cv2.rectangle(frame, (x + 5, y - 10 - th - 5), (x + 5 + tw + 2, y - 10 + 2), (0, 0, 0), -1)
            # Chữ trắng, hoặc đỏ nếu quá nóng
            txt_color = (0, 0, 255) if temp >= 50 else (255, 255, 255)
            cv2.putText(frame, label, (x + 5, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, txt_color, 1)

    def _run(self):
        """Main loop with auto-restart watchdog for FFmpeg"""
        while self.running:
            debug_log(f"[{self.name}] Connecting to Camera: {self.rtsp_url}")
            cap = cv2.VideoCapture(self.rtsp_url)
            if not cap.isOpened():
                debug_log(f"[{self.name}] Camera connection failed. Retrying in 5s...")
                time.sleep(5); continue
            
            w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w <= 0: cap.release(); time.sleep(1); continue
            
            debug_log(f"[{self.name}] Starting FFmpeg Relay: {self.output_url} ({w}x{h})")
            pipe = self._get_ffmpeg_process(w, h)
            blink = 0
            
            try:
                while self.running:
                    ret, frame = cap.read()
                    if not ret: 
                        debug_log(f"[{self.name}] Stream read failed. Restarting cap...")
                        break
                    
                    blink = (blink + 1) % 10
                    self._draw_points(frame, blink < 5)
                    
                    if pipe and pipe.stdin:
                        try:
                            pipe.stdin.write(frame.tobytes())
                        except (BrokenPipeError, OSError):
                            debug_log(f"[{self.name}] FFmpeg Pipe Broken. Restarting...")
                            break
                    
                    # Kiểm tra xem FFmpeg có còn sống không
                    if pipe.poll() is not None:
                        debug_log(f"[{self.name}] FFmpeg terminated unexpectedly. Restarting...")
                        break
            except Exception as e:
                debug_log(f"[{self.name}] Runtime Error: {e}")
            finally:
                cap.release()
                if pipe:
                    try: pipe.terminate()
                    except: pass
                time.sleep(2)

def cleanup_old_events():
    global LIVE_EVENTS
    while True:
        now = time.time()
        LIVE_EVENTS = {k: v for k, v in LIVE_EVENTS.items() if v.get("detected_at", 0) > now - 3600}
        time.sleep(300)

if __name__ == "__main__":
    # Sử dụng SDK thay cho ISAPI để khắc phục hoàn toàn lỗi 0.0
    thermal = ThermalSDK(CAMERA_IP, USER, PASSWORD)
    thermal.start()
    event_listener = EventStreamListener(CAMERA_IP, USER, PASSWORD)
    event_listener.start()
    threading.Thread(target=sync_rules_loop, daemon=True).start()
    threading.Thread(target=cleanup_old_events, daemon=True).start()
    
    relay_opt = StreamRelay("OPTICAL", OPTICAL_URL, "camera_152_normal", is_thermal=False)
    relay_thm = StreamRelay("THERMAL", THERMAL_URL, "camera_152_thermal", is_thermal=True)
    relay_opt.start(); relay_thm.start()
    
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass
