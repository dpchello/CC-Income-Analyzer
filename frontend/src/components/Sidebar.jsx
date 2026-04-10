import { useState, useEffect, useRef } from 'react'

const NAV_ITEMS = [
  { id: 'Dashboard',      icon: '📋', label: 'Overview' },
  { id: 'Portfolios',     icon: '💼', label: 'My Positions' },
  { id: 'Screener',       icon: '🔍', label: 'Find Opportunities' },
  { id: 'Signal Tracker', icon: '📡', label: 'Market Conditions' },
  { id: 'Score Guide',    icon: '📖', label: 'How It Works' },
  { id: 'Settings',       icon: '⚙️',  label: 'Settings' },
]

// Shared drawer state lifted into a module-level singleton so MobileMenuButton
// and Sidebar can coordinate without prop-drilling through App.
let _setDrawerOpen = null

export function MobileMenuButton() {
  return (
    <button
      className="md:hidden flex items-center justify-center w-9 h-9"
      onClick={() => _setDrawerOpen && _setDrawerOpen(true)}
      style={{ color: 'var(--text)', backgroundColor: 'transparent' }}
      title="Open menu"
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
    </button>
  )
}

export default function Sidebar({ activeTab, onNavigate, alertCount }) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef(null)

  // Register setter so MobileMenuButton can open the drawer
  useEffect(() => {
    _setDrawerOpen = setDrawerOpen
    return () => { _setDrawerOpen = null }
  }, [])

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return
    function handleClick(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [drawerOpen])

  function handleNav(id) {
    onNavigate(id)
    setDrawerOpen(false)
  }

  const sidebarWidth = collapsed ? 56 : 220

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 border-r h-screen sticky top-0 transition-all duration-200"
        style={{
          width: sidebarWidth,
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="self-end mt-2 mr-2 flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{ color: 'var(--muted)', backgroundColor: 'transparent' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span style={{ fontSize: 13 }}>{collapsed ? '›' : '‹'}</span>
        </button>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-2 mt-1 flex-1">
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id
            const showBadge = item.id === 'Portfolios' && alertCount > 0
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                title={collapsed ? item.label : undefined}
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors relative"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'rgba(16,185,129,0.12)' : 'transparent',
                  color: isActive ? 'var(--green)' : 'var(--muted)',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && (
                  <span className="flex-1 text-left truncate">{item.label}</span>
                )}
                {showBadge && (
                  <span
                    className="alert-badge"
                    style={{
                      position: collapsed ? 'absolute' : 'relative',
                      top: collapsed ? 4 : 'auto',
                      right: collapsed ? 4 : 'auto',
                    }}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Mobile Drawer Overlay ────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            ref={drawerRef}
            className="flex flex-col h-full border-r"
            style={{
              width: 260,
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>
                🌾 Harvest
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ color: 'var(--muted)', fontSize: 20, backgroundColor: 'transparent' }}
              >
                ✕
              </button>
            </div>

            {/* Drawer nav */}
            <nav className="flex flex-col gap-1 px-3 mt-2">
              {NAV_ITEMS.map(item => {
                const isActive = activeTab === item.id
                const showBadge = item.id === 'Portfolios' && alertCount > 0
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isActive ? 'rgba(16,185,129,0.12)' : 'transparent',
                      color: isActive ? 'var(--green)' : 'var(--muted)',
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {showBadge && (
                      <span className="alert-badge">
                        {alertCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
