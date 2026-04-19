'use client'
import Link from 'next/link'
import { useState } from 'react'

const links = [
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/learn', label: 'Learn' },
  { href: '/pricing', label: 'Pricing' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-[var(--text)]">
          Harvest
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}
            className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            Log in
          </a>
          <a
            href={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}
            className="rounded-md bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Start free
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-[var(--muted)]"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-6 pb-6 md:hidden">
          <div className="flex flex-col gap-4 pt-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-[var(--muted)]"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <a
              href={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}
              className="mt-2 rounded-md bg-[var(--amber)] px-4 py-2 text-center text-sm font-semibold text-black"
            >
              Start free
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
