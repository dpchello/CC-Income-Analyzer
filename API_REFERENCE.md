# API Reference — What You Can Pull

This doc covers every data source wired into this app, what each one can return, and how to call it in Python. Use it as a menu when you want to add new features.

---

## 1. yfinance (no API key, no rate limit)

yfinance wraps Yahoo Finance. Free, unlimited for personal use. Gets delayed ~15 min during market hours.

### Install
```bash
pip3 install yfinance
```

### Any stock / ETF quote
```python
import yfinance as yf

t = yf.Ticker("SPY")

# Fast quote (price, day high/low, volume)
info = t.fast_info
print(info.last_price)        # 578.42
print(info.day_high)          # 581.00
print(info.day_low)           # 574.10
print(info.three_month_average_volume)  # 72_000_000
```

Works for any ticker: `"AAPL"`, `"QQQ"`, `"TSLA"`, `"GLD"`, `"IWM"`, etc.

---

### Price history
```python
# Daily bars — any period
df = t.history(period="1y", interval="1d")
# interval options: "1m","5m","15m","30m","60m","1d","1wk","1mo"
# period options:   "1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"

df.columns   # Open, High, Low, Close, Volume, Dividends, Stock Splits
df["Close"].iloc[-1]   # most recent close
df["Close"].rolling(20).mean()  # 20-day moving average
```

---

### Options chain
```python
# Available expiry dates
expiries = t.options
# ('2026-04-11', '2026-04-17', '2026-04-24', '2026-05-16', ...)

# Full chain for one expiry
chain = t.option_chain("2026-04-24")
calls = chain.calls   # DataFrame
puts  = chain.puts    # DataFrame

# Columns available:
# strike, bid, ask, lastPrice, volume, openInterest,
# impliedVolatility, delta, gamma, theta, vega, rho
calls[["strike","bid","ask","impliedVolatility","delta","theta"]]
```

This is exactly how the app generates covered call recommendations.

---

### Volatility indices
```python
vix  = yf.Ticker("^VIX")   # CBOE Volatility Index
vvix = yf.Ticker("^VVIX")  # Volatility of VIX (vol-of-vol)
move = yf.Ticker("^MOVE")  # Bond market volatility (like VIX for Treasuries)

vix_hist = vix.history(period="1y", interval="1d")
current_vix = float(vix_hist["Close"].iloc[-1])

# 52-week IV rank — used in app's signal engine
high = float(vix_hist["High"].max())
low  = float(vix_hist["Low"].min())
iv_rank = (current_vix - low) / (high - low) * 100
```

---

### Treasury yields (as tickers)
```python
tnx = yf.Ticker("^TNX")   # 10-year yield × 10 (so 44.5 = 4.45%)
fvx = yf.Ticker("^FVX")   # 5-year yield × 10
irx = yf.Ticker("^IRX")   # 13-week T-bill
tlt = yf.Ticker("TLT")    # 20-year Treasury ETF (price moves inverse to yield)

hist = tnx.history(period="3mo", interval="1d")
yield_pct = float(hist["Close"].iloc[-1]) / 10   # → 4.45
```

---

### Fundamental data
```python
t = yf.Ticker("AAPL")

t.info          # dict with ~100 fields: sector, P/E, market cap, beta, etc.
t.financials    # income statement (annual)
t.quarterly_financials
t.balance_sheet
t.cashflow
t.earnings      # annual EPS
t.dividends     # Series of dividend payments
t.splits        # stock split history
t.institutional_holders   # top institutions and % owned
t.major_holders
```

Example fields from `t.info`:
```python
{
  "marketCap": 3_000_000_000_000,
  "trailingPE": 32.4,
  "forwardPE": 28.1,
  "beta": 1.24,
  "dividendYield": 0.0045,
  "fiftyTwoWeekHigh": 237.23,
  "fiftyTwoWeekLow": 164.08,
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "shortRatio": 1.2,
  "heldPercentInstitutions": 0.62,
}
```

---

### Useful indices and ETFs to watch
| Symbol | What it tracks |
|--------|----------------|
| `SPY` | S&P 500 |
| `QQQ` | Nasdaq 100 |
| `IWM` | Russell 2000 (small cap) |
| `GLD` | Gold |
| `SLV` | Silver |
| `USO` | Oil |
| `^VIX` | Market fear gauge |
| `^VVIX` | VIX volatility |
| `^TNX` | 10yr Treasury yield |
| `TLT` | 20yr Treasury bond ETF |
| `DXY` | US Dollar index (use `DX-Y.NYB`) |
| `BTC-USD` | Bitcoin |
| `^GSPC` | S&P 500 (index level, not ETF) |

---

## 2. AlphaVantage (API key required, 25 calls/day free)

Your API key: `93DOFI60YRJ0H7RC`  
Free tier: 25 calls/day, ~5/min  
Docs: https://www.alphavantage.co/documentation/

The app uses a disk cache so each endpoint is only called once per day. The 5 endpoints currently used (news, RSI, Bollinger Bands, 10yr yield, 5yr yield) consume 5 of your 25 daily calls.

### Base call pattern
```python
import requests

BASE = "https://www.alphavantage.co/query"
KEY = "93DOFI60YRJ0H7RC"

resp = requests.get(BASE, params={"function": "...", "apikey": KEY, ...})
data = resp.json()
```

---

### News + Sentiment (currently wired in)
```python
params = {
    "function": "NEWS_SENTIMENT",
    "tickers": "SPY",       # comma-separated: "SPY,AAPL,QQQ"
    "limit": "20",
    "sort": "LATEST",       # or "RELEVANCE", "EARLIEST"
    "apikey": KEY,
}
data = requests.get(BASE, params=params).json()

# data["feed"] is a list of articles
for article in data["feed"]:
    print(article["title"])
    print(article["overall_sentiment_score"])   # -1.0 to 1.0
    print(article["overall_sentiment_label"])   # "Bullish", "Bearish", "Neutral", etc.
    print(article["url"])
    print(article["time_published"])
    
    # Per-ticker sentiment breakdown
    for ts in article["ticker_sentiment"]:
        print(ts["ticker"], ts["ticker_sentiment_score"])
```

---

### RSI (currently wired in)
```python
params = {
    "function": "RSI",
    "symbol": "SPY",
    "interval": "daily",      # "1min","5min","15min","30min","60min","daily","weekly","monthly"
    "time_period": "14",      # lookback window
    "series_type": "close",   # "close","open","high","low"
    "apikey": KEY,
}
data = requests.get(BASE, params=params).json()
series = data["Technical Analysis: RSI"]
# {"2026-04-03": {"RSI": "58.23"}, "2026-04-02": {"RSI": "61.10"}, ...}
latest_rsi = float(list(series.values())[0]["RSI"])
```

---

### Bollinger Bands (currently wired in)
```python
params = {
    "function": "BBANDS",
    "symbol": "SPY",
    "interval": "daily",
    "time_period": "20",
    "series_type": "close",
    "nbdevup": "2",     # upper band: 2 standard deviations above
    "nbdevdn": "2",     # lower band: 2 standard deviations below
    "apikey": KEY,
}
data = requests.get(BASE, params=params).json()
series = data["Technical Analysis: BBANDS"]
latest = list(series.values())[0]
print(latest["Real Upper Band"])   # "598.40"
print(latest["Real Middle Band"])  # "572.10"
print(latest["Real Lower Band"])   # "545.80"
```

---

### Treasury Yields (currently wired in)
```python
params = {
    "function": "TREASURY_YIELD",
    "interval": "daily",
    "maturity": "10year",   # "3month","2year","5year","7year","10year","30year"
    "apikey": KEY,
}
data = requests.get(BASE, params=params).json()
latest = data["data"][0]
print(latest["date"])   # "2026-04-03"
print(latest["value"])  # "4.48"
```

---

### Other technical indicators you can add (each costs 1 call/day)
| Function | What it returns |
|----------|----------------|
| `MACD` | MACD line, signal line, histogram |
| `STOCH` | Slow %K and %D (stochastic oscillator) |
| `ATR` | Average True Range (volatility measure) |
| `OBV` | On-Balance Volume |
| `SMA` | Simple moving average |
| `EMA` | Exponential moving average |
| `VWAP` | Volume-weighted average price (intraday only) |
| `ADX` | Average Directional Index (trend strength) |
| `CCI` | Commodity Channel Index |

Example — adding MACD:
```python
params = {
    "function": "MACD",
    "symbol": "SPY",
    "interval": "daily",
    "series_type": "close",
    "apikey": KEY,
}
data = requests.get(BASE, params=params).json()
series = data["Technical Analysis: MACD"]
latest = list(series.values())[0]
print(latest["MACD"])           # "3.42"
print(latest["MACD_Signal"])    # "2.81"
print(latest["MACD_Hist"])      # "0.61"
```

---

### Earnings calendar (1 call)
```python
params = {
    "function": "EARNINGS_CALENDAR",
    "horizon": "3month",  # "3month","6month","12month"
    "apikey": KEY,
}
# Returns CSV — parse with csv module
import csv, io, requests
resp = requests.get(BASE, params=params)
reader = csv.DictReader(io.StringIO(resp.text))
for row in reader:
    print(row["symbol"], row["reportDate"], row["estimate"])
```

---

### Company overview (1 call per company)
```python
params = {"function": "OVERVIEW", "symbol": "AAPL", "apikey": KEY}
data = requests.get(BASE, params=params).json()
print(data["PERatio"])          # "32.4"
print(data["52WeekHigh"])       # "237.23"
print(data["DividendYield"])    # "0.0045"
print(data["Beta"])             # "1.24"
print(data["EPS"])              # "6.43"
print(data["AnalystTargetPrice"])  # "240.00"
```

---

## 3. What's NOT in the app yet (possible additions)

### FRED (Federal Reserve Economic Data) — free, no key needed
```python
import requests
url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS"
# Returns CSV of Fed Funds Rate history
```
Other FRED series: `T10YIE` (10yr inflation expectations), `UMCSENT` (consumer sentiment), `BAMLH0A0HYM2` (high yield spread), `VIXCLS` (VIX).

---

### Polygon.io (free tier: 5 calls/min, end-of-day only)
Good for: tick-level options data, Greeks on specific contracts, aggregate bars.
```python
# Requires free API key from polygon.io
import requests
KEY = "your_polygon_key"

# Options contract details
url = f"https://api.polygon.io/v3/snapshot/options/SPY?apiKey={KEY}&limit=10&strike_price=580&expiration_date=2026-04-24"
data = requests.get(url).json()
# Returns: implied_vol, delta, gamma, theta, vega, open_interest, day volume
```

---

### Tradier (paper trading + options — free sandbox)
Full broker API with real options quotes, Greeks, and order simulation. Requires account at tradier.com.
```python
headers = {"Authorization": "Bearer YOUR_SANDBOX_TOKEN", "Accept": "application/json"}
url = "https://sandbox.tradier.com/v1/markets/options/chains"
params = {"symbol": "SPY", "expiration": "2026-04-24", "greeks": "true"}
data = requests.get(url, headers=headers, params=params).json()
# data["options"]["option"] is a list with full Greeks per strike
```
