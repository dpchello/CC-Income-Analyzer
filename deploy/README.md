# deploy/ — Harvest self-host artifacts

Files for running Harvest on this Mac in production. See `PLAN_SELF_HOST.md` for the full plan; this directory holds the actual config artifacts.

## Files

| File | Purpose | Edits required before use |
|---|---|---|
| `com.harvest.backend.plist` | launchd job for FastAPI on `127.0.0.1:8000` | None if user is `leslie` and path is `/Users/leslie/CC-Income-Analyzer` |
| `com.harvest.marketing.plist` | launchd job for Next.js marketing on `127.0.0.1:3001` (only if §5 Option B) | None, same assumptions |
| `cloudflared-config.yml` | Cloudflare Tunnel ingress template | Replace `<TUNNEL_ID>` (×2) and `harvestoptions.net` if your domain differs |

## Installation order

Do these in sequence; later steps depend on earlier ones.

### 0. Prerequisites (one-time)

```bash
# Logs dir for launchd stdout/stderr capture
mkdir -p ~/Library/Logs/harvest

# Real .env values in place (P10 rotation done — see PLAN_SELF_HOST.md §2.2)
test -f backend/.env || cp backend/.env.example backend/.env  # then fill it in

# Frontend built so FastAPI can serve it
cd frontend && npm install && npm run build && cd ..

# (Option B only) marketing site built
cd marketing && npm install && npm run build && cd ..
```

### 1. Install Cloudflare daemon + create tunnel

```bash
brew install cloudflared
cloudflared tunnel login                # opens browser
cloudflared tunnel create harvest       # note the TUNNEL_ID it prints
```

### 2. Wire the tunnel config

Edit `deploy/cloudflared-config.yml` — replace `<TUNNEL_ID>` (two places) with the ID from step 1. Replace `harvestoptions.net` if your domain is different.

```bash
mkdir -p ~/.cloudflared
cp deploy/cloudflared-config.yml ~/.cloudflared/config.yml

# Wire DNS — this creates the CNAMEs in Cloudflare automatically
cloudflared tunnel route dns harvest harvestoptions.net
cloudflared tunnel route dns harvest www.harvestoptions.net
cloudflared tunnel route dns harvest app.harvestoptions.net
```

### 3. Install launchd jobs

```bash
cp deploy/com.harvest.backend.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.harvest.backend.plist

# Option B only:
cp deploy/com.harvest.marketing.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.harvest.marketing.plist

# Cloudflared has its own installer that handles launchd registration:
sudo cloudflared service install
```

### 4. Verify the stack

```bash
# Processes running?
launchctl list | grep -E 'harvest|cloudflared'

# Backend reachable on loopback?
curl http://127.0.0.1:8000/api/dashboard

# Marketing reachable on loopback? (Option B)
curl -I http://127.0.0.1:3001

# Tunnel up?
cloudflared tunnel info harvest

# Public reachable? (Disable Wi-Fi → use cellular → run from phone or another
# network to actually test the public path)
curl -I https://app.harvestoptions.net
```

### 5. Mac stays awake

```bash
sudo pmset -a autorestart 1     # restart after power loss
sudo pmset -c sleep 0            # never sleep when on AC power
sudo pmset -c womp 1             # wake on network access
caffeinate -dimsu &              # belt + suspenders (or use the GUI app Amphetamine)
```

GUI equivalents:
- System Settings → Battery → Options → "Prevent automatic sleep when display is off" ON
- System Settings → General → Login Items → confirm only what you want runs at login

## Upgrade procedure

When you ship new code:

```bash
git pull
cd frontend && npm install && npm run build && cd ..
launchctl unload ~/Library/LaunchAgents/com.harvest.backend.plist
launchctl load ~/Library/LaunchAgents/com.harvest.backend.plist

# For marketing changes:
cd marketing && npm install && npm run build && cd ..
launchctl unload ~/Library/LaunchAgents/com.harvest.marketing.plist
launchctl load ~/Library/LaunchAgents/com.harvest.marketing.plist
```

No tunnel restart needed unless you edit `~/.cloudflared/config.yml`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `launchctl list` shows status `78` for backend | Python or dep missing | `tail ~/Library/Logs/harvest/backend.err.log` — usually a missing pip install |
| 502 from `https://app.harvestoptions.net` | Backend not running, or wrong port in `config.yml` | `curl http://127.0.0.1:8000/api/dashboard` to confirm origin is alive |
| Tunnel "DOWN" in `cloudflared tunnel info` | Daemon crashed or network blip | `launchctl kickstart -k system/com.cloudflare.cloudflared` |
| `curl` from same Mac works, but phone on cellular gets timeout | DNS not propagated | Wait 60s, or check Cloudflare dashboard → DNS for the records |
| Process keeps restarting in a loop | `ThrottleInterval` is 10s — keep tailing logs to see why | `tail -f ~/Library/Logs/harvest/backend.err.log` |
| Marketing site links to `localhost:5173` instead of `app.harvestoptions.net` | `NEXT_PUBLIC_*` vars are **baked in at build time**, not read at runtime. Editing `marketing/.env.local` does nothing until you rebuild. | `cd marketing && npm run build && launchctl unload ~/Library/LaunchAgents/com.harvest.marketing.plist && launchctl load ~/Library/LaunchAgents/com.harvest.marketing.plist` |
| `sudo cloudflared service install` installed plist but daemon does nothing | Some cloudflared versions install a plist whose `ProgramArguments` is just `cloudflared` with no `tunnel run` subcommand. | Replace `/Library/LaunchDaemons/com.cloudflare.cloudflared.plist` with one whose `ProgramArguments` is `cloudflared tunnel --config /Users/<you>/.cloudflared/config.yml --no-autoupdate run`, then `sudo launchctl bootout system <plist>; sudo launchctl bootstrap system <plist>` |
