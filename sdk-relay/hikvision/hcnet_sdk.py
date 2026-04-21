import ctypes
import os
import sys

# Constants
NET_DVR_DEV_ADDRESS_MAX_LEN = 129
NET_DVR_LOGIN_USERNAME_MAX_LEN = 64
NET_DVR_LOGIN_PASSWD_MAX_LEN = 64
SERIALNO_LEN = 48

# Command Constants for Alarms
COMM_ALARM = 0x1100
COMM_ALARM_V30 = 0x4000
COMM_ALARM_V40 = 0x4007
COMM_ALARM_VCA = 0x4102  # General VCA
COMM_ALARM_RULE = 0x4110 # Rule Alarm
COMM_VCA_ALARM = 0x4990  # Advanced VCA
COMM_ISAPI_ALARM = 0x6009 # ISAPI Alarm (XML/JSON)

# Structures
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

class NET_DVR_SETUPALARM_PARAM(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("byLevel", ctypes.c_ubyte),
        ("byAlarmInfoType", ctypes.c_ubyte),
        ("byRetAlarmTypeV40", ctypes.c_ubyte),
        ("byRetVCAData", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte * 124)
    ]

# MSGCallBackV31(LONG lCommand, NET_DVR_ALARMER *pAlarmer, char *pAlarmInfo, DWORD dwBufLen, void* pUser)
fMessageCallBack = ctypes.WINFUNCTYPE(None, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p)

# Preview and Metadata structures
class NET_DVR_PREVIEWINFO(ctypes.Structure):
    _fields_ = [
        ("lChannel", ctypes.c_int32),
        ("dwStreamType", ctypes.c_uint32),
        ("dwLinkMode", ctypes.c_uint32),
        ("hPlayWnd", ctypes.c_void_p),
        ("bBlocked", ctypes.c_bool),
        ("bPassbackRecord", ctypes.c_bool),
        ("byPreviewMode", ctypes.c_ubyte),
        ("byProtoType", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 2),
        ("byVideoFormat", ctypes.c_ubyte),
        ("byDisplayMode", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 214)
    ]

# fStdDataCallBack(LONG lRealHandle, DWORD dwDataType, BYTE *pBuffer, DWORD dwBufSize, void* pUser)
StdDataCallback = ctypes.WINFUNCTYPE(None, ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_void_p)

# fRealDataCallBack(LONG lRealHandle, DWORD dwDataType, BYTE *pBuffer, DWORD dwBufSize, void* pUser)
RealDataCallback = ctypes.WINFUNCTYPE(None, ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_void_p)

class HCNetSDK:
    def __init__(self, sdk_path):
        self.sdk_path = sdk_path
        self.lib_path = os.path.join(sdk_path, "lib")
        
        # Set DLL search path for Windows
        if sys.platform == 'win32':
            os.add_dll_directory(self.lib_path)
            os.add_dll_directory(os.path.join(self.lib_path, "HCNetSDKCom"))

        # Load DLLs
        lib_file = os.path.join(self.lib_path, "HCNetSDK.dll")
        try:
            self.hcnetsdk = ctypes.WinDLL(lib_file)
            print(f"Loaded HCNetSDK from {lib_file}")
        except Exception as e:
            print(f"Failed to load SDK: {e}")
            raise

        self._setup_prototypes()

    def _setup_prototypes(self):
        self.hcnetsdk.NET_DVR_Init.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Init.argtypes = []

        self.hcnetsdk.NET_DVR_Cleanup.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Cleanup.argtypes = []

        self.hcnetsdk.NET_DVR_Login_V40.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_Login_V40.argtypes = [ctypes.POINTER(NET_DVR_USER_LOGIN_INFO), ctypes.POINTER(NET_DVR_DEVICEINFO_V40)]

        self.hcnetsdk.NET_DVR_Logout.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Logout.argtypes = [ctypes.c_long]

        self.hcnetsdk.NET_DVR_GetLastError.restype = ctypes.c_uint32
        self.hcnetsdk.NET_DVR_GetLastError.argtypes = []

        # Alarm Callbacks
        self.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V31.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V31.argtypes = [fMessageCallBack, ctypes.c_void_p]

        self.hcnetsdk.NET_DVR_SetupAlarmChan_V41.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_SetupAlarmChan_V41.argtypes = [ctypes.c_long, ctypes.POINTER(NET_DVR_SETUPALARM_PARAM)]

        self.hcnetsdk.NET_DVR_CloseAlarmChan_V30.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_CloseAlarmChan_V30.argtypes = [ctypes.c_long]

        # LONG NET_DVR_RealPlay_V40(LONG lUserID, LPNET_DVR_PREVIEWINFO lpPreviewInfo, fRealDataCallBack cbRealDataCallBack, LPVOID pUserData)
        self.hcnetsdk.NET_DVR_RealPlay_V40.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_RealPlay_V40.argtypes = [ctypes.c_long, ctypes.POINTER(NET_DVR_PREVIEWINFO), RealDataCallback, ctypes.c_void_p]

        # BOOL NET_DVR_SetStandardDataCallBack(LONG lRealHandle, fStdDataCallBack cbStdDataCallBack, void* pUser)
        self.hcnetsdk.NET_DVR_SetStandardDataCallBack.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetStandardDataCallBack.argtypes = [ctypes.c_long, StdDataCallback, ctypes.c_void_p]

        # BOOL NET_DVR_StopRealPlay(LONG lRealHandle)
        self.hcnetsdk.NET_DVR_StopRealPlay.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_StopRealPlay.argtypes = [ctypes.c_long]

        # BOOL NET_DVR_GetDeviceAbility(LONG lUserID, DWORD dwAbilityType, char *pInBuf, DWORD dwInBufLen, char *pOutBuf, DWORD dwOutBufLen)
        self.hcnetsdk.NET_DVR_GetDeviceAbility.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_GetDeviceAbility.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32]

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

        device_info = NET_DVR_DEVICEINFO_V40()
        user_id = self.hcnetsdk.NET_DVR_Login_V40(ctypes.byref(login_info), ctypes.byref(device_info))
        return user_id, device_info

    def logout(self, user_id):
        return self.hcnetsdk.NET_DVR_Logout(user_id)
