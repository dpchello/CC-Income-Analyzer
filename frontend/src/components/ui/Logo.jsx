export function HarvestMark({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
      stroke={color} strokeWidth="1.2" strokeLinecap="round">
      <path d="M9 2 L9 16" />
      <path d="M9 5 Q6 5 5 3.5 Q6 2 9 2.5" />
      <path d="M9 5 Q12 5 13 3.5 Q12 2 9 2.5" />
      <path d="M9 8 Q6 8 5 6.5 Q6 5 9 5.5" />
      <path d="M9 8 Q12 8 13 6.5 Q12 5 9 5.5" />
      <path d="M9 11 Q6 11 5 9.5 Q6 8 9 8.5" />
      <path d="M9 11 Q12 11 13 9.5 Q12 8 9 8.5" />
    </svg>
  )
}

export function HarvestLogo({ size = 18, color, wordmark = true }) {
  const c = color || 'var(--acid)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, color: c,
    }}>
      <HarvestMark size={size} color={c} />
      {wordmark && (
        <span style={{
          fontFamily: 'var(--sans)',
          fontWeight: 600,
          fontSize: size * 0.95,
          letterSpacing: '-0.03em',
          color: 'var(--fg)',
        }}>
          Harvest
        </span>
      )}
    </span>
  )
}
