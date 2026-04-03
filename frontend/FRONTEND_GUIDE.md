# 🎨 World Monitor — Frontend Technical Guide

World Monitor's frontend is a high-performance GIS (Geographic Information System) application built using **Vite**, **TypeScript**, and **Deck.gl**.

## 🏗 Frontend Architecture

### 1. GIS Engine (MapLibre GL + Deck.gl)
- **MapLibre GL**: Handles vector maps and base layers.
- **Deck.gl**: High-performance data-driven visualization layers (ArcLayer, HeatmapLayer, IconLayer, etc.).
- **Map Interaction**: 3D interactions (pitch/rotation) are supported and configurable via `VITE_MAP_INTERACTION_MODE`.

### 2. UI Components (App.ts + pages/)
- **App.ts**: The central component handling layout, overlays, and sidebars.
- **Pages**: Functional views like `DashboardPage`, `RealtimeMonitorPage`, `AlertsHistoryPage`.
- **Styling**: Vanilla CSS for maximum flexibility and control.

### 3. State & Routing
- **Router**: `src/router/Router.ts` handles SPA navigation without page reloads.
- **Internal State**: The system uses custom services and observers to notify components of global state changes (e.g., sidebar visibility).

## 🛠 Setup & Running

### Requirements
- **Node.js**: 18.0 or later.
- **Registry**: npm is used as the primary package manager.

### Steps
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Environment Variables**:
    Copy `.env.example` to `.env.local` and configure your API keys.
3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
4.  **Build for Production**:
    ```bash
    npm run build
    ```

## 🎥 Camera Streaming Integration
The frontend connects to **go2rtc** (port 1984) and the **AI Server** (port 8001) for live video and real-time detection feeds.
- **Live Stream**: `http://localhost:1984/stream?src=cam_01&mode=webrtc`
- **AI Feed**: `http://localhost:8001/video_feed`

## 🖥 Desktop App (Tauri)
The project can be built as a native desktop application for macOS and Windows.
- **Dev**: `npm run desktop:dev`
- **Build**: `npm run desktop:build:full`
- **Requirements**: Rust/Cargo installed on your system.

---

For internal logic, refer to `src/services/` for API communication and `src/utils/` for helper functions.
