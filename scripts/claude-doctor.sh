#!/bin/bash
#
# Harvest control-panel doctor — drives Claude Code headless to investigate (and,
# in fix mode, repair) whatever is wrong with the local app right now. Launched
# on-demand by the desktop control panel via `harvestctl.sh doctor|diagnose`,
# which backgrounds this script so the AppleScript UI never blocks.
#
#   scripts/claude-doctor.sh fix        # investigate, fix, reload, verify, commit+push to main
#   scripts/claude-doctor.sh diagnose   # read-only: investigate + report, change nothing
#
# Tail logs:   tail -f ~/Library/Logs/harvest/claude-doctor.log
# Last report: ~/Library/Logs/harvest/claude-doctor.summary.md

set -uo pipefail

MODE="${1:-fix}"
case "$MODE" in fix|diagnose) ;; *) echo "usage: claude-doctor.sh {fix|diagnose}"; exit 2 ;; esac

REPO="/Users/leslie/CC-Income-Analyzer"
SCRIPT_DIR="$REPO/scripts"
PROMPT_FILE="$SCRIPT_DIR/claude-doctor.prompt.md"
CTL="$SCRIPT_DIR/harvestctl.sh"
LOG_DIR="$HOME/Library/Logs/harvest"
LOG="$LOG_DIR/claude-doctor.log"
SUMMARY="$LOG_DIR/claude-doctor.summary.md"
CLAUDE_OUT="/tmp/harvest-doctor-claude-result.json"
LOCK="$REPO/.git/claude-doctor.lock"
BASE_BRANCH="main"
URL="http://127.0.0.1:8000"

# Diagnose is read-only and quick; fix may need to trace + edit + verify.
if [ "$MODE" = "fix" ]; then MAX_RUNTIME=1800; else MAX_RUNTIME=600; fi

# Desktop app / launchd hand us a bare PATH — make claude, gh, git, node, curl reachable.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== claude-doctor ($MODE) starting ==="

if ! command -v claude >/dev/null 2>&1; then
  log "ERROR: 'claude' CLI not on PATH. Install Claude Code, then retry."
  exit 1
fi

# Single instance — a second click while one run is in flight is a no-op.
if [ -e "$LOCK" ]; then
  log "Another doctor run is already in progress ($LOCK) — skipping this launch."
  exit 0
fi
trap 'rm -f "$LOCK"' EXIT
echo "$$" > "$LOCK"

cd "$REPO" || { log "Cannot cd to $REPO"; exit 1; }

# --- Capture a live diagnostics snapshot to hand Claude up front ---
snapshot() {
  echo "### harvestctl status"; /bin/bash "$CTL" status 2>&1
  echo; echo "### listeners on :8000"; lsof -nP -iTCP:8000 -sTCP:LISTEN 2>&1 | head -10
  echo; echo "### launchd job"; launchctl print "gui/$(id -u)/com.harvest.backend" 2>&1 | grep -iE "state|pid|last exit|program|path" | head -20
  echo; echo "### backend.err.log (tail 40)"; tail -40 "$LOG_DIR/backend.err.log" 2>&1
  echo; echo "### backend.log (tail 60)"; tail -60 "$LOG_DIR/backend.log" 2>&1
}
SNAP="$(snapshot)"

# --- Mode-specific instructions ---
if [ "$MODE" = "fix" ]; then
  MODE_BLOCK="## MODE: INVESTIGATE & FIX (autonomous)
Once you've confirmed the root cause and applied the smallest fix:
1. Reload the app:  \`bash scripts/harvestctl.sh reload\`
2. Verify health:   \`bash scripts/harvestctl.sh status\` should report ONLINE, and
   \`curl -s -o /dev/null -w '%{http_code}' $URL/api/dashboard\` should print 200.
   If it's still faulting, iterate — you are not done until it's healthy, or you've proven
   the fault is external (e.g. an upstream market-data outage) and documented that.
3. ONLY after the app is verified healthy and you actually changed code, commit to
   $BASE_BRANCH with a clear message (end with the Co-Authored-By line) and
   \`git push origin $BASE_BRANCH\`. If you changed nothing, do not commit."
else
  MODE_BLOCK="## MODE: DIAGNOSE ONLY (read-only)
Do NOT edit, reload, commit, or change any state whatsoever. Investigate, then write your
root-cause report to the SUMMARY file. Name the exact fix you would apply, but do not apply it."
fi

PROMPT="$(cat "$PROMPT_FILE")

$MODE_BLOCK

SUMMARY: write your final report to this file: $SUMMARY

## Live diagnostics snapshot (captured at launch)
\`\`\`
$SNAP
\`\`\`"

# --- Hard-cutoff watchdog ---
( sleep "$MAX_RUNTIME"; log "Watchdog: ${MAX_RUNTIME}s cap reached, killing claude."; pkill -P $$ claude 2>/dev/null ) &
WATCHDOG=$!

: > "$SUMMARY" 2>/dev/null || true
rm -f "$CLAUDE_OUT"

CLAUDE_ARGS=(-p "$PROMPT" --add-dir "$REPO" --output-format json)
# Fix mode needs write/exec; diagnose still reads files + runs shell, so both skip prompts
# (headless, no TTY to approve on). Diagnose is constrained by the prompt, not permissions.
CLAUDE_ARGS+=(--dangerously-skip-permissions)

log "Invoking claude ($MODE; cap ${MAX_RUNTIME}s)…"
claude "${CLAUDE_ARGS[@]}" >"$CLAUDE_OUT" 2> >(sed 's/^/  [claude:err] /')
CLAUDE_RC=$?
kill "$WATCHDOG" 2>/dev/null
log "claude exited with code $CLAUDE_RC"

# Surface the agent's own result text into the log.
if [ -s "$CLAUDE_OUT" ] && command -v jq >/dev/null 2>&1; then
  jq -r '.result // empty' "$CLAUDE_OUT" 2>/dev/null | head -c 2000 | sed 's/^/  [doctor:result] /'
fi

# --- Fix-mode safety nets (in case claude was cut off mid-finish) ---
if [ "$MODE" = "fix" ]; then
  # If the app is still down, attempt one reload ourselves.
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL/api/dashboard" 2>/dev/null || echo 000)"
  if [ "$code" != "200" ]; then
    log "App still not healthy (HTTP $code) after session — attempting a reload backstop."
    /bin/bash "$CTL" reload 2>&1 | sed 's/^/  /'
  fi
  # If claude committed but didn't push, push the backstop.
  if git rev-parse --abbrev-ref HEAD 2>/dev/null | grep -qx "$BASE_BRANCH"; then
    AHEAD=$(git rev-list --count "origin/$BASE_BRANCH..$BASE_BRANCH" 2>/dev/null || echo 0)
    if [ "$AHEAD" -gt 0 ]; then
      log "$AHEAD unpushed commit(s) on $BASE_BRANCH — pushing backstop."
      git push origin "$BASE_BRANCH" 2>&1 | sed 's/^/  /' || log "Push failed — commits remain local for review."
    fi
  fi
fi

[ -s "$SUMMARY" ] && { log "Report written to $SUMMARY:"; sed 's/^/  /' "$SUMMARY" | head -40; } \
                   || log "No summary file written (claude may have been cut off)."
log "=== claude-doctor ($MODE) done ==="
