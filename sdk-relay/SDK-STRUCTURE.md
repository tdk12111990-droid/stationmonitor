# SDK Folder Structure — Windows DLL + Linux SO

## Hiện tại

```
sdk-relay/test_sdk/lib/
├── windows/                          # Windows SDK (DLL)
│   ├── HCNetSDK.dll
│   ├── HCNetSDKCom/
│   ├── PlayCtrl.dll
│   ├── GdiPlus.dll
│   └── ...
│
└── linux/                            # Linux SDK (SO) — v6.1.9.4
    ├── libhcnetsdk.so               ✅ Main library
    ├── libPlayCtrl.so
    ├── libHCCore.so
    ├── libhpr.so
    ├── libcrypto.so.1.1
    ├── libssl.so.1.1
    ├── libz.so
    ├── libAudioRender.so
    ├── libNPQos.so
    ├── libSuperRender.so
    ├── libopenal.so.1
    ├── HCNetSDKCom/
    │   ├── libStreamTransClient.so
    │   ├── libSystemTransform.so
    │   ├── libHCAlarm.so
    │   └── ... (11 files)
    └── HCNetSDK_Log_Switch.xml
```

## Code tự động chọn

```python
# hcnet_sdk.py (line 327-343)

if sys.platform == 'win32':
    # Windows
    self.lib_path = os.path.join(sdk_path, "lib", "windows")
    os.add_dll_directory(self.lib_path)
    self.hcnetsdk = ctypes.WinDLL(lib_file)       # Load DLL
    
else:
    # Linux / Ubuntu
    self.lib_path = os.path.join(sdk_path, "lib", "linux")
    self.hcnetsdk = ctypes.CDLL(lib_file)         # Load SO
```

## Workflow

### 1. Dev trên Windows
```bash
cd StationMonitor/sdk-relay
python enhanced_relay.py

# Code dùng: lib/windows/HCNetSDK.dll ✅
```

### 2. Commit & Push
```bash
git add -A
git commit -m "fix: camera relay"
git push origin main

# .so files KHÔNG được push (quá nặng)
# .dll files cũng KHÔNG được push
```

### 3. Deploy lên Ubuntu
```bash
cd /opt/stationmonitor
git pull origin main
# Khi clone: lib/windows/ và lib/linux/ có folder rỗng

docker compose up -d --build

# Docker build Dockerfile:
# → COPY test_sdk/ vào container
# → Tìm libhcnetsdk.so ✅
# → SDK relay chạy bình thường
```

## File được track

```
.gitkeep           # Giữ folder không bị xóa
README.md          # Hướng dẫn tải SDK Linux
hcnet_sdk.py       # Code xử lý cross-platform
core/              # Thư mục module
```

## File KHÔNG được track (quá nặng)

```
*.dll              # DLL Windows
*.so               # SO Linux
*.so.*             # SO phụ thuộc
*.exe              # Executable
*.lib              # Library header
```

## Kích thước

- Windows SDK: ~40 MB (DLL + EXE)
- Linux SDK: ~16 MB (SO files)
- Tất cả .so files không push → Git clean ✅

## Kiểm tra

```bash
# Trên Windows
python -c "from test_sdk.core.hcnet_sdk import HCNetSDK; HCNetSDK()" 
# Output: Successfully loaded HCNetSDK.dll (Windows)

# Trên Linux
python3 -c "from test_sdk.core.hcnet_sdk import HCNetSDK; HCNetSDK()"
# Output: Successfully loaded libhcnetsdk.so (Linux)
```
