"""
One-time ingestion script: downloads SPY, IWM, QQQ options + underlying Parquet
files from the lambdaclass GitHub release and loads them into the local DuckDB.

Usage:
    cd backend
    python -m scripts.ingest_lambdaclass               # all three symbols
    python -m scripts.ingest_lambdaclass --symbols SPY  # single symbol
    python -m scripts.ingest_lambdaclass --skip-download  # re-ingest already-downloaded files
"""

import argparse
import sys
import urllib.request
from pathlib import Path

import duckdb
import pandas as pd

# Add parent dir so we can import data_store
sys.path.insert(0, str(Path(__file__).parent.parent))
import data_store

RELEASE_BASE = (
    "https://github.com/lambdaclass/options_portfolio_backtester"
    "/releases/download/data-v1"
)

SYMBOLS = ["SPY", "IWM", "QQQ"]

DATA_DIR = Path(__file__).parent.parent / "data"


def download_file(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  already downloaded: {dest.name}")
        return
    print(f"  downloading {dest.name} ...")
    # Follow redirects (GitHub → Azure signed URL)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk = 1024 * 512  # 512 KB chunks
        while True:
            block = resp.read(chunk)
            if not block:
                break
            f.write(block)
            downloaded += len(block)
            if total:
                pct = downloaded / total * 100
                print(f"    {pct:.1f}%", end="\r", flush=True)
    print(f"  done → {dest.name} ({dest.stat().st_size // 1_000_000} MB)")


def normalize_options(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Map lambdaclass column names to our schema."""
    rename = {
        "date":               "quote_date",
        "type":               "option_type",
        "last":               "last_price",
        "open_interest":      "open_interest",
        "implied_volatility": "implied_volatility",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    # Normalise option_type to 'C'/'P'
    if "option_type" in df.columns:
        df["option_type"] = (
            df["option_type"]
            .astype(str)
            .str.upper()
            .str[:1]
            .map({"C": "C", "P": "P", "1": "C", "2": "P"})
            .fillna("C")
        )

    df["symbol"] = symbol.upper()

    # Ensure date columns are proper date types
    for col in ("quote_date", "expiration"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col]).dt.date

    # Drop rows missing key fields
    df = df.dropna(subset=["quote_date", "expiration", "strike"])

    # Keep only columns that match our schema
    keep = [
        "quote_date", "symbol", "option_type", "expiration", "strike",
        "bid", "ask", "last_price", "volume", "open_interest",
        "implied_volatility", "delta", "gamma", "theta", "vega",
    ]
    for col in keep:
        if col not in df.columns:
            df[col] = None
    return df[keep]


def normalize_underlying(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Map lambdaclass underlying column names to our schema."""
    rename = {
        "date":              "date",
        "open":              "open",
        "high":              "high",
        "low":               "low",
        "close":             "close",
        "adjusted_close":    "adj_close",
        "adjClose":          "adj_close",
        "volume":            "volume",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    df["symbol"] = symbol.upper()
    df["date"] = pd.to_datetime(df["date"]).dt.date
    keep = ["date", "symbol", "open", "high", "low", "close", "adj_close", "volume"]
    for col in keep:
        if col not in df.columns:
            df[col] = None
    return df[keep]


def ingest_symbol(symbol: str, skip_download: bool = False) -> None:
    sym = symbol.upper()
    options_parquet = DATA_DIR / f"{sym}_options.parquet"
    underlying_parquet = DATA_DIR / f"{sym}_underlying.parquet"

    if not skip_download:
        download_file(f"{RELEASE_BASE}/{sym}_options.parquet", options_parquet)
        download_file(f"{RELEASE_BASE}/{sym}_underlying.parquet", underlying_parquet)

    # --- Options ---
    if options_parquet.exists():
        print(f"  ingesting {options_parquet.name} ...")
        # Use DuckDB to read parquet efficiently — avoids loading 600 MB into RAM all at once
        with data_store.get_connection() as conn:
            # Read directly from parquet, normalize, insert in chunks
            total_rows = conn.execute(
                f"SELECT COUNT(*) FROM read_parquet('{options_parquet}')"
            ).fetchone()[0]
            print(f"    {total_rows:,} rows in parquet")

            # Check how many are already loaded
            existing = conn.execute(
                "SELECT COUNT(*) FROM options_chains WHERE symbol = ?", [sym]
            ).fetchone()[0]
            if existing > 0:
                print(f"    {existing:,} rows already in DB — inserting new only")

            inserted = conn.execute(f"""
                INSERT INTO options_chains
                SELECT
                    CAST(date AS DATE)               AS quote_date,
                    '{sym}'                          AS symbol,
                    UPPER(LEFT(CAST(type AS VARCHAR), 1)) AS option_type,
                    CAST(expiration AS DATE)         AS expiration,
                    strike,
                    bid,
                    ask,
                    COALESCE("last", NULL)           AS last_price,
                    CAST(volume AS INTEGER)          AS volume,
                    CAST(open_interest AS INTEGER)   AS open_interest,
                    implied_volatility,
                    delta, gamma, theta, vega,
                    'lambdaclass'                    AS data_source
                FROM read_parquet('{options_parquet}')
                WHERE date IS NOT NULL
                  AND expiration IS NOT NULL
                  AND strike IS NOT NULL
                  AND (CAST(date AS DATE), '{sym}',
                       UPPER(LEFT(CAST(type AS VARCHAR), 1)),
                       CAST(expiration AS DATE), strike)
                      NOT IN (
                        SELECT quote_date, symbol, option_type, expiration, strike
                        FROM options_chains WHERE symbol = '{sym}'
                      )
            """).rowcount
            print(f"    inserted {inserted:,} new option rows")
    else:
        print(f"  WARNING: {options_parquet.name} not found — skipping")

    # --- Underlying ---
    if underlying_parquet.exists():
        print(f"  ingesting {underlying_parquet.name} ...")
        with data_store.get_connection() as conn:
            inserted = conn.execute(f"""
                INSERT INTO underlying_prices
                SELECT
                    CAST(date AS DATE) AS date,
                    '{sym}'            AS symbol,
                    "open", high, low, "close",
                    COALESCE(adjusted_close, "close") AS adj_close,
                    CAST(volume AS BIGINT) AS volume,
                    'lambdaclass' AS data_source
                FROM read_parquet('{underlying_parquet}')
                WHERE date IS NOT NULL
                  AND (CAST(date AS DATE), '{sym}') NOT IN (
                    SELECT date, symbol FROM underlying_prices WHERE symbol = '{sym}'
                  )
            """).rowcount
            print(f"    inserted {inserted:,} underlying price rows")
    else:
        print(f"  WARNING: {underlying_parquet.name} not found — skipping")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest lambdaclass options data into DuckDB")
    parser.add_argument("--symbols", nargs="+", default=SYMBOLS,
                        help="Symbols to ingest (default: SPY IWM QQQ)")
    parser.add_argument("--skip-download", action="store_true",
                        help="Skip downloading if parquet files already exist in backend/data/")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("Initialising database schema ...")
    data_store.init_schema()

    for sym in args.symbols:
        print(f"\n=== {sym.upper()} ===")
        ingest_symbol(sym.upper(), skip_download=args.skip_download)

    print("\nCoverage summary:")
    summary = data_store.get_coverage_summary()
    if summary.empty:
        print("  (no data yet)")
    else:
        print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
