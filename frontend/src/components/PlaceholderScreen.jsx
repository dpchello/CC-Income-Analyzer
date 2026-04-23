// Temporary placeholder for screens not yet implemented.
// Shows the screen name and a "coming soon" note.
export default function PlaceholderScreen({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 320, gap: 12,
      color: 'var(--fg-mute)',
    }}>
      <span style={{ fontFamily: 'var(--serif)', fontSize: 30, fontStyle: 'italic', color: 'var(--fg)' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
        Coming soon
      </span>
    </div>
  )
}
