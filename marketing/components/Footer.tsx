import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg)] py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div>
            <p className="text-lg font-bold text-[var(--text)]">Harvest</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
              Find, Track, and Capture Every Covered Call Opportunity.
            </p>
          </div>

          <div className="flex gap-12 text-sm">
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-[var(--text)]">Product</p>
              <Link href="/how-it-works" className="text-[var(--muted)] hover:text-[var(--text)]">How It Works</Link>
              <Link href="/calculator" className="text-[var(--muted)] hover:text-[var(--text)]">Calculator</Link>
              <Link href="/pricing" className="text-[var(--muted)] hover:text-[var(--text)]">Pricing</Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-[var(--text)]">Learn</p>
              <Link href="/learn" className="text-[var(--muted)] hover:text-[var(--text)]">All Articles</Link>
              <Link href="/learn/what-is-a-covered-call" className="text-[var(--muted)] hover:text-[var(--text)]">What is a Covered Call?</Link>
              <Link href="/learn/covered-call-vs-dividend" className="text-[var(--muted)] hover:text-[var(--text)]">vs. Dividends</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)] md:flex-row">
          <p>© {new Date().getFullYear()} Harvest. All rights reserved.</p>
          <p>Not financial advice. Options trading involves risk.</p>
        </div>
      </div>
    </footer>
  )
}
