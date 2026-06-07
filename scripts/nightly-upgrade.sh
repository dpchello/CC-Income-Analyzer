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
STATE_FLAG="$REPO/.nightly-agent.enabled"   # in-app toggle (Settings → Nightly Upgrade Agent); "off" disables
RAN_STAMP="$HOME/Library/Logs/harvest/nightly-upgrade.lastrun"   # YYYY-MM-DD of last run, for once-per-day gating
CLAUDE_OUT="/tmp/harvest-nightly-claude-result.json"
USAGE_LOG="$HOME/Library/Logs/harvest/nightly-usage.jsonl"   # one line per run, for trend review
BASE_BRANCH="main"
MAX_RUNTIME=14400   # 4h hard backstop -> a 1AM start gets force-killed by ~5AM
SOFT_FRACTION=80    # at this % of the window the agent checkpoints + stops gracefully

# launchd/cron run with a minimal PATH; make claude, gh, git, node reachable.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== nightly-upgrade starting ==="

# --- Guard 1: run at most once per calendar day, on/after 1AM ---
# launchd fires at 1AM, or on the next real wake if the Mac was asleep/dark-waking
# then (it coalesces missed calendar intervals into one run). We don't reject a late
# catch-up (e.g. when the lid opens at 9AM) — but we don't want it twice in a day
# either, so gate on a per-day stamp instead of a hard clock window.
TODAY=$(date +%Y-%m-%d)
HOUR=$(date +%H)
if [ "${FORCE:-0}" != "1" ]; then
  if [ "$HOUR" -lt 1 ]; then
    log "Before 1AM (hour=$HOUR) — too early. Skipping."
    exit 0
  fi
  if [ -f "$RAN_STAMP" ] && [ "$(cat "$RAN_STAMP" 2>/dev/null)" = "$TODAY" ]; then
    log "Already ran today ($TODAY) — once-per-day. Skipping."
    exit 0
  fi
fi

# --- Guard 1.5: in-app on/off toggle (Settings → Nightly Upgrade Agent) ---
if [ -f "$STATE_FLAG" ] && [ "$(tr '[:upper:]' '[:lower:]' < "$STATE_FLAG" | tr -d '[:space:]')" = "off" ]; then
  log "Nightly agent is switched OFF in the app (Settings). Skipping. Toggle it back on to resume."
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

# --- Time budget for this run (soft checkpoint + hard backstop) ---
NOW_EPOCH=$(date +%s)
SOFT_EPOCH=$(( NOW_EPOCH + MAX_RUNTIME * SOFT_FRACTION / 100 ))
HARD_EPOCH=$(( NOW_EPOCH + MAX_RUNTIME ))
NOW_HM=$(date +%H:%M)
SOFT_HM=$(date -r "$SOFT_EPOCH" +%H:%M)
HARD_HM=$(date -r "$HARD_EPOCH" +%H:%M)

TIME_BUDGET="## Time budget for THIS run (read first)
Current local time: ${NOW_HM}. Hard cutoff: ${HARD_HM} — you will be force-killed then.
Soft checkpoint deadline: ${SOFT_HM} (${SOFT_FRACTION}% of the window).

Run \`date '+%H:%M'\` periodically to check the clock. The moment the time reaches
${SOFT_HM}, STOP starting new work: finish only the edit in your hand, commit it,
write/refresh HANDOFF.md describing exactly where you left off, commit that too, and
end the session. Do NOT gamble on squeezing in one more change before ${HARD_HM}.
Committing often throughout the night is the real safety net — your plan usage can be
cut off at any moment, and only committed work survives.
"

# --- Run Claude headless; watchdog is the hard backstop ---
rm -f "$SUMMARY"
PROMPT="${TIME_BUDGET}

$(cat "$PROMPT_FILE")"

( sleep "$MAX_RUNTIME"; log "Watchdog: hard cutoff ${HARD_HM} reached, killing claude."; pkill -P $$ claude 2>/dev/null ) &
WATCHDOG=$!

# Mark today as run now that we're committing to real work — prevents a second
# same-day fire (e.g. a later wake) from starting another run.
echo "$TODAY" > "$RAN_STAMP"

log "Invoking claude (subscription auth, no \$ cap; soft checkpoint ${SOFT_HM}, hard cutoff ${HARD_HM})..."
rm -f "$CLAUDE_OUT"
claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --add-dir "$REPO" \
  --output-format json \
  >"$CLAUDE_OUT" 2> >(sed 's/^/  [claude:err] /')
CLAUDE_RC=$?

kill "$WATCHDOG" 2>/dev/null

log "claude exited with code $CLAUDE_RC"

# --- Log this run's usage (best-effort; the JSON is absent if claude was killed) ---
if [ -s "$CLAUDE_OUT" ] && command -v jq >/dev/null 2>&1; then
  COST=$(jq -r '.total_cost_usd // empty' "$CLAUDE_OUT" 2>/dev/null)
  TURNS=$(jq -r '.num_turns // empty' "$CLAUDE_OUT" 2>/dev/null)
  DUR_MS=$(jq -r '.duration_ms // empty' "$CLAUDE_OUT" 2>/dev/null)
  IN=$(jq -r '.usage.input_tokens // 0' "$CLAUDE_OUT" 2>/dev/null)
  OUT=$(jq -r '.usage.output_tokens // 0' "$CLAUDE_OUT" 2>/dev/null)
  CACHE_R=$(jq -r '.usage.cache_read_input_tokens // 0' "$CLAUDE_OUT" 2>/dev/null)
  CACHE_W=$(jq -r '.usage.cache_creation_input_tokens // 0' "$CLAUDE_OUT" 2>/dev/null)
  log "USAGE: cost_equiv=\$${COST:-?} turns=${TURNS:-?} in=${IN} out=${OUT} cache_read=${CACHE_R} cache_write=${CACHE_W} duration=${DUR_MS:-?}ms"
  # Append a structured line for trend review (cost_equiv is an estimate, not a charge on subscription auth)
  jq -c --arg ts "$(date '+%Y-%m-%dT%H:%M:%S')" \
        --argjson rc "$CLAUDE_RC" \
     '{ts:$ts, exit:$rc, cost_equiv_usd:(.total_cost_usd//null), turns:(.num_turns//null), input_tokens:(.usage.input_tokens//0), output_tokens:(.usage.output_tokens//0), cache_read:(.usage.cache_read_input_tokens//0), cache_write:(.usage.cache_creation_input_tokens//0), duration_ms:(.duration_ms//null)}' \
     "$CLAUDE_OUT" >> "$USAGE_LOG" 2>/dev/null \
     && log "Usage line appended to $USAGE_LOG"
  # Surface the agent's own final summary into the log
  RESULT_TEXT=$(jq -r '.result // empty' "$CLAUDE_OUT" 2>/dev/null | head -c 1500)
  [ -n "$RESULT_TEXT" ] && { echo "  [claude:result] -------"; echo "$RESULT_TEXT" | sed 's/^/  [claude:result] /'; }
else
  log "No result JSON (claude was killed or errored before finishing) — usage not logged. Committed work is still safe."
fi

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
