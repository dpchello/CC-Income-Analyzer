import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Learn Covered Calls — Harvest',
  description: 'Plain-English guides to covered calls, options income, and passive investing strategies. No jargon.',
}

const articles = [
  {
    slug: 'what-is-a-covered-call',
    title: 'What is a covered call? (Plain English)',
    description: 'A covered call explained simply — what it is, how it works, and whether it makes sense for you.',
    readTime: '4 min',
  },
  {
    slug: 'how-much-income-covered-calls',
    title: 'How much income can I make selling covered calls?',
    description: 'Real numbers. What a $50K portfolio, $100K portfolio, and $250K portfolio can realistically earn each month.',
    readTime: '5 min',
  },
  {
    slug: 'best-stocks-for-covered-calls',
    title: 'Best stocks for covered calls in 2026',
    description: 'The stocks and ETFs with the most liquid options markets and consistent premium income.',
    readTime: '6 min',
  },
  {
    slug: 'spy-covered-calls-beginners-guide',
    title: 'SPY covered calls: a beginner\'s guide',
    description: 'How to generate monthly income from SPY shares. Strike selection, expiry choice, and when to roll.',
    readTime: '7 min',
  },
  {
    slug: 'covered-call-vs-dividend',
    title: 'Covered calls vs dividends: which pays more?',
    description: 'Side-by-side comparison of income strategies. Spoiler: covered calls typically generate 3–5x more income.',
    readTime: '5 min',
  },
  {
    slug: 'when-to-roll-a-covered-call',
    title: 'When should I roll a covered call?',
    description: 'The three scenarios where rolling makes sense — and when to just let assignment happen.',
    readTime: '5 min',
  },
  {
    slug: 'how-to-track-covered-call-income',
    title: 'How to track your covered call income',
    description: 'Why spreadsheets break down and what to track instead: premium collected, annualized yield, and cost basis.',
    readTime: '4 min',
  },
]

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold text-[var(--text)]">Learn</h1>
      <p className="mt-4 text-[var(--muted)]">
        Plain-English guides to covered calls and income investing. No jargon.
      </p>

      <div className="mt-12 flex flex-col gap-4">
        {articles.map((a) => (
          <Link
            key={a.slug}
            href={`/learn/${a.slug}`}
            className="panel block p-6 hover:border-[var(--amber)] transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-[var(--text)]">{a.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{a.description}</p>
              </div>
              <p className="shrink-0 text-xs text-[var(--muted)]">{a.readTime}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
