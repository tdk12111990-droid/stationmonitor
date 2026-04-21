"""
Cấu hình Camera 153 để đẩy dữ liệu âm thanh ra SDK:
  1. Bật audioexception + Notify Surveillance Center
  2. Arming Schedule 24/7
  3. Cấu hình HTTP Alarm Server → backend 5056

Chạy: python config_153.py
"""
import requests, json
from requests.auth import HTTPDigestAuth

CAMERA_IP  = "192.168.10.153"
BACKEND_IP = "192.168.1.100"    # IP máy tính trên mạng local
BACKEND_PORT = 5056
auth = HTTPDigestAuth("admin", "Demo@2024")
BASE = f"http://{CAMERA_IP}"
HDR  = {"Content-Type": "application/xml"}


def get(ep):
    r = requests.get(BASE + ep, auth=auth, timeout=6)
    print(f"GET {ep} → {r.status_code}")
    return r

def put(ep, body):
    r = requests.put(BASE + ep, auth=auth, data=body.encode(), headers=HDR, timeout=6)
    ok = "✅" if r.status_code in (200, 201, 204) else "❌"
    print(f"{ok} PUT {ep} → {r.status_code}  {r.text[:120].strip()}")
    return r


# ── 1. Đọc cấu hình audioexception hiện tại ──────────────────
print("\n" + "="*60)
print("  1. Cấu hình audioexception trigger")
print("="*60)

# Thử đọc trigger cụ thể
r = get("/ISAPI/Event/triggers/audioexception-1")
if r.status_code == 403:
    print("  Dùng tladmin thử...")
    r = requests.get(BASE + "/ISAPI/Event/triggers/audioexception-1",
                     auth=HTTPDigestAuth("tladmin","Ab@12345"), timeout=6)
    print(f"  tladmin → {r.status_code}")

# Bật audioexception + thêm center notification + arming schedule 24/7
AUDIO_TRIGGER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>audioexception-1</id>
<eventType>audioexception</eventType>
<eventDescription>audioexception Event trigger Information</eventDescription>
<videoInputChannelID>1</videoInputChannelID>
<dynVideoInputChannelID>1</dynVideoInputChannelID>
<EventTriggerNotificationList>
  <EventTriggerNotification>
    <id>center</id>
    <notificationMethod>center</notificationMethod>
    <notificationRecurrence>beginning</notificationRecurrence>
  </EventTriggerNotification>
  <EventTriggerNotification>
    <id>record-1</id>
    <notificationMethod>record</notificationMethod>
    <notificationRecurrence>beginning</notificationRecurrence>
  </EventTriggerNotification>
</EventTriggerNotificationList>
</EventTrigger>"""

put("/ISAPI/Event/triggers/audioexception-1", AUDIO_TRIGGER_XML)

# ── 2. Arming Schedule 24/7 cho audioexception ────────────────
print("\n" + "="*60)
print("  2. Arming Schedule 24/7")
print("="*60)

SCHEDULE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TimeBlockList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
""" + "".join(f"""  <TimeBlock>
    <dayOfWeek>{d}</dayOfWeek>
    <TimeRange><beginTime>00:00:00</beginTime><endTime>23:59:59</endTime></TimeRange>
  </TimeBlock>
""" for d in range(1, 8)) + "</TimeBlockList>"

put("/ISAPI/Event/triggers/audioexception-1/armingSchedule", SCHEDULE_XML)

# ── 3. Cấu hình HTTP Alarm Server → backend ──────────────────
print("\n" + "="*60)
print("  3. HTTP Alarm Server → backend:5056")
print("="*60)

# Đọc cấu hình httpHosts hiện tại
get("/ISAPI/Event/notification/httpHosts")

ALARM_SERVER_XML = f"""<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotification version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>1</id>
<url>/api/v1/camera-webhook</url>
<protocolType>HTTP</protocolType>
<parameterFormatType>XML</parameterFormatType>
<addressingFormatType>ipaddress</addressingFormatType>
<ipAddress>{BACKEND_IP}</ipAddress>
<portNo>{BACKEND_PORT}</portNo>
<userName></userName>
<httpAuthenticationMethod>none</httpAuthenticationMethod>
</HttpHostNotification>"""

put("/ISAPI/Event/notification/httpHosts/1", ALARM_SERVER_XML)

# ── 4. Kiểm tra lại cấu hình ─────────────────────────────────
print("\n" + "="*60)
print("  4. Kiểm tra sau khi cấu hình")
print("="*60)
get("/ISAPI/Event/triggers/audioexception-1")
get("/ISAPI/Event/notification/httpHosts/1")

print("\n" + "="*60)
print("  ✅ Hoàn tất — khởi động lại test_pd_153.py")
print("="*60)
