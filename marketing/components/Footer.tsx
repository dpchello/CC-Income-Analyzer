import Link from 'next/link'

function HarvestMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M9 2 L9 16" />
      <path d="M9 5 Q6 5 5 3.5 Q6 2 9 2.5" />
      <path d="M9 5 Q12 5 13 3.5 Q12 2 9 2.5" />
      <path d="M9 8 Q6 8 5 6.5 Q6 5 9 5.5" />
      <path d="M9 8 Q12 8 13 6.5 Q12 5 9 5.5" />
      <path d="M9 11 Q6 11 5 9.5 Q6 8 9 8.5" />
      <path d="M9 11 Q12 11 13 9.5 Q12 8 9 8.5" />
    </svg>
  )
}

function Col({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 14 }}>{title}</div>
      {items.map((i) => (
        <div key={i.label} style={{ padding: '4px 0' }}>
          <Link href={i.href} style={{ color: 'var(--fg-dim)', fontSize: 13 }}>{i.label}</Link>
        </div>
      ))}
    </div>
  )
}

export default function Footer() {
  return (
    <footer style={{ padding: '72px 36px 40px', borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 48, maxWidth: 1200, margin: '0 auto' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--acid)' }}>
            <HarvestMark />
            <span style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.03em', color: 'var(--fg)' }}>Harvest</span>
          </div>
          <p style={{ color: 'var(--fg-mute)', marginTop: 16, fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
            Income tools for long-term shareholders. Built in New York. Not investment advice.
          </p>
        </div>
        <Col title="Product" items={[
          { label: 'Dashboard', href: '/how-it-works' },
          { label: 'Screener', href: '/how-it-works' },
          { label: 'Recommendations', href: '/how-it-works' },
          { label: 'Journal', href: '/how-it-works' },
          { label: 'Calculator', href: '/calculator' },
        ]} />
        <Col title="Research" items={[
          { label: 'Covered call 101', href: '/learn' },
          { label: 'The wheel, explained', href: '/learn' },
          { label: 'Tax basics', href: '/learn' },
          { label: 'Glossary', href: '/learn' },
          { label: 'Blog', href: '/learn' },
        ]} />
        <Col title="Company" items={[
          { label: 'About', href: '/' },
          { label: 'Careers', href: '/' },
          { label: 'Security', href: '/' },
          { label: 'Press', href: '/' },
        ]} />
        <Col title="Legal" items={[
          { label: 'Terms', href: '/' },
          { label: 'Privacy', href: '/' },
          { label: 'Disclosures', href: '/' },
        ]} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 56, paddingTop: 24, borderTop: '1px solid var(--line)',
        color: 'var(--fg-faint)', fontSize: 11, fontFamily: 'var(--mono)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        maxWidth: 1200,
      }}>
        <span>© 2026 Harvest Financial, Inc.</span>
        <span>Not investment advice · Options trading involves risk</span>
      </div>
    </footer>
  )
}
