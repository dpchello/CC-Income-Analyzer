'use client'
import Link from 'next/link'
import { useState } from 'react'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

const links = [
  { href: '/how-it-works', label: 'Product' },
  { href: '/how-it-works', label: 'Screener' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/learn', label: 'Research' },
]

function HarvestMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
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

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 36px',
      background: 'rgba(250,248,243,0.82)',
      backdropFilter: 'blur(18px)',
      borderBottom: '1px solid var(--line-soft)',
    }}>
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--acid)' }}>
        <HarvestMark />
        <span style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.03em', color: 'var(--fg)' }}>
          Harvest
        </span>
      </Link>

      <div className="hidden md:flex" style={{ gap: 28 }}>
        {links.map((l) => (
          <Link key={`${l.href}-${l.label}`} href={l.href} style={{ fontSize: 13, color: 'var(--fg-dim)', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-dim)')}>
            {l.label}
          </Link>
        ))}
      </div>

      <div className="hidden md:flex" style={{ gap: 8, alignItems: 'center' }}>
        <a href={appUrl} className="btn btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }}>Sign in</a>
        <a href={appUrl} className="btn btn-primary" style={{ height: 28, padding: '0 12px', fontSize: 12 }}>Start free</a>
      </div>

      <button className="md:hidden" onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 16 }}>
        {open ? '✕' : '☰'}
      </button>

      {open && (
        <div className="md:hidden" style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg)', borderBottom: '1px solid var(--line)', padding: '16px 36px 24px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {links.map((l) => (
              <Link key={`${l.href}-${l.label}-m`} href={l.href} style={{ fontSize: 14, color: 'var(--fg-dim)' }} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <div style={{ marginTop: 8 }}>
              <a href={appUrl} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Start free</a>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
