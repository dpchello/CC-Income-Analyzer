# Handoff: Harvest — covered-call platform for long-term holders

## Overview

**Harvest** is a web app for buy-and-hold retail investors who want to systematically generate premium income by selling covered calls against shares they already own. The product reads positions from brokerages (Plaid Investments / SnapTrade — read-only), ranks covered-call candidates per position, and provides a workflow for reviewing and placing orders. The target user is a self-directed investor with $50k–$5M in concentrated equity holdings who wants the wheel strategy to run on autopilot without handing over custody.

Two deliverables are bundled:

- `Harvest.html` — **Design canvas**: static frames of marketing landings, dashboard variations, screener, mobile briefing, etc. Presentational only.
- `App.html` — **Clickable prototype**: the end-to-end app navigation (dashboard → positions → recommendations → trade ticket → performance → journal → onboarding). Works in a browser; fully interactive React.

---

## About the Design Files

The HTML files in this bundle are **design references, not production code to copy directly**. They are inline React + Babel mounted on a single page and are *not* built the way a real app would be. Your job is to **recreate the designs in the target codebase's environment** using its existing patterns — or, if no codebase exists yet, to choose the stack and implement from scratch.

**Recommended stack** if starting clean:
- Next.js (App Router) + TypeScript
- Tailwind CSS with a custom theme that mirrors `tokens.json`
- shadcn/ui for form primitives (select, dialog, toggle, slider, tooltip)
- TanStack Query for data fetching, TanStack Table for the positions grid, Recharts or visx for charts (the prototype's charts are hand-rolled SVG — replace with a proper charting lib)
- A real broker integration: [Plaid Investments](https://plaid.com/docs/investments/) and/or [SnapTrade](https://snaptrade.com/) for read-only positions; for actual order placement, SnapTrade or Alpaca

---

## Fidelity

**High-fidelity.** Colors, typography, spacing, and layouts are intentional and final. Recreate pixel-accurately — measurements are real, not rough.

That said: the charts in the prototype are hand-rolled SVG line paths from seeded random noise. **Replace them with a real charting library** fed by real broker / market data. Preserve the visual style (thin 1.5px lines, no fills, subtle gridlines, small serif axis labels where shown).

---

## Design tokens

All tokens live in `tokens.json` (machine-readable) and `tokens.css` (CSS custom properties). The palette is a **warm paper-white with deep forest green accent** — deliberately *not* the default fintech dark-teal. The restraint is the point.

### Colors

| Token          | Hex / RGBA                          | Usage |
|----------------|-------------------------------------|-------|
| `--bg`         | `#faf8f3`                           | Page background — warm off-white |
| `--bg-elev`    | `#f3f0e7`                           | Subtle elevation (sidebars, section bands) |
| `--bg-elev-2`  | `#ebe7db`                           | Second elevation step |
| `--bg-card`    | `#ffffff`                           | Cards, tables, ticket surface |
| `--fg`         | `#1a1e16`                           | Primary text (near-black, warm) |
| `--fg-dim`     | `#4a4f44`                           | Secondary text |
| `--fg-mute`    | `#6e7166`                           | Tertiary text, labels |
| `--fg-faint`   | `#9a9a90`                           | Disabled / hint text |
| `--line`       | `rgba(24,28,20,0.10)`               | Default dividers and borders |
| `--line-strong`| `rgba(24,28,20,0.18)`               | Emphasized borders, form field outlines |
| `--line-soft`  | `rgba(24,28,20,0.06)`               | Very subtle row separators |
| `--acid`       | `#2f5233`                           | Brand accent — deep forest. Primary buttons, positive P&L, active nav, chart lines |
| `--acid-dim`   | `#3f6844`                           | Lighter forest (hover on acid surfaces) |
| `--acid-deep`  | `#1e3621`                           | Darkest forest (primary button hover) |
| `--acid-faint` | `rgba(47,82,51,0.08)`               | Accent backgrounds (selected strike, selected preset) |
| `--acid-line`  | `rgba(47,82,51,0.28)`               | Accent borders |
| `--warn`       | `#b8502e`                           | Warnings (assignment risk, earnings windows) |
| `--warn-faint` | `rgba(184,80,46,0.10)`              | Warning backgrounds |
| `--down`       | `#c14a35`                           | Negative P&L, losses |
| `--olive`      | `#6a7648`                           | Secondary accent (medium conviction) |
| `--olive-dim`  | `#4a5436`                           | Darker olive variant |

**Key mental model:** the token is called `--acid` for historical reasons (an earlier iteration used acid green). It's now a deep forest green. All "acid" references in component code mean "brand accent" — don't rename in your implementation if you want to keep the CSS 1:1 with the prototype, but feel free to rename to `--accent` or `--brand` in a clean rebuild.

### Typography

Load from Google Fonts:
- **Inter Tight** (400/500/600/700) — primary UI, buttons, numerals in nav
- **Inter** (400/500/600) — body text
- **Instrument Serif** (400, italic) — editorial display (hero titles, section headers, screen titles)
- **JetBrains Mono** (400/500) — tabular numbers, tickers, strike prices, timestamps, eyebrows

```
--sans: "Inter Tight", "Inter", -apple-system, sans-serif;
--body: "Inter", -apple-system, sans-serif;
--serif: "Instrument Serif", "Cormorant Garamond", Georgia, serif;
--mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
```

**Numeric tabular style** (essential for alignment in tables and tickers):
```css
.num, .mono {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
```

**Eyebrow style** (used everywhere for section labels):
```css
.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-mute);
}
```

### Spacing & radius

- Corner radii are **small on purpose**: 2 / 4 / 8 / 12 px. Most surfaces use `2px`. Never use large pill radii. The aesthetic is "document", not "app".
- Spacing scale follows a loose 4px grid. Common paddings: 12, 16, 18, 20, 24, 28, 32, 40, 48, 56, 72, 96, 120 px.
- Tables use **hairline borders** (1px at 6–18% opacity), never heavy strokes.

### Icons

No icon library. Decorative marks in the prototype use single-character glyphs (▦ ≡ ◆ ◇ ◉ ⌂ ◎ ⌘ ◐ ! ›) — these are **placeholders**. In your implementation, swap in **Lucide** (thin, 1.5-stroke) or draw custom 16×16 line icons. Keep strokes thin; avoid filled shapes.

Nav icon glyph → suggested Lucide replacement:
- ▦ Dashboard → `LayoutDashboard`
- ≡ Positions → `Rows3`
- ◆ Recommendations → `Sparkle`
- ◇ Screener → `Scan`
- ◉ Watchlist → `Eye`
- ⌂ Trade journal → `BookOpen`
- ◎ Performance → `ChartLine`
- ⌘ Academy → `GraduationCap`
- ! Alerts → `Bell`
- ◐ Settings → `Settings`

---

## Screens

The README breaks each screen into **purpose**, **layout**, **components**, and **copy**. File references point into `prototype-src/` for deeper inspection of structure and exact strings.

### App shell (every authenticated screen)

**Layout:** `grid-template-columns: 240px 1fr`. Sidebar is fixed-position, full-height, `background: var(--bg-elev)`, right border `1px solid var(--line)`. Main content scrolls.

**Sidebar structure:**
1. Logo + wordmark at top (28px square wheat glyph in forest green + "Harvest" in Inter Tight 18px 600, letter-spacing −0.01em). Click → Dashboard.
2. Nav items grouped under section headers: **Portfolio** (Dashboard, Positions, Recommendations), **Trade** (Screener, Watchlist, Trade journal), **Research** (Performance, Academy), **System** (Alerts, Settings).
3. Section headers: mono 10px, uppercase, letter-spacing 0.14em, color `--fg-faint`, padding `18px 20px 6px`.
4. Each nav row: `8px 12px` padding, 4px radius, 12px gap, 13px text. Icon glyph in mono at `--fg-mute` (active: `--acid`). Active row gets `background: var(--bg-card)` + `1px solid var(--line)`. Badge (on Recommendations + Alerts) is a small square `background: --acid, color: --bg`, mono 10px, padding `2px 6px`.
5. Profile card at bottom: 28×28 avatar square in `--acid` with white initials, name in 12px 500, broker list in mono 10px `--fg-mute`.

**Top bar:**
- Screen title in Inter Tight 22px 500 on the left.
- Status row beneath: mono 11px `--fg-mute`, uppercase 0.08em: `MON · APR 20 2026 · 14:42 EST · ● MKT OPEN` (dot = `--acid`).
- Center: ⌘K search input, full-width, 40px tall, `--bg-card` with `1px solid --line`. Placeholder "Search tickers, strategies, settings…". Kbd hint "⌘K" right-aligned in mono 10px `--fg-faint`.
- Right: `Alerts` button with red dot indicator if there are unread; then primary **Sell a call** button (forest green, white text).

### Dashboard (default landing)

**Purpose:** Give the user a one-glance view of portfolio value, open short calls, and the current recommendation queue.

**Layout (top-down):**
1. **Equity header row** — three columns: big display ($284,520.42 in Instrument Serif 60px italic letter-spacing −0.02em) + "+$1,842 · +0.65% today" in `--acid`; then two eyebrow+value pairs ("PAST 90 DAYS", "6 OPPORTUNITIES", "NEXT EXPIRY MAY 16"). Padding 28px 32px.
2. **Equity line chart** — full-width SVG line, 120 days, ~160px tall. Line stroke 1.5px `--acid`. Annotated dots on major events ("AAPL 4×", "NVDA rolled", "expired"). Subtle y-axis gridlines at 4 levels in `--line-soft`. X-axis labels Jan/Feb/Mar/Apr in mono 10px `--fg-faint`. Time range chips top-right: 1M / 3M / YTD / 1Y / ALL — 3M default active.
3. **Open contracts strip** — horizontal list of currently-open short calls. Each item: ticker, strike/expiry in mono 11px, days-to-expiry badge, current delta, P&L. Click → opens the position detail.
4. **Positions table** — full-width. Header row `background: --bg-elev`, eyebrow-styled labels. Body rows 14px 18px padding, hairline bottom borders. Grid: `70px 1fr 90px 110px 110px 90px 90px 110px 24px` = Symbol / Name / Shares / Avg cost / Last / Day % / IV rank / Eligible / chevron. Click a row → expands an **inline drawer** (Dashboard direction A) showing the ranked recommendations for that ticker inline below. Other dashboard directions (B: calm with side panel; C: daily briefing) are alternates on the canvas.

**Positions table row behaviors:**
- Click anywhere → toggle drawer open/closed.
- IV rank ≥ 60 colored `--acid` (opportunity); <60 in `--fg-dim`.
- Day column colored `--acid` if positive, `--down` if negative.
- Eligible column shows "$980" (the max premium available from selling calls on eligible lots) or "—" if no lots eligible.

**Recommendation drawer (inline under a row):**
- Background `--bg-elev`, top and bottom `1px solid --line`.
- Two columns, `1.2fr 2fr`: left = 40-day price mini-chart with strike line overlay + three stat key/value pairs (IV rank, 30d range, Next earnings); right = list of recommendation cards.
- **RecCard** per candidate: `1.5fr 1fr 1fr 1fr 1fr auto` grid. Left border 2px colored by conviction (High=`--acid`, Med=`--olive`, Low=`--line-strong`). Shows conviction chip + score, the action string in mono 13.5px ("Sell 4× May 16 $200 Call"), one-line thesis in 12px `--fg-mute`, optional tags. Right side: four 2-up stat pairs (Premium / Ann. yield / PoP / Delta) then two buttons stacked: **Review →** (primary) and *Dismiss* (ghost).

### Positions (full screen)

Essentially the same table as the dashboard, promoted to a page. Title "All positions" in Instrument Serif 30px italic; subtitle "8 holdings · $482,400 market value" in 12px `--fg-mute`. Filter / Sort controls right-aligned in mono eyebrow style. Row click → navigates to **Position detail** (not just opening a drawer).

### Position detail

**Purpose:** Drill into a single ticker — full chart, lot table, current short calls, ranked recommendations.

**Layout:**
- Back chevron + ticker header (24px mono + company name in `--fg-dim`).
- Stats strip: Position (shares) / Avg cost / Market value / Unrealized $ + % — four columns, 18px 20px per cell, separated by 1px lines.
- 120-day price chart, 240px tall. Overlay: strike levels of any open short calls as dashed horizontal lines labeled with expiration.
- **Tabs:** Overview · Lots · Open calls · History · Research
- Overview content: two-column split — left is a markdown-style position summary (last earnings date, next earnings, 52w range, IV rank gauge); right is a sortable table of **ranked covered-call candidates**. Same RecCard visual language as the drawer, but larger: includes a mini payoff diagram on hover.

### Recommendations (full screen feed)

**Purpose:** A single feed of all current ideas across the user's portfolio.

**Layout:**
- Header: "Recommendations from your portfolio" in Instrument Serif 30px; subtitle "Updated 14:42 ET · N candidates across M tickers".
- Conviction filter chips top-right: All / High / Med / Low.
- Vertical list of full-width recommendation cards. Each card: `80px 1.8fr 90px 90px 80px 80px auto` grid. Left column = ticker (mono 16px) + score eyebrow. Main column = conviction chip + shares held + action string + thesis. Then stat pairs: Premium / Ann. yield / PoP / Delta. Right = **Review →** primary button + dismiss link underneath. Click the ticker → Position detail. Click Review → **Trade ticket**.

### Trade ticket

**Purpose:** Build a single covered-call order. This is the most interactive surface in the app.

**Layout:** Two columns, `1fr 1fr`, with `1px solid --line` divider.

**Left (order builder):**
- Header: back chevron → "New covered call" + Simple / Pro toggle top-right.
- **Underlying** select: dropdown of eligible positions (shows ticker + shares + last price). Right of dropdown: "Avg $162.40 · Last $194.32" in mono 12px `--fg-mute`.
- **Expiration** grid: 7 expirations as 2×4 tiles. Each tile = month + day in 13px. Selected tile has `background: --acid-faint`, `border: 1px solid --acid-line`. Days-to-expiry shown right of the grid ("26 days to expiry").
- **Strike** grid: 8 strikes as 2×4 tiles, each showing "$200" in mono 13px. Selected tile styled like expiry. Label above right: "2.9% OTM".
- **Contracts** stepper: `−  4  +` with the max count ("max 4" given 400 shares) shown right. Input is mono 14px.
- **Order type:** radio group — Market / Limit / Limit @ mid. If Limit selected, a price input appears beneath.
- **Time-in-force:** Day / GTC segmented control.

**Right (order preview):**
- "ORDER PREVIEW" eyebrow.
- Big summary card: "Sell to open" + the full order string in mono ("4× AAPL May 16 $200C @ $2.55").
- Four stat blocks in a 2×2 grid: Premium received (primary, in `--acid`, "$1,019" + "2.55 × 400" sub), Ann. yield ("22.0%" + "on AAPL basis"), P.O.P. ("58%" + "prob. profit"), If assigned ("80,000" + "+23.3% on shares" sub).
- **Payoff at expiry** diagram — SVG. X-axis: stock price from 90% to 115% of current. Y-axis: P&L. Three reference lines: basis (dashed `--fg-faint`), strike (dashed `--fg-mute`), break-even (solid `--acid-dim`). Payoff curve: flat negative below basis minus premium, sloping up 1:1 from basis until strike, then flat at max profit. Fill beneath in `--acid-faint`. Annotate the max-profit plateau "$6,219 max" in mono 11px.
- **Review** primary button at bottom-right, 44px tall. Disabled until a valid strike/expiry/contracts combination is selected.

**Pro toggle behavior:** switching to Pro adds:
- Greeks strip under the strike grid (delta, gamma, theta, vega).
- An options chain table replacing the tile grids, showing all strikes × expirations with bid/ask/IV/OI/delta columns.
- A rolling calendar for advanced expiry selection.

### Screener (chart-forward)

**Purpose:** Find covered-call opportunities outside the user's current holdings.

**Layout:** Three columns: `260px 1fr 320px`.

**Left — filters:**
- **Preset** chips: Wheel starters / High-IV income / Low-delta conservative / My watchlist / Custom. Selected has `background: --acid-faint`.
- Sliders: Delta (0.20–0.40, default 0.30), DTE (7–45), IV rank (≥25), Annualized yield (≥12%). Slider track 2px, handle 12×12 filled `--acid`.
- Price range inputs, sector multi-select (Tech / Consumer / Fin / Energy / Health).

**Center — scatter plot:**
- Axes: X = Premium (% of underlying), Y = Annualized yield (%). 43%/35%/27% axis labels rotated on the Y axis.
- ~50 dots. Color by conviction. Size by volume. Hover → tooltip with ticker, strike, expiration, delta.
- Selected dot (click) → highlighted in `--acid`, sends ticker to the right panel.
- Header text: "11 CANDIDATES · Each dot is a ticker's best near-month 0.30-delta call. Hover to select."

**Right — selected detail:**
- Ticker display in Instrument Serif 48px italic.
- Eyebrow: "NEAR-MONTH SETUP".
- Mini 30-day price chart, 100px tall.
- Four stat blocks: Premium / Ann. yield / Delta / IV rank.
- Short "Thesis" block — 3 sentences about why this setup is interesting.
- **Add to watchlist** button (secondary) + **Build order →** (primary, routes to ticket).

### Watchlist

Simple table: ticker, price, IV rank, 30d change, note field (inline editable), actions (Build order / Remove). Sortable by any column. Empty state: "Add tickers to watch premium opportunities as IV expands."

### Trade journal

**Purpose:** Historical trade log with outcomes.

**Layout:**
- **Summary bar** top: 5 equal-width cells separated by 1px — Realized YTD ($14,842) / Trades (47) / Win rate (81%) / Avg credit ($318) / Avg DTE (21d). Each cell: 18px 20px padding, label eyebrow + value in Instrument Serif 24px + sub in 11px.
- **Outcome filter chips**: all / expired / closed-early / assigned / rolled. Selected chip has `background: --acid-faint` + `border: 1px solid --acid`.
- **Trade table**: Date / Symbol / Action / Strike / Exp / Premium / Qty / Outcome (colored badge) / P&L / Return %. Outcomes colored: expired=`--acid`, closed-early=`--olive`, assigned=`--warn`, rolled=`--fg-dim`.

### Performance

**Purpose:** Long-range analytics.

**Layout:**
- Header stats: Total harvested ($48,290 since Aug 2023) / Ann. yield (11.2%) / Harvesting vs. SPY (+4.3% alpha) / Assignment rate (6%).
- Large cumulative-income chart (240 days of mock data, `--acid` line, `--acid-faint` fill beneath).
- Two side-by-side cards:
  - Left: **Contributors** — table of top P&L tickers this year.
  - Right: **Income mix** donut — Premium / Dividends / Assignment gains split.
- Monthly income bar chart at bottom, 12 bars.

### Alerts

Filter tabs: All / Assignment risk / Earnings / Recommendations / Fills / Dividends.
Alert rows: severity dot (warn/info), headline, detail paragraph, timestamp, action chip on right ("Review position" / "Roll now" / "Dismiss"). Severity-warn row has `border-left: 2px solid --warn`.

### Settings

Left rail: Brokers / Notifications / Tax Lots / Risk / Account / API. Active tab has `background: --bg-card`.

**Brokers tab:** list of connected brokers with last-synced timestamp, position count, status dot (green=connected, warn=needs reauth). Add-broker button opens a modal with Plaid or SnapTrade logo tiles.

**Notifications tab:** categories (Assignment risk, Earnings windows, New recommendations, Fills & assignments) × channels (Email / Push / SMS). Toggle grid.

**Risk tab:** sliders for Max % portfolio in short calls, Minimum DTE, Maximum delta, Exclude tickers near earnings (toggle).

### Academy

8 short learning modules. Grid of cards — each card: module number (01–08), title, 1-line description, duration, completion check. Minimal styling; card is `--bg-card` with `1px solid --line`, hover `box-shadow: 0 4px 12px rgba(24,28,20,0.06)`.

### Onboarding (4 steps)

Hit `App.html?onboard=1` to see it. Full-bleed, centered content, no app shell.

1. **Welcome** — "Put your portfolio to work." 1-sentence value prop. CTA: Continue.
2. **Connect broker** — broker tiles (Schwab, Fidelity, IBKR, Robinhood, E*TRADE, TastyTrade, Vanguard, Merrill). Click → Plaid flow (mocked). Skip available.
3. **Review positions** — preview of imported holdings, toggle which to include in recommendations.
4. **Risk profile** — 3 sliders: target yield, max delta, exclude earnings. Finish → Dashboard.

Progress indicator top: 4 dots, filled ones in `--acid`.

---

## Interactions & behavior

- **Route persistence:** current route written to `localStorage['harvest.route']`. On reload, restore. Reset to Dashboard on logo click.
- **No real API.** All data in the prototype is deterministic mock data seeded from ticker string hash (for charts). In production, wire to broker APIs.
- **Keyboard:** ⌘K should open command palette (search tickers, jump to screen, quick actions). Prototype stubs the input but doesn't implement the palette — build it with a library like `cmdk`.
- **Hover states:** table rows lighten background on hover (`rgba(24,28,20,0.02)`). Buttons darken background. Nav items show `--bg-card` background.
- **Transitions:** 150ms ease on background/border color changes. No page transitions; route changes are instant.
- **Loading:** table rows should use skeleton lines in `--line-soft` while data loads. Charts show a single dashed baseline until loaded.
- **Error states:** broker disconnect → warn banner at top of dashboard: "Schwab needs re-authorization — stale data from 2h ago." Click → reconnect flow.

---

## State management

**Client state:**
- Current route (persist to localStorage)
- Selected ticker (for position/ticket screens)
- Ticket draft (underlying, expiry, strike, contracts, order type, TIF)
- Filter states on screener, journal, recommendations
- Dashboard variant choice (A/B/C) — for now hardcoded to A

**Server state (fetch with TanStack Query):**
- `GET /portfolio/positions` — current positions across brokers
- `GET /portfolio/equity-curve?range=3M` — historical equity
- `GET /recommendations?sym=AAPL` or `?all=1` — ranked covered-call candidates; refresh on market moves
- `GET /trades?outcome=all` — journal
- `GET /options-chain?sym=AAPL&exp=2024-05-17` — for the Pro ticket
- `POST /orders` — place an order via broker connection
- `GET /brokers` + `POST /brokers/connect` — broker OAuth

**Recommendation ranking** — not prescribed; the prototype shows the UI for a ranked feed. Your backend decides the scoring. Fields the UI expects per rec:
```ts
{
  id: string;
  sym: string;
  conviction: "High" | "Med" | "Low";
  score: number;        // 0–100
  action: string;       // "Sell 4× May 16 $200 Call"
  premium: number;      // total $ collected
  annYield: number;     // %
  pop: number;          // probability of profit, %
  delta: number;        // 0–1
  thesis: string;       // one-line rationale
  tags: string[];       // ["no-earnings", "above-cost-basis", ...]
  expiry: string;       // ISO date
  strike: number;
  contracts: number;
}
```

---

## Assets

- **Logo / wordmark**: the prototype uses an inline SVG wheat-sheaf glyph (see `components/Logo.jsx`). Replace with a real brand mark when ready.
- **Icons**: none bundled. Use Lucide.
- **Fonts**: Google Fonts (Inter, Inter Tight, Instrument Serif, JetBrains Mono). Self-host for production.
- **Imagery**: no imagery in the prototype. If you add editorial photos on marketing pages, use duotone filtering to `--bg-elev` / `--acid` to match the system.

---

## Files in this bundle

```
design_handoff_harvest/
├── README.md                     ← this file
├── tokens.json                   ← machine-readable design tokens
├── tokens.css                    ← CSS custom properties + base utility classes
├── Index.html                    ← entry page linking the two deliverables
├── Harvest.html                  ← design canvas (static frames)
├── App.html                      ← clickable prototype
└── prototype-src/                ← component sources, for reference
    ├── app-prototype.jsx         ← main app router
    ├── Logo.jsx
    ├── Charts.jsx                ← hand-rolled SVG chart components
    ├── Data.jsx                  ← all mock data (positions, recs, history)
    ├── Dashboard.jsx             ← dashboard variants + PositionsTable + RecCard
    ├── Screener.jsx
    ├── AppShell.jsx              ← sidebar + topbar
    ├── AppScreens.jsx            ← Journal, Performance, Watchlist, Alerts, Settings, Academy
    ├── PositionDetail.jsx
    ├── TradeTicket.jsx           ← Simple + Pro toggle + payoff diagram
    └── Onboarding.jsx
```

Treat `prototype-src/*.jsx` as **reference**, not source to transplant. The components mix concerns (data + presentation) in ways appropriate for a single-file prototype but wrong for a real codebase. Re-structure into your standard component + hook + data-fetching layers.

---

## Implementation priorities (suggested order)

1. **Design system layer first.** Pull tokens into Tailwind theme or your CSS-in-JS setup. Load the four fonts. Build the `Button`, `Chip`, `EyebrowLabel`, `StatCell`, `Card` primitives. Verify against `tokens.css`.
2. **App shell + routing.** Sidebar, top bar, route structure. Render placeholder content per screen.
3. **Real broker integration.** Plaid or SnapTrade. Get read-only positions flowing. This unblocks everything else.
4. **Positions table + dashboard.** Render real holdings. Wire the equity chart to broker historical data (or backfill with yfinance).
5. **Recommendation engine.** The UI is ready; the scoring logic is yours.
6. **Trade ticket.** Hardest screen. Build the options chain (use OPRA data from your broker or a market-data vendor like Polygon). The payoff diagram is pure math — see `TradeTicket.jsx` for the formula.
7. **Journal, performance, alerts** — all read-oriented, wire up once trades flow.
8. **Academy** — content effort, not engineering. Write the modules.
9. **Onboarding** — the flow logic is simple once broker connect works.

---

## Open questions for the product team (flagged from the design process)

- **Order placement:** does Harvest *place* orders, or only *prepare* them for one-click placement in the broker's own UI? This changes everything about the Trade ticket's "Review" button.
- **Pricing model:** subscription (SaaS), percentage of income harvested, or flat per-contract fee? The marketing canvas has a pricing page direction, but numbers are placeholders.
- **Regulatory scope:** "read-only via Plaid" means no RIA registration needed, but if Harvest recommends specific trades, that may cross into investment advice. Legal review required before launch.
- **Brand mark:** the wheat glyph is a placeholder. Commission real identity work before marketing launch.

---

## Contact / continuity

Continue iterating the design by opening the source project and pointing the next Claude session at `Harvest.html` + `App.html`. Component structure is stable; all color/type/spacing changes should flow through `tokens.css` first.
