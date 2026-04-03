# StationMonitor Backend

ASP.NET Core 8 backend cho hệ thống giám sát trạm biến áp.

## Yêu cầu

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Cài đặt

### 1. Chạy database (TimescaleDB)

```bash
docker run -d --name stationmonitor-db \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_DB=stationmonitor \
  -p 5432:5432 \
  -v D:/docker-data/stationmonitor-db:/var/lib/postgresql/data \
  timescale/timescaledb:latest-pg16
```

### 2. Clone và restore packages

```bash
git clone https://github.com/tdk12111990-droid/stationmonitor-backend.git
cd stationmonitor-backend
dotnet restore
```

### 3. Chạy backend

```bash
dotnet run --project StationMonitor.Api
```

API chạy tại: `http://localhost:5056`

## Tài khoản mặc định

Tự động tạo khi khởi động lần đầu:

| Username | Password   | Role  |
|----------|------------|-------|
| admin    | Admin@123  | admin |

## API Endpoints (Phase 1)

```
POST /api/v1/auth/login    — Đăng nhập → JWT token
POST /api/v1/auth/refresh  — Refresh token
GET  /api/v1/auth/me       — Thông tin user hiện tại (cần JWT)
```

## Cấu trúc project

```
StationMonitor.Api/        — REST API + Controllers
StationMonitor.Data/       — EF Core, 20 entities, migrations
StationMonitor.Services/   — Business logic (Auth, ...)
StationMonitor.Workers/    — Background workers (polling, sync, ...)
StationMonitor.Analytics/  — Early warning, health score
```

## Database

TimescaleDB (PostgreSQL 16) với 20 bảng:
- `sensor_readings` — hypertable time-series
- `alerts`, `alert_history` — vòng đời cảnh báo
- `detection_events`, `media_files` — AI camera
- `audit_log`, `login_log` — traceability
- ... (xem `StationMonitor.Data/Entities/`)
