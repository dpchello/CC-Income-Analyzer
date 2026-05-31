// Harvest logo — tiny wheat-bundle glyph + wordmark
function HarvestMark({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round">
      {/* wheat stem */}
      <path d="M9 2 L9 16" />
      {/* grain */}
      <path d="M9 5 Q6 5 5 3.5 Q6 2 9 2.5" />
      <path d="M9 5 Q12 5 13 3.5 Q12 2 9 2.5" />
      <path d="M9 8 Q6 8 5 6.5 Q6 5 9 5.5" />
      <path d="M9 8 Q12 8 13 6.5 Q12 5 9 5.5" />
      <path d="M9 11 Q6 11 5 9.5 Q6 8 9 8.5" />
      <path d="M9 11 Q12 11 13 9.5 Q12 8 9 8.5" />
    </svg>
  );
}

function HarvestLogo({ size = 18, color, tone = "full" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: color || "inherit" }}>
      <HarvestMark size={size} color={color} />
      {tone === "full" && (
        <span style={{
          fontFamily: 'var(--sans)', fontWeight: 600,
          fontSize: size * 0.95, letterSpacing: "-0.03em",
        }}>Harvest</span>
      )}
    </span>
  );
}

Object.assign(window, { HarvestMark, HarvestLogo });
