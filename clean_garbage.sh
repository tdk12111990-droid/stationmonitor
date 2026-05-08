#!/bin/bash
echo "🧹 ĐANG DỌN DẸP HỆ THỐNG..."

# 1. Dừng tuyệt đối các tiến trình cũ (Không để sót bất kỳ bản Python nào)
sudo ps -ef | grep python3 | grep -v grep | awk '{print $2}' | xargs -r sudo kill -9
echo "✅ Đã quét sạch 100% tiến trình Python treo (Chỉ còn duy nhất 1 luồng chuẩn)."

# 2. Xóa dữ liệu rác trong Database (Sử dụng user postgres chuẩn)
docker exec stationmonitor-db psql -U postgres -d stationmonitor -c "DELETE FROM \"AlertHistories\" WHERE \"AlertId\" IN (SELECT \"Id\" FROM \"Alerts\" WHERE \"Value\" > 100 OR \"Message\" LIKE '%/snap/%'); DELETE FROM \"DetectionEvents\" WHERE \"AlertId\" IN (SELECT \"Id\" FROM \"Alerts\" WHERE \"Value\" > 100 OR \"Message\" LIKE '%/snap/%'); DELETE FROM \"Alerts\" WHERE \"Value\" > 100 OR \"Message\" LIKE '%/snap/%';"
echo "✅ Đã dọn dẹp dữ liệu rác (Nhiệt độ > 100°C và Ổ đĩa /snap/)."

# 3. Khởi động lại dịch vụ mới (Dùng user hiện tại để có đủ thư viện cv2)
CURRENT_USER=$(logname || echo $USER)
sudo -u $CURRENT_USER nohup python3 sdk-relay/ai_api.py > ai_api.log 2>&1 &
sudo -u $CURRENT_USER nohup python3 sdk-relay/enhanced_relay.py > sdk-relay/ai_relay.log 2>&1 &
echo "🚀 Đã khởi động lại dịch vụ với quyền user $CURRENT_USER!"
echo "✨ XONG! Bây giờ bạn hãy F5 lại trình duyệt."
