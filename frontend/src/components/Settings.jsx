import { useState } from 'react'
import AddPosition from './AddPosition.jsx'

export default function Settings({ onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-sm text-[#4a5568] mt-0.5">Manage positions and app configuration</p>
      </div>

      {/* Add position */}
      <div className="bg-[#0f1629] border border-[#1e2d4a] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-white">Add New Position</div>
            <div className="text-xs text-[#4a5568] mt-0.5">Record a new covered call you've sold</div>
          </div>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-xs px-3 py-1.5 border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Position'}
          </button>
        </div>
        {showAdd && <AddPosition onAdded={() => { setShowAdd(false); onRefresh() }} />}
      </div>

      {/* Strategy reference */}
      <div className="bg-[#0f1629] border border-[#1e2d4a] p-5 space-y-3">
        <div className="text-sm font-semibold text-white">Strategy Reference</div>
        <div className="space-y-2 text-xs text-[#4a5568] leading-relaxed">
          {[
            ['Target DTE', '30–45 days to expiration for new entries'],
            ['Strike Selection', '2–3% out-of-the-money (delta ~0.10–0.15)'],
            ['Profit Exit', 'Close at 50% of premium collected — improves annualized return'],
            ['Roll Trigger', '21 DTE — roll to next expiry before gamma risk accelerates'],
            ['Avoid', 'Opening new calls when IV Rank < 15 or SPY 20-day MA slope > 1.5%/mo'],
            ['Position Size', '6 contracts per leg (covers 600 shares)'],
          ].map(([key, val]) => (
            <div key={key} className="flex gap-3">
              <span className="text-[#c8d6e5] w-36 shrink-0">{key}</span>
              <span>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data info */}
      <div className="bg-[#0f1629] border border-[#1e2d4a] p-5 space-y-2">
        <div className="text-sm font-semibold text-white">Data Sources</div>
        <div className="text-xs text-[#4a5568] space-y-1">
          <p>Market data: <span className="text-[#c8d6e5]">yfinance (free, no API key required)</span></p>
          <p>Refresh interval: <span className="text-[#c8d6e5]">60 seconds</span></p>
          <p>Position storage: <span className="text-[#c8d6e5]">positions.json (local file)</span></p>
        </div>
      </div>
    </div>
  )
}
