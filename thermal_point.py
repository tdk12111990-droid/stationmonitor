import requests
from requests.auth import HTTPDigestAuth
import threading
import time
import numpy as np
import json
from flask import Flask, Response, request, jsonify

# --- CẤU HÌNH CAMERA ---
CAMERA_IP = "192.168.10.152"
USERNAME = "admin"
PASSWORD = "Demo@2024"

# --- BIẾN TOÀN CỤC ---
current_matrix = None
current_jpeg_bytes = None        # Ảnh nhiệt
current_visible_bytes = None     # Ảnh quang (thường to hơn)
current_mapping = None           # Thông số VisibleValidRect
data_lock = threading.Lock()
running = True

app = Flask(__name__)

# --- GIAO DIỆN WEB (SIDE-BY-SIDE BI-SPECTRUM) ---
HTML_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Bi-spectrum Thermal Overlay</title>
    <style>
        body { background: #050505; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; margin: 0; }
        .header { margin-bottom: 20px; text-align: center; }
        .header h2 { margin: 0; color: #fff; letter-spacing: 2px; font-weight: 300; }
        .header p { color: #888; font-size: 14px; margin-top: 5px; }
        
        .main-wrapper { display: flex; gap: 40px; align-items: flex-start; justify-content: center; width: 100%; max-width: 100%; flex-wrap: wrap; }
        .video-panel { display: flex; flex-direction: column; align-items: center; }
        .panel-header { display: flex; justify-content: center; align-items: center; margin-bottom: 10px; gap: 15px; }
        .panel-header h3 { margin: 0; color: #ccc; font-weight: 400; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
        .zoom-btn { background: #333; color: white; border: 1px solid #555; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: 0.2s; }
        .zoom-btn:hover { background: #00ff00; color: black; border-color: #00ff00; }
        
        .video-container { 
            position: relative; 
            display: inline-block; 
            box-shadow: 0 20px 50px rgba(0,0,0,0.8); 
            border-radius: 4px; 
            overflow: hidden; 
            border: 1px solid #333; 
            cursor: crosshair;
            background: #111;
        }
        
        /* Cố định kích thước hiển thị cho đẹp */
        .video-container { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
        #visible-img { display: block; width: 640px; height: 360px; object-fit: cover; transition: all 0.3s ease; }
        #thermal-img { display: block; width: 640px; height: 480px; image-rendering: pixelated; transition: all 0.3s ease; } 
        
        /* Chế độ phóng to */
        .video-container.zoomed #visible-img { width: 1280px; height: 720px; }
        .video-container.zoomed #thermal-img { width: 1024px; height: 768px; }
        
        .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        
        .marker { position: absolute; pointer-events: none; }
        
        .tooltip { 
            position: absolute; 
            background: rgba(10, 10, 10, 0.85); 
            padding: 4px 10px; 
            border-radius: 4px; 
            font-size: 14px; 
            font-weight: 800; 
            color: #00ff00;
            transform: translate(15px, -20px); 
            border: 1px solid rgba(255,255,255,0.1); 
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            font-family: monospace;
        }
        
        .crosshair { 
            position: absolute; 
            width: 20px; 
            height: 20px; 
            transform: translate(-50%, -50%); 
            color: #00ff00;
        }
        .crosshair::before, .crosshair::after { content: ''; position: absolute; background: currentColor; box-shadow: 0 0 2px rgba(0,0,0,0.5); }
        .crosshair::before { top: 50%; left: 0; width: 100%; height: 2px; margin-top: -1px; }
        .crosshair::after { left: 50%; top: 0; height: 100%; width: 2px; margin-left: -1px; }
        
        .warning-toast {
            position: fixed; top: 20px; right: 20px; background: #ff3333; color: white; padding: 10px 20px; 
            border-radius: 4px; font-weight: bold; box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 1000;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>BI-SPECTRUM THERMAL OVERLAY</h2>
        <p>Đồng bộ tọa độ: Click vào ảnh Quang, hiển thị nhiệt độ ở cả 2 màn hình.</p>
    </div>
    
    <div class="main-wrapper">
        <!-- Panel ảnh Quang (Visible) -->
        <div class="video-panel">
            <div class="panel-header">
                <h3>Camera Quang (Visible)</h3>
                <button class="zoom-btn" onclick="toggleZoom('container-vis')">🔍 Phóng to</button>
            </div>
            <div class="video-container" id="container-vis">
                <img src="/video_feed_visible" id="visible-img" alt="Đang chờ ảnh quang..." onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'640\\' height=\\'360\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23222\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23666\\' text-anchor=\\'middle\\'>No Visible Stream</text></svg>'" />
                <div class="overlay" id="overlay-vis"></div>
            </div>
        </div>
        
        <!-- Panel ảnh Nhiệt (Thermal) -->
        <div class="video-panel">
            <div class="panel-header">
                <h3>Camera Nhiệt (Thermal)</h3>
                <button class="zoom-btn" onclick="toggleZoom('container-therm')">🔍 Phóng to</button>
            </div>
            <div class="video-container" id="container-therm">
                <img src="/video_feed" id="thermal-img" alt="Đang chờ ảnh nhiệt..." />
                <div class="overlay" id="overlay-therm"></div>
            </div>
        </div>
    </div>
    
    <div class="warning-toast" id="toast">Điểm click nằm ngoài vùng quét của ống kính nhiệt!</div>
    
    <script>
        const containerVis = document.getElementById('container-vis');
        const containerTherm = document.getElementById('container-therm');
        const overlayVis = document.getElementById('overlay-vis');
        const overlayTherm = document.getElementById('overlay-therm');
        const toast = document.getElementById('toast');
        
        let mapping = null;
        let activeMarkers = [];

        // Lấy thông số lệch ống kính từ Camera
        fetch('/get_mapping').then(r => r.json()).then(data => {
            mapping = data.mapping;
            console.log("Mapping info:", mapping);
        });

        function showToast() {
            toast.style.opacity = '1';
            setTimeout(() => toast.style.opacity = '0', 3000);
        }

        function toggleZoom(containerId) {
            const container = document.getElementById(containerId);
            container.classList.toggle('zoomed');
            
            // Re-render markers instantly after zoom transition to avoid jumping
            setTimeout(() => {
                // Not strictly necessary since markers are absolute based on %, 
                // but if using px, we need to recalculate.
                // Wait! Our markers are using left/top in 'px' relative to rect.width/height at click time!
                // We should redraw them or change them to use %.
                // For simplicity, we just clear active markers to avoid visual bugs when zooming.
                // activeMarkers.forEach(m => { m.visEl.marker.remove(); m.thermEl.marker.remove(); });
                // activeMarkers = [];
            }, 300);
        }

        function createMarkerUI() {
            const marker = document.createElement('div');
            marker.className = 'marker';
            const cross = document.createElement('div');
            cross.className = 'crosshair';
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerText = '... °C';
            marker.appendChild(cross);
            marker.appendChild(tooltip);
            return { marker, cross, tooltip };
        }

        // XỬ LÝ CLICK TRÊN ẢNH QUANG (VISIBLE)
        containerVis.addEventListener('click', (e) => {
            if (!mapping) return alert("Đang chờ thông số hiệu chuẩn từ camera...");
            
            const rect = containerVis.getBoundingClientRect();
            // Tọa độ chuẩn hóa trên ảnh Quang (từ 0.0 đến 1.0)
            const vx = (e.clientX - rect.left) / rect.width;
            const vy = (e.clientY - rect.top) / rect.height;
            
            // 1. Kiểm tra xem điểm này có nằm trong vùng mà ống kính nhiệt nhìn thấy không?
            if (vx < mapping.x || vx > mapping.x + mapping.width ||
                vy < mapping.y || vy > mapping.y + mapping.height) {
                showToast(); // Báo lỗi nếu click ngoài lề
                return;
            }
            
            // 2. Nội suy sang tọa độ chuẩn hóa của ảnh Nhiệt (từ 0.0 đến 1.0)
            const normTx = (vx - mapping.x) / mapping.width;
            const normTy = (vy - mapping.y) / mapping.height;
            
            // 3. Tọa độ ma trận gốc (384x288) để gọi API
            const origX = normTx * 384;
            const origY = normTy * 288;
            
            // 4. Vẽ Marker lên cả 2 màn hình
            // Để hỗ trợ Zoom mượt mà, ta đặt top/left theo phần trăm (%) thay vì pixel (px)
            const uiVis = createMarkerUI();
            const uiTherm = createMarkerUI();
            
            uiVis.marker.style.left = (vx * 100) + '%';
            uiVis.marker.style.top = (vy * 100) + '%';
            
            uiTherm.marker.style.left = (normTx * 100) + '%';
            uiTherm.marker.style.top = (normTy * 100) + '%';
            
            overlayVis.appendChild(uiVis.marker);
            overlayTherm.appendChild(uiTherm.marker);
            
            activeMarkers.push({
                origX: origX, origY: origY,
                visEl: uiVis, thermEl: uiTherm
            });
        });

        // XỬ LÝ CLICK TRÊN ẢNH NHIỆT (THERMAL) - Ánh xạ ngược lại
        containerTherm.addEventListener('click', (e) => {
            if (!mapping) return;
            
            const thermRect = containerTherm.getBoundingClientRect();
            const normTx = (e.clientX - thermRect.left) / thermRect.width;
            const normTy = (e.clientY - thermRect.top) / thermRect.height;
            
            const origX = normTx * 384;
            const origY = normTy * 288;
            
            // Nội suy ngược lại ra tọa độ chuẩn hóa ảnh Quang
            const vx = (normTx * mapping.width) + mapping.x;
            const vy = (normTy * mapping.height) + mapping.y;
            
            const uiVis = createMarkerUI();
            const uiTherm = createMarkerUI();
            
            uiVis.marker.style.left = (vx * 100) + '%';
            uiVis.marker.style.top = (vy * 100) + '%';
            
            uiTherm.marker.style.left = (normTx * 100) + '%';
            uiTherm.marker.style.top = (normTy * 100) + '%';
            
            overlayVis.appendChild(uiVis.marker);
            overlayTherm.appendChild(uiTherm.marker);
            
            activeMarkers.push({
                origX: origX, origY: origY,
                visEl: uiVis, thermEl: uiTherm
            });
        });

        // Vòng lặp cập nhật nhiệt độ Real-time
        setInterval(async () => {
            if (activeMarkers.length === 0) return;
            for (let m of activeMarkers) {
                try {
                    const res = await fetch(`/get_temp?x=${m.origX}&y=${m.origY}`);
                    const data = await res.json();
                    if (data.temp !== null) {
                        const tempVal = data.temp.toFixed(1);
                        m.visEl.tooltip.innerText = tempVal + ' °C';
                        m.thermEl.tooltip.innerText = tempVal + ' °C';
                        
                        const t = parseFloat(tempVal);
                        let color = '#00ff00';
                        if (t >= 40) color = '#ff3333';
                        else if (t < 30) color = '#33ccff';
                        
                        m.visEl.tooltip.style.color = color;
                        m.visEl.cross.style.color = color;
                        m.thermEl.tooltip.style.color = color;
                        m.thermEl.cross.style.color = color;
                    }
                } catch (err) {}
            }
        }, 200);
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return HTML_PAGE

@app.route('/get_temp')
def get_temp():
    try:
        x = int(float(request.args.get('x', 0)))
        y = int(float(request.args.get('y', 0)))
        with data_lock:
            if current_matrix is not None:
                h, w = current_matrix.shape
                x = max(0, min(w - 1, x))
                y = max(0, min(h - 1, y))
                return jsonify({"temp": float(current_matrix[y, x])})
    except: pass
    return jsonify({"temp": None})

@app.route('/get_mapping')
def get_mapping():
    with data_lock:
        # Nếu camera không cấu hình VisibleValidRect, trả về một khung giả định ở giữa
        default_map = {"x": 0.2, "y": 0.084, "width": 0.63, "height": 0.841}
        return jsonify({"mapping": current_mapping if current_mapping else default_map})

def generate_frames(stream_type="thermal"):
    while True:
        with data_lock:
            frame_bytes = current_jpeg_bytes if stream_type == "thermal" else current_visible_bytes
        if frame_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.1)

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames("thermal"), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/video_feed_visible')
def video_feed_visible():
    return Response(generate_frames("visible"), mimetype='multipart/x-mixed-replace; boundary=frame')

def parse_multipart(data, boundary):
    parts = data.split(boundary)
    result = {'images': []}
    for part in parts:
        if b'Content-Type: application/json' in part:
            header_end = part.find(b'\r\n\r\n')
            if header_end != -1:
                try: result['json'] = json.loads(part[header_end+4:].strip())
                except: pass
        elif b'Content-Type: image/pjpeg' in part or b'Content-Type: image/jpeg' in part:
            header_end = part.find(b'\r\n\r\n')
            if header_end != -1:
                result['images'].append(part[header_end+4:])
        elif b'Content-Type: application/octet-stream' in part or len(part) > 100000:
            header_end = part.find(b'\r\n\r\n')
            if header_end != -1:
                result['p2p'] = part[header_end+4:]
    return result

def fetch_thermal_matrix_loop():
    global current_matrix, current_jpeg_bytes, current_visible_bytes, current_mapping
    url = f"http://{CAMERA_IP}/ISAPI/Thermal/channels/2/thermometry/jpegPicWithAppendData?format=json"
    auth = HTTPDigestAuth(USERNAME, PASSWORD)
    
    while running:
        try:
            response = requests.get(url, auth=auth, timeout=3)
            if response.status_code == 200:
                parts = parse_multipart(response.content, b'--boundary')
                
                if 'json' in parts and 'p2p' in parts and len(parts['images']) > 0:
                    meta = parts['json']['JpegPictureWithAppendData']
                    w, h = meta['jpegPicWidth'], meta['jpegPicHeight']
                    
                    matrix = np.frombuffer(parts['p2p'][:meta['p2pDataLen']], dtype=np.float32).reshape(h, w)
                    
                    thermal_img = parts['images'][0]
                    # Nếu có ảnh thứ 2, đó là ảnh quang (Visible)
                    visible_img = parts['images'][1] if len(parts['images']) > 1 else None
                    
                    with data_lock:
                        current_matrix = matrix
                        current_jpeg_bytes = thermal_img
                        if visible_img:
                            current_visible_bytes = visible_img
                        if 'VisibleValidRect' in meta:
                            current_mapping = meta['VisibleValidRect']
                        
        except Exception:
            pass
        # Giảm cực thấp xuống 0.05s (Tương đương ép camera chạy 20 FPS)
        time.sleep(0.05)

def main():
    thread = threading.Thread(target=fetch_thermal_matrix_loop, daemon=True)
    thread.start()
    
    print("===============================================================")
    print(">>> ỨNG DỤNG BI-SPECTRUM ĐÃ SẴN SÀNG <<<")
    print(">>> TRUY CẬP: http://localhost:5000 để xem 2 màn hình")
    print("===============================================================")
    
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)

if __name__ == "__main__":
    main()
