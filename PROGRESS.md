# PROGRESS — Tiến độ dự án

> Nhìn một chỗ thấy hết. Chi tiết từng module → `docs/modules/<module>.md`
> Sprint hiện tại → `SPRINT.md` · Kế hoạch phase → `ROADMAP.md`

---

## Tổng quan nhanh

| Hạng mục | Tiến độ |
|----------|---------|
| Backend API | 55+ endpoints ✅ |
| Frontend UI | 13 trang ✅ |
| Camera pipeline | ✅ (cần test E2E) |
| Protocols | 4/6 giao thức ✅ |
| Mobile app | 🔄 50% |
| Push notification | ❌ Chưa làm |
| Jetson AI | ❌ Chờ phần cứng |
| Deploy production | ❌ Chưa làm |

---

## Chi tiết theo module

### Auth & Users [`docs/modules/auth.md`]
| Tính năng | Status |
|-----------|--------|
| Login / Logout / Refresh token | ✅ |
| 3 roles: admin / operator / viewer | ✅ |
| User CRUD (admin) | ✅ |
| Audit log (POST/PUT/DELETE) | ✅ |
| Login log (success + fail) | ✅ |
| 2FA / SSO | ❌ |
| Rate limit brute-force | ❌ |

---

### Camera & Thermal [`docs/modules/camera.md`]
| Tính năng | Status |
|-----------|--------|
| SDK relay: đọc 10 điểm nhiệt từ cam 152 | ✅ |
| RTSP push → go2rtc → WebRTC frontend | ✅ |
| Canvas overlay letterbox correction | ✅ |
| Màu điểm theo rule (xanh/vàng/đỏ) | ✅ |
| ThermalEvidenceService: ảnh + clip khi alert | ✅ |
| **Test E2E đầy đủ** | 🔄 Cần test |
| Camera 153 (phóng điện) tách luồng | ❌ |
| ISAPI webhook motion/line crossing | ❌ |
| Retention evidence files (xóa > 30 ngày) | ❌ |

---

### Rule Engine & Alerts [`docs/modules/alerts.md`]
| Tính năng | Status |
|-----------|--------|
| CRUD rule (warning/critical/hysteresis/cooldown) | ✅ |
| Đánh giá mỗi 5s, confirm delay | ✅ |
| Alert ack / close / history | ✅ |
| Email notification (SMTP Gmail) | ✅ |
| Ảnh + clip bằng chứng khi alert | ✅ |
| Auto-close khi value về normal > 5 phút | ❌ |
| Zalo / Telegram notification | ❌ |
| Alert grouping (gộp cùng device trong 1h) | ❌ |

---

### Analytics & Reports [`docs/modules/analytics.md`]
| Tính năng | Status |
|-----------|--------|
| Time-series query + downsample | ✅ |
| Export CSV / XLSX | ✅ |
| Daily PDF report | ✅ |
| Health Score worker | ✅ (cơ bản) |
| EarlyWarning skeleton | ✅ skeleton |
| EarlyWarning trend detection thực tế (7 ngày) | ❌ |
| Delta-T alert riêng | ❌ |
| Scheduled report email (daily/monthly) | ❌ |
| Compare mode 2 thiết bị | ❌ |

---

### Industrial Protocols [`docs/modules/protocols.md`]
| Protocol | Status |
|----------|--------|
| Siemens S7-1200 | ✅ |
| Modbus TCP + RTU | ✅ |
| BACnet/IP | ✅ |
| SNMP v2c/v3 | ✅ |
| IEC-60870-5-104 | ❌ Planned (P2) |
| DNP3 / OPC UA | ❌ Backlog |
| Write support (remote control) | ❌ |

---

### Mobile App [`docs/modules/mobile.md`]
| Tính năng | Status |
|-----------|--------|
| Khung app (login, dashboard, alert list) | ✅ |
| API client + JWT refresh | ✅ |
| Cloudflare Tunnel remote access | ✅ |
| SignalR realtime connection | ❌ |
| Push notification (FCM) | ❌ |
| Offline cache | ❌ |
| APK production build | ❌ |
| iOS build | ❌ |

---

### Jetson AI [`docs/modules/jetson-ai.md`]
| Tính năng | Status |
|-----------|--------|
| DetectionsController (backend) | ✅ skeleton |
| AI-1: SDK relay lên Jetson Orin Nano | ❌ Chờ Jetson |
| AI-2: YOLOv8 dataset + train | ❌ |
| AI-2: TensorRT deploy + inference loop | ❌ |
| AI-3: Dashboard AI events | ❌ |

---

### Deploy & Production [`docs/setup.md`]
| Tính năng | Status |
|-----------|--------|
| Cloudflare Tunnel (temp URL) | ✅ |
| Docker Compose production | ❌ |
| Nginx + HTTPS | ❌ |
| Cloudflare Named Tunnel (URL cố định) | ❌ |
| Windows Service auto-start | ❌ |
| Backup DB tự động | ❌ |
| Health check endpoint + monitor | ❌ |
| Script deploy 1 lệnh | ❌ |

---

## Kế hoạch làm tiếp (theo thứ tự ưu tiên)

| Tuần | Nhóm việc | Ước tính |
|------|-----------|----------|
| Tuần 1 | Test E2E camera · Auto-close alert · Push notification FCM | ~5 ngày |
| Tuần 2 | Zalo/Telegram notify · EarlyWarning thực · Scheduled report email | ~6 ngày |
| Tuần 3 | Docker prod · Nginx HTTPS · Cloudflare Named · Windows Service · Backup | ~7 ngày |
| Tuần 4 | Mobile SignalR · FCM end-to-end · APK build · iOS | ~7 ngày |
| Tuần 5-8 | Jetson AI (phụ thuộc có phần cứng) | ~24 ngày |

**Production không cần AI: ~3 tuần**
**Đầy đủ AI + mobile: ~7-8 tuần**

---

*Cập nhật: 2026-04-19*
