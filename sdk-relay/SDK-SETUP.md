# SDK Setup — Cross-Platform (Windows DLL + Linux SO)

## Cấu trúc thư mục

```
sdk-relay/test_sdk/lib/
├── windows/                    # Windows DLL (đã có)
│   ├── HCNetSDK.dll
│   ├── HCNetSDKCom/
│   ├── PlayCtrl.dll
│   └── ...
└── linux/                      # Linux SO (cần tải)
    ├── libhcnetsdk.so
    ├── libPlayCtrl.so
    └── HCNetSDKCom/
        ├── libStreamTransClient.so
        └── ...
```

## Cách hoạt động

Code tự động chọn đúng library dựa vào OS:

```python
# hcnet_sdk.py
if sys.platform == 'win32':
    self.lib_path = os.path.join(sdk_path, "lib", "windows")
    self.hcnetsdk = ctypes.WinDLL(lib_file)  # Load .dll
else:
    self.lib_path = os.path.join(sdk_path, "lib", "linux")
    self.hcnetsdk = ctypes.CDLL(lib_file)    # Load .so
```

---

## Lần đầu: Windows (Sẵn có)

Thư mục `lib/windows/` đã có DLL từ Hikvision SDK Windows version.

✅ Chạy trên Windows ngay được:
```bash
cd sdk-relay
python enhanced_relay.py
```

---

## Linux (Cần tải)

### Bước 1: Tải SDK từ Hikvision

1. Vào: https://www.hikvision.com/en/support/
2. Tìm: **HCNetSDK_V6.x.x_build_Linux_x64**
3. Tải file `.tar.gz` (hoặc `.zip`)

### Bước 2: Giải nén

```bash
# Trên máy Linux cùng dải mạng (hoặc máy Windows, chuyển sang Linux)
cd stationmonitor/sdk-relay/test_sdk/lib/linux

# Nếu file .tar.gz
tar -xzf ~/HCNetSDK_V6.x.x_build_Linux_x64.tar.gz

# Hoặc nếu file .zip
unzip ~/HCNetSDK_V6.x.x_build_Linux_x64.zip -d .

# Kết quả:
ls -la
# libhcnetsdk.so
# libPlayCtrl.so
# libhpr.so
# HCNetSDKCom/
```

### Bước 3: Cấp quyền

```bash
chmod +x *.so
chmod -R +x HCNetSDKCom/
```

### Bước 4: Kiểm tra load

```bash
cd ../../..  # Về sdk-relay/
python3 -c "from test_sdk.core.hcnet_sdk import HCNetSDK; sdk = HCNetSDK(); print('OK')"
```

Nếu không lỗi → SDK đã load thành công

---

## Workflow: Dev Windows → Deploy Linux

### 1. Dev trên Windows
```bash
# .env hoặc hardcode
CAMERA_IP=192.168.10.152
API_URL=http://localhost:5056

python enhanced_relay.py
# Dùng lib/windows/*.dll ✓
```

### 2. Commit & Push
```bash
git add -A
git commit -m "fix: camera relay"
git push origin main
```

### 3. Deploy trên Ubuntu
```bash
git pull origin main
# lib/windows/ có sẵn (nhưng không dùng)
# lib/linux/ cần tải SDK + giải nén

docker compose up -d --build
# Dùng lib/linux/*.so ✓
```

### 4. Update code
Bạn sửa code trên Windows, commit, push → server tự pull & rebuild
```bash
# Trên Ubuntu
cd /opt/stationmonitor
git pull origin main
docker compose up -d --build
```

---

## File bắt buộc cần có

### Windows (có sẵn)
- ✅ `sdk-relay/test_sdk/lib/windows/HCNetSDK.dll`
- ✅ `sdk-relay/test_sdk/lib/windows/HCNetSDKCom/...`
- ✅ `sdk-relay/test_sdk/lib/windows/PlayCtrl.dll`

### Linux (cần tải)
- ❌ `sdk-relay/test_sdk/lib/linux/libhcnetsdk.so` → **TẢI TỪ HIKVISION**
- ❌ `sdk-relay/test_sdk/lib/linux/HCNetSDKCom/libStreamTransClient.so` → **TẢI TỪ HIKVISION**
- ❌ `sdk-relay/test_sdk/lib/linux/libPlayCtrl.so` → **TẢI TỪ HIKVISION**

---

## Troubleshooting

### Lỗi: "libhcnetsdk.so: No such file"
```
Failed to load libhcnetsdk.so: ... Ensure SDK is in /path/to/lib/linux
```
→ Chưa tải SDK Linux, cần giải nén vào `lib/linux/`

### Lỗi: "Cannot open shared object"
```
CDLL(...): error while loading shared libraries: libcrypto.so.1.1
```
→ Cần cài openssl lib:
```bash
sudo apt install libssl1.1 -y
```

### Lỗi trên Docker: "file not found"
→ Dockerfile COPY `test_sdk/` vào image, nhưng không copy đủ file
→ Kiểm tra `sdk-relay/Dockerfile`:
```dockerfile
COPY test_sdk/ /app/test_sdk/
RUN chmod -R +x /app/test_sdk/lib/linux/*.so
```

---

## .gitignore

File này đã có:
```
sdk-relay/test_sdk/lib/windows/*.dll
sdk-relay/test_sdk/lib/windows/*.exe
sdk-relay/test_sdk/lib/linux/
```

→ `lib/windows/` không push (DLL quá nặng)
→ `lib/linux/` không push (bạn tải riêng)

Nhưng `lib/windows/.gitkeep` và `lib/linux/.gitkeep` vẫn track để folder không bị xóa.

---

## Copy-Paste Quick Start

```bash
# Windows: Chạy thử
cd D:\StationMonitor\sdk-relay
python enhanced_relay.py

# Linux: Sau khi tải SDK
cd /opt/stationmonitor/sdk-relay/test_sdk/lib/linux
tar -xzf ~/HCNetSDK_V6.x.x_build_Linux_x64.tar.gz
chmod +x *.so && chmod -R +x HCNetSDKCom/

cd /opt/stationmonitor
docker compose up -d stationmonitor-ai
docker compose logs -f stationmonitor-ai
```
