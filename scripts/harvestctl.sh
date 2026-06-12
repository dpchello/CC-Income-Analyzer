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

# launchd is the single supervisor (boot autostart + crash recovery). This script
# delegates to it when the LaunchAgent is installed, and only falls back to a raw
# nohup when it isn't — so we never race launchd's KeepAlive by killing its child
# out from under it (that loop logged ~25k "address already in use" errors).
LABEL="com.harvest.backend"
DOMAIN="gui/$(id -u 2>/dev/null || echo 501)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

STATE_DIR="$HOME/.harvest"
LOG_DIR="$HOME/Library/Logs/Harvest"
PIDFILE="$STATE_DIR/backend.pid"
LOG="$LOG_DIR/backend.log"
mkdir -p "$STATE_DIR" "$LOG_DIR"

# Claude doctor (investigate / fix) — logic lives in claude-doctor.sh; we just launch it.
DOCTOR="$SCRIPT_DIR/claude-doctor.sh"
DOCTOR_LOG="$LOG_DIR/claude-doctor.log"
DOCTOR_SUMMARY="$LOG_DIR/claude-doctor.summary.md"

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

# launchd helpers
_launchd_loaded()  { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
_launchd_present() { [ -f "$PLIST" ]; }
_wait_serving() {   # poll up to ~10s for a 200 on /
  local i code=000
  for i in $(seq 1 25); do code="$(_http_code "$URL/")"; [ "$code" = "200" ] && return 0; sleep 0.4; done
  return 1
}
# Kill any process bound to :8000 that launchd is NOT supervising (a stray nohup
# from the legacy code path). Never used against the launchd child.
_kill_stray_listeners() {
  local left; left="$(_listener_pids)"
  [ -z "$left" ] && return 0
  echo "$left" | xargs kill 2>/dev/null; sleep 1
  left="$(_listener_pids)"; [ -n "$left" ] && { echo "$left" | xargs kill -9 2>/dev/null; sleep 0.5; }
}

# ── commands ─────────────────────────────────────────────────────────────────

_start() {
  if [ -n "$(_listener_pids)" ]; then echo "Already running on $URL"; return 0; fi
  if [ ! -d "$BACKEND" ]; then echo "ERROR: backend dir not found: $BACKEND"; return 1; fi

  # Preferred path: let launchd own the process.
  if _launchd_present; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [harvestctl] start via launchd ($LABEL)" >> "$LOG"
    if _launchd_loaded; then launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1
    else launchctl bootstrap "$DOMAIN" "$PLIST" >/dev/null 2>&1; fi
    if _wait_serving; then echo "Started (launchd) — $URL is serving."
    else echo "Launched via launchd but $URL not responding yet. See $LOG / backend.err.log"; fi
    return
  fi

  # Fallback (no LaunchAgent installed): raw nohup, fully detached.
  if ! _python_ok; then
    echo "ERROR: '$PYTHON' can't import uvicorn. Install deps:"
    echo "  $PYTHON -m pip install -r $BACKEND/requirements.txt"
    return 1
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') [harvestctl] start (nohup) $URL" >> "$LOG"
  ( cd "$BACKEND" && nohup "$PYTHON" -m uvicorn main:app --host "$HOST" --port "$PORT" \
      < /dev/null >> "$LOG" 2>&1 & echo $! > "$PIDFILE" ) >/dev/null 2>&1 &
  if _wait_serving; then
    local real; real="$(_listener_pids | head -1)"; [ -n "$real" ] && echo "$real" > "$PIDFILE"
    echo "Started (pid $(cat "$PIDFILE" 2>/dev/null)) — $URL is serving."
  else
    echo "Launched but $URL not responding yet. See log: $LOG"
  fi
}

_stop() {
  # Bootout removes the job from the domain so KeepAlive does NOT respawn it —
  # the crux of the old bug, where a kill-by-port tripped an endless restart loop.
  if _launchd_present && _launchd_loaded; then
    echo "Stopping launchd job $LABEL…"
    launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1
    sleep 1
  fi
  _kill_stray_listeners   # clean up any legacy nohup straggler too
  rm -f "$PIDFILE"
  if [ -z "$(_listener_pids)" ]; then echo "Stopped — $URL is offline."
  else echo "WARN: something is still bound to :$PORT"; fi
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

# ── nightly upgrade agent toggle ──────────────────────────────────────────────
# Shared on/off flag, also read/written by the web UI (Settings → Nightly Upgrade
# Agent) and checked by scripts/nightly-upgrade.sh. "off" disables; absence/"on" = on.
AGENT_FLAG="$REPO/.nightly-agent.enabled"

_agent_state() {   # prints ON or OFF
  if [ -f "$AGENT_FLAG" ] && [ "$(tr '[:upper:]' '[:lower:]' < "$AGENT_FLAG" | tr -d '[:space:]')" = "off" ]; then
    echo "OFF"
  else
    echo "ON"
  fi
}
_agent_on()     { echo "on"  > "$AGENT_FLAG"; echo "Nightly upgrade agent: ON"; }
_agent_off()    { echo "off" > "$AGENT_FLAG"; echo "Nightly upgrade agent: OFF"; }
_agent_toggle() { if [ "$(_agent_state)" = "ON" ]; then _agent_off; else _agent_on; fi; }

# ── Claude doctor ─────────────────────────────────────────────────────────────
# Launch claude-doctor.sh fully detached and return immediately, so the desktop
# control panel never blocks while Claude investigates (can take minutes).
_doctor_launch() {   # $1 = fix|diagnose
  local mode="$1"
  export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
  if [ ! -f "$DOCTOR" ]; then echo "ERROR: doctor script not found: $DOCTOR"; return 1; fi
  if ! command -v claude >/dev/null 2>&1; then
    echo "ERROR: 'claude' CLI not found on PATH — install Claude Code to use the doctor."; return 1
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') [harvestctl] launching doctor:$mode" >> "$DOCTOR_LOG"
  ( nohup /bin/bash "$DOCTOR" "$mode" < /dev/null >> "$DOCTOR_LOG" 2>&1 & ) >/dev/null 2>&1 &
  if [ "$mode" = "fix" ]; then
    echo "🩺 Claude is investigating and will fix + reload, then commit to main. Watch the log."
  else
    echo "🔍 Claude is diagnosing (read-only). Watch the log; report lands in the summary."
  fi
}

case "${1:-status}" in
  start)            _start ;;
  stop|end|kill)    _stop ;;
  reload|restart)
    if _launchd_present && _launchd_loaded; then
      echo "Reloading (launchd kickstart -k)…"
      _kill_stray_listeners                       # clear any legacy nohup holding :8000
      launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1
      if _wait_serving; then echo "Reloaded — $URL is serving."
      else echo "Reloaded but $URL not responding yet. See $LOG / backend.err.log"; fi
    else
      echo "Reloading…"; _stop; _start
    fi
    ;;
  status)           _status ;;
  state)            _state ;;
  logs|log)         echo "$LOG" ;;
  doctor|fix)       _doctor_launch fix ;;
  diagnose|check-ai) _doctor_launch diagnose ;;
  doctor-log)       echo "$DOCTOR_LOG" ;;
  doctor-summary)   echo "$DOCTOR_SUMMARY" ;;
  agent-state)      _agent_state ;;
  agent-on)         _agent_on ;;
  agent-off)        _agent_off ;;
  agent-toggle)     _agent_toggle ;;
  *) echo "usage: harvestctl {start|reload|stop|status|state|logs|doctor|diagnose|doctor-log|doctor-summary|agent-state|agent-on|agent-off|agent-toggle}"; exit 2 ;;
esac
