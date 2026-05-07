#!/bin/bash
# ============================================================
# build-web.sh — Build frontend and deploy to backend wwwroot
# Usage: ./scripts/build-web.sh
# ============================================================

set -e

echo "════════════════════════════════════════════════════════"
echo "  Build Frontend & Deploy to Backend"
echo "════════════════════════════════════════════════════════"
echo

# Go to frontend directory
cd "$(dirname "$0")/../frontend"

echo "[1/3] Building frontend..."
VITE_API_URL="" VITE_GO2RTC_URL="" npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build failed: dist/ directory not found"
    exit 1
fi

echo
echo "[2/3] Clearing old wwwroot..."
# Clear existing files (except .gitkeep if it exists)
rm -rf ../backend/StationMonitor.Api/wwwroot/*

echo
echo "[3/3] Deploying to wwwroot..."
cp -r dist/* ../backend/StationMonitor.Api/wwwroot/

echo
echo "════════════════════════════════════════════════════════"
echo "✅ Build complete!"
echo "════════════════════════════════════════════════════════"
echo
echo "Next steps:"
echo "  1. Restart backend: dotnet run (in backend/StationMonitor.Api/)"
echo "  2. Open browser: http://localhost:5056"
echo "  3. Login with:"
echo "     - Username: admin"
echo "     - Password: Admin@123"
echo "     - License Key: SM-DEMO-0000-FREE1"
echo
