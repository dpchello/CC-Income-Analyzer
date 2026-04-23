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
    <section style={{ padding: '96px 36px', borderTop: '1px solid var(--line)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 16, textAlign: 'center' }}>Common questions</div>
        <h2 className="display" style={{ fontSize: 40, letterSpacing: '-0.03em', fontWeight: 500, textAlign: 'center', margin: '0 0 48px', color: 'var(--fg)' }}>
          Frequently asked
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--line)' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 0', textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', gap: 16,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.4 }}>{faq.q}</span>
                <span style={{ flexShrink: 0, color: 'var(--acid)', fontFamily: 'var(--mono)', fontSize: 16, lineHeight: 1 }}>
                  {open === i ? '−' : '+'}
                </span>
              </button>
              {open === i && (
                <div style={{ paddingBottom: 20, paddingTop: 4 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-dim)', margin: 0 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)' }} />
        </div>
      </div>
    </section>
  )
}
