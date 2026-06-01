// Onboarding flow — 4 steps. Signup → Connect broker → Import portfolio → Goals.

function Onboarding({ goto = () => {} }) {
  const [step, setStep] = React.useState(0);
  const steps = ["Account", "Connect", "Import", "Goals"];

  return (
    <div className="h-root" style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ height: 60, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", padding: "0 32px", background: "var(--bg)" }}>
        <HarvestLogo size={18} />
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--fg-mute)", fontFamily: "var(--mono)" }}>
          Step {step + 1} of {steps.length}
        </div>
      </div>

      {/* stepper */}
      <div style={{ padding: "28px 32px 0", display: "flex", gap: 4, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 3, background: i <= step ? "var(--acid)" : "var(--line)", marginBottom: 8 }} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: i === step ? "var(--fg)" : "var(--fg-mute)" }}>
              {String(i + 1).padStart(2, "0")} · {s}
            </div>
          </div>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: 560 }}>
          {step === 0 && <OnbAccount />}
          {step === 1 && <OnbConnect />}
          {step === 2 && <OnbImport />}
          {step === 3 && <OnbGoals />}

          <div style={{ marginTop: 36, display: "flex", gap: 10 }}>
            {step > 0 && <button className="h-btn" onClick={() => setStep(step - 1)}>Back</button>}
            <div style={{ flex: 1 }} />
            {step < steps.length - 1 ? (
              <button className="h-btn primary" onClick={() => setStep(step + 1)}>Continue →</button>
            ) : (
              <button className="h-btn primary" onClick={() => goto("dashboard")}>Enter Harvest →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OnbAccount() {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 12 }}>Create your account</div>
      <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", fontWeight: 500, margin: "0 0 12px" }}>Let's plant the first row.</h2>
      <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
        Harvest is read-only by default. We never move money or place trades unless you explicitly authorize it.
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        <Input label="Email" placeholder="jane@meridian.co" />
        <Input label="Password" placeholder="••••••••••••" type="password" />
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="First name" placeholder="Jane" />
          <Input label="Last name" placeholder="Meridian" />
        </div>
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--fg-mute)", lineHeight: 1.5 }}>
        <input type="checkbox" defaultChecked />
        <span>I agree to Harvest's <a style={{ color: "var(--fg)", textDecoration: "underline" }}>Terms</a> and <a style={{ color: "var(--fg)", textDecoration: "underline" }}>Privacy policy</a>. I understand Harvest is educational and not personalized investment advice.</span>
      </div>
    </div>
  );
}

function OnbConnect() {
  const brokers = [
    { n: "Schwab", note: "Full support · instant", rec: true },
    { n: "Interactive Brokers", note: "Full support · OAuth" },
    { n: "Fidelity", note: "Read-only via link" },
    { n: "Robinhood", note: "Read-only via link" },
    { n: "E*TRADE", note: "Full support · OAuth" },
    { n: "Vanguard", note: "CSV import only" },
  ];
  const [sel, setSel] = React.useState("Schwab");
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 12 }}>Connect your broker</div>
      <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", fontWeight: 500, margin: "0 0 12px" }}>Where do your shares live?</h2>
      <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Pick one broker to start. You can add more later. We use read-only OAuth — your credentials never touch our servers.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {brokers.map(b => (
          <div key={b.n} onClick={() => setSel(b.n)} style={{
            padding: 16, border: "1px solid " + (sel === b.n ? "var(--acid)" : "var(--line)"),
            background: sel === b.n ? "var(--acid-faint)" : "var(--bg-card)", cursor: "pointer",
            borderRadius: 3, position: "relative",
          }}>
            {b.rec && <div style={{ position: "absolute", top: 8, right: 8, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--acid)" }}>Recommended</div>}
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{b.n}</div>
            <div style={{ fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--mono)", marginTop: 6 }}>{b.note}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, padding: 14, border: "1px dashed var(--line-strong)", background: "var(--bg-elev)", borderRadius: 3, fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
        DON'T SEE YOUR BROKER? Upload a CSV of your positions instead — we'll guide you through mapping it.
      </div>
    </div>
  );
}

function OnbImport() {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 12 }}>Import portfolio</div>
      <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", fontWeight: 500, margin: "0 0 12px" }}>Bringing in your harvest-ready shares.</h2>
      <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        We found 8 positions with enough shares to write covered calls. Choose which to include.
      </p>
      <div style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>
        {HARVEST_POSITIONS.slice(0, 6).map((p, i) => (
          <div key={p.sym} style={{
            display: "grid", gridTemplateColumns: "28px 60px 1fr 100px 80px", gap: 12,
            padding: "12px 16px", borderBottom: i < 5 ? "1px solid var(--line-soft)" : "none", alignItems: "center",
          }}>
            <input type="checkbox" defaultChecked />
            <div className="num" style={{ fontSize: 13, color: "var(--fg)" }}>{p.sym}</div>
            <div style={{ fontSize: 12, color: "var(--fg-mute)" }}>{p.name}</div>
            <div className="num" style={{ fontSize: 12, color: "var(--fg-dim)", textAlign: "right" }}>{p.shares.toLocaleString()} sh</div>
            <div className="num" style={{ fontSize: 12, color: "var(--fg-dim)", textAlign: "right" }}>${(p.price * p.shares / 1000).toFixed(1)}k</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 16, fontSize: 12, color: "var(--fg-mute)", fontFamily: "var(--mono)" }}>
        <span>6 of 8 selected</span><span>·</span><span>Total value: $482,400</span>
      </div>
    </div>
  );
}

function OnbGoals() {
  const [sel, setSel] = React.useState(["income"]);
  const toggle = v => setSel(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v]);
  const goals = [
    { id: "income", t: "Monthly income", d: "Maximize premium; accept occasional assignment." },
    { id: "hold", t: "Hold shares long-term", d: "Conservative strikes; prioritize keeping position." },
    { id: "offset", t: "Offset unrealized losses", d: "Reduce cost basis on underwater positions." },
    { id: "learn", t: "Learn the wheel", d: "Start small; emphasize education and simulation." },
  ];
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 12 }}>Your goals</div>
      <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", fontWeight: 500, margin: "0 0 12px" }}>What are you harvesting for?</h2>
      <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Recommendations will prioritize these. You can change them any time.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {goals.map(g => (
          <div key={g.id} onClick={() => toggle(g.id)} style={{
            padding: 16, border: "1px solid " + (sel.includes(g.id) ? "var(--acid)" : "var(--line)"),
            background: sel.includes(g.id) ? "var(--acid-faint)" : "var(--bg-card)", cursor: "pointer", borderRadius: 3,
            display: "flex", gap: 14, alignItems: "flex-start",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 3, border: "1px solid " + (sel.includes(g.id) ? "var(--acid)" : "var(--line-strong)"),
              background: sel.includes(g.id) ? "var(--acid)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--bg)", fontSize: 11, marginTop: 1,
            }}>{sel.includes(g.id) ? "✓" : ""}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{g.t}</div>
              <div style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 4 }}>{g.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, placeholder, type = "text" }) {
  return (
    <div>
      <div className="h-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <input type={type} placeholder={placeholder} style={{
        width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--line-strong)",
        background: "var(--bg-card)", color: "var(--fg)", fontFamily: "var(--body)", fontSize: 14, borderRadius: 3, outline: "none",
      }} />
    </div>
  );
}

Object.assign(window, { Onboarding });
