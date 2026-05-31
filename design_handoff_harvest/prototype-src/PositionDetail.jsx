// Position detail — single ticker deep-dive. Carries Dashboard A visual language.

function PositionDetail({ sym = "AAPL", goto = () => {} }) {
  const p = HARVEST_POSITIONS.find(x => x.sym === sym) || HARVEST_POSITIONS[0];
  const unreal = (p.price - p.avg) * p.shares;
  const unrealPct = ((p.price - p.avg) / p.avg) * 100;

  const chartPath = genPath(240, 100, 0.03, 0.002, 73);

  const chain = [
    { strike: 190, exp: "May 16", prem: 5.40, delta: 0.62, pop: 38, yAnn: 8.2 },
    { strike: 195, exp: "May 16", prem: 3.60, delta: 0.42, pop: 58, yAnn: 12.1 },
    { strike: 200, exp: "May 16", prem: 2.45, delta: 0.28, pop: 72, yAnn: 18.4, rec: true },
    { strike: 205, exp: "May 16", prem: 1.55, delta: 0.18, pop: 82, yAnn: 14.6 },
    { strike: 210, exp: "May 16", prem: 0.92, delta: 0.11, pop: 89, yAnn: 10.3 },
  ];

  return (
    <div className="h-root" style={{ padding: "0 0 60px" }}>
      {/* header */}
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)", cursor: "pointer" }} onClick={() => goto("positions")}>
            ← POSITIONS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", fontWeight: 500, margin: 0 }}>{p.sym}</h1>
              <span style={{ fontSize: 16, color: "var(--fg-mute)" }}>{p.name}</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 28, alignItems: "flex-end" }}>
            <Stat label="Last" value={`$${p.price.toFixed(2)}`} delta={p.day} />
            <Stat label="Position" value={`${p.shares.toLocaleString()} sh`} />
            <Stat label="Avg cost" value={`$${p.avg.toFixed(2)}`} />
            <Stat label="Market value" value={`$${(p.price * p.shares).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Stat label="Unrealized" value={`${unreal >= 0 ? "+" : ""}$${Math.abs(unreal).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${unrealPct >= 0 ? "+" : ""}${unrealPct.toFixed(1)}%`} positive={unreal >= 0} />
          </div>
          <button className="h-btn primary" onClick={() => goto("ticket")}>Sell a call</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 0, minHeight: 640 }}>
        {/* left column */}
        <div style={{ padding: "28px 32px", borderRight: "1px solid var(--line)" }}>
          {/* chart */}
          <Panel title="Price · 6 months" right={<TimeRangeChips />}>
            <div style={{ position: "relative", height: 280, padding: "8px 0" }}>
              <PriceChartLarge path={chartPath} price={p.price} avg={p.avg} />
            </div>
          </Panel>

          {/* option chain mini */}
          <Panel title="Call chain · May 16 expiry" right={<span className="h-chip">RECOMMENDED STRIKE HIGHLIGHTED</span>}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "80px 80px 80px 80px 80px 1fr", gap: 12,
                padding: "10px 16px", color: "var(--fg-mute)", fontSize: 10, letterSpacing: "0.1em",
                textTransform: "uppercase", borderBottom: "1px solid var(--line)",
              }}>
                <div>Strike</div><div>Premium</div><div>Δ Delta</div><div>P.O.P.</div><div>Ann. yield</div><div></div>
              </div>
              {chain.map(c => (
                <div key={c.strike} style={{
                  display: "grid", gridTemplateColumns: "80px 80px 80px 80px 80px 1fr", gap: 12,
                  padding: "12px 16px", borderBottom: "1px solid var(--line-soft)",
                  background: c.rec ? "var(--acid-faint)" : "transparent",
                  borderLeft: c.rec ? "2px solid var(--acid)" : "2px solid transparent",
                  alignItems: "center",
                }}>
                  <div style={{ color: "var(--fg)", fontWeight: 500 }}>${c.strike}</div>
                  <div>${c.prem.toFixed(2)}</div>
                  <div style={{ color: "var(--fg-dim)" }}>{c.delta.toFixed(2)}</div>
                  <div style={{ color: "var(--fg-dim)" }}>{c.pop}%</div>
                  <div style={{ color: c.rec ? "var(--acid)" : "var(--fg-dim)" }}>{c.yAnn.toFixed(1)}%</div>
                  <div style={{ textAlign: "right" }}>
                    <button className="h-btn sm" onClick={() => goto("ticket")}>Trade</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* recent activity */}
          <Panel title="Option history · AAPL">
            <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              {HARVEST_HISTORY.filter(h => h.sym === p.sym).map(h => (
                <div key={h.id} style={{
                  display: "grid", gridTemplateColumns: "80px 80px 80px 80px 1fr 90px 80px",
                  gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", alignItems: "center",
                }}>
                  <div style={{ color: "var(--fg-mute)" }}>{h.date}</div>
                  <div style={{ color: "var(--fg)" }}>{h.action}</div>
                  <div>${h.strike}</div>
                  <div>{h.qty}×</div>
                  <div style={{ color: "var(--fg-mute)" }}>exp. {h.exp}</div>
                  <div style={{ textAlign: "right", color: h.pnl >= 0 ? "var(--acid)" : "var(--down)" }}>
                    {h.pnl > 0 ? "+" : ""}${h.pnl}
                  </div>
                  <div style={{ textAlign: "right", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                    {h.outcome}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* right column */}
        <div style={{ padding: "28px 24px", background: "var(--bg-elev)" }}>
          <div className="h-eyebrow" style={{ marginBottom: 12 }}>Recommendation</div>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--line)", padding: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span className="h-chip acid">HIGH CONVICTION</span>
              <span className="num" style={{ fontSize: 11, color: "var(--fg-mute)" }}>score 88</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 8 }}>
              Sell 4× May 16 $200 Call
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)", marginBottom: 16 }}>
              Covers all 400 shares · 26 days to expiry
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--line)", border: "1px solid var(--line)", marginBottom: 16 }}>
              <MiniStat label="Premium" value="$980" sub="2.45 × 400" bg="var(--bg-card)" />
              <MiniStat label="Ann. yield" value="18.4%" sub="on basis" bg="var(--bg-card)" />
              <MiniStat label="P.O.P." value="72%" sub="prob. profit" bg="var(--bg-card)" />
              <MiniStat label="Max loss" value="Capped" sub="if assigned" bg="var(--bg-card)" />
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-dim)", lineHeight: 1.55, marginBottom: 16 }}>
              IV rank at 28 offers reasonable premium. $200 strike sits above 1σ range and two prior rejection points. Earnings are post-expiration — event risk avoided.
            </div>
            <button className="h-btn primary" style={{ width: "100%" }} onClick={() => goto("ticket")}>
              Review & sell
            </button>
          </div>

          <div style={{ marginTop: 28 }} className="h-eyebrow">Volatility</div>
          <div style={{ marginTop: 12, background: "var(--bg-card)", border: "1px solid var(--line)", padding: 16, fontFamily: "var(--mono)", fontSize: 11 }}>
            <Row k="IV" v="24.2%" />
            <Row k="IV rank" v="28 / 100" />
            <Row k="HV (30d)" v="19.4%" />
            <Row k="IV / HV" v="1.25" />
            <Row k="Earnings" v="May 2" warn />
          </div>

          <div style={{ marginTop: 28 }} className="h-eyebrow">Tax lots</div>
          <div style={{ marginTop: 12, background: "var(--bg-card)", border: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11 }}>
            {[
              { date: "Jan 08, 2023", qty: 200, basis: 145.20 },
              { date: "Aug 14, 2023", qty: 100, basis: 176.00 },
              { date: "Feb 01, 2024", qty: 100, basis: 184.80 },
            ].map(l => (
              <div key={l.date} style={{ display: "grid", gridTemplateColumns: "1fr 50px 70px", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ color: "var(--fg-mute)" }}>{l.date}</div>
                <div>{l.qty}</div>
                <div style={{ textAlign: "right" }}>${l.basis.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, delta, positive }) {
  const posClass = positive !== undefined ? (positive ? "h-up" : "h-down") : "";
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 4, fontSize: 10 }}>{label}</div>
      <div className={`num ${posClass}`} style={{ fontSize: 18, color: posClass ? undefined : "var(--fg)" }}>
        {value}
        {delta !== undefined && (
          <span className={delta >= 0 ? "h-up" : "h-down"} style={{ fontSize: 12, marginLeft: 8 }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
          </span>
        )}
      </div>
      {sub && <div className={`num ${posClass}`} style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, sub, bg = "var(--bg-card)" }) {
  return (
    <div style={{ background: bg, padding: "12px 14px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--fg-mute)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: 16, color: "var(--fg)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--mono)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Row({ k, v, warn }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ color: "var(--fg-mute)" }}>{k}</span>
      <span style={{ color: warn ? "var(--warn)" : "var(--fg)" }}>{v}</span>
    </div>
  );
}

function Panel({ title, right, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div className="h-eyebrow">{title}</div>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
        {children}
      </div>
    </div>
  );
}

function TimeRangeChips() {
  const ranges = ["1M", "3M", "6M", "YTD", "1Y", "5Y"];
  const [sel, setSel] = React.useState("6M");
  return (
    <div style={{ display: "flex", gap: 0, border: "1px solid var(--line)", borderRadius: 2 }}>
      {ranges.map(r => (
        <div key={r} onClick={() => setSel(r)} style={{
          padding: "4px 10px", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer",
          background: sel === r ? "var(--acid-faint)" : "transparent",
          color: sel === r ? "var(--acid)" : "var(--fg-mute)",
          borderRight: r === ranges[ranges.length - 1] ? "none" : "1px solid var(--line)",
        }}>{r}</div>
      ))}
    </div>
  );
}

function PriceChartLarge({ path, price, avg }) {
  const w = 100, h = 100;
  // path is SVG path d
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {[0.2, 0.4, 0.6, 0.8].map(y => (
        <line key={y} x1="0" y1={y * h} x2={w} y2={y * h} stroke="var(--line-soft)" strokeWidth="0.2" />
      ))}
      <path d={path} stroke="var(--acid)" strokeWidth="0.8" fill="none" />
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="var(--acid-faint)" />
      {/* cost basis line */}
      <line x1="0" y1="55" x2={w} y2="55" stroke="var(--warn)" strokeWidth="0.3" strokeDasharray="1 1" />
      <text x="1" y="54" fontFamily="var(--mono)" fontSize="2.4" fill="var(--warn)">avg $162.40</text>
      {/* current price marker */}
      <circle cx={w - 0.5} cy={18} r="0.8" fill="var(--acid)" />
      <text x={w - 14} y={15} fontFamily="var(--mono)" fontSize="2.4" fill="var(--fg)" textAnchor="end">${price.toFixed(2)}</text>
    </svg>
  );
}

Object.assign(window, { PositionDetail });
