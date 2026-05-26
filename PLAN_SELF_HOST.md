# PLAN — Self-Host Harvest on This Mac

**Date:** 2026-05-22
**Goal:** Run Harvest (FastAPI + React + marketing site) on this Mac, reachable from anywhere via a custom domain, with reasonable security and a good user experience. Target cost: domain only (~$10/yr).

---

## 1. The shape of the solution

```
  Public users
       │
       ▼
   yourdomain.com    ◄── Cloudflare DNS + WAF + TLS termination
       │
       ▼
  Cloudflare Tunnel  ◄── outbound-only connection from your Mac
       │             (no port forwarding, no exposed home IP)
       ▼
  cloudflared (on Mac, runs as launchd service)
       │
       ▼
  Caddy on 127.0.0.1:443  ◄── local reverse proxy, routes:
       │                       app.yourdomain.com  → :8000 (FastAPI)
       │                       yourdomain.com      → :3001 (marketing)
       ▼
  FastAPI (uvicorn) :8000  +  Marketing (Node) :3001
       │
       ▼
  harvest.db (SQLite, local) — backed up nightly
```

**Why this shape:**
- **Cloudflare Tunnel** beats port-forwarding for residential ISPs: no exposed home IP, no router config, works behind CGNAT, free TLS, free DDoS protection, free WAF. Most home ISPs block inbound 80/443 or forbid servers in TOS — the tunnel sidesteps both.
- **Caddy** in front of FastAPI lets you cleanly split `app.` vs marketing root and add headers/rate-limit later without touching app code. Optional — you can also point the tunnel directly at uvicorn if you want fewer moving parts.
- **launchd** is the macOS-native way to keep services running through crashes, logouts, and reboots.

---

## 2. Pre-flight — fix BEFORE going public

These are non-negotiable. Each one is a real exposure if skipped.

| # | Item | File | Why |
|---|------|------|-----|
| P1 | Set a real `JWT_SECRET_KEY` (32+ random bytes) in a `.env` file, never commit | [backend/auth.py:17](backend/auth.py#L17) | Current fallback is a known dev string — anyone who reads the repo can forge any user's session |
| P2 | ~~Tighten CORS~~ — **done.** Now reads `ALLOWED_ORIGINS` env var; defaults to localhost dev ports only | [backend/main.py:31](backend/main.py#L31) | Wildcard + credentials would be exploitable; even without creds it broadcasts your API to any origin |
| P3 | ~~Audit endpoints~~ — **audit done 2026-05-25, findings in §15.** 4 critical + 5 should-fix. Fixes themselves still pending. | [backend/main.py](backend/main.py) | Easy to miss one when you've been moving fast |
| P4 | ~~Move ALL secrets to `.env`~~ — **done.** Sweep on 2026-05-25 found no hardcoded secrets in tree | grep for `os.getenv` to inventory | Secrets in code = secrets in git history |
| P5 | ~~Decide DB story~~ — **decided 2026-05-25:** already fully on Supabase. Removed dead SQLite-era files in `5c96fa9`-follow-up | [backend/db.py](backend/db.py) | App raises at import time if Supabase env vars are missing; SQLite layer is gone |
| P6 | ~~Rate limiting~~ — **done.** slowapi wired via [backend/rate_limit.py](backend/rate_limit.py). 5/min on /auth/signup, /auth/login; 10/min on /api/feedback; 5/min on /api/waitlist | [backend/auth.py](backend/auth.py), [backend/main.py](backend/main.py) | Brute-force protection. 5 attempts per minute per IP is plenty |
| P7 | ~~Confirm bcrypt cost factor ≥ 12~~ — **done.** Explicit constant `_BCRYPT_ROUNDS = 12` in [backend/auth.py](backend/auth.py) | [backend/auth.py](backend/auth.py) | Standard hardening |
| P8 | ~~`.gitignore` audit~~ — **done.** Rewrote to cover `.env.*`, `*.db*`, `.DS_Store`, `*.swp`, keys/certs, log dirs | `.gitignore` | DB files contain user data |
| P9 | ~~Sync `.env.example` with `.env`~~ — **done in `5c96fa9`** (also removed leaked real secrets, see §2.1) | [backend/.env.example](backend/.env.example) | Stale example breaks future setup; also a tell that env hygiene has slipped |
| P10 | **Rotate 4 leaked secrets BEFORE first `git push`** (see §2.1) | external dashboards | `bf9e436` leaks real values into git history — push without rotating = public exposure |

Estimated time: **2–3 hours.** Do not skip.

### 2.1 Env file hygiene

**Current state (verified 2026-05-22):**
- [backend/.env](backend/.env) — real secrets, gitignored, not tracked ✓
- [backend/.env.example](backend/.env.example) — template, tracked in git ✓
- `.gitignore` already excludes `.env` at root and `backend/.env` ✓

**Keep both files.** They serve different purposes:
- `.env` = your actual secrets, never committed
- `.env.example` = self-documenting list of what env vars are required to run the app. Without it, future-you on a new Mac has to grep every `os.getenv()` call to figure out what's needed.

**Drift to fix:** `.env` has `RESEND_API_KEY` but `.env.example` doesn't list it. Add the missing key (empty value) to `.env.example`:

```
RESEND_API_KEY=
```

**Going forward — keep them in sync:**
1. Whenever you add a new `os.getenv("FOO")` to the code, add `FOO=` to `.env.example` in the same commit.
2. Periodically sanity-check with:
   ```bash
   diff <(grep -oE '^[A-Z_]+' backend/.env | sort -u) \
        <(grep -oE '^[A-Z_]+' backend/.env.example | sort -u)
   ```
   Empty diff = in sync.
3. Never put real values in `.env.example` — only the key names with empty `=`.
4. Before going public, double-check `git log --all -- backend/.env` returns nothing. If `.env` was ever accidentally committed, the secret in it must be considered compromised — rotate it.

**Audit ALL `os.getenv()` callsites to find any secret not in either file:**
```bash
grep -rn "os.getenv\|os.environ" backend/ --include='*.py'
```
Any key found there that isn't in `.env.example` is either dead code or a missing template entry.

### 2.2 Secret leak status (as of 2026-05-23)

**What happened:** Commit `bf9e436` (recommendations tab) accidentally committed `backend/.env.example` with real production values for 5 keys: `SUPABASE_SERVICE_KEY`, `SUPABASE_URL`, `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `ALPHAVANTAGE_API_KEY`.

**Containment:** `bf9e436` is local-only — never pushed to `github.com/dpchello/CC-Income-Analyzer`. Verified via `git ls-remote` and 404 from the raw GitHub URL.

**Fix applied:** Commit `5c96fa9` (on top of `bf9e436`) sanitizes `.env.example` to empty placeholders. **HEAD is clean.** History is not — `bf9e436` still contains the secrets in local git.

**Decision (2026-05-23):** ~~Do NOT rewrite history. Accept that `bf9e436` will exist in the public repo's git log once pushed, but make it harmless by rotating the keys first.~~

**Decision reversed (2026-05-25):** Rotation as the sole damage-control isn't viable for these specific keys — Supabase legacy `service_role` isn't self-service rotatable, SnapTrade free tier limits to 1 key, Alpha Vantage free tier limits to 1 key. New plan: **scrub the local history with `git filter-repo`** so the secrets never reach GitHub at all. Repo is kept private as defense in depth.

**Status (2026-05-25):**
- [x] JWT_SECRET_KEY regenerated locally (48-byte token_urlsafe); backend reloaded
- [x] `git filter-repo --replace-text` run; verified 0 occurrences of any leaked literal across all of history; `REDACTED-*` markers in their place
- [x] All commit hashes from `bf9e436` forward rewritten — `bf9e436` no longer exists; equivalent content lives at a different SHA with redacted blob
- [x] Repo kept private on GitHub
- [x] Pre-commit hooks with `detect-secrets` (so this can't happen again)
- [ ] (Defense in depth, optional) Supabase new revocable-secret-key migration when feasible
- [ ] (Defense in depth, optional) SnapTrade in-place rotation if/when dashboard exposes it

**Residual risk acknowledged:** The Alpha Vantage key remains valid in the wild on this Mac's `.env` — but Alpha Vantage's worst-case is "someone exhausts your 25 free calls/day," not data loss. Acceptable.

---

## 3. Domain & registrar

**Recommendation: Cloudflare Registrar.** At-cost pricing (no markup, ~$9.77/yr for `.com`), free WHOIS privacy, native integration with the tunnel and DNS you'll already be using. Alternative: Porkbun (similar pricing, equally good).

**Avoid:** GoDaddy and Network Solutions — markup and upsell pressure.

**Name suggestions** to brainstorm before buying (Harvest-aligned, not generic "trader" jargon):
- `harvestcc.app` — `.app` forces HTTPS at the TLD level
- `harvest.farm` — leans into the metaphor
- `gatherharvest.com`
- `harvestoptions.com`
- Check availability via `whois` or the Cloudflare registrar search

**DNS records you'll create** (Cloudflare does this automatically when you create the tunnel route):
- `yourdomain.com` → tunnel (marketing)
- `app.yourdomain.com` → tunnel (app)
- `www.yourdomain.com` → CNAME to apex

---

## 4. Cloudflare Tunnel setup

```bash
# 1. Install
brew install cloudflared

# 2. Authenticate (opens browser)
cloudflared tunnel login

# 3. Create a named tunnel
cloudflared tunnel create harvest

# 4. Write ~/.cloudflared/config.yml:
#    tunnel: <tunnel-id>
#    credentials-file: /Users/leslie/.cloudflared/<tunnel-id>.json
#    ingress:
#      - hostname: app.yourdomain.com
#        service: http://localhost:8000
#      - hostname: yourdomain.com
#        service: http://localhost:3001
#      - service: http_status:404

# 5. Route DNS
cloudflared tunnel route dns harvest app.yourdomain.com
cloudflared tunnel route dns harvest yourdomain.com

# 6. Install as launchd service so it auto-starts
sudo cloudflared service install
```

After this, the tunnel runs as a system service. No router/firewall changes needed. TLS is handled by Cloudflare; your origin can be plain HTTP on localhost.

---

## 5. Build the frontend & serve it

You have two options. **Option A is simpler** — FastAPI already imports `StaticFiles`, so it can serve the React build itself, eliminating the marketing/app split at the proxy.

**Option A (recommended for v1):** single-origin
- `cd frontend && npm run build` produces `frontend/dist/`
- FastAPI serves `frontend/dist/` at `/` and `/api/*` for the API
- Marketing site lives at apex; app behind login at `/app`
- Tunnel routes everything to `:8000`

**Option B:** split origins (marketing on apex, app on `app.` subdomain)
- More moving parts, only worth it if marketing site needs its own dev cadence
- Skip until v2

---

## 6. Process supervision — launchd

**Templates generated 2026-05-25** in [deploy/](deploy/):
- [deploy/com.harvest.backend.plist](deploy/com.harvest.backend.plist) — FastAPI uvicorn on 127.0.0.1:8000
- [deploy/com.harvest.marketing.plist](deploy/com.harvest.marketing.plist) — Next.js marketing on 127.0.0.1:3001 (skip for Option A)
- [deploy/cloudflared-config.yml](deploy/cloudflared-config.yml) — tunnel ingress template (replace `<TUNNEL_ID>` + your domain)
- [deploy/README.md](deploy/README.md) — full installation runbook with verify steps and upgrade procedure

Key design choices:
- App loads secrets from `backend/.env` via python-dotenv — no env vars in the plist itself (keeps secrets out of `~/Library/LaunchAgents/`).
- Bind to `127.0.0.1`, not `0.0.0.0`. Cloudflare Tunnel connects locally; nothing should listen on a public interface.
- `KeepAlive` is conditional: restarts on crash, not on clean exits. So a deliberate `kill` during upgrades doesn't fight you.
- `ThrottleInterval: 10` to avoid crash-restart-loops eating CPU.

`cloudflared` registers itself as a launchd service via its own installer (`sudo cloudflared service install`) — no manual plist needed for that one.

---

## 7. Mac stays awake & online

System Settings → Battery / Energy:
- **Prevent automatic sleep when display is off:** ON (only when plugged in)
- **Wake for network access:** ON
- **Start up automatically after power failure:** ON (in `pmset` — `sudo pmset -a autorestart 1`)
- Disable automatic macOS updates that reboot without consent — set to "Download but ask before installing"
- Plug into ethernet if possible; Wi-Fi sleep behavior on macOS is flaky

Backup power: a $60 small UPS (CyberPower CP685AVR or similar) gives you 10–15 minutes to ride out brownouts. Optional but cheap insurance.

---

## 8. Security hardening checklist

Beyond pre-flight (§2):

- [ ] **Cloudflare Access** on `app.yourdomain.com/admin/*` if you have admin endpoints — free email-OTP gate, no app changes needed
- [ ] **Cloudflare WAF rules** — block known bad ASNs, rate-limit `/auth/*` at the edge (free tier supports basic rules)
- [ ] **HSTS, CSP, X-Content-Type-Options** headers — add in Caddy or FastAPI middleware
- [ ] **macOS firewall:** System Settings → Network → Firewall ON, "Block all incoming" except cloudflared (or just leave incoming blocked since the tunnel is outbound-only)
- [ ] **Disable SSH/Remote Login** unless you actively need it (`sudo systemsetup -setremotelogin off`)
- [ ] **FileVault ON** — disk encryption protects user data if the Mac is ever stolen
- [ ] **Login items audit** — `System Settings → General → Login Items` should be deliberate
- [ ] Set `JWT` token expiry sensibly (review [backend/auth.py:70](backend/auth.py#L70))
- [ ] **Dependency scan:** `pip-audit` for Python, `npm audit` for frontend, run monthly
- [ ] **Don't put your home address in WHOIS** — Cloudflare Registrar privacy is free and on by default

---

## 9. Backups

**Mostly handled by Supabase.** Verified 2026-05-25 that the DB layer is fully on Supabase ([backend/db.py](backend/db.py)) — no SQLite, no per-user JSON, no state-of-record on the Mac. The Mac is stateless from a data perspective: a crash, disk failure, or theft causes downtime, never data loss.

**What Supabase handles automatically:**
- Free tier: daily logical backups, 7-day retention
- Pro tier ($25/mo): Point-in-Time Recovery (5-min granularity), 7-day retention
- Either way: no cron job needed on your Mac

**What you should still back up locally:**

These files live on the Mac and would be annoying (not catastrophic) to lose:

| Path | What it is | Why back up |
|---|---|---|
| `backend/.env` | Real secrets | Painful to regenerate all of them |
| `backend/data/*.parquet` | DuckDB research data | Re-fetchable from APIs but slow |
| `backend/users/<uuid>/` | Per-user state (SnapTrade etc.) | Check if this should live in Supabase instead — open question |
| `~/.cloudflared/*.json` | Tunnel credentials | Easy to regenerate, but disruptive |

```bash
# Nightly launchd timer — encrypted local snapshot of just the irreplaceable bits
mkdir -p ~/HarvestBackups
tar -czf ~/HarvestBackups/harvest-state-$(date +%Y%m%d).tar.gz \
  -C /Users/leslie/CC-Income-Analyzer \
  backend/.env backend/users backend/data
# Optional: encrypt with age or gpg before syncing offsite
find ~/HarvestBackups -name 'harvest-state-*.tar.gz' -mtime +14 -delete
```

Then sync `~/HarvestBackups` to iCloud Drive (free, native) or Backblaze B2 (~$0.005/GB/mo).

~~**One thing to verify:** `backend/users/<uuid>/` directories suggest per-user file storage. If those hold anything that should outlive a Mac wipe (SnapTrade tokens, exports, etc.), they should arguably move to Supabase Storage. Flag this as an open question; not blocking for v1 launch but worth a 30-min audit before paying customers exist.~~

**Resolved 2026-05-25:** `backend/users/` was dead state — leftover from the pre-Supabase era. Contained one `portfolios.json` for one user UUID, only referenced by the historical migration script ([backend/migrations/002_migrate.py](backend/migrations/002_migrate.py)) which reads it AS INPUT. No runtime code writes to that directory. Deleted. No backup needed; this data already lives in Supabase.

---

## 10. Monitoring

Free tier is enough for v1:
- **UptimeRobot** — pings `app.yourdomain.com/api/signals` every 5 minutes, emails you if down (5-min granularity, 50 monitors free)
- **Cloudflare Analytics** — free, shows traffic, threats blocked, cache hit rate
- **Local logs** — tail `~/Library/Logs/harvest/backend.log` for app errors. Consider `logrotate` if it grows
- **Sentry free tier** (5k events/mo) if you want JS error tracking from the React app

---

## 11. Cost summary

| Item | Cost |
|---|---|
| Domain (Cloudflare Registrar, `.com`) | ~$10/yr |
| Cloudflare Tunnel + DNS + WAF + TLS | $0 |
| UptimeRobot | $0 |
| Backblaze B2 backups | <$1/yr at this scale |
| UPS (one-time, optional) | $60 |
| Electricity (Mac mini-ish power draw 24/7) | ~$5–15/mo depending on hardware |
| **Recurring total** | **~$10/yr + electricity** |

---

## 12. Honest risks (read before committing)

1. **Reliability ceiling is ~95–98%, not 99.9%.** ISP outages, macOS updates, power blips, you-bumping-the-power-cord — all count as downtime. Fine for a beta with friendly users; not fine for paying customers expecting SaaS reliability.
2. **You are the entire ops team.** If something breaks at 3am while you're traveling, the app is down until you fix it. Cloud hosting hides this.
3. **ISP TOS.** Comcast, Spectrum, etc. technically prohibit "running servers" on residential plans. Cloudflare Tunnel makes detection unlikely (outbound only), but it's not zero-risk. If your ISP is Sonic, Ting, or a small fiber ISP, you're probably fine.
4. **Single point of failure: this Mac.** Disk failure = catastrophic. Backups (§9) are mandatory, not optional.
5. **Migration path is easy if you outgrow this.** FastAPI + SQLite/Postgres ports cleanly to Railway/Fly when revenue justifies it. Your `railway.json` is already there.

**My honest take:** Self-hosting is a great choice for the next 3–6 months while you have <100 users, want $0 infra cost, and are still iterating fast. Plan to move to Railway/Fly the day you take the first paying customer who'd be annoyed by a 6-hour outage.

---

## 13. Execution order (when you're ready)

1. **Pre-flight fixes** (§2) — JWT secret, CORS, secrets, rate limiting. ~2–3 hrs.
2. **Buy domain** at Cloudflare Registrar. ~10 min.
3. **Build frontend** (`npm run build`), wire FastAPI to serve `dist/`. ~30 min.
4. **Install + configure cloudflared**, create tunnel, route DNS (§4). ~30 min.
5. **Smoke test** — visit your domain over public internet from your phone on cellular. Confirm TLS, login flow, write ops.
6. **launchd services** for `cloudflared` (auto via installer) and `uvicorn`. ~30 min.
7. **Power & wake settings** (§7). ~10 min.
8. **Backups cron** (§9). ~15 min.
9. **UptimeRobot monitor** (§10). ~5 min.
10. **Hardening pass** (§8 checklist). ~1 hr.

**Total green-field time: ~6 hours of focused work**, spread across 2 sessions.

---

## 15. P3 audit — auth gaps in backend/main.py (2026-05-25)

Audited all 72 routes. 26 mutating, 46 GET. Findings ranked by impact.

### 🔴 Critical — real vulnerabilities, fix before any public exposure

| Route | Line | Status | Why it mattered |
|---|---|---|---|
| `POST /api/macro/events` | L1963 | ✅ Fixed 2026-05-25 — gated behind `get_current_user` | Anyone can add events to the **global** macro calendar that every user sees. Spam/defacement risk. |
| `DELETE /api/macro/events` | L1975 | ✅ Fixed 2026-05-25 — gated behind `get_current_user` | Anyone can delete any event from the global calendar by passing its date + description. |
| `PUT /api/feedback/config` | L2032 | ✅ Fixed 2026-05-25 — gated behind `get_current_user` | Anyone can overwrite the **shared** `config.json` — SMTP credentials, SMS webhook URL, notification settings. Attacker can redirect notifications to themselves or inject malicious SMTP config. |
| `POST /api/snaptrade/webhook` | L2523 | ✅ Fixed 2026-05-25 — verifies `webhookSecret` field against `SNAPTRADE_WEBHOOK_SECRET` env via `hmac.compare_digest`; fail-closed if env unset | **No signature verification.** Attacker posts `{"type":"CONNECTION_BROKEN","userId":"<victim-uuid>"}` and the backend disables that user's brokerage connection. DoS against legit users' SnapTrade integration. |

### 🟡 Should fix — defense in depth

| Route | Line | Concern |
|---|---|---|
| `POST /api/feedback` | [L1998](backend/main.py#L1998) | Anonymous by intent? No rate limit — attacker can flood the feedback log. |
| `GET /api/feedback` | [L2009](backend/main.py#L2009) | Returns the global feedback log to anyone. If it contains user emails or sensitive position data, that's a leak. |
| `GET /api/feedback/config` | [L2013](backend/main.py#L2013) | Exposes feedback config (email, phone, sms webhook URL, smtp_host/port/user) anonymously. Not catastrophic; unnecessary. |
| `POST /api/waitlist` | [L2605](backend/main.py#L2605) | Public signup by intent. Needs rate limiting (P6) to prevent flood. |
| 5 routes using `get_current_user` but not `check_write_access` | L1454, L2181, L2324, L2372, L2419 | Won't be blocked by the freemium profit gate. Mostly `/api/admin/*` and `/api/snaptrade/*` mutations. |

### 🟢 Informational — intentional, no action

17 GET routes have no auth dep. Spot-checked the suspicious ones; all return public market data: `/api/dashboard`, `/api/signals` (wait, this DOES have auth), `/api/options/*`, `/api/iv-rank`, `/api/dividends`, `/api/history/spy`, `/api/alpha/*`, `/api/macro`, `/api/strategies`, plus the SPA catch-all `/{full_path:path}`. Intentional and fine.

### Architectural smell to fix post-launch, not in pre-flight

The `/api/feedback/config` endpoint reads/writes a **shared** `config.json` file on disk. This is single-tenant thinking — in a multi-user app, feedback config (especially SMTP creds) should be per-user in Supabase, or moved entirely out of user-configurable scope and into env vars. Not blocking launch, but flag for cleanup.

### Recommended fix order

1. Add `Depends(get_current_user)` to all 4 critical routes — but `POST /api/snaptrade/webhook` needs HMAC verification instead (it's called by SnapTrade, not by users).
2. Rate-limit `POST /api/feedback` and `POST /api/waitlist` with slowapi (P6 covers this).
3. Either auth-gate or stop exposing `GET /api/feedback/config` to anonymous clients.
4. Switch the 5 mutating routes from `get_current_user` to `check_write_access` if you want them subject to the freemium gate.

---

## 14. Open questions before we execute

- Domain name choice — see §3 for candidates. Pick one before step 2.
- DB story — confirm: stay on SQLite, or finish Supabase migration first? (Memory says Supabase was approved 2026-04-21 but code still uses SQLite.)
- Single-origin vs. split-origin serving (§5 Option A vs B) — recommend A.
- Are there admin endpoints that should sit behind Cloudflare Access?
