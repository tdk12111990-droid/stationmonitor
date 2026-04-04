# StationMonitor — Hướng dẫn cho Claude Code

> **ĐỌC TRƯỚC:** `MASTER_PLAN.md` — chứa toàn bộ kế hoạch, bugs đã fix, API list, ngữ cảnh quan trọng.

## Stack & Ports
- Backend: ASP.NET Core 8, chạy tại `http://localhost:5056`
- Frontend: Vanilla TypeScript + Vite, chạy tại `http://localhost:5173`
- Database: TimescaleDB (PostgreSQL) tại `localhost:5432`, DB `stationmonitor`
- go2rtc: RTSP→WebRTC stream tại `http://localhost:1984`
- PLC: Siemens S7-1200 tại `192.168.10.100`
- Camera 152: `192.168.10.152` (admin/Demo@2024)
- Camera 153: `192.168.10.153` (tladmin/Ab@12345) — phóng điện

## Khởi động / Dừng
```bash
start.bat   # Khởi động backend + frontend + go2rtc
stop.bat    # Dừng tất cả
```

## Test
```bash
node test-api.mjs                          # 35 API tests (Phase 1-4)
cd frontend && npx playwright test         # E2E UI tests (Playwright)
cd frontend && npx tsc --noEmit            # TypeScript check
cd backend && dotnet build StationMonitor.sln
```

## Quy tắc bắt buộc
- Đọc `backend/CLAUDE.md` trước khi sửa bất kỳ file nào trong `backend/`
- Đọc `frontend/CLAUDE.md` trước khi sửa bất kỳ file nào trong `frontend/`
- Sau khi thêm backend API mới → chạy `node test-api.mjs` để verify
- Sau khi sửa frontend → chạy `npx tsc --noEmit` để check type
- KHÔNG tắt backend đang chạy khi đang build (DLL bị lock)
- Tài khoản mặc định: `admin / Admin@123`
