"""
Resend email wrapper.

Reads RESEND_API_KEY from .env. Silently no-ops with a warning if the key
isn't set, so cron jobs don't crash before the user has wired up the vendor.

Usage:
    from notifier import send_email
    send_email(subject="...", to="x@y.com", text="...", html="...")
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

_API_URL  = "https://api.resend.com/emails"
_API_KEY  = os.getenv("RESEND_API_KEY", "")
_FROM     = os.getenv("RESEND_FROM", "Harvest Autobot <onboarding@resend.dev>")


def send_email(
    subject: str,
    to: str,
    text: str,
    html: Optional[str] = None,
) -> dict:
    """POST to Resend's /emails endpoint. Returns the parsed JSON response,
    or {'error': '...'} on failure. Never raises — callers (cron, scripts)
    don't need a backstop."""
    if not _API_KEY:
        print("[notifier] RESEND_API_KEY not set — skipping send.", file=sys.stderr)
        return {"error": "no_api_key"}

    payload = {
        "from":    _FROM,
        "to":      [to],
        "subject": subject,
        "text":    text,
    }
    if html:
        payload["html"] = html

    req = urllib.request.Request(
        _API_URL,
        data    = json.dumps(payload).encode("utf-8"),
        headers = {
            "Authorization": f"Bearer {_API_KEY}",
            "Content-Type":  "application/json",
            # Cloudflare in front of Resend blocks the default Python-urllib UA
            # with "error code: 1010". Send a real-looking UA.
            "User-Agent":    "Harvest-Autobot/1.0 (+https://harvest.app)",
            "Accept":        "application/json",
        },
        method  = "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[notifier] Resend HTTP {e.code}: {body}", file=sys.stderr)
        return {"error": f"http_{e.code}", "body": body}
    except Exception as e:
        print(f"[notifier] Resend error: {e}", file=sys.stderr)
        return {"error": str(e)}
