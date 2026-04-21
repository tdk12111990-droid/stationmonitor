# Module: Authentication & Authorization

> JWT + refresh token, role-based access, audit log.

---

## Thành phần

| File | Vai trò |
|------|---------|
| `StationMonitor.Api/Controllers/AuthController.cs` | Login, refresh, logout |
| `StationMonitor.Api/Controllers/UsersController.cs` | CRUD user (admin only) |
| `StationMonitor.Services/Auth/JwtService.cs` | Tạo/verify token |
| `StationMonitor.Api/Middleware/AuditMiddleware.cs` | Ghi POST/PUT/DELETE vào `AuditLogs` |
| `frontend/src/services/StationApiService.ts` | Axios interceptor attach Bearer |

## Flow

```
POST /api/v1/auth/login {username, password}
  → Validate bcrypt
  → Generate access token (8h) + refresh token (30d)
  → Refresh stored in SystemSettings key `refresh_token_{userId}`
  → Return {accessToken, refreshToken, user}

POST /api/v1/auth/refresh {refreshToken}
  → Verify against stored
  → Issue new access token
  → Rotate refresh token (old invalidated)

POST /api/v1/auth/logout
  → Delete refresh_token_{userId}
  → Frontend clears localStorage
```

## Roles

| Role | Permissions |
|------|-------------|
| `admin` | Tất cả — user mgmt, settings, rules, devices |
| `operator` | CRUD rules/devices, ack/close alerts |
| `viewer` | Read-only (dashboard, history) |

Backend: `[Authorize(Roles = "admin")]` decorator.
Frontend: `user.role` → ẩn/hiện nav items.

## Audit Log

`AuditMiddleware` tự động ghi mọi `POST/PUT/DELETE` (trừ `/auth/*`):
```json
{
  "userId": "uuid",
  "action": "POST /api/v1/rules",
  "payload": "{...}",
  "ip": "192.168.1.50",
  "timestamp": "2026-04-18T10:00:00Z"
}
```

Query: `GET /api/v1/logs/audit?userId=...&from=...&to=...`

Login log riêng: `GET /api/v1/logs/login` (cả thành công + fail).

## JWT config

`appsettings.json`:
```json
"Jwt": {
  "Key": "CHANGE-ME-64-CHAR-SECRET",
  "Issuer": "StationMonitor",
  "Audience": "StationMonitor.Clients",
  "ExpiryMinutes": 480
}
```

## Password policy

- Bcrypt work factor 12
- Min 8 chars, 1 số, 1 ký tự đặc biệt (check frontend + backend)
- Không hiển thị password trong API response

## Default account

```
username: admin
password: Admin@123
```

→ **ĐỔI NGAY sau cài đặt prod.** Seed tại `Migrations/InitialData.cs`.

## Đã xong

- [x] Login/logout/refresh
- [x] JWT với RS256
- [x] 3 roles
- [x] Audit log middleware
- [x] Login log (success + fail)
- [x] Password change
- [x] User CRUD (admin)

## Còn lại / Tương lai

- [ ] 2FA (TOTP qua app Authenticator)
- [ ] SSO (Azure AD, Google Workspace)
- [ ] Password reset qua email
- [ ] Rate limit login (5 fail / 15 min → lock)
- [ ] Session management page: xem/revoke refresh token đang active
- [ ] IP whitelist cho admin

## Known issues

- Refresh token rotation race condition khi 2 tab cùng refresh → fix bằng lock per-user
- JWT key hardcode trong `appsettings.json` dev → prod phải dùng ENV var hoặc Azure KeyVault

## Test

```bash
# Login
curl -X POST http://localhost:5056/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'

# Protected endpoint
TOKEN=$(echo "$RESPONSE" | jq -r .accessToken)
curl http://localhost:5056/api/v1/users -H "Authorization: Bearer $TOKEN"
```
