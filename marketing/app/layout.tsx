import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Harvest — Find, Track, and Capture Every Covered Call Opportunity',
  description:
    'Harvest turns the stocks you already own into a source of monthly income. Track covered calls, get plain-English recommendations, and collect more from your portfolio — free.',
  keywords: [
    'covered call income tracker',
    'covered call portfolio tracker',
    'covered call passive income',
    'options income app',
    'SPY covered calls',
    'sell covered calls for income',
  ],
  openGraph: {
    title: 'Harvest — Find, Track, and Capture Every Covered Call Opportunity',
    description:
      'Turn the stocks you already own into monthly income. No options experience needed.',
    type: 'website',
  },
}

const softwareAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Harvest',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier available. Pro at $29/month.',
  },
  description:
    'Track and optimize covered call income from stocks you already own. Plain-English recommendations, no options experience needed.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
