import { useState, useEffect, useCallback } from 'react'
import { useTheme } from './theme.jsx'
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
  const [alphaData, setAlphaData] = useState({ news: null, technicals: null, usage: null })
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()

  const fetchAll = useCallback(async () => {
    try {
      const [dash, sig, pos, news, tech, usage] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/signals').then(r => r.json()),
        fetch('/api/positions').then(r => r.json()),
        fetch('/api/alpha/news').then(r => r.json()).catch(() => null),
        fetch('/api/alpha/technicals').then(r => r.json()).catch(() => null),
        fetch('/api/alpha/usage').then(r => r.json()).catch(() => null),
      ])
      setDashData(dash)
      setSignalData(sig)
      setPositions(pos)
      setAlphaData({ news, technicals: tech, usage })
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
    <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <header
        className="px-6 py-0 flex items-center justify-between h-14 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-base tracking-tight" style={{ color: 'var(--text)' }}>
            Covered Call Generator
          </span>
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <nav className="flex h-full">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-5 h-full text-sm font-medium border-b-2 transition-colors"
              style={{
                borderColor: activeTab === tab.id ? 'var(--green)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Content ──────────────────────────────────────────── */}
      <main className="px-6 py-6 max-w-screen-xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-2">
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading market data…</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'Dashboard' && (
              <Dashboard
                dashData={dashData}
                signalData={signalData}
                positions={positions}
                alphaData={alphaData}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'Portfolios' && (
              <Portfolios positions={positions} dashData={dashData} signalData={signalData} onRefresh={fetchAll} />
            )}
            {activeTab === 'Signal Tracker' && (
              <SignalTracker signalData={signalData} dashData={dashData} alphaData={alphaData} />
            )}
            {activeTab === 'Settings' && (
              <Settings onRefresh={fetchAll} alphaUsage={alphaData.usage} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
