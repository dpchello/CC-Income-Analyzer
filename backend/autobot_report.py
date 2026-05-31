"""
Daily summary report builder for the autobot.

Generates one consolidated email covering every test user. Pulls live state
from Supabase (positions + holdings) and yfinance (current option mids /
spot prices) — no separate report storage table.

build_daily_summary() returns:
    {
        "subject": str,
        "text":    str,   # plain-text body
        "html":    str,   # lightly formatted HTML body
    }
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

import db
from data_fetcher import DataFetcher
from signals import SignalEngine

TEST_DOMAIN = "@harvest.test"

_fetcher = DataFetcher()
_engine  = SignalEngine()


# ── Data shaping ─────────────────────────────────────────────────────────────

def _test_users() -> list:
    r = db.sb.table("users").select("id,email,tier").execute()
    return [u for u in (r.data or []) if (u["email"] or "").endswith(TEST_DOMAIN)]


def _option_mid_now(ticker: str, expiry: str, strike: float) -> Optional[float]:
    try:
        chain = _fetcher.get_options_chain_for(ticker, expiry)
    except Exception:
        return None
    for row in chain:
        if abs(float(row.get("strike") or 0) - float(strike)) < 1e-6:
            mid = round(((row.get("bid") or 0) + (row.get("ask") or 0)) / 2, 2)
            return mid if mid > 0 else None
    return None


def _current_regime() -> str:
    try:
        spy_price_data = _fetcher.get_spy_price()
        sigt = _fetcher.get_signal_tickers()
        signal = _engine.analyze(
            spy_price     = spy_price_data.get("price", 0),
            vix           = sigt.get("^VIX",  {}).get("price", 20),
            vix_iv_rank   = _fetcher.get_vix_history().get("iv_rank", 50),
            vvix          = sigt.get("^VVIX", {}).get("price", 95),
            tnx           = sigt.get("^TNX",  {}).get("price", 4.3),
            fvx           = sigt.get("^FVX",  {}).get("price", 4.0),
            tlt           = sigt.get("TLT",   {}).get("price", 88),
            spy_ma_signal = _fetcher.get_spy_ma_signal(),
            open_positions= [],
            tnx_history   = _fetcher.get_tnx_history(10),
            tlt_history   = _fetcher.get_tlt_history(10),
            available_expiries = [],
            vix_recent    = _fetcher.get_vix_recent_history(10),
            spy_recent    = _fetcher.get_spy_recent_history(10),
        )
        return signal.get("regime", "?")
    except Exception:
        return "?"


def _user_positions(user_id: str) -> tuple:
    r = (db.sb.table("positions")
           .select("*")
           .eq("user_id", user_id)
           .eq("simulated", True)
           .order("ticker")
           .execute())
    rows = r.data or []
    open_pos   = [p for p in rows if p.get("status") == "open"]
    closed_pos = [p for p in rows if p.get("status") == "closed"]
    return open_pos, closed_pos


# ── User section builder ─────────────────────────────────────────────────────

def _build_user_section(user: dict, today: date) -> dict:
    open_pos, closed_pos = _user_positions(user["id"])

    # Enrich open positions with current mid + unrealized P&L
    open_rows = []
    unreal = 0.0
    for p in open_pos:
        ticker = p["ticker"]
        strike = float(p["strike"])
        expiry = p["expiry"]
        contracts  = int(p.get("contracts") or 0)
        sell_price = float(p.get("sell_price") or 0)
        cur_mid = _option_mid_now(ticker, expiry, strike)
        if cur_mid is not None:
            pnl_now = round((sell_price - cur_mid) * contracts * 100, 2)
            unreal += pnl_now
        else:
            pnl_now = None
        try:
            dte = (datetime.strptime(expiry, "%Y-%m-%d").date() - today).days
        except Exception:
            dte = None
        open_rows.append({
            "ticker":    ticker,
            "strike":    strike,
            "expiry":    expiry,
            "contracts": contracts,
            "entry_mid": sell_price,
            "current":   cur_mid,
            "unreal":    pnl_now,
            "dte":       dte,
        })

    # Today's events — anything with close_date == today
    today_iso = today.isoformat()
    today_closed = [p for p in closed_pos if p.get("close_date") == today_iso]
    today_opened = [p for p in (open_pos + closed_pos) if p.get("open_date") == today_iso]

    closes_50pct = [p for p in today_closed if "closed_early_50pct" in (p.get("notes") or "")]
    rolls        = [p for p in today_closed if "roll" in (p.get("notes") or "").lower()]
    expired_max  = [p for p in today_closed if "expired_max_profit" in (p.get("notes") or "")]
    assigned     = [p for p in today_closed if "assigned" in (p.get("notes") or "")]

    # Cumulative realized P&L across all simulated closed positions for this user
    realized = round(sum(float(p.get("final_pnl") or 0) for p in closed_pos), 2)
    unreal   = round(unreal, 2)
    total    = round(realized + unreal, 2)

    return {
        "user":         user,
        "open_rows":    open_rows,
        "closes_50pct": closes_50pct,
        "rolls":        rolls,
        "expired_max":  expired_max,
        "assigned":     assigned,
        "today_opened": today_opened,
        "realized":     realized,
        "unreal":       unreal,
        "total":        total,
    }


# ── Render: text + HTML ──────────────────────────────────────────────────────

def _fmt_money(n: Optional[float]) -> str:
    if n is None:
        return "—"
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,.2f}"


def _render_text(sections: list, regime: str, today: date) -> str:
    lines = []
    lines.append(f"Harvest autobot — daily summary")
    lines.append(f"Date: {today.isoformat()}    Current regime: {regime}")
    lines.append("=" * 60)

    grand_real = grand_unreal = grand_total = 0.0
    for s in sections:
        u = s["user"]
        lines.append("")
        lines.append(f"USER: {u['email']}")
        lines.append("-" * 60)

        # Today's events
        n_events = (len(s["closes_50pct"]) + len(s["rolls"])
                    + len(s["expired_max"]) + len(s["assigned"]) + len(s["today_opened"]))
        if n_events == 0:
            lines.append("Today: no autobot events.")
        else:
            if s["today_opened"]:
                lines.append(f"Opened today ({len(s['today_opened'])}):")
                for p in s["today_opened"]:
                    lines.append(f"  + {p['ticker']:5s} {int(p['contracts'])}x ${p['strike']} {p['expiry']} @ ${p['sell_price']}")
            if s["closes_50pct"]:
                lines.append(f"Closed at 50% profit ({len(s['closes_50pct'])}):")
                for p in s["closes_50pct"]:
                    lines.append(f"  ✓ {p['ticker']:5s} ${p['strike']} {p['expiry']}  P&L {_fmt_money(p.get('final_pnl'))}")
            if s["rolls"]:
                lines.append(f"Rolled ({len(s['rolls'])}):")
                for p in s["rolls"]:
                    note = (p.get("notes") or "").split("|")[-1].strip()
                    lines.append(f"  ↻ {p['ticker']:5s} ${p['strike']} {p['expiry']}  {note}")
            if s["expired_max"]:
                lines.append(f"Expired worthless / max profit ({len(s['expired_max'])}):")
                for p in s["expired_max"]:
                    lines.append(f"  ★ {p['ticker']:5s} ${p['strike']} {p['expiry']}  P&L {_fmt_money(p.get('final_pnl'))}")
            if s["assigned"]:
                lines.append(f"Assigned ({len(s['assigned'])}):")
                for p in s["assigned"]:
                    lines.append(f"  ⚑ {p['ticker']:5s} ${p['strike']} {p['expiry']}  P&L {_fmt_money(p.get('final_pnl'))}")

        # Open positions
        if s["open_rows"]:
            lines.append("")
            lines.append(f"Open positions ({len(s['open_rows'])}):")
            lines.append(f"  {'TICKER':6s} {'STRIKE':>8s}  {'EXPIRY':10s} {'DTE':>4s} {'CONT':>5s} {'ENTRY':>7s} {'CUR':>7s} {'P&L NOW':>11s}")
            for r in s["open_rows"]:
                pnl_str = _fmt_money(r["unreal"])
                cur_str = "—" if r["current"] is None else f"${r['current']:.2f}"
                dte_str = "—" if r["dte"] is None else str(r["dte"])
                lines.append(
                    f"  {r['ticker']:6s} ${r['strike']:>7.2f}  {r['expiry']:10s} {dte_str:>4s} "
                    f"{r['contracts']:>5d} ${r['entry_mid']:>5.2f}  {cur_str:>7s} {pnl_str:>11s}"
                )

        lines.append("")
        lines.append(
            f"P&L — realized: {_fmt_money(s['realized'])}   "
            f"unrealized: {_fmt_money(s['unreal'])}   "
            f"total: {_fmt_money(s['total'])}"
        )
        grand_real += s["realized"]
        grand_unreal += s["unreal"]
        grand_total += s["total"]

    lines.append("")
    lines.append("=" * 60)
    lines.append(
        f"PORTFOLIO TOTAL — realized {_fmt_money(grand_real)}, "
        f"unrealized {_fmt_money(grand_unreal)}, "
        f"total {_fmt_money(grand_total)}"
    )
    return "\n".join(lines)


def _render_html(sections: list, regime: str, today: date) -> str:
    parts = []
    parts.append(f"""<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#222;max-width:760px;margin:0 auto;padding:24px;">""")
    parts.append(f"""<h2 style="margin:0 0 8px 0">Harvest autobot — daily summary</h2>""")
    parts.append(f"""<div style="color:#666;margin-bottom:24px">{today.isoformat()} &nbsp;·&nbsp; Current regime: <b>{regime}</b></div>""")

    grand_real = grand_unreal = grand_total = 0.0

    for s in sections:
        u = s["user"]
        parts.append(f"""<h3 style="margin:24px 0 4px 0;border-bottom:1px solid #eee;padding-bottom:4px">{u['email']}</h3>""")

        # Today's events block
        events_lines = []
        for p in s["today_opened"]:
            events_lines.append(f"<div>+ Opened {p['ticker']} {int(p['contracts'])}x ${p['strike']} {p['expiry']} @ ${p['sell_price']}</div>")
        for p in s["closes_50pct"]:
            events_lines.append(f"<div>✓ Closed @50% — {p['ticker']} ${p['strike']} {p['expiry']} · P&amp;L {_fmt_money(p.get('final_pnl'))}</div>")
        for p in s["rolls"]:
            note = (p.get("notes") or "").split("|")[-1].strip()
            events_lines.append(f"<div>↻ Rolled — {p['ticker']} ${p['strike']} {p['expiry']} · {note}</div>")
        for p in s["expired_max"]:
            events_lines.append(f"<div>★ Expired worthless — {p['ticker']} ${p['strike']} · P&amp;L {_fmt_money(p.get('final_pnl'))}</div>")
        for p in s["assigned"]:
            events_lines.append(f"<div>⚑ Assigned — {p['ticker']} ${p['strike']} · P&amp;L {_fmt_money(p.get('final_pnl'))}</div>")
        if events_lines:
            parts.append(f"""<div style="margin:8px 0 12px 0">{''.join(events_lines)}</div>""")
        else:
            parts.append(f"""<div style="color:#888;margin:8px 0 12px 0">No autobot events today.</div>""")

        # Open positions table
        if s["open_rows"]:
            parts.append("""<table style="border-collapse:collapse;font-size:13px;width:100%;margin:8px 0 8px 0"><thead><tr>""")
            for col in ("Ticker", "Strike", "Expiry", "DTE", "Cont", "Entry", "Cur", "P&L now"):
                parts.append(f"""<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ccc;color:#555;font-weight:600">{col}</th>""")
            parts.append("</tr></thead><tbody>")
            for r in s["open_rows"]:
                cur_str = "—" if r["current"] is None else f"${r['current']:.2f}"
                dte_str = "—" if r["dte"] is None else str(r["dte"])
                pnl_color = "#2a7" if (r["unreal"] or 0) >= 0 else "#c33"
                pnl_str = _fmt_money(r["unreal"])
                parts.append(
                    "<tr>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>{r['ticker']}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>${r['strike']:.2f}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>{r['expiry']}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>{dte_str}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>{r['contracts']}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>${r['entry_mid']:.2f}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0'>{cur_str}</td>"
                    f"<td style='padding:4px 8px;border-bottom:1px solid #f0f0f0;color:{pnl_color};font-weight:600'>{pnl_str}</td>"
                    "</tr>"
                )
            parts.append("</tbody></table>")
        else:
            parts.append("""<div style="color:#888;margin:8px 0">No open positions.</div>""")

        # Per-user totals
        parts.append(
            "<div style='font-size:13px;margin:6px 0 12px 0'>"
            f"<b>P&amp;L</b> &nbsp; realized: {_fmt_money(s['realized'])} &nbsp;·&nbsp; "
            f"unrealized: {_fmt_money(s['unreal'])} &nbsp;·&nbsp; "
            f"total: <b>{_fmt_money(s['total'])}</b>"
            "</div>"
        )
        grand_real += s["realized"]
        grand_unreal += s["unreal"]
        grand_total += s["total"]

    parts.append(f"""<hr style="border:0;border-top:1px solid #ccc;margin:24px 0"/>""")
    parts.append(
        "<div style='font-size:14px'>"
        f"<b>Portfolio total</b> — realized: {_fmt_money(grand_real)} &nbsp;·&nbsp; "
        f"unrealized: {_fmt_money(grand_unreal)} &nbsp;·&nbsp; "
        f"total: <b>{_fmt_money(grand_total)}</b>"
        "</div>"
    )
    parts.append("</body></html>")
    return "".join(parts)


# ── Public ────────────────────────────────────────────────────────────────────

def build_daily_summary(today: Optional[date] = None) -> dict:
    today = today or date.today()
    users = _test_users()
    regime = _current_regime()
    sections = [_build_user_section(u, today) for u in users]

    # Counts for subject line
    n_open  = sum(len(s["today_opened"]) for s in sections)
    n_close = sum(len(s["closes_50pct"]) + len(s["expired_max"]) + len(s["assigned"]) for s in sections)
    n_roll  = sum(len(s["rolls"]) for s in sections)

    subject = f"[Harvest autobot] daily summary — {n_open} opens / {n_roll} rolls / {n_close} closes"

    return {
        "subject": subject,
        "text":    _render_text(sections, regime, today),
        "html":    _render_html(sections, regime, today),
        "counts":  {"opens": n_open, "rolls": n_roll, "closes": n_close, "users": len(users)},
    }
