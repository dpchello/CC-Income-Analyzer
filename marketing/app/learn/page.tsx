import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Learn Covered Calls — Harvest',
  description: 'Plain-English guides to covered calls, options income, and passive investing strategies. No jargon.',
}

const articles = [
  { slug: 'what-is-a-covered-call', title: 'What is a covered call? (Plain English)', description: 'A covered call explained simply — what it is, how it works, and whether it makes sense for you.', readTime: '4 min' },
  { slug: 'how-much-income-covered-calls', title: 'How much income can I make selling covered calls?', description: 'Real numbers. What a $50K portfolio, $100K portfolio, and $250K portfolio can realistically earn each month.', readTime: '5 min' },
  { slug: 'best-stocks-for-covered-calls', title: 'Best stocks for covered calls in 2026', description: 'The stocks and ETFs with the most liquid options markets and consistent premium income.', readTime: '6 min' },
  { slug: 'spy-covered-calls-beginners-guide', title: "SPY covered calls: a beginner's guide", description: 'How to generate monthly income from SPY shares. Strike selection, expiry choice, and when to roll.', readTime: '7 min' },
  { slug: 'covered-call-vs-dividend', title: 'Covered calls vs dividends: which pays more?', description: 'Side-by-side comparison of income strategies. Spoiler: covered calls typically generate 3–5x more income.', readTime: '5 min' },
  { slug: 'when-to-roll-a-covered-call', title: 'When should I roll a covered call?', description: 'The three scenarios where rolling makes sense — and when to just let assignment happen.', readTime: '5 min' },
  { slug: 'how-to-track-covered-call-income', title: 'How to track your covered call income', description: 'Why spreadsheets break down and what to track instead: premium collected, annualized yield, and cost basis.', readTime: '4 min' },
]

export default function LearnPage() {
  return (
    <div style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Research</div>
        <h1 className="display" style={{ fontSize: 52, letterSpacing: '-0.035em', fontWeight: 500, color: 'var(--fg)', margin: '0 0 16px' }}>Learn</h1>
        <p style={{ color: 'var(--fg-dim)', fontSize: 15, margin: '0 0 56px' }}>
          Plain-English guides to covered calls and income investing. No jargon.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {articles.map((a, i) => (
            <div key={a.slug} style={{ borderTop: '1px solid var(--line)' }}>
              <Link href={`/learn/${a.slug}`} style={{ display: 'block', padding: '24px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.4 }}>{a.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.5 }}>{a.description}</div>
                  </div>
                  <div className="eyebrow" style={{ flexShrink: 0 }}>{a.readTime}</div>
                </div>
              </Link>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)' }} />
        </div>
      </div>
    </div>
  )
}
