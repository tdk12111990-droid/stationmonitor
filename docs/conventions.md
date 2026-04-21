# Coding Conventions — StationMonitor

> Quy tắc bắt buộc cho toàn bộ codebase. Đọc trước khi viết code mới.

---

## Backend (.NET 8)

### Package versions — LUÔN 8.0.x
```bash
dotnet add package <name> --version 8.0.11
```
Không dùng preview hoặc `*`. Không để PackageReference không có version.

### Tên bảng PostgreSQL — PascalCase + nháy kép
```sql
FROM "SensorReadings"   -- ĐÚNG
FROM sensor_readings    -- SAI (Npgsql sẽ lowercase hóa không tìm được bảng)
```

### EF Core GroupBy — dùng DISTINCT ON thay groupby
EF Core không translate `GroupBy + First()` thành SQL tốt. Dùng raw SQL:
```sql
SELECT DISTINCT ON ("PointId") *
FROM "SensorReadings"
ORDER BY "PointId", "Time" DESC
```

### JSONB config — dùng JsonElement helper, không dùng dynamic
```csharp
if (val is JsonElement je) return je.GetString() ?? "";
```

### Background Workers — KHÔNG inject DbContext trực tiếp
DbContext là scoped; Worker là singleton → inject `IServiceScopeFactory`:
```csharp
using var scope = _scopeFactory.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
```

### SignalR CORS — KHÔNG dùng AllowAnyOrigin + AllowCredentials cùng nhau
```csharp
// ĐÚNG
policy.WithOrigins("http://localhost:5173")
      .AllowAnyMethod().AllowAnyHeader().AllowCredentials();
// SAI — sẽ throw runtime exception
policy.AllowAnyOrigin().AllowCredentials();
```

### API response — không trả về entity trực tiếp
Dùng DTO hoặc anonymous object. Không expose `Password`, `Config` raw.

### Naming
- Controllers: `{Resource}Controller`
- Services: `I{Name}Service` / `{Name}Service`
- Workers: `{Name}Worker` (inherit `BackgroundService`)
- DTOs: `{Resource}Dto`, `Create{Resource}Request`, `Update{Resource}Request`

---

## Frontend (TypeScript + Vite)

### Pattern chuẩn cho mọi page
```ts
class MyPage {
  render(): string { return `<div>...</div>`; }
  mount(): void    { /* attach events */ }
  destroy(): void  { /* cleanup listeners, timers */ }
}
```

### API calls — LUÔN qua StationApiService
```ts
import { stationApi } from '@/services/StationApiService';
// KHÔNG import từ ScadaApiService cho feature mới
```

### URL — KHÔNG hardcode
```ts
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5056/api/v1';
// KHÔNG: const url = 'http://localhost:5056/...'
```

### Modal — toggle class, không dùng display style
```ts
modal.classList.add('active');    // show
modal.classList.remove('active'); // hide
```

### Rule evaluation — KHÔNG gọi từ frontend
Backend tự đánh giá rules mỗi 5s. Không gọi `evaluateRules()` từ client.

### TypeScript check — bắt buộc sau mỗi thay đổi
```bash
npx tsc --noEmit
```
Không commit khi còn TS error.

---

## Python (sdk-relay)

### Paths — KHÔNG dùng relative path cứng
```python
# ĐÚNG
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR    = os.path.dirname(CURRENT_DIR)
SDK_DIR     = os.path.join(CURRENT_DIR, "test_sdk")

# SAI
SDK_DIR = "C:\\Users\\DELL\\project\\..."
```

### Config — env vars > hardcode
```python
API_URL = os.getenv("API_URL", "http://localhost:5056/api/v1")
```

### Retry — exponential backoff, không vòng lặp cứng
```python
for attempt in range(5):
    try:
        response = requests.post(url, json=data, timeout=5)
        break
    except Exception:
        time.sleep(2 ** attempt)
```

---

## Git

- Commit message: `feat:`, `fix:`, `refactor:`, `docs:` prefix
- Không commit `*.dll`, `*.exe`, `node_modules/`, `*.pyc`, `.env`
- 1 PR = 1 tính năng hoặc 1 fix; không gộp nhiều feature không liên quan

---

## Database (TimescaleDB)

### Migration — đặt tên có nghĩa
```bash
dotnet ef migrations add AddEarlyWarningTable --project StationMonitor.Data --startup-project StationMonitor.Api
```
Không đặt tên `Migration1`, `Fix`, `Test`.

### Không dùng `SELECT *` trong production query
Luôn select column cụ thể để tránh N+1 khi schema thay đổi.

### Index bắt buộc cho bảng lớn
`SensorReadings`: index trên `(PointId, Time DESC)` — đã có.
Bảng mới có query time-range → phải thêm index tương tự.

---

## File organization

```
backend/
  StationMonitor.Api/
    Controllers/   # 1 controller = 1 resource
    Middleware/    # Ghi log, auth filter
    Hubs/          # SignalR hubs
  StationMonitor.Data/
    Entities/      # 1 file = 1 entity
    Migrations/    # Auto-generated, không sửa tay
  StationMonitor.Services/
    Auth/          # JwtService, PasswordService
    Camera/        # ThermalEvidence, Go2RtcService
    Protocol/      # Driver per protocol
  StationMonitor.Workers/
    Polling/       # PlcPolling, RuleEvaluation, EarlyWarning
    Quality/       # HealthScore

frontend/src/
  pages/           # 1 class = 1 page
  services/        # API, SignalR clients
  components/      # Shared UI pieces

docs/
  modules/         # 1 file = 1 module (tech spec)
  system.md        # Architecture overview
  setup.md         # Installation guide
  conventions.md   # Quy tắc (file này)
```
