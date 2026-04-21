# Fix Điểm không hiển thị trên Realtime — Diagnostic

> Điểm nhiệt đã có trong code nhưng không render lên canvas. Tìm ra nguyên nhân & fix.

---

## Root Cause Analysis

Chain hoàn chỉnh từ relay → backend → frontend:

```
sdk-relay/enhanced_relay.py
  ├─ Load points_local.json (10 điểm P1-P10 với tx, ty, ox, oy) ✅ File có
  ├─ Gửi POST /api/v1/measurements/ingest với tx, ty, ox, oy ← ?
  │
Backend
  ├─ MeasurementsController.IngestMeasurements() ✅ Có endpoint
  ├─ Broadcast SignalR "SensorUpdate" với tx, ty, ox, oy ✅ Code có line 255-265
  │
Frontend
  ├─ RealtimeMonitorPage listen 'SensorUpdate' ✅ Line 796
  ├─ Cache coordinates _coordCache ✅ Line 800
  ├─ Call drawPoints(readings) ✅ Line 803
  ├─ drawPoints() vẽ points trên canvas ✅ Line 868-976
  │   ├─ Nếu x == null → return (skip điểm) ← ❌ TẠI ĐÂY
  │
Canvas
  └─ Hiển thị điểm ← KHÔNG hiển thị (x, y null)
```

**Issue:** `enhanced_relay.py` có thể **KHÔNG CHẠY** hoặc **KHÔNG GỬI** data.

---

## Kiểm tra từng bước

### 1️⃣ Kiểm tra relay có chạy không

```bash
# Terminal 1: Check relay process
Get-Process python -ErrorAction SilentlyContinue | Select-Object -Property ProcessName, CPU, Memory

# Hoặc check port 5056 (backend) có nhận request từ relay không
# Trên backend terminal, xem có log message:
# "[Ingest] Received X points for Device ..." không?
```

Nếu **KHÔNG thấy message → Relay chưa chạy hoặc bị error.**

### 2️⃣ Chạy relay thủ công để debug

```bash
# Terminal mới
cd D:\StationMonitor\sdk-relay
python enhanced_relay.py
# Xem có error message nào không
```

Nếu bị error → fix error đó trước.

### 3️⃣ Kiểm tra file points_local.json

```bash
# Xem file có được load không
cat D:\StationMonitor\sdk-relay\points_local.json | head -10
```

Nếu file trống → điền lại 10 điểm (file đã có sẵn).

### 4️⃣ Kiểm tra SignalR message

Backend console nên show:
```
[Ingest] Received 10 points for Device <uuid>
```

Nếu **không thấy → relay chưa gửi.**

### 5️⃣ Kiểm tra frontend nhận được không

Mở **DevTools (F12) → Console:**

```javascript
// Paste vào console:
window._debugSensorUpdate = [];
// (rồi check RealtimeMonitorPage.ts line 796 để thêm log)
```

Rồi mở `/realtime` page, xem console có log data không.

---

## Quick Fix — Chạy full stack đúng thứ tự

```bash
# Terminal 1: Database
docker start stationmonitor-db

# Terminal 2: Backend
cd D:\StationMonitor\backend\StationMonitor.Api
dotnet run

# Terminal 3: go2rtc
cd D:\StationMonitor\media-server
go2rtc.exe -config go2rtc.yaml

# Terminal 4: SDK Relay ← QUAN TRỌNG!
cd D:\StationMonitor\sdk-relay
python enhanced_relay.py
# Xem terminal backend có message "[Ingest] Received..." không?

# Terminal 5: Frontend
cd D:\StationMonitor\frontend
npm run dev

# Browser
# http://localhost:5173 → /realtime
# Xem điểm hiển thị không?
```

---

## Nếu vẫn không hiển thị — Debug chi tiết

### Bước 1: Thêm log vào RealtimeMonitorPage.ts

```typescript
// Line 803: sau this.drawPoints(readings)
console.log('[SensorUpdate] Received readings:', readings);
console.log('[SensorUpdate] _coordCache:', this._coordCache);
```

Rồi F12 → Console → xem log message.

### Bước 2: Thêm log vào drawPoints()

```typescript
// Line 868: đầu hàm
private drawPoints(readings: any[]): void {
  console.log('[drawPoints] Called with', readings.length, 'readings');
  const camGroups: Record<string, any[]> = {};
  readings.forEach(r => {
    const did = r.deviceId as string;
    if (!camGroups[did]) camGroups[did] = [];
    camGroups[did].push(r);
  });
  console.log('[drawPoints] camGroups:', camGroups);
  
  for (const [camId, points] of Object.entries(camGroups)) {
    const canvas = document.getElementById(`nvr-canvas-${camId}`) as HTMLCanvasElement;
    console.log(`[drawPoints] Canvas ${camId}:`, canvas ? 'FOUND' : 'NOT FOUND');
```

### Bước 3: Check canvas coordinate calculation

```typescript
// Line 911-914: kiểm tra tọa độ
points.forEach(p => {
  const x = isThermal ? p.tx : p.ox;
  const y = isThermal ? p.ty : p.oy;
  console.log(`[drawPoints] Point ${p.pointId}: tx=${p.tx}, ty=${p.ty}, x=${x}, y=${y}`);
  if (x == null || y == null) {
    console.warn(`[drawPoints] SKIP ${p.pointId} because x/y null`);
    return;
  }
  // ... vẽ điểm
});
```

---

## Lý do thường gặp

| Triệu chứng | Nguyên nhân | Fix |
|-------------|-----------|-----|
| Điểm không hiển thị, console không log | Relay không chạy | `python enhanced_relay.py` |
| Log hiện → "x/y null" | Tọa độ không được gửi từ relay | Check `points_local.json` có đầy đủ 10 điểm không |
| SignalR message không tới | Kết nối relay → backend lỗi | Check IP/port trong relay `.env` |
| Canvas không tìm thấy | go2rtc stream chưa load | Chờ 2-3s hay refresh page |
| Điểm lệch vị trí | Letterbox offset sai | Gọi drawPoints sau `loadedmetadata` |

---

## Kết luận

✅ **Code complete** — relay, backend, frontend all có logic vẽ điểm.
❌ **Runtime issue** — relay **không chạy** hoặc **không gửi data**.

**Action:** 
1. Chạy `python enhanced_relay.py` 
2. Xem backend console có message `[Ingest] Received` không
3. Nếu không → debug relay error
4. Nếu có → check frontend console xem data đến không

*Thường là relay quên chạy!*
