import { useState, useEffect, useCallback, useRef } from 'react'
import Dashboard from './components/Dashboard.jsx'
import Portfolios from './components/Portfolios.jsx'
import SignalTracker from './components/SignalTracker.jsx'
import Screener from './components/Screener.jsx'
import Settings from './components/Settings.jsx'
import ScoreGuide from './components/ScoreGuide.jsx'
import Sidebar, { MobileMenuButton } from './components/Sidebar.jsx'

// Compute alert count: positions with URGENT or HIGH urgency
function computeAlertCount(positions) {
  if (!positions || !positions.length) return 0
  return positions.filter(p => {
    if (p.status !== 'open') return false
    if (p.dte <= 7) return true                                                                                      // GAMMA_DANGER → URGENT
    if (p.distance_to_strike_pct != null && p.distance_to_strike_pct <= 1.5 && p.distance_to_strike_pct > 0) return true  // STRIKE_BREACH → URGENT
    return false
  }).length
}

export default function App() {
  const [activeTab, setActiveTab]     = useState('Dashboard')
  const [dashData, setDashData]       = useState(null)
  const [signalData, setSignalData]   = useState(null)
  const [positions, setPositions]     = useState([])
  const [portfolios, setPortfolios]   = useState([])
  const [holdings, setHoldings]       = useState([])
  const [alphaData, setAlphaData]     = useState({ news: null, technicals: null, usage: null })
  const [pnlData, setPnlData]         = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [stripDismissed, setStripDismissed] = useState(
    () => sessionStorage.getItem('alertStripDismissed') === 'true'
  )

  const fetchAll = useCallback(async () => {
    try {
      const [dash, sig, pos, ptf, hld, news, tech, usage, pnl] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/signals').then(r => r.json()),
        fetch('/api/positions').then(r => r.json()),
        fetch('/api/portfolios').then(r => r.json()),
        fetch('/api/holdings').then(r => r.json()),
        fetch('/api/alpha/news').then(r => r.json()).catch(() => null),
        fetch('/api/alpha/technicals').then(r => r.json()).catch(() => null),
        fetch('/api/alpha/usage').then(r => r.json()).catch(() => null),
        fetch('/api/pnl-summary').then(r => r.json()).catch(() => null),
      ])
      setDashData(dash)
      setSignalData(sig)
      setPositions(pos)
      setPortfolios(ptf)
      setHoldings(hld)
      setAlphaData({ news, technicals: tech, usage })
      setPnlData(pnl)
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

  const alertCount = computeAlertCount(positions)

  // When user navigates to Portfolios, mark alerts as seen for this session
  function handleNavigate(tab) {
    setActiveTab(tab)
    if (tab === 'Portfolios') {
      sessionStorage.setItem('alertStripDismissed', 'true')
      setStripDismissed(true)
    }
  }

  // Reset strip dismissal when alert count rises (new urgent position appeared)
  const prevAlertCountRef = useRef(0)
  useEffect(() => {
    if (alertCount > prevAlertCountRef.current) {
      sessionStorage.removeItem('alertStripDismissed')
      setStripDismissed(false)
    }
    prevAlertCountRef.current = alertCount
  }, [alertCount])

  const showAlertStrip = alertCount > 0 && activeTab !== 'Portfolios' && !stripDismissed

  function dismissStrip() {
    sessionStorage.setItem('alertStripDismissed', 'true')
    setStripDismissed(true)
  }

  return (
    <div className="flex min-h-screen font-sans" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Desktop Sidebar ───────────────────────────────────────────── */}
      <Sidebar activeTab={activeTab} onNavigate={handleNavigate} alertCount={alertCount} />

      {/* ── Right column: header + content ───────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Slim Header ────────────────────────────────────────────── */}
        <header
          className="px-5 flex items-center justify-between h-14 border-b flex-shrink-0"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            {/* Hamburger — visible on mobile only, opens the Sidebar drawer */}
            <MobileMenuButton />
            <span className="font-semibold text-base tracking-tight" style={{ color: 'var(--text)' }}>
              🌾 Harvest
            </span>
            {lastUpdated && (
              <span className="text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>

          <button
            onClick={async () => { setRefreshing(true); await fetchAll(); setRefreshing(false) }}
            disabled={refreshing}
            title="Refresh all data"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: refreshing ? 'var(--muted)' : 'var(--text)',
              backgroundColor: 'transparent',
              borderRadius: 'var(--radius-sm)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            <span
              className={refreshing ? 'animate-spin' : ''}
              style={{ display: 'inline-block', fontSize: '11px' }}
            >↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {/* ── Content ────────────────────────────────────────────────── */}
        <main className="px-6 py-6 flex-1 overflow-y-auto">
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
                  holdings={holdings}
                  alphaData={alphaData}
                  pnlData={pnlData}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === 'Portfolios' && (
                <Portfolios
                  positions={positions}
                  portfolios={portfolios}
                  holdings={holdings}
                  dashData={dashData}
                  signalData={signalData}
                  onRefresh={fetchAll}
                />
              )}
              {activeTab === 'Screener' && (
                <Screener
                  portfolios={portfolios}
                  holdings={holdings}
                  positions={positions}
                  onRefresh={fetchAll}
                  signalData={signalData}
                />
              )}
              {activeTab === 'Signal Tracker' && (
                <SignalTracker
                  signalData={signalData}
                  alphaData={alphaData}
                />
              )}
              {activeTab === 'Score Guide' && <ScoreGuide />}
              {activeTab === 'Settings' && (
                <Settings onRefresh={fetchAll} alphaUsage={alphaData.usage} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
