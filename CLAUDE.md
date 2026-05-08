# StationMonitor — Hướng dẫn cho Claude Code

## Đọc theo thứ tự

| Muốn biết gì | Đọc file nào |
|-------------|-------------|
| **NGAY BÂY GIỜ** — Làm gì tiếp theo | `NEXT-STEPS.md` |
| Đã làm đến đâu, phase tiếp theo | `ROADMAP.md` |
| Đáp ứng yêu cầu hồ sơ | `REQUIREMENTS.md` |
| Tiến độ từng module (1 chỗ thấy hết) | `PROGRESS.md` |
| Sprint hiện tại, bugs đang track | `SPRINT.md` |
| Kiến trúc tổng thể, luồng dữ liệu | `docs/system.md` |
| File structure chi tiết từng module | `docs/MODULES-STRUCTURE.md` |
| Đánh giá sức khỏe & chất lượng module | `docs/MODULES-HEALTH.md` |
| Quy tắc code (bắt buộc) | `docs/conventions.md` |
| Cài đặt từ đầu | `docs/setup.md` |
| Spec từng module | `docs/modules/<module>.md` |
| Sửa backend | Đọc `backend/CLAUDE.md` TRƯỚC |
| Sửa frontend | Đọc `frontend/CLAUDE.md` TRƯỚC |
| Nhật ký phát triển từng ngày (clean version) | `docs/CHANGELOG.md` |
| Nhật ký CHI TIẾT: research, fail, redo, debug | `docs/CHANGELOG-DETAILED.md` |
| Bug đã gặp & cách fix | `backend/docs/KNOWN-ISSUES.md` |

## Stack & Ports

| Service | URL | Ghi chú |
|---------|-----|---------|
| Backend API | `http://localhost:5056` | ASP.NET Core 8 |
| Frontend | `http://localhost:5173` | Vite + TypeScript |
| TimescaleDB | `localhost:5432` DB `stationmonitor` | PostgreSQL |
| go2rtc | `http://localhost:1984` | RTSP→WebRTC |
| PLC S7-1200 | `192.168.10.100` | Siemens |
| Camera 152 | `192.168.10.152` admin/Demo@2024 | Thermal + optical |
| Camera 153 | `192.168.10.153` admin/Demo@2024 | Phóng điện |

## Khởi động / Dừng

```bash
start.bat   # Backend + Frontend + go2rtc + SDK relay
stop.bat    # Dừng tất cả
```

## Test nhanh

```bash
node tests/api/test-api.mjs        # 35 API tests (cần backend chạy)
node tests/api/test-protocol.mjs   # Protocol tests
cd frontend && npx tsc --noEmit    # TypeScript check (bắt buộc sau khi sửa)
cd frontend && npx playwright test # E2E UI
cd backend && dotnet test          # .NET unit tests
scripts/run-tests.bat              # Health check tổng thể
```

## Cấu trúc thư mục

```
StationMonitor/
├── ROADMAP.md          Kế hoạch phase (nguồn sự thật)
├── SPRINT.md           Sprint hiện tại
├── CLAUDE.md           File này
├── start.bat / stop.bat
│
├── backend/            ASP.NET Core 8
│   ├── StationMonitor.Api/      Controllers, Hubs, Program.cs
│   ├── StationMonitor.Data/     EF Core, Migrations
│   ├── StationMonitor.Services/ Business logic
│   ├── StationMonitor.Workers/  Background workers
│   └── docs/
│       ├── KNOWN-ISSUES.md      Bug history (đọc trước khi debug)
│       └── CHANGELOG.md         Nhật ký kỹ thuật
│
├── frontend/           Vite + TypeScript
│   ├── src/pages/      13 trang UI
│   ├── e2e/            Playwright tests
│   └── docs/sld-editor-spec.md
│
├── sdk-relay/          Python — Hikvision SDK relay (Windows)
│   └── enhanced_relay.py
│
├── media-server/       go2rtc + ffmpeg binaries
├── app-mobile/         React Native (Expo SDK 54)
├── jetson/             AI phase (placeholder)
├── tests/api/          Node.js API integration tests
├── scripts/            Vận hành (setup, cloudflare, health check)
│
└── docs/
    ├── system.md        Kiến trúc tổng thể
    ├── setup.md         Hướng dẫn cài đặt
    ├── conventions.md   Quy tắc code
    ├── modules/         Spec từng module
    │   ├── camera.md
    │   ├── alerts.md
    │   ├── analytics.md
    │   ├── protocols.md
    │   ├── mobile.md
    │   ├── jetson-ai.md
    │   └── auth.md
    └── archive/         Tài liệu cũ (không cần đọc thường xuyên)
```

## Quy tắc bắt buộc

- Đọc `backend/CLAUDE.md` TRƯỚC khi sửa bất kỳ file nào trong `backend/`
- Đọc `frontend/CLAUDE.md` TRƯỚC khi sửa bất kỳ file nào trong `frontend/`
- Sau khi thêm API mới → chạy `node tests/api/test-api.mjs`
- Sau khi sửa frontend → chạy `npx tsc --noEmit`
- KHÔNG tắt backend đang chạy khi build (DLL bị lock)
- Tài khoản mặc định: `admin / Admin@123`
