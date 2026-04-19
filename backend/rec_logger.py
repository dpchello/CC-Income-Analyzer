"""
Recommendation Logger — persists top screener candidates with market context.

Appended on every screener run. When a position is opened, the most recent
recommendation matching that strike/expiry is marked as acted_on.
"""

import json
import os
import uuid
import threading
from datetime import datetime
from pathlib import Path

_DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
REC_LOG_FILE = _DATA_DIR / "recommendations_log.json"
_MAX_ENTRIES = 500
_lock = threading.Lock()


# ── Persistence ───────────────────────────────────────────────────────────────

def _load() -> list:
    if REC_LOG_FILE.exists():
        try:
            with open(REC_LOG_FILE) as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _save(data: list):
    with open(REC_LOG_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Public API ────────────────────────────────────────────────────────────────

def log_recommendations(candidates: list, signal: dict, spy_price: float):
    """Log top screener candidates with market context. Append-only, pruned to 500."""
    entry = {
        "id":           str(uuid.uuid4()),
        "timestamp":    datetime.now().isoformat(),
        "regime":       signal.get("regime"),
        "total_score":  signal.get("total_score"),
        "spy_price":    spy_price,
        "recommendations": [
            {
                "strike":               c.get("strike"),
                "expiry":               c.get("expiry"),
                "score":                c.get("composite_score") or c.get("score"),
                "recommendation":       c.get("recommendation"),
                "delta":                c.get("delta"),
                "mid":                  c.get("mid"),
                "contracts_suggested":  c.get("contracts_suggested"),
                "dte":                  c.get("dte"),
            }
            for c in candidates[:10]
        ],
        "acted_on": [],
    }
    with _lock:
        data = _load()
        data.append(entry)
        if len(data) > _MAX_ENTRIES:
            data = data[-_MAX_ENTRIES:]
        _save(data)


def mark_acted_on(strike: float, expiry: str, position_id: str):
    """Find the most recent recommendation matching strike/expiry and mark acted_on."""
    with _lock:
        data = _load()
        for entry in reversed(data):
            for rec in entry.get("recommendations", []):
                if rec.get("strike") == strike and rec.get("expiry") == expiry:
                    if position_id not in entry["acted_on"]:
                        entry["acted_on"].append(position_id)
                    _save(data)
                    return


def get_log(limit: int = 100) -> list:
    data = _load()
    return data[-limit:]
