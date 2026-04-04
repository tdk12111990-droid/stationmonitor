# [Frontend Plan] SLD Device Editor & Real-time Dashboard

This document outlines the implementation of the "Single Line Diagram" (SLD) interactive editor.

## Context & User Objective
The user wants to replace the manual "Add Point" (x, y) modal with a professional **Drag & Drop** sidebar system. Users manage devices in the "Devices" page, and then "Pin" them onto the Dashboard's SVG map by dragging from a palette.

## UI/UX Design (Confirmed Prototype)
- **Edit Mode Toggle**: A button `[📝 Đang chỉnh]` in the SLD toolbar.
- **Device Drawer (Sidebar)**: Slides out from the left when editing is ON.
  - Fetches devices for the current station that have NOT yet been pinned.
  - Elements are draggable.
- **SLD Canvas (SVG)**:
  - Supports Pan & Zoom.
  - Grid overlay appears during Edit Mode.
  - Dropping a device onto the SVG creates an `SldPoint` and saves it to the Backend.
- **Smart Dots**:
  - Pinned dots link to a `DeviceId`.
  - Tooltips show real-time measurements (Phase 1, 2, 3, PD).
  - Dot color changes dynamically based on the device's alert status.

## Technical Requirements

### 1. State Management (`DashboardPage.ts`)
- `isEditing: boolean` - Controls UI visibility (Sidebar, Grid, Save button).
- `unpinnedDevices: Device[]` - Devices in this station not yet mapped to an `SldPoint`.
- `pinnedPoints: SldPoint[]` - Points fetched from the API with their `x, y` and `deviceId`.

### 2. API Integration (`StationApiService.ts`)
- `getSld(stationId)`: Returns the active SVG file and all pinned points.
- `saveSldPoint(data)`: Persists a new or moved point to the database.
- `deleteSldPoint(id)`: Removes a point from the SLD.
- `uploadSldSvg(stationId, file)`: Replaces the background SVG map.

### 3. Real-time Service (`SensorService.ts`)
- The dashboard must subscribe to SignalR/MQTT updates for all `pinnedPoints.deviceId`s.
- When a `Measurement` event arrives, the corresponding SVG dot must update its color/tooltip.

## Handover Notes for AI Assistants
- **Prototype Reference**: See `dashboard-setup-demo.html` in the root directory for the confirmed CSS/HTML structure.
- **Backend Reference**: Matches `SldController.cs` in the `StationMonitor.Api` project.
- **Architecture**: The SVG is landscape (e.g., 792x612). Positions `x` and `y` are stored as absolute coordinates in that viewbox, but should be rendered responsively using SVG scaling.
