# NEXT STEPS — Làm gì tiếp theo

> **TODAY (29/4/19):** Đã deploy SDK relay, tất cả code sẵn. Giờ test + deploy.

---

## 🚀 ĐỦ CHẠY NGAY (Làm trong 1 giờ)

### Bước 1: Kiểm tra thermal points hiển thị

```bash
# Terminal 1: Databse
docker start stationmonitor-db

# Terminal 2: Backend  
cd D:\StationMonitor\backend\StationMonitor.Api
dotnet run
# Xem log: "listening on http://localhost:5056"

# Terminal 3: go2rtc
cd D:\StationMonitor\media-server
go2rtc.exe -config go2rtc.yaml
# Xem log: "serving webrtc on http://localhost:1984"

# Terminal 4: SDK Relay ← QUAN TRỌNG!
cd D:\StationMonitor\sdk-relay
python enhanced_relay.py
# Xem log: "Loaded 10 point coordinates"
# Xem backend Terminal 2 có message: "[Ingest] Received 10 points..." không?

# Terminal 5: Frontend
cd D:\StationMonitor\frontend
npm run dev
# http://localhost:5173 → /realtime
```

### Bước 2: Test

**Trên /realtime page:**
- [ ] 4 camera grid hiển thị
- [ ] Camera 152 có 10 điểm tròn đủ màu (xanh/vàng/đỏ)
- [ ] Click point → xem coordinates
- [ ] Alert trigger → snapshot + email

**Nếu điểm KHÔNG hiển thị:**
→ Đọc `THERMAL-POINTS-FIX.md` (debug chi tiết)

---

## 📅 TUẦN 1: Close camera sprint (5 ngày)

| Ngày | Task | Owner |
|------|------|-------|
| Hôm nay | Confirm thermal points OK | YOU |
| +1 | Fix if error (per FIX.md) | YOU |
| +2 | Test E2E: rule → color → alert → image | QA |
| +3 | Mobile: SignalR connection | Mobile |
| +4 | **SPRINT CLOSE** ✅ | — |

**Definition of done:**
- ✅ Thermal points render on /realtime
- ✅ Colors change per rule threshold
- ✅ Alert triggers after 10s delay
- ✅ Screenshot + email sent
- ✅ All tests pass

---

## 📅 TUẦN 2: Deploy production (7 ngày)

| Ngày | Task | Owner |
|------|------|-------|
| +5 | Docker Compose setup | DevOps |
| +6 | Nginx + HTTPS config | DevOps |
| +7 | Windows Service auto-start | DevOps |
| +8 | Backup + health check | DevOps |
| +9 | Testing + staging | QA |
| +10 | **PRODUCTION READY** ✅ | — |

**What gets deployed:**
- Backend (port 5056)
- Frontend (port 5173)
- go2rtc (port 1984)
- SDK relay (background)
- TimescaleDB (port 5432)

---

## 📅 TUẦN 3: Mobile + optional Jetson (7 ngày)

| Ngày | Task | Owner |
|------|------|-------|
| +11 | Mobile SignalR + push FCM | Mobile |
| +12 | APK + iOS build | Mobile |
| +13 | Jetson AI-1 (if hardware) | AI |
| +14-17 | Optional: Jetson training | AI |

---

## 🔧 Critical path to SHIP

```
TODAY
  ├─ Thermal test (1 day)
  ├─ Close sprint (3 days)
  │
  ├─ Deploy prod (7 days)
  │   ├─ Docker
  │   ├─ Nginx
  │   └─ Auto-start
  │
  └─ PRODUCTION READY (5 days from now)

Optional:
  ├─ Mobile (3 days)
  └─ Jetson (5+ days)
```

**Timeline:** 
- **MINIMUM (no mobile/Jetson):** 5 days → SHIP
- **WITH MOBILE:** +3 days → 8 days
- **FULL (with Jetson):** +5 days → 13 days

---

## 📝 Checklist hôm nay

- [ ] Run `python enhanced_relay.py`
- [ ] Check backend log: `[Ingest] Received 10 points`
- [ ] Open http://localhost:5173/realtime
- [ ] See 10 points on camera 152
- [ ] If YES → ✅ MOVE TO WEEK 2 (DEPLOY)
- [ ] If NO → 🔴 Run `THERMAL-POINTS-FIX.md` debug steps

---

## 📚 Reference files

| File | What |
|------|------|
| `THERMAL-POINTS-FIX.md` | Debug if points not showing |
| `docs/CHANGELOG.md` | What was done each day |
| `docs/MODULES-STRUCTURE.md` | File organization |
| `PROGRESS.md` | Status per module |
| `SPRINT.md` | Current sprint + bugs |
| `ROADMAP.md` | Phase overview |

---

**Status: WAITING thermal test result**
- If ✅ → Start Week 2 deploy
- If ❌ → Debug relay per FIX.md

🎯 **Goal: PRODUCTION in 5 days**
