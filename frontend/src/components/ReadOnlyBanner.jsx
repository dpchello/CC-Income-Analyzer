export default function ReadOnlyBanner({ profit, onUpgrade }) {
  return (
    <div style={{
      padding: '10px 24px',
      fontSize: 13,
      background: 'rgba(255,176,32,0.08)',
      borderBottom: '1px solid var(--amber)',
      color: 'var(--amber)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <span>
        You've collected <strong>${profit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong> in covered call income.
        Your account is now read-only — upgrade to keep going.
      </span>
      <button
        onClick={onUpgrade}
        style={{
          padding: '5px 14px',
          background: 'var(--amber)',
          color: '#1a1208',
          fontWeight: 700,
          fontSize: 12,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Upgrade to Pro
      </button>
    </div>
  )
}
