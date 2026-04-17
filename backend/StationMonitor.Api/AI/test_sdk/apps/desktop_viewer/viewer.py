"""
Dual-stream thermal viewer — Full-screen with panel selection.

PHÍM TẮT:
  1   - Chỉ xem/làm việc panel OPTICAL (toàn màn hình)
  2   - Chỉ xem/làm việc panel THERMAL (toàn màn hình)
  3   - Cả 2 panel cạnh nhau
  S   - Lưu tọa độ thermal (tx,ty) lên camera
  Q   - Thoát

Kéo điểm trên bên nào → bên đó di chuyển (độc lập).
"""

import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

import cv2, ctypes, json, sys, threading, time
import numpy as np
import xml.etree.ElementTree as ET

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR    = os.path.abspath(os.path.join(CURRENT_DIR, '..', '..'))
POINTS_FILE = os.path.join(CURRENT_DIR, "points_local.json")  # backup local
sys.path.insert(0, ROOT_DIR)

from core.hcnet_sdk import (
    HCNetSDK, NET_DVR_XML_CONFIG_INPUT, NET_DVR_XML_CONFIG_OUTPUT,
    NET_DVR_THERMOMETRY_UPLOAD, NET_DVR_THERMOMETRY_COND, RemoteConfigCallback
)

# ════════════ CONFIG ════════════════════════════════════════════════
CAMERA_IP = "192.168.10.152"
USER      = "admin"
PASSWORD  = "Demo@2024"

RTSP_OPT = ("rtsp://localhost:8554/cam_quang",
             f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/101")
RTSP_THM = ("rtsp://localhost:8554/cam_nhiet",
             f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/201")

# Lấy độ phân giải màn hình thật
try:
    ctypes.windll.user32.SetProcessDPIAware()
    SCREEN_W = ctypes.windll.user32.GetSystemMetrics(0)
    SCREEN_H = ctypes.windll.user32.GetSystemMetrics(1)
except Exception:
    SCREEN_W, SCREEN_H = 1920, 1080

print(f"[INFO] Screen: {SCREEN_W}x{SCREEN_H}")

FONT   = cv2.FONT_HERSHEY_DUPLEX
VIEW_BOTH = 0
VIEW_OPT  = 1
VIEW_THM  = 2


# ════════════ RTSP READER ═══════════════════════════════════════════
class RTSPStreamReader:
    def __init__(self, urls, name):
        self.urls = urls; self.name = name
        self.frame = None; self.running = False
        self._lock = threading.Lock(); self._cap = None

    def start(self):
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _open(self):
        for url in self.urls:
            print(f"[{self.name}] Trying {url}")
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if cap.isOpened():
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                print(f"[{self.name}] OK {w}x{h}")
                return cap
            cap.release()
        return None

    def _loop(self):
        self._cap = self._open()
        while self.running:
            if not self._cap or not self._cap.isOpened():
                time.sleep(2); self._cap = self._open(); continue
            ret, frame = self._cap.read()
            if not ret:
                self._cap.release(); self._cap = None; continue
            with self._lock:
                self.frame = frame

    def read(self):
        with self._lock:
            return None if self.frame is None else self.frame.copy()

    def stop(self):
        self.running = False
        if self._cap: self._cap.release()


# ════════════ LAYOUT HELPER ═════════════════════════════════════════
def fit_to_screen(frame, sw, sh):
    """Scale frame để vừa sw×sh, letterbox đen, trả về (canvas, scale, x_off, y_off)."""
    h, w = frame.shape[:2]
    scale = min(sw / w, sh / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros((sh, sw, 3), dtype=np.uint8)
    xo = (sw - nw) // 2
    yo = (sh - nh) // 2
    canvas[yo:yo + nh, xo:xo + nw] = resized
    return canvas, scale, xo, yo, nw, nh


# ════════════ MAIN VIEWER ═══════════════════════════════════════════
class SDKVideoViewer:
    def __init__(self):
        self.sdk            = HCNetSDK(ROOT_DIR)
        self.user_id        = -1
        self.thermal_handle = -1
        self.running        = True

        # points: {rid: {name, tx, ty, ox, oy, temp, unsaved}}
        self.points = {}
        self.lock   = threading.Lock()

        self.opt_stream = RTSPStreamReader(RTSP_OPT, "Optical")
        self.thm_stream = RTSPStreamReader(RTSP_THM, "Thermal")

        # View mode
        self.view_mode = VIEW_BOTH  # 0=both 1=opt 2=thm

        # Panel screen-space bounding boxes {name: (x1,y1,x2,y2, inner_w, inner_h)}
        # inner_w/inner_h = kích thước thực của ảnh trong box (không tính letterbox padding)
        self._panel_boxes = {}

        # Drag state
        self.selected_id  = None
        self.is_dragging  = False
        self.drag_on_opt  = False
        self.has_unsaved  = False
        self.status_msg   = ""
        self.status_until = 0

        self._cb = RemoteConfigCallback(self._thermal_cb)

    # ── ISAPI ────────────────────────────────────────────────────────
    def _isapi_get(self, url):
        inp = NET_DVR_XML_CONFIG_INPUT()
        inp.dwSize = ctypes.sizeof(inp)
        ub = url.encode('ascii')
        inp.lpRequestUrl    = ctypes.cast(ctypes.create_string_buffer(ub), ctypes.c_void_p)
        inp.dwRequestUrlLen = len(ub)
        buf = ctypes.create_string_buffer(512 * 1024)
        out = NET_DVR_XML_CONFIG_OUTPUT()
        out.dwSize = ctypes.sizeof(out)
        out.lpOutBuffer     = ctypes.cast(buf, ctypes.c_void_p)
        out.dwOutBufferSize = len(buf)
        ok = self.sdk.hcnetsdk.NET_DVR_STDXMLConfig(
            self.user_id, ctypes.byref(inp), ctypes.byref(out))
        return buf.value.decode('utf-8', errors='ignore') if ok else None

    def _isapi_put(self, url, body):
        inp = NET_DVR_XML_CONFIG_INPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT))
        ub = url.encode('ascii'); bb = body.encode('utf-8')
        inp.lpRequestUrl    = ctypes.cast(ctypes.create_string_buffer(ub), ctypes.c_void_p)
        inp.dwRequestUrlLen = len(ub)
        inp.lpInBuffer      = ctypes.cast(ctypes.create_string_buffer(bb), ctypes.c_void_p)
        inp.dwInBufferSize  = len(bb)
        out = NET_DVR_XML_CONFIG_OUTPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT))
        return bool(self.sdk.hcnetsdk.NET_DVR_STDXMLConfig(
            self.user_id, ctypes.byref(inp), ctypes.byref(out)))

    def fetch_points(self):
        xml = self._isapi_get("GET /ISAPI/Thermal/channels/2/thermometry/rules\r\n")
        if not xml:
            print("[WARN] Cannot fetch points."); return
        try:
            root = ET.fromstring(xml)
            ns   = {'i': 'http://www.isapi.org/ver20/XMLSchema'}
            with self.lock:
                self.points.clear()
                for r in root.findall('.//i:ThermometryRegion', ns):
                    if r.find('i:enabled', ns).text != 'true': continue
                    rid  = int(r.find('i:id', ns).text)
                    name = r.find('i:name', ns).text
                    tx   = int(r.find('.//i:positionX', ns).text) / 1000.0
                    ty   = int(r.find('.//i:positionY', ns).text) / 1000.0
                    self.points[rid] = {
                        'name': name,
                        'tx': tx, 'ty': ty,
                        'ox': tx, 'oy': ty,
                        'temp': 0.0, 'unsaved': False
                    }
            print(f"[INFO] Loaded {len(self.points)} point(s) from camera.")

            # Overlay local backup nếu có (ưu tiên toạ độ đã chỉnh)
            if os.path.exists(POINTS_FILE):
                try:
                    local = json.load(open(POINTS_FILE))
                    with self.lock:
                        for rid_str, lp in local.items():
                            rid = int(rid_str)
                            if rid in self.points:
                                self.points[rid]['tx'] = lp['tx']
                                self.points[rid]['ty'] = lp['ty']
                                self.points[rid]['ox'] = lp.get('ox', lp['tx'])
                                self.points[rid]['oy'] = lp.get('oy', lp['ty'])
                    print(f"[INFO] Loaded local backup from {POINTS_FILE}")
                except Exception as e:
                    print(f"[WARN] Local backup load failed: {e}")
        except Exception as e:
            print(f"[WARN] XML error: {e}")

    def _save_local_backup(self):
        """Lưu toạ độ ra file local JSON để persist kể cả khi camera ISAPI fail."""
        with self.lock:
            data = {str(rid): {'tx': p['tx'], 'ty': p['ty'],
                               'ox': p['ox'], 'oy': p['oy'],
                               'name': p['name']}
                    for rid, p in self.points.items()}
        json.dump(data, open(POINTS_FILE, 'w'), indent=2)
        print(f"[INFO] Local backup saved → {POINTS_FILE}")

    def save_points(self):
        self.status_msg = "Saving..."; self.status_until = time.time() + 2
        with self.lock:
            items = list(self.points.items())
        saved = 0; failed = 0
        for rid, p in items:
            if not p.get('unsaved'): continue
            px, py = int(p['tx'] * 1000), int(p['ty'] * 1000)
            print(f"[SAVE] Point {rid} '{p['name']}' → tx={p['tx']:.3f} ty={p['ty']:.3f}  (posX={px} posY={py})")
            body = f"""<?xml version="1.0" encoding="UTF-8"?>
<ThermometryRegion version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <id>{rid}</id><enabled>true</enabled>
  <Point>
    <positionX>{px}</positionX>
    <positionY>{py}</positionY>
  </Point>
</ThermometryRegion>"""
            ok = self._isapi_put(f"PUT /ISAPI/Thermal/channels/2/thermometry/rules/{rid}\r\n", body)
            if ok:
                p['unsaved'] = False; saved += 1
                print(f"[SAVE] ✓ Point {rid} saved to camera.")
            else:
                failed += 1
                err = self.sdk.hcnetsdk.NET_DVR_GetLastError()
                print(f"[SAVE] ✗ Point {rid} FAILED (SDK error={err})")
        self.has_unsaved  = any(p.get('unsaved') for p in self.points.values())
        self.status_msg   = f"Camera: {saved} saved" + (f", {failed} FAILED" if failed else "")
        self.status_until = time.time() + 3
        # Luôn lưu local backup dù camera có fail hay không
        self._save_local_backup()

    def _thermal_cb(self, dwType, pBuf, dwLen, _):
        if dwType == 2:
            d = ctypes.cast(pBuf, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            with self.lock:
                if d.byRuleID in self.points:
                    self.points[d.byRuleID]['temp'] = d.fMaxTemperature

    # ── Draw points lên 1 panel bằng coords tương ứng ────────────────
    def _draw_on(self, panel, panel_x, panel_y, inner_w, inner_h, coord_key_x, coord_key_y):
        """
        panel_x, panel_y: offset của panel trong canvas tổng (letterbox)
        inner_w, inner_h: kích thước ảnh thực bên trong panel
        coord_key_x/y: 'ox','oy' hoặc 'tx','ty'
        """
        with self.lock:
            pts = list(self.points.items())
        for rid, p in pts:
            is_sel = (rid == self.selected_id)
            color  = (0, 255, 255) if is_sel else \
                     ((0, 60, 255) if p['unsaved'] else (0, 230, 60))
            ix = panel_x + int(p[coord_key_x] * inner_w)
            iy = panel_y + int(p[coord_key_y] * inner_h)
            ix = max(panel_x + 3, min(panel_x + inner_w - 3, ix))
            iy = max(panel_y + 3, min(panel_y + inner_h - 3, iy))

            cv2.drawMarker(panel, (ix, iy), color, cv2.MARKER_CROSS, 12, 1, cv2.LINE_AA)
            cv2.putText(panel, p['name'],   (ix+7, iy-8), FONT, 0.42, (0,0,0), 2, cv2.LINE_AA)
            cv2.putText(panel, p['name'],   (ix+7, iy-8), FONT, 0.42, color,   1, cv2.LINE_AA)
            cv2.putText(panel, f"{p['temp']:.1f}C", (ix+7, iy+8), FONT, 0.42, (0,0,0), 2, cv2.LINE_AA)
            cv2.putText(panel, f"{p['temp']:.1f}C", (ix+7, iy+8), FONT, 0.42, (255,255,255), 1, cv2.LINE_AA)

    # ── Build display frame ──────────────────────────────────────────
    def _build_frame(self, f_opt, f_thm):
        """Build canvas SCREEN_W × SCREEN_H theo view_mode, cập nhật _panel_boxes."""
        canvas = np.zeros((SCREEN_H, SCREEN_W, 3), dtype=np.uint8)
        boxes  = {}

        if self.view_mode == VIEW_BOTH:
            # Chia màn hình theo tỉ lệ chiều rộng gốc
            oh, ow = f_opt.shape[:2]
            th, tw = f_thm.shape[:2]

            # Chiều cao chung: tối đa SCREEN_H
            target_h = SCREEN_H
            opt_scale = target_h / oh
            thm_scale = target_h / th
            opt_w_raw = int(ow * opt_scale)
            thm_w_raw = int(tw * thm_scale)
            total_w   = opt_w_raw + thm_w_raw

            if total_w > SCREEN_W:
                # Scale down cả 2 để vừa
                s = SCREEN_W / total_w
                opt_w_raw = int(opt_w_raw * s)
                thm_w_raw = int(thm_w_raw * s)
                target_h  = int(target_h * s)

            yo = (SCREEN_H - target_h) // 2

            opt_panel = cv2.resize(f_opt, (opt_w_raw, target_h))
            thm_panel = cv2.resize(f_thm, (thm_w_raw, target_h))

            xo_thm = opt_w_raw
            canvas[yo:yo + target_h, 0:opt_w_raw] = opt_panel
            canvas[yo:yo + target_h, xo_thm:xo_thm + thm_w_raw] = thm_panel

            # Border giữa 2 panel
            cv2.line(canvas, (opt_w_raw, 0), (opt_w_raw, SCREEN_H), (60,60,60), 2)

            boxes['opt'] = (0, yo, opt_w_raw, yo + target_h, opt_w_raw, target_h)
            boxes['thm'] = (xo_thm, yo, xo_thm + thm_w_raw, yo + target_h, thm_w_raw, target_h)

            self._draw_on(canvas, 0,      yo, opt_w_raw, target_h, 'ox', 'oy')
            self._draw_on(canvas, xo_thm, yo, thm_w_raw, target_h, 'tx', 'ty')

            # Labels
            for (bx1, by1, bx2, by2, iw, ih), lbl in [
                (boxes['opt'], f"[1] OPTICAL  (keo diem = chinh optical)"),
                (boxes['thm'], f"[2] THERMAL  (keo diem = chinh thermal + luu camera)")
            ]:
                cv2.putText(canvas, lbl, (bx1 + 6, by2 - 6),
                            FONT, 0.45, (0,0,0), 2, cv2.LINE_AA)
                cv2.putText(canvas, lbl, (bx1 + 6, by2 - 6),
                            FONT, 0.45, (100,200,255), 1, cv2.LINE_AA)

        elif self.view_mode == VIEW_OPT:
            c, sc, xo, yo, nw, nh = fit_to_screen(f_opt, SCREEN_W, SCREEN_H)
            canvas[:] = c
            boxes['opt'] = (xo, yo, xo + nw, yo + nh, nw, nh)
            self._draw_on(canvas, xo, yo, nw, nh, 'ox', 'oy')

            oh, ow = f_opt.shape[:2]
            cv2.putText(canvas, f"[1] OPTICAL {ow}x{oh}  |  3=Dual view  2=Thermal",
                        (8, SCREEN_H - 8), FONT, 0.5, (0,0,0), 2, cv2.LINE_AA)
            cv2.putText(canvas, f"[1] OPTICAL {ow}x{oh}  |  3=Dual view  2=Thermal",
                        (8, SCREEN_H - 8), FONT, 0.5, (100,200,255), 1, cv2.LINE_AA)

        else:  # VIEW_THM
            c, sc, xo, yo, nw, nh = fit_to_screen(f_thm, SCREEN_W, SCREEN_H)
            canvas[:] = c
            boxes['thm'] = (xo, yo, xo + nw, yo + nh, nw, nh)
            self._draw_on(canvas, xo, yo, nw, nh, 'tx', 'ty')

            th, tw = f_thm.shape[:2]
            cv2.putText(canvas, f"[2] THERMAL {tw}x{th}  |  3=Dual view  1=Optical",
                        (8, SCREEN_H - 8), FONT, 0.5, (0,0,0), 2, cv2.LINE_AA)
            cv2.putText(canvas, f"[2] THERMAL {tw}x{th}  |  3=Dual view  1=Optical",
                        (8, SCREEN_H - 8), FONT, 0.5, (100,200,255), 1, cv2.LINE_AA)

        self._panel_boxes = boxes
        return canvas

    # ── Mode badge + status overlay ──────────────────────────────────
    def _overlay_ui(self, canvas):
        # Mode badge top-right
        mode_labels = {VIEW_BOTH: "[3] DUAL", VIEW_OPT: "[1] OPTICAL", VIEW_THM: "[2] THERMAL"}
        badge = mode_labels[self.view_mode]
        cv2.rectangle(canvas, (SCREEN_W - 180, 0), (SCREEN_W, 36), (30, 30, 30), -1)
        cv2.putText(canvas, badge, (SCREEN_W - 174, 25), FONT, 0.65, (0,220,255), 1, cv2.LINE_AA)

        # Status bar top-left
        if self.has_unsaved:
            bar, bc = "(!) CHUA LUU - Nhan S", (0, 50, 255)
        elif time.time() < self.status_until:
            bar, bc = self.status_msg, (0, 200, 80)
        else:
            bar, bc = "S=Luu  Q=Thoat  1=Optical  2=Thermal  3=Dual", (120,120,120)

        cv2.rectangle(canvas, (0, 0), (len(bar) * 9 + 10, 36), (20, 20, 20), -1)
        cv2.putText(canvas, bar, (6, 25), FONT, 0.55, bc, 1, cv2.LINE_AA)

    # ── Mouse ────────────────────────────────────────────────────────
    def on_mouse(self, event, x, y, flags, param):
        boxes = self._panel_boxes
        if not boxes: return

        def hit_test(bx1, by1, bx2, by2, iw, ih):
            if bx1 <= x <= bx2 and by1 <= y <= by2:
                # Toạ độ [0,1] trong ảnh inner
                rx = max(0., min(1., (x - bx1) / iw))
                ry = max(0., min(1., (y - by1) / ih))
                return rx, ry
            return None

        on_opt_pos = hit_test(*boxes['opt']) if 'opt' in boxes else None
        on_thm_pos = hit_test(*boxes['thm']) if 'thm' in boxes else None

        if event == cv2.EVENT_LBUTTONDOWN:
            # Tìm điểm gần nhất ở panel được click
            if on_opt_pos:
                ox, oy = on_opt_pos
                _, _, _, _, iw, ih = boxes['opt']
                with self.lock:
                    for rid, p in self.points.items():
                        if abs(ox - p['ox']) * iw < 28 and abs(oy - p['oy']) * ih < 28:
                            self.selected_id = rid
                            self.is_dragging = True
                            self.drag_on_opt = True
                            break
            elif on_thm_pos:
                tx, ty = on_thm_pos
                _, _, _, _, iw, ih = boxes['thm']
                with self.lock:
                    for rid, p in self.points.items():
                        if abs(tx - p['tx']) * iw < 28 and abs(ty - p['ty']) * ih < 28:
                            self.selected_id = rid
                            self.is_dragging = True
                            self.drag_on_opt = False
                            break

        elif event == cv2.EVENT_MOUSEMOVE and self.is_dragging and self.selected_id is not None:
            with self.lock:
                p = self.points[self.selected_id]
                if self.drag_on_opt and on_opt_pos:
                    # Kéo optical → cập nhật ox,oy VÀ tx,ty (cùng vị trí)
                    p['ox'], p['oy'] = on_opt_pos
                    p['tx'], p['ty'] = on_opt_pos  # ← đây là điểm quan trọng
                    p['unsaved']      = True
                    self.has_unsaved  = True
                elif not self.drag_on_opt and on_thm_pos:
                    # Kéo thermal → cập nhật tx,ty VÀ ox,oy
                    p['tx'], p['ty'] = on_thm_pos
                    p['ox'], p['oy'] = on_thm_pos
                    p['unsaved']      = True
                    self.has_unsaved  = True

        elif event == cv2.EVENT_LBUTTONUP:
            self.is_dragging = False
            self.selected_id = None

    # ── Main ─────────────────────────────────────────────────────────
    def start(self):
        if not self.sdk.init():
            print("[ERROR] SDK init"); return
        self.sdk.hcnetsdk.NET_DVR_SetConnectTime(3000, 1)
        self.sdk.hcnetsdk.NET_DVR_SetReconnect(10000, True)
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0:
            print("[ERROR] Login failed"); return
        self.fetch_points()

        cond = NET_DVR_THERMOMETRY_COND(
            dwSize=ctypes.sizeof(NET_DVR_THERMOMETRY_COND), dwChannel=2, wMode=1)
        self.thermal_handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
            self.user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), self._cb, None)

        self.opt_stream.start()
        self.thm_stream.start()

        win = "StationMonitor"
        cv2.namedWindow(win, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(win, SCREEN_W, SCREEN_H)
        cv2.moveWindow(win, 0, 0)
        cv2.setWindowProperty(win, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        cv2.setMouseCallback(win, self.on_mouse)

        blank = np.zeros((SCREEN_H, SCREEN_W, 3), dtype=np.uint8)
        cv2.putText(blank, "Waiting for streams...", (SCREEN_W//2 - 200, SCREEN_H//2),
                    FONT, 1.2, (160,160,160), 2)

        while self.running:
            f_opt = self.opt_stream.read()
            f_thm = self.thm_stream.read()

            if f_opt is None or f_thm is None:
                cv2.imshow(win, blank)
                cv2.waitKey(300)
                continue

            canvas = self._build_frame(f_opt, f_thm)
            self._overlay_ui(canvas)
            cv2.imshow(win, canvas)

            key = cv2.waitKey(1) & 0xFF
            if   key == ord('q'): self.running = False
            elif key == ord('s'): threading.Thread(target=self.save_points, daemon=True).start()
            elif key == ord('1'):
                self.view_mode = VIEW_OPT
                self.status_msg = "Mode: OPTICAL only"; self.status_until = time.time() + 2
            elif key == ord('2'):
                self.view_mode = VIEW_THM
                self.status_msg = "Mode: THERMAL only"; self.status_until = time.time() + 2
            elif key == ord('3'):
                self.view_mode = VIEW_BOTH
                self.status_msg = "Mode: DUAL view"; self.status_until = time.time() + 2

        self.stop()

    def stop(self):
        self.running = False
        self.opt_stream.stop(); self.thm_stream.stop()
        if self.thermal_handle >= 0:
            self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.thermal_handle)
        self.sdk.logout(self.user_id); self.sdk.cleanup()
        cv2.destroyAllWindows()
        print("[INFO] Stopped.")


if __name__ == "__main__":
    SDKVideoViewer().start()
