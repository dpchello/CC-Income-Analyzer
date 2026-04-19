import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const articles: Record<string, { title: string; description: string; body: string }> = {
  'what-is-a-covered-call': {
    title: 'What is a covered call? (Plain English)',
    description: 'A covered call explained simply — what it is, how it works, and whether it makes sense for you.',
    body: `
A covered call is a way to earn extra income from stocks you already own.

Here's how it works: you own 100 shares of a stock. Instead of just holding those shares, you sell someone else the *option* to buy them from you at a higher price, sometime in the next few weeks.

In exchange for that option, they pay you cash upfront. That cash is yours to keep — no matter what happens.

**A simple example**

Say you own 100 shares of AAPL at $175. You sell a covered call at a $180 strike expiring in 30 days. Someone pays you $1.50/share for that — $150 total, deposited immediately.

If AAPL stays below $180: the option expires worthless, you keep the $150 and still own your shares.

If AAPL rises above $180: your shares get sold at $180 (the strike price). You made the $5 gain plus the $150 premium — a good outcome.

**The trade-off**

You cap your upside in exchange for guaranteed income now. If AAPL jumps to $200, you miss out on the gains above $180.

For passive holders, this trade-off is usually worth it. You weren't going to sell at $180 anyway — and now you're getting paid to wait.

**Is it right for you?**

Covered calls make sense if you own 100+ shares of a stock and aren't planning to sell it in the next 30–60 days. The strategy works best in flat or gently rising markets.

Harvest shows you exactly which contract to sell and at what price — so you don't need to figure any of this out yourself.
    `.trim(),
  },
  'how-much-income-covered-calls': {
    title: 'How much income can I make selling covered calls?',
    description: 'Real numbers. What a $50K portfolio, $100K portfolio, and $250K portfolio can realistically earn each month.',
    body: `
Covered call income depends on three things: the size of your position, the implied volatility of the stock, and how aggressively you sell.

Here are realistic monthly estimates for common portfolio sizes, using conservative 0.20–0.25 delta calls.

| Portfolio size | Typical monthly income | Annualized yield |
|---|---|---|
| $50,000 | $150 – $350 | 3.5 – 8% |
| $100,000 | $300 – $700 | 3.5 – 8% |
| $250,000 | $750 – $1,750 | 3.5 – 8% |

These numbers assume you're selling 30-day calls on large-cap stocks or ETFs like SPY, AAPL, MSFT, or QQQ.

Higher-volatility stocks (like semiconductors or biotech) can generate significantly more — but with more assignment risk.

**Why the range?**

Implied volatility fluctuates. When the VIX is at 12, premiums are thin. When it's at 25, the same strike pays 2–3x more. Harvest tracks market conditions and tells you when it's worth selling vs. when to wait.

**The compounding effect**

$500/month in covered call income on a $100K portfolio is $6,000/year — a 6% yield on top of any appreciation or dividends. Most dividend stocks yield 1.5–3%.

That's the gap Harvest exists to close.
    `.trim(),
  },
  'covered-call-vs-dividend': {
    title: 'Covered calls vs dividends: which pays more?',
    description: 'Side-by-side comparison of income strategies. Spoiler: covered calls typically generate 3–5x more income.',
    body: `
Both dividends and covered calls generate income from stocks you already own. But they're very different in how they work — and how much they pay.

**Dividends**

A dividend is a cash distribution the company pays to shareholders, usually quarterly. The typical S&P 500 stock yields about 1.5%. SPY pays roughly 1.3% annually.

You have no control over dividend size or timing. You just hold and receive.

**Covered calls**

A covered call is income you *generate* by selling an option on your shares. You choose when to sell, which strike, and which expiry.

On SPY, selling a 30-day 0.20 delta call typically generates 0.5–1.5% per month depending on volatility. That's 6–18% annualized.

**Side by side**

| | Dividends | Covered calls |
|---|---|---|
| Yield on SPY | ~1.3%/year | 6–15%/year |
| Control | None | Full |
| Taxes | Qualified dividend rate | Short-term capital gains |
| Complexity | None | Low (with the right tool) |
| Caps upside? | No | Yes (above strike) |

**Which to use?**

Both, if you can. Covered calls don't replace dividends — they stack on top. If you own dividend stocks, you can sell calls between ex-dividend dates and collect both streams.

The main trade-off is tax treatment: covered call premiums are typically taxed as short-term gains. For buy-and-hold investors in taxable accounts, this is worth modeling.

Harvest shows the after-tax income on every recommendation.
    `.trim(),
  },
}

const slugList = [
  'what-is-a-covered-call',
  'how-much-income-covered-calls',
  'best-stocks-for-covered-calls',
  'spy-covered-calls-beginners-guide',
  'covered-call-vs-dividend',
  'when-to-roll-a-covered-call',
  'how-to-track-covered-call-income',
]

export function generateStaticParams() {
  return slugList.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const article = articles[params.slug]
  if (!article) return { title: 'Article — Harvest' }
  return {
    title: `${article.title} — Harvest`,
    description: article.description,
  }
}

export default function LearnArticlePage({ params }: { params: { slug: string } }) {
  const article = articles[params.slug]

  if (!article) {
    notFound()
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    publisher: {
      '@type': 'Organization',
      name: 'Harvest',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <div className="mx-auto max-w-2xl px-6 py-20">
        <Link href="/learn" className="text-sm text-[var(--muted)] hover:text-[var(--amber)] transition-colors">
          ← Back to Learn
        </Link>
        <h1 className="mt-6 text-4xl font-bold text-[var(--text)] leading-tight">{article.title}</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">{article.description}</p>
        <div
          className="mt-10 prose prose-invert max-w-none text-[var(--muted)] leading-relaxed"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {article.body}
        </div>
        <div className="mt-16 panel p-8 text-center">
          <p className="font-semibold text-[var(--text)]">See what your portfolio could earn</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Harvest calculates your monthly income estimate — free.</p>
          <a
            href={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}
            className="mt-6 inline-block rounded-lg bg-[var(--amber)] px-8 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Get Harvest free →
          </a>
        </div>
      </div>
    </>
  )
}
