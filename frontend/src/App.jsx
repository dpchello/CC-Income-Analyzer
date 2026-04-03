import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard.jsx'
import Portfolios from './components/Portfolios.jsx'
import SignalTracker from './components/SignalTracker.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'Dashboard', label: 'Dashboard' },
  { id: 'Portfolios', label: 'Portfolios' },
  { id: 'Signal Tracker', label: 'Signal Tracker' },
  { id: 'Settings', label: 'Settings' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [dashData, setDashData] = useState(null)
  const [signalData, setSignalData] = useState(null)
  const [positions, setPositions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [dash, sig, pos] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/signals').then(r => r.json()),
        fetch('/api/positions').then(r => r.json()),
      ])
      setDashData(dash)
      setSignalData(sig)
      setPositions(pos)
      setLastUpdated(new Date())
    } catch (e) {
      console.error('Fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#c8d6e5] font-sans">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-[#0f1629] border-b border-[#1e2d4a] px-6 py-0 flex items-center justify-between h-14">
        {/* App name */}
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-base tracking-tight">Covered Call Generator</span>
          {lastUpdated && (
            <span className="text-xs text-[#4a5568]">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Tabs */}
        <nav className="flex h-full">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 h-full text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#00ff88] text-white'
                  : 'border-transparent text-[#4a5568] hover:text-[#c8d6e5]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Content ────────────────────────────────────────────── */}
      <main className="px-6 py-6 max-w-screen-xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[#4a5568]">Loading market data…</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'Dashboard' && (
              <Dashboard
                dashData={dashData}
                signalData={signalData}
                positions={positions}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'Portfolios' && (
              <Portfolios positions={positions} dashData={dashData} signalData={signalData} onRefresh={fetchAll} />
            )}
            {activeTab === 'Signal Tracker' && (
              <SignalTracker signalData={signalData} dashData={dashData} />
            )}
            {activeTab === 'Settings' && (
              <Settings onRefresh={fetchAll} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
