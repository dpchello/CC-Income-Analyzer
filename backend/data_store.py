import duckdb
from pathlib import Path
from datetime import date
import pandas as pd

DB_PATH = Path(__file__).parent / "data" / "options.duckdb"


def get_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(DB_PATH), read_only=read_only)


def init_schema() -> None:
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS options_chains (
                quote_date  DATE    NOT NULL,
                symbol      VARCHAR NOT NULL,
                option_type VARCHAR(4) NOT NULL,
                expiration  DATE    NOT NULL,
                strike      DOUBLE  NOT NULL,
                bid         DOUBLE,
                ask         DOUBLE,
                last_price  DOUBLE,
                volume      INTEGER,
                open_interest INTEGER,
                implied_volatility DOUBLE,
                delta       DOUBLE,
                gamma       DOUBLE,
                theta       DOUBLE,
                vega        DOUBLE,
                data_source VARCHAR NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_options_chains
            ON options_chains (quote_date, symbol, option_type, expiration, strike)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS underlying_prices (
                date        DATE    NOT NULL,
                symbol      VARCHAR NOT NULL,
                open        DOUBLE,
                high        DOUBLE,
                low         DOUBLE,
                close       DOUBLE,
                adj_close   DOUBLE,
                volume      BIGINT,
                data_source VARCHAR NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_underlying_prices
            ON underlying_prices (date, symbol)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS collection_log (
                symbol          VARCHAR NOT NULL PRIMARY KEY,
                last_collected  DATE    NOT NULL,
                records_added   INTEGER
            )
        """)


def get_options_chain(symbol: str, quote_date: date) -> list[dict]:
    with get_connection(read_only=True) as conn:
        rows = conn.execute("""
            SELECT option_type, expiration, strike, bid, ask, last_price,
                   volume, open_interest, implied_volatility, delta, gamma, theta, vega
            FROM options_chains
            WHERE symbol = ? AND quote_date = ?
            ORDER BY expiration, strike
        """, [symbol.upper(), quote_date]).fetchdf()
    return rows.to_dict("records")


def get_options_chain_range(
    symbol: str, start: date, end: date, option_type: str = "C"
) -> pd.DataFrame:
    with get_connection(read_only=True) as conn:
        return conn.execute("""
            SELECT quote_date, expiration, strike, bid, ask, last_price,
                   volume, open_interest, implied_volatility, delta, gamma, theta, vega
            FROM options_chains
            WHERE symbol = ? AND option_type = ?
              AND quote_date BETWEEN ? AND ?
            ORDER BY quote_date, expiration, strike
        """, [symbol.upper(), option_type.upper(), start, end]).fetchdf()


def get_underlying_prices(symbol: str, start: date, end: date) -> pd.DataFrame:
    with get_connection(read_only=True) as conn:
        return conn.execute("""
            SELECT date, open, high, low, close, adj_close, volume
            FROM underlying_prices
            WHERE symbol = ? AND date BETWEEN ? AND ?
            ORDER BY date
        """, [symbol.upper(), start, end]).fetchdf()


def get_coverage_summary() -> pd.DataFrame:
    with get_connection(read_only=True) as conn:
        return conn.execute("""
            SELECT symbol,
                   MIN(quote_date) AS earliest,
                   MAX(quote_date) AS latest,
                   COUNT(DISTINCT quote_date) AS trading_days,
                   COUNT(*) AS total_rows
            FROM options_chains
            GROUP BY symbol
            ORDER BY symbol
        """).fetchdf()


def get_last_collected(symbol: str) -> date | None:
    with get_connection(read_only=True) as conn:
        row = conn.execute(
            "SELECT last_collected FROM collection_log WHERE symbol = ?",
            [symbol.upper()]
        ).fetchone()
    return row[0] if row else None


def upsert_collection_log(symbol: str, collected_date: date, records_added: int) -> None:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO collection_log (symbol, last_collected, records_added)
            VALUES (?, ?, ?)
            ON CONFLICT (symbol) DO UPDATE SET
                last_collected = excluded.last_collected,
                records_added  = excluded.records_added
        """, [symbol.upper(), collected_date, records_added])


def insert_options_rows(df: pd.DataFrame, source: str) -> int:
    """Insert a DataFrame of options rows, skipping duplicates. Returns rows inserted."""
    if df.empty:
        return 0
    df = df.copy()
    df["data_source"] = source
    with get_connection() as conn:
        conn.register("_insert_df", df)
        conn.execute("""
            INSERT INTO options_chains
            SELECT quote_date, symbol, option_type, expiration, strike,
                   bid, ask, last_price, volume, open_interest,
                   implied_volatility, delta, gamma, theta, vega, data_source
            FROM _insert_df
            WHERE (quote_date, symbol, option_type, expiration, strike) NOT IN (
                SELECT quote_date, symbol, option_type, expiration, strike
                FROM options_chains
            )
        """)
        count = conn.execute("SELECT changes()").fetchone()[0]
    return count


def insert_underlying_rows(df: pd.DataFrame, source: str) -> int:
    """Insert a DataFrame of underlying price rows, skipping duplicates."""
    if df.empty:
        return 0
    df = df.copy()
    df["data_source"] = source
    with get_connection() as conn:
        conn.register("_insert_underlying", df)
        conn.execute("""
            INSERT INTO underlying_prices
            SELECT date, symbol, open, high, low, close, adj_close, volume, data_source
            FROM _insert_underlying
            WHERE (date, symbol) NOT IN (
                SELECT date, symbol FROM underlying_prices
            )
        """)
        count = conn.execute("SELECT changes()").fetchone()[0]
    return count
