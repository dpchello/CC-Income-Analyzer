"""
Feedback Logger — stores user feedback on action card recommendations.

Each entry captures the position context, chosen feedback option, optional
free text, and notification delivery metadata. Optionally fires email or
SMS notifications if configured in config.json.
"""

import json
import uuid
import smtplib
import threading
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path
import os
import urllib.request

_DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
FEEDBACK_LOG_FILE = _DATA_DIR / "feedback_log.json"
_MAX_ENTRIES = 1000
_lock = threading.Lock()


# ── Persistence ───────────────────────────────────────────────────────────────

def _load() -> list:
    if FEEDBACK_LOG_FILE.exists():
        try:
            with open(FEEDBACK_LOG_FILE) as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _save(data: list):
    with open(FEEDBACK_LOG_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _load_config() -> dict:
    config_file = _DATA_DIR / "config.json"
    if config_file.exists():
        try:
            return json.loads(config_file.read_text())
        except Exception:
            pass
    return {}


# ── Notification delivery ─────────────────────────────────────────────────────

def _send_email(cfg: dict, subject: str, body: str):
    """Send a plain-text email using SMTP config from config.json."""
    smtp_host = cfg.get("smtp_host", "")
    smtp_port = int(cfg.get("smtp_port", 587))
    smtp_user = cfg.get("smtp_user", "")
    smtp_pass = cfg.get("smtp_pass", "")
    feedback_email = cfg.get("feedback_email", "")
    if not smtp_host or not feedback_email:
        return
    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"]    = smtp_user or feedback_email
    msg["To"]      = feedback_email
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            if smtp_port in (587, 465):
                server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(msg["From"], [feedback_email], msg.as_string())
    except Exception:
        pass


def _send_sms(cfg: dict, message: str):
    """Send an SMS via the configured webhook URL (e.g. Twilio Studio)."""
    webhook_url = cfg.get("sms_webhook_url", "")
    phone = cfg.get("feedback_phone", "")
    if not webhook_url or not phone:
        return
    payload = json.dumps({"to": phone, "message": message}).encode()
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def _fire_notification(entry: dict, cfg: dict):
    """Fire email and/or SMS notification in a background thread."""
    pos_ctx = entry.get("position_context", {})
    ticker  = pos_ctx.get("ticker", "")
    strike  = pos_ctx.get("strike", "")
    expiry  = pos_ctx.get("expiry", "")
    action  = pos_ctx.get("action_type", "")
    option  = entry.get("option_chosen", "")
    text    = entry.get("free_text", "")
    ts      = entry.get("timestamp", "")[:16].replace("T", " ")

    subject = f"[Harvest] Feedback: {option} on {ticker} ${strike} {expiry}"
    body = (
        f"Position Feedback — {ts}\n"
        f"\n"
        f"Ticker:   {ticker}\n"
        f"Strike:   ${strike}  Expiry: {expiry}\n"
        f"Action card: {action}\n"
        f"\n"
        f"Feedback: {option}\n"
    )
    if text:
        body += f"Note:     {text}\n"

    _send_email(cfg, subject, body)
    _send_sms(cfg, f"[Harvest] {option} on {ticker} ${strike} {expiry}. {text}"[:160])


# ── Public API ────────────────────────────────────────────────────────────────

def log_feedback(
    position_context: dict,
    option_chosen: str,
    free_text: str = "",
) -> dict:
    """Append a feedback entry. Fires notification if configured. Returns the entry."""
    entry = {
        "id":               str(uuid.uuid4()),
        "timestamp":        datetime.now().isoformat(),
        "position_context": position_context,
        "option_chosen":    option_chosen,
        "free_text":        free_text,
        "notified":         False,
    }
    cfg = _load_config()

    with _lock:
        data = _load()
        data.append(entry)
        if len(data) > _MAX_ENTRIES:
            data = data[-_MAX_ENTRIES:]
        _save(data)

    # Notification: fire immediately if send_immediately is true (or not set)
    if cfg.get("feedback_email") or cfg.get("sms_webhook_url"):
        send_now = cfg.get("feedback_notify_immediate", True)
        if send_now:
            threading.Thread(
                target=_fire_notification,
                args=(entry, cfg),
                daemon=True,
            ).start()
            entry["notified"] = True

    return entry


def get_log(limit: int = 100) -> list:
    data = _load()
    return data[-limit:]
