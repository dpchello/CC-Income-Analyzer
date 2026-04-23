import type { Metadata } from 'next'
import PricingTable from '@/components/PricingTable'

export const metadata: Metadata = {
  title: 'Pricing — Harvest',
  description: 'Harvest is free to start. Pro unlocks unlimited positions, full screener results, alerts, and income history. $29/month or $240/year.',
}

export default function PricingPage() {
  return (
    <div style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto 72px', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Pricing</div>
        <h1 className="display" style={{ fontSize: 52, letterSpacing: '-0.035em', fontWeight: 500, color: 'var(--fg)', margin: '0 0 16px' }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color: 'var(--fg-dim)', fontSize: 15, margin: 0 }}>
          Start free. Upgrade when you&apos;re ready to unlock the full toolkit.
        </p>
      </div>

      <PricingTable />

      <div style={{ maxWidth: 640, margin: '96px auto 0', borderTop: '1px solid var(--line)', paddingTop: 64 }}>
        <div className="eyebrow" style={{ marginBottom: 24 }}>Pricing questions</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your account settings and you keep Pro access until the end of your billing period. No cancellation fees.' },
            { q: 'What happens to my data if I downgrade?', a: 'Your positions, history, and settings are preserved. You just lose access to Pro features — you can re-upgrade anytime to get them back.' },
            { q: 'Is the annual plan billed upfront?', a: 'Yes. You pay $240 once per year. That works out to $20/month — saving $108 vs monthly billing.' },
            { q: "Do you offer a free trial of Pro?", a: "The free tier is your trial — it gives you real access to the core product with no time limit. We think that's more useful than a 14-day Pro trial that expires before you've collected your first month of income." },
          ].map(({ q, a }, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '24px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 8 }}>{q}</div>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)' }} />
        </div>
      </div>
    </div>
  )
}
