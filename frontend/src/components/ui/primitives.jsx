// Harvest primitive components — Button, Chip, EyebrowLabel, StatCell, Card.
// All styling flows through CSS tokens in index.css; no inline theme values here.

import { useIsMobile } from '../../hooks/useMediaQuery.js'

// ── Button ────────────────────────────────────────────────────────────────────

export function Button({
  variant = 'default', // 'default' | 'primary' | 'ghost'
  size = 'md',         // 'sm' | 'md' | 'lg'
  children,
  className = '',
  ...props
}) {
  const cls = [
    'h-btn',
    variant === 'primary' ? 'primary' : '',
    variant === 'ghost'   ? 'ghost'   : '',
    size === 'sm'         ? 'sm'      : '',
    size === 'lg'         ? 'lg'      : '',
    className,
  ].filter(Boolean).join(' ')

  return <button className={cls} {...props}>{children}</button>
}

// ── Chip ──────────────────────────────────────────────────────────────────────

export function Chip({
  variant = 'default', // 'default' | 'active' | 'acid' | 'warn' | 'solid'
  children,
  className = '',
  onClick,
  ...props
}) {
  const cls = [
    'h-chip',
    variant !== 'default' ? variant : '',
    onClick ? 'cursor-pointer' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={cls} onClick={onClick} {...props}>
      {children}
    </span>
  )
}

// ── Conviction chip (High / Med / Low) ────────────────────────────────────────

const CONV_STYLE = {
  High: { color: 'var(--acid)',  borderColor: 'var(--acid-line)',           background: 'var(--acid-faint)' },
  Med:  { color: 'var(--olive)', borderColor: 'rgba(106,118,72,0.28)',      background: 'rgba(106,118,72,0.08)' },
  Low:  { color: 'var(--fg-mute)', borderColor: 'var(--line-strong)',       background: 'transparent' },
}

export function ConvictionChip({ conviction }) {
  const s = CONV_STYLE[conviction] || CONV_STYLE.Low
  return (
    <span className="h-chip" style={s}>{conviction}</span>
  )
}

// ── EyebrowLabel ─────────────────────────────────────────────────────────────

export function Eyebrow({ children, className = '', style }) {
  return (
    <span className={`h-eyebrow ${className}`} style={style}>
      {children}
    </span>
  )
}

// ── StatCell — eyebrow + large value + optional sub ──────────────────────────

export function StatCell({ label, value, sub, valueStyle, className = '' }) {
  const isMobile = useIsMobile()
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      <span style={{
        fontFamily: 'var(--sans)',
        fontWeight: 600,
        fontSize: isMobile ? 18 : 22,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        color: 'var(--fg)',
        minWidth: 0,
        overflowWrap: 'break-word',
        ...valueStyle,
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: 'var(--fg-mute)', fontFamily: 'var(--mono)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', style, elevated = false }) {
  return (
    <div
      className={`h-card ${className}`}
      style={{
        ...(elevated ? { boxShadow: 'var(--shadow-card)' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Hair({ className = '' }) {
  return <hr className={`h-hair ${className}`} />
}

// ── Skeleton line ─────────────────────────────────────────────────────────────

export function Skeleton({ width = '100%', height = 14, className = '' }) {
  return (
    <span
      className={`h-skeleton block ${className}`}
      style={{ width, height, borderRadius: 'var(--r-1)' }}
    />
  )
}

// ── Badge (nav count) ─────────────────────────────────────────────────────────

export function Badge({ count }) {
  if (!count) return null
  return <span className="h-badge">{count}</span>
}
