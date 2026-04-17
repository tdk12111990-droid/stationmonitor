import os, sys, cv2, json, subprocess, time, ctypes, threading, requests
from datetime import datetime

# Cấu hình đường dẫn SDK và project
TEST_SDK_DIR = r"d:\test_sdk"
SDK_LIB_DIR = os.path.join(TEST_SDK_DIR, "lib")
sys.path.insert(0, TEST_SDK_DIR)

from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback

try:
    from config import CAMERA_IP, USER, PASSWORD
except ImportError:
    CAMERA_IP, USER, PASSWORD = "192.168.10.152", "admin", "Demo@2024"

FFMPEG_BIN = r"d:\StationMonitor\frontend\bin\ffmpeg.exe"
POINTS_FILE = os.path.join(TEST_SDK_DIR, "apps", "desktop_viewer", "points_local.json")

# Quản lý dữ liệu nhiệt độ toàn cục
thermal_data = {} # {rule_id: temperature}
thermal_lock = threading.Lock()

API_URL = "http://localhost:5056/api/v1"
ALARM_RULES = {}  # {rule_id: {pre_alarm, alarm}}

def sync_rules_loop():
    """Đồng bộ Rule từ Backend mỗi 5 giây để cập nhật ngưỡng màu sắc"""
    global ALARM_RULES
    while True:
        try:
            resp = requests.get(f"{API_URL}/rules", timeout=5)
            if resp.status_code == 200:
                rules_data = resp.json()
                new_rules = {}
                for r in rules_data:
                    cond_str = r.get('condition', '{}')
                    cond = json.loads(cond_str) if isinstance(cond_str, str) else cond_str
                    point_str = cond.get('point', '')
                    if point_str.startswith('P') and r.get('enabled', True):
                        rid_str = "".join(filter(str.isdigit, point_str))
                        if rid_str:
                            rid = int(rid_str)
                            pre = cond.get('pre_alarm') if cond.get('pre_alarm') is not None else cond.get('value')
                            alarm = cond.get('alarm')
                            new_rules[rid] = { "pre_alarm": pre, "alarm": alarm }
                ALARM_RULES = new_rules
        except: pass
        time.sleep(5)

threading.Thread(target=sync_rules_loop, daemon=True).start()

def thermal_callback(dwType, lpBuffer, dwBufLen, pUserData):
    if dwType == 2: # NET_SDK_CALLBACK_TYPE_DATA
        if lpBuffer and dwBufLen >= ctypes.sizeof(NET_DVR_THERMOMETRY_UPLOAD):
            data = NET_DVR_THERMOMETRY_UPLOAD.from_buffer_copy(
                ctypes.string_at(lpBuffer, dwBufLen)
            )
            rule_id = data.byRuleID
            temp = round(data.fMaxTemperature, 1)
            with thermal_lock:
                thermal_data[rule_id] = temp

# Khởi tạo SDK (HCNetSDK sẽ tự động tìm thư mục lib bên trong TEST_SDK_DIR)
sdk = HCNetSDK(TEST_SDK_DIR)
sdk.init()
user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)

# Đăng ký nhận dữ liệu nhiệt độ (Channel 2 là Thermal)
thermal_callback_ptr = RemoteConfigCallback(thermal_callback)
cond = NET_DVR_THERMOMETRY_COND()
cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
cond.dwChannel = 2
cond.wMode = 1 # Real-time

handle = sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
    user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond),
    thermal_callback_ptr, None
)

def load_points():
    if os.path.exists(POINTS_FILE):
        try:
            with open(POINTS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return {}

def main():
    if len(sys.argv) < 2: return
    mode = sys.argv[1].lower()
    is_thermal = (mode == 'thm')
    
    channel = "201" if is_thermal else "101"
    rtsp_url = f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/{channel}"
    
    points = load_points()
    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened(): return

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Nâng cấp độ phân giải cho Cam nhiệt để vẽ nét hơn (Upscaling)
    if is_thermal and w < 640:
        target_w, target_h = 640, 480
    else:
        target_w, target_h = w, h

    # Khởi chạy FFmpeg với kích thước mục tiêu
    cmd = [
        FFMPEG_BIN, '-y',
        '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'bgr24',
        '-s', f"{target_w}x{target_h}", '-r', '20', '-i', '-',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-f', 'h264', '-'
    ]
    pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=sys.stdout.buffer, stderr=subprocess.DEVNULL)

    try:
        color = (94, 197, 34) # Green
        while True:
            ret, frame = cap.read()
            if not ret: break
            
            # Phóng to khung hình nếu là cam nhiệt
            if is_thermal and w < 640:
                frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
            
            # Cập nhật w, h mới sau khi resize để vẽ chính xác
            curr_h, curr_w = frame.shape[:2]
            
            with thermal_lock:
                current_temps = thermal_data.copy()

            # Cấu hình kích thước sau khi đã phóng to (Upscale)
            if is_thermal:
                line_len = 5       # Dấu thập rõ hơn
                font_scale = 0.4   # Font chữ HD sắc nét hơn
                line_thickness = 1
                text_thickness = 1
            else:
                line_len = 12      # Dấu thập to hơn
                font_scale = 0.6   # Chữ to hơn cho cam quang
                line_thickness = 3 # Nét vẽ đậm hơn
                text_thickness = 2 # Chữ đậm hơn
                
            for pid_str, p in points.items():
                pid = int(pid_str)
                kx = p.get('tx' if is_thermal else 'ox')
                ky = p.get('ty' if is_thermal else 'oy')
                if kx is not None and ky is not None:
                    # Sử dụng tọa độ thực tế của khung hình hiện tại (sau khi resize)
                    x, y = int(kx * curr_w), int(ky * curr_h)
                    
                    # Vẽ TÂM NHẮM (Reticle style - có khoảng hở ở giữa)
                    gap = 3 if not is_thermal else 2
                    
                    # Vẽ bóng đổ đen (mảnh)
                    for ox, oy in [(1,1)]:
                        # Ngang
                        cv2.line(frame, (x - line_len, y + oy), (x - gap, y + oy), (0,0,0), 1)
                        cv2.line(frame, (x + gap, y + oy), (x + line_len, y + oy), (0,0,0), 1)
                        # Dọc
                        cv2.line(frame, (x + ox, y - line_len), (x + ox, y - gap), (0,0,0), 1)
                        cv2.line(frame, (x + ox, y + gap), (x + ox, y + line_len), (0,0,0), 1)

                    # Lấy nhiệt độ và xác định màu sắc dựa trên Rule
                    temp = current_temps.get(pid, 0.0)
                    rule = ALARM_RULES.get(pid, {})
                    pre, alarm = rule.get("pre_alarm"), rule.get("alarm")
                    
                    # Xác định màu sắc (BGR)
                    current_color = (94, 197, 34) # Green
                    if alarm is not None and temp >= alarm:
                        # Nhấp nháy Red/White nếu là Alarm
                        blink = (int(time.time() * 2) % 2 == 0)
                        current_color = (0, 0, 255) if blink else (255, 255, 255)
                    elif pre is not None and temp >= pre:
                        current_color = (0, 255, 255) # Yellow
                    
                    # Vẽ nét chính (thanh mảnh)
                    # Ngang
                    cv2.line(frame, (x - line_len, y), (x - gap, y), current_color, 1)
                    cv2.line(frame, (x + gap, y), (x + line_len, y), current_color, 1)
                    # Dọc
                    cv2.line(frame, (x, y - line_len), (x, y - gap), current_color, 1)
                    cv2.line(frame, (x, y + gap), (x, y + line_len), current_color, 1)
                    
                    # Lấy nhiệt độ
                    temp = current_temps.get(pid, 0.0)
                    
                    # Căn lề và vẽ text xếp dọc (Dành cho cả Quang và Nhiệt)
                    tx = x + line_len + (3 if is_thermal else 5)
                    ty = y
                    txt_id = f"P{pid}"
                    txt_temp = f"{temp}'C"
                    
                    # Cài đặt khoảng cách dòng dựa trên cỡ chữ
                    v_space = 10 if is_thermal else 15
                    
                    # Vẽ P{id} (Dòng trên)
                    cv2.putText(frame, txt_id, (tx+1, ty-2+1), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0,0,0), text_thickness, cv2.LINE_AA)
                    cv2.putText(frame, txt_id, (tx, ty-2), cv2.FONT_HERSHEY_SIMPLEX, font_scale, current_color, text_thickness, cv2.LINE_AA)
                    
                    # Vẽ Nhiệt độ (Dòng dưới)
                    cv2.putText(frame, txt_temp, (tx+1, ty+v_space+1), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0,0,0), text_thickness, cv2.LINE_AA)
                    cv2.putText(frame, txt_temp, (tx, ty+v_space), cv2.FONT_HERSHEY_SIMPLEX, font_scale, current_color, text_thickness, cv2.LINE_AA)
            
            try:
                pipe.stdin.write(frame.tobytes())
            except: break
    finally:
        cap.release()
        if handle >= 0:
            sdk.hcnetsdk.NET_DVR_StopRemoteConfig(handle)
        sdk.logout(user_id)
        sdk.cleanup()
        pipe.terminate()

if __name__ == "__main__":
    main()
