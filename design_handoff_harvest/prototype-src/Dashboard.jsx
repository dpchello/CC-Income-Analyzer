// Harvest — Dashboard / App screens

// ─────────────────────────────────────────────────────────────
// App chrome
// ─────────────────────────────────────────────────────────────
function AppSidebar({ active = "dashboard" }) {
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" /> },
    { id: "positions", label: "Positions", icon: <path d="M2 3h12M2 8h12M2 13h8" /> },
    { id: "recs", label: "Recommendations", icon: <path d="M8 1.5L9.6 5.6l4.4.3-3.4 2.9 1 4.3L8 10.8l-3.6 2.3 1-4.3L2 5.9l4.4-.3z" /> },
    { id: "screener", label: "Screener", icon: <path d="M2 2h12v3H2zM2 6h7v8H2zM10 6h4v4h-4z" /> },
    { id: "history", label: "Journal", icon: <path d="M4 2v12M4 2l8 3v7l-8 3" /> },
    { id: "research", label: "Research", icon: <circle cx="7" cy="7" r="5" /> },
  ];
  const sub = [
    { id: "settings", label: "Settings" },
    { id: "help", label: "Help & docs" },
  ];
  return (
    <div style={{
      width: 216, borderRight: "1px solid var(--line)", background: "var(--bg)",
      padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0,
    }}>
      <div style={{ padding: "10px 12px 20px" }}>
        <HarvestLogo size={16} />
      </div>
      <div className="h-eyebrow" style={{ padding: "8px 12px 6px" }}>Workspace</div>
      {nav.map(n => {
        const isActive = n.id === active;
        return (
          <div key={n.id} style={{
            padding: "7px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 10,
            color: isActive ? "var(--fg)" : "var(--fg-dim)", fontSize: 13, cursor: "pointer",
            background: isActive ? "rgba(24,28,20,0.05)" : "transparent",
            borderLeft: isActive ? "1px solid var(--acid)" : "1px solid transparent",
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">{n.icon}</svg>
            {n.label}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div className="h-eyebrow" style={{ padding: "8px 12px 6px" }}>Account</div>
      {sub.map(n => (
        <div key={n.id} style={{ padding: "6px 12px", fontSize: 13, color: "var(--fg-mute)" }}>{n.label}</div>
      ))}
      <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }}>
        <div style={{ color: "var(--fg)", fontSize: 12, fontWeight: 500 }}>M. Howell</div>
        <div style={{ color: "var(--fg-mute)", fontSize: 11, marginTop: 2 }}>Fidelity · connected</div>
      </div>
    </div>
  );
}

function AppTopbar({ title = "Dashboard", breadcrumb = ["Workspace"] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 24px", borderBottom: "1px solid var(--line)", background: "var(--bg)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ color: "var(--fg-faint)", fontSize: 12 }}>{breadcrumb.join(" / ")} /</span>
        <span style={{ color: "var(--fg)", fontSize: 14, fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4, color: "var(--fg-mute)", fontSize: 11, fontFamily: "var(--mono)" }}>
          <span className="h-dot" style={{ background: "var(--acid)" }} />
          Market open · 14:22 ET
        </div>
        <button className="h-btn sm">⌘K Search</button>
        <button className="h-btn sm primary">+ New idea</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIATION A — Dense, column-heavy. Positions list as primary surface,
// recommendations open as an inline drawer beneath each row.
// ─────────────────────────────────────────────────────────────
function DashboardDense({ openSym = "AAPL" }) {
  const [open, setOpen] = React.useState(openSym);
  const equity = 284520;
  const dayPnL = 1842;
  const eligible = 4320;
  const path = genPath(120, 240000, 0.008, 0.0015, 9);

  return (
    <div className="h-root" style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg)" }}>
      <AppSidebar active="dashboard" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppTopbar title="Dashboard" />
        <div style={{ flex: 1, overflow: "auto" }} className="h-scroll">
          {/* header metrics */}
          <div style={{ padding: "24px 24px 16px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 24, borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="h-eyebrow">Portfolio equity</div>
              <div className="num" style={{ fontSize: 32, color: "var(--fg)", letterSpacing: "-0.025em", marginTop: 4 }}>
                ${equity.toLocaleString()}.42
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, fontFamily: "var(--mono)" }}>
                <span className="h-up">+${dayPnL.toLocaleString()} · +0.65%</span>
                <span style={{ color: "var(--fg-faint)" }}>today</span>
              </div>
            </div>
            <Stat k="Income captured" v="$12,840" sub="past 90 days" acc />
            <Stat k="Eligible this cycle" v={`$${eligible.toLocaleString()}`} sub="6 opportunities" />
            <Stat k="Open contracts" v="4" sub="next expiry May 16" />
          </div>

          {/* equity chart + sidebars */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 0, borderBottom: "1px solid var(--line)" }}>
            <div style={{ padding: "24px 24px 20px", borderRight: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <span className="h-eyebrow">Equity · last 120 days</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {["1M", "3M", "YTD", "1Y", "All"].map((r, i) => (
                    <span key={r} className="h-chip" style={{ color: r === "3M" ? "var(--acid)" : undefined, borderColor: r === "3M" ? "var(--acid-line)" : undefined }}>{r}</span>
                  ))}
                </div>
              </div>
              <LineChart points={path} width={680} height={180} color="var(--acid)" padding={24} yTicks={4}
                xLabels={["Jan", "Feb", "Mar", "Apr"]} markers={[{ i: 10, label: "AAPL 4×" }, { i: 48, label: "NVDA rolled" }, { i: 90, label: "expired" }]} />
            </div>
            <div style={{ padding: "24px" }}>
              <span className="h-eyebrow">Open contracts</span>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { sym: "AAPL", detail: "4× May 16 200C", prem: 980, pop: 72 },
                  { sym: "MSFT", detail: "2× May 16 440C", prem: 840, pop: 68 },
                  { sym: "NVDA", detail: "1× May 09 920C", prem: 1860, pop: 64 },
                  { sym: "AMD", detail: "3× May 16 180C", prem: 930, pop: 70 },
                ].map(o => (
                  <div key={o.sym} style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 2, display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
                    <div>
                      <div className="num" style={{ fontSize: 12, color: "var(--fg)" }}>{o.sym} <span style={{ color: "var(--fg-mute)" }}> · {o.detail}</span></div>
                      <div style={{ fontSize: 10.5, color: "var(--fg-faint)", fontFamily: "var(--mono)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>PoP {o.pop}% · 26 DTE</div>
                    </div>
                    <div className="num" style={{ color: "var(--acid)", fontSize: 12 }}>+${o.prem}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* positions list */}
          <div style={{ padding: "24px 24px 48px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <span className="h-eyebrow">Positions</span>
                <span style={{ color: "var(--fg-mute)", marginLeft: 12, fontSize: 12 }}>8 holdings · click a row for recommendations</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="h-btn sm">Filter</button>
                <button className="h-btn sm">Sort · eligible</button>
              </div>
            </div>
            <PositionsTable open={open} setOpen={setOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Positions table + expanding recommendation drawer
// ─────────────────────────────────────────────────────────────
function PositionsTable({ open, setOpen }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "70px 1fr 90px 110px 110px 90px 90px 110px 24px",
        padding: "10px 16px", gap: 16, background: "var(--bg-elev)", borderBottom: "1px solid var(--line)",
      }} className="h-eyebrow">
        <span>Symbol</span><span>Name</span><span style={{ textAlign: "right" }}>Shares</span>
        <span style={{ textAlign: "right" }}>Avg cost</span><span style={{ textAlign: "right" }}>Last</span>
        <span style={{ textAlign: "right" }}>Day</span><span style={{ textAlign: "right" }}>IV rank</span>
        <span style={{ textAlign: "right" }}>Eligible</span><span />
      </div>
      {HARVEST_POSITIONS.map((p, i) => {
        const up = p.day >= 0;
        const isOpen = open === p.sym;
        const eligible = p.cc ? (p.cc.premium * p.cc.cover).toFixed(0) : null;
        return (
          <React.Fragment key={p.sym}>
            <div onClick={() => setOpen(isOpen ? null : p.sym)}
              style={{
                display: "grid", gridTemplateColumns: "70px 1fr 90px 110px 110px 90px 90px 110px 24px",
                padding: "14px 16px", gap: 16, fontSize: 13,
                borderTop: i === 0 ? "none" : "1px solid var(--line-soft)", alignItems: "center",
                cursor: "pointer", background: isOpen ? "var(--acid-faint)" : "transparent",
                borderLeft: isOpen ? "1px solid var(--acid)" : "1px solid transparent", marginLeft: -1,
              }}>
              <span className="num" style={{ color: "var(--fg)", fontSize: 13 }}>{p.sym}</span>
              <span style={{ color: "var(--fg-dim)" }}>{p.name}</span>
              <span className="num" style={{ textAlign: "right", color: "var(--fg)" }}>{p.shares}</span>
              <span className="num" style={{ textAlign: "right", color: "var(--fg-dim)" }}>${p.avg.toFixed(2)}</span>
              <span className="num" style={{ textAlign: "right", color: "var(--fg)" }}>${p.price.toFixed(2)}</span>
              <span className="num" style={{ textAlign: "right", color: up ? "var(--acid)" : "var(--down)" }}>{up ? "+" : ""}{p.day.toFixed(2)}%</span>
              <span className="num" style={{ textAlign: "right", color: p.ivr > 40 ? "var(--acid)" : "var(--fg-dim)" }}>{p.ivr}</span>
              <span className="num" style={{ textAlign: "right", color: eligible ? "var(--acid)" : "var(--fg-faint)" }}>
                {eligible ? `$${eligible}` : "—"}
              </span>
              <span style={{ color: "var(--fg-mute)", fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
            </div>
            {isOpen && <RecommendationDrawer sym={p.sym} pos={p} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RecommendationDrawer({ sym, pos }) {
  // pick recs for this symbol, fallback to generic 3
  const recs = HARVEST_RECS.filter(r => r.sym === sym).length
    ? HARVEST_RECS.filter(r => r.sym === sym)
    : [
        { id: "g1", sym, conviction: "Med", score: 66, action: `Sell ${Math.floor(pos.shares / 100)}x May 16 ${Math.round(pos.price * 1.04 / 5) * 5} Call`, premium: Math.round(pos.price * 0.015 * pos.shares), annYield: 12.4, pop: 70, delta: 0.28, thesis: "Moderate IV rank, strike above recent range, no earnings before expiry." , tags: ["above-cost-basis", "no-earnings"] },
        { id: "g2", sym, conviction: "Low", score: 48, action: `Sell ${Math.floor(pos.shares / 100)}x May 09 ${Math.round(pos.price * 1.02 / 5) * 5} Call`, premium: Math.round(pos.price * 0.008 * pos.shares), annYield: 8.2, pop: 78, delta: 0.22, thesis: "Closer strike, tighter window, lower yield but higher PoP.", tags: ["defensive", "short-dte"] },
      ];
  const path = genPath(40, pos.price * 0.96, 0.01, 0.0012, pos.sym.charCodeAt(0) * 3);

  return (
    <div style={{ padding: "24px 20px", background: "var(--bg-elev)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: 24 }}>
        <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 2, padding: 18 }}>
          <span className="h-eyebrow">{sym} · last 40 days</span>
          <div style={{ marginTop: 12 }}>
            <LineChart points={path} width={340} height={150} color="var(--acid)" padding={20} yTicks={3}
              strike={pos.cc?.strike} xLabels={["40d", "30d", "20d", "10d", "Today"]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
            <KV k="IV rank" v={pos.ivr} />
            <KV k="30d range" v={`$${(pos.price * 0.94).toFixed(0)}–$${(pos.price * 1.05).toFixed(0)}`} />
            <KV k="Next earnings" v="> 30d" />
          </div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <span className="h-eyebrow">{recs.length} covered-call candidates · ranked by score</span>
            <span style={{ fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Updated 14:22 ET</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recs.map(r => <RecCard key={r.id} rec={r} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecCard({ rec }) {
  const conv = rec.conviction === "High" ? "acid" : rec.conviction === "Med" ? "solid" : "";
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderLeft: `2px solid ${rec.conviction === "High" ? "var(--acid)" : rec.conviction === "Med" ? "var(--olive)" : "var(--line-strong)"}`, padding: "16px 18px", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr auto", gap: 20, alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className={`h-chip ${conv}`}>{rec.conviction}</span>
          <span style={{ color: "var(--fg-mute)", fontSize: 11, fontFamily: "var(--mono)" }}>SCORE {rec.score}</span>
        </div>
        <div style={{ color: "var(--fg)", fontSize: 13.5, fontFamily: "var(--mono)", marginBottom: 6 }}>{rec.action}</div>
        <div style={{ color: "var(--fg-mute)", fontSize: 12, lineHeight: 1.5, maxWidth: 440 }}>{rec.thesis}</div>
        {rec.tags && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {rec.tags.map(t => <span key={t} className="h-chip" style={{ height: 18, fontSize: 10 }}>{t}</span>)}
          </div>
        )}
      </div>
      <Mini k="Premium" v={rec.premium ? `$${rec.premium}` : "—"} acid={!!rec.premium} />
      <Mini k="Ann. yield" v={rec.annYield ? `${rec.annYield}%` : "—"} />
      <Mini k="PoP" v={rec.pop ? `${rec.pop}%` : "—"} />
      <Mini k="Delta" v={rec.delta ? rec.delta.toFixed(2) : "—"} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button className="h-btn sm primary">Preview order</button>
        <button className="h-btn sm">Save</button>
      </div>
    </div>
  );
}

function KV({ k, v, acid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "var(--fg-mute)", fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</span>
      <span className="num" style={{ color: acid ? "var(--acid-strong)" : "var(--fg)", fontSize: 12 }}>{v}</span>
    </div>
  );
}

function Mini({ k, v, acid }) {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 4 }}>{k}</div>
      <div className="num" style={{ fontSize: 18, color: acid ? "var(--acid)" : "var(--fg)", letterSpacing: "-0.02em" }}>{v}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIATION B — Calm / premium. Big empty canvas, fewer columns,
// one featured recommendation. Left rail of positions.
// ─────────────────────────────────────────────────────────────
function DashboardCalm() {
  const [selected, setSelected] = React.useState("AAPL");
  const pos = HARVEST_POSITIONS.find(p => p.sym === selected);
  const path = genPath(90, pos.price * 0.9, 0.009, 0.0013, pos.sym.charCodeAt(0) * 5);
  const recs = HARVEST_RECS.filter(r => r.sym === selected);
  return (
    <div className="h-root" style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg)" }}>
      <AppSidebar active="dashboard" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppTopbar title="Dashboard" />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>
          {/* position rail */}
          <div style={{ borderRight: "1px solid var(--line)", padding: "18px 0", overflow: "auto" }} className="h-scroll">
            <div style={{ padding: "0 20px 16px" }}>
              <div className="h-eyebrow">Portfolio · 8</div>
              <div className="num" style={{ fontSize: 24, color: "var(--fg)", marginTop: 8 }}>$284,520.42</div>
              <div style={{ fontSize: 12, color: "var(--acid)", fontFamily: "var(--mono)" }}>+$1,842 today</div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }} />
            {HARVEST_POSITIONS.map(p => {
              const isSel = p.sym === selected;
              const sp = genPath(32, p.price * 0.94, 0.01, 0.001, p.sym.charCodeAt(0));
              return (
                <div key={p.sym} onClick={() => setSelected(p.sym)}
                  style={{
                    padding: "14px 20px", display: "grid", gridTemplateColumns: "54px 1fr 90px",
                    alignItems: "center", gap: 12, cursor: "pointer",
                    background: isSel ? "var(--acid-faint)" : "transparent",
                    borderLeft: isSel ? "2px solid var(--acid)" : "2px solid transparent",
                    borderBottom: "1px solid var(--line-soft)",
                  }}>
                  <div>
                    <div className="num" style={{ fontSize: 13, color: "var(--fg)" }}>{p.sym}</div>
                    <div style={{ fontSize: 10.5, color: "var(--fg-mute)", fontFamily: "var(--mono)", marginTop: 2 }}>{p.shares}sh</div>
                  </div>
                  <Sparkline points={sp} width={90} height={20} color={p.day >= 0 ? "var(--acid)" : "var(--down)"} />
                  <div style={{ textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 12, color: "var(--fg)" }}>${p.price.toFixed(2)}</div>
                    <div className="num" style={{ fontSize: 10.5, color: p.day >= 0 ? "var(--acid)" : "var(--down)" }}>{p.day >= 0 ? "+" : ""}{p.day.toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* detail */}
          <div style={{ overflow: "auto", padding: "40px 48px" }} className="h-scroll">
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div className="serif" style={{ fontSize: 48, color: "var(--fg)", letterSpacing: "-0.03em" }}>{pos.sym}</div>
              <div style={{ color: "var(--fg-mute)", fontSize: 14 }}>{pos.name}</div>
              {pos.cc && <span className="h-chip acid">Eligible · ${(pos.cc.premium * pos.cc.cover).toFixed(0)}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 24, marginTop: 32, paddingBottom: 32, borderBottom: "1px solid var(--line)" }}>
              <Stat k="Last" v={`$${pos.price.toFixed(2)}`} sub={`${pos.day >= 0 ? "+" : ""}${pos.day.toFixed(2)}%`} acc />
              <Stat k="Position" v={`${pos.shares} sh`} sub={`avg $${pos.avg.toFixed(2)}`} />
              <Stat k="Market value" v={`$${(pos.shares * pos.price).toLocaleString()}`} sub={`${((pos.price - pos.avg) / pos.avg * 100).toFixed(1)}% cost basis`} />
              <Stat k="IV rank" v={pos.ivr} sub={pos.ivr > 40 ? "elevated" : "moderate"} />
              <Stat k="Earnings" v="> 30d" sub="no event risk" />
            </div>
            <div style={{ marginTop: 40 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <span className="h-eyebrow">Price · 90 days · $200 strike reference</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["1M", "3M", "6M", "1Y"].map(r => <span key={r} className="h-chip" style={r === "3M" ? { color: "var(--acid)", borderColor: "var(--acid-line)" } : {}}>{r}</span>)}
                </div>
              </div>
              <LineChart points={path} width={880} height={220} color="var(--acid)" strike={pos.cc?.strike} padding={28} yTicks={4}
                xLabels={["90d ago", "60d", "30d", "Today"]} />
            </div>
            <div style={{ marginTop: 48 }}>
              <span className="h-eyebrow">{recs.length || 2} recommendations · ranked</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {(recs.length ? recs : HARVEST_RECS.slice(0, 2)).map(r => <RecCard key={r.id} rec={{ ...r, sym: pos.sym }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIATION C — "Briefing" — daily digest / morning coffee style.
// Top card is the day's single best idea. Then: watchlist delta,
// expiries due, portfolio tape.
// ─────────────────────────────────────────────────────────────
function DashboardBriefing() {
  const today = "Monday, April 20";
  const path = genPath(120, 240000, 0.008, 0.0015, 11);
  const top = HARVEST_RECS[0];
  return (
    <div className="h-root" style={{ display: "flex", width: "100%", height: "100%", background: "var(--bg)" }}>
      <AppSidebar active="dashboard" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppTopbar title="Today's briefing" breadcrumb={["Workspace", "Dashboard"]} />
        <div style={{ flex: 1, overflow: "auto", padding: "36px 48px 64px" }} className="h-scroll">
          <div className="h-eyebrow">{today} · Pre-market close · 14:22 ET</div>
          <h1 className="serif" style={{ fontSize: 52, letterSpacing: "-0.03em", margin: "12px 0 32px", color: "var(--fg)", fontWeight: 400, maxWidth: 900 }}>
            Four positions are <em style={{ color: "var(--acid)", fontStyle: "italic" }}>harvest-ready</em>. The best of them sits on your Apple shares.
          </h1>

          {/* hero rec card */}
          <div style={{ border: "1px solid var(--line-strong)", background: "var(--bg-elev)", padding: 36, display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 48, borderRadius: 2 }}>
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <span className="h-chip acid">High conviction</span>
                <span className="h-chip">Score 88 / 100</span>
                <span className="h-chip">AAPL · 400 sh</span>
              </div>
              <div className="display" style={{ fontSize: 32, color: "var(--fg)", letterSpacing: "-0.02em", marginBottom: 12, fontWeight: 500 }}>
                Sell 4 × May 16 $200 calls on AAPL.
              </div>
              <p style={{ color: "var(--fg-dim)", fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                {top.thesis} Premium of <span className="num" style={{ color: "var(--acid)" }}>$980</span> represents
                an annualized <span className="num" style={{ color: "var(--acid)" }}>18.4%</span> against your cost basis.
                Probability of profit is <span className="num" style={{ color: "var(--fg)" }}>72%</span>.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="h-btn primary">Preview order</button>
                <button className="h-btn">See the math</button>
                <button className="h-btn ghost">Dismiss</button>
              </div>
            </div>
            <div>
              <LineChart points={genPath(60, 180, 0.01, 0.0015, 33)} width={380} height={180} color="var(--acid)" strike={200} padding={20} yTicks={3} xLabels={["60d", "30d", "Today"]} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <Mini k="Premium" v="$980" acid />
                <Mini k="Yield" v="18.4%" />
                <Mini k="PoP" v="72%" />
                <Mini k="Delta" v="0.28" />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32 }}>
            <div>
              <span className="h-eyebrow">Three more to consider</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {HARVEST_RECS.slice(1).map(r => <RecCard key={r.id} rec={r} />)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <span className="h-eyebrow">Portfolio · 90 days</span>
                <div style={{ marginTop: 12 }}>
                  <LineChart points={path} width={420} height={140} color="var(--acid)" padding={20} yTicks={3} xLabels={["Jan", "Feb", "Mar", "Apr"]} />
                </div>
              </div>
              <div style={{ border: "1px solid var(--line)", padding: 20 }}>
                <span className="h-eyebrow">Expiring this week</span>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { sym: "AAPL", detail: "4 × Apr 18 190C", pop: "now 98%", pnl: "+$840" },
                    { sym: "MSFT", detail: "2 × Apr 18 420C", pop: "now 96%", pnl: "+$760" },
                  ].map(x => (
                    <div key={x.sym} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                      <span className="num" style={{ color: "var(--fg)", fontSize: 13 }}>{x.sym}</span>
                      <span style={{ color: "var(--fg-mute)", fontSize: 11.5, fontFamily: "var(--mono)" }}>{x.detail} · {x.pop}</span>
                      <span className="num" style={{ color: "var(--acid)" }}>{x.pnl}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ border: "1px solid var(--line)", padding: 20 }}>
                <span className="h-eyebrow">Watchlist movers</span>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[{s:"SOFI",v:"+6.4%",iv:62},{s:"COIN",v:"+3.4%",iv:60},{s:"PLTR",v:"+2.1%",iv:55}].map(x => (
                    <div key={x.s} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                      <span className="num" style={{ color: "var(--fg)", fontSize: 13 }}>{x.s}</span>
                      <span style={{ color: "var(--fg-mute)", fontSize: 11.5, fontFamily: "var(--mono)" }}>IV rank {x.iv}</span>
                      <span className="num" style={{ color: "var(--acid)" }}>{x.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardDense, DashboardCalm, DashboardBriefing, AppSidebar, AppTopbar, PositionsTable, RecCard });

// App-shell compatible dashboard content (no sidebar/topbar wrapper — used inside AppShell).
function DashboardInner({ goto = () => {} }) {
  const [open, setOpen] = React.useState("AAPL");
  const equity = 284520, dayPnL = 1842, eligible = 4320;
  const path = genPath(120, 240000, 0.008, 0.0015, 9);
  return (
    <div style={{ overflow: "auto" }} className="h-scroll">
      <div style={{ padding: "24px 24px 16px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 24, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="h-eyebrow">Portfolio equity</div>
          <div className="num" style={{ fontSize: 32, color: "var(--fg)", letterSpacing: "-0.025em", marginTop: 4 }}>
            ${equity.toLocaleString()}.42
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, fontFamily: "var(--mono)" }}>
            <span className="h-up">+${dayPnL.toLocaleString()} · +0.65%</span>
            <span style={{ color: "var(--fg-faint)" }}>today</span>
          </div>
        </div>
        <Stat k="Income captured" v="$12,840" sub="past 90 days" acc />
        <Stat k="Eligible this cycle" v={`$${eligible.toLocaleString()}`} sub="6 opportunities" />
        <Stat k="Open contracts" v="4" sub="next expiry May 16" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 0, borderBottom: "1px solid var(--line)" }}>
        <div style={{ padding: "24px 24px 20px", borderRight: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <span className="h-eyebrow">Equity · last 120 days</span>
            <div style={{ display: "flex", gap: 2 }}>
              {["1M", "3M", "YTD", "1Y", "All"].map((r) => (
                <span key={r} className="h-chip" style={{ color: r === "3M" ? "var(--acid)" : undefined, borderColor: r === "3M" ? "var(--acid-line)" : undefined }}>{r}</span>
              ))}
            </div>
          </div>
          <LineChart points={path} width={680} height={180} color="var(--acid)" padding={24} yTicks={4}
            xLabels={["Jan", "Feb", "Mar", "Apr"]} markers={[{ i: 10, label: "AAPL 4×" }, { i: 48, label: "NVDA rolled" }, { i: 90, label: "expired" }]} />
        </div>
        <div style={{ padding: "24px" }}>
          <span className="h-eyebrow">Open contracts</span>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { sym: "AAPL", detail: "4× May 16 200C", prem: 980, pop: 72 },
              { sym: "MSFT", detail: "2× May 16 440C", prem: 840, pop: 68 },
              { sym: "NVDA", detail: "1× May 09 920C", prem: 1860, pop: 64 },
              { sym: "AMD", detail: "3× May 16 180C", prem: 930, pop: 70 },
            ].map(o => (
              <div key={o.sym} onClick={() => goto("position")} style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 2, display: "grid", gridTemplateColumns: "1fr auto", gap: 4, cursor: "pointer" }}>
                <div>
                  <div className="num" style={{ fontSize: 12, color: "var(--fg)" }}>{o.sym} <span style={{ color: "var(--fg-mute)" }}> · {o.detail}</span></div>
                  <div style={{ fontSize: 10.5, color: "var(--fg-faint)", fontFamily: "var(--mono)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>PoP {o.pop}% · 26 DTE</div>
                </div>
                <div className="num" style={{ color: "var(--acid)", fontSize: 12 }}>+${o.prem}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: "24px 24px 48px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span className="h-eyebrow">Positions</span>
            <span style={{ color: "var(--fg-mute)", marginLeft: 12, fontSize: 12 }}>8 holdings · click a row for recommendations</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="h-btn sm">Filter</button>
            <button className="h-btn sm">Sort · eligible</button>
          </div>
        </div>
        <PositionsTable open={open} setOpen={setOpen} />
      </div>
    </div>
  );
}

// Positions-only view (re-uses PositionsTable)
function PositionsView({ goto = () => {} }) {
  const [open, setOpen] = React.useState(null);
  return (
    <div style={{ padding: "28px 32px" }} className="h-scroll">
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>All positions</h2>
        <span style={{ color: "var(--fg-mute)", marginLeft: 12, fontSize: 12 }}>8 holdings · $482,400 market value</span>
        <div style={{ flex: 1 }} />
        <button className="h-btn sm">Filter</button>
        <button className="h-btn sm" style={{ marginLeft: 8 }}>Sort · eligible</button>
      </div>
      <PositionsTable open={open} setOpen={setOpen} />
    </div>
  );
}

// Recommendations feed (top-level)
function RecommendationsView({ goto = () => {} }) {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>Recommendations from your portfolio</h2>
          <div style={{ color: "var(--fg-mute)", fontSize: 12, marginTop: 4, fontFamily: "var(--mono)" }}>
            Updated 14:42 ET · 4 ideas · refreshes when market data moves materially
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="h-btn sm">Conviction · All</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {HARVEST_RECS.map(r => (
          <div key={r.id} style={{ border: "1px solid var(--line)", background: "var(--bg-card)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
              <div className="num" style={{ fontSize: 18, color: "var(--fg)" }}>{r.sym}</div>
              <span className={`h-chip ${r.conviction === "High" ? "acid" : ""}`}>{r.conviction.toUpperCase()} CONVICTION</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)" }}>score {r.score}</span>
              <div style={{ flex: 1 }} />
              {r.premium && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--acid)" }}>+${r.premium}</div>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, letterSpacing: "-0.005em" }}>{r.action}</div>
            {r.premium && (
              <div style={{ display: "flex", gap: 20, fontSize: 12, fontFamily: "var(--mono)", color: "var(--fg-mute)", marginBottom: 10 }}>
                <span>Ann. yield <span style={{ color: "var(--fg)" }}>{r.annYield}%</span></span>
                <span>P.O.P. <span style={{ color: "var(--fg)" }}>{r.pop}%</span></span>
                <span>Δ {r.delta}</span>
              </div>
            )}
            <p style={{ color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{r.thesis}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 14, alignItems: "center" }}>
              {r.tags.map(t => <span key={t} className="h-chip">{t}</span>)}
              <div style={{ flex: 1 }} />
              {r.premium && (
                <>
                  <button className="h-btn sm" onClick={() => goto("position", { sym: r.sym })}>Details</button>
                  <button className="h-btn sm primary" onClick={() => goto("ticket", { sym: r.sym })}>Trade →</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { DashboardInner, PositionsView, RecommendationsView });
