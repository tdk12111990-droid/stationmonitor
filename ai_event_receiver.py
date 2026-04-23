from flask import Flask, request, jsonify
import os
import time

app = Flask(__name__)

# Thư mục lưu video nhận được (theo yêu cầu của bạn)
RECEIVED_DIR = "received_videos"
os.makedirs(RECEIVED_DIR, exist_ok=True)

@app.route('/api/detect', methods=['POST'])
def receive_detection():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No JSON data"}), 400
        
    person_count = data.get('person_count')
    timestamp = data.get('timestamp')
    print(f"[*] [AI EVENT] Nhận thông báo từ IP: {request.remote_addr}")
    print(f"[*] Phát hiện {person_count} người tại {timestamp}")
    return jsonify({"status": "success"}), 200

# Hứng cả 2 đường dẫn để chắc chắn (có /api/ và không có /api/)
@app.route('/api/upload-video', methods=['POST'])
@app.route('/upload-video', methods=['POST'])
def receive_video():
    if 'video' not in request.files:
        print("[!] Lỗi: Không tìm thấy file video trong request")
        return jsonify({"status": "error", "message": "No video file"}), 400
    
    video_file = request.files['video']
    filename = video_file.filename
    if not filename:
        filename = f"capture_{int(time.time())}.mp4"
        
    save_path = os.path.join(RECEIVED_DIR, filename)
    
    video_file.save(save_path)
    print(f"[+] [AI VIDEO] Đã nhận video từ {request.remote_addr}")
    print(f"[+] Lưu thành công: {save_path}")
    
    return jsonify({"status": "success", "message": f"Saved as {filename}"}), 200

if __name__ == '__main__':
    print("="*50)
    print("🚀 STATION MONITOR - AI RECEIVER CENTER")
    print(f"📡 Đang lắng nghe tại IP: 100.117.86.96 (Port 7000)")
    print(f"📂 Video sẽ lưu tại: {os.path.abspath(RECEIVED_DIR)}")
    print("="*50)
    
    # Chạy trên port 7000 như bạn yêu cầu
    app.run(host='0.0.0.0', port=7000)
