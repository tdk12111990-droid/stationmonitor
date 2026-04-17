import ctypes
import threading
import time
from core.hcnet_sdk import HCNetSDK, NET_DVR_THERMOMETRY_COND, NET_DVR_THERMOMETRY_UPLOAD, RemoteConfigCallback

# Constants from SDK
NET_DVR_GET_REALTIME_THERMOMETRY = 3629

class CameraService:
    def __init__(self, sdk_path):
        self.sdk = HCNetSDK(sdk_path)
        self.is_initialized = False
        self.active_connections = {}
        self._lock = threading.Lock()
        
        # Keep a reference to the callback to avoid garbage collection
        self._thermal_callback_ptr = RemoteConfigCallback(self._thermal_callback_handler)

    def initialize(self):
        with self._lock:
            if not self.is_initialized:
                if self.sdk.init():
                    self.is_initialized = True
                    return True
                return False
            return True

    def connect(self, device_id, ip, port, user, password):
        if not self.is_initialized:
            if not self.initialize():
                return False

        user_id, device_info = self.sdk.login(ip, port, user, password)
        if user_id >= 0:
            with self._lock:
                self.active_connections[device_id] = {
                    "user_id": user_id,
                    "ip": ip,
                    "info": device_info,
                    "thermal_handles": []
                }
            return True
        return False

    def start_thermal_monitoring(self, device_id, channel=2, callback=None):
        with self._lock:
            if device_id not in self.active_connections:
                return False
            
            conn = self.active_connections[device_id]
            user_id = conn["user_id"]

        cond = NET_DVR_THERMOMETRY_COND()
        cond.dwSize = ctypes.sizeof(NET_DVR_THERMOMETRY_COND)
        cond.dwChannel = channel
        cond.wMode = 1 # Real-time

        # Store user data (device_id and original callback)
        # In a real system, we might pass a pointer to a context object
        
        handle = self.sdk.hcnetsdk.NET_DVR_StartRemoteConfig(
            user_id,
            NET_DVR_GET_REALTIME_THERMOMETRY,
            ctypes.byref(cond),
            ctypes.sizeof(cond),
            self._thermal_callback_ptr,
            None # Context
        )

        if handle >= 0:
            with self._lock:
                conn["thermal_handles"].append({
                    "handle": handle,
                    "callback": callback
                })
            return True
        return False

    def _thermal_callback_handler(self, dwType, lpBuffer, dwBufLen, pUserData):
        if dwType == 2:  # NET_SDK_CALLBACK_TYPE_DATA
            if lpBuffer and dwBufLen >= ctypes.sizeof(NET_DVR_THERMOMETRY_UPLOAD):
                data = NET_DVR_THERMOMETRY_UPLOAD.from_buffer_copy(
                    ctypes.string_at(lpBuffer, dwBufLen)
                )
                
                # We need a way to link this back to the device_id
                # For now, we'll broadcast to all registered callbacks in this service instance
                # or find a better way to use pUserData
                
                thermal_info = {
                    "rule_name": data.szRuleName.decode('utf-8', errors='ignore').strip('\x00'),
                    "rule_id": data.byRuleID,
                    "max_temp": round(data.fMaxTemperature, 1),
                    "min_temp": round(data.fMinTemperature, 1),
                    "avg_temp": round(data.fAverageTemperature, 1),
                    "timestamp": time.time()
                }

                # Trigger callbacks
                with self._lock:
                    for conn in self.active_connections.values():
                        for h in conn["thermal_handles"]:
                            if h["callback"]:
                                try:
                                    h["callback"](thermal_info)
                                except Exception as e:
                                    print(f"Error in thermal callback: {e}")

    def cleanup(self):
        with self._lock:
            for device_id, conn in list(self.active_connections.items()):
                for h in conn["thermal_handles"]:
                    self.sdk.hcnetsdk.NET_DVR_StopRemoteConfig(h["handle"])
                self.sdk.logout(conn["user_id"])
            
            if self.is_initialized:
                self.sdk.cleanup()
                self.is_initialized = False
            self.active_connections = {}
