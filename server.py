from flask import Flask, request
import datetime

app = Flask(__name__)

@app.route('/alarm', methods=['POST'])
def receive_alarm():
    # Lấy dữ liệu thô (XML hoặc JSON tùy cấu hình cam)
    data = request.data.decode('utf-8')
    
    print(f"\n🔔 [{datetime.datetime.now()}] CÓ BÁO ĐỘNG MỚI!")
    
    # Kiểm tra loại báo động trong nội dung (ví dụ: thermometry cho đo nhiệt)
    if 'thermometry' in data:
        print("⚠️ Cảnh báo: Quá nhiệt thiết bị tại trạm!")
    elif 'fire' in data:
        print("🔥 Cảnh báo: Phát hiện nguồn lửa!")
        
    # In một phần dữ liệu để Khải soi cấu trúc
    print(data[:500]) 

    # Trả về mã 200 để Camera biết Backend đã nhận thành công
    return "OK", 200

if __name__ == '__main__':
    # Chạy server tại Port 8080 (Khải nhớ mở Port này trên Firewall)
    app.run(host='0.0.0.0', port=8080)