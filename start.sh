#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping..."
  kill 0
}
trap cleanup EXIT INT TERM

echo "Starting Harvest dev stack..."
echo "  Marketing site → http://localhost:3001"
echo "  App            → http://localhost:5173"
echo "  API            → http://localhost:8000"
echo ""

# Backend API (no static file serving in dev)
cd "$ROOT/backend"
HARVEST_DEV=1 python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 &

# React app
cd "$ROOT/frontend"
npm run dev &

# Marketing site
cd "$ROOT/marketing"
npm run dev &

wait
