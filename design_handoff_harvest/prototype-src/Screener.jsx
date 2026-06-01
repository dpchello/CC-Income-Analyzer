// Harvest — Screener (chart-forward premium vs yield scatter). App-shell compatible.
// Renders its own content only (no sidebar/topbar — the AppShell provides those).

function Screener({ goto = () => {} }) {
  const [highlight, setHighlight] = React.useState("s1");
  const [preset, setPreset] = React.useState(1);
  const [filters, setFilters] = React.useState({ ivr: 25, yield: 15 });
  const presets = ["Wheel starters", "High-IV income", "Low-delta conservative", "My watchlist", "Custom"];

  const filtered = HARVEST_SCREENER.filter(s => s.ivr >= filters.ivr && s.y >= filters.yield);
  const highlighted = filtered.find(s => s.id === highlight) || filtered[0] || HARVEST_SCREENER[0];

  return (
    <div className="h-root" style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", minHeight: "calc(100vh - 56px)" }}>
      {/* filter rail */}
      <div style={{ borderRight: "1px solid var(--line)", padding: "24px 20px", background: "var(--bg-elev)" }}>
        <span className="h-eyebrow">Preset</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10, marginBottom: 24 }}>
          {presets.map((p, i) => (
            <div key={p} onClick={() => setPreset(i)} style={{
              padding: "8px 12px", fontSize: 13, borderRadius: 2, cursor: "pointer",
              background: i === preset ? "var(--acid-faint)" : "transparent",
              color: i === preset ? "var(--acid)" : "var(--fg-dim)",
              border: `1px solid ${i === preset ? "var(--acid-line)" : "var(--line)"}`,
            }}>{p}</div>
          ))}
        </div>

        <span className="h-eyebrow">Filters</span>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 20 }}>
          <FilterSlider label="Delta" v="0.20 — 0.40" fill="20% · 60%" />
          <FilterSlider label="DTE" v="7 — 45" fill="14% · 72%" />
          <RangeSlider label="IV rank" value={filters.ivr} min={0} max={100} onChange={v => setFilters({ ...filters, ivr: v })} suffix="≥" />
          <RangeSlider label="Annualized yield" value={filters.yield} min={0} max={60} onChange={v => setFilters({ ...filters, yield: v })} suffix="≥" unit="%" />
          <FilterSlider label="Earnings before expiry" v="Exclude" fill="0% · 100%" chip />
          <FilterSlider label="Market cap" v="≥ $1B" fill="12% · 100%" />
          <FilterSlider label="Sector" v="All" fill="0% · 100%" chip />
        </div>
        <button className="h-btn primary sm" style={{ marginTop: 20, width: "100%" }}>Apply</button>
        <button className="h-btn sm" style={{ marginTop: 8, width: "100%" }}>Save preset</button>
      </div>

      {/* chart + results */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <span className="h-eyebrow">Premium × Yield · {filtered.length} candidates</span>
              <div style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 4, fontFamily: "var(--mono)" }}>Each dot is a ticker's best near-month 0.30-delta call. Hover to select.</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span className="h-chip">X: Premium %</span>
              <span className="h-chip">Y: Ann. yield</span>
              <button className="h-btn sm">Swap axes</button>
            </div>
          </div>
          <Scatter points={filtered} width={760} height={340} highlightId={highlight} onHover={setHighlight} />
        </div>
        <div style={{ flex: 1, overflow: "auto" }} className="h-scroll">
          <div style={{
            display: "grid", gridTemplateColumns: "60px 1fr 90px 90px 90px 90px 90px",
            padding: "10px 28px", gap: 12, background: "var(--bg-elev)", borderBottom: "1px solid var(--line)",
          }} className="h-eyebrow">
            <span>Sym</span><span>Setup</span>
            <span style={{ textAlign: "right" }}>Premium</span>
            <span style={{ textAlign: "right" }}>Ann. yield</span>
            <span style={{ textAlign: "right" }}>Delta</span>
            <span style={{ textAlign: "right" }}>IV rank</span>
            <span />
          </div>
          {filtered.map(s => {
            const isH = s.id === highlight;
            return (
              <div key={s.id} onMouseEnter={() => setHighlight(s.id)}
                onClick={() => goto("ticket")}
                style={{
                  display: "grid", gridTemplateColumns: "60px 1fr 90px 90px 90px 90px 90px",
                  gap: 12, padding: "12px 28px", fontSize: 13, borderBottom: "1px solid var(--line-soft)",
                  background: isH ? "var(--acid-faint)" : "transparent",
                  borderLeft: isH ? "1px solid var(--acid)" : "1px solid transparent", marginLeft: -1,
                  cursor: "pointer", alignItems: "center",
                }}>
                <span className="num" style={{ color: "var(--fg)" }}>{s.sym}</span>
                <span style={{ color: "var(--fg-dim)", fontFamily: "var(--mono)", fontSize: 11.5 }}>May 16 · {(s.delta * 100).toFixed(0)}Δ call</span>
                <span className="num" style={{ textAlign: "right", color: "var(--acid)" }}>{s.x.toFixed(1)}%</span>
                <span className="num" style={{ textAlign: "right", color: "var(--fg)" }}>{s.y}%</span>
                <span className="num" style={{ textAlign: "right", color: "var(--fg-dim)" }}>{s.delta.toFixed(2)}</span>
                <span className="num" style={{ textAlign: "right", color: s.ivr > 40 ? "var(--acid)" : "var(--fg-dim)" }}>{s.ivr}</span>
                <button className="h-btn sm" style={{ justifySelf: "end" }} onClick={e => { e.stopPropagation(); goto("ticket"); }}>Trade</button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: "var(--fg-mute)", fontFamily: "var(--mono)", fontSize: 12 }}>
              No candidates match your filters. Loosen IV rank or yield.
            </div>
          )}
        </div>
      </div>

      {/* right inspector */}
      <div style={{ borderLeft: "1px solid var(--line)", padding: "24px 22px", background: "var(--bg-elev)" }}>
        <div className="h-eyebrow">Selected</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
          <div className="serif" style={{ fontSize: 36, color: "var(--fg)", letterSpacing: "-0.03em" }}>{highlighted.sym}</div>
          <span className="h-chip acid">Near-month setup</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <LineChart points={genPath(40, 100, 0.01, 0.0012, highlighted.sym.charCodeAt(0) * 2)} width={260} height={120} color="var(--acid)" padding={16} yTicks={3} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
          <Mini k="Premium" v={`${highlighted.x}%`} acid />
          <Mini k="Ann. yield" v={`${highlighted.y}%`} />
          <Mini k="Delta" v={highlighted.delta.toFixed(2)} />
          <Mini k="IV rank" v={highlighted.ivr} />
        </div>
        <div style={{ marginTop: 24, padding: 16, background: "var(--bg)", border: "1px solid var(--line)" }}>
          <span className="h-eyebrow">Thesis</span>
          <p style={{ color: "var(--fg-dim)", fontSize: 12.5, lineHeight: 1.6, marginTop: 8 }}>
            {highlighted.sym} IV rank {highlighted.ivr} sits {highlighted.ivr > 40 ? "above" : "near"} its 12-month median.
            A {(highlighted.delta * 100).toFixed(0)}-delta May 16 call captures {highlighted.x}% of price as premium,
            equivalent to {highlighted.y}% annualized against cost of shares.
          </p>
        </div>
        <button className="h-btn primary sm" style={{ marginTop: 18, width: "100%" }} onClick={() => goto("ticket")}>Open order ticket</button>
        <button className="h-btn sm" style={{ marginTop: 8, width: "100%" }}>Add to watchlist</button>
      </div>
    </div>
  );
}

function FilterSlider({ label, v, fill, chip }) {
  const [a, b] = (fill || "0% · 100%").split(" · ");
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-dim)", marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: "var(--fg)", fontFamily: "var(--mono)", fontSize: 11 }}>{v}</span>
      </div>
      {!chip && (
        <div style={{ height: 4, background: "var(--bg-elev-2)", borderRadius: 2, position: "relative" }}>
          <div style={{ position: "absolute", left: a, width: `calc(${b} - ${a})`, top: 0, bottom: 0, background: "var(--acid)", borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}

function RangeSlider({ label, value, min, max, onChange, suffix = "", unit = "" }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-dim)", marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: "var(--fg)", fontFamily: "var(--mono)", fontSize: 11 }}>{suffix} {value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "var(--acid)" }} />
    </div>
  );
}

Object.assign(window, { Screener });
