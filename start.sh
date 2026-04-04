#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/frontend" && npm run build
cd "$(dirname "$0")/backend" && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
