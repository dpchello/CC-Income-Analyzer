// Sample data for Harvest mockups
const HARVEST_POSITIONS = [
  { sym: "AAPL", name: "Apple Inc.", shares: 400, avg: 162.40, price: 194.32, day: 1.18, week: 2.4, ivr: 28, cc: { strike: 200, exp: "May 16", premium: 2.45, delta: 0.28, cover: 400 } },
  { sym: "MSFT", name: "Microsoft Corp.", shares: 200, avg: 342.10, price: 428.15, day: -0.42, week: -1.1, ivr: 22, cc: { strike: 440, exp: "May 16", premium: 4.20, delta: 0.32, cover: 200 } },
  { sym: "NVDA", name: "NVIDIA Corp.", shares: 100, avg: 480.00, price: 892.40, day: 2.81, week: 5.9, ivr: 58, cc: { strike: 920, exp: "May 09", premium: 18.60, delta: 0.34, cover: 100 } },
  { sym: "AMD", name: "Adv. Micro Devices", shares: 300, avg: 148.20, price: 168.90, day: 0.94, week: -2.8, ivr: 41, cc: { strike: 180, exp: "May 16", premium: 3.10, delta: 0.26, cover: 300 } },
  { sym: "GOOG", name: "Alphabet Inc.", shares: 250, avg: 138.00, price: 174.25, day: 0.61, week: 3.2, ivr: 19, cc: { strike: 180, exp: "May 23", premium: 2.80, delta: 0.30, cover: 200 } },
  { sym: "F", name: "Ford Motor Co.", shares: 1000, avg: 11.80, price: 13.42, day: -0.78, week: 1.1, ivr: 35, cc: { strike: 14, exp: "May 16", premium: 0.38, delta: 0.38, cover: 1000 } },
  { sym: "SOFI", name: "SoFi Technologies", shares: 800, avg: 7.40, price: 9.18, day: 2.12, week: 6.4, ivr: 62, cc: { strike: 10, exp: "May 09", premium: 0.42, delta: 0.35, cover: 800 } },
  { sym: "T", name: "AT&T Inc.", shares: 500, avg: 17.20, price: 18.94, day: 0.28, week: 0.9, ivr: 14, cc: null },
];

const HARVEST_RECS = [
  {
    id: "r1", sym: "AAPL", conviction: "High", score: 88,
    action: "Sell 4x May 16 $200 Call", premium: 980, annYield: 18.4, pop: 72, delta: 0.28,
    thesis: "IV rank at 28 offers reasonable premium. $200 strike sits above 1σ range and two prior rejection points. Earnings are post-expiration; event risk avoided.",
    tags: ["above-cost-basis", "no-earnings", "iv-rank-median"],
  },
  {
    id: "r2", sym: "NVDA", conviction: "Med", score: 74,
    action: "Sell 1x May 09 $920 Call", premium: 1860, annYield: 31.2, pop: 64, delta: 0.34,
    thesis: "Elevated IVR of 58 captures rich premium. Short 2-week tenor reduces assignment risk. Strike is 3% OTM but trend momentum is strong — consider rolling.",
    tags: ["high-iv", "short-dte", "trend-risk"],
  },
  {
    id: "r3", sym: "AMD", conviction: "Med", score: 69,
    action: "Sell 3x May 16 $180 Call", premium: 930, annYield: 22.0, pop: 70, delta: 0.26,
    thesis: "Consolidation band between $160 and $180. Selling at resistance. Premium covers 3.3 weeks of portfolio drag.",
    tags: ["range-bound", "at-resistance"],
  },
  {
    id: "r4", sym: "SOFI", conviction: "Low", score: 52,
    action: "Hold — await IV cooldown",
    thesis: "IVR at 62 is attractive, but price is trending into earnings. Wait for post-event IV crush before initiating.",
    tags: ["earnings-soon", "watch"],
  },
];

const HARVEST_HISTORY = [
  { id: "h1", date: "Apr 18", sym: "AAPL", action: "STO", strike: 190, exp: "Apr 18", premium: 2.10, qty: 4, outcome: "expired", pnl: 840, ret: 1.24 },
  { id: "h2", date: "Apr 18", sym: "MSFT", action: "STO", strike: 420, exp: "Apr 18", premium: 3.80, qty: 2, outcome: "expired", pnl: 760, ret: 0.91 },
  { id: "h3", date: "Apr 11", sym: "NVDA", action: "BTC", strike: 880, exp: "Apr 18", premium: 12.40, qty: 1, outcome: "closed-early", pnl: 620, ret: 0.82 },
  { id: "h4", date: "Apr 04", sym: "AMD", action: "STO", strike: 175, exp: "Apr 18", premium: 2.80, qty: 3, outcome: "assigned", pnl: 1240, ret: 1.62 },
  { id: "h5", date: "Mar 28", sym: "AAPL", action: "STO", strike: 185, exp: "Apr 18", premium: 1.90, qty: 4, outcome: "rolled", pnl: 0, ret: 0 },
  { id: "h6", date: "Mar 28", sym: "F", action: "STO", strike: 13, exp: "Apr 18", premium: 0.28, qty: 10, outcome: "expired", pnl: 280, ret: 2.24 },
];

const HARVEST_SCREENER = [
  { id: "s1", sym: "TSLA", label: "TSLA", x: 2.8, y: 38, delta: 0.30, ivr: 68 },
  { id: "s2", sym: "NVDA", label: "NVDA", x: 2.1, y: 31, delta: 0.34, ivr: 58 },
  { id: "s3", sym: "AAPL", label: "AAPL", x: 1.3, y: 18, delta: 0.28, ivr: 28 },
  { id: "s4", sym: "MSFT", label: "MSFT", x: 1.0, y: 14, delta: 0.32, ivr: 22 },
  { id: "s5", sym: "AMD", label: "AMD", x: 1.9, y: 22, delta: 0.26, ivr: 41 },
  { id: "s6", sym: "SOFI", label: "SOFI", x: 4.6, y: 52, delta: 0.35, ivr: 62 },
  { id: "s7", sym: "F", label: "F", x: 2.8, y: 30, delta: 0.38, ivr: 35 },
  { id: "s8", sym: "GOOG", label: "GOOG", x: 1.6, y: 19, delta: 0.30, ivr: 19 },
  { id: "s9", sym: "META", label: "META", x: 2.0, y: 26, delta: 0.28, ivr: 38 },
  { id: "s10", sym: "PLTR", label: "PLTR", x: 3.4, y: 42, delta: 0.32, ivr: 55 },
  { id: "s11", sym: "INTC", label: "INTC", x: 2.2, y: 28, delta: 0.31, ivr: 44 },
  { id: "s12", sym: "COIN", label: "COIN", x: 4.1, y: 46, delta: 0.33, ivr: 60 },
  { id: "s13", sym: "KO", label: "KO", x: 0.7, y: 9, delta: 0.24, ivr: 12 },
  { id: "s14", sym: "JPM", label: "JPM", x: 1.0, y: 13, delta: 0.27, ivr: 18 },
  { id: "s15", sym: "XOM", label: "XOM", x: 1.4, y: 17, delta: 0.29, ivr: 26 },
];

Object.assign(window, { HARVEST_POSITIONS, HARVEST_RECS, HARVEST_HISTORY, HARVEST_SCREENER });
