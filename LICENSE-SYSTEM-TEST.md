# License Key System — Quick Test Guide

**Date**: 2026-05-07  
**Status**: ✅ Implementation complete  
**Next**: Test & Deploy

---

## What's New

| Component | Change |
|---|---|
| **Login** | Requires 3 fields now: username + password + **license key** |
| **License Control** | Admin can create licenses with concurrent session limits |
| **Web Deployment** | Backend serves frontend (1 URL, no desktop app needed) |
| **Cloudflare** | Ready to expose via tunnel for remote access |

---

## 🧪 Test Locally (5 minutes)

### Prerequisites
- Backend running: `dotnet run` in `backend/StationMonitor.Api/`
- Frontend dev server: `npm run dev` in `frontend/` (OR build with script)

### Option A: Build Frontend (Recommended for Production Testing)

```bash
# 1. Build & deploy frontend to backend
bash scripts/build-web.sh

# 2. Restart backend (if still running)
# Press Ctrl+C, then: dotnet run

# 3. Open browser
open http://localhost:5056
```

### Option B: Keep Dev Servers Running

```bash
# Terminal 1: Backend
cd backend/StationMonitor.Api
dotnet run

# Terminal 2: Frontend dev
cd frontend
npm run dev
# Then edit .env.station: VITE_API_URL=http://localhost:5056

# Terminal 3: Browser
open http://localhost:5173
```

---

## 📝 Test Scenarios

### ✅ Test 1: Successful Login
```
Username:   admin
Password:   Admin@123
License Key: SM-DEMO-0000-FREE1
```
Expected: ✅ Dashboard loads

### ✅ Test 2: Wrong License Key
```
License Key: SM-INVALID-0000-0000
```
Expected: ❌ "License key không hợp lệ"

### ✅ Test 3: Concurrent Session Limit (License allows 1 user)
```
Tab 1: Login as admin → Success ✅
Tab 2: Login as admin again → Blocked ❌ "Đã đạt giới hạn (1/1)"
Tab 1: Click Logout (if available) or close browser
Tab 2: Refresh → Now can login ✅
```

### ✅ Test 4: Logout & Session Revocation
```
1. Login with admin/Admin@123/SM-DEMO-0000-FREE1
2. Look for Logout button (in Settings or top-right)
3. Click Logout → session revoked on backend
4. Try to use old tab → should get 401 Unauthorized
5. Login again with same key → new session created ✅
```

---

## 🔑 How to Create New License Keys

### Via API (for admin)
```bash
curl -X POST http://localhost:5056/api/v1/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{
    "key": "SM-2026-MYCUST-PRO5",
    "issuedTo": "My Customer",
    "maxConcurrentSessions": 5,
    "expiresAt": "2027-12-31T23:59:59Z"
  }'
```

### Via SQL (direct database)
```sql
INSERT INTO "LicenseKeys" 
  (Id, "Key", "IssuedTo", "MaxConcurrentSessions", "ExpiresAt", "IsActive", "CreatedAt")
VALUES 
  (gen_random_uuid(), 'SM-2026-TEST-TRIAL', 'Test Account', 1, NULL, true, now());
```

Then login with the new key.

---

## 🌍 Deploy to Remote (Cloudflare Tunnel)

After local testing ✅:

```bash
# 1. On Ubuntu server
docker-compose up -d

# 2. Install cloudflared
curl -L --output cloudflared.zip https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.zip
unzip cloudflared.zip
./cloudflared tunnel --url http://localhost:5056
```

Then share the URL with users → they see login form → enter username + password + license key

---

## 🐛 Troubleshooting

| Issue | Solution |
|---|---|
| Backend won't start | Check migrations applied: `dotnet ef database update` |
| Login form missing license key field | Frontend not rebuilt — run `bash scripts/build-web.sh` |
| License key always invalid | Check DB has seed license: `SELECT * FROM "LicenseKeys";` |
| "Address already in use" | Kill old process: `lsof -i :5056` + kill PID |
| Logout not working | Check `/api/v1/auth/logout` endpoint exists in AuthController |

---

## 📊 Database Check

```bash
# Connect to stationmonitor DB
psql -h localhost -U postgres -d stationmonitor

# Check license keys
SELECT "Key", "IssuedTo", "MaxConcurrentSessions", "IsActive" FROM "LicenseKeys";

# Check active sessions
SELECT us."Id", u."Username", s."LoginAt", s."LastSeenAt" 
FROM "ActiveSessions" s
JOIN "LicenseKeys" lk ON s."LicenseKeyId" = lk."Id"
JOIN "Users" u ON s."UserId" = u."Id"
WHERE s."IsRevoked" = false AND s."ExpiresAt" > now();
```

---

## ✅ Checklist Before Production

- [ ] Test login with license key locally
- [ ] Test concurrent session limit
- [ ] Test logout & session revocation
- [ ] Build frontend: `bash scripts/build-web.sh`
- [ ] Backend serves static files at http://localhost:5056
- [ ] Create production license keys via API
- [ ] Setup Cloudflare tunnel
- [ ] Test remote access from phone/laptop
- [ ] Update NEXT-STEPS.md with new flow

---

**Questions?** Check:
- `/home/admin-/Desktop/stationmonitor/plan/majestic-bouncing-shore.md` — design
- `backend/StationMonitor.Services/Auth/AuthService.cs` — license validation logic
- `frontend/src/pages/LoginPage.ts` — UI changes
