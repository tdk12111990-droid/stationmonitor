# Hikvision HCNetSDK for Linux

## Tải SDK

### Bước 1: Đăng nhập Hikvision Developer Center
- Vào https://www.hikvision.com/en/support/
- Chọn **Downloads** → **Surveillance Camera** → **Network Camera**
- Hoặc tìm trực tiếp: **HCNetSDK Linux**

### Bước 2: Chọn version
- Tìm **HCNetSDK_V6.x.x_build_Linux_x64** hoặc mới hơn
- Tải file `.tar.gz` hoặc `.zip`

### Bước 3: Giải nén vào đây
```bash
# Nếu file là .tar.gz
cd sdk-relay/test_sdk/lib/linux
tar -xzf ~/HCNetSDK_V6.x.x_build_Linux_x64.tar.gz

# Hoặc nếu file là .zip
unzip ~/HCNetSDK_V6.x.x_build_Linux_x64.zip -d .

# Kết quả phải có:
# ├── libhcnetsdk.so
# ├── libPlayCtrl.so
# ├── libhpr.so
# └── HCNetSDKCom/
#     ├── libStreamTransClient.so
#     └── ...
```

### Bước 4: Cấp quyền
```bash
chmod +x *.so
chmod -R +x HCNetSDKCom/
```

## Ghi chú
- Chỉ cần file `.so` (shared libraries)
- Không cần `.lib`, `.h` header files
- Phải cấp quyền execute để ctypes có thể load
