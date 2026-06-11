#!/bin/bash
#
# Harvest nightly pre-commit sweep.
#
# Runs ~11PM, two hours before the 1AM nightly-upgrade agent. Its only job is to
# make sure the working tree is CLEAN before the agent wakes up: the agent refuses
# to run on a dirty tree (Guard 3 in nightly-upgrade.sh) so it doesn't clobber WIP.
# Any uncommitted edits left over from the day's session would otherwise skip the
# whole nightly run. This script commits (and pushes) that WIP so the agent always
# finds a clean tree.
#
# Pairs with: scripts/nightly-upgrade.sh (the 1AM agent).
# Shares the same on/off toggle (.nightly-agent.enabled) and the same log dir.
#
# Install (see deploy/com.harvest.nightly-precommit.plist):
#   cp deploy/com.harvest.nightly-precommit.plist ~/Library/LaunchAgents/
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.harvest.nightly-precommit.plist
#
# Manual test run:
#   /Users/leslie/CC-Income-Analyzer/scripts/nightly-precommit.sh
#
# Tail logs:
#   tail -f ~/Library/Logs/harvest/nightly-precommit.log

set -uo pipefail

REPO="/Users/leslie/CC-Income-Analyzer"
LOG_DIR="$HOME/Library/Logs/harvest"
LOCK="$REPO/.git/nightly-precommit.lock"
STATE_FLAG="$REPO/.nightly-agent.enabled"   # shared in-app toggle; "off" disables all nightly automation
BASE_BRANCH="main"

# launchd runs with a minimal PATH; make git (and friends) reachable.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== nightly-precommit starting ==="

# --- Guard 1: shared in-app on/off toggle (Settings -> Nightly Upgrade Agent) ---
# If the user switched nightly automation off, don't auto-commit their WIP either.
if [ -f "$STATE_FLAG" ] && [ "$(tr '[:upper:]' '[:lower:]' < "$STATE_FLAG" | tr -d '[:space:]')" = "off" ]; then
  log "Nightly agent is switched OFF in the app (Settings). Skipping pre-commit. Toggle it back on to resume."
  exit 0
fi

# --- Guard 2: single instance ---
if [ -e "$LOCK" ]; then
  log "Lock file exists ($LOCK) — another run in progress or a crashed run. Skipping."
  exit 0
fi
trap 'rm -f "$LOCK"' EXIT
echo "$$" > "$LOCK"

cd "$REPO" || { log "Cannot cd to $REPO"; exit 1; }

git checkout "$BASE_BRANCH" >/dev/null 2>&1 || { log "Cannot checkout $BASE_BRANCH"; exit 1; }

# --- Nothing to do if the tree is already clean ---
if [ -z "$(git status --porcelain)" ]; then
  log "Working tree already clean — nothing to commit. The 1AM agent is unblocked."
  log "=== nightly-precommit done (no changes) ==="
  exit 0
fi

# --- Commit everything (tracked + untracked) so the agent finds a clean tree ---
log "Working tree is dirty — sweeping WIP into a commit so the 1AM agent isn't blocked:"
git status --short | sed 's/^/  /'

FILE_COUNT=$(git status --porcelain | wc -l | tr -d ' ')
git add -A || { log "git add failed."; exit 1; }

COMMIT_MSG="chore(nightly): auto-commit WIP before nightly agent run

Swept ${FILE_COUNT} uncommitted path(s) at $(date '+%Y-%m-%d %H:%M') so the 1AM
nightly-upgrade agent finds a clean tree (it skips on a dirty tree). Created by
scripts/nightly-precommit.sh.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

if git commit -m "$COMMIT_MSG" 2>&1 | sed 's/^/  /'; then
  log "Committed WIP on $BASE_BRANCH."
else
  log "git commit failed — leaving tree as-is."
  exit 1
fi

# --- Push to origin (best-effort; commit already stands locally) ---
log "Pushing $BASE_BRANCH to origin..."
if git push origin "$BASE_BRANCH" 2>&1 | sed 's/^/  /'; then
  log "=== nightly-precommit done (committed + pushed) ==="
else
  log "Push failed (remote may have diverged). Commit remains on local $BASE_BRANCH; the 1AM agent will retry the push."
  log "=== nightly-precommit done (committed, push FAILED) ==="
  exit 1
fi
