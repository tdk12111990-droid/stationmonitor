import os, sys, cv2, json, threading, time, subprocess, requests, numpy as np, ctypes
from collections import deque
from urllib.parse import quote
# Tắt hoàn toàn các log nhiễu từ thư viện hệ thống
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["FFMPEG_LOG_LEVEL"] = "QUIET"
import xml.etree.ElementTree as ET
import base64
from requests.auth import HTTPDigestAuth
from external_api_pusher import ExternalApiPusher
from prediction_fetcher import PredictionFetcher

# ── Cấu hình đường dẫn ──
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR    = os.path.dirname(CURRENT_DIR)  # D:\StationMonitor

# SDK path (test_sdk/ nằm cùng thư mục sdk-relay/)
SDK_DIR = os.path.join(CURRENT_DIR, "test_sdk")
if SDK_DIR not in sys.path:
    sys.path.insert(0, SDK_DIR)

# ── Tham số từ môi trường (hoặc fix cứng Development) ──
CAMERA_IP = os.getenv("CAMERA_IP", "192.168.10.152")
USER = os.getenv("CAMERA_USER", "admin")
PASSWORD = os.getenv("CAMERA_PASSWORD", "Demo@2024") # admin:Demo@2024 cho cam .153
API_URL = os.getenv("API_URL", "http://localhost:5056/api/v1")
GO2RTC_RTSP = os.getenv("GO2RTC_RTSP_URL", "rtsp://127.0.0.1:8554")

# ── Cấu hình FFmpeg (Cross-platform: Windows & Jetson) ──
if sys.platform == 'win32':
    FFMPEG_BIN = os.path.join(ROOT_DIR, "media-server", "ffmpeg.exe")
    if not os.path.exists(FFMPEG_BIN):
        FFMPEG_BIN = "ffmpeg"
else:
    FFMPEG_BIN = "ffmpeg"

ENCODED_PASS = quote(PASSWORD)
OPTICAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/101"
THERMAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/201"
FFMPEG_LOG_PATH = os.path.join(CURRENT_DIR, "ffmpeg_relay.log")

# ── Thư mục dữ liệu ──
_default_wwwroot = os.path.join(ROOT_DIR, "backend", "StationMonitor.Api", "wwwroot")
WWWROOT_DIR = os.getenv("WWWROOT_PATH", _default_wwwroot)
# ALERTS_DIR và VIDEOS_DIR sẽ được RuleEngine tự xác định dựa trên WWWROOT_DIR

# ── Cấu hình File tọa độ (Dùng cho vẽ Dots trên UI) ──
POINTS_FILE = os.path.join(CURRENT_DIR, "points_local.json")

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
PREDICTED_TEMPS = {} # { ruleID: temperature } - Dữ liệu dự báo AI
ALARM_RULES = {}    # { ruleID: { "pre_alarm": float, "alarm": float, "name": str } }
COOLDOWN_MAP = {}   # { ruleID: next_allowed_time }
STREAK_MAP = {}     # { ruleID: consecutive_violation_count }
LIVE_EVENTS = {}    # { eventId: { "type": str, "detected_at": float, "event_data": dict } }

# Circular Buffer cho Video: Lưu khoảng 10 giây (150 frames ở 15fps)
FRAME_BUFFER = deque(maxlen=150)
RECORDING_LOCK = threading.Lock()

# ── Rule Engine Logic ──
class RuleEngine:
    def __init__(self, api_url):
        self.api_url = api_url
        self.streaks = {}      # { ruleId: count }
        self.cooldowns = {}    # { ruleId: timestamp }
        self.confirm_needed = 150 # Xác nhận trong 10 giây (15fps * 10s)

    def check(self, rule_id, temp, frame):
        now = time.time()
        rule = ALARM_RULES.get(rule_id)
        if not rule: return

        alarm_threshold = rule.get("alarm")
        pre_threshold   = rule.get("pre_alarm")

        trigger_type = None
        if alarm_threshold and temp >= alarm_threshold:
            trigger_type = "alarm"
        elif pre_threshold and temp >= pre_threshold:
            trigger_type = "warning"

        if not trigger_type:
            self.streaks[rule_id] = 0
            return

        # Cooldown 5 phút
        if self.cooldowns.get(rule_id, 0) > now:
            return

        self.streaks[rule_id] = self.streaks.get(rule_id, 0) + 1
        if self.streaks[rule_id] >= self.confirm_needed:
            self._trigger_alert(rule_id, temp, trigger_type, frame)
            self.cooldowns[rule_id] = now + 300  # 5 phút
            self.streaks[rule_id] = 0

    def _trigger_alert(self, rule_id, temp, level, frame):
        debug_log(f"[ALERT] Rule {rule_id} triggered! Temp={temp:.1f}C Level={level}")
        try:
            # Gửi alert lên backend (kèm thumbnail = frame hiện tại có overlay)
            xml_data = (
                f"<EventNotificationAlert>"
                f"<ipAddress>{CAMERA_IP}</ipAddress>"
                f"<dateTime>{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}</dateTime>"
                f"<eventType>temperatureDetection</eventType>"
                f"<eventState>active</eventState>"
                f"<eventDescription>Điểm P{rule_id} vượt ngưỡng {level}: {temp:.1f}°C</eventDescription>"
                f"<maxTemp>{temp:.2f}</maxTemp>"
                f"<channelID>2</channelID>"
                f"</EventNotificationAlert>"
            )
            _, img_encoded = cv2.imencode('.jpg', frame)
            requests.post(
                f"{self.api_url}/camera-webhook",
                files={
                    'event':    (None, xml_data),
                    'image_hd': ('thumbnail.jpg', img_encoded.tobytes(), 'image/jpeg'),
                },
                timeout=5
            )
            debug_log(f"[ALERT] P{rule_id} alert posted to backend")

            # Quay video 10s trong luồng riêng
            threading.Thread(
                target=self._record_video_clip,
                args=(rule_id, level),
                daemon=True
            ).start()

        except Exception as e:
            debug_log(f"[ALERT] Failed: {e}")

    def _record_video_clip(self, rule_id, level):
        """Quay video 10s: 5s trước + 5s sau sự kiện, có overlay điểm nhiệt"""
        try:
            debug_log(f"[VIDEO] Recording 10s clip for P{rule_id}...")

            # Lấy ~5s trước (75 frames tại 15fps)
            with RECORDING_LOCK:
                pre_frames = list(FRAME_BUFFER)[-75:]

            # Đợi 5s để gom thêm frames sau sự kiện
            time.sleep(5)

            with RECORDING_LOCK:
                post_frames = list(FRAME_BUFFER)[-75:]

            all_frames = pre_frames + post_frames
            if not all_frames:
                debug_log(f"[VIDEO] FRAME_BUFFER empty — abort")
                return

            h, w = all_frames[0].shape[:2]
            ts = int(time.time())
            tmp_avi = os.path.join(CURRENT_DIR, f"tmp_p{rule_id}_{ts}.avi")
            out_mp4 = os.path.join(CURRENT_DIR, f"alert_p{rule_id}_{ts}.mp4")

            fourcc = cv2.VideoWriter_fourcc(*'XVID')
            writer = cv2.VideoWriter(tmp_avi, fourcc, 15.0, (w, h))
            for f in all_frames:
                writer.write(f)
            writer.release()

            debug_log(f"[VIDEO] Compressing {len(all_frames)} frames → {out_mp4}")
            proc = subprocess.run(
                [FFMPEG_BIN, "-y", "-i", tmp_avi,
                 "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_mp4],
                capture_output=True, text=True
            )
            if os.path.exists(tmp_avi):
                os.remove(tmp_avi)

            if proc.returncode != 0:
                debug_log(f"[VIDEO] FFmpeg error: {proc.stderr[-300:]}")
                return

            if not os.path.exists(out_mp4) or os.path.getsize(out_mp4) == 0:
                debug_log(f"[VIDEO] Output empty — abort")
                return

            debug_log(f"[VIDEO] Uploading {os.path.getsize(out_mp4)} bytes...")
            with open(out_mp4, "rb") as f:
                resp = requests.post(
                    f"{self.api_url}/camera-webhook/video",
                    data={"camIp": CAMERA_IP},
                    files={"file": (os.path.basename(out_mp4), f, "video/mp4")},
                    timeout=60
                )
            debug_log(f"[VIDEO] Upload response: {resp.status_code} — {resp.text[:200]}")
            os.remove(out_mp4)

        except Exception as e:
            debug_log(f"[VIDEO] Error: {e}")

RULE_ENGINE = RuleEngine(API_URL)

debug_log("=== AI ENGINE RELAY STARTING (DIGEST AUTH VERSION) ===")

def disable_camera_thermal_osd():
    """Tắt hiển thị nhiệt độ OSD trên luồng video camera qua ISAPI"""
    auth = HTTPDigestAuth(USER, PASSWORD)
    session = requests.Session()

    # Lấy cấu hình hiện tại
    get_url = f"http://{CAMERA_IP}/ISAPI/Thermal/channels/2/thermometry/basicParam"
    try:
        r = session.get(get_url, auth=auth, timeout=5)
        debug_log(f"[OSD] GET basicParam → {r.status_code}")
    except Exception as e:
        debug_log(f"[OSD] GET failed: {e}")

    # Tắt displayPointTemperature
    xml_body = """<?xml version="1.0" encoding="UTF-8"?>
<ThermometryBasicParam>
  <displayPointTemperature>false</displayPointTemperature>
</ThermometryBasicParam>"""
    try:
        r = session.put(get_url, data=xml_body, auth=auth,
                        headers={"Content-Type": "application/xml"}, timeout=5)
        if r.status_code in (200, 204):
            debug_log("[OSD] Thermal OSD display DISABLED on camera successfully")
        else:
            debug_log(f"[OSD] PUT failed: {r.status_code} — {r.text[:200]}")
    except Exception as e:
        debug_log(f"[OSD] PUT error: {e}")

disable_camera_thermal_osd()

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
                        if cfg.get('ip') == CAMERA_IP or 'thermal' in d.get('name', '').lower():
                            go2rtc_id = cfg.get('go2rtc_id', '')
                            dtype = d.get('type', '')
                            if 'thermal' in go2rtc_id or 'thermal' in dtype or 'nhiệt' in d.get('name', '').lower():
                                THERMAL_DEVICE_ID = d.get('id')
                                debug_log(f"[INGEST] Found Thermal Device: {THERMAL_DEVICE_ID}")
                            else:
                                OPTICAL_DEVICE_ID = d.get('id')
                                debug_log(f"[INGEST] Found Optical Device: {OPTICAL_DEVICE_ID}")
                    
                    # Nếu vẫn không thấy, lấy đại thiết bị đầu tiên để có số
                    if not THERMAL_DEVICE_ID and devices:
                        THERMAL_DEVICE_ID = devices[0].get('id')
                        debug_log(f"[INGEST] Fallback: Using device {THERMAL_DEVICE_ID} for data")

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
                            if rid == 1:
                                debug_log(f"[THERMAL] Received P1: {temp}C (Total points: {len(LIVE_TEMPS)})")
                            _cb_count[0] += 1
                            if _cb_count[0] % 10 == 1:
                                pass # Xóa log nhiễu
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
                if r.status_code != 200:
                    debug_log(f"[THERMAL] ISAPI failed: {r.status_code} - {r.reason}")
                
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
                                    # Reshape thermal matrix (384×288 pixels)
                                    thermal_h, thermal_w = 288, 384
                                    matrix = arr[:thermal_h * thermal_w].reshape(thermal_h, thermal_w)

                                    # Extract temperature ở 10 điểm
                                    debug_log(f"[THERMAL] Matrix Stats: Min={matrix.min():.1f}, Max={matrix.max():.1f}")
                                    for pid, coords in POINT_COORDS.items():
                                        tx = coords.get('tx')
                                        ty = coords.get('ty')
                                        if tx is not None and ty is not None:
                                            px = int(tx * thermal_w)
                                            py = int(ty * thermal_h)
                                            px = max(0, min(px, thermal_w - 1))
                                            py = max(0, min(py, thermal_h - 1))
                                            temp = float(matrix[py, px])
                                            # TRÍCH XUẤT TỪ MA TRẬN: Đảm bảo lấy đủ mọi điểm trong points_local
                                            try:
                                                temp = float(matrix[py, px])
                                                if -10 < temp < 150:
                                                    LIVE_TEMPS[int(pid)] = temp
                                                else:
                                                    LIVE_TEMPS[int(pid)] = 0.0
                                            except:
                                                LIVE_TEMPS[int(pid)] = 0.0

                                    # Đã lấy xong dữ liệu, không in log mỗi giây để tránh nhiễu
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
    def __init__(self, name, rtsp_url, output_id, is_thermal=False, draw_points=True):
        self.name = name
        self.rtsp_url = rtsp_url
        self.output_url = f"{GO2RTC_RTSP}/{output_id}"
        self.is_thermal = is_thermal
        self.draw_points = draw_points
        self.running = True
        self.frame_buffer = deque(maxlen=100)

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _get_ffmpeg_process(self, w, h):
        cmd = [ FFMPEG_BIN, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{w}x{h}", '-r', '20', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '40', '-crf', '28', 
            '-maxrate', '2M', '-bufsize', '1M', '-f', 'rtsp', self.output_url ]
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

            color = (0, 255, 0)  # Green = bình thường
            if alarm and temp >= alarm: color = (0, 0, 255) if blink else (255, 255, 255)
            elif pre and temp >= pre: color = (0, 255, 255)

            size = 6 if self.is_thermal else 10
            cv2.line(frame, (x - size, y), (x + size, y), color, 1)
            cv2.line(frame, (x, y - size), (x, y + size), color, 1)

            if temp > 0:
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.22 if self.is_thermal else 0.45
                thickness = 1
                line1 = f"P{pid}"
                line2 = f"{temp:.1f}C"
                tx, ty = x + 4, y - 2

                if not self.is_thermal:
                    # Ô nền bán trong suốt cho optical
                    (tw1, th1), _ = cv2.getTextSize(line1, font, font_scale, thickness)
                    (tw2, th2), _ = cv2.getTextSize(line2, font, font_scale, thickness)
                    tw = max(tw1, tw2)
                    overlay = frame.copy()
                    pad = 3
                    cv2.rectangle(overlay, (tx - pad, ty - th1 - pad),
                                  (tx + tw + pad, ty + th2 + th1 + pad + 2), (20, 20, 20), -1)
                    cv2.addWeighted(overlay, 0.45, frame, 0.55, 0, frame)

                cv2.putText(frame, line1, (tx, ty), font, font_scale, color, thickness, cv2.LINE_AA)
                (_, th1), _ = cv2.getTextSize(line1, font, font_scale, thickness)
                cv2.putText(frame, line2, (tx, ty + th1 + 2), font, font_scale, color, thickness, cv2.LINE_AA)
                
                # [NEW] Vẽ thêm dòng dự báo nếu có dữ liệu
                pred_val = PREDICTED_TEMPS.get(rule_id)
                if pred_val:
                    line3 = f"P: {pred_val:.1f}"
                    (_, th2), _ = cv2.getTextSize(line2, font, font_scale, thickness)
                    cv2.putText(frame, line3, (tx, ty + th1 + th2 + 4), font, font_scale, (255, 255, 0), thickness, cv2.LINE_AA)

    def _run(self):
        while self.running:
            cap = cv2.VideoCapture(self.rtsp_url)
            # Thêm timeout cho OpenCV để tránh treo nếu camera lỗi
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
            
            if not cap.isOpened():
                time.sleep(5); continue
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            w_orig, h_orig = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w_orig <= 0: cap.release(); time.sleep(1); continue
            
            # Giảm độ phân giải cam Optical (1080p -> 720p) để mượt hơn, Thermal (384) giữ nguyên
            w, h = w_orig, h_orig
            if not self.is_thermal and w_orig > 1280:
                w, h = 1280, 720
                
            pipe = self._get_ffmpeg_process(w, h)
            blink = 0
            try:
                while self.running:
                    ret, frame = cap.read()
                    if not ret: break
                    
                    if not self.is_thermal and (w != w_orig):
                        frame = cv2.resize(frame, (w, h))
                    blink = (blink + 1) % 10
                    
                    # Burn overlay — chỉ cam 152 (thermal + optical)
                    if self.draw_points:
                        self._draw_points(frame, blink > 5)

                    if self.is_thermal:
                        with RECORDING_LOCK:
                            FRAME_BUFFER.append(frame.copy())
                        for rid, temp_val in list(LIVE_TEMPS.items()):
                            RULE_ENGINE.check(rid, temp_val, frame)

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
    debug_log("--- [SYSTEM] AI ENGINE RELAY STARTING ---")
    thermal = ThermalSDK(CAMERA_IP, USER, PASSWORD)
    thermal.start()
    
    event_listener = EventStreamListener(CAMERA_IP, USER, PASSWORD)
    event_listener.start()
    
    threading.Thread(target=sync_rules_loop, daemon=True).start()
    threading.Thread(target=cleanup_old_events, daemon=True).start()
    
    # 1. Khởi động relay cho camera Quang học & Nhiệt (152)
    relay_opt = StreamRelay("OPTICAL", OPTICAL_URL, "camera_152_normal", is_thermal=False)
    relay_thm = StreamRelay("THERMAL", THERMAL_URL, "camera_152_thermal", is_thermal=True)
    relay_opt.start()
    relay_thm.start()

    # 2. Khởi động relay cho camera Phóng điện (153)
    camera_153_url = f"rtsp://admin:Demo%402024@192.168.10.153:554/Streaming/Channels/101"
    relay_153 = StreamRelay("CAMERA_153_PD", camera_153_url, "camera_153_pd", is_thermal=False, draw_points=False)
    relay_153.start()

    # --- KHỞI ĐỘNG CÁC LUỒNG AI TỰ ĐỘNG ---
    try:
        debug_log("[AI SYSTEM] Initializing AI threads...")
        # Khởi tạo bộ lấy dự báo
        fetcher = PredictionFetcher(CAMERA_IP, debug_logger=debug_log)
        fetcher.live_temps = LIVE_TEMPS 
        fetcher.predicted_temps = PREDICTED_TEMPS
        
        # Bắt đầu bộ đẩy dữ liệu
        pusher = ExternalApiPusher(CAMERA_IP, debug_logger=debug_log)
        ai_thread = threading.Thread(target=pusher.start, args=(LIVE_TEMPS, fetcher), daemon=True)
        ai_thread.start()
        
        debug_log(f"[AI SYSTEM] Pusher Thread Started (ID: {ai_thread.ident}). Cycle: 5 minutes.")
    except Exception as e:
        debug_log(f"[AI SYSTEM] FATAL ERROR starting AI threads: {e}")
        debug_log(f"[AI SYSTEM] Failed to start AI components: {e}")

    try:
        while True: 
            time.sleep(1)
    except KeyboardInterrupt:
        debug_log("[SYSTEM] Shutting down...")
