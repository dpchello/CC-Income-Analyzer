import { ScreenerPanel, OIChart } from './SignalTracker.jsx'

export default function Screener({ portfolios, holdings, positions, onRefresh, signalData, userTier, onUpgrade, initialTicker }) {
  const regime = signalData?.regime

  return (
    <div className="space-y-6">
      <ScreenerPanel
        portfolios={portfolios}
        holdings={holdings}
        positions={positions}
        onRefresh={onRefresh}
        regime={regime}
        userTier={userTier}
        onUpgrade={onUpgrade}
        initialTicker={initialTicker}
      />
      <OIChart />
    </div>
  )
}
