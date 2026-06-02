#!/usr/bin/env bash
# harvestctl — start / reload / stop / status for the local Harvest app.
#
# "The app" is the backend (uvicorn on 127.0.0.1:8000), which also serves the
# built frontend, so :8000 responding == app online. This script is the single
# source of truth used by the desktop "Harvest.app" launcher, and works just as
# well from a terminal:
#
#   scripts/harvestctl.sh status     # is it up? any faults?
#   scripts/harvestctl.sh start
#   scripts/harvestctl.sh reload
#   scripts/harvestctl.sh stop
#
set -u

# Resolve repo root from this script's own location (scripts/ -> repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$REPO/backend"

HOST="127.0.0.1"
PORT="8000"
URL="http://$HOST:$PORT"

STATE_DIR="$HOME/.harvest"
LOG_DIR="$HOME/Library/Logs/Harvest"
PIDFILE="$STATE_DIR/backend.pid"
LOG="$LOG_DIR/backend.log"
mkdir -p "$STATE_DIR" "$LOG_DIR"

# The desktop app runs us with a bare PATH (Apple events), so make the tools we
# call (lsof, curl, ps, python3) findable regardless of how we were launched.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
PYTHON="$(command -v python3 || echo /usr/bin/python3)"

ERR_PATTERN='ERROR|Traceback|Exception|CRITICAL|HTTP/1.1" 5[0-9][0-9]'

# ── helpers ──────────────────────────────────────────────────────────────────

_listener_pids() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null; }

_http_code() { local c; c="$(curl -s -o /dev/null -m 4 -w '%{http_code}' "$1" 2>/dev/null)"; echo "${c:-000}"; }

_uptime_of() { ps -o etime= -p "$1" 2>/dev/null | tr -d ' '; }

# echoes "COUNT|<last up-to-5 matching lines>"
_recent_errors() {
  [ -f "$LOG" ] || { echo "0|"; return; }
  local count lines
  count="$(tail -n 400 "$LOG" 2>/dev/null | grep -cE "$ERR_PATTERN")"
  lines="$(tail -n 400 "$LOG" 2>/dev/null | grep -E "$ERR_PATTERN" | tail -n 5)"
  echo "${count:-0}|${lines}"
}

# ONLINE | OFFLINE | FAULT
_state() {
  local pids root api
  pids="$(_listener_pids)"
  [ -z "$pids" ] && { echo "OFFLINE"; return; }
  root="$(_http_code "$URL/")"
  api="$(_http_code "$URL/api/signals")"
  [ "$root" = "000" ] && { echo "FAULT"; return; }            # bound but not answering
  case "$root$api" in 5*|*5[0-9][0-9]) echo "FAULT"; return;; esac
  [ "${root:0:1}" = "5" ] && { echo "FAULT"; return; }
  [ "$root" = "200" ] || [ "$root" = "304" ] && { echo "ONLINE"; return; }
  echo "FAULT"
}

_python_ok() { "$PYTHON" -c 'import uvicorn' >/dev/null 2>&1; }

# ── commands ─────────────────────────────────────────────────────────────────

_start() {
  local pids; pids="$(_listener_pids | tr '\n' ' ')"
  if [ -n "$pids" ]; then echo "Already running (pid ${pids%% }) on $URL"; return 0; fi
  if [ ! -d "$BACKEND" ]; then echo "ERROR: backend dir not found: $BACKEND"; return 1; fi
  if ! _python_ok; then
    echo "ERROR: '$PYTHON' can't import uvicorn. Install deps:"
    echo "  $PYTHON -m pip install -r $BACKEND/requirements.txt"
    return 1
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') [harvestctl] start $URL" >> "$LOG"
  # Launch fully detached. The subshell's own stdout/stderr go to /dev/null so the
  # background server never holds a caller's capture pipe — otherwise macOS
  # `do shell script` (the desktop app) would block until the server is killed.
  ( cd "$BACKEND" && nohup "$PYTHON" -m uvicorn main:app --host "$HOST" --port "$PORT" \
      < /dev/null >> "$LOG" 2>&1 & echo $! > "$PIDFILE" ) >/dev/null 2>&1 &
  local i code=000
  for i in $(seq 1 25); do
    code="$(_http_code "$URL/")"; [ "$code" = "200" ] && break; sleep 0.4
  done
  # Record the actual listener pid (the launcher pid can differ by one).
  local real; real="$(_listener_pids | head -1)"; [ -n "$real" ] && echo "$real" > "$PIDFILE"
  if [ "$code" = "200" ]; then
    echo "Started (pid $(cat "$PIDFILE" 2>/dev/null)) — $URL is serving."
  else
    echo "Launched but $URL not responding yet (code $code). See log:"
    echo "  $LOG"
  fi
}

_stop() {
  local pids; pids="$(_listener_pids)"
  [ -f "$PIDFILE" ] && pids="$pids $(cat "$PIDFILE" 2>/dev/null)"
  pids="$(printf '%s\n' $pids | grep -E '^[0-9]+$' | sort -u)"
  if [ -z "$pids" ]; then echo "Not running."; rm -f "$PIDFILE"; return 0; fi
  echo "Stopping: $(echo $pids | tr '\n' ' ')"
  echo "$pids" | xargs kill 2>/dev/null
  sleep 1.5
  local left; left="$(_listener_pids)"
  [ -n "$left" ] && { echo "$left" | xargs kill -9 2>/dev/null; sleep 0.5; }
  rm -f "$PIDFILE"
  if [ -z "$(_listener_pids)" ]; then echo "Stopped — $URL is offline."; else echo "WARN: something is still bound to :$PORT"; fi
}

_status() {
  local state pids root api errinfo errcount errlines p1
  state="$(_state)"
  pids="$(_listener_pids | tr '\n' ' ')"
  root="$(_http_code "$URL/")"
  api="$(_http_code "$URL/api/signals")"
  errinfo="$(_recent_errors)"; errcount="${errinfo%%|*}"; errlines="${errinfo#*|}"

  case "$state" in
    ONLINE)  echo "🟢  Harvest is ONLINE";;
    FAULT)   echo "🟠  Harvest is UP but FAULTING";;
    OFFLINE) echo "🔴  Harvest is OFFLINE";;
  esac
  echo "$URL"
  if [ -n "$pids" ]; then
    p1="$(echo $pids | awk '{print $1}')"
    echo "PID(s): ${pids% }   ·   up $(_uptime_of "$p1")"
  fi
  echo "HTTP / : $root      API /api/signals : $api  (401 = auth gate, healthy)"
  echo ""
  if [ "${errcount:-0}" -gt 0 ]; then
    echo "⚠︎  ${errcount} fault line(s) in recent log:"
    printf '%s\n' "$errlines" | sed 's/^/    /'
  else
    echo "✓  No errors in recent log."
  fi
  echo ""
  echo "Log: $LOG"
}

case "${1:-status}" in
  start)            _start ;;
  stop|end|kill)    _stop ;;
  reload|restart)   echo "Reloading…"; _stop; _start ;;
  status)           _status ;;
  state)            _state ;;
  logs|log)         echo "$LOG" ;;
  *) echo "usage: harvestctl {start|reload|stop|status|state|logs}"; exit 2 ;;
esac
