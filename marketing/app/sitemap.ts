import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://harvestoptions.com'

const learnSlugs = [
  'what-is-a-covered-call',
  'how-much-income-covered-calls',
  'best-stocks-for-covered-calls',
  'spy-covered-calls-beginners-guide',
  'covered-call-vs-dividend',
  'when-to-roll-a-covered-call',
  'how-to-track-covered-call-income',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/calculator`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/how-it-works`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/learn`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ]

  const learnRoutes: MetadataRoute.Sitemap = learnSlugs.map((slug) => ({
    url: `${BASE_URL}/learn/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...learnRoutes]
}
