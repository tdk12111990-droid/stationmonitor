import cv2
import ctypes
import os
import sys
import threading
import time
import xml.etree.ElementTree as ET

# Path setup - ROOT_DIR is d:/test_sdk
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..', '..'))
sys.path.insert(0, ROOT_DIR)

from core.hcnet_sdk import (
    HCNetSDK, 
    NET_DVR_XML_CONFIG_INPUT, 
    NET_DVR_XML_CONFIG_OUTPUT,
    NET_DVR_THERMOMETRY_UPLOAD,
    NET_DVR_THERMOMETRY_COND,
    RemoteConfigCallback
)

# Configuration
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"
RTSP_URL = f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/201"

class ThermalOverlayApp:
    def __init__(self):
        self.sdk = HCNetSDK(ROOT_DIR)
        self.user_id = -1
        self.points = {} # ID: {name, x, y, temp}
        self.running = True
        self.lock = threading.Lock()
        self.remote_handle = -1
        self._cb_ref = None # Keep reference to avoid GC

    def get_rules_via_isapi(self):
        print("[ISAPI] Fetching measurement points...")
        input_data = NET_DVR_XML_CONFIG_INPUT()
        input_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
        url = "GET /ISAPI/Thermal/channels/2/thermometry/rules\r\n"
        url_bytes = url.encode('ascii')
        input_data.lpRequestUrl = ctypes.cast(ctypes.create_string_buffer(url_bytes), ctypes.c_void_p)
        input_data.dwRequestUrlLen = len(url_bytes)

        out_buf = ctypes.create_string_buffer(1024 * 512)
        output_data = NET_DVR_XML_CONFIG_OUTPUT()
        output_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
        output_data.lpOutBuffer = ctypes.cast(out_buf, ctypes.c_void_p)
        output_data.dwOutBufferSize = 1024 * 512

        if self.sdk.hcnetsdk.NET_DVR_STDXMLConfig(self.user_id, ctypes.byref(input_data), ctypes.byref(output_data)):
            xml_data = out_buf.value.decode('utf-8', errors='ignore')
            try:
                root = ET.fromstring(xml_data)
                ns = {'isapi': 'http://www.isapi.org/ver20/XMLSchema'}
                found = 0
                with self.lock:
                    self.points.clear() # Reset for fresh fetch
                    for region in root.findall('.//isapi:ThermometryRegion', ns):
                        enabled = region.find('isapi:enabled', ns).text
                        if enabled == 'true':
                            rid = region.find('isapi:id', ns).text
                            name = region.find('isapi:name', ns).text
                            px = int(region.find('.//isapi:positionX', ns).text)
                            py = int(region.find('.//isapi:positionY', ns).text)
                            
                            self.points[int(rid)] = {
                                'name': name,
                                'x': px / 1000.0,
                                'y': py / 1000.0,
                                'temp': 0.0
                            }
                            found += 1
                print(f"[OK] Found {found} active measurement points.")
            except Exception as e:
                print(f"[ERROR] XML Parsing failed: {e}")
        else:
            print(f"[FAIL] ISAPI Rule fetch failed. Error: {self.sdk.hcnetsdk.NET_DVR_GetLastError()}")

    def real_time_callback(self, dwType, pBuffer, dwBufLen, pUserData):
        if dwBufLen > 0:
            data = ctypes.cast(pBuffer, ctypes.POINTER(NET_DVR_THERMOMETRY_UPLOAD)).contents
            with self.lock:
                if data.byRuleID in self.points:
                    self.points[data.byRuleID]['temp'] = data.fMaxTemperature
        return 0

    def run(self):
        if not self.sdk.init(): return
        self.user_id, _ = self.sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if self.user_id < 0: return

        # 1. Fetch Coordinates
        self.get_rules_via_isapi()

        # CORRECTED: Use command 3629 (Real-time) and Channel 2
        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = 2 
        cond.wMode = 1 # Real-time mode
        
        self._cb_ref = RemoteConfigCallback(self.real_time_callback)
        
        # NET_DVR_GET_REALTIME_THERMOMETRY = 3629
        self.remote_handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
            self.user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), self._cb_ref, None
        )

        if self.remote_handle < 0:
            print(f"[FAIL] Remote Config failed. Error: {self.sdk.hcnetsdk.NET_DVR_GetLastError()}")
            self.sdk.logout(self.user_id)
            return

        # 3. OpenCV Rendering Loop
        cap = cv2.VideoCapture(RTSP_URL)
        print("[VIEW] Starting video stream overlay...")
        cv2.namedWindow("StationMonitor - Thermal View", cv2.WINDOW_NORMAL)
        
        # Performance Tweaks for RTSP
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        while cap.isOpened() and self.running:
            ret, frame = cap.read()
            if not ret: break
            
            h, w, _ = frame.shape
            
            with self.lock:
                for rid, p in self.points.items():
                    ix = int(p['x'] * w)
                    iy = int(p['y'] * h)
                    
                    # Draw subtle marker
                    cv2.drawMarker(frame, (ix, iy), (0, 0, 255), cv2.MARKER_CROSS, 20, 2)
                    
                    # Draw text with outline
                    label = f"{p['name']}: {p['temp']:.1f}C"
                    cv2.putText(frame, label, (ix + 12, iy - 12), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3) 
                    cv2.putText(frame, label, (ix + 12, iy - 12), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

            cv2.imshow("StationMonitor - Thermal View", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        print("[EXIT] Stopping and cleaning up...")
        if self.remote_handle >= 0:
            self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(self.remote_handle)
        cap.release()
        cv2.destroyAllWindows()
        self.sdk.logout(self.user_id)
        self.sdk.cleanup()

if __name__ == "__main__":
    app = ThermalOverlayApp()
    app.run()
