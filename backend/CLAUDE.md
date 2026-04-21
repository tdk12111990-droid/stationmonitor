# Backend — Luật cho Claude Code

## Project structure
- `StationMonitor.Api` — Controllers, Program.cs, Hubs
- `StationMonitor.Data` — EF Core entities, AppDbContext, Migrations
- `StationMonitor.Services` — Business logic, IRealtimeNotifier
- `StationMonitor.Workers` — Background workers (Polling/)

## Quy tắc code

### Packages — LUÔN chỉ định version 8.0.x
```bash
dotnet add package <tên> --version 8.0.11
```

### Tên bảng PostgreSQL — PascalCase có dấu nháy kép
```sql
FROM "SensorReadings"   -- ĐÚNG
FROM sensor_readings    -- SAI
```

### JSONB config parsing — dùng JsonElement helper
```csharp
if (val is JsonElement je) return je.GetString() ?? "";
```

### EF Core GroupBy → dùng raw SQL với DISTINCT ON
```sql
SELECT DISTINCT ON ("PointId") * FROM "SensorReadings" ORDER BY "PointId", "Time" DESC
```

### SignalR CORS — KHÔNG dùng AllowAnyOrigin với AllowCredentials
```csharp
policy.WithOrigins("http://localhost:5173").AllowAnyMethod().AllowAnyHeader().AllowCredentials();
```

### Background Workers — inject IServiceScopeFactory, KHÔNG inject DbContext trực tiếp
```csharp
using var scope = _scopeFactory.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
```

## API endpoints hiện có
- POST `/api/v1/auth/login` → JWT
- GET  `/api/v1/stations`
- GET/POST/PUT/DELETE `/api/v1/devices`
- GET/POST/PUT/DELETE `/api/v1/rules`
- GET `/api/v1/alerts`, POST `/api/v1/alerts/{id}/ack`, POST `/api/v1/alerts/{id}/close`
- GET `/api/v1/points` — sensor readings mới nhất
- GET/POST/PUT/DELETE `/api/v1/users` — admin only
- GET `/api/v1/logs/audit`, GET `/api/v1/logs/login`
- GET `/api/v1/settings`, PUT `/api/v1/settings/{key}` — admin-only PUT
- SignalR hub: `/ws/realtime`
- AuditMiddleware: tự ghi POST/PUT/DELETE vào AuditLogs (bỏ qua /auth/)
- Refresh token: lưu trong SystemSettings với key `refresh_token_{userId}`

## Docs
- `docs/KNOWN-ISSUES.md` — **đọc trước khi debug** (bug history & fixes)
- `docs/CHANGELOG.md` — nhật ký kỹ thuật theo ngày
- Kế hoạch phase → xem `../ROADMAP.md`
