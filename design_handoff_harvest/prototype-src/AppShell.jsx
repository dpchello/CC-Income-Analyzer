// Harvest — App shell. Left nav + top bar + routed content.
// Used by the clickable prototype (App.html). Screens receive (nav, goto) to jump around.

function AppShell({ initial = "dashboard", children }) {
  const [route, setRoute] = React.useState(initial);

  const nav = [
    { section: "Portfolio" },
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "positions", label: "Positions", icon: "≡" },
    { id: "recommendations", label: "Recommendations", icon: "◆", badge: 3 },
    { section: "Trade" },
    { id: "screener", label: "Screener", icon: "◇" },
    { id: "watchlist", label: "Watchlist", icon: "◉" },
    { id: "journal", label: "Trade journal", icon: "⌂" },
    { section: "Research" },
    { id: "performance", label: "Performance", icon: "◎" },
    { id: "academy", label: "Academy", icon: "⌘" },
    { section: "System" },
    { id: "alerts", label: "Alerts", icon: "!", badge: 2 },
    { id: "settings", label: "Settings", icon: "◐" },
  ];

  return (
    <div className="h-root" style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Left nav */}
      <aside style={{
        borderRight: "1px solid var(--line)", padding: "20px 0", background: "var(--bg-elev)",
        display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }} className="h-scroll">
        <div style={{ padding: "4px 20px 24px" }}>
          <HarvestLogo size={18} />
        </div>

        {nav.map((n, i) => {
          if (n.section) return (
            <div key={"s" + i} style={{
              fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--fg-faint)",
              padding: "18px 20px 6px",
            }}>{n.section}</div>
          );
          const active = route === n.id;
          return (
            <div key={n.id} onClick={() => setRoute(n.id)} style={{
              margin: "0 10px", padding: "8px 12px", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              color: active ? "var(--fg)" : "var(--fg-dim)", fontSize: 13,
              background: active ? "var(--bg-card)" : "transparent",
              border: active ? "1px solid var(--line)" : "1px solid transparent",
              fontWeight: active ? 500 : 400,
            }}>
              <span style={{
                fontFamily: "var(--mono)", fontSize: 12, width: 14, textAlign: "center",
                color: active ? "var(--acid)" : "var(--fg-mute)",
              }}>{n.icon}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge && (
                <span className="num" style={{
                  fontSize: 10, padding: "2px 6px", background: "var(--acid)", color: "var(--bg)",
                  borderRadius: 2, letterSpacing: 0,
                }}>{n.badge}</span>
              )}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Account card */}
        <div style={{
          margin: 12, padding: 12, border: "1px solid var(--line)", borderRadius: 4,
          background: "var(--bg-card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4, background: "var(--acid)",
              color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--sans)", fontWeight: 600, fontSize: 12,
            }}>JM</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>John Meridian</div>
              <div style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--mono)" }}>Schwab · IBKR</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppTopBar route={route} goto={setRoute} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {typeof children === "function" ? children({ route, goto: setRoute }) : children}
        </div>
      </main>
    </div>
  );
}

function AppTopBar({ route, goto }) {
  const titleMap = {
    dashboard: "Dashboard",
    positions: "Positions",
    recommendations: "Recommendations",
    screener: "Screener",
    watchlist: "Watchlist",
    journal: "Trade journal",
    performance: "Performance",
    academy: "Academy",
    alerts: "Alerts",
    settings: "Settings",
    position: "Position detail",
    ticket: "New covered call",
    onboarding: "Get started",
  };
  return (
    <div style={{
      height: 56, borderBottom: "1px solid var(--line)", background: "var(--bg)",
      display: "flex", alignItems: "center", padding: "0 28px", gap: 20,
      position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", letterSpacing: "-0.01em" }}>
        {titleMap[route] || route}
      </div>
      <div className="num" style={{ fontSize: 11, color: "var(--fg-mute)", letterSpacing: 0 }}>
        MON · APR 20 2026 · 14:42 EST · <span style={{ color: "var(--acid)" }}>● MKT OPEN</span>
      </div>
      <div style={{ flex: 1 }} />

      {/* search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        height: 32, padding: "0 10px", minWidth: 280,
        border: "1px solid var(--line)", borderRadius: 4, background: "var(--bg-card)",
        color: "var(--fg-mute)", fontSize: 12,
      }}>
        <span style={{ fontFamily: "var(--mono)" }}>⌕</span>
        <span>Search tickers, strategies, settings…</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, padding: "2px 5px", border: "1px solid var(--line)", borderRadius: 2 }}>⌘K</span>
      </div>

      <button className="h-btn sm" onClick={() => goto("alerts")} style={{ position: "relative" }}>
        <span style={{ fontFamily: "var(--mono)" }}>!</span> Alerts
        <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: "var(--warn)" }} />
      </button>
      <button className="h-btn primary sm" onClick={() => goto("ticket")}>
        Sell a call
      </button>
    </div>
  );
}

Object.assign(window, { AppShell, AppTopBar });
