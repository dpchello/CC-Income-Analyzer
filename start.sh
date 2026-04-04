#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/frontend" && npm run build
cd "$ROOT/backend" && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
