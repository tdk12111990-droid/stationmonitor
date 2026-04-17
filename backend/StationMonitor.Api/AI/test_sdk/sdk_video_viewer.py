import os
# ÉP DÙNG TCP TRƯỚC KHI IMPORT CV2
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

import cv2
import ctypes
import sys
import threading
import time
import numpy as np
import xml.etree.ElementTree as ET

# Thêm đường dẫn core
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(CURRENT_DIR)

from core.hcnet_sdk import (
    HCNetSDK, 
    NET_DVR_XML_CONFIG_INPUT, 
    NET_DVR_XML_CONFIG_OUTPUT,
    NET_DVR_THERMOMETRY_UPLOAD,
    NET_DVR_THERMOMETRY_COND,
    RemoteConfigCallback
)

# --- CẤU HÌNH ---
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"

# Luồng 101 (1920x1080) - Khớp 100% với Web
RTSP_URL = f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/101"

class SDKVideoViewer:
    def __init__(self):
        self.sdk = HCNetSDK(CURRENT_DIR)
        self.user_id = -1
        self.thermal_handle = -1
        
        self.points = {} 
        self.current_frame = None
        self.running = True
        self.lock = threading.Lock()
        
        # UI State
        self.selected_point_id = None
        self.is_dragging = False
        self.has_unsaved_changes = False
        self.status_message = "Ready"
        self.status_timer = 0

        self._thermal_cb = RemoteConfigCallback(self._thermal_callback)

    def fetch_points_config(self):
        """Lấy cấu hình điểm từ Channel 1 (Ống kính Quang học)"""
        print("[INFO] Loading optical-mapped points from camera...")
        input_data = NET_DVR_XML_CONFIG_INPUT()
        input_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
        # CHÚ Ý: Lấy từ channels/1 để có tọa độ đã mapping
        url = "GET /ISAPI/Thermal/channels/1/thermometry/rules\r\n"
        url_bytes = url.encode('ascii')
        input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_bytes), ctypes.c_void_p)
        input_data.dwRequestUrlLen = len(url_bytes)
        
        out_buf = ctypes.create_string_buffer(1024 * 512)
        output_data = NET_DVR_XML_CONFIG_OUTPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT))
        output_data.lpOutBuffer = ctypes.cast(out_buf, ctypes.c_void_p)
        output_data.dwOutBufferSize = 1024 * 512

        if self.sdk.hcnetsdk.NET_DVR_STDXMLConfig(self.user_id, ctypes.byref(input_data), ctypes.byref(output_data)):
            xml_data = out_buf.value.decode('utf-8', errors='ignore')
            try:
                root = ET.fromstring(xml_data)
                ns = {'isapi': 'http://www.isapi.org/ver20/XMLSchema'}
                with self.lock:
                    if not self.is_dragging:
                        self.points.clear()
                        for region in root.findall('.//isapi:ThermometryRegion', ns):
                            if region.find('isapi:enabled', ns).text == 'true':
                                rid = int(region.find('isapi:id', ns).text)
                                name = region.find('isapi:name', ns).text
                                
                                # Ưu tiên lấy CalibratingCoordinates (Tọa độ thực tế trên ảnh)
                                calib = region.find('.//isapi:CalibratingCoordinates', ns)
                                if calib is not None:
                                    px = int(calib.find('isapi:positionX', ns).text)
                                    py = int(calib.find('isapi:positionY', ns).text)
                                else:
                                    px = int(region.find('.//isapi:positionX', ns).text)
                                    py = int(region.find('.//isapi:positionY', ns).text)
                                    
                                self.points[rid] = {'name': name, 'x': px/1000.0, 'y': py/1000.0, 'temp': 0.0, 'unsaved': False}
                self.has_unsaved_changes = False
                print(f"✅ Loaded {len(self.points)} points.")
            except Exception as e: print(f"XML Error: {e}")

    def save_all_points(self):
        """Lưu tọa độ bằng phím S"""
        self.status_message = "SAVING TO CAMERA..."
        self.status_timer = time.time() + 2
        with self.lock: points_to_save = list(self.points.items())

        for rid, p in points_to_save:
            if p.get('unsaved'):
                # Gửi PUT lên Channel 1 (Camera sẽ tự đồng bộ sang Channel 2)
                xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<ThermometryRegion version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
    <id>{rid}</id><enabled>true</enabled>
    <Point><positionX>{int(p['x'] * 1000)}</positionX><positionY>{int(p['y'] * 1000)}</positionY></Point>
</ThermometryRegion>"""
                
                input_data = NET_DVR_XML_CONFIG_INPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT))
                url = f"PUT /ISAPI/Thermal/channels/1/thermometry/rules/{rid}\r\n"
                input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url.encode('ascii')), ctypes.c_void_p)
                input_data.dwRequestUrlLen = len(url)
                body_bytes = xml_body.encode('utf-8')
                input_data.lpInBuffer = ctypes.cast(ctypes.create_string_buffer(body_bytes), ctypes.c_void_p)
                input_data.dwInBufferSize = len(body_bytes)

                self.sdk.hcnetsdk.NET_DVR_STDXMLConfig(self.user_id, ctypes.byref(input_data), ctypes.byref(NET_DVR_XML_CONFIG_OUTPUT(dwSize=ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT))))
                p['unsaved'] = False
        
        self.status_message = "ALL POINTS SAVED!"
        self.has_unsaved_changes = False

    def on_mouse(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            with self.lock:
                if self.current_frame is not None:
                    h, w = self.current_frame.shape[:2]
                    for rid, p in self.points.items():
                        px, py = int(p['x'] * w), int(p['y'] * h)
                        if abs(x - px) < 30 and abs(y - py) < 30:
                            self.selected_point_id, self.is_dragging = rid, True
                            break
        elif event == cv2.EVENT_MOUSEMOVE:
            if self.is_dragging and self.selected_point_id is not None:
                with self.lock:
                    h, w = self.current_frame.shape[:2]
                    self.points[self.selected_point_id]['x'] = x / w
                    self.points[self.selected_point_id]['y'] = y / h
                    self.points[self.selected_point_id]['unsaved'] = True
                    self.has_unsaved_changes = True
        elif event == cv2.EVENT_LBUTTONUP:
            self.is_dragging = False
            self.selected_point_id = None

    def _thermal_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        if dwType == 2:
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            with self.lock:
                if data.byRuleID in self.points: self.points[data.byRuleID]['temp'] = data.fMaxTemperature

    def start(self):
        if not self.sdk.init(): return
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0: return
        self.fetch_points_config()

        # Start Thermal Data
        cond = NET_DVR_THERMOMETRY_COND(dwSize=ctypes.sizeof(NET_DVR_THERMOMETRY_COND), dwChannel=2, wMode=1)
        self.thermal_handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(self.user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), self._thermal_cb, None)

        win_name = "Hikvision HQ Viewer (101) - Point Accuracy 100%"
        cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
        cv2.setMouseCallback(win_name, self.on_mouse)
        font = cv2.FONT_HERSHEY_DUPLEX

        print(f"\n[RTSP] Connecting to {RTSP_URL}...")
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        while self.running:
            ret, frame = cap.read()
            if not ret: break
            
            with self.lock: self.current_frame = frame.copy()
            h, w = frame.shape[:2]
            
            with self.lock:
                for rid, p in self.points.items():
                    ix, iy = int(p['x'] * w), int(p['y'] * h)
                    color = (0, 255, 255) if rid == self.selected_point_id else ((0, 0, 255) if p['unsaved'] else (0, 255, 0))
                    cv2.drawMarker(frame, (ix, iy), color, cv2.MARKER_CROSS, 12, 1)
                    cv2.putText(frame, p['name'], (ix + 10, iy - 10), font, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
                    cv2.putText(frame, p['name'], (ix + 10, iy - 10), font, 0.5, color, 1, cv2.LINE_AA)
                    cv2.putText(frame, f"{p['temp']:.1f}C", (ix + 10, iy + 8), font, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
                    cv2.putText(frame, f"{p['temp']:.1f}C", (ix + 10, iy + 8), font, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            
            if self.has_unsaved_changes:
                cv2.putText(frame, "(!) PRESS 'S' TO SAVE", (20, h - 30), font, 0.7, (0, 0, 255), 2)
            elif time.time() < self.status_timer:
                cv2.putText(frame, self.status_message, (20, h - 30), font, 0.7, (0, 255, 0), 2)

            cv2.imshow(win_name, frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'): break
            elif key == ord('s'): threading.Thread(target=self.save_all_points).start()
        
        cap.release()
        self.stop()

    def stop(self):
        self.running = False
        if self.thermal_handle >= 0: self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.thermal_handle)
        self.sdk.logout(self.user_id)
        self.sdk.cleanup()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    SDKVideoViewer().start()
