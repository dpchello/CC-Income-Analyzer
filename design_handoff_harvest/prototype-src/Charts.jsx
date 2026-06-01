// Harvest — shared data-viz primitives (no external deps)

// Deterministic seeded random so charts don't reflow on re-render
function seedRand(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Generate a plausible price path
function genPath(n, startPrice, vol = 0.012, trend = 0.0005, seed = 7) {
  const r = seedRand(seed);
  const out = [startPrice];
  for (let i = 1; i < n; i++) {
    const step = (r() - 0.5) * 2 * vol + trend;
    out.push(Math.max(0.1, out[i - 1] * (1 + step)));
  }
  return out;
}

// Sparkline — tiny line chart for rows and cards
function Sparkline({ points, width = 80, height = 22, color = "var(--acid)", fill = false, strokeWidth = 1.25 }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - ((p - min) / range) * (height - 2) - 1]);
  const d = coords.map(([x, y], i) => (i ? `L${x.toFixed(2)} ${y.toFixed(2)}` : `M${x.toFixed(2)} ${y.toFixed(2)}`)).join(" ");
  const area = fill ? `${d} L${width} ${height} L0 ${height} Z` : null;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Chart with axes, optional shaded region, optional markers
function LineChart({
  points, width = 600, height = 220, color = "var(--acid)",
  fill = true, padding = 24, yTicks = 4, xLabels = [], markers = [], strike, dashedFrom,
}) {
  const min = Math.min(...points) * 0.985;
  const max = Math.max(...points) * 1.015;
  const range = max - min || 1;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;
  const step = plotW / (points.length - 1);

  const toXY = (i, v) => [padding + i * step, padding + plotH - ((v - min) / range) * plotH];
  const d = points.map((p, i) => { const [x, y] = toXY(i, p); return (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2); }).join(" ");

  const solidPts = dashedFrom != null ? points.slice(0, dashedFrom + 1) : points;
  const dashPts = dashedFrom != null ? points.slice(dashedFrom) : [];
  const solidD = solidPts.map((p, i) => { const [x, y] = toXY(i, p); return (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2); }).join(" ");
  const dashD = dashPts.map((p, i) => { const [x, y] = toXY(i + (dashedFrom || 0), p); return (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2); }).join(" ");

  const areaD = solidD + ` L${padding + (solidPts.length - 1) * step} ${padding + plotH} L${padding} ${padding + plotH} Z`;

  const ticks = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = min + (range * i) / yTicks;
    const y = padding + plotH - (plotH * i) / yTicks;
    ticks.push({ v, y });
  }

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padding} x2={width - padding} y1={t.y} y2={t.y} stroke="var(--line-soft)" />
          <text x={width - padding + 6} y={t.y + 3} fontSize="9" fill="var(--fg-faint)" fontFamily="var(--mono)">
            {t.v.toFixed(t.v < 10 ? 2 : 0)}
          </text>
        </g>
      ))}
      {strike != null && (() => {
        const y = padding + plotH - ((strike - min) / range) * plotH;
        return (
          <g>
            <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="var(--acid)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <text x={padding + 4} y={y - 3} fontSize="9" fill="var(--acid)" fontFamily="var(--mono)">STRIKE {strike}</text>
          </g>
        );
      })()}
      {fill && <path d={areaD} fill={color} opacity={0.08} />}
      <path d={solidD} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {dashD && <path d={dashD} fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7" />}
      {markers.map((m, i) => {
        const [x, y] = toXY(m.i, points[m.i]);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="3.5" fill="var(--bg)" stroke={m.color || color} strokeWidth="1.4" />
            {m.label && <text x={x + 7} y={y - 6} fontSize="9" fill="var(--fg-dim)" fontFamily="var(--mono)">{m.label}</text>}
          </g>
        );
      })}
      {xLabels.map((x, i) => (
        <text key={i} x={padding + (i * plotW) / (xLabels.length - 1)} y={height - 6} fontSize="9"
          fill="var(--fg-faint)" fontFamily="var(--mono)" textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}>{x}</text>
      ))}
    </svg>
  );
}

// Premium-vs-yield scatter for screener
function Scatter({ points, width = 600, height = 300, padding = 36, highlightId, onHover }) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const plotW = width - padding * 1.5;
  const plotH = height - padding * 1.5;
  const toX = v => padding + ((v - minX) / (maxX - minX)) * plotW;
  const toY = v => padding + plotH - ((v - minY) / (maxY - minY)) * plotH;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <pattern id="grid" width={plotW / 6} height={plotH / 5} patternUnits="userSpaceOnUse">
          <path d={`M${plotW / 6} 0 L0 0 L0 ${plotH / 5}`} fill="none" stroke="var(--line-soft)" />
        </pattern>
      </defs>
      <rect x={padding} y={padding} width={plotW} height={plotH} fill="url(#grid)" />
      {/* axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <text key={"x" + i} x={padding + t * plotW} y={padding + plotH + 16} fontSize="9"
          fill="var(--fg-faint)" fontFamily="var(--mono)" textAnchor="middle">
          {(minX + t * (maxX - minX)).toFixed(1)}%
        </text>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <text key={"y" + i} x={padding - 6} y={padding + plotH - t * plotH + 3} fontSize="9"
          fill="var(--fg-faint)" fontFamily="var(--mono)" textAnchor="end">
          {(minY + t * (maxY - minY)).toFixed(0)}%
        </text>
      ))}
      {/* axis labels */}
      <text x={padding + plotW / 2} y={height - 4} fontSize="10" fill="var(--fg-mute)" fontFamily="var(--mono)" textAnchor="middle">PREMIUM (% of price)</text>
      <text x={12} y={padding + plotH / 2} fontSize="10" fill="var(--fg-mute)" fontFamily="var(--mono)"
        textAnchor="middle" transform={`rotate(-90, 12, ${padding + plotH / 2})`}>ANNUALIZED YIELD</text>
      {points.map(p => {
        const hi = p.id === highlightId;
        return (
          <g key={p.id} onMouseEnter={() => onHover && onHover(p.id)}
            style={{ cursor: "pointer" }}>
            <circle cx={toX(p.x)} cy={toY(p.y)} r={hi ? 6 : 4}
              fill={hi ? "var(--acid)" : "var(--acid-faint)"} stroke="var(--acid)" strokeWidth={hi ? 1.5 : 0.8} />
            {hi && <text x={toX(p.x) + 10} y={toY(p.y) - 6} fontSize="10" fontFamily="var(--mono)" fill="var(--fg)">{p.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

Object.assign(window, { Sparkline, LineChart, Scatter, genPath, seedRand });
