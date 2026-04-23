import cv2
import os
import sys

def play_latest_video():
    video_dir = "received_videos"
    if not os.path.exists(video_dir):
        print(f"❌ Thư mục {video_dir} không tồn tại!")
        return

    # Lấy file video mới nhất
    files = [os.path.join(video_dir, f) for f in os.listdir(video_dir) if f.endswith('.mp4')]
    if not files:
        print("❌ Không tìm thấy file video nào!")
        return
    
    latest_video = max(files, key=os.path.getctime)
    print(f"🎬 Đang mở video: {latest_video}")
    print("💡 Nhấn phím 'Q' để thoát.")

    cap = cv2.VideoCapture(latest_video)
    
    if not cap.isOpened():
        print("❌ Không thể mở file video này!")
        return

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Hiển thị frame
        cv2.imshow('AI Video Player', frame)
        
        # Chạy ở tốc độ bình thường (khoảng 25-30fps)
        if cv2.waitKey(25) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("✅ Đã đóng trình phát.")

if __name__ == "__main__":
    play_latest_video()
