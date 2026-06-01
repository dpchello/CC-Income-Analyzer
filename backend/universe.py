"""
Curated ticker universe for PIPE-036 (per-ticker IV Rank).

The nightly CRON snapshots ATM IV for every ticker in CURATED_UNIVERSE. User-queried
tickers outside this set are auto-inserted into iv_universe with source='on_demand'
on first hit and then flow into the nightly job.

Refresh cadence: manual edit, quarterly (when indexes rebalance). Not worth automating
until we have signal that rosters are drifting in ways that matter.

Source lists (best-effort, current as of 2025-2026):
- DOW_30             — Dow Jones Industrial Average components
- NASDAQ_100         — Nasdaq-100 components (tech-heavy)
- SP500_TOP_100      — S&P 500 top 100 by market cap
- TOP_100_ETFS       — most-traded / largest-AUM ETFs

Heavy overlap across stock lists (AAPL/MSFT/NVDA are in all three); dedup via set.
"""

DOW_30 = [
    "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
    "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
    "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
]

NASDAQ_100 = [
    "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
    "AMZN", "ANSS", "ARM", "ASML", "AVGO", "AZN", "BIIB", "BKNG", "BKR", "CCEP",
    "CDNS", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD", "CSCO", "CSGP", "CSX",
    "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA", "EXC", "FANG", "FAST",
    "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON", "IDXX", "ILMN", "INTC",
    "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU", "MAR", "MCHP",
    "MDB", "MDLZ", "MELI", "META", "MNST", "MRVL", "MSFT", "MU", "NFLX", "NVDA",
    "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD", "PEP", "PYPL",
    "QCOM", "REGN", "ROP", "ROST", "SBUX", "SMCI", "SNPS", "TEAM", "TMUS", "TSLA",
    "TTD", "TTWO", "TXN", "VRSK", "VRTX", "WBD", "WDAY", "XEL", "ZS", "CDW",
]

SP500_TOP_100 = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "BRK-B", "AVGO",
    "LLY", "JPM", "UNH", "V", "XOM", "MA", "JNJ", "PG", "HD", "COST",
    "ABBV", "WMT", "NFLX", "MRK", "BAC", "CVX", "KO", "CRM", "TMO", "ADBE",
    "AMD", "PEP", "LIN", "CSCO", "ORCL", "ACN", "ABT", "WFC", "MCD", "DIS",
    "TMUS", "IBM", "QCOM", "CAT", "INTU", "VZ", "DHR", "GE", "CMCSA", "AMGN",
    "NOW", "TXN", "NKE", "PM", "UNP", "AMAT", "MS", "PFE", "HON", "SPGI",
    "GS", "AXP", "COP", "UPS", "NEE", "LOW", "RTX", "INTC", "BKNG", "T",
    "ELV", "SYK", "BLK", "VRTX", "ISRG", "DE", "TJX", "LMT", "BMY", "GILD",
    "MDT", "BA", "ADP", "ADI", "C", "REGN", "SBUX", "LRCX", "MMC", "SCHW",
    "ETN", "CB", "PGR", "MU", "PLD", "ZTS", "PANW", "KLAC", "CI", "AMT",
]

TOP_100_ETFS = [
    "SPY", "IVV", "VOO", "VTI", "QQQ", "VTV", "VEA", "IEFA", "AGG", "VUG",
    "BND", "IJH", "IWF", "VGT", "IJR", "IWM", "IWD", "VIG", "EFA", "VXUS",
    "VEU", "GLD", "DIA", "TLT", "SCHX", "VO", "XLK", "VCIT", "MUB", "VB",
    "VYM", "VNQ", "SCHD", "IWB", "VGK", "VWO", "BSV", "VTEB", "BIV", "IVW",
    "SHY", "VCSH", "HYG", "LQD", "RSP", "SCHF", "XLE", "XLV", "XLF", "MBB",
    "VGIT", "IUSB", "EMB", "QUAL", "SCHB", "SDY", "USMV", "VMBS", "IWR", "MDY",
    "JPST", "XLU", "BIL", "BILS", "BNDX", "MINT", "TIP", "XLP", "PFF", "SPYG",
    "VV", "SPDW", "IGSB", "DVY", "VTIP", "ARKK", "VOT", "JNK", "IWS", "IWN",
    "IWP", "IWV", "VOE", "VBR", "SHYG", "SUB", "VT", "IYR", "IAU", "SLV",
    "GDX", "EEM", "FXI", "XLY", "XLI", "XLB", "XLC", "VAW", "VPU", "VDC",
]


def _dedupe(*lists):
    seen = set()
    out = []
    for lst in lists:
        for sym in lst:
            u = sym.upper().strip()
            if u and u not in seen:
                seen.add(u)
                out.append(u)
    return out


# Master list — evaluated once at import
CURATED_UNIVERSE = _dedupe(DOW_30, NASDAQ_100, SP500_TOP_100, TOP_100_ETFS)


def source_for(ticker: str) -> str:
    """Which source list a ticker first appears in. Used for iv_universe.source."""
    t = ticker.upper().strip()
    if t in DOW_30:
        return "dow30"
    if t in NASDAQ_100:
        return "nasdaq100"
    if t in SP500_TOP_100:
        return "sp500_top100"
    if t in TOP_100_ETFS:
        return "top_etf"
    return "on_demand"
