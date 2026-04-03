

## 🚀 Quick Start (Windows)

The easiest way to start all services on Windows is to use the provided batch script:

1. Copy `.env.example` to `.env.local` and add any necessary API keys.
2. Ensure you have **Node.js**, **Python 3**, and **ffmpeg** installed.
3. Install frontend dependencies: `npm install`
4. Install AI server dependencies: `pip install -r requirements.txt`
5. Run the startup script:
   ```cmd
   start.bat
   ```
6. Open your browser at: `http://localhost:5173`

---

## 🛠 Manual Setup & Requirements

### 1. Frontend (Vite + TypeScript)
- **Engine**: Node.js 18+
- **Install**: `npm install`
- **Run (Dev)**: `npm run dev`
- **Build**: `npm run build`
- **Desktop (Tauri)**: `npm run desktop:dev` (requires Rust/Cargo)

### 2. Backend (Convex)
The application uses **Convex** for real-time data storage (e.g., registration).
- **Run**: `npx convex dev`

### 3. AI Analysis Server (Python)
Located in `scripts/yolo_server.py`. Handles RTSP stream processing with YOLOv11 for human detection.
- **Requirements**: Python 3.10+, `ffmpeg` in PATH.
- **Install**: `pip install -r requirements.txt`
- **Run**: `python scripts/yolo_server.py`
- **Port**: 8001 (default)

### 4. Video Streaming (go2rtc)
Used for managing multiple RTSP camera feeds and converting them for the browser.
- **Config**: `go2rtc.yaml`
- **Run**: `bin\go2rtc.exe -config go2rtc.yaml`
- **Port**: 1984 (default)

---

## 📂 Project Structure

- `src/`: Main frontend source code (Deck.gl, MapLibre GL).
- `convex/`: Backend functions and schema.
- `bin/`: Binary dependencies (go2rtc, etc.).
- `scripts/`: Python AI servers and utility scripts.
- `src-tauri/`: Desktop configuration and Rust sidecar code.
- `docs/`: Technical documentation and design plans.

---

## ⚙ Configuration (.env)

Copy `.env.example` to `.env.local`. Most keys are optional, but required for specific layers:
- **GROQ_API_KEY**: For AI summarization features.
- **UPSTASH_REDIS_URL**: For cross-user caching.
- **FINNHUB_API_KEY**: For stock market data.
- **CONVEX_URL**: Link to your Convex deployment.

---

## ⚖ License
This project is licensed under **AGPL-3.0-only**.

Developed for **World Monitor Research**.
