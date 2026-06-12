import { useState, useEffect, useCallback, useRef } from 'react'
import Dashboard from './components/Dashboard.jsx'
import Portfolios from './components/Portfolios.jsx'
import SignalTracker from './components/SignalTracker.jsx'
import Screener from './components/Screener.jsx'
import Settings from './components/Settings.jsx'
import ScoreGuide from './components/ScoreGuide.jsx'
import Sidebar, { TopBar } from './components/Sidebar.jsx'
import AuthGate from './components/AuthGate.jsx'
import UpgradeModal from './components/UpgradeModal.jsx'
import PlaceholderScreen from './components/PlaceholderScreen.jsx'
import Recommendations from './components/Recommendations.jsx'
import Markets from './components/Markets.jsx'
import Performance from './components/Performance.jsx'
import { useAuth } from './auth.jsx'

function computeAlertCount(positions) {
  if (!positions?.length) return 0
  return positions.filter(p => {
    if (p.status !== 'open') return false
    if (p.dte <= 7) return true
    if (p.distance_to_strike_pct != null && p.distance_to_strike_pct <= 1.5 && p.distance_to_strike_pct > 0) return true
    return false
  }).length
}

export default function App() {
  const { user, ready, logout, apiFetch } = useAuth()
  const [activeTab, setActiveTab]   = useState(
    () => localStorage.getItem('harvest.route') || 'Dashboard'
  )
  const [dashData, setDashData]     = useState(null)
  const [signalData, setSignalData] = useState(null)
  const [positions, setPositions]   = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [holdings, setHoldings]     = useState([])
  const [alphaData, setAlphaData]   = useState({ news: null, technicals: null, usage: null })
  const [pnlData, setPnlData]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [upgradeModal, setUpgradeModal] = useState(null)
  const [screenerTicker, setScreenerTicker] = useState(null)
  const [snapHealth, setSnapHealth] = useState(null)
  // TODO PIPE-REC-02: Replace with real count once GET /recommendations ships
  const [recCount, setRecCount] = useState(0)

  const safeFetch = useCallback((url) =>
    apiFetch(url).then(r => {
      if (!r.ok) throw new Error(`${url} ${r.status}`)
      return r.json()
    }),
  [apiFetch])

  const fetchAll = useCallback(async () => {
    const [dash, sig, pos, ptf, hld, news, tech, usage, pnl, snapH] = await Promise.all([
      safeFetch('/api/dashboard').catch(() => undefined),
      safeFetch('/api/signals').catch(() => undefined),
      safeFetch('/api/positions').catch(() => undefined),
      safeFetch('/api/portfolios').catch(() => undefined),
      safeFetch('/api/holdings').catch(() => undefined),
      safeFetch('/api/alpha/news').catch(() => null),
      safeFetch('/api/alpha/technicals').catch(() => null),
      safeFetch('/api/alpha/usage').catch(() => null),
      safeFetch('/api/pnl-summary').catch(() => null),
      safeFetch('/api/snaptrade/health').catch(() => null),
    ])
    // Only update state for critical fetches that succeeded (not undefined).
    // A transient 500 must NOT overwrite previously loaded data with [].
    const anyCoreFailed = dash === undefined || sig === undefined ||
      pos === undefined || ptf === undefined || hld === undefined
    if (dash !== undefined) setDashData(dash)
    if (sig !== undefined) setSignalData(sig)
    if (pos !== undefined) setPositions(pos)
    if (ptf !== undefined) setPortfolios(ptf)
    if (hld !== undefined) setHoldings(hld)
    setAlphaData({ news: news ?? null, technicals: tech ?? null, usage: usage ?? null })
    setPnlData(pnl ?? null)
    setSnapHealth(snapH ?? null)
    setFetchError(anyCoreFailed)
    setLoading(false)
  }, [safeFetch])

  useEffect(() => {
    if (!user) return
    fetchAll()
    const id = setInterval(fetchAll, 60_000)
    return () => clearInterval(id)
  }, [fetchAll, user])

  function navigate(tab, params = {}) {
    setActiveTab(tab)
    localStorage.setItem('harvest.route', tab)
    if (tab === 'Screener' && params.ticker) setScreenerTicker(params.ticker)
  }

  const alertCount = computeAlertCount(positions)

  if (!ready) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        border: '2px solid var(--acid)',
        borderTopColor: 'transparent',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  )

  if (!user) return <AuthGate />

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      {/* Left sidebar */}
      <Sidebar
        activeTab={activeTab}
        onNavigate={navigate}
        alertCount={alertCount}
        recCount={recCount}
      />

      {/* Right: topbar + content */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          activeTab={activeTab}
          alertCount={alertCount}
          onNavigate={navigate}
        />

        {snapHealth?.needs_reconnect && (
          <div style={{
            padding: '10px 24px', fontSize: 12,
            background: 'rgba(255,176,32,0.08)',
            borderBottom: '1px solid var(--amber)',
            color: 'var(--amber)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span>⚠ One or more brokerage connections need reconnecting.</span>
            <a
              href="#"
              onClick={e => { e.preventDefault(); navigate('Portfolios') }}
              style={{ color: 'var(--amber)', textDecoration: 'underline' }}
            >
              Go to Portfolios →
            </a>
          </div>
        )}

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {fetchError && !loading && (
            <div style={{
              padding: '10px 24px', fontSize: 13, marginBottom: 16,
              background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: 'var(--radius-md)', color: 'var(--fg)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span>Couldn't load some data — this is usually temporary.</span>
              <button
                onClick={fetchAll}
                style={{
                  fontSize: 12, padding: '4px 12px', cursor: 'pointer',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface)', color: 'var(--fg)',
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <LoadingState />
          ) : (
            <Screen
              activeTab={activeTab}
              dashData={dashData}
              signalData={signalData}
              positions={positions}
              portfolios={portfolios}
              holdings={holdings}
              alphaData={alphaData}
              pnlData={pnlData}
              user={user}
              onNavigate={navigate}
              onRefresh={fetchAll}
              onUpgrade={r => setUpgradeModal({ reason: r })}
              screenerTicker={screenerTicker}
            />
          )}
        </main>
      </div>

      {upgradeModal && (
        <UpgradeModal
          onClose={() => setUpgradeModal(null)}
          triggerReason={upgradeModal.reason}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          border: '2px solid var(--acid)', borderTopColor: 'transparent',
          animation: 'spin 0.7s linear infinite', margin: '0 auto 10px',
        }} />
        <p style={{ fontSize: 13, color: 'var(--fg-mute)' }}>Loading…</p>
      </div>
    </div>
  )
}

function Screen({
  activeTab, dashData, signalData, positions, portfolios, holdings,
  alphaData, pnlData, user, onNavigate, onRefresh, onUpgrade, screenerTicker,
}) {
  switch (activeTab) {
    case 'Dashboard':
      return (
        <Dashboard
          dashData={dashData} signalData={signalData} positions={positions}
          holdings={holdings} alphaData={alphaData} pnlData={pnlData}
          onNavigate={onNavigate}
        />
      )
    case 'Portfolios':
      return (
        <Portfolios
          positions={positions} portfolios={portfolios} holdings={holdings}
          dashData={dashData} signalData={signalData} onRefresh={onRefresh}
          userTier={user.tier} onUpgrade={onUpgrade}
        />
      )
    case 'Screener':
      return (
        <Screener
          portfolios={portfolios} holdings={holdings} positions={positions}
          onRefresh={onRefresh} signalData={signalData}
          userTier={user.tier} onUpgrade={onUpgrade}
          initialTicker={screenerTicker}
        />
      )
    case 'Signal Tracker':
      return <SignalTracker signalData={signalData} alphaData={alphaData} />
    case 'Markets':
      return <Markets user={user} onUpgrade={onUpgrade} />
    case 'Score Guide':
      return <ScoreGuide />
    case 'Settings':
      return <Settings onRefresh={onRefresh} alphaUsage={alphaData.usage} />
    // ── New screens — placeholder until implemented ──────────────────────
    case 'Recommendations':
      return (
        <Recommendations
          portfolios={portfolios}
          holdings={holdings}
          positions={positions}
          onNavigate={onNavigate}
        />
      )
    case 'Watchlist':
      return <PlaceholderScreen id="Watchlist" label="Watchlist" icon="Eye" onNavigate={onNavigate} />
    case 'Journal':
      return <PlaceholderScreen id="Journal" label="Trade journal" icon="BookOpen" onNavigate={onNavigate} />
    case 'Performance':
      return <Performance />
    case 'Academy':
      return <PlaceholderScreen id="Academy" label="Academy" icon="GraduationCap" onNavigate={onNavigate} />
    case 'Alerts':
      return <PlaceholderScreen id="Alerts" label="Alerts" icon="Bell" onNavigate={onNavigate} />
    default:
      return null
  }
}
