// Trade ticket — Simple + Pro toggle. Working strike/expiry selector.

function TradeTicket({ sym = "AAPL", goto = () => {} }) {
  const [mode, setMode] = React.useState("simple"); // simple | pro
  const [ticker, setTicker] = React.useState(sym);

  const p = HARVEST_POSITIONS.find(x => x.sym === ticker) || HARVEST_POSITIONS[0];

  const expirations = ["May 02", "May 09", "May 16", "May 23", "Jun 20", "Jul 18", "Sep 19"];
  const [exp, setExp] = React.useState("May 16");

  const strikes = [185, 190, 195, 200, 205, 210, 215, 220];
  const [strike, setStrike] = React.useState(200);
  const [qty, setQty] = React.useState(Math.floor(p.shares / 100));

  // Premium model: distance-from-money × time decay
  const dte = { "May 02": 12, "May 09": 19, "May 16": 26, "May 23": 33, "Jun 20": 61, "Jul 18": 89, "Sep 19": 152 }[exp] || 26;
  const moneyness = (p.price - strike) / p.price; // + if ITM
  const atmBase = p.price * 0.02;
  const time = Math.sqrt(dte / 30);
  const otmDecay = Math.exp(-Math.max(0, -moneyness) * 12);
  const premium = Math.max(0.05, atmBase * time * otmDecay + Math.max(0, moneyness * p.price));
  const delta = moneyness > 0 ? Math.min(0.95, 0.5 + moneyness * 4) : Math.max(0.05, 0.5 * Math.exp(moneyness * 6));
  const pop = Math.round(100 * (1 - delta));
  const total = premium * 100 * qty;
  const yieldAnn = (premium * 100 * qty) / (p.avg * 100 * qty) * (365 / dte) * 100;

  return (
    <div className="h-root" style={{ padding: "0 0 60px" }}>
      {/* header */}
      <div style={{ padding: "28px 32px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)", cursor: "pointer" }} onClick={() => goto("recommendations")}>
          ← BACK
        </span>
        <h1 style={{ fontSize: 24, letterSpacing: "-0.02em", fontWeight: 500, margin: 0 }}>New covered call</h1>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--line-strong)", borderRadius: 4, padding: 2, background: "var(--bg-elev)" }}>
          {["simple", "pro"].map(m => (
            <div key={m} onClick={() => setMode(m)} style={{
              padding: "6px 16px", fontSize: 12, cursor: "pointer", borderRadius: 3,
              textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)", fontSize: 10,
              background: mode === m ? "var(--bg-card)" : "transparent",
              color: mode === m ? "var(--fg)" : "var(--fg-mute)",
              boxShadow: mode === m ? "0 1px 0 var(--line)" : "none",
            }}>{m}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", minHeight: 640 }}>
        {/* builder */}
        <div style={{ padding: "32px 40px", borderRight: "1px solid var(--line)" }}>
          {/* underlying */}
          <Section label="Underlying">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select value={ticker} onChange={e => setTicker(e.target.value)} style={selectStyle}>
                {HARVEST_POSITIONS.filter(x => x.shares >= 100).map(x => (
                  <option key={x.sym} value={x.sym}>{x.sym} · {x.shares} sh · ${x.price.toFixed(2)}</option>
                ))}
              </select>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-mute)" }}>
                Avg ${p.avg.toFixed(2)} · Last <span style={{ color: "var(--fg)" }}>${p.price.toFixed(2)}</span>
              </div>
            </div>
          </Section>

          {/* expiration */}
          <Section label="Expiration" hint={`${dte} days to expiry`}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {expirations.map(e => (
                <div key={e} onClick={() => setExp(e)} style={{
                  padding: "8px 14px", border: "1px solid " + (exp === e ? "var(--acid)" : "var(--line)"),
                  background: exp === e ? "var(--acid-faint)" : "transparent",
                  color: exp === e ? "var(--acid)" : "var(--fg-dim)",
                  fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 3,
                }}>{e}</div>
              ))}
            </div>
          </Section>

          {/* strike */}
          <Section label="Strike" hint={moneyness > 0 ? `${(moneyness * 100).toFixed(1)}% ITM` : `${(-moneyness * 100).toFixed(1)}% OTM`}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {strikes.map(s => {
                const sm = (p.price - s) / p.price;
                const itm = sm > 0;
                return (
                  <div key={s} onClick={() => setStrike(s)} style={{
                    padding: "8px 14px", border: "1px solid " + (strike === s ? "var(--acid)" : "var(--line)"),
                    background: strike === s ? "var(--acid-faint)" : (itm ? "var(--warn-faint)" : "transparent"),
                    color: strike === s ? "var(--acid)" : (itm ? "var(--warn)" : "var(--fg-dim)"),
                    fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 3,
                  }}>${s}</div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--mono)", marginTop: 10 }}>
              Orange = in-the-money · Grey = out-of-the-money
            </div>
          </Section>

          {/* contracts */}
          <Section label="Contracts" hint={`${qty * 100} / ${p.shares} shares covered`}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="h-btn sm" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <input type="number" value={qty} onChange={e => setQty(Math.max(1, Math.min(Math.floor(p.shares / 100), +e.target.value || 1)))} style={{
                ...selectStyle, width: 80, textAlign: "center", fontFamily: "var(--mono)",
              }} />
              <button className="h-btn sm" onClick={() => setQty(Math.min(Math.floor(p.shares / 100), qty + 1))}>+</button>
              <button className="h-btn sm" onClick={() => setQty(Math.floor(p.shares / 100))}>Max</button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--mono)" }}>
                1 contract = 100 shares
              </div>
            </div>
          </Section>

          {/* pro-only */}
          {mode === "pro" && (
            <>
              <Section label="Greeks & probability">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, border: "1px solid var(--line)", background: "var(--line)" }}>
                  <Greek label="Δ Delta" value={delta.toFixed(2)} />
                  <Greek label="Γ Gamma" value={(0.014 + Math.random() * 0.004).toFixed(3)} />
                  <Greek label="Θ Theta" value={(-premium / dte * 10).toFixed(3)} />
                  <Greek label="ν Vega" value={(premium * 0.28).toFixed(3)} />
                  <Greek label="IV" value={(18 + moneyness * 40).toFixed(1) + "%"} />
                </div>
              </Section>
              <Section label="Risk scenarios" hint="at expiration">
                <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {[
                    { s: "Stock > $" + strike, label: "Assigned", v: `Sell at $${strike}, keep $${total.toFixed(0)} premium` },
                    { s: "Stock = $" + strike, label: "Break-even line", v: `Keep shares + $${total.toFixed(0)}` },
                    { s: "Stock < $" + strike, label: "Expires worthless", v: `Keep shares + $${total.toFixed(0)}` },
                    { s: "Stock < $" + p.avg, label: "Loss on underlying", v: `Premium offsets loss by ${(premium / p.avg * 100).toFixed(1)}%` },
                  ].map((row, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 140px 1fr", gap: 16, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", border: i === 0 ? "1px solid var(--line)" : "", borderBottom: "1px solid var(--line-soft)" }}>
                      <div style={{ color: "var(--fg-mute)" }}>{row.s}</div>
                      <div style={{ color: "var(--fg)" }}>{row.label}</div>
                      <div style={{ color: "var(--fg-dim)" }}>{row.v}</div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section label="Order type">
                <div style={{ display: "flex", gap: 6 }}>
                  {["Limit", "Market", "Stop-limit", "Trailing"].map((o, i) => (
                    <div key={o} style={{
                      padding: "8px 14px", border: "1px solid " + (i === 0 ? "var(--acid)" : "var(--line)"),
                      background: i === 0 ? "var(--acid-faint)" : "transparent",
                      color: i === 0 ? "var(--acid)" : "var(--fg-dim)",
                      fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", borderRadius: 3,
                    }}>{o}</div>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <LabeledInput label="Limit price" value={`$${premium.toFixed(2)}`} />
                  <LabeledInput label="Time in force" value="Day" />
                </div>
              </Section>
            </>
          )}
        </div>

        {/* ticket summary rail */}
        <div style={{ padding: "32px 28px", background: "var(--bg-elev)" }}>
          <div className="h-eyebrow" style={{ marginBottom: 16 }}>Order preview</div>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--line)", padding: 24 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 22, letterSpacing: "-0.02em", color: "var(--fg)", marginBottom: 6 }}>
              Sell to open
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--fg)", marginBottom: 20 }}>
              {qty}× {ticker} {exp} <span style={{ color: "var(--acid)" }}>${strike}C</span> @ ${premium.toFixed(2)}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--line)", border: "1px solid var(--line)", marginBottom: 16 }}>
              <MiniStat label="Premium received" value={`$${total.toFixed(0)}`} sub={`${premium.toFixed(2)} × ${qty * 100}`} bg="var(--bg-card)" />
              <MiniStat label="Ann. yield" value={`${yieldAnn.toFixed(1)}%`} sub={`on ${ticker} basis`} bg="var(--bg-card)" />
              <MiniStat label="P.O.P." value={`${pop}%`} sub="prob. profit" bg="var(--bg-card)" />
              <MiniStat label="If assigned" value={`$${(strike * qty * 100).toLocaleString()}`} sub={`+${((strike - p.avg) / p.avg * 100).toFixed(1)}% on shares`} bg="var(--bg-card)" />
            </div>

            {/* payoff sketch */}
            <PayoffChart price={p.price} strike={strike} premium={premium} avg={p.avg} />

            <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--fg-mute)", marginTop: 14, lineHeight: 1.6 }}>
              Max profit if {ticker} closes above ${strike}: <span style={{ color: "var(--acid)" }}>${((strike - p.avg) * qty * 100 + total).toFixed(0)}</span>.
              Shares will be called away.
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="h-btn primary" style={{ height: 44, fontSize: 14 }}>
              Review & submit order
            </button>
            <button className="h-btn" style={{ height: 36 }} onClick={() => goto("dashboard")}>
              Save to watchlist
            </button>
            <div style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--mono)", textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
              Executed via connected broker (Schwab).<br/>Subject to broker approval and market hours.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  height: 36, padding: "0 12px", border: "1px solid var(--line-strong)", background: "var(--bg-card)",
  color: "var(--fg)", fontFamily: "var(--body)", fontSize: 13, borderRadius: 3, outline: "none",
};

function Section({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
        <div className="h-eyebrow">{label}</div>
        <div style={{ flex: 1 }} />
        {hint && <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-mute)" }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Greek({ label, value }) {
  return (
    <div style={{ background: "var(--bg-card)", padding: "12px 14px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--fg-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div className="num" style={{ fontSize: 14, color: "var(--fg)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function LabeledInput({ label, value }) {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <input defaultValue={value} style={selectStyle} />
    </div>
  );
}

function PayoffChart({ price, strike, premium, avg }) {
  const w = 360, h = 90;
  const xMin = avg * 0.8, xMax = strike * 1.2;
  const toX = v => ((v - xMin) / (xMax - xMin)) * w;
  const payoff = v => v < strike ? (v - avg) * 100 + premium * 100 : (strike - avg) * 100 + premium * 100;
  const maxP = payoff(strike) + 50;
  const minP = (xMin - avg) * 100 + premium * 100;
  const toY = v => h - ((v - minP) / (maxP - minP)) * h;
  const pts = [];
  for (let v = xMin; v <= xMax; v += (xMax - xMin) / 60) pts.push([toX(v), toY(payoff(v))]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 8 }}>Payoff at expiry</div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, border: "1px solid var(--line-soft)" }}>
        <line x1="0" y1={toY(0)} x2={w} y2={toY(0)} stroke="var(--line)" strokeDasharray="2 3" />
        <line x1={toX(strike)} y1="0" x2={toX(strike)} y2={h} stroke="var(--acid-line)" strokeDasharray="2 3" />
        <line x1={toX(avg)} y1="0" x2={toX(avg)} y2={h} stroke="var(--warn)" strokeDasharray="2 3" opacity="0.7" />
        <path d={d} stroke="var(--acid)" strokeWidth="1.4" fill="none" />
        <text x={toX(strike) + 4} y="10" fontFamily="var(--mono)" fontSize="9" fill="var(--acid)">strike ${strike}</text>
        <text x={toX(avg) + 4} y="22" fontFamily="var(--mono)" fontSize="9" fill="var(--warn)">basis ${avg.toFixed(2)}</text>
      </svg>
    </div>
  );
}

Object.assign(window, { TradeTicket });
