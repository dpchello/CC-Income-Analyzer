import type { Metadata } from 'next'
import Link from 'next/link'
import CalculatorWidget from '@/components/CalculatorWidget'
import FaqAccordion from '@/components/FaqAccordion'

export const metadata: Metadata = {
  title: 'Harvest — Find, Track, and Capture Every Covered Call Opportunity',
  description:
    'Turn the stocks you already own into monthly income. Harvest tracks your covered calls, delivers plain-English recommendations, and shows exactly what your portfolio could earn — free.',
}

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to earn monthly income with covered calls using Harvest',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Add your stocks',
      text: 'Enter the stocks you already own — ticker and number of shares. No brokerage login required.',
    },
    {
      '@type': 'HowToStep',
      name: 'See your income estimate',
      text: 'Harvest calculates what each position could earn this month from selling covered calls.',
    },
    {
      '@type': 'HowToStep',
      name: 'Follow the recommendation',
      text: 'Get a plain-English instruction: exactly which contract to sell and at what price. One trade per position.',
    },
  ],
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24 text-center">
        <div className="mb-6 inline-block rounded-full border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">
          Free to start — no options experience needed
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight text-[var(--text)] md:text-6xl">
          Find, Track, and Capture Every Covered Call Opportunity.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--muted)]">
          Harvest turns the stocks you already own into a source of monthly income — with
          plain-English recommendations, no jargon, no complexity.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={appUrl}
            className="rounded-lg bg-[var(--amber)] px-8 py-4 text-base font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Start tracking free →
          </a>
          <Link
            href="/calculator"
            className="rounded-lg border border-[var(--border)] px-8 py-4 text-base font-semibold text-[var(--text)] hover:border-[var(--amber)] transition-colors"
          >
            See your income estimate
          </Link>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">No credit card. No options experience.</p>
      </section>

      {/* Stats bar */}
      <section className="border-y border-[var(--border)] bg-[var(--surface)] py-8">
        <div className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-[var(--border)] px-6">
          {[
            { value: '$420', label: 'avg monthly income tracked' },
            { value: '8–15%', label: 'typical annualized yield' },
            { value: '60s', label: 'to follow a recommendation' },
          ].map(({ value, label }) => (
            <div key={label} className="px-8 text-center">
              <p className="text-2xl font-bold text-[var(--amber)]">{value}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-[var(--text)]">
          Most investors own great stocks — and leave thousands in income uncollected.
        </h2>
        <p className="mt-5 text-[var(--muted)]">
          If you own 100+ shares of any large-cap stock or ETF, you can sell covered calls and collect
          cash every month — on top of any dividends. Most investors never do it because the process
          seems complex. Harvest makes it simple.
        </p>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-[var(--text)]">
          How it works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Add your stocks',
              body: 'Enter the stocks you already own — ticker and share count. No brokerage login. No account linking.',
            },
            {
              step: '02',
              title: 'See your income estimate',
              body: 'Harvest calculates what each position could earn this month and shows you the total across your portfolio.',
            },
            {
              step: '03',
              title: 'Follow the recommendation',
              body: 'Get one plain-English instruction per position: exactly which contract to sell, at what price, and when.',
            },
          ].map(({ step, title, body }) => (
            <div key={step} className="panel p-7">
              <p className="font-mono text-4xl font-bold text-[var(--amber)]/30">{step}</p>
              <p className="mt-4 text-lg font-semibold text-[var(--text)]">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calculator section */}
      <section className="border-y border-[var(--border)] bg-[var(--surface)] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-3 text-center text-3xl font-bold text-[var(--text)]">
            See what your portfolio could earn
          </h2>
          <p className="mb-10 text-center text-[var(--muted)]">
            Enter any stock you own. We&apos;ll show you the monthly income estimate — free.
          </p>
          <CalculatorWidget />
        </div>
      </section>

      {/* FAQ */}
      <FaqAccordion />

      {/* Final CTA */}
      <section className="border-t border-[var(--border)] bg-[var(--surface)] py-20 text-center">
        <h2 className="text-3xl font-bold text-[var(--text)]">
          Start collecting income from your portfolio
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[var(--muted)]">
          Free to start. No credit card. No options experience needed.
        </p>
        <a
          href={appUrl}
          className="mt-8 inline-block rounded-lg bg-[var(--amber)] px-10 py-4 text-base font-semibold text-black hover:opacity-90 transition-opacity"
        >
          Get Harvest free →
        </a>
      </section>
    </>
  )
}
