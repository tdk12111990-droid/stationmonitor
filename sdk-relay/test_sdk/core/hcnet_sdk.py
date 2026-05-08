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

class NET_DVR_POINT(ctypes.Structure):
    _fields_ = [
        ("fX", ctypes.c_float),
        ("fY", ctypes.c_float)
    ]

class NET_DVR_TEMPERATURE_COLOR(ctypes.Structure):
    _fields_ = [
        ("byColorMode", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte * 3)
    ]

# Thermal Data Structures
class NET_DVR_THERMOMETRY_COND(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("dwChannel", ctypes.c_uint32), # Changed from dwChan
        ("wPresetNo", ctypes.c_uint16),
        ("byRes", ctypes.c_ubyte * 62)
    ]

# Precise structure from HCNetSDK.h (120 bytes)
class NET_DVR_THERMOMETRY_BASICPARAM(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("byEnabled", ctypes.c_ubyte),
        ("byStreamOverlay", ctypes.c_ubyte),
        ("byPictureOverlay", ctypes.c_ubyte),
        ("byThermometryRange", ctypes.c_ubyte),
        ("byThermometryUnit", ctypes.c_ubyte),
        ("byThermometryCurve", ctypes.c_ubyte),
        ("byFireImageModea", ctypes.c_ubyte),
        ("byShowTempStripEnable", ctypes.c_ubyte),
        ("fEmissivity", ctypes.c_float),
        ("byDistanceUnit", ctypes.c_ubyte),
        ("byEnviroHumidity", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 2),
        ("struTempColor", NET_DVR_TEMPERATURE_COLOR),
        ("iEnviroTemperature", ctypes.c_int),
        ("iCorrectionVolume", ctypes.c_int),
        ("bySpecialPointThermType", ctypes.c_ubyte),
        ("byReflectiveEnabled", ctypes.c_ubyte),
        ("wDistance", ctypes.c_uint16),
        ("fReflectiveTemperature", ctypes.c_float),
        ("fAlert", ctypes.c_float),
        ("fAlarm", ctypes.c_float),
        ("fThermalOpticalTransmittance", ctypes.c_float),
        ("fExternalOpticsWindowCorrection", ctypes.c_float),
        ("byDisplayMaxTemperatureEnabled", ctypes.c_ubyte),
        ("byDisplayMinTemperatureEnabled", ctypes.c_ubyte),
        ("byDisplayAverageTemperatureEnabled", ctypes.c_ubyte),
        ("byThermometryInfoDisplayposition", ctypes.c_ubyte),
        ("dwAlertFilteringTime", ctypes.c_uint32),
        ("dwAlarmFilteringTime", ctypes.c_uint32),
        ("byemissivityMode", ctypes.c_ubyte),
        ("bydisplayTemperatureInOpticalChannelEnabled", ctypes.c_ubyte),
        ("byDisplayCentreTemperatureEnabled", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte * 49)
    ]

class NET_DVR_THERMOMETRY_RULE(ctypes.Structure):
    _fields_ = [
        ("byRuleID", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 3),
        ("byRuleType", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 3),
        ("szRuleName", ctypes.c_char * 32),
        ("fMaxTemperature", ctypes.c_float),
        ("fMinTemperature", ctypes.c_float),
        ("fAverageTemperature", ctypes.c_float),
        ("fTemperatureDiff", ctypes.c_float),
        ("byAlarmLevel", ctypes.c_ubyte),
        ("byAlarmRule", ctypes.c_ubyte),
        ("byDisplayTemperature", ctypes.c_ubyte),
        ("byDisplayRuleName", ctypes.c_ubyte),
        ("struPoint", NET_DVR_POINT),
        ("byRes3", ctypes.c_ubyte * 52) # Adjusted padding
    ]

MAX_THERMOMETRY_RULE_NUM = 40

class NET_DVR_THERMOMETRY_ALLRULE(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("struRule", NET_DVR_THERMOMETRY_RULE * MAX_THERMOMETRY_RULE_NUM),
        ("byRes", ctypes.c_ubyte * 64)
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

class NET_DVR_THERMOMETRY_ALARMRULE_PARAM(ctypes.Structure):
    _fields_ = [
        ("byEnable", ctypes.c_ubyte),
        ("byRuleID", ctypes.c_ubyte),
        ("byRule", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte),
        ("szRuleName", ctypes.c_char * 32), # NAME_LEN is 32
        ("fAlert", ctypes.c_float),
        ("fAlarm", ctypes.c_float),
        ("fThreshold", ctypes.c_float),
        ("dwAlertFilteringTime", ctypes.c_uint32),
        ("dwAlarmFilteringTime", ctypes.c_uint32),
        ("byRes1", ctypes.c_ubyte * 56)
    ]

# THERMOMETRY_ALARMRULE_NUM is 40
class NET_DVR_THERMOMETRY_ALARMRULE(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("struThermometryAlarmRuleParam", NET_DVR_THERMOMETRY_ALARMRULE_PARAM * 40),
        ("byRes", ctypes.c_ubyte * 128)
    ]

class NET_DVR_STD_CONFIG(ctypes.Structure):
    _fields_ = [
        ("lpCondBuffer", ctypes.c_void_p),
        ("dwCondSize", ctypes.c_uint32),
        ("lpInBuffer", ctypes.c_void_p),
        ("dwInSize", ctypes.c_uint32),
        ("lpOutBuffer", ctypes.c_void_p),
        ("dwOutSize", ctypes.c_uint32),
        ("lpStatusBuffer", ctypes.c_void_p),
        ("dwStatusSize", ctypes.c_uint32),
        ("lpXmlBuffer", ctypes.c_void_p),
        ("dwXmlSize", ctypes.c_uint32),
        ("byDataType", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte * 23)
    ]

# ISAPI / XML Config Structures (64-bit version - EXACT MATCH WITH C# DEMO)
class NET_DVR_ALARMER(ctypes.Structure):
    _fields_ = [
        ("byUserIDValid", ctypes.c_ubyte),
        ("bySerialValid", ctypes.c_ubyte),
        ("byVersionValid", ctypes.c_ubyte),
        ("byDeviceNameValid", ctypes.c_ubyte),
        ("byMacAddrValid", ctypes.c_ubyte),
        ("byLinkPortValid", ctypes.c_ubyte),
        ("byDeviceIPValid", ctypes.c_ubyte),
        ("bySocketIPValid", ctypes.c_ubyte),
        ("lUserID", ctypes.c_long),
        ("sSerialNumber", ctypes.c_ubyte * SERIALNO_LEN),
        ("dwDeviceVersion", ctypes.c_uint32),
        ("sDeviceName", ctypes.c_char * 32),
        ("byMacAddr", ctypes.c_ubyte * 6),
        ("wLinkPort", ctypes.c_uint16),
        ("sDeviceIP", ctypes.c_char * 128),
        ("sSocketIP", ctypes.c_char * 128),
        ("byIpProtocol", ctypes.c_ubyte),
        ("byRes2", ctypes.c_ubyte * 11)
    ]

class NET_DVR_SETUPALARM_PARAM(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("byLevel", ctypes.c_ubyte),
        ("byAlarmInfoType", ctypes.c_ubyte),
        ("byRetAlarmTypeV40", ctypes.c_ubyte),
        ("byRetDevInfoVersion", ctypes.c_ubyte),
        ("byRetVQDAlarmType", ctypes.c_ubyte),
        ("byFaceAlarmDetection", ctypes.c_ubyte),
        ("bySupport", ctypes.c_ubyte),
        ("byBrokenNetHttp", ctypes.c_ubyte),
        ("wTaskNo", ctypes.c_uint16),
        ("byDeployType", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte * 3),
        ("byAlarmTypeURL", ctypes.c_ubyte),
        ("byCustomCtrl", ctypes.c_ubyte)
    ]

class NET_DVR_THERMOMETRY_ALARM(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("dwChannel", ctypes.c_uint32),
        ("byRuleID", ctypes.c_ubyte),
        ("byThermometryUnit", ctypes.c_ubyte),
        ("wPresetNo", ctypes.c_uint16),
        ("struPtzInfo", ctypes.c_ubyte * 20),
        ("byAlarmLevel", ctypes.c_ubyte),
        ("byAlarmType", ctypes.c_ubyte),
        ("byAlarmRule", ctypes.c_ubyte),
        ("byRuleCalibType", ctypes.c_ubyte),
        ("struPoint", NET_DVR_POINT),
        ("struRegion", ctypes.c_ubyte * 132),
        ("fRuleTemperature", ctypes.c_float),
        ("fCurrTemperature", ctypes.c_float),
        ("dwPicLen", ctypes.c_uint32),
        ("dwThermalPicLen", ctypes.c_uint32),
        ("dwThermalInfoLen", ctypes.c_uint32),
        ("pPicBuff", ctypes.c_void_p),
        ("pThermalPicBuff", ctypes.c_void_p),
        ("pThermalInfoBuff", ctypes.c_void_p),
        ("struHighestPoint", NET_DVR_POINT),
        ("fToleranceTemperature", ctypes.c_float),
        ("dwAlertFilteringTime", ctypes.c_uint32),
        ("dwAlarmFilteringTime", ctypes.c_uint32),
        ("dwTemperatureSuddenChangeCycle", ctypes.c_uint32),
        ("fTemperatureSuddenChangeValue", ctypes.c_float),
        ("byPicTransType", ctypes.c_ubyte),
        ("byRes1", ctypes.c_ubyte),
        ("dwVisibleChannel", ctypes.c_uint32),
        ("dwRelativeTime", ctypes.c_uint32),
        ("dwAbsTime", ctypes.c_uint32),
        ("fAlarmRuleTemperature", ctypes.c_float),
        ("byRes", ctypes.c_ubyte * 60)
    ]

if sys.platform == 'win32':
    MSGCALLBACK = ctypes.WINFUNCTYPE(None, ctypes.c_long, ctypes.POINTER(NET_DVR_ALARMER), ctypes.POINTER(ctypes.c_char), ctypes.c_uint32, ctypes.c_void_p)
else:
    MSGCALLBACK = ctypes.CFUNCTYPE(None, ctypes.c_long, ctypes.POINTER(NET_DVR_ALARMER), ctypes.POINTER(ctypes.c_char), ctypes.c_uint32, ctypes.c_void_p)

class NET_DVR_XML_CONFIG_INPUT(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("byResPadding1", ctypes.c_ubyte * 4), # Alignment padding
        ("lpRequestUrl", ctypes.c_void_p),
        ("dwRequestUrlLen", ctypes.c_uint32),
        ("byResPadding2", ctypes.c_ubyte * 4), # Alignment padding
        ("lpInBuffer", ctypes.c_void_p),
        ("dwInBufferSize", ctypes.c_uint32),
        ("dwRecvTimeOut", ctypes.c_uint32),
        ("byRes", ctypes.c_ubyte * 32)
    ]

class NET_DVR_XML_CONFIG_OUTPUT(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("byResPadding1", ctypes.c_ubyte * 4), # Alignment padding
        ("lpOutBuffer", ctypes.c_void_p),
        ("dwOutBufferSize", ctypes.c_uint32),
        ("dwReturnedXMLSize", ctypes.c_uint32),
        ("lpStatusBuffer", ctypes.c_void_p),
        ("dwStatusSize", ctypes.c_uint32),
        ("byResPadding2", ctypes.c_ubyte * 4), # Alignment padding
        ("byRes", ctypes.c_ubyte * 32)
    ]

# Preview Structures
class NET_DVR_PREVIEWINFO(ctypes.Structure):
    _fields_ = [
        ("lChannel", ctypes.c_long),
        ("dwStreamType", ctypes.c_uint32),
        ("dwLinkMode", ctypes.c_uint32),
        ("hPlayWnd", ctypes.c_void_p),
        ("bBlocked", ctypes.c_bool),
        ("bPassbackRecord", ctypes.c_bool),
        ("byPreviewMode", ctypes.c_ubyte),
        ("byStreamID", ctypes.c_ubyte * 32),
        ("byProtoType", ctypes.c_ubyte),
        ("byRes", ctypes.c_ubyte * 223)
    ]

if sys.platform == 'win32':
    REALDATACALLBACK = ctypes.WINFUNCTYPE(None, ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_void_p)
    RemoteConfigCallback = ctypes.WINFUNCTYPE(None, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p)
else:
    REALDATACALLBACK = ctypes.CFUNCTYPE(None, ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_void_p)
    RemoteConfigCallback = ctypes.CFUNCTYPE(None, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p)

class HCNetSDK:
    def __init__(self, sdk_path=None):
        if sdk_path is None:
            # Tự động tìm đường dẫn SDK tương đối với file này
            sdk_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            
        self.sdk_path = sdk_path
        
        # Xác định thư mục chứa thư viện dựa trên OS
        if sys.platform == 'win32':
            self.lib_path = os.path.join(sdk_path, "lib", "windows")
            os.add_dll_directory(self.lib_path)
            if os.path.exists(os.path.join(self.lib_path, "HCNetSDKCom")):
                os.add_dll_directory(os.path.join(self.lib_path, "HCNetSDKCom"))

            lib_file = os.path.join(self.lib_path, "HCNetSDK.dll")
            try:
                self.hcnetsdk = ctypes.WinDLL(lib_file)
                print(f"Successfully loaded HCNetSDK.dll (Windows) from {lib_file}")
            except Exception as e:
                print(f"Failed to load HCNetSDK.dll: {e}")
                raise
        else:
            # Linux / Jetson
            self.lib_path = os.path.join(sdk_path, "lib", "linux")
            lib_file = os.path.join(self.lib_path, "libhcnetsdk.so")
            
            # Trên Linux cần set LD_LIBRARY_PATH hoặc nạp phụ thuộc thủ công nếu cần
            # Ở đây ta nạp trực tiếp bằng CDLL
            try:
                self.hcnetsdk = ctypes.CDLL(lib_file)
                print(f"Successfully loaded libhcnetsdk.so (Linux) from {lib_file}")
            except Exception as e:
                print(f"Failed to load libhcnetsdk.so: {e}. Ensure SDK is in {self.lib_path}")
                # Đừng raise lỗi ngay để có thể debug trên môi trường không có camera
                self.hcnetsdk = None

        if self.hcnetsdk:
            self._setup_prototypes()

    def _setup_prototypes(self):
        if not self.hcnetsdk: return
        # BOOL NET_DVR_Init()
        self.hcnetsdk.NET_DVR_Init.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_Init.argtypes = []

        # BOOL NET_DVR_SetConnectTime(DWORD dwWaitTime, DWORD dwTryTimes)
        self.hcnetsdk.NET_DVR_SetConnectTime.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetConnectTime.argtypes = [ctypes.c_uint32, ctypes.c_uint32]

        # BOOL NET_DVR_SetReconnect(DWORD dwInterval, BOOL bEnableRecon)
        self.hcnetsdk.NET_DVR_SetReconnect.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetReconnect.argtypes = [ctypes.c_uint32, ctypes.c_bool]

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

        # BOOL NET_DVR_SetDVRMessageCallBack_V50(int iIndex, fMSGCallBack fMessageCallBack, void* pUser)
        self.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V50.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetDVRMessageCallBack_V50.argtypes = [ctypes.c_int, MSGCALLBACK, ctypes.c_void_p]

        # LONG NET_DVR_SetupAlarmChan_V41(LONG lUserID, LPNET_DVR_SETUPALARM_PARAM lpSetupParam)
        self.hcnetsdk.NET_DVR_SetupAlarmChan_V41.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_SetupAlarmChan_V41.argtypes = [ctypes.c_long, ctypes.POINTER(NET_DVR_SETUPALARM_PARAM)]

        # PlayCtrl Prototypes

        # BOOL NET_DVR_StopRemoteConfig(LONG lHandle)
        self.hcnetsdk.NET_DVR_StopRemoteConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_StopRemoteConfig.argtypes = [ctypes.c_long]

        # BOOL NET_DVR_GetDeviceConfig(LONG lUserID, DWORD dwCommand, DWORD dwCount, LPVOID lpInBuf, DWORD dwInBufSize, LPVOID lpOutStatusList, LPVOID lpOutBuf, DWORD dwOutBufSize)
        self.hcnetsdk.NET_DVR_GetDeviceConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_GetDeviceConfig.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32]

        # BOOL NET_DVR_SetDeviceConfig(LONG lUserID, DWORD dwCommand, DWORD dwCount, LPVOID lpInBuf, DWORD dwInBufSize, LPVOID lpOutStatusList, LPVOID lpOutBuf, DWORD dwOutBufSize)
        self.hcnetsdk.NET_DVR_SetDeviceConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetDeviceConfig.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32]

        self.hcnetsdk.NET_DVR_GetSTDConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_GetSTDConfig.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(NET_DVR_STD_CONFIG)]

        self.hcnetsdk.NET_DVR_SetSTDConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_SetSTDConfig.argtypes = [ctypes.c_long, ctypes.c_uint32, ctypes.POINTER(NET_DVR_STD_CONFIG)]

        self.hcnetsdk.NET_DVR_STDXMLConfig.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_STDXMLConfig.argtypes = [ctypes.c_long, ctypes.POINTER(NET_DVR_XML_CONFIG_INPUT), ctypes.POINTER(NET_DVR_XML_CONFIG_OUTPUT)]

        # LONG NET_DVR_RealPlay_V40(LONG lUserID, LPNET_DVR_PREVIEWINFO lpPreviewInfo, fRealDataCallBack cbRealDataCallBack, LPVOID pUserData)
        self.hcnetsdk.NET_DVR_RealPlay_V40.restype = ctypes.c_long
        self.hcnetsdk.NET_DVR_RealPlay_V40.argtypes = [ctypes.c_long, ctypes.POINTER(NET_DVR_PREVIEWINFO), REALDATACALLBACK, ctypes.c_void_p]

        # BOOL NET_DVR_StopRealPlay(LONG lRealHandle)
        self.hcnetsdk.NET_DVR_StopRealPlay.restype = ctypes.c_bool
        self.hcnetsdk.NET_DVR_StopRealPlay.argtypes = [ctypes.c_long]

        # PlayCtrl Prototypes
        if sys.platform == 'win32':
            try:
                self.playctrl = ctypes.WinDLL(os.path.join(self.lib_path, "PlayCtrl.dll"))
                self._setup_playctrl_prototypes()
            except Exception as e:
                print(f"Warning: PlayCtrl.dll not loaded: {e}")
        else:
            try:
                self.playctrl = ctypes.CDLL(os.path.join(self.lib_path, "libPlayCtrl.so"))
                self._setup_playctrl_prototypes()
            except Exception as e:
                print(f"Warning: libPlayCtrl.so not loaded: {e}")

        # DWORD NET_DVR_GetLastError()
        self.hcnetsdk.NET_DVR_GetLastError.restype = ctypes.c_uint32
        self.hcnetsdk.NET_DVR_GetLastError.argtypes = []

    def _setup_playctrl_prototypes(self):
        # BOOL PlayM4_GetPort(LONG* nPort)
        self.playctrl.PlayM4_GetPort.restype = ctypes.c_bool
        self.playctrl.PlayM4_GetPort.argtypes = [ctypes.POINTER(ctypes.c_long)]

        # BOOL PlayM4_SetStreamOpenMode(LONG nPort, DWORD nMode)
        self.playctrl.PlayM4_SetStreamOpenMode.restype = ctypes.c_bool
        self.playctrl.PlayM4_SetStreamOpenMode.argtypes = [ctypes.c_long, ctypes.c_uint32]

        # BOOL PlayM4_OpenStream(LONG nPort, PBYTE pFileHeadBuf, DWORD nSize, DWORD nBufPoolSize)
        self.playctrl.PlayM4_OpenStream.restype = ctypes.c_bool
        self.playctrl.PlayM4_OpenStream.argtypes = [ctypes.c_long, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32, ctypes.c_uint32]

        # BOOL PlayM4_Play(LONG nPort, HWND hWnd)
        self.playctrl.PlayM4_Play.restype = ctypes.c_bool
        self.playctrl.PlayM4_Play.argtypes = [ctypes.c_long, ctypes.c_void_p]

        # BOOL PlayM4_InputData(LONG nPort, PBYTE pBuf, DWORD nSize)
        self.playctrl.PlayM4_InputData.restype = ctypes.c_bool
        self.playctrl.PlayM4_InputData.argtypes = [ctypes.c_long, ctypes.POINTER(ctypes.c_ubyte), ctypes.c_uint32]

        # Decode Callback
        # void (CALLBACK *fDecCB)(long nPort, char * pBuf, long nSize, FRAME_INFO * pFrameInfo, long nReserved1, long nReserved2)
        if sys.platform == 'win32':
            self.DECCALLBACK = ctypes.WINFUNCTYPE(None, ctypes.c_long, ctypes.POINTER(ctypes.c_char), ctypes.c_long, ctypes.c_void_p, ctypes.c_long, ctypes.c_long)
        else:
            self.DECCALLBACK = ctypes.CFUNCTYPE(None, ctypes.c_long, ctypes.POINTER(ctypes.c_char), ctypes.c_long, ctypes.c_void_p, ctypes.c_long, ctypes.c_long)
        
        try:
            self.playctrl.PlayM4_SetDecCallBack.restype = ctypes.c_bool
            self.playctrl.PlayM4_SetDecCallBack.argtypes = [ctypes.c_long, self.DECCALLBACK]
        except:
            print("Warning: PlayM4_SetDecCallBack not found in PlayCtrl.dll")

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
