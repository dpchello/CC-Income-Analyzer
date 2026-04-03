import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard.jsx'
import Positions from './components/Positions.jsx'
import SignalEngine from './components/SignalEngine.jsx'
import AddPosition from './components/AddPosition.jsx'
import AlertBanner from './components/AlertBanner.jsx'

const TABS = ['Dashboard', 'Positions', 'Signal Engine', 'Add Position']

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

  const highAlerts = signalData?.position_alerts?.filter(a => a.urgency === 'HIGH') || []

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-sans">
      {/* Header */}
      <header className="panel border-b border-terminal-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-mono text-terminal-green font-semibold tracking-widest text-sm">
            SPY COVERED CALL TRACKER
          </span>
          {dashData?.spy && (
            <span className="font-mono text-base">
              <span className="text-white font-semibold">${dashData.spy.price.toFixed(2)}</span>
              <span className={`ml-2 text-sm ${dashData.spy.change >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {dashData.spy.change >= 0 ? '+' : ''}{dashData.spy.change.toFixed(2)} ({dashData.spy.change_pct.toFixed(2)}%)
              </span>
              <span className="ml-2 text-xs text-terminal-muted pulse-green">● LIVE</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs font-mono text-terminal-muted">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {signalData && (
            <span className={`text-xs font-mono px-2 py-1 font-semibold border ${
              signalData.regime === 'SELL PREMIUM'
                ? 'text-terminal-green border-terminal-green bg-terminal-green/10'
                : signalData.regime === 'HOLD'
                ? 'text-terminal-amber border-terminal-amber bg-terminal-amber/10'
                : signalData.regime === 'CAUTION'
                ? 'text-orange-400 border-orange-400 bg-orange-400/10'
                : 'text-terminal-red border-terminal-red bg-terminal-red/10'
            }`}>
              {signalData.regime} [{signalData.total_score}/{signalData.max_score}]
            </span>
          )}
        </div>
      </header>

      {/* Alert Banner */}
      {highAlerts.length > 0 && <AlertBanner alerts={highAlerts} signalData={signalData} dashData={dashData} />}

      {/* Tabs */}
      <nav className="panel border-b border-terminal-border px-4 flex gap-0">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-terminal-green text-terminal-green'
                : 'border-transparent text-terminal-muted hover:text-terminal-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="font-mono text-terminal-muted text-sm animate-pulse">Loading market data...</span>
          </div>
        ) : (
          <>
            {activeTab === 'Dashboard' && <Dashboard dashData={dashData} signalData={signalData} />}
            {activeTab === 'Positions' && <Positions positions={positions} onRefresh={fetchAll} />}
            {activeTab === 'Signal Engine' && <SignalEngine signalData={signalData} />}
            {activeTab === 'Add Position' && <AddPosition onAdded={() => { fetchAll(); setActiveTab('Positions') }} />}
          </>
        )}
      </main>
    </div>
  )
}
