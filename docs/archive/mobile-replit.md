# PowerGuard - Ứng dụng Giám sát Phóng điện & Quá nhiệt

## Overview
A mobile app for monitoring power station equipment. Allows technicians and managers to remotely track power station operating status, receive instant alerts, and confirm issue resolution at any time.

## Architecture

### Frontend (Expo React Native)
- Framework: Expo SDK 54 with Expo Router (file-based routing)
- State: React Context (auth), AsyncStorage (persistence), React Query (data fetching)
- UI: Custom dark industrial theme with amber/red/green severity colors
- Port: 8081

### Backend (Express + TypeScript)
- Simple Express server serving the Expo manifest and landing page
- Port: 5000

## Project Structure
```
app/
  _layout.tsx          # Root layout with AuthProvider + QueryClient
  login.tsx            # Login screen
  (tabs)/
    _layout.tsx        # Tab layout (NativeTabs/ClassicTabs)
    index.tsx          # Dashboard with KPIs + recent alerts
    alerts.tsx         # Alerts list with filters
    devices.tsx        # Device list
    settings.tsx       # Settings + profile
  alert/
    [id].tsx           # Alert detail + acknowledge/resolve actions
  device/
    [id].tsx           # Device detail + trend chart + camera
context/
  auth.tsx             # AuthProvider with AsyncStorage persistence
data/
  mock-data.ts         # Mock data + AsyncStorage helpers for alerts/devices
constants/
  colors.ts            # Dark/light theme color tokens
```

## Features
1. **Login** - Username/password auth, persisted session
2. **Dashboard** - KPI cards (unresolved count, max temp, max PD), recent alerts, device grid, quick links to Map
3. **Alerts** - Full list with severity/status filters, relative timestamps
4. **Alert Detail** - Full info, acknowledge/resolve with notes, history log
5. **Station Map (Sơ đồ trạm)** - Interactive grid layout with color-coded tiles by status, orientation-responsive (3 cols portrait, 5 cols landscape), tap → device detail, long press → quick info bottom sheet with live metrics
6. **Devices** - List with online/offline status, temperature/PD readings
7. **Device Detail** - Gauge bars, 6-hour trend chart, camera snapshot placeholder
8. **Settings** - Profile card, notification settings, dark/light mode, logout

## Theme Colors
- Background: #070B14 (dark navy)
- Accent: #F59E0B (amber)
- Critical: #EF4444 (red)
- Warning: #F59E0B (amber)
- OK/Online: #10B981 (emerald)

## Demo Credentials
- admin / admin123
- tech01 / tech123
- tech02 / tech123
