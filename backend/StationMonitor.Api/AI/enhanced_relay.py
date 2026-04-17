import os, sys, cv2, json, threading, time, subprocess, requests
import numpy as np
import ctypes
from collections import deque

# Path configurations
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_SDK_DIR = r"d:\test_sdk"
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback
import core.hcnet_sdk as core_sdk

# Cấu hình Camera
try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP = "192.168.10.152"
    USER = "admin"
    PASSWORD = "Demo@2024"

import urllib.parse
ENCODED_PASS = urllib.parse.quote(PASSWORD)
OPTICAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/101"
THERMAL_URL = f"rtsp://{USER}:{ENCODED_PASS}@{CAMERA_IP}:554/Streaming/Channels/201"
FFMPEG_LOG_PATH = os.path.join(CURRENT_DIR, "ffmpeg_relay.log")
API_URL = "http://localhost:5056/api/v1"
FFMPEG_BIN = r"d:\StationMonitor\frontend\bin\ffmpeg.exe"
POINTS_FILE = os.path.join(TEST_SDK_DIR, "apps", "desktop_viewer", "points_local.json")
# Thư mục lưu trữ bằng đường dẫn tuyệt đối để Web Dashboard truy cập được
WWWROOT_DIR = r"D:\StationMonitor\backend\StationMonitor.Api\wwwroot"
ALERTS_DIR = os.path.join(WWWROOT_DIR, "detections")
VIDEOS_DIR = os.path.join(WWWROOT_DIR, "videos")

for d in [ALERTS_DIR, VIDEOS_DIR]:
    if not os.path.exists(d): os.makedirs(d, exist_ok=True)

# Cờ báo hiệu (Event)
SNAPSHOT_EVENT = threading.Event()
SNAPSHOT_TRIGGER_INFO = {"rule_id": 0, "temp": 0.0, "type": "alarm"}

LIVE_TEMPS = {}     # { ruleID: temperature }
ALARM_RULES = {}    # { ruleID: { "pre_alarm": float, "alarm": float, "name": str } }
COOLDOWN_MAP = {}   # { ruleID: next_allowed_time }
STREAK_MAP = {}     # { ruleID: consecutive_violation_count }

# Log file tại thư mục AI để dễ dàng truy cập
DEBUG_LOG_FILE = os.path.join(CURRENT_DIR, "ai_diagnostics.log")

def debug_log(msg):
    """Ghi nhật ký ra file để Antigravity có thể debug từ xa"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted_msg = f"[{timestamp}] {msg}\n"
    print(formatted_msg, end='')
    try:
        with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted_msg)
    except: pass

debug_log("=== AI ENGINE RELAY STARTING ===")

THERMAL_DEVICE_ID = None # Sẽ được lấy từ Backend

def periodic_status_uploader():
    """Gửi dữ liệu 10 điểm nhiệt độ lên Dashboard mỗi 2 giây"""
    global THERMAL_DEVICE_ID
    debug_log("[SYSTEM] Status Uploader Thread Started.")
    session = requests.Session()
    while True:
        try:
            if not THERMAL_DEVICE_ID:
                resp = session.get(f"{API_URL}/devices", timeout=10)
                if resp.status_code == 200:
                    for d in resp.json():
                        cfg = d.get('config', '{}')
                        if isinstance(cfg, str): cfg = json.loads(cfg)
                        if cfg.get('ip') == CAMERA_IP:
                            THERMAL_DEVICE_ID = d.get('id')
                            break
            
            if THERMAL_DEVICE_ID and LIVE_TEMPS:
                payload = []
                for rid, temp in LIVE_TEMPS.items():
                    payload.append({
                        "deviceId": THERMAL_DEVICE_ID,
                        "pointId": f"P{rid}",
                        "value": temp,
                        "unit": "°C"
                    })
                if payload:
                    res = session.post(f"{API_URL}/measurements/ingest", json=payload, timeout=15)
                    if res.status_code != 200:
                        debug_log(f"[INGEST] Failed: {res.status_code}")
        except Exception as e:
            debug_log(f"[INGEST] Error: {e}")
        time.sleep(2)

threading.Thread(target=periodic_status_uploader, daemon=True).start()

def _extract_camera_rule_id(point_str: str):
    """Map point string → camera byRuleID integer.
    Supports: 'P1','P2'... AND 'nhiet_do_pha_1','nhiet_do_pha_2'... AND plain digits.
    Returns int or None."""
    if not point_str:
        return None
    s = point_str.strip()
    # Direct Px format: P1, P2, P3
    if s.upper().startswith('P') and s[1:].isdigit():
        return int(s[1:])
    # nhiet_do_pha_X format from PLC point IDs
    if 'nhiet_do_pha_' in s:
        digits = s.split('nhiet_do_pha_')[-1].split('_')[0]
        if digits.isdigit():
            return int(digits)
    # Any trailing digits as last resort
    digits = ''.join(filter(str.isdigit, s))
    if digits:
        return int(digits)
    return None

def sync_rules_loop():
    """Đồng bộ Rule từ Backend mỗi 5 giây với logging chi tiết"""
    global ALARM_RULES
    debug_log("[SYSTEM] Rules Sync Thread Started.")
    while True:
        try:
            resp = requests.get(f"{API_URL}/rules", timeout=10)
            if resp.status_code == 200:
                rules_data = resp.json()
                new_rules = {}
                active_p_rules = []
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
                            # Nếu có nhiều Rule cho cùng 1 điểm, chọn ngưỡng thấp nhất (nhạy nhất)
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
                        
                        # Cập nhật danh sách hiển thị log
                        p_alarm = new_rules[rid]["alarm"]
                        p_pre = new_rules[rid]["pre_alarm"]
                        active_p_rules.append(f"P{rid}(W:{p_pre}, A:{p_alarm})")
                    except Exception as e:
                        debug_log(f"[DEBUG] Error parsing rule: {e}")
                        continue
                
                ALARM_RULES = new_rules
                if active_p_rules:
                    # Log danh sách Rule sau khi đã gộp (với giá trị min)
                    final_summary = [f"P{k}(W:{v['pre_alarm']}, A:{v['alarm']})" for k, v in ALARM_RULES.items()]
                    debug_log(f"[SYSTEM] Rules Sync Success. Active Points: {', '.join(final_summary)}")
            else:
                debug_log(f"[SYSTEM] Rule Sync Failed: HTTP {resp.status_code}")
        except Exception as e:
            debug_log(f"[SYSTEM] Rule Sync Error: {e}")
        time.sleep(5)

def load_points():
    if os.path.exists(POINTS_FILE):
        try:
            with open(POINTS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return {}

class ThermalRadar:
    def __init__(self):
        self.sdk = HCNetSDK(TEST_SDK_DIR)
        self.user_id = -1
        self.handle = -1
        self._callback = RemoteConfigCallback(self._thermal_callback)

    def _thermal_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        if dwType == 2:
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            rid = data.byRuleID
            temp = data.fMaxTemperature
            LIVE_TEMPS[rid] = temp

    def start(self):
        debug_log("[RADAR] Initializing SDK...")
        if not self.sdk.init(): 
            debug_log("[RADAR] SDK Init Failed!")
            return
        debug_log("[RADAR] Logging in to Camera...")
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0: 
            debug_log(f"[RADAR] Login Failed! Device IP: {CAMERA_IP}")
            return
        debug_log("[RADAR] Starting Remote Config...")
        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = 2 # Thermal channel
        cond.wMode = 1
        self.handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(self.user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), self._callback, None)
        debug_log("=== [RADAR] THERMAL MONITORING STARTED ===")

class StreamRelay:
    def __init__(self, name, rtsp_url, output_id, is_thermal=False):
        self.name = name
        self.rtsp_url = rtsp_url
        self.output_url = f"rtsp://127.0.0.1:8554/{output_id}"
        self.is_thermal = is_thermal
        self.running = True
        self.points = {}
        self.frame_buffer = deque(maxlen=100) # 5s buffer @ 20fps
        
    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _get_ffmpeg_process(self, w, h):
        cmd = [ FFMPEG_BIN, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
            '-s', f"{w}x{h}", '-r', '20', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '28', 
            '-movflags', '+faststart',
            '-f', 'rtsp', '-rtsp_transport', 'tcp', self.output_url ]
        
        try:
            # Mở file log ở chế độ append
            log_file = open(FFMPEG_LOG_PATH, "a")
            log_file.write(f"\n--- Starting {self.name} at {time.ctime()} ---\n")
            log_file.write(" ".join(cmd) + "\n")
            log_file.flush()
            
            return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log_file)
        except Exception as e:
            debug_log(f"[{self.name}] Failed to start FFmpeg: {e}")
            return None

    def _draw_points(self, frame, blink):
        global ALARM_RULES, LIVE_TEMPS
        h, w = frame.shape[:2]
        
        for pid, p in self.points.items():
            kx, ky = (p.get('tx'), p.get('ty')) if self.is_thermal else (p.get('ox'), p.get('oy'))
            if kx is None or ky is None: continue
            
            x, y = int(kx * w), int(ky * h)
            rule_id = int(pid)
            temp = LIVE_TEMPS.get(rule_id, -1.0)
            rule = ALARM_RULES.get(rule_id, {})
            pre = rule.get("pre_alarm")
            alarm = rule.get("alarm")
            
            color = (94, 197, 34) # Green (BGR: B=34, G=197, R=94)
            label = ""
            
            if alarm is not None and temp >= alarm:
                color = (0, 0, 255) if blink else (255, 255, 255) # Red blinking
            elif pre is not None and temp >= pre:
                color = (0, 255, 255) # Yellow (BGR: B=0, G=255, R=255)

            # Kích thước marker dựa trên loại camera (thu nhỏ thêm cho cam nhiệt)
            size = 4 if self.is_thermal else 12
            thick = 1 if self.is_thermal else 2
            fscale = 0.3 if self.is_thermal else 0.5
            offset = 4 if self.is_thermal else 11

            # Draw Crosshair
            cv2.line(frame, (x - size, y), (x + size, y), color, thick)
            cv2.line(frame, (x, y - size), (x, y + size), color, thick)
            cv2.circle(frame, (x, y), 1 if self.is_thermal else 2, color, -1)
            
            if temp > 0:
                if self.is_thermal:
                    # Tách thành 2 dòng cho cam nhiệt để dễ nhìn
                    txt1 = f"P{pid}{label}"
                    txt2 = f"{temp:.1f}C"
                    
                    # Dòng 1 (Mã điểm) - lệch lên cao hơn
                    cv2.putText(frame, txt1, (x + offset + 2, y - 5), cv2.FONT_HERSHEY_SIMPLEX, fscale, (0, 0, 0), thick + 1, cv2.LINE_AA)
                    cv2.putText(frame, txt1, (x + offset + 2, y - 5), cv2.FONT_HERSHEY_SIMPLEX, fscale, color, thick, cv2.LINE_AA)
                    
                    # Dòng 2 (Nhiệt độ) - lệch xuống thấp hẳn để không chồng lên mã điểm
                    cv2.putText(frame, txt2, (x + offset + 2, y + 10), cv2.FONT_HERSHEY_SIMPLEX, fscale, (0, 0, 0), thick + 1, cv2.LINE_AA)
                    cv2.putText(frame, txt2, (x + offset + 2, y + 10), cv2.FONT_HERSHEY_SIMPLEX, fscale, color, thick, cv2.LINE_AA)
                else:
                    # Giữ nguyên 1 dòng cho cam thường (độ phân giải cao)
                    text = f"P{pid}: {temp:.1f}C{label}"
                    cv2.putText(frame, text, (x + offset, y - offset), cv2.FONT_HERSHEY_SIMPLEX, fscale, (0, 0, 0), thick + 1, cv2.LINE_AA)
                    cv2.putText(frame, text, (x + offset, y - offset), cv2.FONT_HERSHEY_SIMPLEX, fscale, color, thick, cv2.LINE_AA)

    def _run(self):
        blink_ctx = 0
        while self.running:
            self.points = load_points()
            debug_log(f"[{self.name}] Connecting to RTSP: {self.rtsp_url}...")
            cap = cv2.VideoCapture(self.rtsp_url)
            if not cap.isOpened():
                debug_log(f"[{self.name}] Failed to open RTSP source. Retrying in 5s...")
                time.sleep(5); continue
            
            debug_log(f"[{self.name}] RTSP Connected. Starting FFmpeg Push to {self.output_url}...")
            
            w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w <= 0: cap.release(); time.sleep(1); continue

            pipe = self._get_ffmpeg_process(w, h)
            try:
                fail_cnt = 0
                while self.running:
                    ret, frame = cap.read()
                    if not ret:
                        if fail_cnt > 15: break
                        fail_cnt += 1; continue
                    fail_cnt = 0
                    
                    clean_frame = frame.copy()
                    self.frame_buffer.append(clean_frame)
                    
                    # ==========================================================
                    # [STEP 1] AI MODEL INTEGRATION HOOK (BẠN CODE TẠI ĐÂY)
                    # ==========================================================
                    if not self.is_thermal:
                        # Ví dụ: results = my_ai_model.predict(frame)
                        # Nếu phát hiện xâm nhập/cháy:
                        # SNAPSHOT_TRIGGER_INFO.update({"rule_id": 99, "temp": 0, "type": "fire"})
                        # SNAPSHOT_EVENT.set()
                        pass

                    # [STEP 2] CƠ CHẾ XÁC THỰC 10 GIÂY (CHỈ CHO CAM NHIỆT)
                    if self.is_thermal:
                        for rid, rule in ALARM_RULES.items():
                            temp = LIVE_TEMPS.get(rid, 0)
                            alarm_thresh = rule.get("alarm")
                            pre_thresh = rule.get("pre_alarm")
                            
                            cd = COOLDOWN_MAP.get(rid, 0)
                            if time.time() < cd: 
                                STREAK_MAP[rid] = 0; continue

                            triggered_now = False
                            trig_type = "info"
                            
                            if alarm_thresh is not None and temp >= alarm_thresh:
                                triggered_now = True; trig_type = "alarm"
                            elif pre_thresh is not None and temp >= pre_thresh:
                                triggered_now = True; trig_type = "warning"
                            
                            if triggered_now:
                                STREAK_MAP[rid] = STREAK_MAP.get(rid, 0) + 1
                                # Log mỗi giây khi đang đếm streak (20fps -> mỗi 20 frames là 1s)
                                if STREAK_MAP[rid] % 20 == 0:
                                    debug_log(f"[ALARM-WAIT] P{rid} breaching {trig_type}: {temp:.1f}C (Progress: {STREAK_MAP[rid]}/60 frames)")
                                
                                if STREAK_MAP[rid] >= 60: # Giảm xuống 60 frames (~3 giây) cho nhanh
                                    debug_log(f"!!! CONFIRMED ALARM P{rid}: {temp:.1f}C for 3s !!!")
                                    SNAPSHOT_TRIGGER_INFO.update({"rule_id": rid, "temp": temp, "type": trig_type})
                                    SNAPSHOT_EVENT.set()
                                    STREAK_MAP[rid] = 0
                                    COOLDOWN_MAP[rid] = time.time() + 30 # Cooldown 30s
                            else:
                                if STREAK_MAP.get(rid, 0) > 0:
                                    debug_log(f"[ALARM-RESET] P{rid} returned to normal: {temp:.1f}C")
                                STREAK_MAP[rid] = 0

                    # Vẽ UI
                    blink_ctx = (blink_ctx + 1) % 10
                    self._draw_points(frame, blink_ctx < 5)

                    # XỬ LÝ CHỤP ẢNH / QUAY VIDEO
                    if not self.is_thermal and SNAPSHOT_EVENT.is_set():
                        ts = time.strftime("%Y%m%d_%H%M%S")
                        rid, rt, rtype = SNAPSHOT_TRIGGER_INFO["rule_id"], SNAPSHOT_TRIGGER_INFO["temp"], SNAPSHOT_TRIGGER_INFO["type"]
                        prefix = f"ALARM_P{rid}_{ts}"
                        
                        hd_path = os.path.join(ALERTS_DIR, f"{prefix}_hd.jpg")
                        cv2.imwrite(hd_path, clean_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                        thumb_path = os.path.join(ALERTS_DIR, f"{prefix}_thumb.jpg")
                        cv2.imwrite(thumb_path, cv2.resize(clean_frame, (320, 180)), [cv2.IMWRITE_JPEG_QUALITY, 60])
                        
                        if not getattr(self, 'recording', False):
                            prefix = f"ALARM_P{rid}_{time.strftime('%Y%m%d_%H%M%S')}"
                            debug_log(f"[REC] Starting 10s recording for P{rid}. File: {prefix}.mp4")
                            self.vid_path = os.path.join(ALERTS_DIR, f"{prefix}.mp4")
                            self.record_queue = list(self.frame_buffer)
                            self.record_frames_needed = 200 # 10s total
                            self.recording = True
                            self.trigger_info = SNAPSHOT_TRIGGER_INFO.copy()
                        
                        SNAPSHOT_EVENT.clear()

                    if getattr(self, 'recording', False):
                        self.record_queue.append(clean_frame)
                        self.record_frames_needed -= 1
                        if self.record_frames_needed <= 0:
                            self.recording = False
                            threading.Thread(target=self._finalize_and_upload, args=(
                                list(self.record_queue), self.vid_path, hd_path, thumb_path, self.trigger_info
                            ), daemon=True).start()
                            self.record_queue = []

                    try:
                        if pipe and pipe.stdin: pipe.stdin.write(frame.tobytes())
                    except:
                        if pipe: pipe.terminate()
                        pipe = self._get_ffmpeg_process(w, h)

            finally:
                cap.release()
                if pipe: pipe.terminate()
                time.sleep(1)

    def _finalize_and_upload(self, frames, vid_path, hd_path, thumb_path, info):
        try:
            h, w = frames[0].shape[:2]
            cmd = [ FFMPEG_BIN, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
                '-s', f"{w}x{h}", '-r', '20', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 
                '-preset', 'ultrafast', '-crf', '28', '-movflags', '+faststart', vid_path ]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            for f in frames: 
                if proc.stdin: proc.stdin.write(f.tobytes())
            if proc.stdin: proc.stdin.close()
            proc.wait()
            
            print(f"[ENGINE] Video Compressed: {os.path.basename(vid_path)}")
            
            files = {
                'image_hd': (os.path.basename(hd_path), open(hd_path, 'rb'), 'image/jpeg'),
                'image_thumb': (os.path.basename(thumb_path), open(thumb_path, 'rb'), 'image/jpeg'),
                'event': (None, f"<EventNotificationAlert><ipAddress>{CAMERA_IP}</ipAddress><eventType>{info['type']}</eventType><eventState>active</eventState><maxTemp>{info['temp']}</maxTemp><dateTime>{time.strftime('%Y-%m-%dT%H:%M:%S+07:00')}</dateTime><eventDescription>Rule P{info['rule_id']} triggered (Confirmed 3s steady)</eventDescription></EventNotificationAlert>")
            }
            debug_log(f"[UPLOAD] Sending event to {API_URL}/camera-webhook...")
            resp = requests.post(f"{API_URL}/camera-webhook", files=files, timeout=15)
            debug_log(f"[UPLOAD] Event Status: {resp.status_code}")

            debug_log(f"[UPLOAD] Sending video {os.path.basename(vid_path)}...")
            with open(vid_path, 'rb') as fvid:
                v_resp = requests.post(f"{API_URL}/camera-webhook/video", data={'camIp': CAMERA_IP}, files={'video': fvid}, timeout=30)
                debug_log(f"[UPLOAD] Video Status: {v_resp.status_code}")
            
            debug_log("[ENGINE] Evidence Uploaded Successfully.")
        except Exception as e:
            print(f"[ENGINE] Upload Error: {e}")

if __name__ == "__main__":
    debug_log("[SYSTEM] Starting ThermalRadar...")
    radar = ThermalRadar(); radar.start()
    
    # Khởi động luồng đồng bộ Rule từ Backend
    threading.Thread(target=sync_rules_loop, daemon=True).start()
    
    debug_log(f"[SYSTEM] Creating Relays for {CAMERA_IP}...")
    relay_opt = StreamRelay("OPTICAL", OPTICAL_URL, "camera_152_normal", is_thermal=False)
    relay_thm = StreamRelay("THERMAL", THERMAL_URL, "camera_152_thermal", is_thermal=True)
    relay_opt.start(); relay_thm.start()
    debug_log("[SYSTEM] All relays started. Main loop active.")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        relay_opt.running = False; relay_thm.running = False
