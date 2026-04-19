export default function LockedFeature({ children, reason = 'pro', onUpgrade }) {
  return (
    <div style={{ position: 'relative', display: 'contents' }}>
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: 'rgba(8,12,24,0.72)',
          borderRadius: 'var(--radius)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <span style={{ fontSize: 20 }}>🔒</span>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {reason === 'daily_limit' ? 'Daily limit reached' : 'Pro feature'}
        </p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {reason === 'daily_limit'
            ? 'Upgrade for unlimited screener runs'
            : 'Upgrade to unlock this feature'}
        </p>
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="text-xs px-3 py-1.5 font-semibold mt-1"
            style={{
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Upgrade to Pro →
          </button>
        )}
      </div>
    </div>
  )
}
