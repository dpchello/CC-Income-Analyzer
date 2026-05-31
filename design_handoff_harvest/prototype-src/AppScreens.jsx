// Journal, Performance, Watchlist, Alerts, Settings, Academy

// ─────────────────────────────── JOURNAL ───────────────────────────────
function Journal({ goto = () => {} }) {
  const [filter, setFilter] = React.useState("all");
  const outcomes = ["all", "expired", "closed-early", "assigned", "rolled"];
  const rows = [
    ...HARVEST_HISTORY,
    { id: "h7", date: "Mar 21", sym: "NVDA", action: "STO", strike: 860, exp: "Mar 28", premium: 14.20, qty: 1, outcome: "expired", pnl: 1420, ret: 1.65 },
    { id: "h8", date: "Mar 14", sym: "SOFI", action: "STO", strike: 9, exp: "Mar 28", premium: 0.32, qty: 8, outcome: "assigned", pnl: 256, ret: 3.56 },
    { id: "h9", date: "Mar 07", sym: "T", action: "STO", strike: 18.5, exp: "Mar 28", premium: 0.22, qty: 5, outcome: "expired", pnl: 110, ret: 1.19 },
    { id: "h10", date: "Feb 28", sym: "MSFT", action: "STO", strike: 430, exp: "Mar 15", premium: 4.10, qty: 2, outcome: "closed-early", pnl: 620, ret: 0.72 },
  ];
  const filtered = filter === "all" ? rows : rows.filter(r => r.outcome === filter);
  const realized = filtered.reduce((s, r) => s + r.pnl, 0);
  const winRate = Math.round(filtered.filter(r => r.pnl > 0).length / filtered.length * 100);

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", marginBottom: 28 }}>
        <SummaryCell label="Realized YTD" value="$14,842" sub="premium + assignments" />
        <SummaryCell label="Trades" value="47" sub="35 closed · 12 open" />
        <SummaryCell label="Win rate" value="81%" sub="by P&L" />
        <SummaryCell label="Avg credit" value="$318" sub="per contract" />
        <SummaryCell label="Avg DTE" value="21d" sub="at entry" />
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <div className="h-eyebrow">Outcome</div>
        {outcomes.map(o => (
          <div key={o} onClick={() => setFilter(o)} style={{
            padding: "6px 12px", border: "1px solid " + (filter === o ? "var(--acid)" : "var(--line)"),
            background: filter === o ? "var(--acid-faint)" : "transparent",
            color: filter === o ? "var(--acid)" : "var(--fg-dim)",
            fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", borderRadius: 2, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>{o}</div>
        ))}
        <div style={{ flex: 1 }} />
        <button className="h-btn sm">Export CSV</button>
        <button className="h-btn sm">Tax report</button>
      </div>

      {/* table */}
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 60px 60px 70px 80px 90px 1fr 90px 90px 90px",
          gap: 12, padding: "12px 20px", fontFamily: "var(--mono)", fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-mute)",
          borderBottom: "1px solid var(--line)",
        }}>
          <div>Date</div><div>Sym</div><div>Act</div><div>Strike</div><div>Exp</div><div>Qty</div><div>Outcome</div><div style={{ textAlign: "right" }}>Credit</div><div style={{ textAlign: "right" }}>P&L</div><div style={{ textAlign: "right" }}>Return</div>
        </div>
        {filtered.map(r => (
          <div key={r.id} style={{
            display: "grid", gridTemplateColumns: "80px 60px 60px 70px 80px 90px 1fr 90px 90px 90px",
            gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--line-soft)",
            fontFamily: "var(--mono)", fontSize: 12, alignItems: "center",
          }}>
            <div style={{ color: "var(--fg-mute)" }}>{r.date}</div>
            <div style={{ color: "var(--fg)", cursor: "pointer" }} onClick={() => goto("position")}>{r.sym}</div>
            <div>{r.action}</div>
            <div>${r.strike}</div>
            <div style={{ color: "var(--fg-mute)" }}>{r.exp}</div>
            <div>{r.qty}×</div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
              <OutcomeBadge v={r.outcome} />
            </div>
            <div style={{ textAlign: "right" }}>${(r.premium * r.qty * 100).toLocaleString()}</div>
            <div style={{ textAlign: "right", color: r.pnl > 0 ? "var(--acid)" : r.pnl < 0 ? "var(--down)" : "var(--fg-mute)" }}>
              {r.pnl > 0 ? "+" : ""}${r.pnl}
            </div>
            <div style={{ textAlign: "right", color: "var(--fg-dim)" }}>{r.ret.toFixed(2)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, sub }) {
  return (
    <div style={{ background: "var(--bg-card)", padding: "18px 20px" }}>
      <div className="h-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, color: "var(--fg)" }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--fg-mute)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OutcomeBadge({ v }) {
  const map = {
    expired: { c: "var(--acid)", l: "EXPIRED" },
    "closed-early": { c: "var(--olive)", l: "CLOSED" },
    assigned: { c: "var(--warn)", l: "ASSIGNED" },
    rolled: { c: "var(--fg-mute)", l: "ROLLED" },
  };
  const m = map[v] || { c: "var(--fg-mute)", l: v };
  return <span style={{ color: m.c }}>● {m.l}</span>;
}

// ───────────────────────────── PERFORMANCE ─────────────────────────────
function Performance() {
  const path = genPath(240, 100, 0.02, 0.0015, 11);
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", marginBottom: 28 }}>
        <SummaryCell label="Total harvested" value="$48,290" sub="since inception · Aug 2023" />
        <SummaryCell label="Ann. yield on basis" value="9.4%" sub="above S&P div. 1.4%" />
        <SummaryCell label="Win rate" value="83%" sub="premium expires worthless" />
        <SummaryCell label="Assignment rate" value="11%" sub="average of 8 trades/mo" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24 }}>
        <div>
          <div className="h-eyebrow" style={{ marginBottom: 10 }}>Cumulative premium · 18 months</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)", padding: 20, height: 300 }}>
            <svg viewBox="0 0 240 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
              {[25, 50, 75].map(y => <line key={y} x1="0" y1={y} x2="240" y2={y} stroke="var(--line-soft)" strokeWidth="0.2" />)}
              <path d={`${path} L 240 100 L 0 100 Z`} fill="var(--acid-faint)" />
              <path d={path} stroke="var(--acid)" strokeWidth="0.8" fill="none" />
              {/* event markers */}
              <circle cx="80" cy="62" r="1" fill="var(--warn)" />
              <text x="82" y="60" fontFamily="var(--mono)" fontSize="2.4" fill="var(--warn)">NVDA earnings</text>
              <circle cx="168" cy="40" r="1" fill="var(--warn)" />
              <text x="170" y="38" fontFamily="var(--mono)" fontSize="2.4" fill="var(--warn)">Rate cut</text>
            </svg>
          </div>

          <div className="h-eyebrow" style={{ marginTop: 32, marginBottom: 10 }}>By ticker</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            {HARVEST_POSITIONS.slice(0, 6).map((p, i) => {
              const prem = (2000 + (i + 1) * 800 * (1 - i * 0.12)) | 0;
              const pct = 100 - i * 12;
              return (
                <div key={p.sym} style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px 90px", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", alignItems: "center" }}>
                  <div className="num" style={{ fontSize: 13, color: "var(--fg)" }}>{p.sym}</div>
                  <div style={{ height: 8, background: "var(--bg-elev)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: "var(--acid)" }} />
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg)" }}>${prem.toLocaleString()}</div>
                  <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)" }}>{(12 - i * 1.2).toFixed(1)}% yld</div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="h-eyebrow" style={{ marginBottom: 10 }}>Trade outcomes</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)", padding: 20 }}>
            <DonutChart data={[
              { label: "Expired worthless", v: 83, c: "var(--acid)" },
              { label: "Assigned", v: 11, c: "var(--warn)" },
              { label: "Rolled", v: 4, c: "var(--olive)" },
              { label: "Closed early", v: 2, c: "var(--fg-mute)" },
            ]} />
          </div>

          <div className="h-eyebrow" style={{ marginTop: 28, marginBottom: 10 }}>Execution quality</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 12 }}>
            <Line k="Avg slippage" v="$0.02" good />
            <Line k="Avg fill time" v="2.4s" good />
            <Line k="Vs. Harvest target" v="+2.1%" good />
            <Line k="Unfilled orders" v="3 / 47" />
            <Line k="Early closes saved" v="$840" good />
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ k, v, good }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ color: "var(--fg-mute)" }}>{k}</span>
      <span style={{ color: good ? "var(--acid)" : "var(--fg)" }}>{v}</span>
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  let acc = 0;
  const r = 40, cx = 50, cy = 50;
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <svg viewBox="0 0 100 100" width="120" height="120">
        {data.map((d, i) => {
          const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += d.v;
          const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const large = d.v / total > 0.5 ? 1 : 0;
          const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
          const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
          return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={d.c} stroke="var(--bg-card)" strokeWidth="1" />;
        })}
        <circle cx={cx} cy={cy} r="22" fill="var(--bg-card)" />
        <text x={cx} y={cy - 2} fontFamily="var(--mono)" fontSize="8" fill="var(--fg)" textAnchor="middle">83%</text>
        <text x={cx} y={cy + 7} fontFamily="var(--mono)" fontSize="4" fill="var(--fg-mute)" textAnchor="middle">WIN RATE</text>
      </svg>
      <div style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 11 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <div style={{ width: 8, height: 8, background: d.c, borderRadius: 1 }} />
            <span style={{ flex: 1, color: "var(--fg-dim)" }}>{d.label}</span>
            <span style={{ color: "var(--fg)" }}>{d.v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── WATCHLIST ─────────────────────────────
function Watchlist() {
  const list = HARVEST_SCREENER.slice(0, 10).map((s, i) => ({
    ...s, price: 50 + (s.ivr * 1.6 + i * 12), note: i === 2 ? "IV crush post-earnings" : i === 5 ? "wait for $175 breakout" : "",
  }));
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>Tickers I'm watching</h2>
        <span className="h-chip">{list.length} SYMBOLS</span>
        <div style={{ flex: 1 }} />
        <button className="h-btn sm">+ Add ticker</button>
      </div>
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 80px 1fr 80px",
          gap: 12, padding: "12px 20px", fontFamily: "var(--mono)", fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-mute)", borderBottom: "1px solid var(--line)",
        }}>
          <div>Sym</div><div>Price</div><div>IV rank</div><div>30d Δ</div><div>Target</div><div>Note</div><div></div>
        </div>
        {list.map(r => (
          <div key={r.sym} style={{
            display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 80px 1fr 80px",
            gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--line-soft)",
            fontFamily: "var(--mono)", fontSize: 12, alignItems: "center",
          }}>
            <div style={{ color: "var(--fg)" }}>{r.sym}</div>
            <div>${r.price.toFixed(2)}</div>
            <div style={{ color: r.ivr > 50 ? "var(--acid)" : "var(--fg-dim)" }}>{r.ivr}</div>
            <div style={{ color: "var(--fg-mute)" }}>+{(r.x + 2).toFixed(1)}%</div>
            <div style={{ color: "var(--fg-dim)" }}>${(r.price * 1.08).toFixed(0)}</div>
            <div style={{ fontFamily: "var(--body)", fontSize: 12, color: "var(--fg-mute)", fontStyle: r.note ? "normal" : "italic" }}>{r.note || "—"}</div>
            <div style={{ textAlign: "right" }}><button className="h-btn sm">Trade</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── ALERTS ─────────────────────────────
function Alerts() {
  const alerts = [
    { sev: "warn", t: "NVDA · $920 Call at 0.42Δ — assignment risk rising", d: "Now 62% P.O.P. vs. 64% at entry. Consider rolling to Jun 20 $940.", ts: "12 min ago" },
    { sev: "warn", t: "MSFT earnings May 2 — position in assigned range", d: "Current call expires 14 days after earnings. Review IV expansion.", ts: "2 hr ago" },
    { sev: "info", t: "Harvest · New recommendation for AAPL", d: "High-conviction May 16 $200C. 18.4% annualized yield.", ts: "Today · 09:14" },
    { sev: "info", t: "SOFI IVR now 62 — meets 'high-premium' filter", d: "You follow this ticker but do not hold shares. Consider selling puts.", ts: "Yesterday" },
    { sev: "ok", t: "AMD · $175C expired worthless — $840 harvested", d: "100% of premium kept. Funds cleared.", ts: "2 days ago" },
    { sev: "ok", t: "AAPL · April dividend collected — $96", d: "400 shares × $0.24. Next ex-div May 10.", ts: "3 days ago" },
  ];
  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["All", "Assignment risk", "Earnings", "Recommendations", "Fills", "Dividends"].map((t, i) => (
          <div key={t} style={{
            padding: "6px 12px", border: "1px solid " + (i === 0 ? "var(--fg)" : "var(--line)"),
            background: i === 0 ? "var(--fg)" : "transparent", color: i === 0 ? "var(--bg)" : "var(--fg-dim)",
            fontSize: 12, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", borderRadius: 2,
          }}>{t}</div>
        ))}
      </div>
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        {alerts.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: "18px 20px", borderBottom: i < alerts.length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "flex-start" }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", marginTop: 7,
              background: a.sev === "warn" ? "var(--warn)" : a.sev === "ok" ? "var(--acid)" : "var(--olive)",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "var(--fg)", fontWeight: 500, letterSpacing: "-0.005em" }}>{a.t}</div>
              <div style={{ fontSize: 13, color: "var(--fg-mute)", marginTop: 4, lineHeight: 1.5 }}>{a.d}</div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-faint)" }}>{a.ts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── SETTINGS ─────────────────────────────
function Settings() {
  const [tab, setTab] = React.useState("brokers");
  const tabs = ["brokers", "notifications", "tax lots", "risk", "account", "api"];
  return (
    <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 40 }}>
      <div>
        <div className="h-eyebrow" style={{ marginBottom: 12 }}>Settings</div>
        {tabs.map(t => (
          <div key={t} onClick={() => setTab(t)} style={{
            padding: "10px 12px", fontSize: 13, cursor: "pointer", borderRadius: 3, marginBottom: 2,
            background: tab === t ? "var(--bg-card)" : "transparent",
            border: tab === t ? "1px solid var(--line)" : "1px solid transparent",
            color: tab === t ? "var(--fg)" : "var(--fg-dim)", textTransform: "capitalize",
          }}>{t}</div>
        ))}
      </div>
      <div>
        {tab === "brokers" && <BrokerSettings />}
        {tab === "notifications" && <NotifSettings />}
        {tab === "risk" && <RiskSettings />}
        {tab !== "brokers" && tab !== "notifications" && tab !== "risk" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-0.01em", textTransform: "capitalize" }}>{tab}</h2>
            <div className="h-placeholder" style={{ height: 280 }}>{tab.toUpperCase()} SETTINGS</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrokerSettings() {
  const brokers = [
    { n: "Charles Schwab", acct: "•••• 4821", synced: "2 min ago", pos: 6, status: "connected" },
    { n: "Interactive Brokers", acct: "•••• 9104", synced: "18 min ago", pos: 2, status: "connected" },
    { n: "Fidelity", acct: "—", synced: "—", pos: 0, status: "add" },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Connected brokers</h2>
      <p style={{ color: "var(--fg-mute)", fontSize: 13, marginBottom: 24 }}>Harvest reads positions via read-only OAuth. Trades route through your broker.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {brokers.map(b => (
          <div key={b.n} style={{
            padding: 18, border: "1px solid var(--line)", background: b.status === "add" ? "var(--bg-elev)" : "var(--bg-card)",
            display: "grid", gridTemplateColumns: "1fr 120px 100px 100px", gap: 16, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{b.n}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)", marginTop: 4 }}>Account {b.acct}</div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)" }}>Synced {b.synced}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-dim)" }}>{b.pos} positions</div>
            <div style={{ textAlign: "right" }}>
              {b.status === "add"
                ? <button className="h-btn sm">+ Connect</button>
                : <button className="h-btn sm">Manage</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifSettings() {
  const groups = [
    { t: "Assignment risk", d: "Calls you've sold moving ITM", s: ["email", "push"] },
    { t: "Earnings windows", d: "Holdings approaching earnings", s: ["email"] },
    { t: "New recommendations", d: "High-conviction ideas from your portfolio", s: ["push"] },
    { t: "Fills & assignments", d: "Order executions, rolls, assignments", s: ["email", "push", "sms"] },
    { t: "Daily briefing", d: "9:00 am ET digest of overnight moves", s: ["email"] },
    { t: "Market anomalies", d: "IV spikes, unusual volume in your names", s: [] },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-0.01em" }}>Notifications</h2>
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        {groups.map((g, i) => (
          <div key={g.t} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 12, padding: "18px 20px", borderBottom: i < groups.length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{g.t}</div>
              <div style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 4 }}>{g.d}</div>
            </div>
            {["email", "push", "sms"].map(ch => (
              <Toggle key={ch} label={ch} on={g.s.includes(ch)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, on }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        margin: "0 auto", width: 36, height: 20, borderRadius: 10, padding: 2,
        background: on ? "var(--acid)" : "var(--line-strong)", cursor: "pointer", transition: "background .15s",
      }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)", marginLeft: on ? 16 : 0, transition: "margin .15s" }} />
      </div>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-mute)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function RiskSettings() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-0.01em" }}>Risk preferences</h2>
      <div style={{ display: "grid", gap: 20 }}>
        <SliderCard label="Max delta per call" value="0.30" hint="Lower = safer · Lower premium" />
        <SliderCard label="Min days to expiry" value="14 days" hint="Shorter = faster turnover · Higher gamma risk" />
        <SliderCard label="Max % of shares called" value="75%" hint="Keep some uncovered for upside" />
        <SliderCard label="Avoid earnings within" value="7 days" hint="Skip trades near earnings events" />
      </div>
    </div>
  );
}

function SliderCard({ label, value, hint }) {
  return (
    <div style={{ padding: 18, border: "1px solid var(--line)", background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{label}</div>
        <div style={{ flex: 1 }} />
        <div className="num" style={{ fontSize: 14, color: "var(--acid)" }}>{value}</div>
      </div>
      <div style={{ height: 4, background: "var(--bg-elev)", borderRadius: 2, marginBottom: 8, position: "relative" }}>
        <div style={{ width: "45%", height: "100%", background: "var(--acid)", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: "45%", top: -4, width: 12, height: 12, borderRadius: "50%", background: "var(--acid)", transform: "translateX(-50%)", border: "2px solid var(--bg-card)" }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--fg-mute)" }}>{hint}</div>
    </div>
  );
}

// ───────────────────────────── ACADEMY ─────────────────────────────
function Academy() {
  const modules = [
    { n: "01", t: "Why covered calls?", d: "The simplest option strategy. Trade upside for income.", dur: "6 min", done: true },
    { n: "02", t: "Picking the right strike", d: "Delta, probability of profit, and the 30Δ heuristic.", dur: "9 min", done: true },
    { n: "03", t: "Choosing an expiration", d: "Time decay, gamma risk, and the 30-45 DTE window.", dur: "8 min", done: true },
    { n: "04", t: "When to roll", d: "ITM, ATM, and managing assignment risk.", dur: "11 min", done: false, cur: true },
    { n: "05", t: "Implied volatility & IV rank", d: "Selling premium when volatility is rich.", dur: "10 min", done: false },
    { n: "06", t: "The wheel strategy", d: "Combining cash-secured puts and covered calls.", dur: "14 min", done: false },
    { n: "07", t: "Tax treatment of options", d: "Short-term gains, wash sales, qualified covered calls.", dur: "12 min", done: false },
    { n: "08", t: "Building a call-writing system", d: "Screening, position sizing, discipline.", dur: "16 min", done: false },
  ];
  return (
    <div style={{ padding: "28px 32px", maxWidth: 960 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 32, marginBottom: 28, alignItems: "end" }}>
        <div>
          <div className="h-eyebrow" style={{ marginBottom: 8 }}>Harvest Academy</div>
          <h2 className="serif" style={{ fontSize: 36, margin: 0, letterSpacing: "-0.01em", fontStyle: "italic" }}>Learn the wheel.</h2>
          <p style={{ color: "var(--fg-mute)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
            Eight short modules. You'll be writing your first covered call by module 04.
          </p>
        </div>
        <div style={{ padding: 14, border: "1px solid var(--line)", background: "var(--bg-card)" }}>
          <div className="h-eyebrow" style={{ marginBottom: 4 }}>Progress</div>
          <div className="num" style={{ fontSize: 22, color: "var(--fg)" }}>3 / 8</div>
          <div style={{ height: 4, background: "var(--bg-elev)", marginTop: 10 }}>
            <div style={{ width: "37%", height: "100%", background: "var(--acid)" }} />
          </div>
        </div>
      </div>
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        {modules.map((m, i) => (
          <div key={m.n} style={{
            display: "grid", gridTemplateColumns: "50px 1fr 100px 120px", gap: 16, padding: "18px 24px",
            borderBottom: i < modules.length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "center", cursor: "pointer",
            background: m.cur ? "var(--acid-faint)" : "transparent", borderLeft: m.cur ? "2px solid var(--acid)" : "2px solid transparent",
          }}>
            <div className="num" style={{ fontSize: 13, color: m.done ? "var(--fg-mute)" : "var(--acid)" }}>{m.n}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--fg)", letterSpacing: "-0.005em", textDecoration: m.done ? "line-through" : "none", textDecorationColor: "var(--fg-mute)" }}>{m.t}</div>
              <div style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 4 }}>{m.d}</div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)" }}>{m.dur}</div>
            <div style={{ textAlign: "right" }}>
              {m.done ? <span className="h-chip acid">COMPLETED</span> : m.cur ? <button className="h-btn sm primary">Continue →</button> : <button className="h-btn sm">Start</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Journal, Performance, Watchlist, Alerts, Settings, Academy, PositionsView, RecommendationsView });
