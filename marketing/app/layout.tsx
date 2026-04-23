import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Harvest — Income from the shares you already own',
  description:
    'Harvest scans your portfolio, models risk, and recommends covered calls sized to your positions. Ranked by expected yield, delta, and event risk — never by commission.',
  keywords: [
    'covered call income tracker',
    'covered call portfolio tracker',
    'covered call passive income',
    'options income app',
    'SPY covered calls',
    'sell covered calls for income',
  ],
  openGraph: {
    title: 'Harvest — Income from the shares you already own',
    description:
      'Turn the stocks you already own into monthly income. Plain-English recommendations, no jargon, no complexity.',
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
    'Covered-call platform for long-term shareholders. Scans your portfolio and recommends income trades sized to your positions.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
