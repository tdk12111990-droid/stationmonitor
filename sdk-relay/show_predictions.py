import csv
import os

csv_file = "sdk-relay/ai_history_v2.csv"

if not os.path.exists(csv_file):
    print("Chưa có dữ liệu dự báo.")
    exit()

print("\n" + "="*60)
print(f"{'BẢNG TỔNG HỢP DỰ BÁO NHIỆT ĐỘ (AI)':^60}")
print("="*60)
print(f"{'Thời gian':^20} | {'Điểm':^8} | {'Dự báo (5ph)':^15} | {'Trạng thái'}")
print("-"*60)

with open(csv_file, "r") as f:
    reader = csv.DictReader(f)
    rows = list(reader)
    # Lấy 6 dòng cuối cùng (của lần fetch mới nhất)
    latest_rows = rows[-6:]
    for row in latest_rows:
        ts = row['Timestamp']
        pid = row['PointId']
        val = float(row['PredictedValue'])
        status = row['Status']
        
        # Thêm màu sắc đơn giản cho terminal
        color = "\033[92m" if status == "OK" else "\033[91m"
        reset = "\033[0m"
        
        print(f"{ts:^20} | {pid:^8} | {color}{val:>11.2f} °C{reset} | {color}{status}{reset}")

print("="*60 + "\n")
