import ctypes
import os
import sys

# Define constants
NET_DVR_DEV_ADDRESS_MAX_LEN = 129
NET_DVR_LOGIN_USERNAME_MAX_LEN = 64
NET_DVR_LOGIN_PASSWD_MAX_LEN = 64
SERIALNO_LEN = 48

class NET_DVR_DEVICEINFO_V30(ctypes.Structure):
    _fields_ = [
        ("sSerialNumber", ctypes.c_ubyte * SERIALNO_LEN),
        ("byAlarmInPortNum", ctypes.c_ubyte),
        ("byAlarmOutPortNum", ctypes.c_ubyte),
        ("byDiskNum", ctypes.c_ubyte),
        ("byDVRType", ctypes.c_ubyte),
        ("byChanNum", ctypes.c_ubyte),
        ("byStartChan", ctypes.c_ubyte),
        ("byAudioChanNum", ctypes.c_ubyte),
        ("byIPChanNum", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 24)
    ]

class NET_DVR_DEVICEINFO_V40(ctypes.Structure):
    _fields_ = [
        ("struDeviceV30", NET_DVR_DEVICEINFO_V30),
        ("bySupportLock", ctypes.c_ubyte),
        ("byRetryLoginTime", ctypes.c_ubyte),
        ("byPasswordLevel", ctypes.c_ubyte),
        ("byProxyType", ctypes.c_ubyte),
        ("dwSurplusLockTime", ctypes.c_uint32),
        ("byCharEncodeType", ctypes.c_ubyte),
        ("bySupportDevV40", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 254)
    ]

class NET_DVR_USER_LOGIN_INFO(ctypes.Structure):
    _fields_ = [
        ("sDeviceAddress", ctypes.c_char * NET_DVR_DEV_ADDRESS_MAX_LEN),
        ("byUseTransport", ctypes.c_ubyte),
        ("wPort", ctypes.c_uint16),
        ("sUserName", ctypes.c_char * NET_DVR_LOGIN_USERNAME_MAX_LEN),
        ("sPassword", ctypes.c_char * NET_DVR_LOGIN_PASSWD_MAX_LEN),
        ("cbLoginResult", ctypes.c_void_p),
        ("pUser", ctypes.c_void_p),
        ("bByMirror", ctypes.c_bool),
        ("byRes", ctypes.c_ubyte * 239)
    ]

# Thermal Data Structures
class NET_DVR_THERMOMETRY_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("dwChan", ctypes.c_uint32),
        ("wMode", ctypes.c_uint16),
        ("byRes", ctypes.c_ubyte * 62)
    ]

class NET_DVR_THERMOMETRY_UPLOAD(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("dwRelativeTime", ctypes.c_uint32),
        ("dwAbsTime", ctypes.c_uint32),
        ("szRuleName", ctypes.c_char * 32),
        ("byRuleID", ctypes.c_ubyte),
        ("byRuleType", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 2),
        ("fMaxTemperature", ctypes.c_float),
        ("fMinTemperature", ctypes.c_float),
        ("fAverageTemperature", ctypes.c_float),
        ("fTemperatureDiff", ctypes.c_float),
        ("byRes2", ctypes.c_ubyte * 12)
    ]

# Callback signature for RemoteConfig
RemoteConfigCallback = ctypes.WINFUNCTYPE(None, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p)

class HCNetSDK:
    def __init__(self, sdk_path):
        self.sdk_path = sdk_path
        self.lib_path = os.path.join(sdk_path, "lib")
        
        # Set DLL search path for Windows
        if sys.platform == 'win32':
            os.add_dll_directory(self.lib_path)
            os.add_dll_directory(os.path.join(self.lib_path, "HCNetSDKCom"))

        # Load DLLs
        try:
            self.hcnetsdk = ctypes.WinDLL(os.path.join(self.lib_path, "HCNetSDK.dll"))
            print(f"Successfully loaded HCNetSDK.dll from {self.lib_path}")
        except Exception as e:
            print(f"Failed to load HCNetSDK.dll: {e}")
            raise

        self._setup_prototypes()

    def _setup_prototypes(self):
        # BOOL NET_DVR_Init()
        self.hcnetsdk.NET_DVR_Init.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Init.argtypes = []

        # BOOL NET_DVR_Cleanup()
        self.hcnetsdk.NET_DVR_Cleanup.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Cleanup.argtypes = []

        # LONG NET_DVR_Login_V40(LPNET_DVR_USER_LOGIN_INFO pLoginInfo, LPNET_DVR_DEVICEINFO_V40 lpDeviceInfo)
        self.hcnetsdk.NET_DVR_Login_V40.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_Login_V40.argtypes = [ctypes.POINTER(NET_DVR_USER_LOGIN_INFO), ctypes.POINTER(NET_DVR_DEVICEINFO_V40)]

        # BOOL NET_DVR_Logout(LONG lUserID)
        self.hcnetsdk.NET_DVR_Logout.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Logout.argtypes = [ctypes.c_long]

        # LONG NET_DVR_StartRemoteConfig(LONG lUserID, DWORD dwCommand, LPVOID lpInBuf, DWORD dwInBufSize, fRemoteConfigCallback cbRemoteConfigCallback, LPVOID pUserData)
        self.hcnetsdk.NET_DVR_StartRemoteConfig.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_StartRemoteConfig.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, RemoteConfigCallback, ctypes.c_void_p]

        # BOOL NET_DVR_StopRemoteConfig(LONG lHandle)
        self.hcnetsdk.NET_DVR_StopRemoteConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_StopRemoteConfig.argtypes = [ctypes.c_long]

        # DWORD NET_DVR_GetLastError()
        self.hcnetsdk.NET_DVR_GetLastError.restype = ctypes.c_uint32
        self.hcnetsdk.NET_DVR_GetLastError.argtypes = []

    def init(self):
        return self.hcnetsdk.NET_DVR_Init()

    def cleanup(self):
        return self.hcnetsdk.NET_DVR_Cleanup()

    def login(self, ip, port, username, password):
        login_info = NET_DVR_USER_LOGIN_INFO()
        login_info.sDeviceAddress = ip.encode('utf-8')
        login_info.wPort = port
        login_info.sUserName = username.encode('utf-8')
        login_info.sPassword = password.encode('utf-8')
        login_info.bByMirror = False

        device_info = NET_DVR_DEVICEINFO_V40()
        
        user_id = self.hcnetsdk.NET_DVR_Login_V40(ctypes.byref(login_info), ctypes.byref(device_info))
        if user_id < 0:
            error_code = self.hcnetsdk.NET_DVR_GetLastError()
            print(f"Login failed for {ip}. Error code: {error_code}")
            return -1, None
        
        return user_id, device_info

    def logout(self, user_id):
        return self.hcnetsdk.NET_DVR_Logout(user_id)
