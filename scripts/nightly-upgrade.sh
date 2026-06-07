#!/bin/bash
#
# Harvest nightly upgrade agent.
#
# Runs locally via crontab at 1AM (only fires if the Mac is awake — cron skips
# missed runs, which is exactly the "if it is open" behavior we want). Drives
# Claude Code headless to advance ONE pipeline item, then opens a PR for the
# maintainer to review in the morning. Never touches main, never deploys.
#
# Install (already done by setup, here for reference):
#   crontab -e  ->  0 1 * * * /Users/leslie/CC-Income-Analyzer/scripts/nightly-upgrade.sh >> ~/Library/Logs/harvest/nightly-upgrade.log 2>&1
#
# Manual test run (bypasses the 1-5AM window guard):
#   FORCE=1 /Users/leslie/CC-Income-Analyzer/scripts/nightly-upgrade.sh
#
# Tail logs:
#   tail -f ~/Library/Logs/harvest/nightly-upgrade.log

set -uo pipefail

REPO="/Users/leslie/CC-Income-Analyzer"
PROMPT_FILE="$REPO/scripts/nightly-upgrade.prompt.md"
LOG_DIR="$HOME/Library/Logs/harvest"
LOCK="$REPO/.git/nightly-upgrade.lock"
SUMMARY="/tmp/harvest-nightly-summary.md"
BASE_BRANCH="main"
MAX_RUNTIME=14400   # 4h watchdog -> a 1AM start can run until ~5AM, then gets killed
MAX_BUDGET_USD="${MAX_BUDGET_USD:-8}"   # cost ceiling per nightly run; tune to taste

# launchd/cron run with a minimal PATH; make claude, gh, git, node reachable.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== nightly-upgrade starting ==="

# --- Guard 1: only run inside the 1AM-5AM window (unless forced for testing) ---
HOUR=$(date +%H)
if [ "${FORCE:-0}" != "1" ]; then
  if [ "$HOUR" -lt 1 ] || [ "$HOUR" -ge 5 ]; then
    log "Outside 1AM-5AM window (hour=$HOUR). Skipping. Set FORCE=1 to override."
    exit 0
  fi
fi

# --- Guard 2: single instance ---
if [ -e "$LOCK" ]; then
  log "Lock file exists ($LOCK) — another run in progress or a crashed run. Skipping."
  exit 0
fi
trap 'rm -f "$LOCK"' EXIT
echo "$$" > "$LOCK"

cd "$REPO" || { log "Cannot cd to $REPO"; exit 1; }

# --- Guard 3: never clobber uncommitted local work ---
if [ -n "$(git status --porcelain)" ]; then
  log "Working tree is dirty — refusing to run so I don't clobber your WIP. Skipping."
  git status --short
  exit 0
fi

# --- Sync main (work happens directly on main; we push at the end) ---
STAMP=$(date +%Y%m%d-%H%M)
log "Checking out $BASE_BRANCH and pulling latest..."
git checkout "$BASE_BRANCH" >/dev/null 2>&1 || { log "Cannot checkout $BASE_BRANCH"; exit 1; }
git pull --ff-only origin "$BASE_BRANCH" 2>&1 | sed 's/^/  /' || log "Pull failed or no remote tracking — continuing on local $BASE_BRANCH."
log "Working directly on $BASE_BRANCH"

# --- Run Claude headless with a watchdog so it can't run past the window ---
rm -f "$SUMMARY"
PROMPT="$(cat "$PROMPT_FILE")"

( sleep "$MAX_RUNTIME"; log "Watchdog: ${MAX_RUNTIME}s elapsed, killing claude."; pkill -P $$ claude 2>/dev/null ) &
WATCHDOG=$!

log "Invoking claude (budget cap \$${MAX_BUDGET_USD})..."
claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --add-dir "$REPO" \
  --max-budget-usd "$MAX_BUDGET_USD" \
  2>&1 | sed 's/^/  [claude] /'
CLAUDE_RC=${PIPESTATUS[0]}

kill "$WATCHDOG" 2>/dev/null

log "claude exited with code $CLAUDE_RC"

# --- Push to main if the session produced commits ---
COMMITS=$(git rev-list --count "origin/$BASE_BRANCH..$BASE_BRANCH" 2>/dev/null || echo 0)
if [ "$COMMITS" -eq 0 ]; then
  log "No new commits on $BASE_BRANCH — nothing to push."
  log "=== nightly-upgrade done (no changes) ==="
  exit 0
fi

log "$COMMITS new commit(s) on $BASE_BRANCH this session:"
git log --format='  - %s' "origin/$BASE_BRANCH..$BASE_BRANCH" 2>/dev/null

log "Pushing $BASE_BRANCH to origin..."
if git push origin "$BASE_BRANCH" 2>&1 | sed 's/^/  /'; then
  log "=== nightly-upgrade done (pushed to $BASE_BRANCH) ==="
else
  log "Push failed (remote may have diverged). Commits remain on local $BASE_BRANCH for manual review."
  log "=== nightly-upgrade done (push FAILED, commits local) ==="
  exit 1
fi
