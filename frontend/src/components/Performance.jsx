import StrategyPerformance from './StrategyPerformance.jsx'

// Strategy archetypes that map cleanly to a fixed SPY backtest. The
// portfolio-scoped "available" preset is excluded — it depends on the user's
// own holdings, so a generic SPY backtest can't represent it.
const STRATEGIES = [
  { id: 'conservative', label: 'Conservative',          hint: 'Calm-market 30-delta · IV ≤ 15% · 28–42 DTE' },
  { id: 'wheel',        label: 'Wheel starters',         hint: 'Low risk, 30-delta ceiling' },
  { id: 'safe',         label: 'Low-delta conservative', hint: 'Capital preservation first' },
  { id: 'income',       label: 'High-IV income',         hint: 'Aggressive yield, 40-delta' },
  { id: 'watch',        label: 'From my watchlist',      hint: 'Watchlist ideas, IV ≤ 15%' },
]

export default function Performance() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>Strategy Performance</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-mute)' }}>
          Historical backtest of each covered-call strategy on SPY — with and without Harvest's
          market-signal engine. Expand a card to run the backtest.
        </p>
      </div>

      {STRATEGIES.map(s => (
        <div key={s.id}>
          <div className="mb-1.5">
            <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{s.label}</span>
            <span className="text-xs ml-2" style={{ color: 'var(--fg-mute)' }}>{s.hint}</span>
          </div>
          <StrategyPerformance strategyId={s.id} ticker="SPY" />
        </div>
      ))}
    </div>
  )
}
