# SPY Covered Call Strategy Tracker

A professional trading terminal for tracking a covered call writing strategy on SPY. Tracks open positions, monitors market signals, and suggests optimal entry points grounded in academic research.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

## Features
- Live SPY price + VIX/VVIX/TNX/FVX/TLT signal tickers (60s refresh)
- Academic signal engine: IV Rank, VIX level, VVIX, trend filter, rates, yield curve
- SELL PREMIUM / HOLD / CAUTION / AVOID regime with factor scorecard
- Open position P&L with 50% profit rule, 21 DTE roll, gamma danger alerts
- Strike recommendations optimized for 30–45 DTE sweet spot
- Bloomberg Terminal aesthetic (dark, monospace, no fluff)

## Tech Stack
- **Backend**: Python 3.11 · FastAPI · yfinance · uvicorn
- **Frontend**: React 18 · Vite · Tailwind CSS · Recharts
