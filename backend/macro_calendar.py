"""
macro_calendar.py — Macro event awareness for the Harvest rule engine.

Provides:
  - FOMC_DATES_2026: hardcoded Fed meeting dates for 2026
  - get_upcoming_events(within_days): merge FOMC + user-defined events, return those
      within the next `within_days` calendar days, sorted by date
  - detect_news_uncertainty(news_articles): scan AlphaVantage news for macro keywords
      in the last 48 h; returns flag count and list of flagged headlines
"""

from datetime import date, datetime, timedelta
from pathlib import Path
import json

# ── FOMC 2025 meeting dates (statement release day — second day of each meeting)
# Source: federalreserve.gov/monetarypolicy/fomccalendars.htm
FOMC_DATES_2025 = [
    "2025-01-29",
    "2025-03-19",
    "2025-05-07",
    "2025-06-18",
    "2025-07-30",
    "2025-09-17",
    "2025-10-29",
    "2025-12-10",
]

# ── FOMC 2026 meeting dates (published annually — update yearly)
FOMC_DATES_2026 = [
    "2026-01-28",
    "2026-03-18",
    "2026-04-29",
    "2026-06-17",
    "2026-07-29",
    "2026-09-16",
    "2026-10-28",
    "2026-12-09",
]

# Macro keywords to scan in news headlines/summaries
MACRO_KEYWORDS = [
    "fed", "federal reserve", "fomc", "rate decision", "rate hike", "rate cut",
    "tariff", "trade war", "sanctions",
    "recession", "gdp", "inflation", "cpi", "pce",
    "unemployment", "nonfarm payroll", "payrolls",
    "war", "conflict", "geopolit",
    "bank failure", "financial crisis", "systemic",
    "yield curve", "debt ceiling",
]

_CONFIG_FILE = Path(__file__).parent / "config.json"


def _load_config() -> dict:
    if _CONFIG_FILE.exists():
        try:
            return json.loads(_CONFIG_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_config(cfg: dict) -> None:
    _CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def get_user_events() -> list:
    """Return user-defined upcoming events from config.json."""
    cfg = _load_config()
    return cfg.get("user_macro_events", [])


def add_user_event(event_date: str, description: str) -> list:
    """Add a user-defined event to config.json. Returns updated list."""
    cfg = _load_config()
    events = cfg.get("user_macro_events", [])
    events.append({"date": event_date, "description": description})
    # Sort by date and prune past events
    today = date.today().isoformat()
    events = sorted([e for e in events if e.get("date", "") >= today], key=lambda e: e["date"])
    cfg["user_macro_events"] = events
    _save_config(cfg)
    return events


def remove_user_event(event_date: str, description: str) -> list:
    """Remove a specific user-defined event. Returns updated list."""
    cfg = _load_config()
    events = cfg.get("user_macro_events", [])
    events = [e for e in events if not (e.get("date") == event_date and e.get("description") == description)]
    cfg["user_macro_events"] = events
    _save_config(cfg)
    return events


def get_upcoming_events(within_days: int = 10) -> list:
    """
    Return all upcoming macro events (FOMC + user-defined) within the next
    `within_days` calendar days, sorted by date ascending.

    Each item: {"date": "YYYY-MM-DD", "description": str, "days_away": int, "source": "fomc"|"user"}
    """
    today = date.today()
    cutoff = today + timedelta(days=within_days)

    events = []

    # FOMC dates (combine 2025 + 2026)
    all_fomc = FOMC_DATES_2025 + FOMC_DATES_2026
    for ds in all_fomc:
        try:
            d = datetime.strptime(ds, "%Y-%m-%d").date()
        except ValueError:
            continue
        if today <= d <= cutoff:
            events.append({
                "date": ds,
                "description": "FOMC Meeting — Fed rate decision",
                "days_away": (d - today).days,
                "source": "fomc",
            })

    # User-defined events
    for e in get_user_events():
        try:
            d = datetime.strptime(e["date"], "%Y-%m-%d").date()
        except (ValueError, KeyError):
            continue
        if today <= d <= cutoff:
            events.append({
                "date": e["date"],
                "description": e.get("description", "User event"),
                "days_away": (d - today).days,
                "source": "user",
            })

    events.sort(key=lambda e: e["date"])
    return events


def detect_news_uncertainty(news_articles: list) -> dict:
    """
    Scan AlphaVantage news articles published in the last 48 hours for macro keywords.

    news_articles: list of article dicts with keys "title", "summary", "time_published"
                   (AlphaVantage format: time_published = "20250410T123000")

    Returns:
      {
        "flag_count": int,           # number of keyword-flagged articles in 48h
        "is_elevated": bool,         # True when flag_count > 2
        "flagged_headlines": list,   # up to 5 flagged titles
      }
    """
    if not news_articles:
        return {"flag_count": 0, "is_elevated": False, "flagged_headlines": []}

    cutoff_dt = datetime.utcnow() - timedelta(hours=48)

    flagged = []
    for article in news_articles:
        # Parse AlphaVantage time format: "20250410T123000"
        tp = article.get("time_published", "")
        try:
            pub_dt = datetime.strptime(tp[:15], "%Y%m%dT%H%M%S")
        except (ValueError, TypeError):
            pub_dt = datetime.utcnow()  # treat as recent if unparseable

        if pub_dt < cutoff_dt:
            continue  # older than 48 h

        text = (article.get("title", "") + " " + article.get("summary", "")).lower()
        for kw in MACRO_KEYWORDS:
            if kw in text:
                flagged.append(article.get("title", "(no title)"))
                break  # only count each article once

    flag_count = len(flagged)
    return {
        "flag_count": flag_count,
        "is_elevated": flag_count > 2,
        "flagged_headlines": flagged[:5],
    }
