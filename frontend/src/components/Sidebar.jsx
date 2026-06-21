import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Rows3, Sparkle, Scan, Eye,
  BookOpen, ChartLine, GraduationCap, Bell, Settings, Gauge, BarChart3,
} from 'lucide-react'
import { HarvestLogo } from './ui/Logo.jsx'
import { Badge } from './ui/primitives.jsx'
import { useAuth } from '../auth.jsx'

// ── Nav structure ─────────────────────────────────────────────────────────────

const NAV = [
  { section: 'Portfolio' },
  { id: 'Dashboard',       label: 'Dashboard',       Icon: LayoutDashboard },
  { id: 'Portfolios',      label: 'Positions',        Icon: Rows3 },
  { id: 'Recommendations', label: 'Recommendations',  Icon: Sparkle,       badge: true },
  { section: 'Trade' },
  { id: 'Signal Tracker',  label: 'Signals',          Icon: Gauge },
  { id: 'Screener',        label: 'Screener',         Icon: Scan },
  { id: 'Watchlist',       label: 'Watchlist',        Icon: Eye },
  { id: 'Journal',         label: 'Trade journal',    Icon: BookOpen },
  { section: 'Research' },
  { id: 'Markets',         label: 'Markets',          Icon: BarChart3 },
  { id: 'Performance',     label: 'Performance',      Icon: ChartLine },
  { id: 'Academy',         label: 'Academy',          Icon: GraduationCap },
  { section: 'System' },
  { id: 'Alerts',          label: 'Alerts',           Icon: Bell,          alertBadge: true },
  { id: 'Settings',        label: 'Settings',         Icon: Settings },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar({
  activeTab, onNavigate, alertCount = 0, recCount = 0,
  isMobile = false, open = false, onClose,
  collapsed = false, onToggleCollapse,
}) {
  const { user, logout } = useAuth()

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'HV'

  // On mobile the sidebar is a fixed off-canvas drawer that slides in over the
  // content (backdrop rendered by App.jsx). On desktop it's a sticky column.
  const mobileStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 60, // above the backdrop (z40); see App.jsx note on iOS fixed-element paint order
    width: 'min(280px, 84vw)',
    height: '100dvh',
    transform: open ? 'translateX(0)' : 'translateX(-110%)',
    transition: 'transform var(--ui)',
    boxShadow: open ? 'var(--shadow-modal)' : 'none',
  }
  const desktopStyle = {
    position: 'sticky',
    top: 0,
    height: '100vh',
    width: collapsed ? 60 : 240,
    transition: 'width var(--ui)',
  }

  return (
    <aside style={{
      flexShrink: 0,
      background: 'var(--bg-elev)',
      borderRight: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden',
      ...(isMobile ? mobileStyle : desktopStyle),
    }}>
      {/* Logo + collapse/close control */}
      <div style={{
        padding: collapsed ? '20px 0 24px' : '20px 20px 24px',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
      }}>
        {!collapsed && <HarvestLogo size={18} />}
        {isMobile ? (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 20, lineHeight: 1,
              color: 'var(--fg-mute)', padding: 4,
            }}
          >
            ✕
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 16, lineHeight: 1,
              color: 'var(--fg-mute)', padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {collapsed ? '»' : '«'}
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((item, i) => {
          if (item.section) {
            // Collapsed rail: section label becomes a thin divider.
            if (collapsed) {
              return <div key={`s${i}`} style={{ height: 1, background: 'var(--line)', margin: '12px 14px 6px' }} />
            }
            return (
              <div key={`s${i}`} style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--fg-faint)',
                padding: '18px 20px 6px',
              }}>
                {item.section}
              </div>
            )
          }

          const active = activeTab === item.id
          const badge = item.badge ? recCount : item.alertBadge ? alertCount : 0

          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                margin: collapsed ? '0 8px' : '0 10px',
                padding: collapsed ? '9px 0' : '8px 12px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 12,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                background: active ? 'var(--bg-card)' : 'transparent',
                border: active ? '1px solid var(--line)' : '1px solid transparent',
                transition: 'background var(--ui), color var(--ui)',
              }}
            >
              <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                <item.Icon
                  size={collapsed ? 16 : 14}
                  strokeWidth={1.5}
                  style={{ color: active ? 'var(--acid)' : 'var(--fg-mute)' }}
                />
                {collapsed && badge > 0 && (
                  <span style={{
                    position: 'absolute', top: -3, right: -4,
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)',
                  }} />
                )}
              </span>
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && badge > 0 && <Badge count={badge} />}
            </div>
          )
        })}
      </nav>

      {/* Account card — avatar only when collapsed (tap to sign out) */}
      <div style={{
        margin: collapsed ? 8 : 12,
        padding: collapsed ? 6 : 12,
        border: '1px solid var(--line)',
        borderRadius: 4,
        background: 'var(--bg-card)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div
            onClick={collapsed ? logout : undefined}
            onKeyDown={collapsed ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logout() } } : undefined}
            role={collapsed ? 'button' : undefined}
            tabIndex={collapsed ? 0 : undefined}
            aria-label={collapsed ? 'Sign out' : undefined}
            title={collapsed ? `${user?.username || 'Account'} — sign out` : undefined}
            style={{
              width: 28, height: 28, borderRadius: 4,
              background: 'var(--acid)',
              color: 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 11,
              flexShrink: 0,
              cursor: collapsed ? 'pointer' : 'default',
            }}>
            {initials}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username || 'Account'}
              </div>
              <button
                onClick={logout}
                style={{
                  all: 'unset',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--fg-mute)',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────

const TITLE_MAP = {
  Dashboard:       'Dashboard',
  Portfolios:      'Positions',
  Recommendations: 'Recommendations',
  Screener:        'Screener',
  Watchlist:       'Watchlist',
  Journal:         'Trade journal',
  Performance:     'Performance',
  Academy:         'Academy',
  Alerts:          'Alerts',
  Settings:        'Settings',
  'Signal Tracker':'Market Conditions',
  'Score Guide':   'How It Works',
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function TopBar({ activeTab, alertCount = 0, onNavigate, isMobile = false, onMenu }) {
  const now = useClock()
  const searchRef = useRef(null)
  const [searchVal, setSearchVal] = useState('')

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const months   = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const day  = dayNames[now.getDay()]
  const date = `${months[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`
  const hh   = now.getHours().toString().padStart(2, '0')
  const mm   = now.getMinutes().toString().padStart(2, '0')

  // Simple market hours check (ET, Mon–Fri 9:30–16:00)
  const etOffset = -4 // EDT; adjust for EST if needed
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60
  const etHour  = utcHour + etOffset
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5
  const mktOpen = isWeekday && etHour >= 9.5 && etHour < 16

  return (
    <div style={{
      height: 56,
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      padding: isMobile ? '0 14px' : '0 28px',
      gap: isMobile ? 10 : 16,
      position: 'sticky',
      top: 0,
      zIndex: 20,
      flexShrink: 0,
    }}>
      {/* Mobile hamburger — opens the nav drawer */}
      {isMobile && (
        <button
          onClick={onMenu}
          aria-label="Open menu"
          style={{
            all: 'unset', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, cursor: 'pointer', color: 'var(--fg-dim)',
            fontSize: 20, flexShrink: 0,
          }}
        >
          ☰
        </button>
      )}

      {/* Title + timestamp */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--sans)',
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--fg)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}>
          {TITLE_MAP[activeTab] || activeTab}
        </span>
        {!isMobile && (
          <span className="num" style={{ fontSize: 11, color: 'var(--fg-mute)', letterSpacing: '0.04em', lineHeight: 1 }}>
            {day} · {date} · {hh}:{mm} ·{' '}
            <span style={{ color: mktOpen ? 'var(--acid)' : 'var(--fg-faint)' }}>
              ● {mktOpen ? 'MKT OPEN' : 'MKT CLOSED'}
            </span>
          </span>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search — desktop only */}
      {!isMobile && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 32, padding: '0 10px',
        minWidth: 240, maxWidth: 360,
        border: '1px solid var(--line)', borderRadius: 4,
        background: 'var(--bg-card)',
        flex: '0 1 300px',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg-mute)', flexShrink: 0 }}>⌕</span>
        <input
          ref={searchRef}
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const ticker = searchVal.trim().toUpperCase()
              if (ticker) {
                onNavigate('Screener', { ticker })
                setSearchVal('')
              }
            }
            if (e.key === 'Escape') {
              setSearchVal('')
              searchRef.current?.blur()
            }
          }}
          placeholder="Search tickers, strategies…"
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent', fontSize: 12,
            color: 'var(--fg)', fontFamily: 'var(--body)',
          }}
        />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10,
          padding: '2px 5px',
          border: '1px solid var(--line)', borderRadius: 2,
          color: 'var(--fg-faint)', flexShrink: 0,
        }}>⌘K</span>
      </div>
      )}

      {/* Alerts button — desktop only (alert badge still shows in the drawer nav) */}
      {!isMobile && (
      <button
        className="h-btn sm"
        onClick={() => onNavigate('Alerts')}
        style={{ position: 'relative', gap: 6 }}
      >
        <Bell size={13} strokeWidth={1.5} />
        Alerts
        {alertCount > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--warn)',
          }} />
        )}
      </button>
      )}

      {/* Primary CTA */}
      <button className="h-btn primary sm" onClick={() => onNavigate('Screener')} style={{ flexShrink: 0 }}>
        Sell a call
      </button>

      {/* Build version — desktop only (baked in at build time via vite define) */}
      {!isMobile && (
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 10, letterSpacing: '0.04em', color: 'var(--fg-dim)', opacity: 0.55 }}>
          v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
        </div>
      )}
    </div>
  )
}

// ── Mobile menu button (used in App.jsx header fallback) ─────────────────────
export function MobileMenuButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36, height: 36,
        cursor: 'pointer',
        color: 'var(--fg-dim)',
        fontSize: 18,
      }}
    >
      ☰
    </button>
  )
}
