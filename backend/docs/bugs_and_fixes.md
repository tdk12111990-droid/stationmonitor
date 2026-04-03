# Lỗi đã gặp và cách sửa — StationMonitor Backend

> Đọc file này trước khi debug để tránh lặp lại lỗi cũ.

---

## 1. NuGet package không tương thích .NET 8

**Triệu chứng:**
```
error NU1202: Package Npgsql.EntityFrameworkCore.PostgreSQL 10.0.1 is not compatible with net8.0
```

**Nguyên nhân:** NuGet tự lấy version mới nhất (10.x) yêu cầu .NET 10.

**Cách sửa:** Luôn chỉ định version khi cài package .NET 8:
```bash
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.11
dotnet add package Microsoft.EntityFrameworkCore.Tools --version 8.0.11
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
```

**Quy tắc:** Với dự án .NET 8, tất cả EF Core và ASP.NET packages phải dùng version `8.0.x`.

---

## 2. Port đã bị chiếm (address already in use)

**Triệu chứng:**
```
System.IO.IOException: Failed to bind to address http://127.0.0.1:5055: address already in use.
```

**Nguyên nhân:** Process dotnet cũ chưa tắt đang giữ port.

**Cách sửa:**
```bash
# Tìm PID đang dùng port
netstat -ano | findstr :5055

# Kill process theo PID
taskkill /F /PID <pid>
```
Hoặc đổi port trong `Properties/launchSettings.json`.

**Phòng tránh:** Luôn Ctrl+C đúng cách khi dừng server, không đóng terminal đột ngột.

---

## 3. bin/ obj/ bị commit vào git

**Triệu chứng:** Commit đầu tiên có 260 files bao gồm cả DLL, PDB.

**Nguyên nhân:** Tạo `.gitignore` sau khi đã `git add .`.

**Cách sửa:**
```bash
# Xóa khỏi git tracking (giữ file local)
git rm -r --cached StationMonitor.Api/bin StationMonitor.Api/obj
git rm -r --cached StationMonitor.Data/bin StationMonitor.Data/obj
# ... lặp cho các project khác
git commit -m "chore: remove bin/obj from tracking"
```

**Phòng tránh:** Luôn chạy `dotnet new gitignore` TRƯỚC khi `git add .`.

---

## 4. Frontend bị chặn bởi Content Security Policy

**Triệu chứng:**
```
Content-Security-Policy: blocked connect-src at http://localhost:5056/api/v1/auth/login
```

**Nguyên nhân:** `index.html` có CSP header không có port backend trong whitelist.

**Cách sửa:** Thêm port vào `connect-src` trong `index.html`:
```html
connect-src 'self' https: http://localhost:5056 http://localhost:5173 ...
```

**Phòng tránh:** Mỗi khi đổi port backend, nhớ cập nhật CSP trong `index.html`.

---

## 5. Login 401 dù password đúng

**Triệu chứng:** Frontend gọi API trả 401, Postman thì login được bình thường.

**Nguyên nhân:** localStorage còn cache session cũ từ mock data (password `admin123`), frontend gửi password cũ.

**Cách sửa:** Mở DevTools → Application → Local Storage → xóa các key `station_*`.

**Phòng tránh:** Khi đổi auth system, bump schema version hoặc xóa localStorage cũ trong code.

---

## 6. Docker daemon không chạy

**Triệu chứng:**
```
failed to connect to the docker API at npipe:////./pipe/docker_engine
```

**Nguyên nhân:** Docker Desktop chưa được mở hoặc engine chưa start xong.

**Cách sửa:** Mở Docker Desktop, chờ icon taskbar chuyển xanh "Engine running", rồi chạy lại lệnh.

---

## 7. Firefox không kết nối localhost (giữ nguyên phần này)

**Triệu chứng:** Firefox báo "can't connect to localhost:5056" nhưng Postman và Chrome thì được.

**Nguyên nhân:** Firefox có vấn đề với IPv6 loopback trên Windows.

**Cách sửa:** Dùng Chrome hoặc Edge để test. Hoặc vào `about:config` → `network.dns.disableIPv6` → `true`.

---

## 8. Circular dependency: Workers → Api → Workers

**Triệu chứng:** `PlcPollingWorker` cần push SignalR nhưng `RealtimeHub` nằm trong `Api` project → vòng tròn dependency.

**Cách sửa:** Tạo interface `IRealtimeNotifier` trong `Services` layer. `Workers` phụ thuộc vào interface, `Api` implement bằng `SignalRNotifier`.

---

## 9. Plc.DBReadAsync không tồn tại (S7.Net Plus)

**Triệu chứng:**
```
error CS1061: 'Plc' does not contain a definition for 'DBReadAsync'
```

**Nguyên nhân:** S7.Net Plus API khác với expected. Method đúng là `ReadAsync`.

**Cách sửa:**
```csharp
// SAI:
var rawData = await plc.DBReadAsync(dbNumber, offset, length);
// ĐÚNG:
var rawData = await plc.ReadAsync(S7.Net.DataType.DataBlock, dbNumber, offset, S7.Net.VarType.Byte, length, 0, ct);
```

---

## 10. InvalidCastException khi parse config JSONB từ DB

**Triệu chứng:**
```
System.InvalidCastException: Unable to cast object of type 'JsonElement' to type 'IConvertible'
```

**Nguyên nhân:** `JsonSerializer.Deserialize<Dictionary<string, object>>` trả về `JsonElement`, không phải primitive. `Convert.ToInt16(JsonElement)` bị lỗi.

**Cách sửa:** Tạo helper `GetString()` và `GetInt()` kiểm tra type trước khi convert:
```csharp
private static int GetInt(Dictionary<string, object> config, string key)
{
    if (!config.TryGetValue(key, out var val)) return 0;
    if (val is JsonElement je) return je.GetInt32();
    return Convert.ToInt32(val);
}
```

---

## 11. EF Core GroupBy + First() không dịch được sang SQL

**Triệu chứng:**
```
System.InvalidOperationException: The LINQ expression could not be translated.
```

**Nguyên nhân:** EF Core 8 không dịch được `.GroupBy().Select(g => g.OrderByDescending().First())`.

**Cách sửa:** Dùng raw SQL với `DISTINCT ON` của PostgreSQL:
```sql
SELECT DISTINCT ON ("DeviceId", "PointId")
  "DeviceId", "PointId", "Value", "Unit", "Quality", "Time"
FROM "SensorReadings"
ORDER BY "DeviceId", "PointId", "Time" DESC
```

---

## 12. Raw SQL dùng tên bảng lowercase thay vì PascalCase

**Triệu chứng:**
```
Npgsql.PostgresException: 42P01: relation "sensor_readings" does not exist
```

**Nguyên nhân:** EF Core với Npgsql tạo bảng tên `"SensorReadings"` (có quote, case-sensitive). Raw SQL cần dùng đúng tên.

**Cách sửa:** Luôn dùng tên có dấu nháy kép trong raw SQL: `FROM "SensorReadings"`.

---

## 13. SignalR CORS lỗi với AllowAnyOrigin + Credentials

**Triệu chứng:**
```
Reason: Credential is not supported if the CORS header 'Access-Control-Allow-Origin' is '*'
```

**Nguyên nhân:** SignalR cần credentials (JWT), nhưng `AllowAnyOrigin()` không tương thích với `AllowCredentials()`.

**Cách sửa:** Dùng origin cụ thể:
```csharp
policy.WithOrigins("http://localhost:5173")
      .AllowAnyMethod().AllowAnyHeader().AllowCredentials();
```

---

## 14. Frontend nhận Config camera là JSON string thay vì object

**Triệu chứng:** `go2rtc_id` là `undefined`, camera không load stream.

**Nguyên nhân:** Backend trả `Config` là JSON string (`"{\"ip\":\"...\"}`), frontend expect object.

**Cách sửa:** Parse trong `StationApiService.ts`:
```typescript
config: typeof d.config === 'string' ? JSON.parse(d.config) : d.config
```

---

## 15. Camera phóng điện màn đen — go2rtc.yaml hardcode channel sai

**Triệu chứng:** Camera 192.168.10.153 hiển thị màn hình đen hoàn toàn trên frontend.

**Nguyên nhân:** `go2rtc.yaml` hardcode stream `hikvision_sub` trỏ vào `/Streaming/Channels/102` là channel **audio-only** (PCML/32000). go2rtc nhận được audio nhưng không có video track → iframe stream.html render màn đen.

**Cách xác minh:**
```bash
curl http://localhost:1984/api/streams
# hikvision_sub → medias: ["audio, recvonly, PCML/32000"]  ← không có video!
```

**Cách sửa:**
- Đổi sang `/Streaming/Channels/101` (main stream = video + audio)
- Xóa hardcode trong `go2rtc.yaml`, để backend tự sync từ DB

**Quy tắc Hikvision channel:**
| Channel | Nội dung |
|---------|----------|
| `101`   | Main stream — H264 video + audio |
| `102`   | Sub stream — audio only (hoặc low-res) |
| `201`   | Thermal channel (camera nhiệt) |

---

## 16. Camera phóng điện màn đen — credentials sai trong DB

**Triệu chứng:** go2rtc không thêm được stream `camera_153_pd` dù PUT API trả 200, stream không xuất hiện trong danh sách.

**Nguyên nhân:** DB config camera 192.168.10.153 dùng `username: "admin"`, `password: "Demo@2024"` nhưng camera thực tế yêu cầu `username: "tladmin"`, `password: "Ab@12345"`. go2rtc kết nối thất bại và silently drop stream khỏi danh sách.

**Cách xác minh:**
```bash
# Stream hikvision_sub đang chạy với credentials nào?
curl http://localhost:1984/api/streams | python -c "import sys,json; d=json.load(sys.stdin); print(d['hikvision_sub']['producers'][0]['url'])"
# → rtsp://tladmin:Ab%4012345@192.168.10.153:554/...  ← credentials thực tế
```

**Cách sửa:** Cập nhật DB config qua API:
```bash
curl -X PUT http://localhost:5056/api/v1/devices/{id} \
  -d '{"config": "{\"ip\":\"192.168.10.153\",\"username\":\"tladmin\",\"password\":\"Ab@12345\",\"rtsp_path\":\"/Streaming/Channels/101\",\"go2rtc_id\":\"camera_153_pd\"}"}'
```

**Bài học:** Khi thêm camera vào DB, luôn kiểm tra credentials bằng cách xem stream đang chạy trong go2rtc trước.

---

## 17. Camera 153 từ chối reconnect sau khi disconnect đột ngột

**Triệu chứng:** Sau khi xóa stream `hikvision_sub` khỏi go2rtc, mọi attempt thêm lại stream cho 192.168.10.153 đều bị go2rtc silently drop (kể cả channel 102 đã hoạt động trước đó).

**Nguyên nhân:** Camera Hikvision có giới hạn kết nối RTSP đồng thời. Khi connection cũ bị ngắt đột ngột (qua DELETE API), camera chưa release slot kết nối ngay, dẫn đến từ chối kết nối mới trong vài phút.

**Cách xác minh:**
```bash
# go2rtc trả 200 OK nhưng stream 153 không xuất hiện
curl -X PUT http://localhost:1984/api/streams -d '{"test_153": "rtsp://tladmin:Ab%4012345@192.168.10.153:554/Channels/101"}'
# Response chỉ còn 2 streams (.152), không có test_153
```

**Cách sửa:** Cập nhật `go2rtc.yaml` rồi **restart go2rtc** để tạo fresh connection:
```yaml
streams:
  camera_153_pd: rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101
```

**Phòng tránh:** Không xóa stream camera đang active qua DELETE API trong giờ vận hành. Nếu cần đổi config, dùng PUT thay vì DELETE+ADD.

---

## 18. DevicesController không re-register go2rtc khi update camera

**Triệu chứng:** Update config camera qua API (đổi IP, credentials, rtsp_path) nhưng go2rtc vẫn giữ stream cũ.

**Nguyên nhân:** Method `Update()` trong `DevicesController.cs` thiếu call `RegisterCameraStreamAsync` sau khi save DB.

**Cách sửa:** Thêm vào `Update()`:
```csharp
device.Name = req.Name ?? device.Name;
device.Config = req.Config ?? device.Config;
device.Status = req.Status ?? device.Status;
await _db.SaveChangesAsync();

// Re-register với go2rtc nếu là camera
if (device.Type.StartsWith("camera"))
    await _deviceService.RegisterCameraStreamAsync(device);
```

---

## 19. DashboardPage gọi Ngrok cũ gây NetworkError

**Triệu chứng:** Console lỗi `[ScadaMap] Fetch failed — TypeError: NetworkError` liên tục. Dashboard không load dữ liệu sensor.

**Nguyên nhân:** `DashboardPage.ts` import `scadaApi` và `API_BASE_URL` từ `ScadaApiService.ts` — file này hardcode URL Ngrok cũ (`polygonal-marleen-electrothermally.ngrok-free.dev`) đã hết hạn.

**Cách sửa:**
1. Bỏ `import { scadaApi, API_BASE_URL }` trong `DashboardPage.ts`
2. Thay `fetchAndUpdate()` gọi scadaApi bằng local virtualPoints từ localStorage
3. Cập nhật `ScadaApiService.ts` đổi `API_BASE_URL` sang `http://localhost:5056`

**Bài học:** Ngrok URL thay đổi mỗi lần restart → không hardcode trong code. Dùng env variable hoặc config file.

---

## 20. go2rtc.yaml hardcode stream sai gây xung đột với DB

**Triệu chứng:** Backend sync camera từ DB lên go2rtc, nhưng stream cũ trong yaml vẫn tồn tại song song gây confusing (2 stream cho cùng 1 camera với tên khác nhau).

**Nguyên nhân:** `go2rtc.yaml` có hardcoded streams, backend dùng `go2rtc_id` từ DB để đặt tên stream → tên không khớp nhau.

**Cách sửa:** `go2rtc.yaml` chỉ chứa streams làm fallback khi backend chưa chạy, đặt tên nhất quán với `go2rtc_id` trong DB:
```yaml
streams:
  camera_152_normal:  rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/101
  camera_152_thermal: rtsp://admin:Demo%402024@192.168.10.152:554/Streaming/Channels/201
  camera_153_pd:      rtsp://tladmin:Ab%4012345@192.168.10.153:554/Streaming/Channels/101
```

**Quy tắc:** `go2rtc_id` trong DB phải trùng với key trong `go2rtc.yaml` và là gì frontend dùng để embed iframe (`stream.html?src=<go2rtc_id>`).
