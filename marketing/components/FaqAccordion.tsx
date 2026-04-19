'use client'
import { useState } from 'react'

const faqs = [
  {
    q: 'What is a covered call?',
    a: 'A covered call is when you sell someone the right to buy your stock at a set price by a certain date — and they pay you cash upfront for that right. You keep the cash no matter what. It\'s one of the most conservative options strategies, used by institutions and individual investors to generate monthly income from stocks they already own.',
  },
  {
    q: 'Do I need options experience to use Harvest?',
    a: 'No. Harvest gives you plain-English instructions: which contract to sell, at what price, and when. You don\'t need to know what "delta" or "theta" means. If you can place a stock trade, you can follow a Harvest recommendation.',
  },
  {
    q: 'How much can I realistically earn?',
    a: 'Most covered call strategies generate 5–15% annualized income on top of any stock gains. On a $50,000 portfolio, that\'s roughly $200–600/month depending on market conditions and which stocks you hold. Use the free calculator to see an estimate for your specific holdings.',
  },
  {
    q: 'What stocks work best for covered calls?',
    a: 'Liquid, large-cap stocks with active options markets work best — SPY, QQQ, AAPL, MSFT, and similar. You need to own at least 100 shares to write one contract. Harvest focuses on the most reliable opportunities with the best risk/reward.',
  },
  {
    q: 'Is selling covered calls risky?',
    a: 'Covered calls are one of the lowest-risk options strategies. The main risk is that if your stock rises sharply above your strike price, you miss out on some upside — your shares may be "called away" at the strike. Harvest tracks this risk and alerts you when action is needed.',
  },
  {
    q: 'How is this different from dividend income?',
    a: 'Dividends typically pay 1–4% annually. Covered calls can generate 5–15% annually on the same stocks — often on top of any dividends you\'re already collecting. The income is more active (you\'re selling each month) but still passive compared to day trading.',
  },
  {
    q: 'What brokerages are supported?',
    a: 'Harvest works with any brokerage that supports options trading — Schwab, Fidelity, Robinhood Gold, TD Ameritrade/thinkorswim, E*TRADE, Interactive Brokers, and more. You enter your positions manually; no brokerage login required.',
  },
  {
    q: 'What\'s the difference between the free and Pro plans?',
    a: 'Free lets you track up to 3 positions and run 1 screener search per day. Pro gives you unlimited positions, full daily screener results, 12 months of income history, roll recommendations, tax context, and email/push alerts. See the pricing page for a full comparison.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <h2 className="mb-10 text-center text-3xl font-bold text-[var(--text)]">
        Common questions
      </h2>
      <div className="flex flex-col gap-3">
        {faqs.map((faq, i) => (
          <div key={i} className="panel overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-6 py-5 text-left"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="font-semibold text-[var(--text)]">{faq.q}</span>
              <span className="ml-4 shrink-0 text-[var(--amber)] text-lg">
                {open === i ? '−' : '+'}
              </span>
            </button>
            {open === i && (
              <div className="border-t border-[var(--border)] px-6 py-5 text-sm leading-relaxed text-[var(--muted)]">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
