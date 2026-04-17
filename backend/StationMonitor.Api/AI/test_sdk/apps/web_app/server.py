import os
import sys
import time
import json
import threading
import ctypes
import traceback
import logging
from flask import Flask, render_template, Response, request, jsonify, make_response

# Path Setup
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..', '..'))
sys.path.insert(0, ROOT_DIR)

# Configure Thread-Safe Logging
LOG_FILE = os.path.join(ROOT_DIR, 'app.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, mode='w'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("ThermalDash")

# SDK Setup - import from core package
from core.hcnet_sdk import (
    HCNetSDK, 
    NET_DVR_XML_CONFIG_INPUT, 
    NET_DVR_XML_CONFIG_OUTPUT,
    NET_DVR_THERMOMETRY_UPLOAD,
    NET_DVR_THERMOMETRY_COND,
    RemoteConfigCallback
)

app = Flask(__name__)

# Camera Config
CAMERA_IP = "192.168.10.152"
USER = "admin"
PASSWORD = "Demo@2024"
RTSP_URL = f"rtsp://{USER}:{PASSWORD}@{CAMERA_IP}:554/Streaming/Channels/101"

# Global State
sdk = HCNetSDK(ROOT_DIR)
user_id = -1
points = {} # id: {id, name, x, y, temp}
lock = threading.Lock()
next_point_id = 1

def sdk_callback(dwType, pBuffer, dwBufLen, pUserData):
    if dwType == 2 and dwBufLen >= ctypes.sizeof(NET_DVR_THERMOMETRY_UPLOAD):
        try:
            raw_data = ctypes.string_at(pBuffer, dwBufLen)
            data = NET_DVR_THERMOMETRY_UPLOAD.from_buffer_copy(raw_data)
            rid = int(data.byRuleID)
            temp = round(data.fMaxTemperature, 1)
            with lock:
                if rid in points:
                    points[rid]['temp'] = temp
            # Log periodic update only for significant points or sporadically
            if rid == 1: logger.debug(f"SDK Callback -> ID:1 Temp: {temp}C")
        except: pass
    return 0

_cb_ref = RemoteConfigCallback(sdk_callback)

def sync_points_from_cam():
    global next_point_id
    logger.info("Syncing points from camera via ISAPI...")
    url = "GET /ISAPI/Thermal/channels/2/thermometry/rules\r\n"
    url_buf = ctypes.create_string_buffer(url.encode('ascii'))
    
    input_data = NET_DVR_XML_CONFIG_INPUT()
    input_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
    input_data.lpRequestUrl = ctypes.cast(url_buf, ctypes.c_void_p)
    input_data.dwRequestUrlLen = len(url)
    
    out_buf = ctypes.create_string_buffer(1024 * 512)
    output_data = NET_DVR_XML_CONFIG_OUTPUT()
    output_data.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
    output_data.lpOutBuffer = ctypes.cast(out_buf, ctypes.c_void_p)
    output_data.dwOutBufferSize = 1024 * 512
    
    if sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(input_data), ctypes.byref(output_data)):
        import xml.etree.ElementTree as ET
        xml_res = out_buf.value.decode('utf-8', errors='ignore')
        try:
            root = ET.fromstring(xml_res)
            ns = {'isapi': 'http://www.isapi.org/ver20/XMLSchema'}
            max_id = 0
            with lock:
                points.clear()
                for region in root.findall('.//isapi:ThermometryRegion', ns):
                    enabled = region.find('isapi:enabled', ns).text
                    if enabled == 'true':
                        rid = int(region.find('isapi:id', ns).text)
                        name = region.find('isapi:name', ns).text
                        raw_px = region.find('.//isapi:positionX', ns).text
                        raw_py = region.find('.//isapi:positionY', ns).text
                        logger.info(f"DEBUG: Sync Point {rid} Raw Coords: X={raw_px}, Y={raw_py}")
                        
                        px_val = float(raw_px)
                        py_val = float(raw_py)
                        
                        # Handle both 0-1000 integers and 0.0-1.0 float formats just in case
                        ox = px_val / 1000.0 if px_val > 1.0 else px_val
                        oy = py_val / 1000.0 if py_val > 1.0 else py_val
                        
                        points[rid] = {'id': rid, 'name': name, 'x': ox, 'y': oy, 'temp': 0}
                        max_id = max(max_id, rid)
            next_point_id = (max_id % 10) + 1
            logger.info(f"Synced {len(points)} points. Next ID: {next_point_id}")
        except Exception as e: 
            logger.error(f"XML Parse failed: {e}")

def thermal_data_worker():
    logger.info("Starting Thermal Data Worker (SDK Command 3629)...")
    cond = NET_DVR_THERMOMETRY_COND()
    cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
    cond.dwChannel = 2 
    cond.wMode = 1
    sdk.hcnetsdk.NET_DVR_StartRemoteConfig(user_id, 3629, ctypes.byref(cond), ctypes.sizeof(cond), _cb_ref, None)
    while user_id >= 0: time.sleep(1)

CALIBRATION_FILE = os.path.join(ROOT_DIR, 'calibration.json')
POINTS_FILE = os.path.join(ROOT_DIR, 'points_config.json')

def load_local_points():
    if os.path.exists(POINTS_FILE):
        with open(POINTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_local_points(p_data):
    with open(POINTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(p_data, f, ensure_ascii=False)

@app.route('/')
def index():
    resp = make_response(render_template('index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/api/load_calibration')
def load_calibration():
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({
        "cam_nhiet": {"offX": -1.23, "scaleX": 3.47, "offY": -0.72, "scaleY": 2.44},
        "cam_quang": {"offX": 0, "scaleX": 1, "offY": 0, "scaleY": 1}
    })

@app.route('/api/save_calibration', methods=['POST'])
def save_calibration():
    data = request.get_json()
    with open(CALIBRATION_FILE, 'w') as f:
        json.dump(data, f)
    return jsonify({"status": "ok"})

@app.route('/api/points')
def get_points():
    local_names = load_local_points()
    with lock:
        # Merge local persistent names with real-time camera coordinates/temps
        for rid, p in points.items():
            s_rid = str(rid)
            if s_rid in local_names:
                p['name'] = local_names[s_rid]
        return jsonify(list(points.values()))

@app.route('/api/add_point', methods=['POST'])
def add_point():
    global next_point_id
    logger.info("--- WEB INTERACTION: ADD/UPDATE POINT ---")
    try:
        data = request.get_json()
        pid = int(data.get('id', next_point_id))
        name = data.get('name', f"Point {pid}")
        
        px = int(float(data['x']) * 1000)
        py = int(float(data['y']) * 1000)
        
        url = f"PUT /ISAPI/Thermal/channels/2/clickToThermometry/rules/{pid}?format=json\r\n"
        payload = {"ClickToThermometryRule": {"Point": {"positionX": px, "positionY": py}}}
        js = json.dumps(payload)
        
        logger.info(f"Issuing ISAPI {url} with Body: {js}")
        
        url_buf = ctypes.create_string_buffer(url.encode('ascii'))
        js_buf = ctypes.create_string_buffer(js.encode('ascii'))
        
        in_d = NET_DVR_XML_CONFIG_INPUT()
        in_d.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_INPUT)
        in_d.lpRequestUrl = ctypes.cast(url_buf, ctypes.c_void_p)
        in_d.dwRequestUrlLen = len(url)
        in_d.lpInBuffer = ctypes.cast(js_buf, ctypes.c_void_p)
        in_d.dwInBufferSize = len(js)
        
        out_d = NET_DVR_XML_CONFIG_OUTPUT()
        out_d.dwSize = ctypes.sizeof(NET_DVR_XML_CONFIG_OUTPUT)
        
        if sdk.hcnetsdk.NET_DVR_STDXMLConfig(user_id, ctypes.byref(in_d), ctypes.byref(out_d)):
            with lock:
                points[pid] = {'id': pid, 'name': name, 'x': data['x'], 'y': data['y'], 'temp': 0}
            
            # Persist Name Locally
            local_names = load_local_points()
            local_names[str(pid)] = name
            save_local_points(local_names)
            
            logger.info(f"SUCCESS: Point {pid} ({name}) updated at ISAPI({px}, {py})")
            if 'id' not in data: # Only cycle if user didn't specify ID
                next_point_id = (next_point_id % 10) + 1
            return jsonify({"status": "ok", "point": points[pid]})
        else:
            err = sdk.hcnetsdk.NET_DVR_GetLastError()
            logger.error(f"SDK ERROR during ClickToThermometry: {err}")
            return jsonify({"status": "error", "code": err}), 500
    except Exception as e:
        logger.exception("CRITICAL CRASH in add_point handler")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    logger.info("Initializing StationMonitor Thermal Dashboard...")
    if sdk.init():
        user_id, _ = sdk.login(CAMERA_IP, 8000, USER, PASSWORD)
        if user_id >= 0:
            sync_points_from_cam()
            threading.Thread(target=thermal_data_worker, daemon=True).start()
            logger.info("Server starting on http://localhost:5001")
            app.run(host='0.0.0.0', port=5001, threaded=True, debug=False)
            sdk.logout(user_id)
        else:
            logger.error("Login failed.")
        sdk.cleanup()
