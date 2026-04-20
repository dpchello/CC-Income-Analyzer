export default function PositionLimitBanner({ onUpgrade }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 mb-4 text-sm"
      style={{
        backgroundColor: 'rgba(255,176,32,0.1)',
        border: '1px solid rgba(255,176,32,0.3)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
      }}
    >
      <div>
        <span className="font-semibold" style={{ color: 'var(--amber, #ffb020)' }}>
          Free tier: 3 positions tracked.
        </span>
        <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
          You may have more positions earning income — upgrade to track them all.
        </span>
      </div>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="flex-shrink-0 text-xs px-3 py-1.5 font-semibold"
          style={{
            background: 'var(--gold)',
            color: '#1a1208',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Upgrade to Pro →
        </button>
      )}
    </div>
  )
}
