# Notification Test System

Standalone listener for testing fire/smoke/acoustic/thermal notifications from cameras before integrating into the main relay.

## Setup

```bash
cd sdk-relay/notifications
pip install requests  # if not already installed
```

## Configuration

Edit `config.json`:
- Camera credentials (IP, user, password)
- Event type thresholds (thermal temp, decibel level)
- Alert output folder

## Run

```bash
python main.py
```

**Output:**
- Console logs of all events (even below threshold)
- Alert JSON files in `alerts/` folder
- Optional snapshot images from camera ISAPI

## Alert Format

Each alert is saved as JSON:
```
alerts/20260421_143022_cam152_fireAlarm.json
alerts/20260421_143022_cam152_fireAlarm.jpg (optional)
```

Alert JSON structure:
```json
{
  "id": "20260421_143022_cam152_fireAlarm",
  "timestamp_iso": "2026-04-21T14:30:22",
  "camera": { "id": "cam152", "ip": "192.168.10.152" },
  "source": "isapi_alertstream",
  "event": {
    "type": "fireAlarm",
    "thermal": {
      "max_c": 95.3,
      "current_c": 95.3,
      "threshold_c": 80.0,
      "hottest_point": { "x": 512, "y": 384 }
    },
    "fire": { "detected": true }
  },
  "image_file": "20260421_143022_cam152_fireAlarm.jpg"
}
```

## Features

- **ISAPI AlertStream** — HTTP-based event streaming from cameras
- **Threshold checking** — configurable temperature/decibel limits
- **Cooldown** — prevents alert spam
- **Snapshot capture** — saves camera image at time of event
- **Structured JSON** — easy to parse and integrate

## Camera 152 (Thermal + Optical)

Listens for:
- `temperatureAlarm` — thermal over-temp
- `fireAlarm`, `fireDetection` — fire detected
- `smokeAlarm`, `smokeDetection` — smoke detected
- `lineDetection`, `fieldDetection` — VCA events
- `intrusion`, `regionEntrance`, `regionExiting` — motion alerts

Extracts:
- Max/min/avg temperature
- Rule threshold temperature
- Hottest point coordinates
- VCA region coordinates

## Camera 153 (Acoustic + Fire)

Listens for:
- `audioException` — abnormal sound
- `fireDetection`, `smokeDetection` — fire/smoke
- `dischargeDetection` — electrical discharge (phóng điện)

Extracts:
- Decibel level (wDecibel)
- Temperature (if thermal component)
- Event location coordinates

## Next Steps

1. Test by running `python main.py`
2. Trigger events on cameras (thermal source, abnormal sound, etc.)
3. Check alert files in `alerts/` folder
4. Once working, integrate camera listeners into `enhanced_relay.py`

## SDK Phase (Future)

Current implementation uses ISAPI HTTP streaming. Can be extended to use SDK alarm push callbacks:
- Set `sdk_alarm_enable: true` in config.json
- Wires up NET_DVR_SetDVRMessageCallBack_V50 + NET_DVR_SetupAlarmChan_V41
- Handles 0x5212 (THERMOMETRY_ALARM), 0x4991 (fire), 0x4993 (VCA), 0x6009 (ISAPI JSON)
