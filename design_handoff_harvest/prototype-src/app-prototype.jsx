// Harvest — clickable app prototype. Single file; AppShell + router.

function HarvestApp() {
  // Start with onboarding if ?onboard, else dashboard. Persist route.
  const params = new URLSearchParams(location.search);
  const startOnboarding = params.get("onboard") === "1";
  const [route, setRoute] = React.useState(() => {
    if (startOnboarding) return "onboarding";
    try { return localStorage.getItem("harvest.route") || "dashboard"; } catch (e) { return "dashboard"; }
  });
  const [sym, setSym] = React.useState("AAPL");

  const goto = (r, extra) => {
    if (r === "position" && extra?.sym) setSym(extra.sym);
    setRoute(r);
    try { localStorage.setItem("harvest.route", r); } catch (e) {}
    window.scrollTo(0, 0);
  };

  if (route === "onboarding") {
    return <Onboarding goto={goto} />;
  }

  return (
    <AppShellRouted route={route} setRoute={setRoute}>
      {({ route: r, goto: _g }) => {
        const g = (to, ex) => { if ((to === "position" || to === "ticket") && ex?.sym) setSym(ex.sym); _g(to); };
        switch (r) {
          case "dashboard": return <DashboardInner goto={g} />;
          case "positions": return <PositionsView goto={g} />;
          case "recommendations": return <RecommendationsView goto={g} />;
          case "screener": return <Screener goto={g} />;
          case "watchlist": return <Watchlist />;
          case "journal": return <Journal goto={g} />;
          case "performance": return <Performance />;
          case "academy": return <Academy />;
          case "alerts": return <Alerts />;
          case "settings": return <Settings />;
          case "position": return <PositionDetail sym={sym} goto={g} />;
          case "ticket": return <TradeTicket sym={sym} goto={g} />;
          default: return <DashboardInner goto={g} />;
        }
      }}
    </AppShellRouted>
  );
}

// AppShell variant that accepts external route control (for persistence + deep links).
function AppShellRouted({ route, setRoute, children }) {
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

  const goto = r => { setRoute(r); try { localStorage.setItem("harvest.route", r); } catch (e) {} };

  const effectiveActive = route === "position" ? "positions" : route === "ticket" ? "recommendations" : route;

  return (
    <div className="h-root" style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh", background: "var(--bg)" }}>
      <aside style={{
        borderRight: "1px solid var(--line)", padding: "20px 0", background: "var(--bg-elev)",
        display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0, height: "100vh", overflowY: "auto",
      }} className="h-scroll">
        <div style={{ padding: "4px 20px 24px", cursor: "pointer" }} onClick={() => goto("dashboard")}>
          <HarvestLogo size={18} />
        </div>
        {nav.map((n, i) => {
          if (n.section) return (
            <div key={"s" + i} style={{
              fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--fg-faint)", padding: "18px 20px 6px",
            }}>{n.section}</div>
          );
          const active = effectiveActive === n.id;
          return (
            <div key={n.id} onClick={() => goto(n.id)} style={{
              margin: "0 10px", padding: "8px 12px", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              color: active ? "var(--fg)" : "var(--fg-dim)", fontSize: 13,
              background: active ? "var(--bg-card)" : "transparent",
              border: active ? "1px solid var(--line)" : "1px solid transparent",
              fontWeight: active ? 500 : 400,
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, width: 14, textAlign: "center", color: active ? "var(--acid)" : "var(--fg-mute)" }}>{n.icon}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge && (
                <span className="num" style={{ fontSize: 10, padding: "2px 6px", background: "var(--acid)", color: "var(--bg)", borderRadius: 2, letterSpacing: 0 }}>{n.badge}</span>
              )}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ margin: 12, padding: 12, border: "1px solid var(--line)", borderRadius: 4, background: "var(--bg-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--acid)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--sans)", fontWeight: 600, fontSize: 12 }}>JM</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>John Meridian</div>
              <div style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--mono)" }}>Schwab · IBKR</div>
            </div>
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppTopBar route={route} goto={goto} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {typeof children === "function" ? children({ route, goto }) : children}
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { HarvestApp, AppShellRouted });
