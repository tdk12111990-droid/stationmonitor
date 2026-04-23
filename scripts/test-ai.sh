#!/bin/bash
echo "--- KIỂM TRA KẾT NỐI CAMERA TỪ TRONG CONTAINER AI ---"

# 1. Kiểm tra mạng
echo "1. Kiểm tra kết nối tới 192.168.10.153..."
python3 -c "import socket; s = socket.socket(); s.settimeout(2); print('Kết nối PORT 80: ', s.connect_ex(('192.168.10.153', 80)) == 0)"
python3 -c "import socket; s = socket.socket(); s.settimeout(2); print('Kết nối PORT 8000 (SDK): ', s.connect_ex(('192.168.10.153', 8000)) == 0)"

# 2. Kiểm tra SDK
echo "2. Kiểm tra thư viện Hikvision SDK..."
python3 -c "import ctypes; import os; lib = ctypes.cdll.LoadLibrary('./test_sdk/lib/linux/libhcnetsdk.so'); print('Nạp SDK thành công:', lib is not None)"
