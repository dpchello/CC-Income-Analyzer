import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How It Works — Harvest',
  description: 'Learn how Harvest turns your existing stocks into monthly income through covered calls. Three simple steps, no options experience needed.',
}

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to collect monthly income from your stocks with covered calls',
  description: 'A three-step process for turning your existing stock holdings into a source of monthly income using covered calls.',
  step: [
    { '@type': 'HowToStep', position: 1, name: 'Add your stocks', text: 'Enter the stocks you already own — ticker and share count. No brokerage login required.' },
    { '@type': 'HowToStep', position: 2, name: 'See your income estimate', text: 'Harvest calculates what each position could earn this month from selling covered calls, using live market data.' },
    { '@type': 'HowToStep', position: 3, name: 'Follow the recommendation', text: 'Get one plain-English instruction per position: which contract to sell, at what price, and when to act.' },
  ],
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

export default function HowItWorksPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />

      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-bold text-[var(--text)]">How Harvest works</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">
          Three steps. No options experience required. Start collecting income from your existing stocks this month.
        </p>

        <div className="mt-14 flex flex-col gap-10">
          {[
            {
              step: '01',
              title: 'Add your stocks',
              body: `Enter any stock you own with 100 or more shares — AAPL, SPY, MSFT, QQQ, anything with an active options market. Harvest doesn't need your brokerage login. Just the ticker and share count.

Once entered, Harvest shows you the income potential for each holding: the estimated monthly premium, current market conditions, and whether now is a good time to sell.`,
            },
            {
              step: '02',
              title: 'See your income estimate',
              body: `Harvest pulls live options market data and calculates what your specific holdings could earn this month. It finds the 0.20–0.25 delta call — the strike income-focused traders use — and shows you the premium in plain dollar terms.

You'll see your total portfolio income estimate, broken down by position, plus a market conditions gauge that tells you whether conditions favor selling premium right now.`,
            },
            {
              step: '03',
              title: 'Follow the recommendation',
              body: `Harvest generates one plain-English recommendation per open position: "Sell the AAPL $195 call expiring May 16 — collect $312."

No Greeks. No jargon. Just the trade. Execute it in your brokerage in about 60 seconds. Pro users also get roll recommendations when a position needs attention, early exercise warnings before ex-dividend dates, and tax context for each trade.`,
            },
          ].map(({ step, title, body }) => (
            <div key={step} className="flex gap-8">
              <div className="shrink-0">
                <p className="font-mono text-5xl font-bold text-[var(--amber)]/20">{step}</p>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--text)]">{title}</h2>
                <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-[var(--muted)]">
                  {body.trim().split('\n\n').map((p, i) => <p key={i}>{p.trim()}</p>)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 panel p-8 text-center">
          <h3 className="text-xl font-bold text-[var(--text)]">Ready to start?</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">Free to start. No credit card. See your first income estimate in 2 minutes.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a href={appUrl} className="rounded-lg bg-[var(--amber)] px-8 py-3 text-sm font-semibold text-black hover:opacity-90">
              Get Harvest free →
            </a>
            <Link href="/calculator" className="rounded-lg border border-[var(--border)] px-8 py-3 text-sm font-semibold text-[var(--text)] hover:border-[var(--amber)]">
              Try the calculator first
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
