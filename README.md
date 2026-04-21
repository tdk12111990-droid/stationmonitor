# StationMonitor

Hệ thống giám sát trạm biến áp 110kV thông minh — thu thập dữ liệu PLC, camera nhiệt, phóng điện; cảnh báo realtime; dashboard web.

---

## Quick Start

**Yêu cầu:** .NET 8, Node.js 18+, Python 3.11+, Docker Desktop, TimescaleDB

```bash
# 1. Cài môi trường (chạy 1 lần, quyền Administrator)
scripts\setup-env.bat

# 2. Khởi động toàn hệ thống
start.bat

# Truy cập: http://localhost:5173
# Tài khoản: admin / Admin@123
```

---

## Cấu trúc dự án

```
StationMonitor/
│
├── start.bat / stop.bat        Khởi động / dừng toàn hệ thống
│
├── backend/                    ASP.NET Core 8 — REST API + SignalR + Workers
│   ├── StationMonitor.Api/     Controllers, Hubs, Program.cs
│   ├── StationMonitor.Data/    EF Core entities, Migrations
│   ├── StationMonitor.Services/ Business logic, Camera, Auth
│   ├── StationMonitor.Workers/ Background workers (PLC, Rules, Health)
│   ├── StationMonitor.Tests/   Unit tests (.NET)
│   └── docs/
│       ├── KNOWN-ISSUES.md     Bug history & fixes
│       └── CHANGELOG.md        Nhật ký phát triển theo ngày
│
├── frontend/                   Vite + TypeScript — Web dashboard
│   ├── src/pages/              13 trang UI
│   ├── e2e/                    Playwright E2E tests
│   └── docs/
│       └── sld-editor-spec.md  Spec trang SLD diagram editor
│
├── sdk-relay/                  Python — Hikvision SDK relay (chạy trên server)
│   ├── enhanced_relay.py       Đọc dữ liệu nhiệt từ camera 152, push vào backend
│   ├── hikvision/              SDK wrapper (HCNetSDK)
│   └── test_sdk/               Hikvision SDK DLLs (vendor, gitignored)
│
├── media-server/               go2rtc + ffmpeg + mediamtx binaries
│   └── go2rtc.yaml             Config streams camera 152/153
│
├── tests/api/                  Node.js API integration tests
│   ├── test-api.mjs            35 tests Phase 1–4
│   └── test-protocol.mjs       Protocol tests (Modbus, BACnet...)
│
├── scripts/                    Script vận hành
│   ├── setup-env.bat           Cài đặt môi trường (chạy 1 lần)
│   ├── run-tests.bat           Health check tổng thể
│   └── cloudflare-tunnel.bat   Expose ra internet qua Cloudflare
│
├── jetson/                     Placeholder — AI model (Phase AI-1/2/3)
├── app-mobile/                 React Native — Mobile app
│
├── docs/
│   ├── system.md               Kiến trúc hệ thống & luồng dữ liệu
│   └── archive/                Tài liệu cũ lưu trữ
│
├── ROADMAP.md                  Kế hoạch phase — nguồn sự thật duy nhất
└── CLAUDE.md                   Hướng dẫn cho Claude Code
```

---

## Services & Ports

| Service | Port | Mô tả |
|---------|------|--------|
| Frontend (Vite) | 5173 | Web dashboard |
| Backend API | 5056 | REST API + SignalR Hub |
| go2rtc | 1984 | WebRTC camera streams |
| go2rtc RTSP | 8554 | RTSP push từ sdk-relay |
| TimescaleDB | 5432 | PostgreSQL + TimescaleDB |

---

## Chạy từng phần thủ công

```bash
# Backend
cd backend/StationMonitor.Api && dotnet run

# Frontend
cd frontend && npm run dev

# go2rtc
cd media-server && go2rtc.exe -config go2rtc.yaml

# SDK Relay (camera nhiệt)
cd sdk-relay && python enhanced_relay.py
```

---

## Cameras

| Camera | IP | Creds | Vai trò |
|--------|----|-------|---------|
| 152 | 192.168.10.152 | admin / Demo@2024 | Nhiệt + Quang học |
| 153 | 192.168.10.153 | tladmin / Ab@12345 | Phóng điện |

---

## Tests

```bash
node tests/api/test-api.mjs            # API integration (cần backend chạy)
node tests/api/test-protocol.mjs       # Protocol tests
cd frontend && npx tsc --noEmit        # TypeScript check
cd frontend && npx playwright test     # E2E UI tests
cd backend && dotnet test              # .NET unit tests
scripts\run-tests.bat                  # Health check tổng thể
```

---

## Tài liệu

| File | Nội dung |
|------|---------|
| `ROADMAP.md` | Kế hoạch phase, sprint hiện tại, next steps |
| `docs/system.md` | Kiến trúc, luồng dữ liệu, cấu hình |
| `backend/docs/KNOWN-ISSUES.md` | Bug đã gặp và cách fix — đọc trước khi debug |
| `backend/docs/CHANGELOG.md` | Nhật ký kỹ thuật theo ngày |
| `frontend/docs/sld-editor-spec.md` | Spec SLD diagram editor |
