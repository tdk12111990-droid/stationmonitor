# StationMonitor — Backend

ASP.NET Core 8 · TimescaleDB · SignalR · Background Workers

> Quick start xem tại root `README.md`. File này dành cho backend developer.

---

## Cấu trúc solution

```
StationMonitor.Api/        REST API (Controllers, Hubs, Middleware, Program.cs)
StationMonitor.Data/       EF Core (20+ entities, Migrations, AppDbContext)
StationMonitor.Services/   Business logic (Auth, Camera, Email, Supabase)
StationMonitor.Workers/    Background workers
  └── Polling/             PlcPollingWorker, RuleEvaluationWorker, EarlyWarningWorker
  └── Quality/             HealthScoreWorker
StationMonitor.Tests/      Unit tests (xUnit)
StationMonitor.Analytics/  Analytics queries
StationMonitor.Simulators/ Protocol simulators (Modbus, IEC-104, MQTT)
```

---

## Chạy backend

```bash
cd backend/StationMonitor.Api
dotnet run
# API: http://localhost:5056
```

## Build & Test

```bash
cd backend
dotnet build StationMonitor.sln
dotnet test
```

---

## Database

TimescaleDB trong Docker:

```bash
docker run -d --name stationmonitor-db \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_DB=stationmonitor \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg16
```

Migration:
```bash
cd backend
dotnet ef database update --project StationMonitor.Data --startup-project StationMonitor.Api
```

---

## Config quan trọng (`appsettings.json`)

```json
"ConnectionStrings": { "Default": "Host=localhost;Port=5432;Database=stationmonitor;..." }
"Jwt":     { "Key": "...", "ExpiryMinutes": 480 }
"Go2Rtc":  { "ApiUrl": "http://localhost:1984" }
"Media":   { "FFmpegPath": "d:\\StationMonitor\\media-server\\ffmpeg.exe" }
"Smtp":    { "Host": "smtp.gmail.com", "Port": "587" }
```

---

## Tài liệu

- `docs/KNOWN-ISSUES.md` — Bug đã gặp và cách fix (**đọc trước khi debug**)
- `docs/CHANGELOG.md` — Nhật ký kỹ thuật theo ngày
- `CLAUDE.md` — Rules cho Claude Code khi sửa backend
