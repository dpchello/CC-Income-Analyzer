import type { Metadata } from 'next'
import PricingTable from '@/components/PricingTable'

export const metadata: Metadata = {
  title: 'Pricing — Harvest',
  description: 'Harvest is free to start. Pro unlocks unlimited positions, full screener results, alerts, and income history. $29/month or $240/year.',
}

export default function PricingPage() {
  return (
    <div className="py-20">
      <div className="mb-14 text-center px-6">
        <h1 className="text-4xl font-bold text-[var(--text)]">Simple, transparent pricing</h1>
        <p className="mx-auto mt-4 max-w-md text-[var(--muted)]">
          Start free. Upgrade when you&apos;re ready to unlock the full toolkit.
        </p>
      </div>
      <PricingTable />

      <div className="mx-auto mt-20 max-w-2xl px-6">
        <h2 className="mb-6 text-xl font-bold text-[var(--text)]">Frequently asked</h2>
        <div className="flex flex-col gap-6 text-sm text-[var(--muted)]">
          {[
            {
              q: 'Can I cancel anytime?',
              a: 'Yes. Cancel from your account settings and you keep Pro access until the end of your billing period. No cancellation fees.',
            },
            {
              q: 'What happens to my data if I downgrade?',
              a: 'Your positions, history, and settings are preserved. You just lose access to Pro features — you can re-upgrade anytime to get them back.',
            },
            {
              q: 'Is the annual plan billed upfront?',
              a: 'Yes. You pay $240 once per year. That works out to $20/month — saving $108 vs monthly billing.',
            },
            {
              q: 'Do you offer a free trial of Pro?',
              a: 'The free tier is your trial — it gives you real access to the core product with no time limit. We think that\'s more useful than a 14-day Pro trial that expires before you\'ve collected your first month of income.',
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="font-semibold text-[var(--text)]">{q}</p>
              <p className="mt-1">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
